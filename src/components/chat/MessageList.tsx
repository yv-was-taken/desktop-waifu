import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, LLMProviderType } from '../../types';
import { useAppStore } from '../../store';
import { defaultModels } from '../../lib/llm';

interface MessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
}

function ApiKeySetup() {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [apiKey, setApiKey] = useState('');

  const handleProviderChange = (provider: LLMProviderType) => {
    updateSettings({
      llmProvider: provider,
      llmModel: defaultModels[provider][0],
    });
  };

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      updateSettings({ apiKey: apiKey.trim() });
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4 mx-2">
      <div className="text-center mb-4">
        <p className="text-white text-sm font-medium">Welcome! Let's get you set up</p>
        <p className="text-gray-400 text-xs mt-1">Choose your LLM provider and enter your API key</p>
      </div>

      <div className="space-y-3">
        {/* Provider Selection */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Provider</label>
          <select
            value={settings.llmProvider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProviderType)}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Model</label>
          <select
            value={settings.llmModel}
            onChange={(e) => updateSettings({ llmModel: e.target.value })}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {defaultModels[settings.llmProvider].map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* API Key Input */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`Enter your ${settings.llmProvider === 'openai' ? 'OpenAI' : settings.llmProvider === 'anthropic' ? 'Anthropic' : 'Gemini'} API key`}
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-gray-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
          />
        </div>

        <button
          onClick={handleSaveKey}
          disabled={!apiKey.trim()}
          className="w-full bg-gradient-to-r from-teal-400 to-cyan-400 text-white rounded-lg py-2 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Chatting
        </button>

        <p className="text-xs text-gray-500 text-center">
          Your API key is stored locally and never sent to our servers.
        </p>
      </div>
    </div>
  );
}

export function MessageList({ messages, isTyping }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiKey = useAppStore((state) => state.settings.apiKey);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const parseEmotionTag = (content: string) => {
    const emotionMatch = content.match(/\[(happy|excited|thinking|curious|neutral|sad)\]$/);
    if (emotionMatch) {
      return {
        text: content.replace(emotionMatch[0], '').trim(),
        emotion: emotionMatch[1],
      };
    }
    return { text: content, emotion: null };
  };

  // Show API key setup if no key is set
  const showSetup = !apiKey && messages.length === 0;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 chat-scroll"
    >
      {showSetup ? (
        <ApiKeySetup />
      ) : messages.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <p className="text-lg">Konnichiwa!</p>
          <p className="text-sm mt-2">Say hi to start chatting!</p>
        </div>
      ) : null}

      {messages.map((message) => {
        const { text, emotion } = message.role === 'assistant'
          ? parseEmotionTag(message.content)
          : { text: message.content, emotion: null };

        return (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-gradient-to-r from-teal-400 to-cyan-400 text-white rounded-bl-md'
              }`}
            >
              <p className="text-sm leading-relaxed">{text}</p>
              {emotion && (
                <span className="text-xs opacity-70 mt-1 block">
                  feeling {emotion}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {isTyping && (
        <div className="flex justify-start">
          <div className="bg-gradient-to-r from-teal-400 to-cyan-400 text-white rounded-2xl rounded-bl-md px-4 py-2">
            <div className="flex space-x-1">
              <span className="animate-bounce delay-0">●</span>
              <span className="animate-bounce delay-100">●</span>
              <span className="animate-bounce delay-200">●</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
