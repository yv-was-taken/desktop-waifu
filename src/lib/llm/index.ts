import type { LLMProvider } from './providers/base';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';
import type { LLMProviderType } from '../../types';

const providers: Record<LLMProviderType, LLMProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  gemini: new GeminiProvider(),
};

export const getProvider = (type: LLMProviderType): LLMProvider => {
  return providers[type];
};

export const defaultModels: Record<LLMProviderType, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  anthropic: ['claude-sonnet-4-5-20250514', 'claude-opus-4-5-20251101', 'claude-3-haiku-20240307'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
};

export { type LLMProvider } from './providers/base';
