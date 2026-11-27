import {
  compactRuleReceipts,
  applyHealthStateDamage,
  healHealthStateDamage,
  type W20UserCharacterSheet,
  type W20RollResult,
} from '@w20-vtt/core';
import type {
  ClientCommand,
  CommandRejectionCode,
  ParticipantRole,
  ServerEvent,
  SocketAttachment,
} from '@w20-vtt/protocol';
import type { PersistedRoomState, RuleSheetMutation, StoredMapToken } from './roomProjection';
import type { RuleSpendInput } from './userSheetStore';

export type SharedRuleCommand = Extract<
  ClientCommand,
  {
    type:
      | 'ACTIVATE_RULE'
      | 'ROLL_TABLE_POOL'
      | 'REROLL_RULE_ROLL'
      | 'KEEP_ACTIVATION_RESULT'
      | 'APPLY_RULE_EVENT'
      | 'END_RULE_EFFECT';
  }
>;

export interface SharedRuleOutbound {
  event: ServerEvent;
  targetRole?: ParticipantRole | null;
  targetDiscordId?: string | null;
  rawTokensSnapshot?: StoredMapToken[];
  rawCombatSnapshot?: PersistedRoomState['combat'];
}

export type SharedRuleEmission =
  | { kind: 'commit'; pending: SharedRuleOutbound[]; replyToReqId?: string }
  | { kind: 'ephemeral'; event: ServerEvent; replyToReqId?: string };

export interface SharedActionRecord {
  fingerprint: string;
  payerSheetId?: string;
  rejection?: { code: CommandRejectionCode; message: string };
  replay?: ServerEvent[];
}

export interface SharedRuleIntent {
  id: string;
  actionKey: string;
  operationSeed: string;
  fingerprint: string;
  reqId: string;
  requesterDiscordId: string;
  attachment: SocketAttachment & { authenticated: boolean; avatarUrl?: string | null };
  command: SharedRuleCommand;
  authorization: RuleSpendInput;
  requiresAuthorization?: boolean;
  mutations: RuleSheetMutation[];
  stagedState: Omit<PersistedRoomState, 'sharedRuleIntent'>;
  emissions: SharedRuleEmission[];
  characterFlushIds: string[];
  audits: Array<{
    campaignId: string;
    characterId?: string | null;
    rollerDiscordId: string;
    rollerName: string;
    label: string;
    roll: W20RollResult;
    hasSpecialty?: boolean;
    spentWillpower?: boolean;
    isSecretStRoll?: boolean;
  }>;
}

export class StagedRuleRejection extends Error {
  constructor(
    public readonly code: CommandRejectionCode,
    message: string
  ) {
    super(message);
  }
}

/** Reconstructable from a durable intent, so a lost provider acknowledgement never re-rolls dice. */
export function applyRuleSheetMutation(
  sheet: W20UserCharacterSheet,
  mutation: RuleSheetMutation
): W20UserCharacterSheet {
  if (sheet.ruleActivationReceipts?.includes(mutation.operationId)) return sheet;
  const renown = { ...sheet.renown };
  for (const trait of ['glory', 'honor', 'wisdom'] as const) {
    const delta = mutation.renownDelta?.[trait];
    if (delta)
      renown[trait] = {
        temporary: Math.max(0, renown[trait].temporary + delta.temporary),
        permanent: Math.max(0, Math.min(10, renown[trait].permanent + delta.permanent)),
      };
  }
  let health = sheet.health;
  for (const change of mutation.healthChanges ?? [])
    health =
      change.mode === 'damage'
        ? applyHealthStateDamage(health, change.levels, change.type ?? 'bashing')
        : healHealthStateDamage(health, change.levels, { healAggravated: change.healAggravated });
  return {
    ...sheet,
    rage: {
      permanent: Math.max(0, sheet.rage.permanent + (mutation.permanentResourceDelta?.rage ?? 0)),
      temporary: Math.max(0, sheet.rage.temporary + mutation.resourceDelta.rage),
    },
    gnosis: {
      permanent: Math.max(
        0,
        sheet.gnosis.permanent + (mutation.permanentResourceDelta?.gnosis ?? 0)
      ),
      temporary: Math.max(0, sheet.gnosis.temporary + mutation.resourceDelta.gnosis),
    },
    willpower: {
      permanent: Math.max(
        0,
        sheet.willpower.permanent + (mutation.permanentResourceDelta?.willpower ?? 0)
      ),
      temporary: Math.max(0, sheet.willpower.temporary + mutation.resourceDelta.willpower),
    },
    renown,
    health,
    ...(mutation.rank !== undefined ? { rank: mutation.rank } : {}),
    ...(mutation.activeForm !== undefined ? { activeForm: mutation.activeForm } : {}),
    experience: {
      ...sheet.experience,
      total: sheet.experience.total + (mutation.experienceDelta ?? 0),
      mystical: (sheet.experience.mystical ?? 0) + (mutation.mysticalExperienceDelta ?? 0),
    },
    fetishes: sheet.fetishes.filter((item) => !mutation.consumedSourceIds.includes(item.id)),
    equipment: sheet.equipment?.filter((item) => !mutation.consumedSourceIds.includes(item.id)),
    combatWeapons: sheet.combatWeapons.filter(
      (item) => !mutation.consumedSourceIds.includes(item.id)
    ),
    activeRuleEffects: [
      ...(sheet.activeRuleEffects ?? []).filter(
        (instance) =>
          !mutation.removedEffectIds.includes(instance.id) &&
          !mutation.effects.some((effect) => effect.id === instance.id)
      ),
      ...mutation.effects,
    ],
    ruleActivationReceipts: compactRuleReceipts([
      ...(sheet.ruleActivationReceipts ?? []),
      mutation.operationId,
      ...mutation.consumedSourceIds.map((id) => `consumed:${id}`),
    ]),
    updatedAt: Math.max(Date.now(), sheet.updatedAt + 1),
  };
}

/** Rebase an expiry against remaining canonical grants, preserving points earned elsewhere. */
export function applyCanonicalGrantCleanup(
  sheet: W20UserCharacterSheet,
  mutation: RuleSheetMutation
): W20UserCharacterSheet {
  if (sheet.ruleActivationReceipts?.includes(mutation.operationId)) return sheet;
  const traits = ['rage', 'gnosis', 'willpower'] as const;
  const ended = new Set(
    (sheet.ruleActivationReceipts ?? [])
      .filter((receipt) => receipt.startsWith('grant-ended:'))
      .map((receipt) => receipt.slice('grant-ended:'.length))
  );
  const deltas = { ...mutation.resourceDelta };
  const withdrawals = new Map<string, NonNullable<RuleSheetMutation['grantWithdrawals']>[number]>();
  for (const withdrawal of mutation.grantWithdrawals ?? []) {
    if (!withdrawals.has(withdrawal.effectId)) withdrawals.set(withdrawal.effectId, withdrawal);
    for (const trait of traits) {
      const planned = withdrawal.resourceDelta[trait];
      if (!Number.isInteger(planned) || planned > 0) {
        throw new Error('A planned grant withdrawal must use non-positive integer deltas.');
      }
      // Remove the old cached deduction before calculating the actual remaining grant.
      deltas[trait] -= planned;
    }
  }
  for (const trait of traits) {
    if (sheet[trait].temporary + deltas[trait] < 0) {
      throw new Error(`Insufficient ${trait} for the non-grant portion of this mutation.`);
    }
  }
  for (const withdrawal of withdrawals.values()) {
    if (!ended.has(withdrawal.effectId)) {
      const canonical = sheet.activeRuleEffects?.find(
        (effect) => effect.id === withdrawal.effectId
      );
      for (const trait of traits) {
        const available = sheet[trait].temporary + deltas[trait];
        const remainingGrant = Math.max(0, canonical?.resourceGrants?.[trait] ?? 0);
        deltas[trait] -= Math.min(available, remainingGrant);
      }
    }
    ended.add(withdrawal.effectId);
  }
  const effects = mutation.effects
    .filter((effect) => !ended.has(effect.id))
    .map((effect) => {
      const canonical = sheet.activeRuleEffects?.find((current) => current.id === effect.id);
      if (!canonical?.resourceGrants) return effect;
      const resourceGrants = { ...canonical.resourceGrants };
      for (const trait of traits) {
        resourceGrants[trait] = Math.min(
          canonical.resourceGrants[trait] ?? 0,
          effect.resourceGrants?.[trait] ?? canonical.resourceGrants[trait] ?? 0
        );
      }
      return { ...effect, resourceGrants };
    });
  const next = applyRuleSheetMutation(sheet, {
    ...mutation,
    resourceDelta: deltas,
    effects,
    removedEffectIds: [...new Set([...mutation.removedEffectIds, ...withdrawals.keys()])],
  });
  return {
    ...next,
    activeRuleEffects: next.activeRuleEffects?.filter((effect) => !ended.has(effect.id)),
    ruleActivationReceipts: [
      ...new Set([
        ...(next.ruleActivationReceipts ?? []),
        ...[...ended].map((id) => `grant-ended:${id}`),
      ]),
    ],
  };
}
