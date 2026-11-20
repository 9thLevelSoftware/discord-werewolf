export type XpSpendCategory =
  | 'attribute'
  | 'ability'
  | 'in_tribe_gift'
  | 'out_of_tribe_gift'
  | 'rage'
  | 'gnosis'
  | 'willpower';

/**
 * Canonical W20 Experience Cost Calculator:
 * - Attribute: Current Rating x 4
 * - Ability: New dot (0 -> 1) = 3 XP, otherwise Current Rating x 2
 * - Gift (Breed / Auspice / Tribe): Gift Level x 3
 * - Gift (Outside Breed / Auspice / Tribe): Gift Level x 5
 * - Rage: Current Rating x 1
 * - Gnosis: Current Rating x 2
 * - Willpower: Current Rating x 1
 */
export function calculateW20XpCost(
  category: XpSpendCategory,
  currentRatingOrGiftLevel: number
): number {
  if (!Number.isInteger(currentRatingOrGiftLevel) || currentRatingOrGiftLevel < 0) {
    throw new Error('currentRatingOrGiftLevel must be a non-negative integer.');
  }

  switch (category) {
    case 'attribute':
      return currentRatingOrGiftLevel * 4;
    case 'ability':
      return currentRatingOrGiftLevel === 0 ? 3 : currentRatingOrGiftLevel * 2;
    case 'in_tribe_gift':
      if (currentRatingOrGiftLevel < 1) {
        throw new Error('Gift level must be at least 1.');
      }
      return currentRatingOrGiftLevel * 3;
    case 'out_of_tribe_gift':
      if (currentRatingOrGiftLevel < 1) {
        throw new Error('Gift level must be at least 1.');
      }
      return currentRatingOrGiftLevel * 5;
    case 'rage':
    case 'willpower':
      return currentRatingOrGiftLevel * 1;
    case 'gnosis':
      return currentRatingOrGiftLevel * 2;
  }
}
