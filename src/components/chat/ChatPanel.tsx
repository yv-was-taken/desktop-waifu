import { useCallback, useEffect, useState, useMemo } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { CommandApproval } from './CommandApproval';
import { useAppStore } from '../../store';
import { getProvider } from '../../lib/llm';
import { buildSystemPrompt } from '../../lib/personalities';
import { executeCommand as platformExecuteCommand, getSystemInfo } from '../../lib/platform';
import AnsiToHtml from 'ansi-to-html';
import type { LLMMessage, SystemInfo } from '../../types';

interface ChatPanelProps {
  onClose?: () => void; // Optional close handler for overlay mode
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const messages = useAppStore((state) => state.chat.messages);
  const isThinking = useAppStore((state) => state.chat.isThinking);
  const settings = useAppStore((state) => state.settings);
  const addMessage = useAppStore((state) => state.addMessage);
  const setThinking = useAppStore((state) => state.setThinking);
  const setExpression = useAppStore((state) => state.setExpression);
  const setTalking = useAppStore((state) => state.setTalking);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const clearMessages = useAppStore((state) => state.clearMessages);

  // System info for command execution context
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

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

  // Execute command and display output as chat message
  // CRITICAL: Only runs when status is 'executing' AND approved is explicitly true
  useEffect(() => {
    if (execution.status === 'executing' && execution.generatedCommand && execution.approved) {
      const runCommand = async () => {
        setExecutionStatus('completed');
        try {
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

  const handleSend = useCallback(async (content: string) => {
    if (!settings.apiKey) {
      // This shouldn't happen since input is disabled without API key
      return;
    }

    // Add user message
    addMessage({ role: 'user', content });

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
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content },
      ];

      const response = await provider.chat(llmMessages, {
        apiKey: settings.apiKey,
        model: settings.llmModel,
        maxTokens: 4096,
        temperature: 0.8,
      });

      // Done thinking, now talking
      setThinking(false);
      setTalking(true);

      // Extract emotion from response for expression
      const emotionMatch = response.match(/\[(happy|excited|thinking|curious|neutral|sad)\]$/);
      if (emotionMatch) {
        setExpression(emotionMatch[1]);
      }

      // Check for EXECUTE tag in response
      const executeResult = parseExecuteTag(response);
      if (executeResult) {
        // Only add message if there's surrounding text; otherwise CommandApproval provides context
        if (executeResult.cleanResponse) {
          addMessage({ role: 'assistant', content: executeResult.cleanResponse });
        }
        // Trigger command approval flow - CommandApproval component shows the command
        setGeneratedCommand(content, executeResult.command);
      } else {
        addMessage({ role: 'assistant', content: response });
      }

      // Calculate talking duration based on response length (roughly 50ms per character)
      const talkDuration = Math.min(Math.max(response.length * 50, 2000), 8000);

      // Stop talking after the calculated duration
      setTimeout(() => {
        setTalking(false);
        setExpression('neutral');
      }, talkDuration);

    } catch (error) {
      console.error('LLM Error:', error);
      setThinking(false);
      setTalking(true);

      addMessage({
        role: 'assistant',
        content: `Ah, something went wrong! ${error instanceof Error ? error.message : 'Unknown error'} [sad]`,
      });
      setExpression('sad');

      setTimeout(() => {
        setTalking(false);
        setExpression('neutral');
      }, 3000);
    }
  }, [settings, messages, addMessage, setThinking, setExpression, setTalking, systemInfo, parseExecuteTag, setGeneratedCommand]);

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
            className="text-white hover:text-pink-400 transition-colors p-1.5 border-2 border-white hover:border-pink-400 transform hover:scale-110"
            title="Clear chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={toggleSettings}
            className="text-white hover:text-pink-400 transition-colors p-1.5 border-2 border-white hover:border-pink-400 transform hover:scale-110"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white transition-colors p-1.5 border-2 border-red-500 bg-red-500 hover:bg-red-600 hover:border-red-600 transform hover:scale-110"
              title="Close panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isTyping={isThinking} />

      {/* Command Approval */}
      <CommandApproval />

      {/* Input */}
      <InputArea onSend={handleSend} disabled={isThinking || !settings.apiKey} />
    </div>
  );
}
