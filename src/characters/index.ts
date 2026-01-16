import { mikuConfig } from './miku/config';
import { mikuSystemPrompt } from './miku/prompt';
import { vroidConfig } from './vroid/config';
import { vroidPrompt } from './vroid/prompt';
import type { CharacterConfig } from '../types';

export interface Character {
  config: CharacterConfig;
  systemPrompt: string;
}

export const characters: Record<string, Character> = {
  'hatsune-miku': {
    config: mikuConfig,
    systemPrompt: mikuSystemPrompt,
  },
  'vroid-character': {
    config: vroidConfig,
    systemPrompt: vroidPrompt,
  },
};

export const getCharacter = (id: string): Character | undefined => {
  return characters[id];
};

export const defaultCharacterId = 'vroid-character';
