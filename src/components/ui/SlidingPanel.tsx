import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface SlidingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  inactivityTimeout?: number; // milliseconds, default 30000 (30 seconds)
}

export function SlidingPanel({
  isOpen,
  onClose,
  children,
  inactivityTimeout = 30000
}: SlidingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (isOpen) {
      timeoutRef.current = setTimeout(() => {
        onClose();
      }, inactivityTimeout);
    }
  }, [isOpen, onClose, inactivityTimeout]);

  // Set up inactivity timer and activity listeners
  useEffect(() => {
    if (!isOpen) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Start the timer
    resetTimer();

    // Activity events that reset the timer
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    const handleActivity = () => resetTimer();

    // Add listeners to the panel
    const panel = panelRef.current;
    if (panel) {
      activityEvents.forEach(event => {
        panel.addEventListener(event, handleActivity);
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (panel) {
        activityEvents.forEach(event => {
          panel.removeEventListener(event, handleActivity);
        });
      }
    };
  }, [isOpen, resetTimer]);

  return (
    <div
      ref={panelRef}
      className={`sliding-panel ${isOpen ? 'open' : ''}`}
    >
      {children}
    </div>
  );
}
