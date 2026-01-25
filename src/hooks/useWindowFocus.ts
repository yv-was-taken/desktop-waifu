import { useState, useEffect } from 'react';
import { isOverlayMode } from '../lib/platform';

// Debug helper
function debugLog(msg: string) {
  window.webkit?.messageHandlers?.debug?.postMessage({ message: msg });
}

/**
 * Hook to track window focus state.
 * Returns true when the window is focused, false when blurred.
 *
 * In overlay mode, uses GTK's window active state (via custom event from Rust).
 * In browser mode, uses standard focus/blur events.
 */
export function useWindowFocus(): boolean {
  const [isFocused, setIsFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    debugLog(`[useWindowFocus] Setting up listeners, isOverlayMode=${isOverlayMode}`);

    if (isOverlayMode) {
      // In overlay mode, listen for GTK window active state changes
      const handleWindowFocusChange = (e: Event) => {
        const customEvent = e as CustomEvent<{ isFocused: boolean }>;
        debugLog(`[useWindowFocus] Received windowFocusChange event: isFocused=${customEvent.detail.isFocused}`);
        setIsFocused(customEvent.detail.isFocused);
      };

      window.addEventListener('windowFocusChange', handleWindowFocusChange);
      debugLog(`[useWindowFocus] Added windowFocusChange listener`);

      return () => {
        window.removeEventListener('windowFocusChange', handleWindowFocusChange);
      };
    } else {
      // In browser mode, use standard focus/blur events
      const handleFocus = () => setIsFocused(true);
      const handleBlur = () => setIsFocused(false);

      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);

      return () => {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleBlur);
      };
    }
  }, []);

  return isFocused;
}
