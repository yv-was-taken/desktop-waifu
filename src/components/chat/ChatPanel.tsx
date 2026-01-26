import { useCallback, useEffect, useState, useMemo } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { CommandApproval } from './CommandApproval';
import { useAppStore } from '../../store';
import { getProvider } from '../../lib/llm';
import { buildSystemPrompt } from '../../lib/personalities';
import { executeCommand as platformExecuteCommand, getSystemInfo, saveFile, showDesktopNotification, isWindowCurrentlyFocused } from '../../lib/platform';
import { exportToJSON, exportToMarkdown } from '../../lib/export';
import { debugLog } from '../../lib/debug';
import { isSlashCommand, executeSlashCommand } from '../../lib/commands';
import { characters } from '../../characters';
import AnsiToHtml from 'ansi-to-html';
import type { LLMMessage, SystemInfo, ImageAttachment, LLMContentPart } from '../../types';

interface ChatPanelProps {
  onClose?: () => void; // Optional close handler for overlay mode
}

// Debug: Log when this module loads
debugLog('[CHATPANEL] Module loaded');

export function ChatPanel({ onClose }: ChatPanelProps) {
  debugLog('[CHATPANEL] Component rendering');
  const messages = useAppStore((state) => state.chat.messages);
  const isThinking = useAppStore((state) => state.chat.isThinking);
  const settings = useAppStore((state) => state.settings);
  const addMessage = useAppStore((state) => state.addMessage);
  const addStreamingMessage = useAppStore((state) => state.addStreamingMessage);
  const updateMessageContent = useAppStore((state) => state.updateMessageContent);
  const setThinking = useAppStore((state) => state.setThinking);
  const setExpression = useAppStore((state) => state.setExpression);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const clearMessages = useAppStore((state) => state.clearMessages);
  const updateMessage = useAppStore((state) => state.updateMessage);
  const truncateMessagesAfter = useAppStore((state) => state.truncateMessagesAfter);

  // System info for command execution context
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // Export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);

  // ANSI to HTML converter
  const ansiConverter = useMemo(() => new AnsiToHtml({
    fg: '#e2e8f0', // slate-200
    bg: '#1e293b', // slate-800
    newline: true,
    escapeXML: true,
  }), []);

  // Code execution state
  const execution = useAppStore((state) => state.execution);
  const setExecutionStatus = useAppStore((state) => state.setExecutionStatus);
  const clearExecution = useAppStore((state) => state.clearExecution);
  const setGeneratedCommand = useAppStore((state) => state.setGeneratedCommand);

  // Fetch system info on mount
  useEffect(() => {
    getSystemInfo()
      .then(setSystemInfo)
      .catch((err) => console.error('Failed to get system info:', err));
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = () => setShowExportMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showExportMenu]);

  // Handle export action
  const handleExport = useCallback(async (format: 'json' | 'markdown') => {
    setShowExportMenu(false);

    const content = format === 'json' ? exportToJSON(messages) : exportToMarkdown(messages);
    const extension = format === 'json' ? 'json' : 'md';
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    const time = `${hours12}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${ampm}`;
    const timestamp = `${date}_${time}`;
    const filename = `conversation-${timestamp}.${extension}`;
    const fullPath = `${settings.exportPath}/${filename}`;

    try {
      const result = await saveFile(fullPath, content);
      if (!result.success) {
        setExportNotification(`Export failed: ${result.error}`);
      } else {
        setExportNotification(`Saved to ${fullPath}`);
      }
    } catch (error) {
      setExportNotification(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Clear notification after 3 seconds
    setTimeout(() => setExportNotification(null), 3000);
  }, [messages, settings.exportPath]);

  // Execute command and display output as chat message
  // CRITICAL: Only runs when status is 'executing' AND approved is explicitly true
  useEffect(() => {
    debugLog(`[EXEC EFFECT] Checking: status=${execution.status}, cmd=${execution.generatedCommand}, approved=${execution.approved}`);
    if (execution.status === 'executing' && execution.generatedCommand && execution.approved) {
      debugLog('[EXEC EFFECT] Conditions met, executing command');
      // Reset approved immediately to prevent race conditions with new commands
      useAppStore.setState((state) => ({
        execution: { ...state.execution, approved: false }
      }));
      debugLog(`[EXEC EFFECT] After reset: approved=${useAppStore.getState().execution.approved}`);

      const runCommand = async () => {
        try {
          debugLog(`[EXEC EFFECT] Running command: ${execution.generatedCommand}`);
          const output = await platformExecuteCommand(execution.generatedCommand!);

          // Convert ANSI codes to HTML for terminal-style colored output
          const stdoutHtml = ansiConverter.toHtml(output.stdout.trim());
          let htmlContent = `<pre class="terminal-output">${stdoutHtml}</pre>`;

          if (output.stderr) {
            const stderrHtml = ansiConverter.toHtml(output.stderr.trim());
            htmlContent += `<div class="terminal-error"><strong>Errors:</strong><pre class="terminal-output">${stderrHtml}</pre></div>`;
          }
          if (output.exit_code !== 0) {
            htmlContent += `<div class="terminal-exit-code">Exit code: ${output.exit_code}</div>`;
          }

          // Plain text fallback for copy functionality
          let plainContent = output.stdout.trim();
          if (output.stderr) {
            plainContent += `\n\nErrors:\n${output.stderr.trim()}`;
          }
          if (output.exit_code !== 0) {
            plainContent += `\n\nExit code: ${output.exit_code}`;
          }

          addMessage({ role: 'assistant', content: plainContent, htmlContent });
          // Show notification based on user preference
          const state = useAppStore.getState();
          const pref = state.settings.notificationPreference;
          const isChatOpen = state.ui.chatPanelOpen;
          const windowFocused = isWindowCurrentlyFocused();
          const shouldNotify =
            (pref === 'chat_closed' && !isChatOpen) ||
            (pref === 'unfocused' && !windowFocused);
          debugLog(`[NOTIFICATION] pref=${pref}, isChatOpen=${isChatOpen}, windowFocused=${windowFocused}, shouldNotify=${shouldNotify}`);
          if (shouldNotify) {
            const preview = plainContent.substring(0, 100);
            showDesktopNotification('Command Complete', preview + (preview.length >= 100 ? '...' : ''));
          }
          clearExecution();
        } catch (error) {
          addMessage({
            role: 'assistant',
            content: `**Error:** ${error instanceof Error ? error.message : String(error)}`,
          });
          clearExecution();
        }
      };
      runCommand();
    }
  }, [execution.status, execution.generatedCommand, execution.approved, setExecutionStatus, clearExecution, addMessage, ansiConverter]);

  // Parse EXECUTE tag from LLM response
  const parseExecuteTag = useCallback((response: string): { command: string; cleanResponse: string } | null => {
    const executeMatch = response.match(/\[EXECUTE:\s*(.+?)\]/);
    if (executeMatch) {
      const command = executeMatch[1].trim();
      // If command is empty, treat as parse failure
      if (!command) {
        return null;
      }
      const cleanResponse = response.replace(/\[EXECUTE:\s*.+?\]/, '').trim();
      return { command, cleanResponse };
    }
    return null;
  }, []);

/**
   * Build LLM content from text and images
   */
  const buildLLMContent = useCallback((text: string, images?: ImageAttachment[]): string | LLMContentPart[] => {
    if (!images || images.length === 0) {
      return text;
    }

    // Build multimodal content with images first, then text
    const parts: LLMContentPart[] = [
      ...images.map((img): LLMContentPart => ({
        type: 'image',
        data: img.data,
        mimeType: img.mimeType,
      })),
      { type: 'text', text },
    ];

    return parts;
  }, []);

  const handleEditAndRetry = useCallback(async (messageId: string, newContent: string) => {
    if (!settings.apiKey) return;

    // Update the message content and truncate subsequent messages
    updateMessage(messageId, newContent);
    truncateMessagesAfter(messageId);

    // Start thinking animation while waiting for LLM
    setThinking(true);

    try {
      const provider = getProvider(settings.llmProvider);

      // Build system prompt from personality settings with system info
      const systemPrompt = buildSystemPrompt({
        selectedPersonality: settings.selectedPersonality,
        detailLevel: settings.detailLevel,
        assistantSubject: settings.assistantSubject,
        customSubject: settings.customSubject,
      }, systemInfo);

      // Get fresh messages from store (after truncation)
      const currentMessages = useAppStore.getState().chat.messages;

      // Build messages array with system prompt
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...currentMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      debugLog(`[LLM] Edit & Retry: Sending ${llmMessages.length} messages to ${settings.llmProvider}/${settings.llmModel}`);

      const response = await provider.chat(llmMessages, {
        apiKey: settings.apiKey,
        model: settings.llmModel,
        maxTokens: 4096,
        temperature: 0.8,
      });

      // Done thinking
      setThinking(false);

      // Check for EXECUTE tag in response
      const executeResult = parseExecuteTag(response);

      if (executeResult) {
        if (executeResult.cleanResponse) {
          addMessage({ role: 'assistant', content: executeResult.cleanResponse });
        }
        setGeneratedCommand(newContent, executeResult.command);
      } else {
        addMessage({ role: 'assistant', content: response });
      }

      setExpression('neutral');

    } catch (error) {
      console.error('LLM Error:', error);
      setThinking(false);

      addMessage({
        role: 'assistant',
        content: `Ah, something went wrong! ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      setExpression('sad');
    }
  }, [settings, systemInfo, parseExecuteTag, setGeneratedCommand, addMessage, setThinking, setExpression, updateMessage, truncateMessagesAfter]);

  const handleSend = useCallback(async (content: string, images?: ImageAttachment[]) => {
    // Handle slash commands before anything else
    if (isSlashCommand(content)) {
      const result = executeSlashCommand(content, {
        clearMessages,
        toggleSettings,
        updateSettings: (s) => useAppStore.getState().updateSettings(s),
        addMessage: (msg) => addMessage(msg),
        availableCharacters: Object.keys(characters),
        currentCharacter: settings.selectedCharacter,
      });

      if (result?.handled) {
        if (result.error) {
          addMessage({ role: 'assistant', content: `**Error:** ${result.error}` });
        } else if (result.feedbackMessage) {
          addMessage({ role: 'assistant', content: result.feedbackMessage });
        }
        return; // Don't send to LLM
      }
    }

    if (!settings.apiKey) {
      // This shouldn't happen since input is disabled without API key
      return;
    }

    // Add user message with images
    addMessage({ role: 'user', content, images });

    // Start thinking animation while waiting for LLM
    setThinking(true);

    try {
      const provider = getProvider(settings.llmProvider);

      // Build system prompt from personality settings with system info
      const systemPrompt = buildSystemPrompt({
        selectedPersonality: settings.selectedPersonality,
        detailLevel: settings.detailLevel,
        assistantSubject: settings.assistantSubject,
        customSubject: settings.customSubject,
      }, systemInfo);

      // Build messages array with system prompt
      // Include images from previous messages and the current message
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: buildLLMContent(m.content, m.images),
        })),
        { role: 'user', content: buildLLMContent(content, images) },
      ];

      debugLog(`[LLM] Sending ${llmMessages.length} messages to ${settings.llmProvider}/${settings.llmModel}`);
      const systemContent = llmMessages[0]?.content;
      const systemText = typeof systemContent === 'string' ? systemContent : '';
      debugLog(`[LLM] System prompt length: ${systemText.length}`);
      debugLog(`[LLM] System prompt includes EXECUTE instruction: ${systemText.includes('[EXECUTE:')}`);
      debugLog(`[LLM] Message has images: ${!!images && images.length > 0}`);

      const config = {
        apiKey: settings.apiKey,
        model: settings.llmModel,
        maxTokens: 4096,
        temperature: 0.8,
      };

      let response: string;

      // Use streaming if available
      if (provider.streamChat) {
        // Create placeholder message and get its ID for streaming updates
        const messageId = addStreamingMessage();

        // Stop showing thinking indicator since content is now appearing
        setThinking(false);

        // Typewriter effect: buffer incoming tokens and reveal character by character
        let fullResponse = '';
        let displayedLength = 0;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const animateTyping = () => {
          // Skip animation if document is hidden (setTimeout is throttled)
          if (document.hidden) {
            displayedLength = fullResponse.length;
            updateMessageContent(messageId, fullResponse);
            timeoutId = null;
            return;
          }

          if (displayedLength < fullResponse.length) {
            // Reveal 1 character every 5ms (~200 chars/sec)
            displayedLength += 1;
            updateMessageContent(messageId, fullResponse.slice(0, displayedLength));
            timeoutId = setTimeout(animateTyping, 5);
          } else {
            // Animation caught up to fullResponse - reset so new chunks can restart it
            timeoutId = null;
          }
        };

        // Handle visibility change to complete animation immediately when hidden
        const handleVisibilityChange = () => {
          if (document.hidden && displayedLength < fullResponse.length) {
            displayedLength = fullResponse.length;
            updateMessageContent(messageId, fullResponse);
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        for await (const chunk of provider.streamChat(llmMessages, config)) {
          fullResponse += chunk;
          // Start animation if not already running
          if (timeoutId === null) {
            animateTyping();
          }
        }

        // Trigger notification immediately when stream completes (before waiting for animation)
        // This ensures notifications fire even if the window is hidden and animation is throttled
        const executeResult = parseExecuteTag(fullResponse);
        if (!executeResult) {
          const state = useAppStore.getState();
          const pref = state.settings.notificationPreference;
          const isChatOpen = state.ui.chatPanelOpen;
          const windowFocused = isWindowCurrentlyFocused();
          const shouldNotify =
            (pref === 'chat_closed' && !isChatOpen) ||
            (pref === 'unfocused' && !windowFocused);
          debugLog(`[NOTIFICATION] pref=${pref}, isChatOpen=${isChatOpen}, windowFocused=${windowFocused}, shouldNotify=${shouldNotify}`);
          if (shouldNotify) {
            const preview = fullResponse.substring(0, 100);
            debugLog(`[NOTIFICATION] Sending notification: "${preview}"`);
            showDesktopNotification('Desktop Waifu', preview + (preview.length >= 100 ? '...' : ''));
          }
        }

        // Wait for animation to finish typing everything
        while (displayedLength < fullResponse.length) {
          // Skip animation wait if document is hidden (setTimeout is throttled)
          if (document.hidden) {
            displayedLength = fullResponse.length;
            updateMessageContent(messageId, fullResponse);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        // Clean up visibility listener
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        response = fullResponse;

        debugLog(`[LLM] Streaming complete, length=${response.length}`);
        debugLog(`[LLM] Response preview: ${response.substring(0, 200)}`);

        // Check for EXECUTE tag in response (reuse result from above)
        debugLog(`[LLM] parseExecuteTag result: ${executeResult ? `command="${executeResult.command}"` : 'null'}`);

        if (executeResult) {
          debugLog(`[LLM] EXECUTE tag found, calling setGeneratedCommand`);
          // Update the message to show clean response (without EXECUTE tag)
          updateMessageContent(messageId, executeResult.cleanResponse);
          // Trigger command approval flow
          setGeneratedCommand(content, executeResult.command);
          debugLog(`[LLM] setGeneratedCommand called, current status=${useAppStore.getState().execution.status}`);
        }
      } else {
        // Fallback to non-streaming
        response = await provider.chat(llmMessages, config);

        // Done thinking
        setThinking(false);

        debugLog(`[LLM] Response received, length=${response.length}`);
        debugLog(`[LLM] Response preview: ${response.substring(0, 200)}`);

        // Check for EXECUTE tag in response
        const executeResult = parseExecuteTag(response);
        debugLog(`[LLM] parseExecuteTag result: ${executeResult ? `command="${executeResult.command}"` : 'null'}`);

        if (executeResult) {
          debugLog(`[LLM] EXECUTE tag found, calling setGeneratedCommand`);
          // Only add message if there's surrounding text; otherwise CommandApproval provides context
          if (executeResult.cleanResponse) {
            addMessage({ role: 'assistant', content: executeResult.cleanResponse });
          }
          // Trigger command approval flow - CommandApproval component shows the command
          setGeneratedCommand(content, executeResult.command);
          debugLog(`[LLM] setGeneratedCommand called, current status=${useAppStore.getState().execution.status}`);
        } else {
          debugLog(`[LLM] No EXECUTE tag, adding as regular message`);
          addMessage({ role: 'assistant', content: response });
          // Show notification based on user preference
          const state = useAppStore.getState();
          const pref = state.settings.notificationPreference;
          const isChatOpen = state.ui.chatPanelOpen;
          const windowFocused = isWindowCurrentlyFocused();
          const shouldNotify =
            (pref === 'chat_closed' && !isChatOpen) ||
            (pref === 'unfocused' && !windowFocused);
          debugLog(`[NOTIFICATION] pref=${pref}, isChatOpen=${isChatOpen}, windowFocused=${windowFocused}, shouldNotify=${shouldNotify}`);
          if (shouldNotify) {
            const preview = response.substring(0, 100);
            debugLog(`[NOTIFICATION] Sending notification: "${preview}"`);
            showDesktopNotification('Desktop Waifu', preview + (preview.length >= 100 ? '...' : ''));
          }
        }
      }

      setExpression('neutral');

    } catch (error) {
      console.error('LLM Error:', error);
      setThinking(false);

      addMessage({
        role: 'assistant',
        content: `Ah, something went wrong! ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      setExpression('sad');
    }
}, [settings, messages, addMessage, addStreamingMessage, updateMessageContent, setThinking, setExpression, systemInfo, parseExecuteTag, setGeneratedCommand, buildLLMContent]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/90 border border-slate-600">
      {/* Header - Manga style */}
      <div className="flex items-center justify-between p-3 bg-[#111111] drag-region border border-slate-600">
        <div className="flex items-center gap-3 no-drag">
          <div
            className="px-3 py-1 bg-white text-black font-black text-lg tracking-tight font-['Arial_Black',sans-serif]"
          >
            DESKTOP WAIFU
          </div>
        </div>
        <div className="flex gap-1 no-drag">
          <button
            onClick={clearMessages}
            className="text-white hover:text-pink-400 transition-colors p-1.5 border-2 border-white hover:border-pink-400 transform hover:scale-110 cursor-grab active:cursor-grabbing"
            title="Clear chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
              disabled={messages.length === 0}
              className="text-white hover:text-pink-400 transition-colors p-1.5 border-2 border-white hover:border-pink-400 transform hover:scale-110 cursor-grab active:cursor-grabbing disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded shadow-lg z-50 min-w-[140px]">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-700"
                >
                  Export as Markdown
                </button>
              </div>
            )}
          </div>
          <button
            onClick={toggleSettings}
            className="text-white hover:text-pink-400 transition-colors p-1.5 border-2 border-white hover:border-pink-400 transform hover:scale-110 cursor-grab active:cursor-grabbing"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white transition-colors p-1.5 border-2 border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600 transform hover:scale-110 cursor-grab active:cursor-grabbing"
              title="Close panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Export notification */}
      {exportNotification && (
        <div className="px-3 py-2 bg-slate-800 border-b border-slate-600 text-sm text-slate-300">
          {exportNotification}
        </div>
      )}

      {/* Messages */}
      <MessageList messages={messages} isTyping={isThinking} onEditAndRetry={handleEditAndRetry} />

      {/* Command Approval */}
      <CommandApproval />

      {/* Input */}
      <InputArea onSend={handleSend} disabled={isThinking || !settings.apiKey} />
    </div>
  );
}
