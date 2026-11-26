import { getCampaignGiftSources, getSharedGiftSources, isRuleInstanceActive } from './sharedGifts';
import type { W20CharacterState, HealthState } from './types';
import type { W20UserCharacterSheet } from './userCharacterSheet';
import type {
  AppliedRuleModifier,
  EvaluatedRules,
  ModifierRule,
  RuleCharacterInput,
  RuleContext,
  RuleEffect,
  RuleMagnitude,
  RuleSource,
} from './ruleTypes';
import { ITEM_MODIFIER_RULES } from './catalog/itemModifierRules';
import { GIFT_MODIFIER_RULES } from './catalog/giftModifierRules';
import { computeWoundState } from './forms';
import { W20_MERITS_FLAWS_CATALOG } from './catalog/meritsFlaws.data';

const supernaturalTraitIds = new Set(
  W20_MERITS_FLAWS_CATALOG.filter((entry) => entry.category === 'supernatural').map(
    (entry) => entry.id
  )
);

const allRules = { ...ITEM_MODIFIER_RULES, ...GIFT_MODIFIER_RULES };
const normalizedName = (name: string) =>
  name
    .replace(/\s*\((merit|flaw)\)\s*$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const ruleCategory = (rule: ModifierRule): string => {
  if (GIFT_MODIFIER_RULES[rule.id]) return 'gift';
  const prefix = rule.id.split('-')[0];
  if (['merit', 'flaw', 'fetish', 'talen', 'rite', 'totem'].includes(prefix)) return prefix;
  if (prefix === 'equipment') return 'equipment';
  return 'background';
};
const names = new Map<string, ModifierRule[]>();
for (const rule of Object.values(allRules)) {
  const aliases = new Set([
    normalizedName(rule.name),
    normalizedName(rule.name.replace(/\s*\([^)]*\)\s*$/, '')),
  ]);
  for (const key of aliases) names.set(key, [...(names.get(key) ?? []), rule]);
}
export function resolveModifierRule(id: string): ModifierRule | undefined {
  return allRules[id];
}
export function getSourceModifierRule(source: RuleSource): ModifierRule | undefined {
  if (source.customRule) return source.customRule;
  if (source.ruleId) return resolveModifierRule(source.ruleId);
  const exact = resolveModifierRule(source.id);
  if (exact) return exact;
  if (!source.kind || source.kind === 'other') return undefined;
  const normalized = normalizedName(source.name.replace(/\s*\([^)]*\)\s*$/, ''));
  const candidates = names.get(normalized) ?? [];
  const matching = candidates.filter((rule) => {
    const category = ruleCategory(rule);
    return (
      source.kind === category ||
      (source.kind === 'fetish' && category === 'talen') ||
      (['weapon', 'armor', 'equipment'].includes(source.kind!) && category === 'equipment')
    );
  });
  return matching.length === 1 ? matching[0] : undefined;
}
export function getSheetModifierSources(sheet: W20UserCharacterSheet): RuleSource[] {
  return [
    ...(sheet.equipment ?? []).map((item) => ({ ...item, kind: 'equipment' })),
    ...(sheet.packTotem
      ? [{ ...sheet.packTotemRule, id: 'pack-totem', name: sheet.packTotem.trim(), kind: 'totem' }]
      : []),
    ...sheet.otherTraits.map((item) => ({
      ...item,
      kind:
        item.kind ??
        (/\(Merit\)$/i.test(item.name) ? 'merit' : /\(Flaw\)$/i.test(item.name) ? 'flaw' : 'other'),
    })),
    ...sheet.backgrounds.map((item) => ({ ...item, kind: 'background' })),
    ...sheet.gifts.map((item) => ({ ...item, kind: 'gift' })),
    ...getSharedGiftSources(sheet),
    ...sheet.rites.map((item) => ({ ...item, kind: 'rite' })),
    ...sheet.fetishes.map((item) => ({ ...item, dots: item.level, kind: 'fetish' })),
    ...sheet.combatWeapons.map((item) => ({ ...item, kind: 'weapon' })),
    {
      ...sheet.armor,
      id: 'armor',
      kind: 'armor',
      name: sheet.armor.description || 'Armor',
      worn: sheet.armor.worn !== false,
    },
  ].map((source) => ({ ...source, ruleId: source.ruleId ?? getSourceModifierRule(source)?.id }));
}
export function getCharacterModifierSources(char: W20CharacterState): RuleSource[] {
  return [
    ...(char.equipment ?? []).map((item) => ({ ...item, kind: 'equipment' })),
    ...(char.packTotem
      ? [{ ...char.packTotemRule, id: 'pack-totem', name: char.packTotem.trim(), kind: 'totem' }]
      : []),
    ...char.meritsFlaws.map((item) => ({ ...item, dots: item.pointValue })),
    ...Object.entries(char.backgrounds).map(([id, dots]) => ({
      id,
      name: id,
      dots,
      kind: 'background',
    })),
    ...char.fetishes.map((item) => ({ ...item, dots: item.level, kind: 'fetish' })),
    ...getCampaignGiftSources(char),
    ...getSharedGiftSources(char),
  ];
}
export function ruleTraits(
  actor: W20CharacterState | W20UserCharacterSheet
): Record<string, number> {
  return {
    ...actor.abilities,
    ...Object.fromEntries(
      Object.entries(actor.abilities).map(([key, value]) => [`ability:${key}`, value ?? 0])
    ),
    ...actor.baseAttributes,
    rank: actor.rank,
    wounds: actor.health.boxes.filter((box) => box !== 'none').length,
    sourceWoundPenalty: computeWoundState(actor.health).penalty,
    woundPenalty: computeWoundState(actor.health).penalty,
    rage: actor.rage.permanent,
    gnosis: actor.gnosis.permanent,
    willpower: actor.willpower.permanent,
    glory: actor.renown.glory.permanent,
    honor: actor.renown.honor.permanent,
    wisdom: actor.renown.wisdom.permanent,
  };
}
/** A sheet keeps its editable equipment profile after selecting a book preset. */
function profileEffect(source: RuleSource, rule: ModifierRule, effect: RuleEffect): RuleEffect {
  if (source.customRule || !rule.id.startsWith('equipment-')) return effect;
  if (
    source.kind === 'weapon' &&
    source.damageDice !== undefined &&
    source.damageMode &&
    ['weapon:strength_damage_bonus', 'weapon:flat_damage'].includes(effect.target)
  ) {
    return {
      ...effect,
      target: source.damageMode === 'flat' ? 'weapon:flat_damage' : 'weapon:strength_damage_bonus',
      value: source.damageDice,
    };
  }
  if (source.kind === 'armor' && effect.target === 'armor:rating' && source.rating !== undefined) {
    return { ...effect, value: source.rating };
  }
  if (
    source.kind === 'armor' &&
    effect.target === 'difficulty' &&
    source.dexterityDifficultyPenalty !== undefined
  ) {
    return { ...effect, value: source.dexterityDifficultyPenalty };
  }
  return effect;
}

function magnitude(
  value: RuleMagnitude,
  source: RuleSource,
  actor: RuleCharacterInput,
  successes = 0,
  choiceValue?: number,
  choices?: Record<string, string | number>
): number {
  if (typeof value === 'number') return value;
  if (value === 'dots') return source.dots ?? 0;
  if (value === 'successes') return successes;
  const input =
    value.per === 'dots'
      ? (source.dots ?? 0)
      : value.per === 'successes'
        ? successes
        : value.per === 'trait'
          ? (actor.ruleTraits?.[value.trait ?? ''] ?? 0)
          : value.choiceKey
            ? Number(choices?.[value.choiceKey])
            : (choiceValue ?? Number(source.ruleChoice ?? 0));
  let result = input * (value.factor ?? 1) + (value.offset ?? 0);
  if (value.cap !== undefined) result = Math.min(result, value.cap);
  if (value.rounding) result = Math[value.rounding](result);
  return Number.isFinite(result) ? result : 0;
}
export function evaluateModifierRules(
  sources: RuleSource[],
  actor: RuleCharacterInput,
  context: RuleContext = {}
): EvaluatedRules {
  const modifiers: AppliedRuleModifier[] = [];
  const pending: EvaluatedRules['pending'] = [];
  const forbiddenTagPrefixes = [
    'attribute:',
    'ability:',
    'form:',
    'item:',
    'item-id:',
    'gear:',
    'event:',
    'source:',
    'choice:',
    'variant:',
  ];
  const fixedRolls = new Set([
    'roll:attack',
    'roll:damage',
    'roll:soak',
    'roll:initiative',
    'roll:social',
    'roll:rage',
    'roll:gnosis',
    'roll:willpower',
    'roll:defense',
    'roll:difficulty_6_or_more',
    'roll:wound-sensitive',
    'weapon:natural',
    'weapon:hand-to-hand',
    'weapon:ranged',
    'weapon:manufactured',
  ]);
  const safeTags = [...(actor.ruleContextTags ?? []), ...(context.tags ?? [])].filter(
    (tag) =>
      !forbiddenTagPrefixes.some((prefix) => tag.startsWith(prefix)) &&
      !fixedRolls.has(tag) &&
      ![
        'target:breed_form',
        'target:forced_form',
        'shift:suppressed',
        'target:studied',
        'target:identified-weakest',
        'target:source',
      ].includes(tag)
  );
  const sharedTags = new Set([
    ...safeTags,
    ...(context.authoritativeTags ?? []),
    `form:${actor.activeForm}`,
  ]);
  for (const source of sources) {
    const id = getSourceModifierRule(source)?.id;
    if (id === 'flaw-bad-sight' || id === 'flaw-blind' || id === 'flaw-one-eye')
      sharedTags.add('sense:impaired:sight');
    if (id === 'flaw-hard-of-hearing' || id === 'flaw-deaf')
      sharedTags.add('sense:impaired:hearing');
    if (id === 'flaw-anosmia') {
      sharedTags.add('sense:impaired:smell');
      sharedTags.add('sense:impaired:taste');
    }
  }
  if (context.attribute) sharedTags.add(`attribute:${context.attribute}`);
  if (context.attribute && ['strength', 'dexterity', 'stamina'].includes(context.attribute))
    sharedTags.add('attribute:physical');
  if (context.attribute && ['perception', 'intelligence', 'wits'].includes(context.attribute))
    sharedTags.add('attribute:mental');
  if (context.attribute && ['charisma', 'manipulation', 'appearance'].includes(context.attribute))
    sharedTags.add('attribute:social');
  if (context.ability) {
    sharedTags.add(`ability:${context.ability}`);
    if (context.ability === 'archery' && (actor.ruleTraits?.['ability:archery'] ?? 0) === 0)
      sharedTags.add('ability:untrained_archery');
    if (
      [
        'academics',
        'computer',
        'enigmas',
        'investigation',
        'law',
        'medicine',
        'occult',
        'rituals',
        'science',
        'technology',
      ].includes(context.ability) &&
      (actor.ruleTraits?.[`ability:${context.ability}`] ?? 0) === 0
    )
      sharedTags.add('ability:untrained_knowledge');
  }
  const selectedItem = sources.find(
    (source) => source.id === context.selectedItemId && source.carried !== false
  );
  if (selectedItem) {
    sharedTags.add(`item-id:${selectedItem.id}`);
    if (['firearms', 'archery'].includes(selectedItem.rollAbility ?? ''))
      sharedTags.add('weapon:ranged');
    if (selectedItem.rollAbility === 'melee' || context.ability === 'melee')
      sharedTags.add('weapon:hand-to-hand');
    if (['weapon', 'equipment'].includes(selectedItem.kind ?? ''))
      sharedTags.add('weapon:manufactured');
  }
  if (context.ability === 'brawl') {
    sharedTags.add('weapon:natural');
    sharedTags.add('weapon:hand-to-hand');
  }
  if (context.rollKind) sharedTags.add(`roll:${context.rollKind}`);
  if (context.maneuver) {
    sharedTags.add(`move:${context.maneuver}`);
    sharedTags.add('weapon:natural');
    sharedTags.add('weapon:hand-to-hand');
  }
  if (context.attribute && ['charisma', 'manipulation', 'appearance'].includes(context.attribute)) {
    sharedTags.add('roll:social');
  }
  if (context.attribute && ['rage', 'gnosis', 'willpower'].includes(context.attribute)) {
    sharedTags.add(`roll:${context.attribute}`);
  }
  const receivedRules = new Map<string, RuleSource>();
  for (const instance of actor.activeRuleEffects ?? []) {
    if (!instance.rule || (instance.parentGrantId && !actor.activeRuleEffects?.some(grant => grant.id === instance.parentGrantId && grant.grantedGift && isRuleInstanceActive(grant)))) continue;
    const owned = sources.find(
      (source) =>
        source.id === instance.sourceId ||
        (instance.sourceOwnerId !== undefined &&
          instance.sourceOwnerId === actor.id &&
          source.id === instance.sourceItemId)
    );
    const ownedRule =
      owned && owned.id === instance.sourceId ? getSourceModifierRule(owned) : undefined;
    const key = `${instance.sourceId}:${instance.ruleId}`;
    const existing = receivedRules.get(key);
    const combinedEffects = [
      ...(existing?.customRule?.effects ?? ownedRule?.effects ?? []),
      ...instance.rule.effects,
    ];
    const effects = [
      ...new Map(combinedEffects.map((effect) => [JSON.stringify(effect), effect])).values(),
    ];
    receivedRules.set(key, {
      ...owned,
      id: instance.sourceId,
      itemId: instance.sourceItemId ?? owned?.itemId,
      ownerId: instance.sourceOwnerId ?? owned?.ownerId,
      worn: owned?.worn ?? instance.sourceWorn,
      carried: owned?.carried ?? instance.sourceCarried,
      active: owned?.active ?? instance.sourceActive,
      name: instance.sourceName ?? instance.rule.name,
      dots: instance.dots,
      ruleId: instance.ruleId,
      customRule: { ...instance.rule, effects },
    });
  }
  const received = [...receivedRules.values()];
  const uniqueSources = [
    ...new Map(
      [...sources, ...received].map((source) => [
        `${source.id}:${source.ruleId ?? source.customRule?.id ?? ''}`,
        source,
      ])
    ).values(),
  ];
  const stacking = new Map<string, number>();
  const hardPrefixes = [
    'attribute:',
    'ability:',
    'form:',
    'move:',
    'item:',
    'item-id:',
    'gear:',
    'source:',
    'choice:',
    'variant:',
  ];
  const knownRolls = new Set([
    'attack',
    'damage',
    'soak',
    'initiative',
    'social',
    'rage',
    'gnosis',
    'willpower',
    'defense',
  ]);
  const isKnownFact = (tag: string) =>
    hardPrefixes.some((prefix) => tag.startsWith(prefix)) ||
    (tag.startsWith('roll:') && knownRolls.has(tag.slice(5)));
  for (const source of uniqueSources) {
    if (source.carried === false || (source.kind === 'armor' && source.worn === false)) continue;
    const rule = getSourceModifierRule(source);
    if (!rule) continue;
    const instances =
      actor.activeRuleEffects?.filter(
        (instance) =>
          instance.sourceId === source.id &&
          instance.ruleId === rule.id &&
          isRuleInstanceActive(instance) &&
          (!instance.parentGrantId || Boolean(actor.activeRuleEffects?.some(grant =>
            grant.id === instance.parentGrantId && grant.grantedGift && isRuleInstanceActive(grant)
          )))
      ) ?? [];
    const sourceTags = new Set(sharedTags);
    if (source.dots !== undefined) sourceTags.add(`source:dots:${source.dots}`);
    const ownsAliasedItem =
      source.ownerId !== undefined &&
      source.ownerId === actor.id &&
      source.itemId === context.selectedItemId &&
      selectedItem !== undefined;
    if (selectedItem?.id === source.id || ownsAliasedItem) {
      sourceTags.add('item:selected');
      sourceTags.add('item:selected-weapon');
    }
    if (source.worn) sourceTags.add('gear:worn');
    sourceTags.add('item:carried');
    if (source.active) sourceTags.add('item:active');
    const reasons = new Set<string>();
    const receivedSource = !sources.some(
      (item) => item.id === source.id && getSourceModifierRule(item)?.id === rule.id
    );
    for (const clause of rule.effects) {
      const effect = profileEffect(source, rule, clause);
      if (receivedSource && !effect.duration) continue;
      const candidates = effect.duration ? instances : [undefined];
      const choices = candidates.length ? candidates : [undefined];
      for (const instance of choices) {
        if (
          instance?.boundTargetIds?.length &&
          !instance.boundTargetIds.some((target) => context.targetIds?.includes(target))
        )
          continue;
        const choice = instance?.ruleChoice ?? source.ruleChoice ?? '';
        const ruleChoices = instance
          ? { ...source.ruleChoices, ...instance.ruleChoices }
          : { ...source.ruleChoices, ...context.ruleChoices };
        const reserveKey = rule.activation?.allocation?.consumeOnRoll
          ? rule.activation.allocation.choiceKey
          : undefined;
        if (reserveKey && instance)
          ruleChoices[reserveKey] =
            context.effectChoices?.[instance.id]?.[reserveKey] ??
            context.ruleChoices?.[reserveKey] ??
            0;
        const substitute = (tag: string) =>
          tag
            .replace(/\$choices\.([a-zA-Z0-9_-]+)/g, (_, key: string) =>
              String(ruleChoices[key] ?? `$choices.${key}`)
            )
            .replace(/\$choice/g, choice);
        const referenced = [
          ...(effect.when ?? []),
          effect.target,
          typeof effect.value === 'object' ? (effect.value.trait ?? '') : '',
        ].join(' ');
        const invalidChoice = rule.choiceFields?.some((field) => {
          const used =
            referenced.includes(`$choices.${field.key}`) ||
            (typeof effect.value === 'object' && effect.value.choiceKey === field.key);
          if (!used) return false;
          const selected = ruleChoices[field.key];
          if (selected === undefined || selected === '') return true;
          if (field.kind === 'number')
            return (
              !Number.isFinite(Number(selected)) ||
              (field.min !== undefined && Number(selected) < field.min) ||
              (field.max !== undefined && Number(selected) > field.max)
            );
          return Boolean(field.options && !field.options.includes(String(selected)));
        });
        if (invalidChoice) {
          reasons.add('Choose rule inputs');
          continue;
        }
        const tags = new Set(sourceTags);
        if (instance?.boundTargetIds?.length) {
          tags.add('target:studied');
          tags.add('target:identified-weakest');
        }
        if (choice) {
          tags.add(`choice:${choice}`);
          tags.add(`variant:${choice}`);
        }
        for (const [key, value] of Object.entries(ruleChoices)) tags.add(`choice:${key}:${value}`);
        const missing = effect.when?.map(substitute).filter((tag) => !tags.has(tag)) ?? [];
        if (missing.some((tag) => isKnownFact(tag))) continue;
        if (instance && !instance.rule && effect.duration !== instance.duration) continue;
        if (effect.duration && !instance) {
          reasons.add('Activation required');
          continue;
        }
        if (
          instance?.rule &&
          !instance.rule.effects.some(
            (candidate) =>
              candidate.target === effect.target &&
              candidate.operation === effect.operation &&
              candidate.duration === effect.duration
          )
        )
          continue;
        const recipient = instance?.recipient ?? 'self';
        if (effect.recipient && effect.recipient !== recipient) continue;
        if (missing.length) {
          missing.forEach((tag) => reasons.add(tag));
          continue;
        }
        if (effect.unless?.some((tag) => tags.has(substitute(tag)))) continue;
        if (effect.unless?.length && !effect.unless.some((tag) => isKnownFact(tag))) {
          effect.unless.map(substitute).forEach((tag) => reasons.add(tag));
        }
        const resolvedMagnitude =
          typeof effect.value === 'object' && effect.value.trait
            ? { ...effect.value, trait: substitute(effect.value.trait) }
            : effect.value;
        const value = magnitude(
          resolvedMagnitude,
          source,
          { ...actor, ruleTraits: { ...actor.ruleTraits, ...instance?.sourceTraits } },
          instance?.successes,
          instance?.choiceValue,
          ruleChoices
        );
        const modifier: AppliedRuleModifier = {
          duration: effect.duration,
          stackingKey: effect.stackingKey,
          sourceId: source.id,
          ruleId: rule.id,
          name: rule.name,
          source: rule.source,
          target:
            effect.when?.includes('target:source') && !effect.target.startsWith('target:')
              ? `target:${substitute(effect.target)}`
              : substitute(effect.target),
          operation: effect.operation,
          value,
        };
        const physicalCapacity =
          effect.target === 'resource:gnosis:capacity' ? `:${source.id}` : '';
        const key =
          effect.stackingKey?.replace(/\$source/g, source.id) ??
          `${rule.id}:${modifier.target}:${effect.operation}:${effect.duration ?? 'passive'}${physicalCapacity}`;
        const prior = stacking.get(key);
        if (prior !== undefined) {
          if (Math.abs(modifiers[prior].value) >= Math.abs(value)) continue;
          modifiers[prior] = modifier;
        } else {
          stacking.set(key, modifiers.length);
          modifiers.push(modifier);
        }
      }
    }
    if (reasons.size) pending.push({ sourceId: source.id, rule, reasons: [...reasons] });
  }
  const suppression = { modifiers };
  const suppressed = new Set(
    uniqueSources
      .filter((source) => isRuleSourceSuppressed(source, suppression))
      .map((source) => `${source.id}:${getSourceModifierRule(source)?.id}`)
  );
  const activeModifiers = modifiers.filter(
    (modifier) => !suppressed.has(`${modifier.sourceId}:${modifier.ruleId}`)
  );
  const result: EvaluatedRules = {
    modifiers: activeModifiers,
    pending: pending.filter((entry) => !suppressed.has(`${entry.sourceId}:${entry.rule.id}`)),
    values: {},
  };
  for (const target of new Set(activeModifiers.map((modifier) => modifier.target))) {
    result.values[target] = applyRuleValue(result, target, 0);
  }
  return result;
}
export function applyRuleValue(
  evaluation: Pick<EvaluatedRules, 'modifiers'>,
  target: string,
  base: number
): number {
  const relevant = evaluation.modifiers.filter((modifier) => modifier.target === target);
  const sets = relevant
    .filter((modifier) => modifier.operation === 'set')
    .sort((left, right) => Math.abs(left.value) - Math.abs(right.value));
  let result = sets.length ? sets[sets.length - 1].value : base;
  result += relevant
    .filter((modifier) => modifier.operation === 'add')
    .reduce((sum, modifier) => sum + modifier.value, 0);
  for (const modifier of relevant.filter((modifier) => modifier.operation === 'multiply'))
    result *= modifier.value;
  for (const modifier of relevant.filter((modifier) => modifier.operation === 'min'))
    result = Math.min(result, modifier.value);
  for (const modifier of relevant.filter((modifier) => modifier.operation === 'max'))
    result = Math.max(result, modifier.value);
  if (relevant.some((modifier) => modifier.operation === 'allow')) result = 1;
  if (
    relevant.some(
      (modifier) =>
        modifier.operation === 'ignore' ||
        (modifier.operation === 'deny' &&
          !relevant.some(
            (override) =>
              override.ruleId === modifier.ruleId &&
              override.operation === 'allow' &&
              override.duration
          ))
    )
  )
    result = 0;
  return result;
}
/** Legacy Huge Size sheets already include their extra box in bonusBruisedBoxes. */
export function effectiveRuleHealth(health: HealthState, extraBruised: number): HealthState {
  const damage = health.boxes.filter((box) => box !== 'none');
  const desired = Math.max(
    health.bonusBruisedBoxes,
    Math.max(0, Math.floor(extraBruised)),
    damage.length - 7
  );
  return {
    bonusBruisedBoxes: desired,
    boxes:
      health.boxes.length <= 7 + desired
        ? [...health.boxes, ...Array(7 + desired - health.boxes.length).fill('none')]
        : [...damage, ...Array(Math.max(0, 7 + desired - damage.length)).fill('none')],
  };
}

export function ruleSilverPenalty(
  actor: { silverCarriedItems: number },
  sources: RuleSource[],
  evaluation: EvaluatedRules
): number {
  const representedSources = new Set(
    evaluation.modifiers
      .filter((modifier) => modifier.target === 'resource:gnosis:capacity')
      .map((modifier) => modifier.sourceId)
  );
  const listedSilver = sources.filter(
    (source) =>
      source.carried !== false &&
      'isSilver' in source &&
      source.isSilver &&
      !representedSources.has(source.id)
  ).length;
  const capacityPenalty = Math.max(0, -applyRuleValue(evaluation, 'resource:gnosis:capacity', 0));
  return Math.max(actor.silverCarriedItems, listedSilver + capacityPenalty);
}

/** Derived quantities without an existing engine operation remain visible to the sheet. */
export function getDerivedRuleValues(evaluation: EvaluatedRules): Record<string, number> {
  const values: Record<string, number> = {};
  for (const target of new Set(evaluation.modifiers.map((modifier) => modifier.target))) {
    const initial = evaluation.modifiers.some(
      (modifier) => modifier.target === target && modifier.operation === 'multiply'
    )
      ? 1
      : 0;
    values[target] = applyRuleValue(evaluation, target, initial);
  }
  return values;
}

export function resolveRulePenalties(
  evaluation: Pick<EvaluatedRules, 'modifiers'>,
  context: RuleContext
): { pool: number; difficulty: number } {
  let pool = 0;
  let difficulty = 0;
  for (const penalty of context.penalties ?? []) {
    const key = penalty.key.replace(/-/g, '_');
    const ignored = evaluation.modifiers.some(
      (modifier) =>
        modifier.target.replace(/-/g, '_') === `penalty:${key}` &&
        ['ignore', 'deny'].includes(modifier.operation)
    );
    if (!ignored) {
      pool += Math.min(0, penalty.pool ?? 0);
      difficulty += Math.max(0, penalty.difficulty ?? 0);
    }
  }
  return { pool, difficulty };
}

export function isRuleSourceSuppressed(
  source: RuleSource,
  evaluation: Pick<EvaluatedRules, 'modifiers'>
): boolean {
  const rule = getSourceModifierRule(source);
  if (!rule) return false;
  const suppressors = evaluation.modifiers.filter(
    (modifier) =>
      modifier.operation === 'deny' &&
      ['source:totem', 'source:supernatural'].includes(modifier.target)
  );
  if (suppressors.some((modifier) => modifier.ruleId === rule.id)) return false;
  const category = source.kind ?? ruleCategory(rule);
  return suppressors.some((modifier) =>
    modifier.target === 'source:totem'
      ? category === 'totem' || ruleCategory(rule) === 'totem'
      : ['gift', 'rite', 'fetish', 'talen', 'totem'].includes(category) ||
        ['gift', 'rite', 'fetish', 'talen', 'totem'].includes(ruleCategory(rule)) ||
        supernaturalTraitIds.has(rule.id)
  );
}
