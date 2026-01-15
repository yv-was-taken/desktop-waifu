import { mikuConfig } from './miku/config';
import { mikuSystemPrompt } from './miku/prompt';
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
};

export const getCharacter = (id: string): Character | undefined => {
  return characters[id];
};

export const defaultCharacterId = 'hatsune-miku';
