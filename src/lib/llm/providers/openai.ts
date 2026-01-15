import OpenAI from 'openai';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig } from '../../../types';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<string> {
    const client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens ?? 500,
      temperature: config.temperature ?? 0.8,
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async *streamChat(messages: LLMMessage[], config: LLMConfig): AsyncIterable<string> {
    const client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: config.maxTokens ?? 500,
      temperature: config.temperature ?? 0.8,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
