import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig, LLMContentPart } from '../../../types';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  /**
   * Format message content for OpenAI API
   * Handles both text-only and multimodal (text + images) content
   */
  private formatContent(content: string | LLMContentPart[]): string | ChatCompletionContentPart[] {
    // Text-only message
    if (typeof content === 'string') {
      return content;
    }

    // Multimodal message with images
    return content.map((part): ChatCompletionContentPart => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      // Image content
      return {
        type: 'image_url',
        image_url: {
          url: `data:${part.mimeType};base64,${part.data}`,
        },
      };
    });
  }

  /**
   * Convert LLMMessage to OpenAI message format
   */
  private toOpenAIMessage(m: LLMMessage): ChatCompletionMessageParam {
    const content = this.formatContent(m.content);
    if (m.role === 'system') {
      // System messages must have string content
      return { role: 'system', content: typeof content === 'string' ? content : '' };
    }
    if (m.role === 'assistant') {
      return { role: 'assistant', content: typeof content === 'string' ? content : null };
    }
    // User messages can have multimodal content
    return { role: 'user', content };
  }

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<string> {
    const client = new OpenAI({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: messages.map((m) => this.toOpenAIMessage(m)),
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
      messages: messages.map((m) => this.toOpenAIMessage(m)),
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
