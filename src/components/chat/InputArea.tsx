import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store';
import { CommandSuggestions, getFilteredCommands } from './CommandSuggestions';

interface InputAreaProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevExecutionStatusRef = useRef<string | null>(null);

  const setUserTyping = useAppStore((state) => state.setUserTyping);
  const executionStatus = useAppStore((state) => state.execution.status);

  // Determine if we should show command suggestions
  const showSuggestions = useMemo(() => {
    const trimmed = input.trimStart();
    return trimmed.startsWith('/') && !trimmed.includes(' ');
  }, [input]);

  // Extract the filter text (everything after `/`)
  const commandFilter = useMemo(() => {
    if (!showSuggestions) return '';
    return input.trimStart().slice(1);
  }, [input, showSuggestions]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [commandFilter]);

  // Handle selecting a command from suggestions
  const handleSelectCommand = useCallback((commandName: string) => {
    setInput(`/${commandName} `);
    textareaRef.current?.focus();
  }, []);

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
    // Handle command suggestion navigation
    if (showSuggestions) {
      const suggestions = getFilteredCommands(commandFilter);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }

      // Tab autocompletes the selected command
      if (e.key === 'Tab' && suggestions.length > 0) {
        e.preventDefault();
        const selected = suggestions[selectedCommandIndex];
        if (selected) {
          handleSelectCommand(selected.name);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, showSuggestions, commandFilter, selectedCommandIndex, handleSelectCommand]);

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

  // Refocus input when command approval flow completes
  useEffect(() => {
    const prevStatus = prevExecutionStatusRef.current;
    prevExecutionStatusRef.current = executionStatus;

    // If we just left pending_approval state, refocus the input
    if (prevStatus === 'pending_approval' && executionStatus !== 'pending_approval') {
      textareaRef.current?.focus();
    }
  }, [executionStatus]);

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
    <div className="p-3 bg-black">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          {showSuggestions && (
            <CommandSuggestions
              filter={commandFilter}
              onSelect={handleSelectCommand}
              selectedIndex={selectedCommandIndex}
              onSelectedIndexChange={setSelectedCommandIndex}
            />
          )}
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
            className="w-full resize-none bg-white text-black border border-white px-4 py-3 text-sm focus:outline-none focus:border-pink-500 placeholder-gray-400 disabled:opacity-50 font-medium"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="bg-white text-black border border-white px-5 py-3 font-black text-sm uppercase tracking-wide hover:bg-pink-500 hover:text-white hover:border-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
        >
          Send
        </button>
      </div>
    </div>
  );
}
