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
  alexandra: createCharacter('alexandra', 'Alexandra', { rotation: [0, 0, 0] }),
  alice: createCharacter('alice', 'Alice', { rotation: [0, 0, 0] }),
  amanda: createCharacter('amanda', 'Amanda'),
  emily: createCharacter('emily', 'Emily'),
  grace: createCharacter('grace', 'Grace'),
  jasmine: createCharacter('jasmine', 'Jasmine', { rotation: [0, 0, 0] }),
  jessica: createCharacter('jessica', 'Jessica', { rotation: [0, 0, 0] }),
  julia: createCharacter('julia', 'Julia'),
  maria: createCharacter('maria', 'Maria', { rotation: [0, 0, 0] }),
  melissa: createCharacter('melissa', 'Melissa'),
  rose: createCharacter('rose', 'Rose'),
  sam: createCharacter('sam', 'Sam'),
  sandra: createCharacter('sandra', 'Sandra', { rotation: [0, 0, 0] }),
  sofia: createCharacter('sofia', 'Sofia'),
  victoria: createCharacter('victoria', 'Victoria', { rotation: [0, 0, 0] }),
};

export const getCharacter = (id: string): Character | undefined => {
  return characters[id];
};

export const defaultCharacterId = 'emily';
