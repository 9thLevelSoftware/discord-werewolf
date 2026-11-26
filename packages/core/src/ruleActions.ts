import type { W20CharacterState, GarouForm, DamageType } from './types';
import type { W20UserCharacterSheet } from './userCharacterSheet';
import type { AppliedRuleModifier, RuleContext } from './ruleTypes';
import type { W20RollResult } from './diceResolver';
import { computeEffectiveCharacterStats, getBreedNaturalForm, W20_FORM_MATRIX } from './forms';
import { computeUserSheetStats } from './userCharacterSheet';
import {
  applyRuleValue,
  evaluateModifierRules,
  getCharacterModifierSources,
  getSheetModifierSources,
  ruleTraits,
} from './modifierRules';

type Actor = W20CharacterState | W20UserCharacterSheet;
function actorRules(actor: Actor, context: RuleContext) {
  const sources =
    'otherTraits' in actor ? getSheetModifierSources(actor) : getCharacterModifierSources(actor);
  return evaluateModifierRules(sources, { ...actor, ruleTraits: ruleTraits(actor) }, context);
}

/** Apply movement rules to the movement distance used by the caller, in its own units. */
export function resolveRuleMovement(
  actor: Actor,
  distances: { walk: number; run: number; jump?: number; flight?: number },
  context: RuleContext = {}
) {
  const rules = actorRules(actor, context);
  const all = (value: number) => applyRuleValue(rules, 'movement:all', value);
  return {
    walk: Math.max(0, all(applyRuleValue(rules, 'movement:walk', distances.walk))),
    run: Math.max(0, all(applyRuleValue(rules, 'movement:run', distances.run))),
    jump:
      distances.jump === undefined
        ? undefined
        : Math.max(0, all(applyRuleValue(rules, 'movement:jump', distances.jump))),
    flight: applyRuleValue(rules, 'movement:flight', 0) ? (distances.flight ?? distances.run) : 0,
    bonusYardsPerTurn: applyRuleValue(rules, 'movement:yards-per-turn', 0),
    modifiers: rules.modifiers,
  };
}

export interface RuleShiftRequest extends RuleContext {
  targetForm: GarouForm;
  method: 'roll_primal_urge' | 'instant_rage_spend';
  partial?: boolean;
  baseDifficulty?: number;
}
export function resolveRuleShift(actor: Actor, request: RuleShiftRequest) {
  const tags = [
    ...(request.tags ?? []),
    'action:shapeshift',
    'action:shift_form',
    'task:shapeshift',
    `target-form:${request.targetForm}`,
  ];
  if (request.partial) tags.push('action:partial_transformation', 'task:partial-transformation');
  if (request.targetForm === getBreedNaturalForm(actor.breed)) tags.push('target:breed_form');
  let context: RuleContext = {
    ...request,
    attribute: request.partial ? 'dexterity' : 'stamina',
    ability: 'primal_urge',
    tags,
    authoritativeTags: tags.filter((tag) =>
      ['target:breed_form', 'target:forced_form', 'shift:suppressed'].includes(tag)
    ),
  };
  const preliminary = actorRules(actor, context);
  const forced = preliminary.modifiers
    .find(
      (modifier) =>
        modifier.target.startsWith('shift:forced_form:') && modifier.operation === 'allow'
    )
    ?.target.slice('shift:forced_form:'.length);
  if (forced === request.targetForm) tags.push('target:forced_form');
  if (applyRuleValue(preliminary, 'shift:forced', 1) === 0) tags.push('shift:suppressed');
  context = {
    ...context,
    tags,
    authoritativeTags: tags.filter((tag) =>
      ['target:breed_form', 'target:forced_form', 'shift:suppressed'].includes(tag)
    ),
  };
  const stats =
    'otherTraits' in actor
      ? computeUserSheetStats(actor, context)
      : computeEffectiveCharacterStats(actor, context);
  const rules = stats.ruleEvaluation;
  const denied =
    rules.modifiers.some(
      (modifier) => modifier.target === 'source:supernatural' && modifier.operation === 'deny'
    ) ||
    applyRuleValue(rules, 'shift', 1) === 0 ||
    (request.partial && applyRuleValue(rules, 'shift:partial', 1) === 0);
  const natural = request.targetForm === getBreedNaturalForm(actor.breed) && !request.partial;
  const rageCost =
    natural || request.method !== 'instant_rage_spend'
      ? 0
      : Math.max(0, applyRuleValue(rules, 'shift:rage_cost', 1));
  const willpowerCost = request.partial
    ? Math.max(0, applyRuleValue(rules, 'cost:partial-shift-willpower', 1))
    : 0;
  return {
    allowed: !denied,
    reason: denied ? 'An active rule prevents this transformation.' : undefined,
    pool: Math.max(
      0,
      Math.floor(
        applyRuleValue(
          rules,
          'pool',
          stats.effectiveAttributes[request.partial ? 'dexterity' : 'stamina'] +
            (stats.effectiveAbilities.primal_urge ?? 0)
        )
      )
    ),
    difficulty: Math.max(
      2,
      Math.min(
        10,
        applyRuleValue(
          rules,
          'difficulty',
          request.baseDifficulty ??
            (request.partial ? 9 : W20_FORM_MATRIX[request.targetForm].shiftDifficulty)
        )
      )
    ),
    automaticSuccesses: natural
      ? 1
      : Math.max(0, applyRuleValue(rules, 'shift:automatic_successes', 0)),
    rageCost,
    willpowerCost,
    requiresRoll: !natural && applyRuleValue(rules, 'shift:roll_required', 1) !== 0,
    forcedForm: forced,
    woundPenalty: stats.woundPenalty,
    modifiers: rules.modifiers,
    pending: rules.pending,
  };
}

/** Follow-up actions are explicit so resource refunds and limited rerolls can be persisted once. */
export function getRuleResultTriggers(
  result: W20RollResult,
  modifiers: AppliedRuleModifier[],
  options: { spentWillpower?: boolean } = {}
) {
  const evaluation = { modifiers };
  const refund = applyRuleValue(evaluation, 'willpower:refund_on_additional_success', 0);
  return {
    refundWillpower: Boolean(
      options.spentWillpower &&
        result.clampedDifficulty >= 6 &&
        refund &&
        result.netSuccesses > result.automaticSuccesses
    ),
    rerollsAvailable: Math.max(
      0,
      Math.floor(
        applyRuleValue(
          evaluation,
          'reroll:story_limit',
          applyRuleValue(evaluation, 'roll:rerolls', 0)
        )
      )
    ),
    rerollScope: applyRuleValue(
      evaluation,
      'reroll:story_limit',
      applyRuleValue(evaluation, 'roll:rerolls', 0)
    )
      ? 'story'
      : undefined,
    perResultRerollLimit: Math.max(0, applyRuleValue(evaluation, 'reroll:per_result_limit', 1)),
    canReroll: result.netSuccesses === 0 && applyRuleValue(evaluation, 'reroll:story_limit', 0) > 0,
  };
}

/** W20 p. 269 movement, with the p. 254 wound restrictions applied after modifiers. */
export function computeActorMovement(
  actor: Actor,
  options: { allFours?: boolean; context?: RuleContext } = {}
) {
  const stats =
    'otherTraits' in actor
      ? computeUserSheetStats(actor, options.context)
      : computeEffectiveCharacterStats(actor, options.context);
  const dexterity = stats.effectiveAttributes.dexterity;
  const formMultiplier = actor.activeForm === 'lupus' ? 2 : actor.activeForm === 'hispo' ? 1.5 : 1;
  const crinosBonus = actor.activeForm === 'crinos' && options.allFours ? 2 : 0;
  const hispoStats =
    actor.activeForm === 'hispo'
      ? stats
      : 'otherTraits' in actor
        ? computeUserSheetStats({ ...actor, activeForm: 'hispo' }, options.context)
        : computeEffectiveCharacterStats({ ...actor, activeForm: 'hispo' }, options.context);
  const hispoRun = Math.max(
    0,
    applyRuleValue(
      hispoStats.ruleEvaluation,
      'movement:all',
      applyRuleValue(
        hispoStats.ruleEvaluation,
        'movement:run',
        (20 + 3 * hispoStats.effectiveAttributes.dexterity) * 1.5
      )
    )
  );
  const sources =
    'otherTraits' in actor ? getSheetModifierSources(actor) : getCharacterModifierSources(actor);
  const rules = evaluateModifierRules(
    sources,
    { ...actor, ruleTraits: { ...ruleTraits(actor), 'movement:hispo-run': hispoRun } },
    options.context
  );
  const specialDefinitions = [
    ['movement:flight-mph', 'Flight', 'mph'],
    ['movement:air-mph', 'Air running', 'mph'],
    ['movement:jump-feet', 'Jump', 'feet'],
    ['movement:tunnel-yards-per-turn', 'Tunneling', 'yards/turn'],
    ['movement:swim', 'Swimming', 'yards/turn'],
  ];
  const special = specialDefinitions
    .filter(([target]) => rules.modifiers.some((modifier) => modifier.target === target))
    .map(([target, label, unit]) => ({
      label,
      value: Math.max(0, applyRuleValue(rules, target, 0)),
      unit,
    }));
  if (applyRuleValue(rules, 'movement:flight', 0))
    special.push({
      label: 'Flight',
      value: Math.max(0, (20 + 3 * dexterity) * formMultiplier),
      unit: 'yards/turn',
    });
  const distance = (target: string, base: number) =>
    Math.max(
      0,
      applyRuleValue(
        rules,
        'movement:all',
        applyRuleValue(rules, target, (base + crinosBonus) * formMultiplier)
      ) + applyRuleValue(rules, 'movement:yards-per-turn', 0)
    );
  let walk = distance('movement:walk', 7);
  let jog = distance('movement:jog', 12 + dexterity);
  let run = distance('movement:run', 20 + 3 * dexterity);
  const woundLabel = stats.woundLabel.replace(/\s*\([^)]*\)\s*$/, '');
  if (woundLabel === 'Injured') run /= 2;
  if (woundLabel === 'Wounded') {
    jog = walk;
    run = walk;
  }
  const cap = stats.isIncapacitated
    ? 0
    : woundLabel === 'Crippled'
      ? 1
      : woundLabel === 'Mauled'
        ? 3
        : undefined;
  if (cap !== undefined) {
    walk = Math.min(walk, cap);
    jog = Math.min(jog, cap);
    run = Math.min(run, cap);
  }
  return {
    walk,
    jog,
    run,
    special,
    units: 'yards/turn' as const,
    canMoveAndAttack: !['Wounded', 'Mauled', 'Crippled', 'Incapacitated'].includes(woundLabel),
    modifiers: rules.modifiers,
  };
}

export function resolveRuleDamageType(
  base: Exclude<DamageType, 'none'>,
  modifiers: AppliedRuleModifier[]
): Exclude<DamageType, 'none'> {
  const evaluation = { modifiers };
  if (applyRuleValue(evaluation, 'damage:type:bashing', 0)) return 'bashing';
  if (applyRuleValue(evaluation, 'damage:type:aggravated', 0)) return 'aggravated';
  if (applyRuleValue(evaluation, 'damage:type:lethal', 0)) return 'lethal';
  return base;
}
export function resolveIncomingRuleDamage(
  actor: Actor,
  levels: number,
  type: Exclude<DamageType, 'none'>,
  context: RuleContext & { isSilver?: boolean; ordinaryType?: Exclude<DamageType, 'none'> } = {}
) {
  const tags = [
    ...(context.tags ?? []),
    `damage:${type}`,
    context.isSilver ? 'damage:silver' : 'damage:non-silver',
  ];
  if (
    tags.some((tag) => ['damage:natural-fire', 'damage:artificial-or-magical-fire'].includes(tag))
  )
    tags.push('damage:fire');
  const rules = actorRules(actor, { ...context, rollKind: 'incoming-damage', tags });
  const incomingTags = new Set([...tags, ...(actor.ruleContextTags ?? [])]);
  const immune = rules.modifiers.some(
    (modifier) => modifier.operation === 'ignore' && incomingTags.has(modifier.target)
  );
  let damageType = resolveRuleDamageType(type, rules.modifiers);
  if (
    context.isSilver &&
    rules.modifiers.some(
      (modifier) =>
        modifier.target === 'damage:silver-aggravated' && modifier.operation === 'ignore'
    )
  )
    damageType = context.ordinaryType ?? 'lethal';
  let wounds = Math.max(0, Math.floor(levels));
  if (incomingTags.has('damage:artificial-or-magical-fire'))
    wounds = Math.min(
      wounds,
      applyRuleValue(rules, 'damage:artificial-or-magical-fire-per-turn', wounds)
    );
  return { levels: immune ? 0 : wounds, type: damageType, modifiers: rules.modifiers };
}
