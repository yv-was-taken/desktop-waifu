import { useRef, useCallback, useEffect } from 'react';
import { CharacterCanvas } from './components/character';
import { ChatPanel } from './components/chat';
import { SettingsModal, TitleBar, SlidingPanel } from './components/ui';
import { useAppStore } from './store';

// Check if we're in overlay mode (desktop pet mode)
const isOverlayMode = new URLSearchParams(window.location.search).get('overlay') === 'true';

// Helper to send window move messages to the Rust backend via WebKit
function sendMoveMessage(message: { action: string; offsetX?: number; offsetY?: number }) {
  const webkit = (window as unknown as { webkit?: { messageHandlers?: { moveWindow?: { postMessage: (msg: unknown) => void } } } }).webkit;
  if (webkit?.messageHandlers?.moveWindow) {
    webkit.messageHandlers.moveWindow.postMessage(message);
  }
}

function OverlayMode() {
  const chatPanelOpen = useAppStore((state) => state.ui.chatPanelOpen);
  const setChatPanelOpen = useAppStore((state) => state.setChatPanelOpen);

  // Drag state - track start position, not incremental deltas
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const pendingOffset = useRef<{ x: number; y: number } | null>(null);
  const rafId = useRef<number | null>(null);

  // Use ref to access latest chatPanelOpen in document event handlers
  const chatPanelOpenRef = useRef(chatPanelOpen);
  chatPanelOpenRef.current = chatPanelOpen;

  // Store ref to the drag element for pointer capture
  const dragElementRef = useRef<HTMLDivElement>(null);

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

    // Only toggle chat if it was a click, not a drag
    if (!wasDragging) {
      setChatPanelOpen(!chatPanelOpenRef.current);
    }
  }, [setChatPanelOpen]);

  return (
    <div
      className="w-screen h-screen flex flex-row"
      style={{ background: 'transparent' }}
    >
      {/* Chat panel area - fixed width on left, content slides in */}
      <div className="w-[500px] h-full flex-shrink-0 overflow-hidden">
        <div
          className="w-[500px] h-full bg-[#1a1a2e] flex flex-col transition-transform duration-300 ease-in-out"
          style={{ transform: chatPanelOpen ? 'translateX(0)' : 'translateX(-100%)' }}
        >
          <ChatPanel onClose={() => setChatPanelOpen(false)} />
        </div>
      </div>

      {/* Character canvas - draggable, click toggles panel */}
      <div
        ref={dragElementRef}
        className="w-[240px] h-full cursor-grab active:cursor-grabbing flex-shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <CharacterCanvas disableControls />
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
