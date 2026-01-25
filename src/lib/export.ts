import type { ChatMessage } from '../types';

interface ExportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function exportToJSON(messages: ChatMessage[]): string {
  const simplified: ExportMessage[] = messages.map(({ role, content }) => ({ role, content }));
  return JSON.stringify(simplified, null, 2);
}

export function exportToMarkdown(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      const speaker = msg.role === 'user' ? '**You**' : '**Assistant**';
      return `${speaker}\n\n${msg.content}`;
    })
    .join('\n\n---\n\n');
}
