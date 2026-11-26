import { describe, expect, it } from 'vitest';
import { createBlankUserCharacterSheet, type ActiveRuleInstance } from '@w20-vtt/core';
import { applyCanonicalGrantCleanup } from '../sharedRuleCommit';
import type { RuleSheetMutation } from '../roomProjection';

const grant: ActiveRuleInstance = {
  id: 'temporary-grant',
  sourceId: 'caster:gift',
  ruleId: 'gift',
  duration: 'scene',
  resourceGrants: { willpower: 2 },
};
function makeSheet(remainingGrant: number) {
  const sheet = createBlankUserCharacterSheet({
    id: 'recipient',
    ownerDiscordId: 'recipient',
    now: 1,
  });
  sheet.willpower = { permanent: 5, temporary: 3 + remainingGrant };
  sheet.activeRuleEffects = [{ ...grant, resourceGrants: { willpower: remainingGrant } }];
  return sheet;
}
function cleanup(operationId = 'expire-room-a'): RuleSheetMutation {
  return {
    sheetId: 'recipient',
    operationId,
    resourceDelta: { rage: 0, gnosis: 0, willpower: -2 },
    grantWithdrawals: [
      { effectId: grant.id, resourceDelta: { rage: 0, gnosis: 0, willpower: -2 } },
    ],
    consumedSourceIds: [],
    effects: [],
    removedEffectIds: [grant.id],
  };
}

describe('canonical temporary grant cleanup', () => {
  it('preserves ordinary points when another room already spent the grant', () => {
    const canonical = makeSheet(0);
    const next = applyCanonicalGrantCleanup(canonical, cleanup());
    expect(next.willpower.temporary).toBe(3);
    expect(next.activeRuleEffects).toEqual([]);
    expect(next.ruleActivationReceipts).toContain(`grant-ended:${grant.id}`);
    expect(canonical.activeRuleEffects?.[0].resourceGrants?.willpower).toBe(0);
  });

  it('withdraws only the currently unspent portion of the canonical grant', () => {
    const next = applyCanonicalGrantCleanup(makeSheet(1), cleanup());
    expect(next.willpower.temporary).toBe(3);
    expect(next.activeRuleEffects).toEqual([]);
  });

  it('does not debit or resurrect the same grant through a second stale cleanup', () => {
    const first = applyCanonicalGrantCleanup(makeSheet(2), cleanup());
    const secondMutation = { ...cleanup('expire-room-b'), effects: [grant] };
    const second = applyCanonicalGrantCleanup(first, secondMutation);
    expect(first.willpower.temporary).toBe(3);
    expect(second.willpower.temporary).toBe(3);
    expect(second.activeRuleEffects).toEqual([]);
    expect(applyCanonicalGrantCleanup(second, secondMutation)).toBe(second);
  });

  it('does not restore a live grant balance from stale queued effect metadata', () => {
    const mutation: RuleSheetMutation = {
      sheetId: 'recipient',
      operationId: 'old-source-refresh',
      resourceDelta: { rage: 0, gnosis: 0, willpower: 0 },
      consumedSourceIds: [],
      effects: [grant],
      removedEffectIds: [],
    };
    const next = applyCanonicalGrantCleanup(makeSheet(0), mutation);
    expect(next.willpower.temporary).toBe(3);
    expect(next.activeRuleEffects?.[0].resourceGrants?.willpower).toBe(0);
  });

  it('deduplicates actual withdrawal while undoing every planned duplicate delta', () => {
    const mutation = cleanup();
    mutation.resourceDelta.willpower = -4;
    mutation.grantWithdrawals!.push({ ...mutation.grantWithdrawals![0] });
    const next = applyCanonicalGrantCleanup(makeSheet(2), mutation);
    expect(next.willpower.temporary).toBe(3);
  });
});
