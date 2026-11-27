import type { AppliedRuleModifier } from './ruleTypes';
import { applyRuleValue } from './modifierRules';
import { SpecialtyMode } from './types';

export type RollOutcomeDegree =
  | 'botch'
  | 'failure'
  | 'marginal' // 1 net success
  | 'moderate' // 2 net successes
  | 'complete' // 3 net successes
  | 'exceptional' // 4 net successes
  | 'phenomenal'; // 5+ net successes

export interface W20RollRequest {
  label: string;
  ruleModifiers?: AppliedRuleModifier[];
  basePool: number; // e.g. Effective Attribute + Ability + Bonus Dice
  woundPenalty?: number; // Negative integer (e.g., -2); ignored on Soak/Damage rolls
  applyWoundPenalty?: boolean; // Default true; set false for Soak, Damage, Gnosis, Willpower
  baseDifficulty?: number; // Default 6
  difficultyModifier?: number; // e.g. -2 for Lupus Perception, +1 for split action
  isUntrainedSkill?: boolean; // Adds +1 difficulty in W20
  /** Player declaration before specialty modifiers. */
  hasApplicableSpecialty?: boolean;
  specialtyMode?: SpecialtyMode; // Default 'w20_double'
  spendWillpower?: boolean; // Declared pre-roll: +1 uncancelable automatic success
  bonusAutomaticSuccesses?: number; // e.g., Potence-equivalent Gifts/Totems
}

export interface DieFaceResult {
  value: number; // 1..10
  isBonusExplosionDie: boolean;
  contributedSuccesses: number; // 0, 1, or 2
  isOne: boolean;
  parentIndex?: number;
}

export interface W20PhysicalRollInput {
  base?: readonly number[];
  bonusWaves?: readonly (readonly number[])[];
}

export type TableRollMode = 'pool' | 'initiative';

export interface W20InitiativeRollRequest {
  label?: string;
  initiativeModifier: number;
}

export interface W20RollResult {
  effectivePool: number;
  clampedDifficulty: number;
  dice: DieFaceResult[];
  rawSuccesses: number;
  onesRolled: number;
  automaticSuccesses: number;
  netSuccesses: number;
  isBotch: boolean;
  outcome: RollOutcomeDegree;
  physicsSeed: string;
  rollMode?: TableRollMode;
  specialtyMode?: SpecialtyMode;
  /** Player declaration before specialty modifiers, retained for replay. */
  declaredSpecialty?: boolean;
  hasApplicableSpecialty?: boolean;
  initiativeModifier?: number;
  initiativeTotal?: number;
}

/**
 * Cryptographically unbiased d10 (1..10) using rejection sampling (byte < 250).
 */
export function rollCsprngD10(): number {
  const buf = new Uint8Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) {
      return (buf[0] % 10) + 1;
    }
  }
}

export function createPhysicsSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function classifyOutcome(netSuccesses: number, isBotch: boolean): RollOutcomeDegree {
  if (isBotch) return 'botch';
  if (netSuccesses <= 0) return 'failure';
  if (netSuccesses === 1) return 'marginal';
  if (netSuccesses === 2) return 'moderate';
  if (netSuccesses === 3) return 'complete';
  if (netSuccesses === 4) return 'exceptional';
  return 'phenomenal';
}

export function resolveW20Specialty(
  req: Pick<W20RollRequest, 'specialtyMode' | 'hasApplicableSpecialty' | 'ruleModifiers'>
): { specialtyMode: SpecialtyMode; hasApplicableSpecialty: boolean } {
  return {
    specialtyMode: req.specialtyMode ?? 'w20_double',
    hasApplicableSpecialty: Boolean(
      applyRuleValue(
        { modifiers: req.ruleModifiers ?? [] },
        'specialty',
        Number(req.hasApplicableSpecialty ?? false)
      )
    ),
  };
}

function takePhysicalFace(value: number | undefined, rngD10: () => number): number {
  return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 10
    ? value
    : rngD10();
}

export function resolveW20DicePool(
  req: W20RollRequest,
  rngD10: () => number = rollCsprngD10,
  physical?: W20PhysicalRollInput
): W20RollResult {
  const applyWounds = req.applyWoundPenalty ?? true;
  const woundMod = applyWounds ? Math.min(0, req.woundPenalty ?? 0) : 0;
  const effectivePool = Math.max(0, Math.floor(req.basePool + woundMod));

  const untrainedMod = req.isUntrainedSkill ? 1 : 0;
  const rawDiff = (req.baseDifficulty ?? 6) + (req.difficultyModifier ?? 0) + untrainedMod;
  const clampedDifficulty = Math.min(10, Math.max(2, rawDiff));

  const specialty = resolveW20Specialty(req);
  const { specialtyMode, hasApplicableSpecialty } = specialty;
  const ruleEvaluation = { modifiers: req.ruleModifiers ?? [] };
  const ruleAutomaticSuccesses = applyRuleValue(
    ruleEvaluation,
    'successes:automatic',
    applyRuleValue(ruleEvaluation, 'roll:automatic_successes', 0)
  );
  const automaticSuccesses =
    (req.spendWillpower ? 1 : 0) +
    Math.max(0, req.bonusAutomaticSuccesses ?? 0) +
    Math.max(0, ruleAutomaticSuccesses);

  // If wound penalties reduce the dice pool to 0, only pre-spent automatic successes apply
  if (effectivePool === 0) {
    return applyRuleRollResult({
      effectivePool: 0,
      clampedDifficulty,
      dice: [],
      rawSuccesses: 0,
      onesRolled: 0,
      automaticSuccesses,
      netSuccesses: automaticSuccesses,
      isBotch: false,
      outcome: classifyOutcome(automaticSuccesses, false),
      physicsSeed: createPhysicsSeed(),
      declaredSpecialty: req.hasApplicableSpecialty ?? false,
      ...specialty,
    },req.ruleModifiers);
  }

  const dice: DieFaceResult[] = [];
  let rawSuccesses = 0;
  let onesRolled = 0;
  const doubles = hasApplicableSpecialty && specialtyMode === 'w20_double';
  const explodes = hasApplicableSpecialty && specialtyMode === 'revised_explode';
  let parents: number[] = [];

  for (let i = 0; i < effectivePool; i++) {
    const val = takePhysicalFace(physical?.base?.[i], rngD10);
    const isOne = val === 1;
    let contributed = 0;

    if (val >= clampedDifficulty) {
      contributed = val === 10 && doubles ? 2 : 1;
    }

    dice.push({
      value: val,
      isBonusExplosionDie: false,
      contributedSuccesses: contributed,
      isOne,
    });

    rawSuccesses += contributed;
    if (isOne) onesRolled += 1;
    if (val === 10 && explodes) parents.push(i);
  }

  for (let wave = 0; parents.length > 0; wave++) {
    const nextParents: number[] = [];
    for (const [index, parentIndex] of parents.entries()) {
      const value = takePhysicalFace(physical?.bonusWaves?.[wave]?.[index], rngD10);
      const contributedSuccesses = value >= clampedDifficulty ? 1 : 0;
      if (value === 10) nextParents.push(dice.length);
      dice.push({
        value,
        isBonusExplosionDie: true,
        contributedSuccesses,
        isOne: false, // Revised bonus dice never cancel successes.
        parentIndex,
      });
      rawSuccesses += contributedSuccesses;
    }
    parents = nextParents;
  }

  // Canonical W20 Botch test checks rawSuccesses BEFORE 1s cancel them
  const isBotch = rawSuccesses === 0 && onesRolled >= 1 && automaticSuccesses === 0;
  const netRolledSuccesses = Math.max(0, rawSuccesses - onesRolled);
  const netSuccesses = automaticSuccesses + netRolledSuccesses;

  return applyRuleRollResult({
    effectivePool,
    clampedDifficulty,
    dice,
    rawSuccesses,
    onesRolled,
    automaticSuccesses,
    netSuccesses,
    isBotch,
    outcome: classifyOutcome(netSuccesses, isBotch),
    physicsSeed: createPhysicsSeed(),
    rollMode: 'pool',
    declaredSpecialty: req.hasApplicableSpecialty ?? false,
    ...specialty,
  },req.ruleModifiers);
}

/**
 * Resolves a canonical W20 Initiative roll (1d10 + Dexterity + Wits + Wound Penalty).
 * Face values of 1 never botch or cancel, and 10s never double.
 */
export function resolveW20InitiativeRoll(
  req: W20InitiativeRollRequest,
  rngD10: () => number = rollCsprngD10
): W20RollResult {
  const rawDie = rngD10();
  const dieVal = Number.isFinite(rawDie) ? Math.max(1, Math.min(10, Math.round(rawDie))) : 1;
  const initiativeModifier = Number.isFinite(req.initiativeModifier)
    ? Math.trunc(req.initiativeModifier)
    : 0;
  const initiativeTotal = dieVal + initiativeModifier;

  return {
    effectivePool: 1,
    clampedDifficulty: 6,
    dice: [
      {
        value: dieVal,
        isBonusExplosionDie: false,
        contributedSuccesses: 0,
        isOne: false,
      },
    ],
    rawSuccesses: 0,
    onesRolled: 0,
    automaticSuccesses: 0,
    netSuccesses: initiativeTotal,
    isBotch: false,
    outcome: 'marginal',
    physicsSeed: createPhysicsSeed(),
    rollMode: 'initiative',
    initiativeModifier,
    initiativeTotal,
  };
}

/**
 * Validates the W20 Golden Rule: Rage and Gnosis cannot be spent in the same turn.
 */
export function validateResourceSpend(
  locks: { hasSpentRageThisTurn: boolean; hasSpentGnosisThisTurn: boolean },
  resource: 'rage' | 'gnosis'
): { allowed: boolean; reason?: string } {
  if (resource === 'rage' && locks.hasSpentGnosisThisTurn) {
    return {
      allowed: false,
      reason: 'Cannot spend Rage in the same turn after spending Gnosis.',
    };
  }
  if (resource === 'gnosis' && locks.hasSpentRageThisTurn) {
    return {
      allowed: false,
      reason: 'Cannot spend Gnosis in the same turn after spending Rage.',
    };
  }
  return { allowed: true };
}

export function applyRuleRollResult(
  result: W20RollResult,
  modifiers: AppliedRuleModifier[] = []
): W20RollResult {
  if (!modifiers.length || result.rollMode === 'initiative') return result;
  const evaluation = { modifiers };
  const automaticOnes = Math.max(0, applyRuleValue(evaluation, 'dice:automatic-ones', 0));
  const negatedOnes = Math.max(0, applyRuleValue(evaluation, 'botch:negate_dice', 0));
  const onesRolled = Math.max(0, result.onesRolled + automaticOnes - negatedOnes);
  let netSuccesses = result.automaticSuccesses + Math.max(0, result.rawSuccesses - onesRolled);
  netSuccesses = applyRuleValue(evaluation, 'successes:opposed', netSuccesses);
  netSuccesses = applyRuleValue(evaluation, 'damage:success_multiplier', netSuccesses);
  netSuccesses = Math.max(netSuccesses, applyRuleValue(evaluation, 'soak:minimum-successes', 0));
  netSuccesses = applyRuleValue(evaluation, 'successes:cap', netSuccesses);
  const failure = Boolean(
    applyRuleValue(evaluation, 'roll:automatic_failure', 0) ||
      applyRuleValue(evaluation, 'outcome:failure', 0)
  );
  const success = Boolean(
    applyRuleValue(evaluation, 'outcome:success', 0) ||
      applyRuleValue(evaluation, 'attack:automatic_hit', 0)
  );
  if (success) netSuccesses = Math.max(1, netSuccesses);
  if (failure) netSuccesses = 0;
  netSuccesses = Math.max(0, Math.floor(netSuccesses));
  const isBotch =
    !failure &&
    !success &&
    result.rawSuccesses === 0 &&
    onesRolled > 0 &&
    result.automaticSuccesses === 0;
  return {
    ...result,
    onesRolled,
    netSuccesses,
    isBotch,
    outcome: classifyOutcome(netSuccesses, isBotch),
  };
}
