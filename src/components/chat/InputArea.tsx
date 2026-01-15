import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store';

interface InputAreaProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setUserTyping = useAppStore((state) => state.setUserTyping);

  // Handle typing state with debounce
  const handleInputChange = useCallback((value: string) => {
    setInput(value);

    // Set typing to true immediately when user types
    if (value.trim()) {
      setUserTyping(true);

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set typing to false after 1 second of no input
      typingTimeoutRef.current = setTimeout(() => {
        setUserTyping(false);
      }, 1000);
    } else {
      // Input is empty, not typing
      setUserTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  }, [setUserTyping]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      // Clear typing state immediately on submit
      setUserTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      onSend(trimmed);
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, disabled, onSend, setUserTyping]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Auto-focus textarea when window gains focus
  useEffect(() => {
    const handleWindowFocus = () => {
      if (textareaRef.current && !disabled) {
        textareaRef.current.focus();
      }
    };

    window.addEventListener('focus', handleWindowFocus);

    // Also focus on initial mount
    handleWindowFocus();

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [disabled]);

  return (
    <div className="p-4 border-t border-gray-700 bg-gray-800/50">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => input.trim() && setUserTyping(true)}
          onBlur={() => setUserTyping(false)}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-400 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="bg-gradient-to-r from-teal-400 to-cyan-400 text-white rounded-xl px-4 py-3 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
