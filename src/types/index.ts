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
