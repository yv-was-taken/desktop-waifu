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

// ============================================================================
// Overlay API - Cross-platform desktop pet functionality
// ============================================================================

/**
 * Check if running on Wayland.
 * On Wayland, the separate gtk4-layer-shell overlay binary should be used.
 */
export async function checkWayland(): Promise<boolean> {
  if (isOverlayMode) {
    // If we're in overlay mode with WebKit, we're already using the Wayland binary
    return true;
  }
  return invoke<boolean>('check_wayland');
}

/**
 * Enable or disable click-through for the entire window.
 * When enabled, mouse events pass through to windows behind.
 *
 * Note: On macOS, this is a binary toggle. The frontend should track
 * cursor position and call this based on hitbox detection.
 */
export async function setClickThrough(enabled: boolean): Promise<void> {
  if (isOverlayMode) {
    // Wayland overlay handles this via setInputRegion
    return;
  }
  return invoke('set_click_through', { enabled });
}

/**
 * Set a specific rectangular region that accepts input.
 * Areas outside this region will be click-through.
 *
 * @param x - X coordinate of the region (relative to window)
 * @param y - Y coordinate of the region (relative to window)
 * @param width - Width of the region
 * @param height - Height of the region
 */
export async function setInputRegion(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  if (isOverlayMode) {
    // Wayland overlay has its own setInputRegion handler
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({
      mode: 'character',
      x,
      y,
      width,
      height,
    });
    return;
  }
  return invoke('set_input_region', { x, y, width, height });
}

/**
 * Clear the input region, making the entire window accept input.
 */
export async function clearInputRegion(): Promise<void> {
  if (isOverlayMode) {
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({ mode: 'full' });
    return;
  }
  return invoke('clear_input_region');
}

/**
 * Enable overlay mode for the window.
 * Sets appropriate window properties for a desktop pet:
 * - Transparent background
 * - Always-on-top
 * - No decorations
 * - Skip taskbar
 */
export async function setOverlayMode(enabled: boolean): Promise<void> {
  if (isOverlayMode) {
    // Already in overlay mode via Wayland binary
    return;
  }
  return invoke('set_overlay_mode', { enabled });
}

/**
 * Move the window to absolute screen coordinates.
 */
export async function moveWindow(x: number, y: number): Promise<void> {
  if (isOverlayMode) {
    // Wayland overlay handles positioning via drag actions, not direct move
    // This is a no-op for overlay mode since positioning is managed by the Rust backend
    return;
  }
  return invoke('move_window', { x, y });
}

/**
 * Resize the window.
 */
export async function resizeWindow(width: number, height: number): Promise<void> {
  if (isOverlayMode) {
    window.webkit?.messageHandlers?.resizeWindow?.postMessage({
      action: 'resize',
      width,
      height,
    });
    return;
  }
  return invoke('resize_window', { width, height });
}

/**
 * Get current window position.
 */
export async function getWindowPosition(): Promise<{ x: number; y: number }> {
  if (isOverlayMode) {
    // Wayland overlay tracks position internally
    return { x: 0, y: 0 };
  }
  const [x, y] = await invoke<[number, number]>('get_window_position');
  return { x, y };
}

/**
 * Get primary monitor dimensions.
 */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  if (isOverlayMode) {
    // Return a default; Wayland overlay gets this from the compositor
    return { width: 1920, height: 1080 };
  }
  const [width, height] = await invoke<[number, number]>('get_screen_size');
  return { width, height };
}
