import { useRef, useCallback, useEffect } from 'react';
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
const BASE_WIDTH_EXPANDED = 800;    // Chat + Character
const BASE_HEIGHT_EXPANDED = 1000;  // Chat + Character (more room for chat)
const BASE_CANVAS_WIDTH = 240;      // Inner canvas width
const BASE_CANVAS_HEIGHT = 600;     // Inner canvas height
const CHAT_ANIMATION_DURATION = 300;  // ms (matches CSS transition)

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

// Double-click timing threshold in milliseconds
const DOUBLE_CLICK_THRESHOLD = 300;

function OverlayMode() {
  const chatPanelOpen = useAppStore((state) => state.ui.chatPanelOpen);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);
  const isHiding = useAppStore((state) => state.character.isHiding);
  const setHiding = useAppStore((state) => state.setHiding);
  const characterScale = useAppStore((state) => state.settings.characterScale);

  // Scaled dimensions based on character scale setting
  const scaledCollapsedWidth = Math.round(BASE_WIDTH_COLLAPSED * characterScale);
  const scaledCollapsedHeight = Math.round(BASE_HEIGHT_COLLAPSED * characterScale);
  const scaledExpandedWidth = BASE_WIDTH_EXPANDED - BASE_WIDTH_COLLAPSED + scaledCollapsedWidth;
  const scaledExpandedHeight = Math.max(BASE_HEIGHT_EXPANDED, scaledCollapsedHeight);
  const scaledCanvasWidth = Math.round(BASE_CANVAS_WIDTH * characterScale);
  const scaledCanvasHeight = Math.round(BASE_CANVAS_HEIGHT * characterScale);

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

  // Handle "trayShow" event from Rust when user clicks Show in tray
  useEffect(() => {
    const handleTrayShow = () => {
      // Reset hiding state - this will trigger the "show" animation
      setHiding(false);
    };

    window.addEventListener('trayShow', handleTrayShow);
    return () => window.removeEventListener('trayShow', handleTrayShow);
  }, [setHiding]);

  // Resize window based on chat panel state and character scale
  useEffect(() => {
    if (chatPanelOpen) {
      // Opening: resize immediately (expand first), then chat slides in
      sendResizeMessage(scaledExpandedWidth, scaledExpandedHeight);
    } else {
      // Closing: wait for slide-out animation to complete, then resize
      const timer = setTimeout(() => {
        sendResizeMessage(scaledCollapsedWidth, scaledCollapsedHeight);
      }, CHAT_ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [chatPanelOpen, scaledCollapsedWidth, scaledCollapsedHeight, scaledExpandedWidth, scaledExpandedHeight]);

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

  return (
    <div
      className="w-screen h-screen relative overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Content anchored to right edge - character always visible, chat expands left */}
      <div
        className="absolute right-0 top-0 h-full flex flex-row"
        style={{ width: scaledExpandedWidth }}
      >
        {/* Chat panel area - fixed width on left, content slides in */}
        <div className="w-[640px] h-full flex-shrink-0 overflow-hidden">
          <div
            className="w-[640px] h-full bg-[#1a1a2e] flex flex-col transition-transform duration-300 ease-in-out"
            style={{ transform: chatPanelOpen ? 'translateX(0)' : 'translateX(-100%)' }}
            onTransitionEnd={(e) => {
              // Only handle transform transitions on this element when opening
              if (e.propertyName === 'transform' && e.target === e.currentTarget && chatPanelOpen) {
                // Small delay after transition to focus after whatever steals focus
                setTimeout(() => {
                  // Request keyboard focus from compositor first
                  requestKeyboardFocus();

                  const textarea = document.querySelector('textarea');
                  if (textarea) {
                    (textarea as HTMLTextAreaElement).focus();
                  }
                }, 50);
              }
            }}
          >
            <ChatPanel onClose={() => setChatPanelOpen(false)} />
          </div>
        </div>

        {/* Character canvas - draggable, click toggles panel, double-click hides */}
        {/* Outer div is viewport (clips overflow), inner div is fixed canvas size */}
        <div
          ref={dragElementRef}
          className="h-full cursor-grab active:cursor-grabbing flex-shrink-0 transition-transform duration-700 ease-in overflow-hidden relative"
          style={{
            width: scaledCollapsedWidth,
            transform: isHiding ? 'translateX(100%)' : 'translateX(0)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Fixed size canvas - positioned to center character in viewport */}
          <div
            className="absolute"
            style={{
              width: scaledCanvasWidth,
              height: scaledCanvasHeight,
              left: -((scaledCanvasWidth - scaledCollapsedWidth) / 2),
              bottom: 0,
            }}
          >
            <CharacterCanvas disableControls />
          </div>
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
