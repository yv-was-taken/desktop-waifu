import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig } from '../../../types';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<string> {
    const client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 500,
      system: systemMessage?.content ?? '',
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
  }

  async *streamChat(messages: LLMMessage[], config: LLMConfig): AsyncIterable<string> {
    const client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const stream = client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens ?? 500,
      system: systemMessage?.content ?? '',
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
