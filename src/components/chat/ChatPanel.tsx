import { useCallback } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { useAppStore } from '../../store';
import { getProvider } from '../../lib/llm';
import { characters, defaultCharacterId } from '../../characters';
import type { LLMMessage } from '../../types';

export function ChatPanel() {
  const messages = useAppStore((state) => state.chat.messages);
  const isThinking = useAppStore((state) => state.chat.isThinking);
  const settings = useAppStore((state) => state.settings);
  const addMessage = useAppStore((state) => state.addMessage);
  const setThinking = useAppStore((state) => state.setThinking);
  const setExpression = useAppStore((state) => state.setExpression);
  const setTalking = useAppStore((state) => state.setTalking);
  const toggleSettings = useAppStore((state) => state.toggleSettings);
  const clearMessages = useAppStore((state) => state.clearMessages);

  const character = characters[defaultCharacterId];

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

      // Build messages array with system prompt
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: character?.systemPrompt ?? '' },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content },
      ];

      const response = await provider.chat(llmMessages, {
        apiKey: settings.apiKey,
        model: settings.llmModel,
        maxTokens: 500,
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

      addMessage({ role: 'assistant', content: response });

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
  }, [settings, messages, character, addMessage, setThinking, setExpression, setTalking]);

  return (
    <div className="w-80 h-full flex flex-col bg-gray-900/95 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 drag-region">
        <div className="flex items-center gap-2 no-drag">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-teal-400 to-cyan-400 flex items-center justify-center text-white text-sm font-bold">
            M
          </div>
          <div>
            <h2 className="text-white font-medium text-sm">Hatsune Miku</h2>
            <p className="text-gray-400 text-xs">Online</p>
          </div>
        </div>
        <div className="flex gap-2 no-drag">
          <button
            onClick={clearMessages}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Clear chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={toggleSettings}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} isTyping={isThinking} />

      {/* Input */}
      <InputArea onSend={handleSend} disabled={isThinking || !settings.apiKey} />
    </div>
  );
}
