import { basePrompt, getCommandExecutionPrompt } from './base-prompt';
import { getDetailPrompt } from './detail-prompts';
import { naiveGirlfriend } from './definitions/naive-girlfriend';
import { smartGirlfriend } from './definitions/smart-girlfriend';
import { friend } from './definitions/friend';
import { tutor } from './definitions/tutor';
import { lifeCoach } from './definitions/life-coach';
import { creativePartner } from './definitions/creative-partner';
import { assistant } from './definitions/assistant';
import type { Personality, PersonalityId, PersonalitySettings } from './types';
import type { SystemInfo } from '../../types';

export const personalities: Record<PersonalityId, Personality> = {
  'naive-girlfriend': naiveGirlfriend,
  'smart-girlfriend': smartGirlfriend,
  friend: friend,
  tutor: tutor,
  'life-coach': lifeCoach,
  'creative-partner': creativePartner,
  assistant: assistant,
};

export function buildSystemPrompt(settings: PersonalitySettings, systemInfo: SystemInfo | null = null): string {
  const personality = personalities[settings.selectedPersonality];

  let prompt = basePrompt;

  // Add detail level instructions
  prompt += '\n\n' + getDetailPrompt(settings.detailLevel);

  // Add personality traits
  prompt += '\n\nPERSONALITY:\n' + personality.traits;
  prompt += '\n\nSPEECH STYLE:\n' + personality.speechStyle;

  // Add subject expertise for Assistant mode
  if (personality.requiresSubject) {
    const subjectName =
      settings.customSubject ||
      personality.predefinedSubjects?.find(
        (s) => s.id === settings.assistantSubject
      )?.name;

    if (subjectName) {
      prompt +=
        `\n\nSUBJECT EXPERTISE:\n` +
        `You are an expert in ${subjectName}. Apply your deep knowledge of this field ` +
        `to provide accurate, insightful responses. Use appropriate domain terminology ` +
        `and reference relevant concepts, best practices, and current developments in the field.`;
    }
  }

  // Add command execution capabilities with system context
  prompt += '\n\n' + getCommandExecutionPrompt(systemInfo);

  return prompt;
}

export { personalities as personalityList };
export type { Personality, PersonalityId, PersonalitySettings } from './types';
