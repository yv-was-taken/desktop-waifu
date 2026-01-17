import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, LLMProviderType, PersonalityId, DetailLevel } from '../types';

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
  // Character selection
  selectedCharacter: string;
  // Personality settings
  selectedPersonality: PersonalityId;
  detailLevel: DetailLevel;
  assistantSubject: string;
  customSubject: string;
}

interface UIState {
  chatPanelOpen: boolean;
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

  // UI (overlay mode)
  ui: UIState;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
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
        // Character selection
        selectedCharacter: 'emily',
        // Personality defaults
        selectedPersonality: 'naive-girlfriend',
        detailLevel: 'balanced',
        assistantSubject: 'programming',
        customSubject: '',
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      toggleSettings: () =>
        set((state) => ({
          settings: { ...state.settings, showSettings: !state.settings.showSettings },
        })),

      // UI state (overlay mode)
      ui: {
        chatPanelOpen: false,
      },
      setChatPanelOpen: (open) =>
        set((state) => ({
          ui: { ...state.ui, chatPanelOpen: open },
        })),
      toggleChatPanel: () =>
        set((state) => ({
          ui: { ...state.ui, chatPanelOpen: !state.ui.chatPanelOpen },
        })),
    }),
    {
      name: 'desktop-waifu-storage',
      partialize: (state) => ({
        settings: {
          llmProvider: state.settings.llmProvider,
          llmModel: state.settings.llmModel,
          apiKey: state.settings.apiKey,
          alwaysOnTop: state.settings.alwaysOnTop,
          characterScale: state.settings.characterScale,
          selectedCharacter: state.settings.selectedCharacter,
          selectedPersonality: state.settings.selectedPersonality,
          detailLevel: state.settings.detailLevel,
          assistantSubject: state.settings.assistantSubject,
          customSubject: state.settings.customSubject,
        },
      }),
    }
  )
);
