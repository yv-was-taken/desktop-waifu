import type { LLMMessage, LLMConfig } from '../../../types';

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], config: LLMConfig): Promise<string>;
  streamChat?(messages: LLMMessage[], config: LLMConfig): AsyncIterable<string>;
}
