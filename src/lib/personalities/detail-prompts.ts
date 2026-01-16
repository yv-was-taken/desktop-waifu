import type { DetailLevel } from './types';

const detailPrompts: Record<DetailLevel, string> = {
  concise: `RESPONSE LENGTH:
Keep responses brief and focused. For simple questions, 2-3 sentences is often enough.
Only expand into longer explanations when the topic genuinely requires it.
Prioritize clarity and directness over comprehensiveness.`,

  balanced: `RESPONSE LENGTH:
Use your judgment to balance thoroughness with readability.
Provide enough detail to be genuinely helpful, but don't over-explain simple concepts.
Expand when complexity warrants it, be concise when it doesn't.`,

  detailed: `RESPONSE LENGTH:
Provide thorough, comprehensive responses with examples and context.
Break down complex topics into digestible parts with clear explanations.
Include relevant background information and anticipate follow-up questions.
Don't shy away from longer responses when the topic deserves deep coverage.`,
};

export function getDetailPrompt(level: DetailLevel): string {
  return detailPrompts[level];
}
