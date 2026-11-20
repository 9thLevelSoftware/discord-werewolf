import {
  BaseAttributes,
  Breed,
  DamageType,
  GarouForm,
  HealthState,
  W20CharacterState,
} from './types';

export interface FormModifierSpec {
  deltas: Partial<BaseAttributes>;
  overrideAppearanceZero: boolean;
  shiftDifficulty: number;
  incitesDelirium: boolean;
  perceptionDifficultyMod: number;
  hasClaws: boolean;
  hasFangs: boolean;
  bonusBiteDamageDice: number;
}

export const W20_FORM_MATRIX: Record<GarouForm, FormModifierSpec> = {
  homid: {
    deltas: {},
    overrideAppearanceZero: false,
    shiftDifficulty: 6,
    incitesDelirium: false,
    perceptionDifficultyMod: 0,
    hasClaws: false,
    hasFangs: false,
    bonusBiteDamageDice: 0,
  },
  glabro: {
    deltas: { strength: 2, stamina: 2, manipulation: -2, appearance: -1 },
    overrideAppearanceZero: false,
    shiftDifficulty: 7,
    incitesDelirium: false,
    perceptionDifficultyMod: 0,
    hasClaws: false,
    hasFangs: false,
    bonusBiteDamageDice: 0,
  },
  crinos: {
    deltas: { strength: 4, dexterity: 1, stamina: 3, manipulation: -3 },
    overrideAppearanceZero: true,
    shiftDifficulty: 6,
    incitesDelirium: true,
    perceptionDifficultyMod: 0,
    hasClaws: true,
    hasFangs: true,
    bonusBiteDamageDice: 0,
  },
  hispo: {
    deltas: { strength: 3, dexterity: 2, stamina: 3, manipulation: -3 },
    overrideAppearanceZero: false,
    shiftDifficulty: 7,
    incitesDelirium: false,
    perceptionDifficultyMod: -1,
    hasClaws: false,
    hasFangs: true,
    bonusBiteDamageDice: 1, // Canonical W20 +1 die to Bite damage in Hispo
  },
  lupus: {
    deltas: { strength: 1, dexterity: 2, stamina: 2, manipulation: -3 },
    overrideAppearanceZero: false,
    shiftDifficulty: 6,
    incitesDelirium: false,
    perceptionDifficultyMod: -2, // Canonical W20 -2 Perception difficulty
    hasClaws: false,
    hasFangs: true,
    bonusBiteDamageDice: 0,
  },
};

export interface NaturalAttackProfile {
  name: 'Unarmed Punch' | 'Claws' | 'Bite';
  accuracyDiff: number;
  damageDicePool: number;
  damageType: Exclude<DamageType, 'none'>;
}

export interface ComputedCharacterStats {
  effectiveAttributes: BaseAttributes;
  effectiveGnosisPool: number;
  woundPenalty: number; // 0, -1, -2, or -5
  isIncapacitated: boolean;
  woundLabel: string;
  perceptionDifficultyMod: number;
  /** Total derived Initiative modifier: effective Dex + Wits + effective woundPenalty + flat initiative buffs */
  initiativeBonus: number;
  soakCapabilities: {
    soakPool: number;
    canSoakBashing: boolean;
    canSoakLethal: boolean;
    canSoakAggravated: boolean;
    canSoakSilver: boolean;
  };
  naturalAttacks: NaturalAttackProfile[];
}

const BASE_WOUND_PENALTIES = [0, -1, -1, -2, -2, -5, -99] as const;
const BASE_WOUND_LABELS = [
  'Bruised (-0)',
  'Hurt (-1)',
  'Injured (-1)',
  'Wounded (-2)',
  'Mauled (-2)',
  'Crippled (-5)',
  'Incapacitated',
] as const;

export function getBreedNaturalForm(breed: Breed): GarouForm {
  if (breed === 'homid') return 'homid';
  if (breed === 'lupus') return 'lupus';
  return 'crinos'; // Metis natural breed form is Crinos
}

export function computeWoundState(health: HealthState): {
  penalty: number;
  isIncapacitated: boolean;
  woundLabel: string;
} {
  const bonusCount = Math.max(0, health.bonusBruisedBoxes);
  const ladder: number[] = [
    ...Array<number>(bonusCount).fill(0),
    ...BASE_WOUND_PENALTIES,
  ];
  const labels: string[] = [
    ...Array<string>(bonusCount).fill('Bruised (-0)'),
    ...BASE_WOUND_LABELS,
  ];

  let deepestFilledIndex = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (health.boxes[i] && health.boxes[i] !== 'none') {
      deepestFilledIndex = i;
    }
  }

  if (deepestFilledIndex === -1) {
    return { penalty: 0, isIncapacitated: false, woundLabel: 'Healthy' };
  }
  if (deepestFilledIndex >= ladder.length - 1) {
    return { penalty: 0, isIncapacitated: true, woundLabel: 'Incapacitated' };
  }
  return {
    penalty: ladder[deepestFilledIndex],
    isIncapacitated: false,
    woundLabel: labels[deepestFilledIndex],
  };
}

export function computeEffectiveCharacterStats(
  char: W20CharacterState
): ComputedCharacterStats {
  const spec = W20_FORM_MATRIX[char.activeForm];
  const base = char.baseAttributes;

  const effectiveAttributes: BaseAttributes = {
    strength: Math.max(1, base.strength + (spec.deltas.strength ?? 0)),
    dexterity: Math.max(1, base.dexterity + (spec.deltas.dexterity ?? 0)),
    stamina: Math.max(1, base.stamina + (spec.deltas.stamina ?? 0)),
    charisma: base.charisma,
    manipulation: Math.max(0, base.manipulation + (spec.deltas.manipulation ?? 0)),
    appearance: spec.overrideAppearanceZero
      ? 0
      : Math.max(0, base.appearance + (spec.deltas.appearance ?? 0)),
    perception: base.perception,
    intelligence: base.intelligence,
    wits: base.wits,
  };

  const rawWound = computeWoundState(char.health);
  const ignoreWounds = char.inFrenzy || char.turnLocks.ignoringWoundPenaltiesThisTurn;
  const effectiveWoundPenalty = ignoreWounds ? 0 : rawWound.penalty;

  let clawDamageBuff = 0;
  let soakPerSuccessBuff = 0;
  let initiativeFlatBuff = 0;

  for (const buff of char.activeBuffs) {
    if (buff.remainingRounds <= 0) continue;
    if (buff.effect.type === 'buff_claw_damage') {
      clawDamageBuff += buff.effect.bonusDice;
    } else if (buff.effect.type === 'buff_soak_per_success') {
      const cap = buff.effect.maxCap ?? Number.POSITIVE_INFINITY;
      soakPerSuccessBuff += Math.max(0, Math.min(cap, buff.appliedSuccesses));
    } else if (buff.effect.type === 'buff_initiative_flat') {
      initiativeFlatBuff += buff.effect.bonus;
    }
  }

  const naturalBreedForm = getBreedNaturalForm(char.breed);
  const isBreedForm = char.activeForm === naturalBreedForm;
  const isHumanForm = char.activeForm === 'homid';

  const naturalAttacks: NaturalAttackProfile[] = [];
  if (spec.hasClaws) {
    naturalAttacks.push({
      name: 'Claws',
      accuracyDiff: 6,
      damageDicePool: Math.max(1, effectiveAttributes.strength + 2 + clawDamageBuff),
      damageType: 'aggravated',
    });
  }
  if (spec.hasFangs) {
    naturalAttacks.push({
      name: 'Bite',
      accuracyDiff: 5,
      damageDicePool: effectiveAttributes.strength + 1 + spec.bonusBiteDamageDice,
      damageType: 'aggravated',
    });
  }
  if (!spec.hasClaws && !spec.hasFangs) {
    naturalAttacks.push({
      name: 'Unarmed Punch',
      accuracyDiff: 6,
      damageDicePool: effectiveAttributes.strength,
      damageType: 'bashing',
    });
  }

  return {
    effectiveAttributes,
    effectiveGnosisPool: Math.max(0, char.gnosis.permanent - Math.max(0, char.silverCarriedItems)),
    woundPenalty: effectiveWoundPenalty,
    isIncapacitated: rawWound.isIncapacitated,
    woundLabel: rawWound.woundLabel,
    perceptionDifficultyMod: spec.perceptionDifficultyMod,
    initiativeBonus:
      effectiveAttributes.dexterity +
      effectiveAttributes.wits +
      effectiveWoundPenalty +
      initiativeFlatBuff,
    soakCapabilities: {
      soakPool: effectiveAttributes.stamina + soakPerSuccessBuff,
      canSoakBashing: true,
      // Homid form only soaks Bashing natively; all non-Homid forms soak Lethal & Aggravated
      canSoakLethal: !isHumanForm,
      canSoakAggravated: !isHumanForm,
      // Homid/Lupus soak silver ONLY in breed form; Metis cannot soak silver in any form
      canSoakSilver: char.breed !== 'metis' && isBreedForm,
    },
    naturalAttacks,
  };
}
