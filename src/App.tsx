import { useRef, useCallback, useEffect, useState } from 'react';
import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar } from './components/ui';
import { useAppStore } from './store';

// Check if we're in overlay mode (desktop pet mode)
// Window interface types are declared in src/lib/platform.ts
const isOverlayMode = new URLSearchParams(window.location.search).get('overlay') === 'true';

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
function sendMoveMessage(message: { action: string; offsetX?: number; offsetY?: number }) {
  window.webkit?.messageHandlers?.moveWindow?.postMessage(message);
}

// Helper to send window control messages (hide/show) to Rust backend
function sendWindowControlMessage(message: { action: 'hide' | 'show' }) {
  window.webkit?.messageHandlers?.windowControl?.postMessage(message);
}

// Helper to send window resize messages to Rust backend
function sendResizeMessage(width: number, height: number) {
  window.webkit?.messageHandlers?.resizeWindow?.postMessage({ action: 'resize', width, height });
}

// Helper to set input region for click-through control
function setInputRegion(mode: 'character' | 'full', characterBounds?: { x: number; y: number; width: number; height: number }) {
  if (mode === 'character' && characterBounds) {
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({
      mode: 'character',
      ...characterBounds,
    });
  } else {
    window.webkit?.messageHandlers?.setInputRegion?.postMessage({ mode: 'full' });
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
  const isScaleSliderDragging = useAppStore((state) => state.ui.isScaleSliderDragging);
  const quadrant = useAppStore((state) => state.ui.quadrant);
  const setQuadrant = useAppStore((state) => state.setQuadrant);

  // Scaled character dimensions
  const scaledCharacterWidth = Math.round(BASE_WIDTH_COLLAPSED * characterScale);
  const scaledCharacterHeight = Math.round(BASE_HEIGHT_COLLAPSED * characterScale);
  const scaledCanvasWidth = Math.round(BASE_CANVAS_WIDTH * characterScale);
  const scaledCanvasHeight = Math.round(BASE_CANVAS_HEIGHT * characterScale);

  // Scaled chat dimensions
  const scaledChatWidth = Math.round(BASE_CHAT_WIDTH * chatScale);
  const scaledChatHeight = Math.round(BASE_CHAT_HEIGHT * chatScale);

  // Window dimensions
  const scaledCollapsedWidth = scaledCharacterWidth;
  const scaledCollapsedHeight = scaledCharacterHeight;
  const scaledExpandedWidth = scaledChatWidth + scaledCharacterWidth;
  const scaledExpandedHeight = Math.max(scaledChatHeight, scaledCharacterHeight);

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

  // Track previous state for detecting changes
  const prevChatPanelOpenRef = useRef(chatPanelOpen);
  const prevDraggingRef = useRef(isScaleSliderDragging);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Handle quadrant changes from Rust and request initial state
  useEffect(() => {
    const handleQuadrantChange = (e: Event) => {
      const detail = (e as CustomEvent<{ isRightHalf: boolean; isBottomHalf: boolean }>).detail;
      setQuadrant(detail.isRightHalf, detail.isBottomHalf);
    };

    window.addEventListener('quadrantChange', handleQuadrantChange);

    // Request initial quadrant from Rust
    window.webkit?.messageHandlers?.getQuadrant?.postMessage({});

    return () => window.removeEventListener('quadrantChange', handleQuadrantChange);
  }, [setQuadrant]);

  // TEST: Resize to expanded dimensions on initial mount
  useEffect(() => {
    sendResizeMessage(scaledExpandedWidth, scaledExpandedHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize window based on chat panel state and scale
  // Only resize on mouse release to prevent feedback loop during slider drag
  useEffect(() => {
    const panelToggled = prevChatPanelOpenRef.current !== chatPanelOpen;
    const dragEnded = prevDraggingRef.current && !isScaleSliderDragging;
    prevChatPanelOpenRef.current = chatPanelOpen;
    prevDraggingRef.current = isScaleSliderDragging;

    // Clear any pending resize
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = null;
    }

    const doResize = () => {
      // TEST: Always use expanded dimensions
      sendResizeMessage(scaledExpandedWidth, scaledExpandedHeight);
      if (!chatPanelOpen) {
        // Hide container after resize (animation complete)
        setChatContainerVisible(false);
      }
    };

    if (panelToggled) {
      if (chatPanelOpen) {
        // Opening: resize immediately, then animate slide in
        doResize();
      } else {
        // Closing: animate slide out, then resize after animation
        resizeTimeoutRef.current = setTimeout(doResize, CHAT_ANIMATION_DURATION);
      }
    } else if (dragEnded) {
      // Slider drag ended: resize now with final scale values
      doResize();
    }
    // If scale changed while dragging, do nothing - wait for drag to end

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [chatPanelOpen, scaledCollapsedWidth, scaledCollapsedHeight, scaledExpandedWidth, scaledExpandedHeight, isScaleSliderDragging]);

  // Update input region for click-through when chat opens/closes
  useEffect(() => {
    if (chatPanelOpen) {
      // Chat is open: full window should receive input
      setInputRegion('full');
    } else {
      // Chat is closed: only character area should receive input
      // Calculate character position based on quadrant
      const x = quadrant.isRightHalf ? scaledExpandedWidth - scaledCollapsedWidth : 0;
      const y = quadrant.isBottomHalf ? scaledExpandedHeight - scaledCollapsedHeight : 0;
      setInputRegion('character', {
        x,
        y,
        width: scaledCollapsedWidth,
        height: scaledCollapsedHeight,
      });
    }
  }, [chatPanelOpen, quadrant.isRightHalf, quadrant.isBottomHalf, scaledExpandedWidth, scaledExpandedHeight, scaledCollapsedWidth, scaledCollapsedHeight]);

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

  // Character hide animation direction based on which side window is on
  const characterHideTransform = quadrant.isRightHalf ? 'translateX(100%)' : 'translateX(-100%)';

  return (
    <div
      className="w-screen h-screen relative overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Chat container - fades in/out with opacity animation */}
      <div
        className="absolute overflow-hidden"
        style={{
          width: chatContainerVisible ? scaledChatWidth : 0,
          height: chatContainerVisible ? scaledChatHeight : 0,
          ...(quadrant.isRightHalf ? { right: scaledCollapsedWidth } : { left: scaledCollapsedWidth }),
          ...(quadrant.isBottomHalf ? { bottom: 0 } : { top: 0 }),
        }}
      >
        <div
          className="h-full bg-[#1a1a2e] flex flex-col transition-opacity duration-300 ease-out"
          style={{
            width: scaledChatWidth,
            opacity: chatOpacity,
          }}
        >
          <ChatPanel onClose={() => setChatPanelOpen(false)} />
        </div>
      </div>

      {/* Character viewport - positioned at quadrant corner */}
      <div
        ref={dragElementRef}
        className={`absolute cursor-grab active:cursor-grabbing transition-transform duration-700 ease-in overflow-hidden ${quadrant.isBottomHalf ? "bottom-0" : "top-0"} ${quadrant.isRightHalf ? "right-0" : "left-0"}`}
        style={{
          width: scaledCollapsedWidth,
          height: scaledCollapsedHeight,
          transform: isHiding ? characterHideTransform : 'translateX(0)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Canvas - positioned with transform for offset */}
        <div
          className={`absolute bottom-0 ${quadrant.isRightHalf ? "right-0" : "left-0"}`}
          style={{
            width: scaledCanvasWidth,
            height: scaledCanvasHeight,
            transform: `translateX(${quadrant.isRightHalf
              ? ((scaledCanvasWidth - scaledCollapsedWidth) / 2)
              : -((scaledCanvasWidth - scaledCollapsedWidth) / 2)
            }px)`,
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
