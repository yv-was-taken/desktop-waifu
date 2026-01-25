import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig, LLMContentPart } from '../../../types';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  /**
   * Convert LLM content to Gemini parts format
   */
  private contentToParts(content: string | LLMContentPart[]): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map((part): Part => {
      if (part.type === 'text') {
        return { text: part.text };
      }
      // Image content
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      };
    });
  }

  /**
   * Extract text from system message content
   */
  private getSystemText(content: string | LLMContentPart[] | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content
      .filter((part) => part.type === 'text')
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('\n');
  }

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<string> {
    const genAI = new GoogleGenerativeAI(config.apiKey);

    // Get system message and conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build system instruction as Content type
    const systemText = this.getSystemText(systemMessage?.content);
    const systemInstruction: Content | undefined = systemText
      ? { role: 'user', parts: [{ text: systemText }] }
      : undefined;

    // Create model with system instruction
    const model = genAI.getGenerativeModel({
      model: config.model,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: config.maxTokens ?? 500,
        temperature: config.temperature ?? 0.8,
      },
    });

    // Build conversation history (all messages except the last one)
    const history: Content[] = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: this.contentToParts(m.content),
    }));

    const chat = model.startChat({ history });

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const lastParts = lastMessage ? this.contentToParts(lastMessage.content) : [{ text: '' }];
    const result = await chat.sendMessage(lastParts);
    return result.response.text();
  }

  async *streamChat(messages: LLMMessage[], config: LLMConfig): AsyncIterable<string> {
    const genAI = new GoogleGenerativeAI(config.apiKey);

    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemText = this.getSystemText(systemMessage?.content);
    const systemInstruction: Content | undefined = systemText
      ? { role: 'user', parts: [{ text: systemText }] }
      : undefined;

    const model = genAI.getGenerativeModel({
      model: config.model,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: config.maxTokens ?? 500,
        temperature: config.temperature ?? 0.8,
      },
    });

    const history: Content[] = conversationMessages.slice(0, -1).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: this.contentToParts(m.content),
    }));

    const chat = model.startChat({ history });

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const lastParts = lastMessage ? this.contentToParts(lastMessage.content) : [{ text: '' }];
    const result = await chat.sendMessageStream(lastParts);

    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
}
