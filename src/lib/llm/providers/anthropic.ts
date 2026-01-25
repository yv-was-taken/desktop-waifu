import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig, LLMContentPart } from '../../../types';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  /**
   * Format message content for Anthropic API
   * Handles both text-only and multimodal (text + images) content
   */
  private formatContent(content: string | LLMContentPart[]): string | ContentBlockParam[] {
    // Text-only message
    if (typeof content === 'string') {
      return content;
    }

    // Multimodal message with images
    return content.map((part): ContentBlockParam => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text } as TextBlockParam;
      }
      // Image content
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: part.data,
        },
      } as ImageBlockParam;
    });
  }

  /**
   * Extract text from system message content
   */
  private getSystemText(content: string | LLMContentPart[] | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    // Extract text from content parts
    return content
      .filter((part) => part.type === 'text')
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('\n');
  }

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
      system: this.getSystemText(systemMessage?.content),
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.formatContent(m.content),
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
      system: this.getSystemText(systemMessage?.content),
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: this.formatContent(m.content),
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
