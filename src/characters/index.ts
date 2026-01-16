import type { CharacterConfig } from '../types';

export interface Character {
  config: CharacterConfig;
}

// Helper to create character config with defaults
function createCharacter(id: string, name: string, overrides?: Partial<CharacterConfig['model']>): Character {
  return {
    config: {
      id,
      name,
      model: {
        path: `/characters/${id}.vrm`,
        scale: 0.8,
        position: [0, -1, 0],
        ...overrides,
      },
      animations: {
        idle: ['idle'],
        talking: ['talk'],
      },
      expressions: {
        neutral: {},
        happy: {},
      },
    },
  };
}

// All available characters
export const characters: Record<string, Character> = {
  alexandra: createCharacter('alexandra', 'Alexandra'),
  alice: createCharacter('alice', 'Alice'),
  amanda: createCharacter('amanda', 'Amanda'),
  emily: createCharacter('emily', 'Emily'),
  grace: createCharacter('grace', 'Grace'),
  jasmine: createCharacter('jasmine', 'Jasmine'),
  jessica: createCharacter('jessica', 'Jessica'),
  julia: createCharacter('julia', 'Julia'),
  maria: createCharacter('maria', 'Maria'),
  melissa: createCharacter('melissa', 'Melissa'),
  rose: createCharacter('rose', 'Rose'),
  sam: createCharacter('sam', 'Sam'),
  sandra: createCharacter('sandra', 'Sandra'),
  sofia: createCharacter('sofia', 'Sofia'),
  victoria: createCharacter('victoria', 'Victoria'),
};

export const getCharacter = (id: string): Character | undefined => {
  return characters[id];
};

export const defaultCharacterId = 'emily';
