import type { W20CharacterCreationDraft } from '../characterCreation';
import { W20CharacterState } from '../types';

export function makeTestCharacter(
  overrides: Partial<W20CharacterState> = {}
): W20CharacterState {
  const base: W20CharacterState = {
    id: 'char-1',
    campaignId: 'camp-1',
    packId: 'pack-1',
    ownerDiscordId: 'user-1',
    isNpc: false,
    name: 'Kaelen Shadowclaw',
    deedName: 'Bane-Biter',
    concept: 'Ahroun Shock Trooper',
    breed: 'homid',
    auspice: 'ahroun',
    tribe: 'get_of_fenris',
    rank: 1,
    activeForm: 'homid',
    activeRealm: 'physical',
    caughtInGauntlet: false,
    inFrenzy: false,
    frenzyType: null,
    baseAttributes: {
      strength: 3,
      dexterity: 3,
      stamina: 3,
      charisma: 2,
      manipulation: 2,
      appearance: 2,
      perception: 3,
      intelligence: 2,
      wits: 3,
    },
    abilities: {
      alertness: 2,
      athletics: 2,
      brawl: 3,
      empathy: 2,
      intimidation: 2,
      primal_urge: 2,
      melee: 2,
      stealth: 2,
      survival: 2,
      occult: 2,
      rituals: 1,
    },
    specialties: [],
    backgrounds: { totem: 3, ancestors: 2 },
    meritsFlaws: [],
    rage: { permanent: 5, temporary: 5 },
    gnosis: { permanent: 3, temporary: 3 },
    willpower: { permanent: 4, temporary: 4 },
    silverCarriedItems: 0,
    renown: {
      glory: { permanent: 2, temporary: 0 },
      honor: { permanent: 1, temporary: 0 },
      wisdom: { permanent: 0, temporary: 0 },
    },
    health: {
      bonusBruisedBoxes: 0,
      boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
    },
    activeBuffs: [],
    macros: [],
    fetishes: [],
    portraitsByForm: {},
    turnLocks: {
      hasSpentRageThisTurn: false,
      hasSpentGnosisThisTurn: false,
      hasSpentWillpowerThisTurn: false,
      ignoringWoundPenaltiesThisTurn: false,
      declaredExtraRageActions: 0,
    },
    stateVersion: 1,
  };

  return {
    ...base,
    ...overrides,
    baseAttributes: {
      ...base.baseAttributes,
      ...(overrides.baseAttributes ?? {}),
    },
    abilities: {
      ...base.abilities,
      ...(overrides.abilities ?? {}),
    },
    rage: { ...base.rage, ...(overrides.rage ?? {}) },
    gnosis: { ...base.gnosis, ...(overrides.gnosis ?? {}) },
    willpower: { ...base.willpower, ...(overrides.willpower ?? {}) },
    renown: { ...base.renown, ...(overrides.renown ?? {}) },
    health: {
      ...base.health,
      ...(overrides.health ?? {}),
      boxes: overrides.health?.boxes ? [...overrides.health.boxes] : [...base.health.boxes],
    },
    turnLocks: {
      ...base.turnLocks,
      ...(overrides.turnLocks ?? {}),
    },
  };
}

export function seqRng(rolls: number[], fallback = 5): () => number {
  let idx = 0;
  return () => {
    if (idx < rolls.length) {
      return rolls[idx++];
    }
    return fallback;
  };
}

/** A draft that passes validateW20CharacterCreation with exactly 15 Freebie points spent. */
export function makeValidCreationDraft(
  overrides: Partial<W20CharacterCreationDraft> = {}
): W20CharacterCreationDraft {
  return {
    name: 'Torin Stormmane',
    concept: 'Fianna Galliard Skald',
    breed: 'homid',
    auspice: 'galliard',
    tribe: 'fianna',
    attributePriorities: { physical: 'primary', social: 'secondary', mental: 'tertiary' },
    abilityPriorities: { talents: 'primary', skills: 'secondary', knowledges: 'tertiary' },
    priorityAttributeDots: {
      strength: 3,
      dexterity: 2,
      stamina: 2, // 7
      charisma: 2,
      manipulation: 1,
      appearance: 2, // 5
      perception: 1,
      intelligence: 1,
      wits: 1, // 3
    },
    priorityAbilityDots: {
      // Talents: 13
      alertness: 3,
      athletics: 2,
      brawl: 3,
      expression: 3,
      primal_urge: 2,
      // Skills: 9
      animal_ken: 2,
      melee: 3,
      performance: 2,
      survival: 2,
      // Knowledges: 5
      enigmas: 2,
      occult: 2,
      rituals: 1,
    },
    priorityBackgroundDots: {
      ancestors: 2,
      totem: 3, // 5
    },
    startingRenown: { glory: 2, honor: 0, wisdom: 1 },
    selectedGifts: [
      { giftId: 'gift-breed-1', level: 1, slotSource: 'breed' },
      { giftId: 'gift-auspice-1', level: 1, slotSource: 'auspice' },
      { giftId: 'gift-tribe-1', level: 1, slotSource: 'tribe' },
    ],
    freebieAttributeDots: { wits: 1 }, // 5
    freebieAbilityDots: { melee: 1 }, // 2 (brings Melee to 4!)
    freebieBackgroundDots: { resources: 1 }, // 1
    freebieRageDots: 1, // 1
    freebieGnosisDots: 1, // 2
    freebieWillpowerDots: 4, // 4 (Total spent: 5+2+1+1+2+4 = 15)
    meritsAndFlaws: [],
    ...overrides,
  };
}
