import { resolveIncomingRuleDamage } from './ruleActions';
import type { RuleContext } from './ruleTypes';
import { applyRuleValue } from './modifierRules';
import { Auspice, DamageType, HealthState, MoonPhase, W20CharacterState } from './types';
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
export function applyHealthStateDamage(
  health: HealthState,
  levels: number,
  type: Exclude<DamageType, 'none'>
): HealthState {
  if (levels <= 0) return health;
  const boxes = [...health.boxes];
  for (let index = 0; index < levels; index++) {
    const empty = boxes.indexOf('none');
    if (empty !== -1) boxes[empty] = type;
    else if (type === 'bashing') {
      const bashing = boxes.indexOf('bashing');
      if (bashing !== -1) boxes[bashing] = 'lethal';
    } else {
      const weaker = boxes.findIndex((box) => SEVERITY_WEIGHT[box] < SEVERITY_WEIGHT[type]);
      if (weaker !== -1) boxes[weaker] = type;
    }
    boxes.sort((left, right) => SEVERITY_WEIGHT[right] - SEVERITY_WEIGHT[left]);
  }
  return { ...health, boxes };
}
export function healHealthStateDamage(health: HealthState, levels: number, options: {healAggravated?:boolean;damageType?:Exclude<DamageType,'none'>} = {}): HealthState {
  if (levels <= 0) return health;
  const boxes = [...health.boxes];
  let healed = 0;
  const order: DamageType[] = options.damageType
    ? [options.damageType]
    : options.healAggravated
      ? ['aggravated', 'lethal', 'bashing']
      : ['bashing', 'lethal'];
  for (let index = 0; index < levels; index++) {
    const type = order.find((candidate) => boxes.includes(candidate));
    if (!type) break;
    boxes[boxes.indexOf(type)] = 'none';
    healed++;
  }
  if (!healed) return health;
  boxes.sort((left,right) => SEVERITY_WEIGHT[right] - SEVERITY_WEIGHT[left]);
  return {...health,boxes};
}
export function applyHealthDamage(char: W20CharacterState, levels: number, type: Exclude<DamageType,'none'>, context: RuleContext & {isSilver?:boolean;ordinaryType?:Exclude<DamageType,'none'>} = {}): W20CharacterState {
  const incoming = resolveIncomingRuleDamage(char,levels,type,context);
  levels = incoming.levels;
  type = incoming.type;
  if (levels <= 0) return char;
  const derived = computeEffectiveCharacterStats(char);
  const health = applyHealthStateDamage(derived.health,levels,type);
  const grantedBonus = Math.max(0,applyRuleValue(derived.ruleEvaluation,'health:bruised',0) + applyRuleValue(derived.ruleEvaluation,'health:temporary',0));
  const inheritedBonus = Math.max(0,char.health.bonusBruisedBoxes - (char.ruleHealthBonus ?? grantedBonus));
  const ruleHealthBonus = derived.health.bonusBruisedBoxes - inheritedBonus;
  return {...char,health,ruleHealthBonus,stateVersion:char.stateVersion + 1};
}
export function healHealthDamage(char: W20CharacterState, levels: number, options: {healAggravated?:boolean;damageType?:Exclude<DamageType,'none'>} = {}): W20CharacterState {
  if (levels <= 0) return char;
  const derived = computeEffectiveCharacterStats(char);
  const health = healHealthStateDamage(derived.health,levels,options);
  if (health === derived.health) return char;
  const grantedBonus = Math.max(0,applyRuleValue(derived.ruleEvaluation,'health:bruised',0) + applyRuleValue(derived.ruleEvaluation,'health:temporary',0));
  const inheritedBonus = Math.max(0,char.health.bonusBruisedBoxes - (char.ruleHealthBonus ?? grantedBonus));
  const ruleHealthBonus = derived.health.bonusBruisedBoxes - inheritedBonus;
  return {...char,health,ruleHealthBonus,stateVersion:char.stateVersion + 1};
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
  const regenerationRules = computeEffectiveCharacterStats(char).ruleEvaluation;
  const canRegenerate = Boolean(
    applyRuleValue(
      regenerationRules,
      'regeneration',
      applyRuleValue(
        regenerationRules,
        'healing:regeneration',
        Number(char.breed === 'metis' || !isNaturalBreedForm)
      )
    )
  );
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

  if (!inCombat || applyRuleValue(regenerationRules, 'healing:combat-regeneration', 0)) {
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
      basePool: applyRuleValue(stats.ruleEvaluation, 'pool', stats.effectiveAttributes.stamina),
      ruleModifiers: stats.ruleEvaluation.modifiers,
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
