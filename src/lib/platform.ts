/**
 * Platform abstraction layer for cross-environment command execution.
 * Handles both Tauri (native app) and WebKit overlay (desktop pet) modes.
 */

import { invoke } from '@tauri-apps/api/core';
import type { SystemInfo, CommandOutput } from '../types';

// Check if we're in overlay mode (WebKitGTK)
export const isOverlayMode = new URLSearchParams(window.location.search).get('overlay') === 'true';

// Extend Window for WebKit message handlers (all handlers in one place)
declare global {
  interface Window {
    __commandCallbacks?: Record<string, (result: unknown) => void>;
    webkit?: {
      messageHandlers?: {
        // Window control handlers (App.tsx)
        moveWindow?: { postMessage: (msg: { action: string; offsetX?: number; offsetY?: number }) => void };
        windowControl?: { postMessage: (msg: { action: 'hide' | 'show' }) => void };
        resizeWindow?: { postMessage: (msg: { action: 'resize'; width: number; height: number }) => void };
        keyboardFocus?: { postMessage: (msg: object) => void };
        // Command execution handlers (platform.ts)
        executeCommand?: { postMessage: (msg: { cmd: string; callbackId: string }) => void };
        getSystemInfo?: { postMessage: (msg: { callbackId: string }) => void };
        // Quadrant detection handler (App.tsx)
        getQuadrant?: { postMessage: (msg: object) => void };
        // Input region handler for click-through control (App.tsx)
        setInputRegion?: { postMessage: (msg: { mode: 'character' | 'full'; x?: number; y?: number; width?: number; height?: number }) => void };
        // Debug logging handler (debug.ts)
        debug?: { postMessage: (msg: { message: string }) => void };
      };
    };
  }
}

// Initialize callback storage
if (typeof window !== 'undefined') {
  window.__commandCallbacks = window.__commandCallbacks || {};
}

// Generate unique callback ID
let callbackCounter = 0;
function generateCallbackId(): string {
  return `cb_${Date.now()}_${callbackCounter++}`;
}

/**
 * Execute a shell command and return the output.
 * Uses Tauri invoke in native mode, WebKit message handlers in overlay mode.
 */
export async function executeCommand(cmd: string): Promise<CommandOutput> {
  if (isOverlayMode) {
    return new Promise((resolve, reject) => {
      const callbackId = generateCallbackId();

      window.__commandCallbacks![callbackId] = (result: unknown) => {
        delete window.__commandCallbacks![callbackId];
        const output = result as CommandOutput;
        resolve(output);
      };

      // Set timeout for command execution (30 seconds)
      setTimeout(() => {
        if (window.__commandCallbacks![callbackId]) {
          delete window.__commandCallbacks![callbackId];
          reject(new Error('Command execution timed out'));
        }
      }, 30000);

      window.webkit?.messageHandlers?.executeCommand?.postMessage({ cmd, callbackId });
    });
  } else {
    return invoke<CommandOutput>('execute_command', { cmd });
  }
}

/**
 * Get system information (OS, distro, shell, package manager).
 * Uses Tauri invoke in native mode, WebKit message handlers in overlay mode.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (isOverlayMode) {
    return new Promise((resolve, reject) => {
      const callbackId = generateCallbackId();

      window.__commandCallbacks![callbackId] = (result: unknown) => {
        delete window.__commandCallbacks![callbackId];
        const info = result as SystemInfo;
        resolve(info);
      };

      // Set timeout (5 seconds)
      setTimeout(() => {
        if (window.__commandCallbacks![callbackId]) {
          delete window.__commandCallbacks![callbackId];
          reject(new Error('System info request timed out'));
        }
      }, 5000);

      window.webkit?.messageHandlers?.getSystemInfo?.postMessage({ callbackId });
    });
  } else {
    return invoke<SystemInfo>('get_system_info');
  }
}
