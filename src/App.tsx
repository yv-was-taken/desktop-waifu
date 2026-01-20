import { useRef, useCallback, useEffect, useState } from 'react';
import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar } from './components/ui';
import { useAppStore } from './store';
import {
  isOverlayMode,
  setInputRegion,
  clearInputRegion,
} from './lib/platform';

// Check if running in Tauri (non-Wayland) overlay mode
// In this mode, we use Tauri's invoke API instead of WebKit message handlers
const isTauriOverlay = !isOverlayMode && typeof window.__TAURI__ !== 'undefined';

// Extend window type for Tauri
declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

// Request keyboard focus from compositor (for Wayland layer-shell)
function requestKeyboardFocus() {
  window.webkit?.messageHandlers?.keyboardFocus?.postMessage({});
}

// Base window dimension constants (at scale 1.0)
const BASE_WIDTH_COLLAPSED = 160;   // Character only
const BASE_HEIGHT_COLLAPSED = 380;  // Character only
const BASE_CANVAS_WIDTH = 240;      // Inner canvas width
const BASE_CANVAS_HEIGHT = 600;     // Inner canvas height
const BASE_CHAT_WIDTH = 640;        // Chat panel width
const BASE_CHAT_HEIGHT = 1000;      // Chat panel height
const CHAT_ANIMATION_DURATION = 300;  // ms for slide animation

// Helper to send window move messages to the Rust backend via WebKit
function sendMoveMessage(message: { action: string; offsetX?: number; offsetY?: number; characterWidth?: number; characterHeight?: number }) {
  window.webkit?.messageHandlers?.moveWindow?.postMessage(message);
}

// Helper to send window control messages (hide/show) to Rust backend
function sendWindowControlMessage(message: { action: 'hide' | 'show' }) {
  window.webkit?.messageHandlers?.windowControl?.postMessage(message);
}

// Helper to set input region for click-through control
function updateInputRegion(mode: 'character' | 'full', characterBounds?: { x: number; y: number; width: number; height: number }) {
  if (isOverlayMode) {
    // Wayland overlay: use WebKit message handlers
    if (mode === 'character' && characterBounds) {
      window.webkit?.messageHandlers?.setInputRegion?.postMessage({
        mode: 'character',
        ...characterBounds,
      });
    } else {
      window.webkit?.messageHandlers?.setInputRegion?.postMessage({ mode: 'full' });
    }
  } else if (isTauriOverlay) {
    // Tauri overlay: use invoke API
    if (mode === 'character' && characterBounds) {
      setInputRegion(characterBounds.x, characterBounds.y, characterBounds.width, characterBounds.height);
    } else {
      clearInputRegion();
    }
  }
}

// Double-click timing threshold in milliseconds
const DOUBLE_CLICK_THRESHOLD = 300;

function OverlayMode() {
  const chatPanelOpen = useAppStore((state) => state.ui.chatPanelOpen);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);
  const isHiding = useAppStore((state) => state.character.isHiding);
  const setHiding = useAppStore((state) => state.setHiding);
  const characterScale = useAppStore((state) => state.settings.characterScale) ?? 1.0;
  const chatScale = useAppStore((state) => state.settings.chatScale) ?? 1.0;
  const showSettings = useAppStore((state) => state.settings.showSettings);
  const quadrant = useAppStore((state) => state.ui.quadrant);
  const setQuadrant = useAppStore((state) => state.setQuadrant);

  // Character position (absolute screen coordinates from Rust)
  const [characterPos, setCharacterPos] = useState({ x: 0, y: 0 });

  // Scaled character dimensions
  const scaledCharacterWidth = Math.round(BASE_WIDTH_COLLAPSED * characterScale);
  const scaledCharacterHeight = Math.round(BASE_HEIGHT_COLLAPSED * characterScale);
  const scaledCanvasWidth = Math.round(BASE_CANVAS_WIDTH * characterScale);
  const scaledCanvasHeight = Math.round(BASE_CANVAS_HEIGHT * characterScale);

  // Scaled chat dimensions
  const scaledChatWidth = Math.round(BASE_CHAT_WIDTH * chatScale);
  const scaledChatHeight = Math.round(BASE_CHAT_HEIGHT * chatScale);

  // Drag state - track start position, not incremental deltas
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const pendingOffset = useRef<{ x: number; y: number } | null>(null);
  const rafId = useRef<number | null>(null);

  // Double-click detection
  const lastClickTime = useRef(0);

  // Use ref to access latest chatPanelOpen in document event handlers
  const chatPanelOpenRef = useRef(chatPanelOpen);
  chatPanelOpenRef.current = chatPanelOpen;

  // Store ref to the drag element for pointer capture
  const dragElementRef = useRef<HTMLDivElement>(null);

  // Track if chat container should be rendered (stays visible during close animation)
  const [chatContainerVisible, setChatContainerVisible] = useState(chatPanelOpen);

  // Opacity state for fade animation (triggers after container is visible)
  const [chatOpacity, setChatOpacity] = useState(chatPanelOpen ? 1 : 0);

  // Handle chat panel open/close with opacity fade
  useEffect(() => {
    if (chatPanelOpen) {
      setChatContainerVisible(true);
      // Fade in on next frame
      const frameId = requestAnimationFrame(() => {
        setChatOpacity(1);
      });
      return () => cancelAnimationFrame(frameId);
    } else {
      // Fade out immediately
      setChatOpacity(0);
      // Hide container after animation
      const timeout = setTimeout(() => setChatContainerVisible(false), CHAT_ANIMATION_DURATION);
      return () => clearTimeout(timeout);
    }
  }, [chatPanelOpen]);

  // Handle "trayShow" event from Rust when user clicks Show in tray
  useEffect(() => {
    const handleTrayShow = () => {
      // Reset hiding state - this will trigger the "show" animation
      setHiding(false);
    };

    window.addEventListener('trayShow', handleTrayShow);
    return () => window.removeEventListener('trayShow', handleTrayShow);
  }, [setHiding]);

  // Handle initial state from Rust (position + quadrant + screen dimensions)
  useEffect(() => {
    const handleInitialState = (e: Event) => {
      const detail = (e as CustomEvent<{
        x: number;
        y: number;
        isRightHalf: boolean;
        isBottomHalf: boolean;
        screenWidth: number;
        screenHeight: number;
      }>).detail;

      setCharacterPos({ x: detail.x, y: detail.y });
      setQuadrant(detail.isRightHalf, detail.isBottomHalf);
    };

    window.addEventListener('initialState', handleInitialState);
    return () => window.removeEventListener('initialState', handleInitialState);
  }, [setQuadrant]);

  // Handle character position updates during drag
  useEffect(() => {
    const handleCharacterMove = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      setCharacterPos({ x: detail.x, y: detail.y });
    };

    window.addEventListener('characterMove', handleCharacterMove);
    return () => window.removeEventListener('characterMove', handleCharacterMove);
  }, []);

  // Handle quadrant changes from Rust (sent at end of drag)
  useEffect(() => {
    const handleQuadrantChange = (e: Event) => {
      const detail = (e as CustomEvent<{
        isRightHalf: boolean;
        isBottomHalf: boolean;
      }>).detail;

      setQuadrant(detail.isRightHalf, detail.isBottomHalf);
    };

    window.addEventListener('quadrantChange', handleQuadrantChange);
    return () => window.removeEventListener('quadrantChange', handleQuadrantChange);
  }, [setQuadrant]);

  // Request initial state from Rust - only on mount
  useEffect(() => {
    window.webkit?.messageHandlers?.getQuadrant?.postMessage({});
  }, []);

  // Update input region for click-through when chat opens/closes, settings modal, or character moves
  useEffect(() => {
    if (showSettings) {
      // Settings modal is open: allow clicks everywhere
      updateInputRegion('full');
    } else if (chatPanelOpen) {
      // Chat is open: set input region to character + chat area
      // Calculate chat bounds based on character position and quadrant
      const chatX = quadrant.isRightHalf
        ? characterPos.x - scaledChatWidth  // Chat to the left
        : characterPos.x + scaledCharacterWidth;  // Chat to the right
      const chatY = quadrant.isBottomHalf
        ? characterPos.y + scaledCharacterHeight - scaledChatHeight  // Chat aligned to bottom
        : characterPos.y;  // Chat aligned to top

      // Combined bounds (character + chat)
      const minX = Math.min(characterPos.x, chatX);
      const minY = Math.min(characterPos.y, chatY);
      const maxX = Math.max(characterPos.x + scaledCharacterWidth, chatX + scaledChatWidth);
      const maxY = Math.max(characterPos.y + scaledCharacterHeight, chatY + scaledChatHeight);

      updateInputRegion('character', {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    } else {
      // Chat is closed: only character area should receive input
      updateInputRegion('character', {
        x: characterPos.x,
        y: characterPos.y,
        width: scaledCharacterWidth,
        height: scaledCharacterHeight,
      });
    }
  }, [showSettings, chatPanelOpen, characterPos, scaledCharacterWidth, scaledCharacterHeight, scaledChatWidth, scaledChatHeight, quadrant]);

  // Trigger hide sequence: set hiding state, wait for animation, then tell Rust to hide
  const triggerHide = useCallback(() => {
    // Close chat panel first
    setChatPanelOpen(false);
    // Set hiding state - this triggers run animation in CharacterModel
    setHiding(true);
    // After animation completes, tell Rust to hide the window
    setTimeout(() => {
      sendWindowControlMessage({ action: 'hide' });
    }, 800);
  }, [setChatPanelOpen, setHiding]);

  // Throttled send using requestAnimationFrame
  const sendThrottledUpdate = useCallback(() => {
    if (pendingOffset.current && isDragging.current) {
      sendMoveMessage({ action: 'drag', offsetX: pendingOffset.current.x, offsetY: pendingOffset.current.y });
    }
    rafId.current = null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    // Use screen coordinates for accurate tracking even when window moves
    dragStart.current = { x: e.screenX, y: e.screenY };
    // Capture pointer to ensure all events come to this element during drag
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    // Tell Rust to save current position as drag start
    sendMoveMessage({ action: 'startDrag' });
    e.preventDefault();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    // Calculate total offset from drag start using screen coordinates
    const offsetX = e.screenX - dragStart.current.x;
    const offsetY = e.screenY - dragStart.current.y;

    // Only count as a drag if moved more than 3 pixels
    if (Math.abs(offsetX) > 3 || Math.abs(offsetY) > 3) {
      hasMoved.current = true;
    }

    if (hasMoved.current) {
      // Store latest offset and schedule update on next frame
      pendingOffset.current = { x: offsetX, y: offsetY };
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(sendThrottledUpdate);
      }
    }
  }, [sendThrottledUpdate]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;

    const wasDragging = hasMoved.current;

    // Send final position before ending drag to avoid lag
    if (wasDragging) {
      const offsetX = e.screenX - dragStart.current.x;
      const offsetY = e.screenY - dragStart.current.y;
      sendMoveMessage({ action: 'drag', offsetX, offsetY });
    }

    sendMoveMessage({ action: 'endDrag' });
    isDragging.current = false;

    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Only handle clicks if it wasn't a drag
    if (!wasDragging) {
      const now = Date.now();
      if (now - lastClickTime.current < DOUBLE_CLICK_THRESHOLD) {
        // Double-click detected - trigger hide
        lastClickTime.current = 0;
        triggerHide();
      } else {
        // Single click - record time and toggle chat panel
        lastClickTime.current = now;
        setChatPanelOpen(!chatPanelOpenRef.current);
      }
    }
  }, [setChatPanelOpen, triggerHide]);

  // Focus textarea when chat panel opens
  useEffect(() => {
    if (chatPanelOpen) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        requestKeyboardFocus();
        const textarea = document.querySelector('textarea');
        if (textarea) {
          (textarea as HTMLTextAreaElement).focus();
        }
      }, 50);
    }
  }, [chatPanelOpen]);

  // Character hide animation direction based on which side of screen
  const characterHideTransform = quadrant.isRightHalf ? 'translateX(100%)' : 'translateX(-100%)';

  // Calculate chat position relative to character's screen position
  // Chat goes to the opposite side of the screen from the character
  const chatLeft = quadrant.isRightHalf
    ? characterPos.x - scaledChatWidth  // Chat to the left of character
    : characterPos.x + scaledCharacterWidth;  // Chat to the right of character
  const chatTop = quadrant.isBottomHalf
    ? characterPos.y + scaledCharacterHeight - scaledChatHeight  // Align chat bottom to character bottom
    : characterPos.y;  // Align chat top to character top

  return (
    <div
      className="w-screen h-screen relative overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Chat container - positioned relative to character's screen position */}
      {chatContainerVisible && (
        <div
          className="absolute overflow-hidden bg-[#1a1a2e] transition-opacity duration-300 ease-out"
          style={{
            width: scaledChatWidth,
            height: scaledChatHeight,
            left: chatLeft,
            top: chatTop,
            opacity: chatOpacity,
          }}
        >
          <ChatPanel onClose={() => setChatPanelOpen(false)} />
        </div>
      )}

      {/* Character viewport - positioned via absolute screen coordinates */}
      <div
        ref={dragElementRef}
        className="absolute cursor-grab active:cursor-grabbing overflow-hidden"
        style={{
          width: scaledCharacterWidth,
          height: scaledCharacterHeight,
          left: characterPos.x,
          top: characterPos.y,
          // Transform and opacity for hide animation
          transform: isHiding ? characterHideTransform : undefined,
          opacity: isHiding ? 0 : 1,
          transition: isHiding ? 'transform 700ms ease-in, opacity 700ms ease-in' : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Canvas - centered within character viewport */}
        <div
          className="absolute"
          style={{
            width: scaledCanvasWidth,
            height: scaledCanvasHeight,
            left: (scaledCharacterWidth - scaledCanvasWidth) / 2,
            bottom: 0,
          }}
        >
          <CharacterCanvas disableControls />
        </div>
      </div>

      <SettingsModal />
    </div>
  );
}

function App() {
  // Overlay mode: character with sliding chat panel
  if (isOverlayMode) {
    return <OverlayMode />;
  }

  // Normal mode: full app with chat
  return (
    <div className="w-screen h-screen p-[5%]">
      <TitleBar />

      <div className="w-full h-full flex flex-row">
        {/* Character - 50% width */}
        <div className="w-1/2 h-full">
          <CharacterCanvas />
        </div>

        {/* Chat - 50% width */}
        <div className="w-1/2 h-full bg-[#1a1a2e]">
          <ChatPanel />
        </div>
      </div>

      <SettingsModal />
    </div>
  );
}

export default App;
