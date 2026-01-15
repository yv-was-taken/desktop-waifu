import type { CharacterConfig } from '../../types';

export const mikuConfig: CharacterConfig = {
  id: 'hatsune-miku',
  name: 'Hatsune Miku',
  model: {
    path: '/assets/Stylized Miku/Model/StylizedMiku.fbx',
    scale: 0.5,
    position: [0, -1, 0],
  },
  accessories: [
    { id: 'leek', path: '/assets/Stylized Miku/Model/Leek.fbx' },
    { id: 'mic', path: '/assets/Stylized Miku/Model/Mic.fbx' },
  ],
  animations: {
    idle: ['Idle'],
    talking: ['Talk'],
    gestures: ['Wave', 'Nod'],
  },
  expressions: {
    neutral: {},
    happy: { smile: 1.0 },
    thinking: { eyebrowRaise: 0.5 },
    excited: { smile: 1.0, eyeWide: 0.5 },
    sad: { eyebrowFrown: 0.5 },
  },
};
