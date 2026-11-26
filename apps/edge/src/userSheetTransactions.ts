import type { W20UserCharacterSheet } from '@w20-vtt/core';

export type RuleResource = 'rage' | 'gnosis' | 'willpower';
export type RuleResourceAmounts = Partial<Record<RuleResource, number>>;

export class RuleSpendConflictError extends Error {
  constructor(
    public readonly code:
      | 'STALE'
      | 'INSUFFICIENT_RESOURCE'
      | 'SOURCE_MISSING'
      | 'ALREADY_USED'
      | 'NOT_FOUND'
      | 'OWNER_MISMATCH',
    message: string,
    public readonly latestSheet?: W20UserCharacterSheet
  ) {
    super(message);
    this.name = 'RuleSpendConflictError';
  }
}

export interface RuleSpendInput {
  sheetId: string;
  operationId: string;
  ownerDiscordId?: string;
  expectedUpdatedAt?: number;
  costs?: RuleResourceAmounts;
  resourceDelta?: RuleResourceAmounts;
  permanentResourceDelta?: RuleResourceAmounts;
  consumedSourceIds?: string[];
  requiredSourceIds?: string[];
  requiredAbsentReceipts?: string[];
  additionalReceipts?: string[];
}

export function nextSheetVersion(existing: W20UserCharacterSheet): number {
  return Math.max(Date.now(), Math.floor(existing.updatedAt) + 1);
}

/** A snapshot can edit game balances after acknowledging committed transactions. */
export function preserveRuleTransactions(
  existing: W20UserCharacterSheet,
  incoming: W20UserCharacterSheet
): W20UserCharacterSheet {
  const receipts = existing.ruleActivationReceipts ?? [];
  const stale = receipts.some(
    (receipt) => !(incoming.ruleActivationReceipts ?? []).includes(receipt)
  );
  const consumed = new Set(
    receipts.filter((receipt) => receipt.startsWith('consumed:')).map((receipt) => receipt.slice(9))
  );
  return {
    ...incoming,
    id: existing.id,
    ownerDiscordId: existing.ownerDiscordId,
    createdAt: existing.createdAt,
    ...(stale
      ? {
          rage: existing.rage,
          gnosis: existing.gnosis,
          willpower: existing.willpower,
          health: existing.health,
          renown: existing.renown,
          experience: existing.experience,
          rank: existing.rank,
          activeForm: existing.activeForm,
          activeRuleEffects: existing.activeRuleEffects,
        }
      : {}),
    fetishes: incoming.fetishes.filter((item) => !consumed.has(item.id)),
    equipment: incoming.equipment?.filter((item) => !consumed.has(item.id)),
    combatWeapons: incoming.combatWeapons.filter((item) => !consumed.has(item.id)),
    // Editors preserve the server's debit log, including transactions they have not seen yet.
    ruleActivationReceipts: existing.ruleActivationReceipts,
    updatedAt: nextSheetVersion(existing),
  };
}

function assertAmount(value: number, field: string, nonnegative = false): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (nonnegative && value < 0)) {
    throw new Error(`${field} must be ${nonnegative ? 'a non-negative' : 'an'} integer.`);
  }
}

export function applyRuleSpend(
  existing: W20UserCharacterSheet,
  input: RuleSpendInput,
  mutate?: (sheet: W20UserCharacterSheet) => W20UserCharacterSheet
): W20UserCharacterSheet {
  const receipts = existing.ruleActivationReceipts ?? [];
  if (input.ownerDiscordId && existing.ownerDiscordId !== input.ownerDiscordId) {
    throw new RuleSpendConflictError(
      'OWNER_MISMATCH',
      'This sheet belongs to a different owner.',
      existing
    );
  }
  if (receipts.includes(input.operationId)) return existing;
  if (!input.operationId || input.operationId.length > 512) {
    throw new Error('A durable operation ID of at most 512 characters is required.');
  }
  if (input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt) {
    throw new RuleSpendConflictError(
      'STALE',
      'The character changed before this action could commit.',
      existing
    );
  }
  if (input.requiredAbsentReceipts?.some((receipt) => receipts.includes(receipt))) {
    throw new RuleSpendConflictError(
      'ALREADY_USED',
      'This source has already been used for its documented limit.',
      existing
    );
  }

  const sourceIds = new Set(
    [
      ...existing.otherTraits,
      ...existing.backgrounds,
      ...existing.gifts,
      ...existing.rites,
      ...existing.fetishes,
      ...existing.combatWeapons,
      ...(existing.equipment ?? []),
    ].map((source) => source.id)
  );
  sourceIds.add('armor');
  if (existing.packTotem.trim()) sourceIds.add('pack-totem');
  for (const grant of existing.activeRuleEffects ?? []) {
    if (grant.grantedGift && (grant.remainingScenes === undefined || grant.remainingScenes > 0)) {
      sourceIds.add(`shared-gift:${grant.id}`);
    }
  }
  for (const id of [...(input.requiredSourceIds ?? []), ...(input.consumedSourceIds ?? [])]) {
    if (!sourceIds.has(id) || receipts.includes(`consumed:${id}`)) {
      throw new RuleSpendConflictError(
        'SOURCE_MISSING',
        'The selected source is missing or has already been consumed.',
        existing
      );
    }
  }

  const resources = {
    rage: { ...existing.rage },
    gnosis: { ...existing.gnosis },
    willpower: { ...existing.willpower },
  };
  for (const trait of ['rage', 'gnosis', 'willpower'] as const) {
    const cost = input.costs?.[trait] ?? 0;
    const delta = input.resourceDelta?.[trait] ?? -cost;
    const permanentDelta = input.permanentResourceDelta?.[trait] ?? 0;
    assertAmount(cost, `${trait} cost`, true);
    assertAmount(delta, `${trait} change`);
    assertAmount(permanentDelta, `${trait} permanent change`);
    if (
      existing[trait].temporary < cost ||
      existing[trait].temporary + delta < 0 ||
      existing[trait].permanent + permanentDelta < 0
    ) {
      throw new RuleSpendConflictError(
        'INSUFFICIENT_RESOURCE',
        `Insufficient ${trait} for this action.`,
        existing
      );
    }
    resources[trait] = {
      temporary: existing[trait].temporary + delta,
      permanent: existing[trait].permanent + permanentDelta,
    };
  }

  const debited = { ...existing, ...resources };
  const edited = mutate ? mutate(structuredClone(debited)) : debited;
  const consumed = new Set(input.consumedSourceIds ?? []);
  return {
    ...edited,
    id: existing.id,
    ownerDiscordId: existing.ownerDiscordId,
    createdAt: existing.createdAt,
    ...resources,
    fetishes: edited.fetishes.filter((item) => !consumed.has(item.id)),
    equipment: edited.equipment?.filter((item) => !consumed.has(item.id)),
    combatWeapons: edited.combatWeapons.filter((item) => !consumed.has(item.id)),
    ruleActivationReceipts: [
      ...new Set([
        ...receipts,
        input.operationId,
        ...(input.additionalReceipts ?? []),
        ...(input.consumedSourceIds ?? []).map((id) => `consumed:${id}`),
      ]),
    ],
    updatedAt: nextSheetVersion(existing),
  };
}
