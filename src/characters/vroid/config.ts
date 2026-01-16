import type { CharacterConfig } from '../../types';

export const vroidConfig: CharacterConfig = {
  id: 'vroid-character',
  name: 'Emily',
  model: {
    path: '/characters/vroid_model.vrm',
    scale: 0.8,
    position: [0, -1, 0],
    // NOTE: VRM models are self-contained, so texture/emissiveMap are not needed here.
  },
  animations: {
    // These are placeholders and will be updated after we inspect the model's actual animations.
    idle: ['idle'],
    talking: ['talk'],
  },
  expressions: {
    // Placeholder expressions
    neutral: {},
    happy: {},
  },
};
