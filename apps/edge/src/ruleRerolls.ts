import {
  computeUserSheetStats,
  applyRuleValue,
  getSheetModifierSources,
  getSourceModifierRule,
  isRuleSourceSuppressed,
  W20_GIFT_CATALOG,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { PersistedRoomState, PersistedRuleState, RuleRollRecord } from './roomProjection';

export const FAIR_FORTUNE_RULE_ID = W20_GIFT_CATALOG.find((gift) => gift.slug === 'fair-fortune')!.id;
const LUCKY_RULE_ID = 'merit-lucky';

function isRollReserved(rules: PersistedRuleState, rollId: string): boolean {
  return Object.values(rules.pendingActivations ?? {}).some((pending) => pending.referenceRollId === rollId);
}

export function canCorrectRuleRoll(rules: PersistedRuleState, original: RuleRollRecord): boolean {
  return !original.rerolled && !original.superseded && !original.activationClosed &&
    !rules.pendingActivations?.[original.history.id] && !isRollReserved(rules, original.history.id);
}

export function getRerollOptions(state: PersistedRoomState, actor: W20UserCharacterSheet, original: RuleRollRecord) {
  const rules = state.ruleState;
  if (!rules || original.rerolled || original.superseded || original.history.rerollOf ||
      original.history.roll.initiativeTotal !== undefined ||
      original.activationClosed || isRollReserved(rules, original.history.id) ||
      (original.history.roll.netSuccesses >= (original.minimumSuccesses ?? 1) && !original.history.roll.isBotch)) return [];

  const evaluation = computeUserSheetStats(actor).ruleEvaluation;
  const sources = getSheetModifierSources(actor).filter((source) => source.carried !== false && !isRuleSourceSuppressed(source, evaluation));
  const turnSpend = rules.turnSpends[actor.id];
  const rageLocked = turnSpend?.turn === rules.clock.turn && turnSpend.rage &&
    !applyRuleValue(evaluation, 'spend:rage-and-gnosis-same-turn', 0);
  return [LUCKY_RULE_ID, FAIR_FORTUNE_RULE_ID].flatMap((ruleId) => {
    const source = sources.find((entry) => getSourceModifierRule(entry)?.id === ruleId &&
      (ruleId === LUCKY_RULE_ID ? entry.kind === 'merit' : entry.kind === 'gift'));
    const definition = source && getSourceModifierRule(source);
    if (!source || !definition) return [];
    const fairFortune = ruleId === FAIR_FORTUNE_RULE_ID;
    const scope = fairFortune ? 'scene:' + rules.clock.scene : 'story:' + rules.clock.story;
    const budgetKey = ['reroll-use', actor.id, ruleId, state.ruleCommitNamespace, scope].join(':');
    const previousUsage = Math.max(rules.rerollUsage[budgetKey] ?? 0,
      (actor.ruleActivationReceipts ?? []).filter((receipt) => receipt.startsWith(budgetKey + ':')).length);
    const prepaidReceipt = ['rule-use', actor.id, ruleId, 'self', state.ruleCommitNamespace, scope].join(':');
    const alreadyPaid = rules.frequencyReceipts.includes(prepaidReceipt) || actor.ruleActivationReceipts?.includes(prepaidReceipt);
    const prepaid = fairFortune && alreadyPaid ? rules.effects.find((effect) => effect.targetId === actor.id &&
      effect.sourceId === actor.id && effect.instance.ruleId === ruleId &&
      effect.instance.sourceId === actor.id + ':' + source.id && effect.instance.duration === 'next-roll') : undefined;
    const gnosisCost = fairFortune && !prepaid ? 1 : 0;
    const remaining = (fairFortune ? 1 : 3) - previousUsage;
    if (remaining <= 0 || (fairFortune && alreadyPaid && !prepaid) ||
        (gnosisCost && (actor.gnosis.temporary < gnosisCost || rageLocked))) return [];
    return [{ ruleId, name: definition.name, sourceId: source.id, remaining, gnosisCost, prepaid, budgetKey,
      useReceipt: budgetKey + ':' + (previousUsage + 1), previousUsage }];
  });
}
