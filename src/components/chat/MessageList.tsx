import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { ChatMessage, LLMProviderType } from '../../types';
import { useAppStore } from '../../store';
import { defaultModels } from '../../lib/llm';
import { debugLog } from '../../lib/debug';

interface MessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onEditAndRetry?: (messageId: string, newContent: string) => void;
}

// Request keyboard focus from Wayland compositor (for layer-shell overlay)
function requestKeyboardFocus() {
  debugLog('[ApiKeySetup] Requesting keyboard focus from compositor');
  window.webkit?.messageHandlers?.keyboardFocus?.postMessage({});
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

  // Request keyboard focus when clicking anywhere in setup area
  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    debugLog(`[ApiKeySetup] onClick - target: ${target.tagName}, closest form el: ${target.closest('select, input, button')?.tagName || 'none'}`);
    requestKeyboardFocus();
  };

  return (
    <div className="bg-white border border-white p-4 mx-2" onClick={handleClick}>
      <div className="transform">
        <div className="text-center mb-4">
          <p className="text-black text-sm font-black uppercase">Welcome! Let's get you set up</p>
          <p className="text-gray-600 text-xs mt-1">Choose your LLM provider and enter your API key</p>
        </div>

        <div className="space-y-3">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs text-black font-bold uppercase mb-1">Provider</label>
            <select
              value={settings.llmProvider}
              onChange={(e) => {
                debugLog(`[ApiKeySetup] Provider onChange: ${e.target.value}`);
                handleProviderChange(e.target.value as LLMProviderType);
              }}
              onFocus={() => debugLog('[ApiKeySetup] Provider select onFocus')}
              onMouseDown={(e) => {
                debugLog('[ApiKeySetup] Provider select onMouseDown');
                e.stopPropagation();
              }}
              className="w-full bg-gray-100 text-black border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs text-black font-bold uppercase mb-1">Model</label>
            <select
              value={settings.llmModel}
              onChange={(e) => {
                debugLog(`[ApiKeySetup] Model onChange: ${e.target.value}`);
                updateSettings({ llmModel: e.target.value });
              }}
              onFocus={() => debugLog('[ApiKeySetup] Model select onFocus')}
              onMouseDown={(e) => {
                debugLog('[ApiKeySetup] Model select onMouseDown');
                e.stopPropagation();
              }}
              className="w-full bg-gray-100 text-black border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
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
            <label className="block text-xs text-black font-bold uppercase mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                debugLog(`[ApiKeySetup] API Key onChange: ${e.target.value.length} chars`);
                setApiKey(e.target.value);
              }}
              onFocus={() => debugLog('[ApiKeySetup] API Key input onFocus')}
              onMouseDown={(e) => {
                debugLog('[ApiKeySetup] API Key input onMouseDown');
                e.stopPropagation();
              }}
              placeholder={`Enter your ${settings.llmProvider === 'openai' ? 'OpenAI' : settings.llmProvider === 'anthropic' ? 'Anthropic' : 'Gemini'} API key`}
              className="w-full bg-gray-100 text-black border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 placeholder-gray-400"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
            />
          </div>

          <button
            onClick={handleSaveKey}
            disabled={!apiKey.trim()}
            className="w-full bg-black text-white border-2 border-black py-2 font-black text-sm uppercase tracking-wide hover:bg-pink-500 hover:border-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Chatting
          </button>

          <p className="text-xs text-gray-500 text-center">
            Your API key is stored locally and never sent to our servers.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MessageList({ messages, isTyping, onEditAndRetry }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef<boolean>(false);
  const apiKey = useAppStore((state) => state.settings.apiKey);
  const fontSize = useAppStore((state) => state.settings.fontSize);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Track if user manually scrolled up
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    userScrolledUp.current = !isAtBottom;
  };

  // Auto-scroll to bottom when messages change, unless user scrolled up
  useEffect(() => {
    if (!scrollRef.current || userScrolledUp.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Reset scroll lock when a new message is added (not just updated)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      userScrolledUp.current = false;
      prevMessageCount.current = messages.length;
    }
  }, [messages.length]);

  const copyToClipboard = async (text: string, messageId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 1000);
  };

  const startEditing = (message: ChatMessage) => {
    setEditingId(message.id);
    setEditContent(message.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = (messageId: string) => {
    if (editContent.trim() && onEditAndRetry) {
      onEditAndRetry(messageId, editContent.trim());
    }
    cancelEditing();
  };

  // Show API key setup if no key is set
  const showSetup = !apiKey && messages.length === 0;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 chat-scroll"
      onScroll={handleScroll}
      onMouseDown={(e) => {
        // Prevent clicks from stealing focus from textarea (Slack/Discord behavior)
        // But allow default for form elements that need it (select, input, button)
        const target = e.target as HTMLElement;
        const closestFormEl = target.closest('select, input, button');
        debugLog(`[MessageList] onMouseDown - target: ${target.tagName}, closest form el: ${closestFormEl?.tagName || 'none'}`);
        // Check if target or any ancestor is a form element
        if (closestFormEl) {
          debugLog('[MessageList] onMouseDown - allowing default for form element');
          return;
        }
        debugLog('[MessageList] onMouseDown - preventing default');
        e.preventDefault();
      }}
    >
      {showSetup ? (
        <ApiKeySetup />
      ) : messages.length === 0 ? (
        <div className="text-center py-8">
          <div className="inline-block bg-white border-4 border-black px-6 py-4 transform -rotate-1">
            <p className="text-black text-lg font-black uppercase">Konnichiwa!</p>
            <p className="text-gray-600 text-sm mt-1">Say hi to start chatting!</p>
          </div>
        </div>
      ) : null}

      {messages.map((message) => {
        const isUser = message.role === 'user';
        const hasHtmlContent = !!message.htmlContent;
        const isEditing = editingId === message.id;

        return (
          <div
            key={message.id}
            className={`group flex items-end gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}
          >
            {/* Action buttons for user messages (appear on left) */}
            {isUser && !isEditing && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onClick={() => copyToClipboard(message.content, message.id)}
                  className={`px-2 py-1 text-xs rounded cursor-pointer text-center min-w-[40px]
                    ${copiedId === message.id
                      ? 'bg-green-600 text-white scale-95'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  title="Copy message"
                >
                  {copiedId === message.id ? '✓' : 'Copy'}
                </button>
                {!isTyping && (
                  <button
                    onClick={() => startEditing(message)}
                    className="px-2 py-1 text-xs rounded cursor-pointer text-slate-400 hover:text-white hover:bg-slate-700"
                    title="Edit and retry"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}

            <div
              className={`${hasHtmlContent && !isUser ? 'w-[85%]' : 'max-w-[85%]'} relative px-4 py-3 ${
                isUser
                  ? 'bg-slate-800 text-white border-2 border-slate-600 [clip-path:polygon(0_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%)]'
                  : 'bg-[#111111] text-white border-2 border-slate-600 [clip-path:polygon(8px_0,100%_0,100%_100%,0_100%,0_8px)]'
              }`}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-slate-700 text-white border border-slate-500 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-400"
                    style={{ fontSize: `${fontSize ?? 14}px` }}
                    rows={3}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEditing();
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(message.id);
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1 text-xs rounded bg-slate-600 text-white hover:bg-slate-500 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(message.id)}
                      disabled={!editContent.trim()}
                      className="px-3 py-1 text-xs rounded bg-pink-500 text-white hover:bg-pink-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Save & Retry
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`leading-relaxed break-words ${hasHtmlContent ? '' : 'prose prose-sm max-w-none prose-invert'}`} style={{ fontSize: `${fontSize ?? 14}px` }}>
                  {hasHtmlContent ? (
                    <div
                      className="terminal-container"
                      dangerouslySetInnerHTML={{ __html: message.htmlContent! }}
                    />
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline = !match && !className;
                          return isInline ? (
                            <code className={`${isUser ? 'bg-slate-700' : 'bg-slate-700'} px-1 py-0.5 rounded text-xs`} {...props}>
                              {children}
                            </code>
                          ) : (
                            <SyntaxHighlighter
                              style={oneDark}
                              language={match?.[1] || 'text'}
                              PreTag="div"
                              className="rounded-md text-xs !my-2"
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons for assistant messages (appear on right) */}
            {!isUser && (
              <button
                onClick={() => copyToClipboard(message.content, message.id)}
                className={`opacity-0 group-hover:opacity-100 transition-opacity duration-150 px-2 py-1 text-xs rounded cursor-pointer text-center min-w-[40px]
                  ${copiedId === message.id
                    ? 'bg-green-600 text-white scale-95'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                title="Copy message"
              >
                {copiedId === message.id ? '✓' : 'Copy'}
              </button>
            )}
          </div>
        );
      })}

      {isTyping && (
        <div className="flex justify-start">
          <div className="bg-[#111111] text-white border-2 border-slate-600 px-4 py-3 [clip-path:polygon(8px_0,100%_0,100%_100%,0_100%,0_8px)]">
            <div className="flex space-x-2 items-center">
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
