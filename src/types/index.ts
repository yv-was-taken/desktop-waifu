// LLM Types
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export type LLMProviderType = 'openai' | 'anthropic' | 'gemini';

// Character Types
export interface CharacterExpression {
  [blendShapeName: string]: number;
}

export interface CharacterConfig {
  id: string;
  name: string;
  model: {
    path: string;
    texture?: string; // Made optional for VRM models
    emissiveMap?: string; // Made optional for VRM models
    scale: number;
    position: [number, number, number];
  };
  accessories?: {
    id: string;
    path: string;
  }[];
  animations: {
    idle: string[];
    talking?: string[];
    gestures?: string[];
  };
  expressions: {
    [name: string]: CharacterExpression;
  };
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotion?: string;
}

// Settings Types
export interface AppSettings {
  llmProvider: LLMProviderType;
  llmModel: string;
  apiKey: string;
  alwaysOnTop: boolean;
  characterScale: number;
}

// Personality Types
export type PersonalityId =
  | 'naive-girlfriend'
  | 'smart-girlfriend'
  | 'friend'
  | 'tutor'
  | 'life-coach'
  | 'creative-partner'
  | 'assistant';

export type DetailLevel = 'concise' | 'balanced' | 'detailed';

export interface SubjectOption {
  id: string;
  name: string;
}

export interface Personality {
  id: PersonalityId;
  name: string;
  description: string;
  traits: string;
  speechStyle: string;
  requiresSubject?: boolean;
  predefinedSubjects?: SubjectOption[];
}

export interface PersonalitySettings {
  selectedPersonality: PersonalityId;
  detailLevel: DetailLevel;
  assistantSubject?: string;
  customSubject?: string;
}
