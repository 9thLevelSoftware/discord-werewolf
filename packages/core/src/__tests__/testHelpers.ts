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
