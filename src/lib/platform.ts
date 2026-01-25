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
        moveWindow?: { postMessage: (msg: { action: string; offsetX?: number; offsetY?: number; characterWidth?: number; characterHeight?: number }) => void };
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
        // Apply anchoring handler - frontend calls this AFTER CSS updates to prevent flicker (App.tsx)
        applyAnchoring?: { postMessage: (msg: { isRightHalf: boolean; isBottomHalf: boolean; horizontalMargin: number; verticalMargin: number }) => void };
        // Debug logging handler (debug.ts)
        debug?: { postMessage: (msg: { message: string }) => void };
        // Desktop notification handler (platform.ts)
        showNotification?: { postMessage: (msg: { title: string; body: string }) => void };
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

/**
 * Check if the current session is running on Wayland.
 * In overlay mode, this always returns true (overlay only runs on Wayland).
 */
export async function checkWayland(): Promise<boolean> {
  if (isOverlayMode) {
    return true; // Already using Wayland overlay binary
  }
  return invoke<boolean>('check_wayland');
}

/**
 * Set the input region for click-through control (overlay mode only).
 * This defines the area where the overlay captures mouse input.
 */
export async function setInputRegion(x: number, y: number, width: number, height: number): Promise<void> {
  if (isOverlayMode) {
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({ mode: 'character', x, y, width, height });
  }
}

/**
 * Clear the input region to capture all input (overlay mode only).
 * This makes the entire overlay window interactive.
 */
export async function clearInputRegion(): Promise<void> {
  if (isOverlayMode) {
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({ mode: 'full' });
  }
}

/**
 * Show a desktop notification (overlay mode only).
 * Uses notify-rust via WebKit message handler for cross-platform support.
 */
export function showDesktopNotification(title: string, body: string): void {
  // Debug: always log to webkit debug handler
  window.webkit?.messageHandlers?.debug?.postMessage({
    message: `[NOTIFICATION] showDesktopNotification called: isOverlay=${isOverlayMode}, title="${title}"`
  });
  if (isOverlayMode) {
    window.webkit?.messageHandlers?.showNotification?.postMessage({ title, body });
  }
}

/**
 * Check if the window is currently focused (overlay mode only).
 * Reads from a global variable set by Rust when window focus changes.
 * Returns true if focused or if not in overlay mode.
 */
export function isWindowCurrentlyFocused(): boolean {
  if (!isOverlayMode) {
    return document.hasFocus();
  }
  // Read from global variable set by Rust's window.connect_is_active_notify
  // Default to true if not yet set (window starts focused)
  const focused = (window as Window & { __desktopWaifuWindowFocused?: boolean }).__desktopWaifuWindowFocused;
  window.webkit?.messageHandlers?.debug?.postMessage({
    message: `[FOCUS] isWindowCurrentlyFocused: __desktopWaifuWindowFocused=${focused}`
  });
  return focused ?? true;
}
