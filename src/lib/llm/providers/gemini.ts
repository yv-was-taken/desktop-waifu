import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import type { LLMProvider } from './base';
import type { LLMMessage, LLMConfig } from '../../../types';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  async chat(messages: LLMMessage[], config: LLMConfig): Promise<string> {
    const genAI = new GoogleGenerativeAI(config.apiKey);

    // Get system message and conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build system instruction as Content type
    const systemInstruction: Content | undefined = systemMessage?.content
      ? { role: 'user', parts: [{ text: systemMessage.content }] }
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
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const result = await chat.sendMessage(lastMessage?.content ?? '');
    return result.response.text();
  }

  async *streamChat(messages: LLMMessage[], config: LLMConfig): AsyncIterable<string> {
    const genAI = new GoogleGenerativeAI(config.apiKey);

    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const systemInstruction: Content | undefined = systemMessage?.content
      ? { role: 'user', parts: [{ text: systemMessage.content }] }
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
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage?.content ?? '');

    for await (const chunk of result.stream) {
      yield chunk.text();
    }
  }
}
