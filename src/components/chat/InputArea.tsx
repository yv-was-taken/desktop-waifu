import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store';
import { readClipboardImage, fileToImageAttachment, revokeImagePreview, SUPPORTED_MIME_TYPES } from '../../lib/image';
import { isOverlayMode, openFileDialog, type FileDialogResult } from '../../lib/platform';
import type { ImageAttachment } from '../../types';

interface InputAreaProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  disabled?: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevExecutionStatusRef = useRef<string | null>(null);

  const setUserTyping = useAppStore((state) => state.setUserTyping);
  const executionStatus = useAppStore((state) => state.execution.status);

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
    const hasContent = trimmed || pendingImages.length > 0;
    if (hasContent && !disabled) {
      // Clear typing state immediately on submit
      setUserTyping(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      onSend(trimmed || 'What is in this image?', pendingImages.length > 0 ? pendingImages : undefined);
      setInput('');
      setPendingImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input, pendingImages, disabled, onSend, setUserTyping]);

  // Handle clipboard paste for images
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const image = await readClipboardImage();
    if (image) {
      e.preventDefault();
      setPendingImages((prev) => [...prev, image]);
    }
    // If no image, let default paste behavior handle text
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: ImageAttachment[] = [];
    for (const file of files) {
      try {
        const image = await fileToImageAttachment(file);
        newImages.push(image);
      } catch (error) {
        console.error('Failed to process image:', error);
      }
    }

    if (newImages.length > 0) {
      setPendingImages((prev) => [...prev, ...newImages]);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Remove a pending image
  const removeImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        revokeImagePreview(image);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  // Convert FileDialogResult to ImageAttachment
  const fileDialogResultToAttachment = useCallback((result: FileDialogResult): ImageAttachment => {
    // Create a data URL from base64 data
    const dataUrl = `data:${result.mimeType};base64,${result.data}`;
    return {
      id: crypto.randomUUID(),
      mimeType: result.mimeType as ImageAttachment['mimeType'],
      data: result.data,
      previewUrl: dataUrl,
    };
  }, []);

  // Handle attach button click - use native dialog in overlay mode
  const handleAttachClick = useCallback(async () => {
    if (isOverlayMode) {
      // Use native GTK4 file dialog in overlay mode
      // Rust handler will temporarily lower overlay layer so dialog appears on top
      const files = await openFileDialog();
      if (files && files.length > 0) {
        const newImages = files.map(fileDialogResultToAttachment);
        setPendingImages((prev) => [...prev, ...newImages]);
      }
    } else {
      // Fall back to HTML file input in non-overlay mode
      fileInputRef.current?.click();
    }
  }, [fileDialogResultToAttachment]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingImages.forEach(revokeImagePreview);
    };
  }, []);

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

  const hasContent = input.trim() || pendingImages.length > 0;

  return (
    <div className="p-3 bg-black">
      {/* Image preview area */}
      {pendingImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingImages.map((image) => (
            <div key={image.id} className="relative group">
              <img
                src={image.previewUrl}
                alt="Pending attachment"
                className="h-16 w-16 object-cover border-2 border-slate-600 rounded"
              />
              <button
                onClick={() => removeImage(image.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_MIME_TYPES.join(',')}
          onChange={handleFileSelect}
          multiple
          className="hidden"
        />

        {/* Attach button */}
        <button
          onClick={handleAttachClick}
          disabled={disabled}
          className="bg-slate-700 text-white border border-slate-600 px-3 py-3 hover:bg-slate-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title="Attach image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => input.trim() && setUserTyping(true)}
            onBlur={() => setUserTyping(false)}
            placeholder={pendingImages.length > 0 ? "Add a message or just send..." : "Type a message or paste an image..."}
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-white text-black border border-white px-4 py-3 text-sm focus:outline-none focus:border-pink-500 placeholder-gray-400 disabled:opacity-50 font-medium"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled || !hasContent}
          className="bg-white text-black border border-white px-5 py-3 font-black text-sm uppercase tracking-wide hover:bg-pink-500 hover:text-white hover:border-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
        >
          Send
        </button>
      </div>
    </div>
  );
}
