import { W20_GIFT_CATALOG } from './catalog/gifts.data';
import { GIFT_MODIFIER_RULES } from './catalog/giftModifierRules';
import type { W20GiftCatalogEntry } from './catalog/types';
import type { W20CharacterState } from './types';
import type { W20UserCharacterSheet } from './userCharacterSheet';
import type { ActiveRuleInstance, ModifierRule, RuleSource, SharedGiftGrant } from './ruleTypes';

type GiftActor = W20UserCharacterSheet | W20CharacterState;
export interface OwnedGiftChoice {
  sourceEntryId: string;
  giftId: string;
  name: string;
  level: number;
  rule: ModifierRule;
}
const catalogReferences = new Map<string, W20GiftCatalogEntry>();
const catalogNames = new Map<string, W20GiftCatalogEntry[]>();
for (const gift of W20_GIFT_CATALOG) {
  catalogReferences.set(gift.id, gift);
  catalogReferences.set(gift.slug, gift);
  const aliases = new Set([
    gift.name.trim().toLowerCase(),
    gift.name
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
      .toLowerCase(),
  ]);
  for (const name of aliases) catalogNames.set(name, [...(catalogNames.get(name) ?? []), gift]);
}
function documentedGiftRule(gift: W20GiftCatalogEntry): ModifierRule {
  return (
    GIFT_MODIFIER_RULES[gift.id] ?? {
      id: gift.id,
      name: gift.name,
      source: gift.source,
      effects: [],
      activation: {
        duration: 'instant',
        cost: { rage: gift.rageCost, gnosis: gift.gnosisCost, willpower: gift.willpowerCost },
        roll: Boolean(gift.rollAttribute || gift.rollAbility),
        rollSpec: {
          attribute: gift.rollAttribute ?? undefined,
          ability: gift.rollAbility ?? undefined,
          difficulty: gift.difficultyNote ? undefined : gift.defaultDifficulty,
          difficultyNote: gift.difficultyNote,
        },
      },
      note: gift.summary,
    }
  );
}
const documentedRules = new Map(
  W20_GIFT_CATALOG.map((gift) => [gift.id, documentedGiftRule(gift)])
);
function resolveGift(reference: {
  id: string;
  name: string;
  ruleId?: string;
}): W20GiftCatalogEntry | undefined {
  for (const id of [reference.ruleId, reference.id]) {
    const exact = id ? catalogReferences.get(id) : undefined;
    if (exact) return exact;
  }
  const fullName = reference.name.trim().toLowerCase();
  const strippedName = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const matching = catalogNames.get(fullName) ?? catalogNames.get(strippedName) ?? [];
  return matching.length === 1 ? matching[0] : undefined;
}
function ownedReferences(actor: GiftActor): Array<{ id: string; name: string; ruleId?: string }> {
  if ('gifts' in actor) return actor.gifts;
  const persisted = (actor.giftIds ?? []).map((id) => ({
    id,
    name: catalogReferences.get(id)?.name ?? id,
  }));
  return [
    ...persisted,
    ...actor.macros
      .filter((macro) => macro.category === 'gift')
      .map((macro) => ({ id: macro.id, name: macro.name })),
  ];
}
export function listOwnedGiftChoices(actor: GiftActor): OwnedGiftChoice[] {
  const choices = new Map<string, OwnedGiftChoice>();
  for (const reference of ownedReferences(actor)) {
    const gift = resolveGift(reference);
    if (!gift || choices.has(gift.id)) continue;
    choices.set(gift.id, {
      sourceEntryId: reference.id,
      giftId: gift.id,
      name: gift.name,
      level: gift.level,
      rule: documentedRules.get(gift.id)!,
    });
  }
  return [...choices.values()];
}
export function listUnlinkedGiftSources(
  actor: GiftActor
): Array<{ sourceEntryId: string; name: string; reason: string }> {
  return ownedReferences(actor)
    .filter((reference) => !resolveGift(reference))
    .map((reference) => ({
      sourceEntryId: reference.id,
      name: reference.name,
      reason:
        'This saved Gift needs an exact catalog ID or an unambiguous documented name before it can be shared.',
    }));
}
export function buildSharedGiftGrant(actor: GiftActor, sourceEntryId: string): SharedGiftGrant {
  const reference = ownedReferences(actor).find((entry) => entry.id === sourceEntryId);
  const gift = reference ? resolveGift(reference) : undefined;
  if (!reference || !gift)
    throw new Error(
      'Choose a Gift owned by the leader with an exact documented catalog reference.'
    );
  return {
    giftId: gift.id,
    sourceEntryId: reference.id,
    name: gift.name,
    level: gift.level,
    rule: documentedRules.get(gift.id)!,
  };
}
export function isRuleInstanceActive(instance: ActiveRuleInstance): boolean {
  return (
    !(instance.preparationRounds && instance.preparationRounds > 0) &&
    !(instance.preparationSeconds && instance.preparationSeconds > 0) &&
    [
      instance.remainingRounds,
      instance.remainingScenes,
      instance.remainingStories,
      instance.remainingSessions,
      instance.remainingSeconds,
    ].every((value) => value === undefined || value > 0)
  );
}
export function getSharedGiftSources(actor: GiftActor): RuleSource[] {
  if (
    !actor.activeRuleEffects?.some(
      (instance) => instance.grantedGift && isRuleInstanceActive(instance)
    )
  )
    return [];
  const owned = new Set(listOwnedGiftChoices(actor).map((gift) => gift.giftId));
  return (actor.activeRuleEffects ?? [])
    .filter(
      (instance) =>
        instance.grantedGift &&
        isRuleInstanceActive(instance) &&
        !owned.has(instance.grantedGift.giftId)
    )
    .map((instance) => ({
      id: `shared-gift:${instance.id}`,
      name: instance.grantedGift!.name,
      kind: 'gift',
      ruleId: instance.grantedGift!.giftId,
      customRule: instance.grantedGift!.rule,
      grantInstanceId: instance.id,
    }));
}
export function getCampaignGiftSources(actor: W20CharacterState): RuleSource[] {
  const known = listOwnedGiftChoices(actor);
  const knownReferences = new Set(
    ownedReferences(actor)
      .filter((reference) => resolveGift(reference))
      .map((reference) => reference.id)
  );
  return [
    ...known.map((gift) => ({
      id: gift.sourceEntryId,
      name: gift.name,
      kind: 'gift',
      ruleId: gift.giftId,
      customRule: gift.rule,
    })),
    ...actor.macros
      .filter((macro) => !knownReferences.has(macro.id))
      .map((macro) => ({ id: macro.id, name: macro.name, kind: macro.category })),
  ];
}
