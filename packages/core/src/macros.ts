import {
  applyRuleValue,
  getCharacterModifierSources,
  isRuleSourceSuppressed,
} from './modifierRules';
import {
  ActiveCharacterBuff,
  MacroDifficultySource,
  MacroEffectPayload,
  MacroPoolSource,
  W20CharacterState,
  W20MacroDefinition,
} from './types';
import { computeEffectiveCharacterStats } from './forms';
import {
  resolveW20DicePool,
  rollCsprngD10,
  validateResourceSpend,
  W20RollResult,
} from './diceResolver';
import { healHealthDamage } from './frenzyAndRegen';

export type {
  ActiveCharacterBuff,
  MacroDifficultySource,
  MacroEffectPayload,
  MacroPoolSource,
  W20MacroDefinition,
};

export type CanonicalMacroPresetKey =
  | 'razor_claws'
  | 'lunas_armor'
  | 'sense_wyrm'
  | 'grand_klaive'
  | 'spirit_of_the_fray'
  | 'mothers_touch';

export const CANONICAL_W20_PRESETS: Record<CanonicalMacroPresetKey, W20MacroDefinition> = {
  razor_claws: {
    id: 'razor_claws',
    name: 'Razor Claws (Ahroun 1)',
    category: 'gift',
    rankOrLevel: 1,
    requiredForms: ['crinos', 'hispo', 'lupus'],
    costs: { rage: 1, gnosis: 0, willpower: 0 },
    pool: { kind: 'no_roll_instant' },
    difficulty: { kind: 'static', value: 6 },
    effects: [{ type: 'buff_claw_damage', bonusDice: 2, durationRounds: 10 }],
    summary: 'Spend 1 Rage: hone claws for +2 Aggravated damage dice for the scene.',
  },
  lunas_armor: {
    id: 'lunas_armor',
    name: "Luna's Armor (Children of Gaia / Black Furies 2)",
    category: 'gift',
    rankOrLevel: 2,
    costs: { rage: 0, gnosis: 1, willpower: 0 },
    pool: { kind: 'attribute_ability', attribute: 'stamina', ability: 'survival' },
    difficulty: { kind: 'static', value: 6 },
    effects: [{ type: 'buff_soak_per_success', maxCap: 5, durationRounds: 10 }],
    summary: 'Spend 1 Gnosis & roll Stamina + Survival (Diff 6): +1 Soak die per success.',
  },
  sense_wyrm: {
    id: 'sense_wyrm',
    name: 'Sense Wyrm (Metis / Theurge 1)',
    category: 'gift',
    rankOrLevel: 1,
    costs: { rage: 0, gnosis: 0, willpower: 0 },
    pool: { kind: 'attribute_ability', attribute: 'perception', ability: 'occult' },
    difficulty: { kind: 'static', value: 6 },
    effects: [{ type: 'storyteller_secret_whisper', promptTemplate: 'Detect nearby Wyrm aura' }],
    summary: 'Roll Perception + Occult (Diff 6) to sense Wyrm taint within proximity.',
  },
  grand_klaive: {
    id: 'grand_klaive',
    name: 'Attuned Grand Klaive (Fetish 5)',
    category: 'fetish',
    rankOrLevel: 5,
    requiredForms: ['glabro', 'crinos'],
    costs: { rage: 0, gnosis: 0, willpower: 0 },
    pool: { kind: 'fetish_gnosis_rating', rating: 7 },
    difficulty: { kind: 'static', value: 6 },
    effects: [{ type: 'weapon_strike', damageBonus: 3, damageType: 'aggravated', isSilver: true }],
    summary: 'Activate War-Spirit inside silver Grand Klaive (Str + 3 Aggravated + Silver).',
  },
  spirit_of_the_fray: {
    id: 'spirit_of_the_fray',
    name: 'Spirit of the Fray (Ahroun 1)',
    category: 'gift',
    rankOrLevel: 1,
    costs: { rage: 0, gnosis: 1, willpower: 0 },
    pool: { kind: 'no_roll_instant' },
    difficulty: { kind: 'static', value: 6 },
    effects: [{ type: 'buff_initiative_flat', bonus: 10, durationRounds: 1 }],
    summary: 'Passive +10 Initiative; spend 1 Gnosis for an additional +10 Initiative this turn.',
  },
  mothers_touch: {
    id: 'mothers_touch',
    name: "Mother's Touch (Theurge 1)",
    category: 'gift',
    rankOrLevel: 1,
    costs: { rage: 0, gnosis: 1, willpower: 0 },
    pool: { kind: 'attribute_ability', attribute: 'intelligence', ability: 'empathy' },
    difficulty: { kind: 'target_trait', trait: 'rage' },
    effects: [{ type: 'heal_wounds', levels: 1, healAggravated: true }],
    summary:
      'Spend 1 Gnosis & roll Intelligence + Empathy (Diff target Rage): heal 1 wound (including Aggravated) per success.',
  },
};

export interface MacroExecutionResult {
  updatedCaster: W20CharacterState;
  updatedTarget?: W20CharacterState;
  rollResult: W20RollResult | null;
  grantedBuffs: ActiveCharacterBuff[];
}

function isTimedBuffEffect(
  effect: MacroEffectPayload
): effect is Extract<
  MacroEffectPayload,
  { type: 'buff_claw_damage' | 'buff_soak_per_success' | 'buff_initiative_flat' }
> {
  return (
    effect.type === 'buff_claw_damage' ||
    effect.type === 'buff_soak_per_success' ||
    effect.type === 'buff_initiative_flat'
  );
}

/**
 * Authoritative Server Macro Executor (runs inside GameRoomDO).
 */
export function executeW20Macro(
  caster: W20CharacterState,
  macro: W20MacroDefinition,
  envContext: {
    localGauntlet: number;
    targetCharacter?: W20CharacterState;
    spendWillpowerOnRoll?: boolean;
    overrideBasePool?: number;
  },
  rngD10: () => number = rollCsprngD10
): MacroExecutionResult {
  const source = getCharacterModifierSources(caster).find((entry) => entry.id === macro.id);
  const sourceEvaluation = computeEffectiveCharacterStats(caster).ruleEvaluation;
  if (
    sourceEvaluation.modifiers.some(
      (modifier) => modifier.target === 'source:supernatural' && modifier.operation === 'deny'
    ) ||
    (source && isRuleSourceSuppressed(source, sourceEvaluation))
  )
    throw new Error('An active rule suppresses this supernatural power.');
  // 1. Check Form Prerequisite
  if (macro.requiredForms?.length && !macro.requiredForms.includes(caster.activeForm)) {
    throw new Error(
      `${macro.name} requires one of: ${macro.requiredForms.join(', ')} (currently ${caster.activeForm}).`
    );
  }

  // 2. Enforce W20 Rage/Gnosis Turn Lock & Costs
  if (macro.costs.rage > 0 && macro.costs.gnosis > 0) {
    throw new Error('Invalid macro: W20 forbids spending Rage and Gnosis on the same action.');
  }
  if (macro.costs.rage > 0) {
    const check = validateResourceSpend(caster.turnLocks, 'rage');
    if (!check.allowed) throw new Error(check.reason);
    if (caster.rage.temporary < macro.costs.rage) {
      throw new Error('Insufficient temporary Rage.');
    }
  }
  if (macro.costs.gnosis > 0) {
    const check = validateResourceSpend(caster.turnLocks, 'gnosis');
    if (!check.allowed) throw new Error(check.reason);
    if (caster.gnosis.temporary < macro.costs.gnosis) {
      throw new Error('Insufficient temporary Gnosis.');
    }
  }

  const totalWpCost = macro.costs.willpower + (envContext.spendWillpowerOnRoll ? 1 : 0);
  if (caster.willpower.temporary < totalWpCost) {
    throw new Error('Insufficient temporary Willpower.');
  }

  // 3. Resolve Target Difficulty before mutating caster state
  let resolvedDiff = 6;
  if (macro.difficulty.kind === 'static') {
    resolvedDiff = macro.difficulty.value;
  } else if (macro.difficulty.kind === 'local_gauntlet') {
    resolvedDiff = envContext.localGauntlet + (macro.difficulty.modifier ?? 0);
  } else if (macro.difficulty.kind === 'target_trait') {
    const target = envContext.targetCharacter;
    if (!target) throw new Error(`${macro.name} requires selecting a target token.`);
    const targetStats = computeEffectiveCharacterStats(target);
    if (macro.difficulty.trait === 'willpower') {
      resolvedDiff = target.willpower.permanent;
    } else if (macro.difficulty.trait === 'rage') {
      resolvedDiff = target.rage.permanent > 0 ? target.rage.permanent : 6;
    } else if (macro.difficulty.trait === 'gnosis') {
      resolvedDiff = target.gnosis.permanent > 0 ? target.gnosis.permanent : 6;
    } else {
      resolvedDiff = targetStats.effectiveAttributes.stamina + 3;
    }
  }

  // 4. Deduct Resources & Update Turn Locks
  let updatedCaster: W20CharacterState = {
    ...caster,
    rage: { ...caster.rage, temporary: caster.rage.temporary - macro.costs.rage },
    gnosis: { ...caster.gnosis, temporary: caster.gnosis.temporary - macro.costs.gnosis },
    willpower: { ...caster.willpower, temporary: caster.willpower.temporary - totalWpCost },
    turnLocks: {
      ...caster.turnLocks,
      hasSpentRageThisTurn: caster.turnLocks.hasSpentRageThisTurn || macro.costs.rage > 0,
      hasSpentGnosisThisTurn: caster.turnLocks.hasSpentGnosisThisTurn || macro.costs.gnosis > 0,
      hasSpentWillpowerThisTurn: caster.turnLocks.hasSpentWillpowerThisTurn || totalWpCost > 0,
    },
    stateVersion: caster.stateVersion + 1,
  };

  // 5. Execute Pool Roll (unless instant spend Gift like Razor Claws / Spirit of the Fray)
  const macroContext =
    macro.pool.kind === 'attribute_ability'
      ? { attribute: macro.pool.attribute, ability: macro.pool.ability, tags: [`gift:${macro.id}`] }
      : { tags: [`gift:${macro.id}`] };
  const stats = computeEffectiveCharacterStats(updatedCaster, macroContext);
  let rollResult: W20RollResult | null = null;

  if (macro.pool.kind !== 'no_roll_instant') {
    let basePool = 0;
    let applyWounds = true;

    if (envContext.overrideBasePool !== undefined) {
      applyWounds = false;
      basePool = envContext.overrideBasePool;
    } else if (macro.pool.kind === 'attribute_ability') {
      const attr = stats.effectiveAttributes[macro.pool.attribute];
      const abil = macro.pool.ability ? (stats.effectiveAbilities[macro.pool.ability] ?? 0) : 0;
      basePool = attr + abil;
    } else if (macro.pool.kind === 'permanent_trait') {
      applyWounds = false; // W20: Pure Rage/Gnosis/Willpower rolls ignore wound penalties
      basePool =
        macro.pool.trait === 'gnosis'
          ? stats.effectiveGnosisPool
          : updatedCaster[macro.pool.trait].permanent;
    } else if (macro.pool.kind === 'fetish_gnosis_rating') {
      applyWounds = false;
      basePool = macro.pool.rating;
    }

    rollResult = resolveW20DicePool(
      {
        label: `${updatedCaster.name}: ${macro.name}`,
        basePool: envContext.overrideBasePool !== undefined ? basePool : applyRuleValue(stats.ruleEvaluation,'pool',basePool),
        ruleModifiers:stats.ruleEvaluation.modifiers,
        woundPenalty: stats.woundPenalty,
        applyWoundPenalty: applyWounds,
        baseDifficulty: applyRuleValue(stats.ruleEvaluation,'difficulty',resolvedDiff),
        spendWillpower: envContext.spendWillpowerOnRoll,
      },
      rngD10
    );
  }

  const succeeded = macro.pool.kind === 'no_roll_instant' || (rollResult?.netSuccesses ?? 0) > 0;
  const grantedBuffs: ActiveCharacterBuff[] = succeeded
    ? macro.effects.map((eff) => ({
        sourceMacroId: macro.id,
        label: macro.name,
        effect: eff,
        appliedSuccesses: rollResult?.netSuccesses ?? 1,
        remainingRounds: 'durationRounds' in eff ? eff.durationRounds : 1,
      }))
    : [];

  // Persist duration-based combat/sheet buffs on caster
  const timedBuffs = grantedBuffs.filter((b) => isTimedBuffEffect(b.effect));
  if (timedBuffs.length > 0) {
    const retained = updatedCaster.activeBuffs.filter((b) => b.sourceMacroId !== macro.id);
    updatedCaster = {
      ...updatedCaster,
      activeBuffs: [...retained, ...timedBuffs],
    };
  }

  // Apply healing effects if present and macro succeeded
  let updatedTarget: W20CharacterState | undefined = envContext.targetCharacter;
  if (succeeded) {
    for (const eff of macro.effects) {
      if (eff.type !== 'heal_wounds') continue;
      const successes = rollResult?.netSuccesses ?? 1;
      const healLevels = eff.levels * successes;
      if (updatedTarget) {
        if (updatedTarget.id === updatedCaster.id) {
          updatedCaster = healHealthDamage(updatedCaster, healLevels, {
            healAggravated: eff.healAggravated,
          });
          updatedTarget = updatedCaster;
        } else {
          updatedTarget = healHealthDamage(updatedTarget, healLevels, {
            healAggravated: eff.healAggravated,
          });
        }
      } else {
        updatedCaster = healHealthDamage(updatedCaster, healLevels, {
          healAggravated: eff.healAggravated,
        });
      }
    }
  }

  return {
    updatedCaster,
    ...(updatedTarget !== undefined ? { updatedTarget } : {}),
    rollResult,
    grantedBuffs,
  };
}
