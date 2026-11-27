import { describe, expect, it } from 'vitest';
import {
  compactRuleReceipts,
  getRuleReceiptWatermark,
  hasUnacknowledgedRuleReceipts,
  RULE_RECEIPT_REPLAY_WINDOW,
} from '../ruleReceipts';

const ROOM = '11111111-1111-4111-8111-111111111111';
const OTHER_ROOM = '22222222-2222-4222-8222-222222222222';
const SHEET = '77777777-7777-4777-8777-777777777777';
const operations = (count: number, prefix = 'op') =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
/** Compaction with a small replay window, without the watermark. */
const kept = (receipts: string[], window = 2) =>
  compactRuleReceipts(receipts, window).filter(
    (receipt) => !receipt.startsWith('receipts-compacted:')
  );

describe('compactRuleReceipts', () => {
  it('returns the same list when there is nothing to drop', () => {
    const receipts = ['shared:a', 'consumed:talen', `rule-use:${SHEET}:gift:self:ever`];
    expect(compactRuleReceipts(receipts)).toBe(receipts);
    const compacted = compactRuleReceipts(operations(RULE_RECEIPT_REPLAY_WINDOW + 5));
    expect(compactRuleReceipts(compacted)).toBe(compacted);
  });

  it('keeps only the most recent operation ids, whatever their shape', () => {
    const receipts = [
      `shared:${ROOM}:ROLL_TABLE_POOL:123:abc:${SHEET}`,
      `${ROOM}:ROLL_TABLE_POOL:123:abc`,
      `${ROOM}:ACTIVATE_RULE:123:def:payment`,
      `outbox:${ROOM}:rule-use:${SHEET}:gift:self:${ROOM}:scene:1`,
      '123:request-9',
      `${ROOM}:ROLL_TABLE_POOL:123:abc:consume`,
    ];
    expect(kept(receipts, 2)).toEqual(receipts.slice(-2));
    expect(compactRuleReceipts(receipts)).toBe(receipts);
  });

  it('never drops consumed sources or ended grants', () => {
    const receipts = ['consumed:talen', 'grant-ended:effect-1', ...operations(10)];
    expect(kept(receipts)).toEqual(['consumed:talen', 'grant-ended:effect-1', 'op-8', 'op-9']);
  });

  it('never drops lifetime rule and event limits', () => {
    const lifetime = [
      `rule-use:${SHEET}:rite:self:ever`,
      `rule-use:${SHEET}:rite:target:with:colons:ever`,
      `event-use:${SHEET}:pack-totem:totem_acceptance:ever`,
    ];
    expect(kept([...lifetime, ...operations(10)], 0)).toEqual(lifetime);
  });

  it('keeps frequency keys for the newest scene, story, session, day and turn it knows of', () => {
    const current = [
      `rule-use:${SHEET}:gift-a:self:${ROOM}:scene:4`,
      `rule-use:${SHEET}:gift-b:self:${ROOM}:story:2`,
      `rule-use:${SHEET}:gift-c:self:${ROOM}:session:7`,
      `rule-use:${SHEET}:gift-d:target:1:${ROOM}:day:3`,
      `rule-use:${SHEET}:gift-e:self:${ROOM}:turn:12`,
      `reroll-use:${SHEET}:merit-lucky:${ROOM}:story:2:1`,
      `reroll-use:${SHEET}:merit-lucky:${ROOM}:story:2:2`,
      `reroll-use:${SHEET}:fair-fortune:${ROOM}:scene:4:1`,
      `event-use:${SHEET}:merit:session_start:${ROOM}:7`,
      `event-use:${SHEET}:merit:story_start:${ROOM}:2`,
    ];
    expect(kept([...current, ...operations(10)], 0)).toEqual(current);
  });

  it('drops frequency keys once a later value of the same clock is recorded', () => {
    const expired = [
      `rule-use:${SHEET}:gift-a:self:${ROOM}:scene:3`,
      `reroll-use:${SHEET}:fair-fortune:${ROOM}:scene:3:1`,
      `rule-use:${SHEET}:gift-b:self:${ROOM}:story:1`,
      `reroll-use:${SHEET}:merit-lucky:${ROOM}:story:1:3`,
      `event-use:${SHEET}:merit:story_start:${ROOM}:1`,
      `event-use:${SHEET}:merit:session_start:${ROOM}:6`,
      `rule-use:${SHEET}:gift-c:self:${ROOM}:session:6`,
      `rule-use:${SHEET}:gift-d:self:${ROOM}:day:2`,
      `rule-use:${SHEET}:gift-e:self:${ROOM}:turn:11`,
    ];
    const current = [
      `rule-use:${SHEET}:gift-z:self:${ROOM}:scene:4`,
      `event-use:${SHEET}:other:story_start:${ROOM}:2`,
      `rule-use:${SHEET}:gift-z:self:${ROOM}:session:7`,
      `rule-use:${SHEET}:gift-z:self:${ROOM}:day:3`,
      `rule-use:${SHEET}:gift-z:self:${ROOM}:turn:12`,
    ];
    expect(kept([...expired, ...current])).toEqual(current);
  });

  it('judges each room and each clock unit separately', () => {
    const receipts = [
      `rule-use:${SHEET}:gift-a:self:${ROOM}:scene:1`,
      `rule-use:${SHEET}:gift-a:self:${OTHER_ROOM}:scene:9`,
      `rule-use:${SHEET}:gift-b:self:${ROOM}:story:5`,
      `rule-use:${SHEET}:gift-c:self:${ROOM}:turn:40`,
    ];
    expect(kept(receipts)).toEqual(receipts);
  });

  it('keeps frequency keys it cannot read', () => {
    const receipts = [
      `rule-use:${SHEET}:gift:self:${ROOM}:era:1`,
      `rule-use:${SHEET}:gift:self:${ROOM}:scene:next`,
      `rule-use:${SHEET}:gift:self:${ROOM}:scene:2`,
      'event-use:short',
    ];
    expect(kept(receipts, 0)).toEqual(receipts);
  });

  it('keeps a source reservation until it is settled', () => {
    const pending = 'pending-source:fetish%3A1:123:activate-1';
    expect(kept([pending, ...operations(10)], 0)).toEqual([pending]);
  });

  it('drops a settled reservation together with its settlement, never one alone', () => {
    const pending = 'pending-source:fetish-1:123:activate-1';
    const settled = 'settled-source:123:activate-1';
    expect(kept([pending, 'op-a', settled, 'op-b'], 2)).toEqual([pending, settled, 'op-b']);
    expect(kept([pending, 'op-a', settled, 'op-b', 'op-c'], 2)).toEqual(['op-b', 'op-c']);
    const stillPending = 'pending-source:fetish-2:123:activate-2';
    expect(kept([pending, stillPending, settled, 'op-b', 'op-c'], 2)).toEqual([
      stillPending,
      'op-b',
      'op-c',
    ]);
  });

  it('removes duplicates and counts every dropped receipt in one watermark', () => {
    const first = compactRuleReceipts(['op-0', 'op-0', 'op-1', 'op-2', 'consumed:talen'], 2);
    expect(first).toEqual(['receipts-compacted:1', 'op-1', 'op-2', 'consumed:talen']);
    const second = compactRuleReceipts([...first, 'op-3', 'op-4'], 2);
    expect(second).toEqual(['receipts-compacted:3', 'consumed:talen', 'op-3', 'op-4']);
    expect(getRuleReceiptWatermark(second)).toBe(3);
    expect(getRuleReceiptWatermark(['op-1'])).toBe(0);
    expect(getRuleReceiptWatermark(undefined)).toBe(0);
  });

  it('gives the same ledger whether it compacts on every write or once at the end', () => {
    const writes = Array.from({ length: 30 }, (_, index) => [
      `shared:${index}`,
      `rule-use:${SHEET}:gift:self:${ROOM}:scene:${Math.floor(index / 4)}`,
      ...(index % 5 === 0 ? [`pending-source:item-${index}:token-${index}`] : []),
      ...(index % 5 === 2 ? [`settled-source:token-${index - 2}`] : []),
      ...(index % 7 === 0 ? [`consumed:item-${index}`] : []),
    ]);
    const incremental = writes.reduce<string[]>(
      (ledger, write) => compactRuleReceipts([...ledger, ...write], 6),
      []
    );
    const atOnce = compactRuleReceipts(writes.flat(), 6);
    expect([...incremental].sort()).toEqual([...atOnce].sort());
    expect(incremental.length).toBeLessThan(20);
  });
});

describe('hasUnacknowledgedRuleReceipts', () => {
  it('compares plain ledgers receipt by receipt', () => {
    expect(hasUnacknowledgedRuleReceipts(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    expect(hasUnacknowledgedRuleReceipts(['a', 'b'], ['a'])).toBe(true);
    expect(hasUnacknowledgedRuleReceipts(undefined, undefined)).toBe(false);
    expect(hasUnacknowledgedRuleReceipts(['a'], undefined)).toBe(true);
  });

  it('treats receipts missing from a more compacted ledger as dropped, not unseen', () => {
    const client = operations(5);
    const server = compactRuleReceipts([...client, ...operations(4, 'later')], 3);
    expect(server).not.toContain('op-0');
    expect(hasUnacknowledgedRuleReceipts(client, server)).toBe(false);
    expect(hasUnacknowledgedRuleReceipts(server, client)).toBe(true);
  });

  it('still reports a pending receipt against a ledger of the same generation', () => {
    const stored = compactRuleReceipts(operations(6), 3);
    expect(hasUnacknowledgedRuleReceipts([...stored, 'room-pending'], stored)).toBe(true);
    expect(hasUnacknowledgedRuleReceipts(stored, [...stored, 'room-pending'])).toBe(false);
  });

  it('treats a less compacted ledger as older even when it holds every remaining receipt', () => {
    const older = compactRuleReceipts(operations(6), 3);
    const newer = compactRuleReceipts([...older, 'op-6'], 3);
    expect(hasUnacknowledgedRuleReceipts(newer, [...older, 'op-6'])).toBe(true);
  });
});
