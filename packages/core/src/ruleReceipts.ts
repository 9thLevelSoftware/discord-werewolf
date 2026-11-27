/**
 * Compaction of a character sheet's `ruleActivationReceipts` ledger.
 *
 * The ledger is an append-ordered list of strings from several families:
 *
 * - `consumed:<id>` and `grant-ended:<id>` record permanent facts and are always kept.
 * - `rule-use:` / `event-use:` keys ending in `:ever` are lifetime limits and are always kept.
 * - `rule-use:` / `reroll-use:` / `event-use:` keys scoped to a room clock value
 *   (`<namespace>:scene:4`, ...) are kept until the ledger proves that clock has moved on,
 *   which it does by holding a key with a higher value for the same namespace and unit.
 * - `pending-source:<source>:<token>` is a reservation and is kept until its
 *   `settled-source:<token>` arrives; the settled pair then ages out together.
 * - Everything else is an operation id that only guards against a replay of a recent
 *   write, so only the most recent ones are kept.
 *
 * Every dropped receipt is counted in a single `receipts-compacted:<n>` watermark, which
 * lets a holder of an older copy tell "the server dropped this" from "this copy is stale".
 */

/** Recent operation ids kept as replay guards. */
export const RULE_RECEIPT_REPLAY_WINDOW = 100;

const WATERMARK_PREFIX = 'receipts-compacted:';
const PENDING_SOURCE_PREFIX = 'pending-source:';
const SETTLED_SOURCE_PREFIX = 'settled-source:';
const CLOCK_UNITS = new Set(['turn', 'scene', 'session', 'story', 'day']);
const COUNTER = /^\d+$/;

function watermarkOf(receipt: string): number | null {
  if (!receipt.startsWith(WATERMARK_PREFIX)) return null;
  const value = receipt.slice(WATERMARK_PREFIX.length);
  return COUNTER.test(value) ? Number(value) : null;
}

/** How many receipts compaction has dropped from this ledger so far. */
export function getRuleReceiptWatermark(receipts: readonly string[] | undefined): number {
  let watermark = 0;
  for (const receipt of receipts ?? []) watermark = Math.max(watermark, watermarkOf(receipt) ?? 0);
  return watermark;
}

/**
 * The room clock a frequency key belongs to, read from the end of the key because the
 * ids at its start may themselves contain colons. Null for lifetime and unrecognized keys.
 */
function clockScope(receipt: string): { group: string; value: number } | null {
  const parts = receipt.split(':');
  const last = parts.length - 1;
  let namespace: string | undefined;
  let unit: string | undefined;
  let value: string | undefined;
  if (receipt.startsWith('rule-use:') && parts.length >= 7) {
    // rule-use:<actor>:<rule>:<target>:<namespace>:<unit>:<value>
    [namespace, unit, value] = [parts[last - 2], parts[last - 1], parts[last]];
  } else if (receipt.startsWith('reroll-use:') && parts.length >= 7) {
    // reroll-use:<actor>:<rule>:<namespace>:<unit>:<value>:<use number>
    if (!COUNTER.test(parts[last]!)) return null;
    [namespace, unit, value] = [parts[last - 3], parts[last - 2], parts[last - 1]];
  } else if (receipt.startsWith('event-use:') && parts.length >= 6) {
    // event-use:<actor>:<source>:<event>:<namespace>:<value>
    [namespace, value] = [parts[last - 1], parts[last]];
    unit = parts[last - 2] === 'session_start' ? 'session' : 'story';
  }
  if (!namespace || !unit || !value || !CLOCK_UNITS.has(unit) || !COUNTER.test(value)) return null;
  return { group: namespace + ':' + unit, value: Number(value) };
}

function isFrequencyKey(receipt: string): boolean {
  return (
    receipt.startsWith('rule-use:') ||
    receipt.startsWith('reroll-use:') ||
    receipt.startsWith('event-use:')
  );
}

function pendingSourceToken(receipt: string): string | null {
  if (!receipt.startsWith(PENDING_SOURCE_PREFIX)) return null;
  const boundary = receipt.indexOf(':', PENDING_SOURCE_PREFIX.length);
  return boundary < 0 ? null : receipt.slice(boundary + 1);
}

/**
 * Drop the receipts no later logic can depend on. Order is recency, so the list must be
 * the stored one with new receipts appended. Returns the same array when nothing changes.
 */
export function compactRuleReceipts(
  receipts: readonly string[],
  replayWindow = RULE_RECEIPT_REPLAY_WINDOW
): string[] {
  const watermark = getRuleReceiptWatermark(receipts);
  const entries = [...new Set(receipts)].filter((receipt) => watermarkOf(receipt) === null);

  const newestClock = new Map<string, number>();
  const settledTokens = new Set<string>();
  for (const receipt of entries) {
    const scope = clockScope(receipt);
    if (scope) newestClock.set(scope.group, Math.max(newestClock.get(scope.group) ?? 0, scope.value));
    if (receipt.startsWith(SETTLED_SOURCE_PREFIX)) {
      settledTokens.add(receipt.slice(SETTLED_SOURCE_PREFIX.length));
    }
  }

  const keep = new Set<string>();
  const operations: string[] = [];
  const settledReservations: Array<{ receipt: string; token: string }> = [];
  for (const receipt of entries) {
    if (receipt.startsWith('consumed:') || receipt.startsWith('grant-ended:')) {
      keep.add(receipt);
    } else if (isFrequencyKey(receipt)) {
      const scope = clockScope(receipt);
      if (!scope || scope.value >= newestClock.get(scope.group)!) keep.add(receipt);
    } else {
      const token = pendingSourceToken(receipt);
      if (token === null) operations.push(receipt);
      else if (settledTokens.has(token)) settledReservations.push({ receipt, token });
      else keep.add(receipt);
    }
  }
  const recent = replayWindow > 0 ? operations.slice(-replayWindow) : [];
  for (const receipt of recent) keep.add(receipt);
  // A settled reservation leaves with its settlement: kept alone it would look pending again.
  for (const { receipt, token } of settledReservations) {
    if (keep.has(SETTLED_SOURCE_PREFIX + token)) keep.add(receipt);
  }

  const kept = entries.filter((receipt) => keep.has(receipt));
  const dropped = entries.length - kept.length;
  if (dropped === 0 && entries.length + (watermark > 0 ? 1 : 0) === receipts.length) {
    return receipts as string[];
  }
  const total = watermark + dropped;
  return total > 0 ? [WATERMARK_PREFIX + total, ...kept] : kept;
}

/**
 * True when `held` records a transaction that `other` has not seen. A copy with a higher
 * watermark comes from a later write of the same ledger, so receipts it lacks were
 * compacted away rather than missed.
 */
export function hasUnacknowledgedRuleReceipts(
  held: readonly string[] | undefined,
  other: readonly string[] | undefined
): boolean {
  const heldWatermark = getRuleReceiptWatermark(held);
  const otherWatermark = getRuleReceiptWatermark(other);
  if (otherWatermark > heldWatermark) return false;
  if (otherWatermark < heldWatermark) return true;
  const seen = new Set(other ?? []);
  return (held ?? []).some((receipt) => watermarkOf(receipt) === null && !seen.has(receipt));
}
