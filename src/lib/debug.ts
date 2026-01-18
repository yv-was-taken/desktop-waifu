/**
 * Debug logging utility - outputs to system terminal via Rust backend
 * Toggle DEBUG_ENABLED to true to enable debug output
 */

const DEBUG_ENABLED = false;

export function debugLog(message: string): void {
  if (!DEBUG_ENABLED) return;
  window.webkit?.messageHandlers?.debug?.postMessage({ message });
}
