import {
  computeEffectiveCharacterStats,
  computeWoundState,
  computeUserSheetStats,
  getCharacterModifierSources,
  getSheetModifierSources,
  getSourceModifierRule,
  isRuleSourceSuppressed,
  ruleTraits,
  evaluateModifierRules,
  applyRuleValue,
  lookupSheetAbilityDots,
  resolveCharacterRuleRoll,
  resolveSheetShortcut,
  resolveW20DicePool,
  rollCsprngD10,
  W20_GIFT_CATALOG,
  W20_RITE_CATALOG,
  type ActiveRuleInstance,
  type ModifierRule,
  type RuleContext,
  type RuleEffect,
  type RuleSource,
  type RuleMagnitude,
  type W20CharacterState,
  type W20RollResult,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { RoomRuleEffect, RuleClock } from '@w20-vtt/protocol';

export type RuleActor = W20UserCharacterSheet | W20CharacterState;

export function isRuleSheet(actor: RuleActor): actor is W20UserCharacterSheet {
  return 'otherTraits' in actor;
}

export function findActorRule(actor: RuleActor, sourceEntryId: string, ruleId: string) {
  const sources = isRuleSheet(actor)
    ? getSheetModifierSources(actor)
    : getCharacterModifierSources(actor);
  const activeSource = actor.activeRuleEffects?.find(
    (instance) =>
      instance.ruleId === ruleId &&
      instance.sourceId === `${actor.id}:${sourceEntryId}` &&
      instance.rule
  );
  const source =
    sources.find((entry) => entry.id === sourceEntryId) ??
    (activeSource
      ? {
          id: sourceEntryId,
          name: activeSource.sourceName ?? activeSource.rule!.name,
          dots: activeSource.dots,
          ruleId: activeSource.ruleId,
          customRule: activeSource.rule,
          ruleChoice: activeSource.ruleChoice,
          ruleChoices: activeSource.ruleChoices,
        }
      : undefined);
  if (!source) throw new Error('The selected rule source is no longer on this character.');
  if (source.carried === false) throw new Error('This item must be carried before it can be used.');
  const rule = getSourceModifierRule(source);
  if (!rule || rule.id !== ruleId)
    throw new Error('This source does not provide the selected rule.');
  const evaluation = isRuleSheet(actor)
    ? computeUserSheetStats(actor).ruleEvaluation
    : computeEffectiveCharacterStats(actor).ruleEvaluation;
  if (isRuleSourceSuppressed(source, evaluation))
    throw new Error('An active rule currently suppresses this source.');
  return { source, rule };
}

export function actorWithEffects<T extends RuleActor>(
  actor: T,
  effects: RoomRuleEffect[],
  clock: RuleClock
): T {
  const externalIds = new Set(
    effects.filter((effect) => effect.targetId === actor.id).map((effect) => effect.instance.id)
  );
  const ownEffects = (actor.activeRuleEffects ?? []).filter(
    (effect) => !externalIds.has(effect.id)
  );
  const received = effects
    .filter(
      (effect) =>
        effect.targetId === actor.id &&
        (effect.preparedAtTurn === undefined || effect.preparedAtTurn <= clock.turn)
    )
    .map((effect) => effect.instance);
  return { ...actor, activeRuleEffects: [...ownEffects, ...received] };
}

export function activationCosts(
  actor: RuleActor,
  source: RuleSource,
  rule: ModifierRule,
  spendGnosis = false,
  declared: { rage?: number; gnosis?: number; willpower?: number } = {},
  choices: Record<string, string | number> = {}
) {
  const fetish = actor.fetishes.find((item) => item.id === source.id);
  const isTalen = Boolean(fetish && (fetish.level === 0 || rule.id.startsWith('talen-')));
  if (isTalen && spendGnosis) throw new Error('A talen requires a Gnosis roll to activate.');
  if (fetish && !isTalen && fetish.isAttuned === false) {
    throw new Error('Attune to this fetish before activating it.');
  }
  const costs = {
    rage: 0,
    gnosis: 0,
    willpower: 0,
    ...(spendGnosis && rule.activation?.alternativeCost
      ? rule.activation.alternativeCost
      : rule.activation?.cost),
  };
  const variable = rule.activation?.variableCost;
  if (variable) {
    const resource =
      variable.resource === '$choices.resource' ? choices.resource : variable.resource;
    const value = Number(choices[variable.choiceKey] ?? 0);
    if (
      (resource !== 'rage' && resource !== 'gnosis' && resource !== 'willpower') ||
      !Number.isFinite(value) ||
      value < (variable.minimum ?? 0)
    )
      throw new Error('Choose the documented resource expenditure.');
    costs[resource] += value * (variable.factor ?? 1);
  }
  for (const trait of ['rage', 'gnosis', 'willpower'] as const)
    costs[trait] = Math.max(costs[trait], declared[trait] ?? 0);
  if (fetish && spendGnosis && rule.activation?.roll !== false && !rule.activation?.alternativeCost)
    costs.gnosis += 1;
  const mixedSpend =
    rule.activation?.allowRageGnosis ||
    applyRuleValue(
      evaluateModifierRules(
        isRuleSheet(actor) ? getSheetModifierSources(actor) : getCharacterModifierSources(actor),
        actor
      ),
      'spend:rage-and-gnosis-same-turn',
      0
    );
  if (costs.rage > 0 && costs.gnosis > 0 && !mixedSpend)
    throw new Error('Rage and Gnosis cannot be spent in the same turn.');
  for (const tracker of ['rage', 'gnosis', 'willpower'] as const) {
    if (actor[tracker].temporary < costs[tracker])
      throw new Error(`Insufficient temporary ${tracker}.`);
  }
  return costs;
}

export function rollRuleActivation(
  actor: RuleActor,
  source: RuleSource,
  rule: ModifierRule,
  context: RuleContext,
  spendGnosis = false,
  rngD10 = rollCsprngD10,
  options: { difficulty?: number; target?: RuleActor } = {}
): W20RollResult | null {
  const fetish = actor.fetishes.find((item) => item.id === source.id);
  if (fetish && spendGnosis) return null;
  const needsRoll = rule.activation?.roll ?? Boolean(fetish);
  if (!needsRoll) return null;

  const gift = W20_GIFT_CATALOG.find((entry) => entry.id === source.ruleId || entry.id === rule.id);
  const rite = W20_RITE_CATALOG.find((entry) => entry.id === source.ruleId || entry.id === rule.id);
  const sheetGift = isRuleSheet(actor)
    ? actor.gifts.find((entry) => entry.id === source.id)
    : undefined;
  const isAncestors = rule.id === 'ancestors' || rule.id === 'background-ancestors';
  const spec = rule.activation?.rollSpec;
  const attribute =
    spec?.attribute ??
    (fetish ? 'gnosis' : (sheetGift?.rollAttribute ?? gift?.rollAttribute ?? rite?.rollAttribute));
  const ability = spec
    ? spec.ability
    : (sheetGift?.rollAbility ?? gift?.rollAbility ?? rite?.rollAbility);
  const targetTrait =
    spec?.difficultyTrait && options.target
      ? readActorTrait(options.target, spec.difficultyTrait)
      : undefined;
  if (
    spec?.difficultyNote &&
    spec.difficulty === undefined &&
    targetTrait === undefined &&
    options.difficulty === undefined
  )
    throw new Error(`Choose the activation difficulty. ${spec.difficultyNote}`);
  const difficultyNote = spec?.difficultyNote ?? gift?.difficultyNote ?? rite?.difficultyNote;
  const printedDifficulty =
    spec?.difficulty ??
    fetish?.gnosisRating ??
    sheetGift?.difficulty ??
    gift?.defaultDifficulty ??
    rite?.difficulty;
  const declaredDifficulty =
    targetTrait === undefined && (difficultyNote || printedDifficulty === undefined)
      ? options.difficulty
      : undefined;
  const difficulty =
    targetTrait ?? declaredDifficulty ?? printedDifficulty ?? (isAncestors ? 8 : 6);
  const staticPool =
    typeof spec?.pool === 'number'
      ? spec.pool
      : spec?.pool === 'dots' || isAncestors
        ? (source.dots ?? 0)
        : spec?.pool === 'item_gnosis'
          ? (fetish?.gnosisRating ?? 0)
          : undefined;
  const pool = spec?.poolTrait ? readActorTrait(actor, spec.poolTrait) : staticPool;
  const knownTags = gift ? [`gift:${gift.slug}`, `action:${gift.slug}`, `action:${gift.id}`] : [];
  const activationContext: RuleContext = {
    ...context,
    tags: (context.tags ?? []).filter((tag) => !tag.startsWith('gift:')),
    authoritativeTags: [...knownTags, ...(context.authoritativeTags ?? [])],
  };
  const incomingContext: RuleContext = {
    ...activationContext,
    attribute: attribute ?? undefined,
    ability: ability ?? undefined,
    rollKind: 'activation',
    authoritativeTags: [...knownTags, 'target:source'],
  };
  const targetRules = options.target
    ? evaluateModifierRules(
        isRuleSheet(options.target)
          ? getSheetModifierSources(options.target)
          : getCharacterModifierSources(options.target),
        { ...options.target, ruleTraits: ruleTraits(options.target) },
        incomingContext
      )
    : { modifiers: [] };
  const defenses = targetRules.modifiers
    .filter((modifier) => modifier.target.startsWith('target:'))
    .map((modifier) => ({ ...modifier, target: modifier.target.slice(7) }));

  if (isRuleSheet(actor)) {
    const resolved = resolveSheetShortcut(
      actor,
      {
        id: `activate:${source.id}`,
        name: rule.name,
        source:
          pool !== undefined
            ? {
                kind: 'static',
                pool: spec?.poolCapTrait
                  ? Math.min(pool, readActorTrait(actor, spec.poolCapTrait) ?? pool)
                  : pool,
              }
            : { kind: 'trait_combo', attribute: attribute ?? null, ability: ability ?? null },
        difficulty,
        rageDiceCount: 0,
        applyWoundPenalty: !isAncestors && !fetish,
        isSecretRoll: false,
      },
      activationContext
    );
    const stats = computeUserSheetStats(actor);
    return resolveW20DicePool(
      {
        label: rule.name,
        basePool: Math.max(
          0,
          applyRuleValue(
            { modifiers: defenses },
            'pool',
            spec?.poolCapTrait
              ? Math.min(
                  resolved.rawPool,
                  readActorTrait(actor, spec.poolCapTrait) ?? resolved.rawPool
                )
              : resolved.rawPool
          )
        ),
        baseDifficulty: applyRuleValue({ modifiers: defenses }, 'difficulty', resolved.difficulty),
        woundPenalty: resolved.woundPenalty,
        applyWoundPenalty: resolved.applyWoundPenalty,
        hasApplicableSpecialty: resolved.hasSpecialty,
        ruleModifiers: [...resolved.modifiers, ...defenses],
      },
      rngD10
    );
  }

  const stats = computeEffectiveCharacterStats(actor);
  const attributeDots =
    attribute === 'gnosis'
      ? stats.effectiveGnosisPool
      : attribute === 'rage' || attribute === 'willpower'
        ? actor[attribute].permanent
        : attribute
          ? stats.effectiveAttributes[attribute]
          : 0;
  const resolved = resolveCharacterRuleRoll(actor, {
    ...activationContext,
    attribute: attribute ?? undefined,
    ability: ability ?? undefined,
    pool: pool ?? attributeDots + (ability ? (actor.abilities[ability] ?? 0) : 0),
    difficulty,
    woundPenalty: isAncestors || fetish ? 0 : stats.woundPenalty,
  });
  return resolveW20DicePool(
    {
      label: rule.name,
      basePool: Math.max(
        0,
        applyRuleValue(
          { modifiers: defenses },
          'pool',
          spec?.poolCapTrait
            ? Math.min(resolved.pool, readActorTrait(actor, spec.poolCapTrait) ?? resolved.pool)
            : resolved.pool
        )
      ),
      baseDifficulty: applyRuleValue({ modifiers: defenses }, 'difficulty', resolved.difficulty),
      woundPenalty: resolved.woundPenalty,
      ruleModifiers: [...resolved.modifiers, ...defenses],
    },
    rngD10
  );
}

function readActorTrait(actor: RuleActor, trait: string): number | undefined {
  const arithmetic = trait.match(/^(.+?)([+-]\d+)$/);
  if (arithmetic) {
    const base = readActorTrait(actor, arithmetic[1]!);
    return base === undefined ? undefined : base + Number(arithmetic[2]);
  }
  if (trait === 'rage' || trait === 'gnosis' || trait === 'willpower') {
    const stats = isRuleSheet(actor)
      ? computeUserSheetStats(actor)
      : computeEffectiveCharacterStats(actor);
    return trait === 'rage'
      ? stats.effectiveRagePool
      : trait === 'gnosis'
        ? stats.effectiveGnosisPool
        : stats.effectiveWillpowerPool;
  }
  if (trait in actor.baseAttributes)
    return (
      isRuleSheet(actor) ? computeUserSheetStats(actor) : computeEffectiveCharacterStats(actor)
    ).effectiveAttributes[trait as keyof typeof actor.baseAttributes];
  const background = isRuleSheet(actor)
    ? actor.backgrounds.find(
        (entry) => entry.id === trait || entry.name.toLowerCase().replace(/\s+/g, '_') === trait
      )?.dots
    : actor.backgrounds[trait];
  if (background !== undefined)
    return applyRuleValue(
      evaluateModifierRules(
        isRuleSheet(actor) ? getSheetModifierSources(actor) : getCharacterModifierSources(actor),
        actor
      ),
      `background:${trait}`,
      background
    );
  return isRuleSheet(actor) ? lookupSheetAbilityDots(actor, trait) : actor.abilities[trait];
}

/** Durations are fictional. A scene never becomes an arbitrary number of rounds. */
export function effectDuration(
  duration: string,
  successes: number,
  choiceValue?: number,
  traits: Record<string, number> = {}
) {
  const text = duration.trim().toLowerCase();
  if (text.startsWith('until') || text === 'permanent') return {};
  const factor = Number(text.match(/\*(\d+(?:\.\d+)?)/)?.[1] ?? 1);
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/)?.[1];
  const numeric = Number(text.match(/\d+(?:\.\d+)?/)?.[0] ?? (word ? words[word] : 1));
  const namedTrait = Object.keys(traits).find((trait) =>
    new RegExp(`\\b${trait.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
  );
  const quantity =
    (text.includes('success')
      ? Math.max(1, successes)
      : text.includes('choice')
        ? Math.max(1, choiceValue ?? 1)
        : namedTrait
          ? traits[namedTrait]!
          : numeric) * factor;
  if (/\bturns?\b|\brounds?\b/.test(text)) return { remainingRounds: Math.ceil(quantity) };
  if (/scene/.test(text)) return { remainingScenes: Math.ceil(quantity) };
  if (/story/.test(text)) return { remainingStories: Math.ceil(quantity) };
  if (/session/.test(text)) return { remainingSessions: Math.ceil(quantity) };
  if (/second/.test(text)) return { remainingSeconds: quantity };
  if (/minute/.test(text)) return { remainingSeconds: quantity * 60 };
  if (/hour/.test(text)) return { remainingSeconds: quantity * 3600 };
  if (/month/.test(text)) return { remainingSeconds: quantity * 30 * 86400 };
  if (/week/.test(text)) return { remainingSeconds: quantity * 7 * 86400 };
  if (/day/.test(text)) return { remainingSeconds: quantity * 86400 };
  return {};
}

export function createRoomRuleEffect(input: {
  id: string;
  actor: RuleActor;
  source: RuleSource;
  rule: ModifierRule;
  effects: RuleEffect[];
  targetId: string;
  recipient: NonNullable<RuleEffect['recipient']>;
  casterDiscordId: string;
  clockId: string;
  clock: RuleClock;
  successes: number;
  choiceValue?: number;
  ruleChoices?: Record<string, string | number>;
  sourceTraits?: Record<string, number>;
  boundTargetIds?: string[];
}): RoomRuleEffect {
  const override = input.rule.activation?.durationOverrides?.find(
    (entry) => input.ruleChoices?.[entry.choiceKey] === entry.equals
  );
  const duration =
    override?.duration ??
    input.effects[0]?.duration ??
    input.rule.activation?.duration ??
    'until-ended';
  const counters = effectDuration(duration, input.successes, input.choiceValue, input.sourceTraits);
  const instance: ActiveRuleInstance = {
    id: input.id,
    sourceId: `${input.actor.id}:${input.source.id}`,
    sourceItemId: input.source.id,
    sourceOwnerId: input.actor.id,
    sourceWorn: input.source.worn,
    sourceCarried: input.source.carried,
    sourceActive: input.source.active,
    parentGrantId: input.source.grantInstanceId,
    ruleId: input.rule.id,
    rule: {
      ...input.rule,
      effects: input.effects.map((effect) => ({
        ...effect,
        duration: override ? duration : (effect.duration ?? duration),
      })),
    },
    sourceName: input.source.name,
    dots: input.source.dots,
    ruleChoice: input.source.ruleChoice,
    successes: input.successes,
    choiceValue: input.choiceValue,
    ruleChoices: input.ruleChoices,
    sourceTraits: input.sourceTraits,
    boundTargetIds: input.boundTargetIds,
    duration,
    recipient: input.recipient,
    clockId: input.clockId,
    createdAt: Date.now(),
    ...counters,
    ...(input.rule.activation?.preparation && /turn|round/i.test(input.rule.activation.preparation)
      ? { preparationRounds: 1 }
      : {}),
    ...(input.rule.activation?.preparation && /minute|hour/i.test(input.rule.activation.preparation)
      ? {
          preparationSeconds:
            effectDuration(input.rule.activation.preparation, input.successes, input.choiceValue)
              .remainingSeconds ?? 0,
        }
      : {}),
  };
  return {
    instance,
    sourceId: input.actor.id,
    targetId: input.targetId,
    casterDiscordId: input.casterDiscordId,
    ...(input.rule.activation?.preparation && /turn|round/i.test(input.rule.activation.preparation)
      ? { preparedAtTurn: input.clock.turn + 1 }
      : {}),
  };
}

export function captureRuleTraits(
  actor: RuleActor,
  spent: { rage: number; gnosis: number; willpower: number }
): Record<string, number> {
  const stats = isRuleSheet(actor)
    ? computeUserSheetStats(actor)
    : computeEffectiveCharacterStats(actor);
  return {
    ...ruleTraits(actor),
    ...stats.ruleEvaluation.values,
    ...stats.effectiveAbilities,
    ...stats.effectiveAttributes,
    ...Object.fromEntries(
      Object.entries(stats.effectiveAttributes).map(([key, value]) => [`attribute:${key}`, value])
    ),
    ...Object.fromEntries(
      Object.entries(stats.effectiveAbilities).map(([key, value]) => [`ability:${key}`, value])
    ),
    rage: actor.rage.permanent,
    gnosis: actor.gnosis.permanent,
    willpower: actor.willpower.permanent,
    rageTemporary: actor.rage.temporary,
    gnosisTemporary: actor.gnosis.temporary,
    willpowerTemporary: actor.willpower.temporary,
    rank: actor.rank,
    sourceWoundPenalty: computeWoundState(actor.health).penalty,
    rageSpent: spent.rage,
    gnosisSpent: spent.gnosis,
    willpowerSpent: spent.willpower,
  };
}

export function validateRuleChoices(
  rule: ModifierRule,
  choices: Record<string, string | number>,
  perTarget: boolean
): void {
  for (const field of rule.choiceFields ?? []) {
    if (Boolean(field.perTarget) !== perTarget) continue;
    const value = choices[field.key];
    if (field.kind === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < (field.min ?? 0) ||
        value > (field.max ?? 100)
      )
        throw new Error(`Choose ${field.label} within its documented range.`);
    } else {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Choose ${field.label}.`);
      if (field.options && !field.options.includes(value))
        throw new Error(`Choose an available ${field.label}.`);
      if (
        field.kind === 'attribute' &&
        ![
          'strength',
          'dexterity',
          'stamina',
          'charisma',
          'manipulation',
          'appearance',
          'perception',
          'intelligence',
          'wits',
        ].includes(value)
      )
        throw new Error(`Choose a valid ${field.label}.`);
    }
  }
  if (!perTarget && rule.activation?.distinctChoices) {
    const values = rule.activation.distinctChoices.map((key) => choices[key]);
    if (new Set(values).size !== values.length)
      throw new Error('Choose different source and destination traits.');
  }
}

export function allocationLimit(
  rule: ModifierRule,
  source: RuleSource,
  successes: number,
  choices: Record<string, string | number>,
  sourceTraits: Record<string, number>
): number | undefined {
  const allocation = rule.activation?.allocation;
  if (!allocation) return undefined;
  function valueOf(value: RuleMagnitude): number {
    if (typeof value === 'number') return value;
    if (value === 'dots') return source.dots ?? 0;
    if (value === 'successes') return successes;
    const traitKey = value.trait?.replace(/\$choices\.([\w-]+)/g, (_, key: string) =>
      String(choices[key] ?? '')
    );
    let valueInput =
      value.per === 'dots'
        ? (source.dots ?? 0)
        : value.per === 'successes'
          ? successes
          : value.per === 'trait'
            ? (sourceTraits[traitKey ?? ''] ?? 0)
            : Number(choices[value.choiceKey ?? 'value'] ?? 0);
    valueInput = valueInput * (value.factor ?? 1) + (value.offset ?? 0);
    if (value.cap !== undefined) valueInput = Math.min(valueInput, value.cap);
    if (value.rounding) valueInput = Math[value.rounding](valueInput);
    return valueInput;
  }
  return Math.max(
    0,
    Math.floor(
      Math.min(
        ...(Array.isArray(allocation.limit) ? allocation.limit : [allocation.limit]).map(valueOf)
      )
    )
  );
}

export function advanceRuleEffect(
  effect: RoomRuleEffect,
  unit: 'turn' | 'scene' | 'story' | 'session' | 'seconds',
  amount: number
): RoomRuleEffect | null {
  const field = {
    turn: 'remainingRounds',
    scene: 'remainingScenes',
    story: 'remainingStories',
    session: 'remainingSessions',
    seconds: 'remainingSeconds',
  }[unit] as
    | 'remainingRounds'
    | 'remainingScenes'
    | 'remainingStories'
    | 'remainingSessions'
    | 'remainingSeconds';
  const remaining = effect.instance[field];
  if (remaining === undefined) return effect;
  if (remaining <= amount) return null;
  return { ...effect, instance: { ...effect.instance, [field]: remaining - amount } };
}
