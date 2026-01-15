import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, LLMProviderType } from '../types';

// Valid models for each provider - keep in sync with lib/llm/index.ts
const validModels: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20251101', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
};

interface CharacterState {
  isLoaded: boolean;
  currentAnimation: string;
  currentExpression: string;
  isTalking: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;  // Waiting for LLM response
  isUserTyping: boolean; // User is typing in input
}

interface SettingsState {
  llmProvider: LLMProviderType;
  llmModel: string;
  apiKey: string;
  alwaysOnTop: boolean;
  characterScale: number;
  showSettings: boolean;
}

interface AppState {
  // Character
  character: CharacterState;
  setCharacterLoaded: (loaded: boolean) => void;
  setAnimation: (animation: string) => void;
  setExpression: (expression: string) => void;
  setTalking: (talking: boolean) => void;

  // Chat
  chat: ChatState;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setThinking: (thinking: boolean) => void;
  setUserTyping: (typing: boolean) => void;
  clearMessages: () => void;

  // Settings
  settings: SettingsState;
  updateSettings: (settings: Partial<SettingsState>) => void;
  toggleSettings: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Character state
      character: {
        isLoaded: false,
        currentAnimation: 'idle',
        currentExpression: 'neutral',
        isTalking: false,
      },
      setCharacterLoaded: (loaded) =>
        set((state) => ({
          character: { ...state.character, isLoaded: loaded },
        })),
      setAnimation: (animation) =>
        set((state) => ({
          character: { ...state.character, currentAnimation: animation },
        })),
      setExpression: (expression) =>
        set((state) => ({
          character: { ...state.character, currentExpression: expression },
        })),
      setTalking: (talking) =>
        set((state) => ({
          character: { ...state.character, isTalking: talking },
        })),

      // Chat state
      chat: {
        messages: [],
        isThinking: false,
        isUserTyping: false,
      },
      addMessage: (message) =>
        set((state) => ({
          chat: {
            ...state.chat,
            messages: [
              ...state.chat.messages,
              {
                ...message,
                id: crypto.randomUUID(),
                timestamp: Date.now(),
              },
            ],
          },
        })),
      setThinking: (thinking) =>
        set((state) => ({
          chat: { ...state.chat, isThinking: thinking },
        })),
      setUserTyping: (typing) =>
        set((state) => ({
          chat: { ...state.chat, isUserTyping: typing },
        })),
      clearMessages: () =>
        set((state) => ({
          chat: { ...state.chat, messages: [] },
        })),

      // Settings state
      settings: {
        llmProvider: 'openai',
        llmModel: 'gpt-4o-mini',
        apiKey: '',
        alwaysOnTop: true,
        characterScale: 1.0,
        showSettings: false,
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      toggleSettings: () =>
        set((state) => ({
          settings: { ...state.settings, showSettings: !state.settings.showSettings },
        })),
    }),
    {
      name: 'desktop-waifu-storage',
      version: 1,
      partialize: (state) => ({
        settings: {
          llmProvider: state.settings.llmProvider,
          llmModel: state.settings.llmModel,
          apiKey: state.settings.apiKey,
          alwaysOnTop: state.settings.alwaysOnTop,
          characterScale: state.settings.characterScale,
        },
      }),
      migrate: (persistedState: unknown, _version: number) => {
        const state = persistedState as { settings?: { llmProvider?: LLMProviderType; llmModel?: string } };

        if (state?.settings) {
          const provider = state.settings.llmProvider ?? 'gemini';
          const model = state.settings.llmModel ?? '';

          // Check if the stored model is valid for the provider
          if (!validModels[provider]?.includes(model)) {
            // Default to first valid model (free/cheapest option)
            state.settings.llmModel = validModels[provider]?.[0] ?? 'gemini-2.5-flash';
          }
        }

        return state;
      },
    }
  )
);
