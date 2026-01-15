import type { CharacterConfig } from '../../types';

export const mikuConfig: CharacterConfig = {
  id: 'hatsune-miku',
  name: 'Hatsune Miku',
  model: {
    path: '/Stylized Miku/Model/StylizedMiku.fbx',
    texture: '/Stylized Miku/Textures/StylizedMiku.png',
    emissiveMap: '/Stylized Miku/Textures/Emmission.png',
    scale: 0.5,
    position: [0, -1, 0],
  },
  accessories: [
    { id: 'leek', path: '/Stylized Miku/Model/Leek.fbx' },
    { id: 'mic', path: '/Stylized Miku/Model/Mic.fbx' },
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
