import {
  computeEffectiveCharacterStats,
  type CombatEncounterState,
  type CombatEncounterView,
  type GarouForm,
  type MoonPhase,
  type RealmLayer,
  type SpecialtyMode,
  type W20CharacterState,
  type W20UserCharacterSheet,
  type ActiveRuleInstance,
  type W20RollRequest,
  type W20RollResult,
  type ModifierRule,
  type RuleSource,
  type RuleContext,
} from '@w20-vtt/core';
import type {
  AudioSyncPayload,
  FogBrushStroke,
  HandoutRevealPayload,
  PackTotemState,
  ParticipantRole,
  ProjectedMapToken,
  RollHistoryEntry,
  TableInitiativeEntry,
  RoomSnapshotView,
  ServerEnvelope,
  ServerEvent,
  SocketAttachment,
  TableParticipant,
  RoomRuleEffect,
  RoomRuleStateView,
  RuleClock,
} from '@w20-vtt/protocol';
import { canCorrectRuleRoll, getRerollOptions } from './ruleRerolls';
import type { SharedActionRecord, SharedRuleIntent } from './sharedRuleCommit';
import type { StoredStorytellerTable } from './voiceTableStoryteller';

export interface BoundRuleSheet {
  sheet: W20UserCharacterSheet;
  controlledByDiscordId: string;
  /** Version supplied by the editor, before room resource deductions. */
  editorUpdatedAt: number;
  canonicalKnown?: boolean;
}

export interface RuleRollRecord {
  sheetId: string;
  discordUserId: string;
  request: W20RollRequest;
  history: RollHistoryEntry;
  rerolled?: boolean;
  superseded?: boolean;
  refundedWillpower?: boolean;
  packKey?: string;
  minimumSuccesses?: number;
  activationClosed?: boolean;
}

export interface PendingRuleActivation {
  operationId: string;
  casterDiscordId: string;
  actorId: string;
  targetIds: string[];
  rule: ModifierRule;
  source: RuleSource;
  parentEffectIds?: string[];
  endsParent?: boolean;
  endParentOnEitherResult?: boolean;
  sourceReservation?: { sourceId: string; token: string };
  grantedGift?: ActiveRuleInstance['grantedGift'];
  choices: NonNullable<ActiveRuleInstance['ruleChoices']>;
  targetChoices: Record<string, NonNullable<ActiveRuleInstance['ruleChoices']>>;
  context: RuleContext;
  sourceTraits: Record<string, number>;
  choiceValue?: number;
  opposingSuccesses: number;
  privateRollerDiscordId?: string;
  referenceRollId?: string;
  roll: W20RollResult;
}

export interface PersistedRuleState {
  sheets: Record<string, BoundRuleSheet>;
  seatBindings: Record<string, string>;
  effects: RoomRuleEffect[];
  clock: RuleClock;
  /** Successful and failed activations both retain their result across reconnects. */
  activationReceipts: Record<string, Extract<ServerEvent, { type: 'RULE_ACTIVATION_RESOLVED' }>>;
  advanceReceipts: string[];
  rollReceipts: Record<string, RollHistoryEntry>;
  rollRequests: Record<string, RuleRollRecord>;
  pendingActivations?: Record<string, PendingRuleActivation>;
  rerollUsage: Record<string, number>;
  frequencyReceipts: string[];
  packWillpower?: { current: number; max: number };
  packPools: Record<string, { current: number; max: number; name: string }>;
  turnSpends: Record<string, { turn: number; rage: boolean; gnosis: boolean }>;
  persistenceQueue: RuleSheetMutation[];
  sharedActionRecords?: Record<string, SharedActionRecord>;
  seatAuthorizations: Record<string, { ownerDiscordId: string; syncCode?: string }>;
}

export interface RuleSheetMutation {
  grantWithdrawals?: Array<{
    effectId: string;
    resourceDelta: {rage: number; gnosis: number; willpower: number};
  }>;
  operationId: string;
  sheetId: string;
  sourceReservation?: { sourceId: string; token: string };
  resourceDelta: { rage: number; gnosis: number; willpower: number };
  consumedSourceIds: string[];
  effects: ActiveRuleInstance[];
  removedEffectIds: string[];
  renownDelta?: Partial<
    Record<'glory' | 'honor' | 'wisdom', { temporary: number; permanent: number }>
  >;
  experienceDelta?: number;
  mysticalExperienceDelta?: number;
  permanentResourceDelta?: { rage?: number; gnosis?: number; willpower?: number };
  healthChanges?: Array<{
    levels: number;
    type?: 'bashing' | 'lethal' | 'aggravated';
    healAggravated?: boolean;
    mode: 'damage' | 'heal';
  }>;
  rank?: number;
  activeForm?: GarouForm;
}

export function createEmptyRuleState(): PersistedRuleState {
  return {
    sheets: {},
    seatBindings: {},
    effects: [],
    clock: { turn: 0, scene: 0, story: 0, session: 0, seconds: 0 },
    activationReceipts: {},
    advanceReceipts: [],
    rollReceipts: {},
    rollRequests: {},
    rerollUsage: {},
    frequencyReceipts: [],
    packPools: {},
    turnSpends: {},
    persistenceQueue: [],
    seatAuthorizations: {},
  };
}

export interface StoredMapToken {
  id: string;
  characterId: string;
  name: string;
  x: number;
  y: number;
  form: GarouForm;
  realm: RealmLayer;
  portraitUrl: string;
  isHidden: boolean;
}

export interface PersistedRoomState {
  ruleCommitNamespace?: string;
  sharedRuleIntent?: SharedRuleIntent;
  campaignId: string | null;
  storytellerDiscordId: string | null;
  diceLogWebhookUrl: string | null;
  guildId: string | null;
  seq: number;
  localGauntlet: number;
  moonPhase: MoonPhase;
  specialtyMode: SpecialtyMode;
  mapAssetUrl: string | null;
  fogStrokes: FogBrushStroke[];
  audioState: AudioSyncPayload | null;
  activeHandout: HandoutRevealPayload | null;
  packTotem: PackTotemState | null;
  safetyPaused: boolean;
  safetyPauseReason: string | null;
  characters: Record<string, W20CharacterState>;
  persistedCharacterIds: string[];
  tokens: StoredMapToken[];
  combat: CombatEncounterState | null;
  tableParticipants?: Record<string, TableParticipant>;
  rollHistory?: RollHistoryEntry[];
  /** Shared initiative order for dice rooms. Separate from the campaign combat machine. */
  tableInitiative?: TableInitiativeEntry[];
  tableInitiativeClearReceipts?: string[];
  storytellerTable?: StoredStorytellerTable;
  ruleState?: PersistedRuleState;
}

export interface BufferedRoomEvent {
  seq: number;
  targetRole: ParticipantRole | null;
  targetDiscordId: string | null;
  envelope: ServerEnvelope<ServerEvent>;
  rawTokensSnapshot?: StoredMapToken[];
  rawCombatSnapshot?: CombatEncounterState | null;
}

export function createEmptyRoomState(): PersistedRoomState {
  return {
    campaignId: null,
    storytellerDiscordId: null,
    diceLogWebhookUrl: null,
    guildId: null,
    seq: 0,
    localGauntlet: 6,
    moonPhase: 'half',
    specialtyMode: 'w20_double',
    mapAssetUrl: null,
    fogStrokes: [],
    audioState: null,
    activeHandout: null,
    packTotem: null,
    safetyPaused: false,
    safetyPauseReason: null,
    characters: {},
    persistedCharacterIds: [],
    tokens: [],
    combat: null,
    tableParticipants: {},
    rollHistory: [],
    tableInitiative: [],
    ruleState: createEmptyRuleState(),
  };
}

export function computeWoundBadge(char: W20CharacterState | undefined): string {
  if (!char) {
    return 'Healthy';
  }
  return computeEffectiveCharacterStats(char).woundLabel;
}

export function resolveViewerRealm(
  attachment: Pick<SocketAttachment, 'role' | 'activeCharacterId'>,
  characters: Record<string, W20CharacterState>,
): RealmLayer {
  if (attachment.role === 'storyteller') {
    return 'physical';
  }
  if (attachment.activeCharacterId && characters[attachment.activeCharacterId]) {
    return characters[attachment.activeCharacterId]!.activeRealm;
  }
  return 'physical';
}

export function projectCharactersForRole(
  characters: Record<string, W20CharacterState>,
  role: ParticipantRole,
): Record<string, W20CharacterState> {
  const projected: Record<string, W20CharacterState> = {};
  for (const [id, char] of Object.entries(characters)) {
    if (role !== 'storyteller' && char.isNpc) {
      continue;
    }
    projected[id] = char;
  }
  return projected;
}

export function projectTokensForViewer(
  tokens: StoredMapToken[],
  characters: Record<string, W20CharacterState>,
  viewerRole: ParticipantRole,
  viewerRealm: RealmLayer,
): ProjectedMapToken[] {
  const result: ProjectedMapToken[] = [];
  for (const token of tokens) {
    if (viewerRole !== 'storyteller') {
      if (token.isHidden) {
        continue;
      }
      if (viewerRealm === 'physical' && token.realm !== 'physical') {
        continue;
      }
      if (viewerRealm === 'penumbra' && token.realm === 'deep_umbra') {
        continue;
      }
      if (viewerRealm === 'deep_umbra' && token.realm !== 'deep_umbra') {
        continue;
      }
    }

    const visibilityMode =
      viewerRole !== 'storyteller' && viewerRealm === 'penumbra' && token.realm === 'physical'
        ? 'gauntlet_silhouette'
        : 'full';

    const char = characters[token.characterId];
    result.push({
      id: token.id,
      characterId: token.characterId,
      name: token.name,
      x: token.x,
      y: token.y,
      form: token.form,
      realm: token.realm,
      portraitUrl: token.portraitUrl,
      visibilityMode,
      woundBadge: computeWoundBadge(char),
      ...(viewerRole === 'storyteller' ? { isHidden: token.isHidden } : {}),
    });
  }
  return result;
}

export function projectCombatForRole(
  combat: CombatEncounterState | null,
  role: ParticipantRole,
): CombatEncounterView | null {
  if (!combat) {
    return null;
  }
  const projectedCombatants: CombatEncounterView['combatants'] = {};
  for (const [id, entry] of Object.entries(combat.combatants)) {
    const hideNpcRage = role !== 'storyteller' && combat.phase === 'PRE_ROUND_RAGE' && entry.isNpc;
    projectedCombatants[id] = {
      ...entry,
      declaredRageActions: hideNpcRage ? 'hidden' : entry.declaredRageActions,
    };
  }
  return {
    ...combat,
    combatants: projectedCombatants,
  };
}

export function buildProjectedSnapshot(
  state: PersistedRoomState,
  attachment: Pick<SocketAttachment, 'role' | 'activeCharacterId'> & { discordUserId?: string },
  speakingDiscordIds: string[],
): RoomSnapshotView {
  const viewerRealm = resolveViewerRealm(attachment, state.characters);
  return {
    campaignId: state.campaignId ?? '',
    localGauntlet: state.localGauntlet,
    moonPhase: state.moonPhase,
    specialtyMode: state.specialtyMode,
    mapAssetUrl: state.mapAssetUrl,
    fogStrokes: state.fogStrokes,
    audioState: state.audioState,
    activeHandout: state.activeHandout,
    packTotem: state.packTotem,
    safetyPaused: state.safetyPaused,
    safetyPauseReason: state.safetyPauseReason,
    viewerRole: attachment.role,
    viewerRealm,
    speakingDiscordIds,
    characters: projectCharactersForRole(state.characters, attachment.role),
    tokens: projectTokensForViewer(state.tokens, state.characters, attachment.role, viewerRealm),
    combat: projectCombatForRole(state.combat, attachment.role),
    participants: Object.values(state.tableParticipants ?? {}),
    rollHistory: (state.rollHistory ?? []).filter(
      (entry) =>
        !entry.isSecretRoll ||
        attachment.role === 'storyteller' ||
        entry.rollerDiscordId === attachment.discordUserId,
    ),
    tableInitiative: state.tableInitiative ?? [],
    ruleState: projectRuleState(state, attachment),
  };
}

export function projectRuleState(
  state: PersistedRoomState,
  attachment: Pick<SocketAttachment, 'role'> & { discordUserId?: string },
): RoomRuleStateView {
  const rules = state.ruleState ?? createEmptyRuleState();
  const visibleIds = new Set(
    Object.values(rules.sheets)
      .filter((record) => record.controlledByDiscordId === attachment.discordUserId || Object.entries(rules.seatBindings).some(([key, id]) => id === record.sheet.id && (key === attachment.discordUserId || key.startsWith(`${attachment.discordUserId}::`))))
      .map((record) => record.sheet.id),
  );
  for (const character of Object.values(state.characters)) {
    if (attachment.role === 'storyteller' || character.ownerDiscordId === attachment.discordUserId) {
      visibleIds.add(character.id);
    }
  }
  return {
    sheets: Object.values(rules.sheets)
      .filter((record) => visibleIds.has(record.sheet.id))
      .map((record) => record.sheet),
    effects: rules.effects.filter(
      (effect) =>
        visibleIds.has(effect.targetId) || effect.casterDiscordId === attachment.discordUserId,
    ),
    correctableRollIds: Object.values(rules.rollRequests).filter((original) =>
      original.discordUserId === attachment.discordUserId && visibleIds.has(original.sheetId) &&
      canCorrectRuleRoll(rules, original)).map((original) => original.history.id),
    rerollOptions: Object.values(rules.rollRequests).flatMap((original) => {
      const sheet = rules.sheets[original.sheetId]?.sheet;
      if (original.discordUserId !== attachment.discordUserId || !visibleIds.has(original.sheetId) || !sheet) return [];
      return getRerollOptions(state, sheet, original).map(({ ruleId, name, remaining, gnosisCost }) =>
        ({ rollId: original.history.id, sheetId: sheet.id, ruleId, name, remaining, gnosisCost }));
    }),
    pendingActivations: Object.entries(rules.pendingActivations ?? {}).flatMap(([rollId, pending]) => {
      const original = rules.rollRequests[rollId];
      return original && original.discordUserId === attachment.discordUserId && visibleIds.has(original.sheetId)
        ? [{ rollId, sheetId: original.sheetId, label: pending.rule.name, roll: pending.roll }]
        : [];
    }),
    clock: { ...rules.clock },
    packWillpower: rules.packWillpower,
    packPools: Object.fromEntries(Object.entries(rules.packPools).filter(([key]) => attachment.role === 'storyteller' || Object.values(rules.sheets).some((record) => visibleIds.has(record.sheet.id) && record.sheet.packName.trim().toLowerCase() === key))),
  };
}

export function isEntryVisibleToAttachment(
  entry: Pick<BufferedRoomEvent, 'targetRole' | 'targetDiscordId'>,
  attachment: Pick<SocketAttachment, 'role' | 'discordUserId'>,
): boolean {
  if (entry.targetRole && entry.targetRole === 'storyteller' && attachment.role !== 'storyteller') {
    return false;
  }
  if (
    entry.targetDiscordId &&
    attachment.role !== 'storyteller' &&
    entry.targetDiscordId !== attachment.discordUserId
  ) {
    return false;
  }
  return true;
}

export function projectEnvelopeForAttachment(
  entry: BufferedRoomEvent,
  state: PersistedRoomState,
  attachment: Pick<SocketAttachment, 'role' | 'discordUserId' | 'activeCharacterId'>,
): ServerEnvelope<ServerEvent> | null {
  if (!isEntryVisibleToAttachment(entry, attachment)) {
    return null;
  }

  const { envelope } = entry;
  const event = envelope.event;
  const viewerRealm = resolveViewerRealm(attachment, state.characters);

  if (event.type === 'RULE_STATE_UPDATED') {
    return {
      ...envelope,
      event: { type: 'RULE_STATE_UPDATED', state: projectRuleState(state, attachment) },
    };
  }

  if (event.type === 'CHARACTER_PATCHED') {
    if (event.character.isNpc && attachment.role !== 'storyteller') {
      return null;
    }
    return envelope;
  }

  if (event.type === 'DICE_ROLLED_3D') {
    if (
      event.isSecretStRoll &&
      attachment.role !== 'storyteller' &&
      event.rollerDiscordId !== attachment.discordUserId
    ) {
      return null;
    }
    return envelope;
  }

  if (event.type === 'WHISPER_RECEIVED') {
    if (
      attachment.role !== 'storyteller' &&
      event.whisper.targetDiscordId !== attachment.discordUserId
    ) {
      return null;
    }
    return envelope;
  }

  if (event.type === 'TOKENS_UPDATED') {
    const tokenSource = entry.rawTokensSnapshot ?? state.tokens;
    return {
      ...envelope,
      event: {
        type: 'TOKENS_UPDATED',
        tokens: projectTokensForViewer(
          tokenSource,
          state.characters,
          attachment.role,
          viewerRealm,
        ),
      },
    };
  }

  if (event.type === 'COMBAT_STATE_UPDATED') {
    const combatSource =
      entry.rawCombatSnapshot !== undefined ? entry.rawCombatSnapshot : state.combat;
    return {
      ...envelope,
      event: {
        type: 'COMBAT_STATE_UPDATED',
        combat: projectCombatForRole(combatSource, attachment.role),
        transitionReason: event.transitionReason,
      },
    };
  }

  return envelope;
}
