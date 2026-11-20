import { Auspice, DamageType, MoonPhase, W20CharacterState } from './types';
import { computeEffectiveCharacterStats, getBreedNaturalForm } from './forms';
import { resolveW20DicePool, rollCsprngD10, W20RollResult } from './diceResolver';

export const MOON_BASE_FRENZY_DIFF: Record<MoonPhase, number> = {
  new: 8, // Ragabash
  crescent: 7, // Theurge
  half: 6, // Philodox
  gibbous: 5, // Galliard
  full: 4, // Ahroun
};

const SEVERITY_WEIGHT: Record<DamageType, number> = {
  aggravated: 3,
  lethal: 2,
  bashing: 1,
  none: 0,
};

/**
 * Applies W20 cascading health damage (Bashing wraps to Lethal when track is full; sorted heaviest-first).
 */
export function applyHealthDamage(
  char: W20CharacterState,
  levels: number,
  type: Exclude<DamageType, 'none'>
): W20CharacterState {
  if (levels <= 0) return char;
  const boxes = [...char.health.boxes];

  for (let i = 0; i < levels; i++) {
    const emptyIdx = boxes.findIndex((b) => b === 'none');
    if (emptyIdx !== -1) {
      boxes[emptyIdx] = type;
    } else if (type === 'bashing') {
      // Overflow Bashing upgrades existing Bashing to Lethal
      const bashingIdx = boxes.findIndex((b) => b === 'bashing');
      if (bashingIdx !== -1) boxes[bashingIdx] = 'lethal';
    } else {
      // Overflow Lethal/Aggravated upgrades lighter wounds
      const weakerIdx = boxes.findIndex((b) => SEVERITY_WEIGHT[b] < SEVERITY_WEIGHT[type]);
      if (weakerIdx !== -1) boxes[weakerIdx] = type;
    }
    boxes.sort((a, b) => SEVERITY_WEIGHT[b] - SEVERITY_WEIGHT[a]);
  }

  return {
    ...char,
    health: { ...char.health, boxes },
    stateVersion: char.stateVersion + 1,
  };
}

/**
 * Heals up to `levels` health boxes. By default heals Bashing then Lethal (never Aggravated unless
 * `healAggravated: true` or `damageType: 'aggravated'`). Keeps track sorted heaviest-first.
 */
export function healHealthDamage(
  char: W20CharacterState,
  levels: number,
  options: {
    healAggravated?: boolean;
    damageType?: Exclude<DamageType, 'none'>;
  } = {}
): W20CharacterState {
  if (levels <= 0) return char;

  const boxes = [...char.health.boxes];
  let healed = 0;

  for (let i = 0; i < levels; i++) {
    let targetIdx = -1;

    if (options.damageType) {
      targetIdx = boxes.findIndex((b) => b === options.damageType);
    } else if (options.healAggravated) {
      // Gifts like Mother's Touch heal the worst wounds (including Aggravated) first
      targetIdx = boxes.findIndex((b) => b === 'aggravated');
      if (targetIdx === -1) targetIdx = boxes.findIndex((b) => b === 'lethal');
      if (targetIdx === -1) targetIdx = boxes.findIndex((b) => b === 'bashing');
    } else {
      // Standard Garou regeneration heals Bashing first, then Lethal
      targetIdx = boxes.findIndex((b) => b === 'bashing');
      if (targetIdx === -1) targetIdx = boxes.findIndex((b) => b === 'lethal');
    }

    if (targetIdx === -1) break;
    boxes[targetIdx] = 'none';
    healed += 1;
  }

  if (healed === 0) return char;

  boxes.sort((a, b) => SEVERITY_WEIGHT[b] - SEVERITY_WEIGHT[a]);

  return {
    ...char,
    health: { ...char.health, boxes },
    stateVersion: char.stateVersion + 1,
  };
}

export interface RegenerationResult {
  updatedChar: W20CharacterState;
  rollResult: W20RollResult | null;
  healedLevels: number;
  canRegenerate: boolean;
}

/**
 * Resolves Garou regeneration:
 * - Allowed in all non-breed forms (Homid/Lupus) and in ALL 5 forms for Metis.
 * - Outside combat: automatically heals 1 Bashing/Lethal box.
 * - In combat: requires Stamina (Diff 8, ignoring wound penalties) to heal 1 Bashing/Lethal box.
 */
export function resolveCombatRegeneration(
  char: W20CharacterState,
  inCombat: boolean,
  rngD10: () => number = rollCsprngD10
): RegenerationResult {
  const isNaturalBreedForm = char.activeForm === getBreedNaturalForm(char.breed);
  const canRegenerate = char.breed === 'metis' || !isNaturalBreedForm;
  const hasRegenerableWound = char.health.boxes.some(
    (b) => b === 'bashing' || b === 'lethal'
  );

  if (!canRegenerate || !hasRegenerableWound) {
    return {
      updatedChar: char,
      rollResult: null,
      healedLevels: 0,
      canRegenerate,
    };
  }

  if (!inCombat) {
    const updatedChar = healHealthDamage(char, 1);
    return {
      updatedChar,
      rollResult: null,
      healedLevels: updatedChar === char ? 0 : 1,
      canRegenerate: true,
    };
  }

  const stats = computeEffectiveCharacterStats(char);
  const rollResult = resolveW20DicePool(
    {
      label: `${char.name}: Combat Regeneration`,
      basePool: stats.effectiveAttributes.stamina,
      applyWoundPenalty: false,
      baseDifficulty: 8,
    },
    rngD10
  );

  if (rollResult.netSuccesses > 0) {
    const updatedChar = healHealthDamage(char, 1);
    return {
      updatedChar,
      rollResult,
      healedLevels: updatedChar === char ? 0 : 1,
      canRegenerate: true,
    };
  }

  return {
    updatedChar: char,
    rollResult,
    healedLevels: 0,
    canRegenerate: true,
  };
}

export const AUSPICE_MOON_PHASE: Record<Auspice, MoonPhase> = {
  ragabash: 'new',
  theurge: 'crescent',
  philodox: 'half',
  galliard: 'gibbous',
  ahroun: 'full',
};

export interface FrenzyCheckResult {
  updatedChar: W20CharacterState;
  rollResult: W20RollResult;
  triggered: boolean;
  frenzyType: 'berserk' | 'fox' | null;
  thrallOfTheWyrm: boolean;
}

/**
 * Resolves a W20 Frenzy check (higher of permanent or temporary Rage vs Moon Phase difficulty).
 * Auspice moon phase match OR Crinos form applies a non-cumulative -1 difficulty modifier.
 * 4+ net successes triggers Frenzy (default 'berserk', or 'fox' if specified);
 * 6+ net successes triggers Thrall of the Wyrm and forces 'berserk'.
 */
export function resolveFrenzyCheck(
  char: W20CharacterState,
  moonPhase: MoonPhase,
  options: {
    difficultyMod?: number;
    preferredType?: 'berserk' | 'fox';
  } = {},
  rngD10: () => number = rollCsprngD10
): FrenzyCheckResult {
  const baseDifficulty = MOON_BASE_FRENZY_DIFF[moonPhase];
  const basePool = Math.max(char.rage.permanent, char.rage.temporary);
  const auspiciousOrCrinosMod =
    moonPhase === AUSPICE_MOON_PHASE[char.auspice] || char.activeForm === 'crinos' ? -1 : 0;
  const rollResult = resolveW20DicePool(
    {
      label: `${char.name}: Frenzy Check (${moonPhase} moon)`,
      basePool,
      applyWoundPenalty: false,
      baseDifficulty,
      difficultyModifier: (options.difficultyMod ?? 0) + auspiciousOrCrinosMod,
    },
    rngD10
  );

  const triggered = rollResult.netSuccesses >= 4;
  const thrallOfTheWyrm = rollResult.netSuccesses >= 6;
  const frenzyType = triggered
    ? thrallOfTheWyrm
      ? 'berserk'
      : (options.preferredType ?? 'berserk')
    : null;

  if (!triggered) {
    return {
      updatedChar: char,
      rollResult,
      triggered: false,
      frenzyType: null,
      thrallOfTheWyrm: false,
    };
  }

  return {
    updatedChar: {
      ...char,
      inFrenzy: true,
      frenzyType,
      stateVersion: char.stateVersion + 1,
    },
    rollResult,
    triggered: true,
    frenzyType,
    thrallOfTheWyrm,
  };
}
