import type { Auspice } from '../types';

export type W20RankRenownRequirement =
  | { glory: number; honor: number; wisdom: number }
  | { total: number };

/** Printed permanent Renown requirements, W20 p. 251. Ragabash choose their distribution. */
export const W20_RANK_RENOWN: Readonly<Record<Auspice, readonly W20RankRenownRequirement[]>> = {
  ragabash: [{ total: 3 }, { total: 7 }, { total: 13 }, { total: 19 }, { total: 25 }],
  theurge: [
    { glory: 0, honor: 0, wisdom: 3 },
    { glory: 1, honor: 0, wisdom: 5 },
    { glory: 2, honor: 1, wisdom: 7 },
    { glory: 4, honor: 2, wisdom: 9 },
    { glory: 4, honor: 9, wisdom: 10 },
  ],
  philodox: [
    { glory: 0, honor: 3, wisdom: 0 },
    { glory: 1, honor: 4, wisdom: 1 },
    { glory: 2, honor: 6, wisdom: 2 },
    { glory: 3, honor: 8, wisdom: 4 },
    { glory: 4, honor: 10, wisdom: 9 },
  ],
  galliard: [
    { glory: 2, honor: 0, wisdom: 1 },
    { glory: 4, honor: 0, wisdom: 2 },
    { glory: 4, honor: 2, wisdom: 4 },
    { glory: 7, honor: 2, wisdom: 6 },
    { glory: 9, honor: 5, wisdom: 9 },
  ],
  ahroun: [
    { glory: 2, honor: 1, wisdom: 0 },
    { glory: 4, honor: 1, wisdom: 1 },
    { glory: 6, honor: 3, wisdom: 1 },
    { glory: 9, honor: 4, wisdom: 2 },
    { glory: 10, honor: 9, wisdom: 4 },
  ],
};

export function getW20RankRenownRequirement(
  auspice: Auspice,
  rank: number
): W20RankRenownRequirement | undefined {
  return Number.isInteger(rank) ? W20_RANK_RENOWN[auspice][rank - 1] : undefined;
}
