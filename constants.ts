import { Keyword } from './types';

export const DEFAULT_KEYWORDS: Keyword[] = [
  {
    id: 'seed-1',
    text: 'AI',
    aliases: ['artificial intelligence'],
    frequencyMinutes: 360,
    enabled: true
  },
  {
    id: 'seed-2',
    text: 'Gold',
    aliases: ['XAU', 'gold price'],
    frequencyMinutes: 360,
    enabled: true
  }
];
