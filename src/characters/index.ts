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
// Note: jessica, sam, victoria VRMs are natively oriented facing +Z (camera), so they need rotation [0, 0, 0]
// Other models (emily, grace, rose) are oriented facing -Z, so they use the default Math.PI rotation
export const characters: Record<string, Character> = {
  emily: createCharacter('emily', 'Emily'),
  grace: createCharacter('grace', 'Grace'),
  jessica: createCharacter('jessica', 'Jessica', { rotation: [0, 0, 0] }),
  rose: createCharacter('rose', 'Rose'),
  sam: createCharacter('sam', 'Sam', { rotation: [0, 0, 0] }),
  victoria: createCharacter('victoria', 'Victoria', { rotation: [0, 0, 0], scale: 0.775 }),
};

export const getCharacter = (id: string): Character | undefined => {
  return characters[id];
};

export const defaultCharacterId = 'emily';
