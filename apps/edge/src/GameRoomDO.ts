import { DurableObject } from 'cloudflare:workers';
import {
  advanceEndOfRound,
  applyHealthDamage,
  applyHealthStateDamage,
  healHealthStateDamage,
  getRuleResultTriggers,
  resolveRuleShift,
  getW20RankRenownRequirement,
  buildSharedGiftGrant,
  computeEffectiveCharacterStats,
  createCombatEncounter,
  declarePreInitiativeResources,
  executeActiveCombatSlot,
  executeW20Macro,
  forceStorytellerOverride,
  getBreedNaturalForm,
  healHealthDamage,
  MOON_BASE_FRENZY_DIFF,
  resolveDefenderReactionAndDamage,
  resolveFrenzyCheck,
  resolveW20DicePool,
  resolveW20InitiativeRoll,
  resolveW20Specialty,
  rollCsprngD10,
  rollRoundInitiative,
  submitReverseDeclaration,
  triggerHoldInterrupt,
  validateResourceSpend,
  W20_FORM_MATRIX,
  computeUserSheetStats,
  computeWoundState,
  resolveSheetShortcut,
  resolveCharacterRuleRoll,
  evaluateModifierRules,
  getSheetModifierSources,
  getCharacterModifierSources,
  getSourceModifierRule,
  applyRuleValue,
  hasUnacknowledgedRuleReceipts,
  ruleTraits,
  type AppliedRuleModifier,
  type W20UserCharacterSheet,
  type RuleContext,
  type W20CharacterState,
  type W20RollResult,
  type W20RollRequest,
} from '@w20-vtt/core';
import {
  parseClientEnvelope,
  STORYTELLER_ROLL_HISTORY_LIMIT,
  type AudioSyncPayload,
  type ClientCommand,
  type ClientEnvelope,
  type CommandRejectionCode,
  type LightGarouTrackers,
  type ParticipantRole,
  type RollHistoryEntry,
  type ServerEnvelope,
  type ServerEvent,
  type SocketAttachment,
  type TableParticipant,
} from '@w20-vtt/protocol';
import { verifySessionJwt } from './discordOAuth';
import type { WorkerEnv } from './env';
import { createNpcFromTemplate } from './npcTemplates';
import {
  buildProjectedSnapshot,
  createEmptyRoomState,
  createEmptyRuleState,
  projectRuleState,
  isEntryVisibleToAttachment,
  projectEnvelopeForAttachment,
  type BufferedRoomEvent,
  type PersistedRoomState,
  type StoredMapToken,
  type RuleSheetMutation,
  type PendingRuleActivation,
} from './roomProjection';
import { SupabaseRestClient } from './supabaseRest';
import { UserSheetRepository, RuleSpendConflictError, type RuleSpendInput } from './userSheetStore';
import { applyRuleSheetMutation, applyCanonicalGrantCleanup, StagedRuleRejection, type SharedRuleCommand, type SharedRuleEmission, type SharedRuleIntent } from './sharedRuleCommit';
import { canCorrectRuleRoll, FAIR_FORTUNE_RULE_ID, getRerollOptions } from './ruleRerolls';
import { reserveRuleSourceReceipt } from './userSheetTransactions';
import { SharedActionReplies } from './sharedActionReplies';
import { isMockDiscordId } from './devMockAuth';
import {
  projectStorytellerInitiative,
  projectStorytellerSeats,
  readVoiceTableStorytellers,
  VOICE_TABLE_PREFIX,
} from './voiceTableStoryteller';
import {
  activationCosts,
  allocationLimit,
  actorWithEffects,
  advanceRuleEffect,
  createRoomRuleEffect,
  captureRuleTraits,
  findActorRule,
  isRuleSheet,
  rollRuleActivation,
  validateRuleChoices,
  type RuleActor,
} from './ruleLifecycle';

const EVENT_RING_CAPACITY = 100;
const MAX_FOG_STROKES = 2000;

interface InternalSocketAttachment extends SocketAttachment {
  authenticated: boolean;
  routedRoomId?: string;
  isSpeaking?: boolean;
  avatarUrl?: string | null;
}

type StorytellerRollCommand = Extract<ClientCommand, { type: 'ST_ROLL_TABLE_POOL' | 'ST_ROLL_TABLE_INITIATIVE' }>;
type StorytellerTableEvent = Extract<ServerEvent, {
  type: 'STORYTELLER_TABLE_SYNC' | 'STORYTELLER_ROLL_RECORDED' | 'STORYTELLER_INITIATIVE_UPDATED' | 'STORYTELLER_SEATS_UPDATED';
}>;

function normalizeSeatId(seatId?: string | null): string {
  const trimmed = seatId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'primary';
}

function buildParticipantKey(discordUserId: string, seatId?: string | null): string {
  const normalizedSeat = normalizeSeatId(seatId);
  return normalizedSeat === 'primary'
    ? discordUserId
    : `${discordUserId}::${normalizedSeat}`;
}

function formatRollerName(
  participant: Pick<TableParticipant, 'displayName' | 'characterName'>,
  fallbackDisplayName: string,
  explicitRollerDisplayName?: string,
): string {
  const explicit = explicitRollerDisplayName?.trim();
  if (explicit) {
    return explicit;
  }
  const charName = participant.characterName?.trim();
  const displayName = participant.displayName || fallbackDisplayName;
  if (charName) {
    return `${charName} (${displayName})`;
  }
  return displayName;
}

interface PendingOutboundEvent {
  event: ServerEvent;
  targetRole?: ParticipantRole | null;
  targetDiscordId?: string | null;
  rawTokensSnapshot?: StoredMapToken[];
  rawCombatSnapshot?: PersistedRoomState['combat'];
}

interface DeferredRollAudit {
  campaignId: string;
  characterId?: string | null;
  rollerDiscordId: string;
  rollerName: string;
  label: string;
  roll: W20RollResult;
  hasSpecialty?: boolean;
  spentWillpower?: boolean;
  isSecretStRoll?: boolean;
}

interface SharedRuleStage {
  payerSheetId: string;
  operationSeed: string;
  emissions: SharedRuleEmission[];
  costs: { rage: number; gnosis: number; willpower: number };
  requiredSourceIds: string[];
  requiredAbsentReceipts: string[];
  characterFlushIds: string[];
  audits: DeferredRollAudit[];
}

function classifyCoreErrorCode(message: string): CommandRejectionCode {
  const lower = message.toLowerCase();
  if (lower.includes('golden rule') || (lower.includes('rage') && lower.includes('gnosis'))) {
    return 'RAGE_GNOSIS_CONFLICT';
  }
  if (
    lower.includes('insufficient') ||
    lower.includes('no banked rage') ||
    lower.includes('requires 1 temporary') ||
    lower.includes('requires spirit') ||
    lower.includes('at least 1 temporary')
  ) {
    return 'INSUFFICIENT_RESOURCE';
  }
  if (
    lower.includes('slower combatants') ||
    lower.includes('not this combatant') ||
    lower.includes('only the targeted defender')
  ) {
    return 'OUT_OF_TURN';
  }
  if (
    lower.includes('phase') ||
    lower.includes('only allowed') ||
    lower.includes('only accepted') ||
    lower.includes('only be rolled') ||
    lower.includes('can only advance') ||
    lower.includes('no pending attack') ||
    lower.includes('outside resolution')
  ) {
    return 'INVALID_PHASE';
  }
  return 'VALIDATION_ERROR';
}

function isAllowedWebhookUrl(rawUrl: string | null | undefined): rawUrl is string {
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const allowedHosts = new Set([
      'discord.com',
      'discordapp.com',
      'canary.discord.com',
      'ptb.discord.com',
    ]);
    return allowedHosts.has(parsed.hostname) && parsed.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

export class GameRoomDO extends DurableObject<WorkerEnv> {
  private roomState: PersistedRoomState = createEmptyRoomState();
  private eventRing: BufferedRoomEvent[] = [];
  private hydrationPromise: Promise<boolean> | null = null;
  private rulePersistencePromise: Promise<void> | null = null;
  private readonly pendingRuleBindings = new Map<string, Promise<void>>();
  private readonly pendingRuleCharacterIds = new Set<string>();
  private pendingRuleTokenUpdate = false;
  private roomOperations: Promise<void> = Promise.resolve();
  private sharedRuleStage: SharedRuleStage | null = null;
  private readonly sharedActionReplies: SharedActionReplies;
  private readonly voiceTableStorytellers: ReadonlyMap<string, string>;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.voiceTableStorytellers = readVoiceTableStorytellers(env.VOICE_TABLE_STORYTELLERS);
    this.sharedActionReplies = new SharedActionReplies(this.ctx.storage);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_event_ring (
          seq INTEGER PRIMARY KEY,
          target_role TEXT,
          target_discord_id TEXT,
          envelope_json TEXT NOT NULL,
          raw_tokens_json TEXT,
          raw_combat_json TEXT
        );
      `);

      const stateRows = this.ctx.storage.sql
        .exec<{ state_json: string }>('SELECT state_json FROM room_state WHERE id = 1')
        .toArray();
      if (stateRows[0]?.state_json) {
        this.roomState = JSON.parse(stateRows[0].state_json) as PersistedRoomState;
      }
      this.roomState.ruleState = { ...createEmptyRuleState(), ...this.roomState.ruleState };
      this.roomState.ruleState.clock = {
        ...createEmptyRuleState().clock,
        ...this.roomState.ruleState.clock,
      };
      for (const [key, record] of Object.entries(this.roomState.ruleState.sharedActionRecords ?? {})) this.sharedActionReplies.put(key, record);
      delete this.roomState.ruleState.sharedActionRecords;
      if (!this.roomState.ruleCommitNamespace) {
        this.roomState.ruleCommitNamespace = crypto.randomUUID();
        this.persistStateSnapshot();
      }

      const ringRows = this.ctx.storage.sql
        .exec<{
          seq: number;
          target_role: ParticipantRole | null;
          target_discord_id: string | null;
          envelope_json: string;
          raw_tokens_json: string | null;
          raw_combat_json: string | null;
        }>(
          'SELECT seq, target_role, target_discord_id, envelope_json, raw_tokens_json, raw_combat_json FROM room_event_ring ORDER BY seq ASC',
        )
        .toArray();

      this.eventRing = ringRows.map((row) => ({
        seq: Number(row.seq),
        targetRole: row.target_role ?? null,
        targetDiscordId: row.target_discord_id ?? null,
        envelope: JSON.parse(row.envelope_json) as ServerEnvelope<ServerEvent>,
        ...(row.raw_tokens_json
          ? { rawTokensSnapshot: JSON.parse(row.raw_tokens_json) as StoredMapToken[] }
          : {}),
        ...(row.raw_combat_json !== null
          ? {
              rawCombatSnapshot: JSON.parse(row.raw_combat_json) as PersistedRoomState['combat'],
            }
          : {}),
      }));
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade.', { status: 426 });
    }
    const encodedRoomId = /^\/ws\/room\/([^/]+)$/.exec(new URL(request.url).pathname)?.[1];
    let routedRoomId: string;
    try {
      routedRoomId = encodedRoomId ? decodeURIComponent(encodedRoomId).trim() : '';
    } catch {
      return new Response('Invalid room ID.', { status: 400 });
    }
    if (!routedRoomId) return new Response('Invalid room ID.', { status: 400 });

    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];

    const initialAttachment: InternalSocketAttachment = {
      discordUserId: '',
      displayName: '',
      role: 'player',
      activeCharacterId: null,
      connectedAt: Date.now(),
      authenticated: false,
      routedRoomId,
      isSpeaking: false,
      avatarUrl: null,
    };

    this.ctx.acceptWebSocket(serverSocket);
    serverSocket.serializeAttachment(initialAttachment);

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  }

  private withRoomLock<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.roomOperations.then(operation, operation);
    this.roomOperations = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.withRoomLock(() => this.processWebSocketMessage(ws, message));
  }

  private async processWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const rawText = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const parsed = parseClientEnvelope(rawText);
    if (!parsed.success) {
      this.sendRejection(ws, parsed.reqId, 'VALIDATION_ERROR', parsed.error);
      return;
    }

    const envelope = parsed.data;
    const attachment = this.getAttachment(ws);

    if (envelope.command.type === 'PING') {
      return;
    }

    if (envelope.command.type === 'HELLO_AUTH') {
      await this.handleHelloAuth(ws, envelope, envelope.command);
      await this.resumeSharedRuleIntent();
      return;
    }

    if (!attachment.authenticated || !attachment.discordUserId) {
      this.sendRejection(ws, envelope.reqId, 'UNAUTHORIZED', 'Authenticate with HELLO_AUTH first.');
      return;
    }

    if (envelope.command.type === 'VOICE_SPEAKING_STATE') {
      this.handleVoiceSpeakingState(ws, attachment, envelope.command.isSpeaking, envelope.reqId);
      return;
    }

    const isPrivateStorytellerRoll = envelope.command.type === 'ST_ROLL_TABLE_POOL' ||
      envelope.command.type === 'ST_ROLL_TABLE_INITIATIVE';
    if (!isPrivateStorytellerRoll && this.roomState.sharedRuleIntent && !(await this.resumeSharedRuleIntent())) {
      this.sendRejection(ws, envelope.reqId, 'VALIDATION_ERROR', 'A previous action is awaiting shared storage confirmation. It will recover without a second charge.');
      return;
    }

    if (
      this.roomState.safetyPaused &&
      envelope.command.type !== 'SAFETY_RESUME' &&
      envelope.command.type !== 'SAFETY_X_CARD_PAUSE' &&
      envelope.command.type !== 'ST_SEND_WHISPER'
    ) {
      this.sendRejection(
        ws,
        envelope.reqId,
        'INVALID_PHASE',
        'Table is currently paused by X-Card safety check.',
      );
      return;
    }

    if (envelope.command.type === 'UPDATE_LIGHT_TRACKERS') {
      this.handleUpdateLightTrackers(ws, attachment, envelope.command, envelope.reqId);
      return;
    }

    if (envelope.command.type === 'SYNC_CLIENT_SEATS') {
      this.handleSyncClientSeats(attachment, envelope.command, envelope.reqId);
      return;
    }

    if (envelope.command.type === 'BIND_TABLE_SHEET') {
      const key = buildParticipantKey(attachment.discordUserId, envelope.command.seatId);
      const previous = this.pendingRuleBindings.get(key);
      const binding = (async () => {
        if (previous) await previous;
        await this.handleBindTableSheet(
          ws,
          attachment,
          envelope.command as Extract<ClientCommand, { type: 'BIND_TABLE_SHEET' }>,
          envelope.reqId
        );
      })();
      this.pendingRuleBindings.set(key, binding);
      await binding;
      if (this.pendingRuleBindings.get(key) === binding) this.pendingRuleBindings.delete(key);
      return;
    }

    if (envelope.command.type === 'PREVIEW_RULE_ROLL') {
      try {
        await this.pendingRuleBindings.get(
          buildParticipantKey(attachment.discordUserId, envelope.command.seatId)
        );
        const sheet = this.requireBoundSheet(
          attachment,
          envelope.command.seatId,
          envelope.command.sheetId
        );
        const resolved = this.resolveTableRuleRoll(
          sheet,
          envelope.command.shortcut,
          envelope.command.context,
          attachment
        );
        ws.send(
          JSON.stringify({
            seq: this.roomState.seq,
            replyToReqId: envelope.reqId,
            serverTime: Date.now(),
            event: { type: 'RULE_ROLL_PREVIEW', sheetId: sheet.id, ...resolved },
          })
        );
      } catch (error) {
        this.sendRejection(
          ws,
          envelope.reqId,
          'VALIDATION_ERROR',
          error instanceof Error ? error.message : 'Unable to preview this roll.'
        );
      }
      return;
    }

    if (
      envelope.command.type === 'ACTIVATE_RULE' ||
      envelope.command.type === 'END_RULE_EFFECT' ||
      envelope.command.type === 'ADVANCE_RULE_CLOCK'
    ) {
      if ('seatId' in envelope.command)
        await this.pendingRuleBindings.get(
          buildParticipantKey(attachment.discordUserId, envelope.command.seatId)
        );
      const command = envelope.command;
      if (command.type === 'END_RULE_EFFECT' || command.type === 'ACTIVATE_RULE' && !command.characterId) await this.executeSharedRuleCommand(ws, attachment, command, envelope.reqId, () => this.handleRuleCommand(ws, attachment, command, envelope.reqId));
      else this.handleRuleCommand(ws, attachment, command, envelope.reqId);
      return;
    }

    if (
      envelope.command.type === 'APPLY_RULE_EVENT' ||
      envelope.command.type === 'REROLL_RULE_ROLL' ||
      envelope.command.type === 'KEEP_ACTIVATION_RESULT'
    ) {
      await this.pendingRuleBindings.get(
        buildParticipantKey(attachment.discordUserId, envelope.command.seatId)
      );
      try {
        const command = envelope.command;
        const perform = () => {
          if (command.type === 'APPLY_RULE_EVENT') this.applyRuleEvent(attachment, command, envelope.reqId);
          else if (command.type === 'REROLL_RULE_ROLL') this.rerollRuleRoll(ws, attachment, command, envelope.reqId);
          else this.keepActivationRoll(attachment, command, envelope.reqId);
        };
        if ('characterId' in command && command.characterId) perform();
        else await this.executeSharedRuleCommand(ws, attachment, command, envelope.reqId, perform);
        this.scheduleRulePersistence();
      } catch (error) {
        this.sendRejection(
          ws,
          envelope.reqId,
          'VALIDATION_ERROR',
          error instanceof Error ? error.message : 'Unable to apply this rule.'
        );
      }
      return;
    }

    if (envelope.command.type === 'ROLL_TABLE_POOL') {
      await this.pendingRuleBindings.get(
        buildParticipantKey(attachment.discordUserId, envelope.command.seatId)
      );
      const command = envelope.command;
      if (this.getRuleState().seatBindings[buildParticipantKey(attachment.discordUserId, command.seatId)]) await this.executeSharedRuleCommand(ws, attachment, command, envelope.reqId, () => this.handleRollTablePool(ws, attachment, command, envelope.reqId));
      else this.handleRollTablePool(ws, attachment, command, envelope.reqId);
      return;
    }

    if (envelope.command.type === 'CLEAR_TABLE_INITIATIVE') {
      try {
        this.handleClearTableInitiative(ws, attachment, envelope.reqId);
      } catch {
        this.sendRejection(ws, envelope.reqId, 'VALIDATION_ERROR', 'Could not save the initiative clear. Please retry.');
      }
      return;
    }

    if (envelope.command.type === 'ST_ROLL_TABLE_POOL' ||
        envelope.command.type === 'ST_ROLL_TABLE_INITIATIVE' ||
        envelope.command.type === 'ST_REVEAL_TABLE_INITIATIVE') {
      if (!this.isVoiceTableStoryteller(attachment)) {
        this.sendRejection(ws, envelope.reqId, 'FORBIDDEN', 'Only this voice table’s Storyteller may do that.');
        return;
      }
      try {
        if (envelope.command.type === 'ST_REVEAL_TABLE_INITIATIVE') {
          this.revealStorytellerInitiative(ws, attachment, envelope.command.entryId, envelope.reqId);
        } else {
          this.rollStorytellerTable(ws, attachment, envelope.command, envelope.reqId);
        }
      } catch {
        this.sendRejection(ws, envelope.reqId, 'VALIDATION_ERROR', 'Could not save the Storyteller action. Please retry.');
      }
      return;
    }

    const isSeqExemptRollCommand =
      envelope.command.type === 'ROLL_FREEFORM_POOL' ||
      envelope.command.type === 'FRENZY_ROLL_CHECK';

    if (!isSeqExemptRollCommand && !this.isExpectedSeqAcceptable(envelope.expectedSeq, attachment)) {
      this.sendRejection(
        ws,
        envelope.reqId,
        'SEQ_MISMATCH',
        `Expected sequence ${this.roomState.seq}, received ${envelope.expectedSeq}.`,
      );
      return;
    }

    await this.handleAuthenticatedCommand(ws, attachment, envelope);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    return this.withRoomLock(async () => this.handleSocketDisconnect(ws));
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.withRoomLock(async () => this.handleSocketDisconnect(ws));
  }

  /**
   * Typed Worker RPC invoked by /api/discord-interactions when /w20 roll executes in Discord chat.
   */
  async broadcastSlashRoll(payload: {
    campaignId: string;
    rollerDiscordId: string;
    label: string;
    roll: W20RollResult;
    characterId?: string;
    isSecretStRoll?: boolean;
  }): Promise<{ ok: true; seq: number }> {
    return this.withRoomLock(async () => {
      if (this.roomState.sharedRuleIntent && !(await this.resumeSharedRuleIntent())) throw new Error('Shared character action confirmation is pending.');
      return this.broadcastSlashRollUnlocked(payload);
    });
  }

  private async broadcastSlashRollUnlocked(payload: { campaignId: string; rollerDiscordId: string; label: string; roll: W20RollResult; characterId?: string; isSecretStRoll?: boolean }): Promise<{ ok: true; seq: number }> {
    if (!this.roomState.campaignId && payload.campaignId) {
      try {
        await this.ensureRoomHydrated(payload.campaignId);
      } catch {
        // Standalone test rooms without Supabase rows still allow live roll broadcast
        this.roomState.campaignId = payload.campaignId;
      }
    }

    this.commitAndBroadcast(
      [
        {
          event: {
            type: 'DICE_ROLLED_3D',
            rollerDiscordId: payload.rollerDiscordId,
            ...(payload.characterId ? { characterId: payload.characterId } : {}),
            label: payload.label,
            roll: payload.roll,
            ...(payload.isSecretStRoll ? { isSecretStRoll: true } : {}),
          },
          targetRole: payload.isSecretStRoll ? 'storyteller' : null,
        },
      ],
      undefined,
    );

    if (this.roomState.campaignId) {
      this.scheduleRollAuditAndWebhook({
        campaignId: this.roomState.campaignId,
        characterId: payload.characterId ?? null,
        rollerDiscordId: payload.rollerDiscordId,
        rollerName: `<@${payload.rollerDiscordId}>`,
        label: payload.label,
        roll: payload.roll,
        isSecretStRoll: payload.isSecretStRoll,
      });
    }

    return { ok: true, seq: this.roomState.seq };
  }

  /**
   * Typed Worker RPC invoked by POST /api/characters/:id/xp-spend after Supabase ledger update.
   */
  async applyApprovedXp(
    characterId: string,
    patch: Partial<W20CharacterState>,
  ): Promise<{ ok: boolean; seq: number }> {
    return this.withRoomLock(async () => {
      if (this.roomState.sharedRuleIntent && !(await this.resumeSharedRuleIntent())) throw new Error('Shared character action confirmation is pending.');
      return this.applyApprovedXpUnlocked(characterId, patch);
    });
  }

  private async applyApprovedXpUnlocked(characterId: string, patch: Partial<W20CharacterState>): Promise<{ ok: boolean; seq: number }> {
    const existing = this.roomState.characters[characterId];
    if (!existing) {
      return { ok: false, seq: this.roomState.seq };
    }

    const updated: W20CharacterState = {
      ...existing,
      ...patch,
      baseAttributes: patch.baseAttributes ?? existing.baseAttributes,
      abilities: patch.abilities ?? existing.abilities,
      rage: patch.rage ?? existing.rage,
      gnosis: patch.gnosis ?? existing.gnosis,
      willpower: patch.willpower ?? existing.willpower,
      macros: patch.macros ?? existing.macros,
      stateVersion:
        typeof patch.stateVersion === 'number' ? patch.stateVersion : existing.stateVersion + 1,
    };

    this.roomState.characters[characterId] = updated;
    this.syncTokenForCharacter(updated);

    this.commitAndBroadcast([
      {
        event: {
          type: 'CHARACTER_PATCHED',
          characterId,
          character: updated,
        },
        targetRole: updated.isNpc ? 'storyteller' : null,
      },
    ]);

    return { ok: true, seq: this.roomState.seq };
  }

  /**
   * Typed Worker RPC invoked when a new character is created via POST /api/characters so live rooms see them immediately.
   */
  async upsertCharacterFromApi(character: W20CharacterState): Promise<{ ok: true; seq: number }> {
    return this.withRoomLock(async () => {
      if (this.roomState.sharedRuleIntent && !(await this.resumeSharedRuleIntent())) throw new Error('Shared character action confirmation is pending.');
      return this.upsertCharacterFromApiUnlocked(character);
    });
  }

  private async upsertCharacterFromApiUnlocked(character: W20CharacterState): Promise<{ ok: true; seq: number }> {
    this.roomState.characters[character.id] = character;
    if (!this.roomState.persistedCharacterIds.includes(character.id)) {
      this.roomState.persistedCharacterIds.push(character.id);
    }
    this.ensureTokenForCharacter(character);

    this.commitAndBroadcast([
      {
        event: {
          type: 'CHARACTER_PATCHED',
          characterId: character.id,
          character,
        },
        targetRole: character.isNpc ? 'storyteller' : null,
      },
      {
        event: {
          type: 'TOKENS_UPDATED',
          tokens: [],
        },
        rawTokensSnapshot: this.snapshotRawTokens(),
      },
    ]);

    return { ok: true, seq: this.roomState.seq };
  }

  private getAttachment(ws: WebSocket): InternalSocketAttachment {
    const raw = ws.deserializeAttachment() as InternalSocketAttachment | null;
    if (!raw) {
      return {
        discordUserId: '',
        displayName: '',
        role: 'player',
        activeCharacterId: null,
        connectedAt: Date.now(),
        authenticated: false,
        isSpeaking: false,
      };
    }
    return raw;
  }

  private collectSpeakingDiscordIds(excludeWs?: WebSocket): string[] {
    const ids = new Set<string>();
    for (const sock of this.ctx.getWebSockets()) {
      if (excludeWs && sock === excludeWs) {
        continue;
      }
      const att = this.getAttachment(sock);
      if (att.authenticated && att.isSpeaking && att.discordUserId) {
        ids.add(att.discordUserId);
      }
    }
    return Array.from(ids);
  }

  private broadcastVoiceSpeakersExcluding(closingWs: WebSocket): void {
    const att = this.getAttachment(closingWs);
    if (!att.authenticated || !att.isSpeaking) {
      return;
    }
    const speakingDiscordIds = this.collectSpeakingDiscordIds(closingWs);
    this.sendEphemeralBroadcast({
      type: 'VOICE_SPEAKERS_UPDATED',
      speakingDiscordIds,
    });
  }

  private handleVoiceSpeakingState(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    isSpeaking: boolean,
    reqId: string,
  ): void {
    if (attachment.isSpeaking === isSpeaking) {
      return;
    }
    const updated: InternalSocketAttachment = {
      ...attachment,
      isSpeaking,
    };
    ws.serializeAttachment(updated);

    const speakingDiscordIds = this.collectSpeakingDiscordIds();
    this.sendEphemeralBroadcast(
      {
        type: 'VOICE_SPEAKERS_UPDATED',
        speakingDiscordIds,
      },
      reqId,
    );
  }

  private upsertTableParticipant(
    discordUserId: string,
    displayName: string,
    avatarUrl: string | null,
    isConnected = true,
    seatId = 'primary',
  ): TableParticipant {
    this.roomState.tableParticipants ??= {};
    const normalizedSeatId = normalizeSeatId(seatId);
    const participantKey = buildParticipantKey(discordUserId, normalizedSeatId);
    const existing = this.roomState.tableParticipants[participantKey];
    const next: TableParticipant = {
      participantKey,
      seatId: normalizedSeatId,
      discordUserId,
      displayName: displayName || existing?.displayName || 'Garou',
      avatarUrl: avatarUrl ?? existing?.avatarUrl ?? null,
      isConnected,
      trackers: existing?.trackers ?? {
        rage: 3,
        gnosis: 3,
        willpower: 5,
        woundPenalty: 0,
      },
      ...(existing?.characterName !== undefined ? { characterName: existing.characterName } : {}),
      ...(existing?.activeForm !== undefined ? { activeForm: existing.activeForm } : {}),
      ...(existing?.sheetId !== undefined ? { sheetId: existing.sheetId } : {}),
    };
    this.roomState.tableParticipants[participantKey] = next;
    return next;
  }

  private resolveTargetParticipant(
    attachment: InternalSocketAttachment,
    seatId?: string,
  ): TableParticipant {
    this.roomState.tableParticipants ??= {};
    const normalizedSeatId = normalizeSeatId(seatId);
    const participantKey = buildParticipantKey(attachment.discordUserId, normalizedSeatId);
    const existing =
      this.roomState.tableParticipants[participantKey] ??
      this.roomState.tableParticipants[attachment.discordUserId];
    if (existing) {
      return existing;
    }
    return this.upsertTableParticipant(
      attachment.discordUserId,
      attachment.displayName,
      attachment.avatarUrl ?? null,
      true,
      'primary',
    );
  }

  private handleSocketDisconnect(closingWs: WebSocket): void {
    this.broadcastVoiceSpeakersExcluding(closingWs);
    const att = this.getAttachment(closingWs);
    if (!att.authenticated || !att.discordUserId) {
      return;
    }

    // Mark the closing socket unauthenticated so multi-tab disconnect checks ignore already-closed sockets
    closingWs.serializeAttachment({
      ...att,
      authenticated: false,
      isSpeaking: false,
    });

    if (!this.roomState.tableParticipants) {
      return;
    }

    const ownedParticipants = Object.values(this.roomState.tableParticipants).filter(
      (p) => p.discordUserId === att.discordUserId,
    );
    if (ownedParticipants.length === 0) {
      return;
    }

    const stillConnectedElsewhere = this.ctx.getWebSockets().some((sock) => {
      if (sock === closingWs) return false;
      const otherAtt = this.getAttachment(sock);
      return otherAtt.authenticated && otherAtt.discordUserId === att.discordUserId;
    });

    if (!stillConnectedElsewhere) {
      let anyChanged = false;
      for (const participant of ownedParticipants) {
        if (participant.isConnected) {
          participant.isConnected = false;
          anyChanged = true;
        }
      }
      if (anyChanged) {
        this.persistStateSnapshot();
        this.sendEphemeralBroadcast(
          {
            type: 'PARTICIPANTS_UPDATED',
            participants: Object.values(this.roomState.tableParticipants),
          },
          undefined,
          closingWs,
        );
      }
    }
  }

  private handleSyncClientSeats(
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'SYNC_CLIENT_SEATS' }>,
    reqId: string,
  ): void {
    this.roomState.tableParticipants ??= {};

    const primaryAvatarUrl =
      this.roomState.tableParticipants[attachment.discordUserId]?.avatarUrl ??
      attachment.avatarUrl ??
      null;

    const keptKeys = new Set<string>();
    for (const seat of command.seats) {
      const normalizedSeatId = normalizeSeatId(seat.seatId);
      const participantKey = buildParticipantKey(attachment.discordUserId, normalizedSeatId);
      keptKeys.add(participantKey);

      const existing = this.roomState.tableParticipants[participantKey];
      const boundSheetId = this.getRuleState().seatBindings[participantKey];
      const boundSheet = boundSheetId ? this.getRuleState().sheets[boundSheetId]?.sheet : undefined;
      const avatarUrl =
        normalizedSeatId === 'primary'
          ? primaryAvatarUrl
          : (existing?.avatarUrl ?? null);

      this.roomState.tableParticipants[participantKey] = {
        participantKey,
        seatId: normalizedSeatId,
        discordUserId: attachment.discordUserId,
        displayName:
          seat.displayName.trim() ||
          existing?.displayName ||
          attachment.displayName ||
          'Garou',
        characterName:
          seat.characterName !== undefined
            ? seat.characterName
            : (existing?.characterName ?? null),
        activeForm:
          seat.activeForm !== undefined
            ? seat.activeForm
            : (existing?.activeForm ?? null),
        avatarUrl,
        sheetId: this.getRuleState().seatBindings[participantKey] ?? null,
        isConnected: true,
        trackers: {
          rage: boundSheet?.rage.temporary ?? Math.max(0, Math.min(10, seat.trackers.rage)),
          gnosis: boundSheet?.gnosis.temporary ?? Math.max(0, Math.min(10, seat.trackers.gnosis)),
          willpower: boundSheet?.willpower.temporary ?? Math.max(0, Math.min(10, seat.trackers.willpower)),
          woundPenalty: seat.trackers.woundPenalty,
        },
      };
    }

    for (const [key, entry] of Object.entries(this.roomState.tableParticipants)) {
      if (entry.discordUserId === attachment.discordUserId && !keptKeys.has(key)) {
        delete this.roomState.tableParticipants[key];
        delete this.getRuleState().seatBindings[key];
        delete this.getRuleState().seatAuthorizations[key];
      }
    }

    // A removed seat also leaves the shared initiative order.
    const initiativeBefore = this.roomState.tableInitiative ?? [];
    const initiativeAfter = initiativeBefore.filter(
      (entry) =>
        entry.source === 'storyteller' ||
        entry.discordUserId !== attachment.discordUserId || keptKeys.has(entry.participantKey),
    );
    const initiativeChanged = initiativeAfter.length !== initiativeBefore.length;
    if (initiativeChanged) {
      this.roomState.tableInitiative = initiativeAfter;
    }

    this.persistStateSnapshot();
    this.sendEphemeralBroadcast(
      {
        type: 'PARTICIPANTS_UPDATED',
        participants: Object.values(this.roomState.tableParticipants),
      },
      reqId,
    );
    if (initiativeChanged) {
      this.broadcastTableInitiative();
    }
  }

  private handleClearTableInitiative(ws: WebSocket, attachment: InternalSocketAttachment, reqId: string): void {
    if (!Object.values(this.roomState.tableParticipants ?? {}).some(
      (seat) => seat.discordUserId === attachment.discordUserId && seat.isConnected,
    )) {
      this.sendRejection(ws, reqId, 'FORBIDDEN', 'Only a seated participant may clear initiative.');
      return;
    }
    const hasPublicInitiative = Boolean(this.roomState.tableInitiative?.length);
    const table = this.roomState.storytellerTable;
    const previousReceipts = this.roomState.tableInitiativeClearReceipts;
    const receipt = JSON.stringify([attachment.discordUserId, reqId]);
    if (previousReceipts?.includes(receipt)) return;
    const previousOrder = this.roomState.tableInitiative;
    this.roomState.tableInitiativeClearReceipts = [...(previousReceipts ?? []), receipt].slice(-EVENT_RING_CAPACITY);
    this.roomState.tableInitiative = [];
    if (table) this.roomState.storytellerTable = { ...table, initiative: [] };
    try {
      if (hasPublicInitiative) this.commitTableInitiative(reqId);
      else this.persistStateSnapshot();
    } catch (error) {
      this.roomState.storytellerTable = table;
      this.roomState.tableInitiative = previousOrder;
      this.roomState.tableInitiativeClearReceipts = previousReceipts;
      throw error;
    }
    this.broadcastStorytellerInitiative(reqId, ws);
  }

  private tableInitiativeEvent(): Extract<ServerEvent, { type: 'TABLE_INITIATIVE_UPDATED' }> {
    return { type: 'TABLE_INITIATIVE_UPDATED', entries: this.roomState.tableInitiative ?? [] };
  }

  private broadcastTableInitiative(): void {
    this.sendEphemeralBroadcast(this.tableInitiativeEvent());
  }

  private commitTableInitiative(replyToReqId?: string): void {
    this.persistAndBroadcastEvents([{ event: this.tableInitiativeEvent() }], replyToReqId, undefined, true);
  }

  private isVoiceTableStoryteller(attachment: InternalSocketAttachment): boolean {
    const roomId = this.roomState.campaignId;
    return attachment.authenticated && !!roomId && attachment.routedRoomId === roomId &&
      this.voiceTableStorytellers.get(roomId) === attachment.discordUserId;
  }

  private sendStorytellerEvent(ws: WebSocket, event: StorytellerTableEvent, reqId?: string): void {
    if (!this.isVoiceTableStoryteller(this.getAttachment(ws))) return;
    try {
      ws.send(JSON.stringify({
        seq: this.roomState.seq,
        serverTime: Date.now(),
        ...(reqId ? { replyToReqId: reqId } : {}),
        event,
      } satisfies ServerEnvelope<ServerEvent>));
    } catch {
      // A disconnected Storyteller receives their saved state at the next HELLO.
    }
  }

  private broadcastStorytellerInitiative(reqId?: string, requester?: WebSocket): void {
    for (const socket of this.ctx.getWebSockets()) {
      const viewer = this.getAttachment(socket);
      if (!this.isVoiceTableStoryteller(viewer)) continue;
      this.sendStorytellerEvent(socket, {
        type: 'STORYTELLER_INITIATIVE_UPDATED',
        entries: projectStorytellerInitiative(this.roomState.storytellerTable, viewer.discordUserId),
      }, socket === requester ? reqId : undefined);
    }
  }

  private broadcastStorytellerSeats(excludeWs?: WebSocket): void {
    let event: Extract<StorytellerTableEvent, { type: 'STORYTELLER_SEATS_UPDATED' }> | undefined;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeWs || !this.isVoiceTableStoryteller(this.getAttachment(socket))) continue;
      event ??= { type: 'STORYTELLER_SEATS_UPDATED', seats: this.storytellerSeats() };
      this.sendStorytellerEvent(socket, event);
    }
  }

  private storytellerSeats() {
    const connected = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (attachment.authenticated && attachment.routedRoomId === this.roomState.campaignId) {
        connected.add(attachment.discordUserId);
      }
    }
    return projectStorytellerSeats(this.roomState, connected);
  }

  private syncStorytellerTable(ws: WebSocket, attachment: InternalSocketAttachment): void {
    if (!this.isVoiceTableStoryteller(attachment)) return;
    const table = this.roomState.storytellerTable;
    this.sendStorytellerEvent(ws, {
      type: 'STORYTELLER_TABLE_SYNC',
      state: {
        rollHistory: (table?.rollHistory ?? []).filter((entry) => entry.rollerDiscordId === attachment.discordUserId),
        initiative: projectStorytellerInitiative(table, attachment.discordUserId),
        seats: this.storytellerSeats(),
      },
    });
  }

  private rollStorytellerTable(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: StorytellerRollCommand,
    reqId: string,
  ): void {
    const before = this.roomState.storytellerTable;
    const table = before ?? { rollHistory: [], initiative: [], rollReceipts: {} };
    const receiptKey = JSON.stringify([attachment.discordUserId, command.rollClientId]);
    const previousId = table.rollReceipts[receiptKey];
    if (previousId) {
      const entry = table.rollHistory.find((roll) => roll.id === previousId);
      if (!entry) {
        this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'This private roll has aged out of the log.');
        return;
      }
      const initiative = projectStorytellerInitiative(table, attachment.discordUserId).find((item) => item.id === previousId);
      this.sendStorytellerEvent(ws, { type: 'STORYTELLER_ROLL_RECORDED', entry, ...(initiative ? { initiative } : {}) }, reqId);
      return;
    }
    const isInitiative = command.type === 'ST_ROLL_TABLE_INITIATIVE';
    const label = isInitiative ? command.label.trim() : 'Storyteller Dice Pool';
    const roll = isInitiative
      ? resolveW20InitiativeRoll({ label, initiativeModifier: command.modifier }, rollCsprngD10)
      : resolveW20DicePool({
          label, basePool: command.count, woundPenalty: 0, applyWoundPenalty: false,
          baseDifficulty: command.difficulty, hasApplicableSpecialty: false, spendWillpower: false,
          specialtyMode: this.roomState.specialtyMode,
        }, rollCsprngD10);
    const entry: RollHistoryEntry = {
      id: `st-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      rollerDiscordId: attachment.discordUserId,
      rollerName: attachment.displayName,
      rollerAvatarUrl: attachment.avatarUrl ?? null,
      label,
      rageDiceCount: 0,
      isSecretRoll: true,
      roll,
    };
    const initiative = isInitiative
      ? { id: entry.id, label, total: roll.initiativeTotal ?? roll.netSuccesses, revealed: false }
      : undefined;
    this.roomState.storytellerTable = {
      rollHistory: [entry, ...table.rollHistory].slice(0, STORYTELLER_ROLL_HISTORY_LIMIT),
      initiative: initiative ? [{ ...initiative, rollerDiscordId: attachment.discordUserId }, ...table.initiative] : table.initiative,
      rollReceipts: Object.fromEntries([...Object.entries(table.rollReceipts), [receiptKey, entry.id]].slice(-EVENT_RING_CAPACITY)),
    };
    try {
      this.persistStateSnapshot();
    } catch (error) {
      this.roomState.storytellerTable = before;
      throw error;
    }
    for (const socket of this.ctx.getWebSockets()) {
      if (this.getAttachment(socket).discordUserId !== attachment.discordUserId) continue;
      this.sendStorytellerEvent(socket, {
        type: 'STORYTELLER_ROLL_RECORDED',
        entry,
        ...(initiative ? { initiative } : {}),
      }, socket === ws ? reqId : undefined);
    }
  }

  private revealStorytellerInitiative(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    entryId: string,
    reqId: string,
  ): void {
    const table = this.roomState.storytellerTable;
    const entry = table?.initiative.find((item) => item.id === entryId && item.rollerDiscordId === attachment.discordUserId);
    if (!table || !entry) {
      this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'This initiative entry is no longer available.');
      return;
    }
    if (!entry.revealed) {
      const previousOrder = this.roomState.tableInitiative;
      const publicKey = `st-public-${crypto.randomUUID()}`;
      this.roomState.storytellerTable = {
        ...table, initiative: table.initiative.map((item) => item.id === entryId ? { ...item, revealed: true } : item),
      };
      this.roomState.tableInitiative = [...(previousOrder ?? []), {
        source: 'storyteller',
        participantKey: publicKey,
        displayName: entry.label,
        total: entry.total,
      }];
      try {
        this.commitTableInitiative();
      } catch (error) {
        this.roomState.storytellerTable = table;
        this.roomState.tableInitiative = previousOrder;
        throw error;
      }
    }
    this.broadcastStorytellerInitiative(reqId, ws);
  }

  private handleUpdateLightTrackers(
    _ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'UPDATE_LIGHT_TRACKERS' }>,
    reqId: string,
  ): void {
    const participant = this.resolveTargetParticipant(attachment, command.seatId);
    const boundId =
      this.getRuleState().seatBindings[
        buildParticipantKey(attachment.discordUserId, command.seatId)
      ];
    const boundSheet = boundId ? this.getRuleState().sheets[boundId]?.sheet : undefined;
    const nextTrackers: LightGarouTrackers = {
      rage:
        boundSheet ? boundSheet.rage.temporary : typeof command.trackers.rage === 'number'
          ? Math.max(0, Math.min(10, command.trackers.rage))
          : participant.trackers.rage,
      gnosis:
        boundSheet ? boundSheet.gnosis.temporary : typeof command.trackers.gnosis === 'number'
          ? Math.max(0, Math.min(10, command.trackers.gnosis))
          : participant.trackers.gnosis,
      willpower:
        boundSheet ? boundSheet.willpower.temporary : typeof command.trackers.willpower === 'number'
          ? Math.max(0, Math.min(10, command.trackers.willpower))
          : participant.trackers.willpower,
      woundPenalty:
        command.trackers.woundPenalty !== undefined
          ? command.trackers.woundPenalty
          : participant.trackers.woundPenalty,
    };
    participant.trackers = nextTrackers;
    if (command.displayName !== undefined && command.displayName.trim()) {
      participant.displayName = command.displayName.trim();
    }
    if (command.characterName !== undefined) {
      participant.characterName = command.characterName;
    }
    if (command.activeForm !== undefined) {
      participant.activeForm = command.activeForm;
    }
    participant.isConnected = true;

    this.persistStateSnapshot();
    this.sendEphemeralBroadcast(
      {
        type: 'PARTICIPANTS_UPDATED',
        participants: Object.values(this.roomState.tableParticipants ?? {}),
      },
      reqId,
    );
  }

  private ruleOperationId(kind: string, discordId: string, actionId: string): string {
    if (this.sharedRuleStage) return this.sharedRuleStage.operationSeed;
    return kind === 'activation' || kind === 'end' ? `${discordId}:${actionId}` : `${kind}:${discordId}:${actionId}`;
  }

  private replaceCanonicalRuleSheet(sheet: W20UserCharacterSheet): void {
    const rules = this.getRuleState();
    const record = rules.sheets[sheet.id];
    if (!record) throw new Error('Bind this character before using its rules.');
    record.sheet = structuredClone(sheet);
    record.canonicalKnown = true;
    record.controlledByDiscordId = sheet.ownerDiscordId;
    for (const [key, id] of Object.entries(rules.seatBindings)) {
      if (id !== sheet.id) continue;
      const principal = key.split('::')[0];
      const grant = rules.seatAuthorizations[key];
      if (principal !== sheet.ownerDiscordId && (!grant?.syncCode || grant.syncCode !== sheet.syncCode)) {
        delete rules.seatBindings[key];
        delete rules.seatAuthorizations[key];
        if (this.roomState.tableParticipants?.[key]) this.roomState.tableParticipants[key]!.sheetId = null;
      }
    }
    const wrappers = new Map(rules.effects.filter((effect) => effect.targetId === sheet.id).map((effect) => [effect.instance.id, effect]));
    rules.effects = rules.effects.filter((effect) => effect.targetId !== sheet.id);
    for (const instance of sheet.activeRuleEffects ?? []) {
      const previous = wrappers.get(instance.id);
      rules.effects.push({ ...previous, instance: structuredClone(instance), sourceId: previous?.sourceId ?? instance.sourceOwnerId ?? instance.sourceId.split(':')[0]!, targetId: sheet.id, casterDiscordId: previous?.casterDiscordId ?? sheet.ownerDiscordId, preparedAtTurn: instance.preparationRounds === 0 ? undefined : previous?.preparedAtTurn });
    }
    for (const participant of Object.values(this.roomState.tableParticipants ?? {})) {
      if (participant.sheetId === sheet.id) {
        participant.trackers = { ...participant.trackers, rage: sheet.rage.temporary, gnosis: sheet.gnosis.temporary, willpower: sheet.willpower.temporary };
        participant.activeForm = sheet.activeForm;
      }
    }
  }

  private isOrdinaryLocalRoll(command: SharedRuleCommand, sheet: W20UserCharacterSheet): boolean {
    if (command.type !== 'ROLL_TABLE_POOL' || command.spendWillpower || (sheet.activeRuleEffects?.length ?? 0) > 0 || (sheet.ruleActivationReceipts?.length ?? 0) > 0) return false;
    const source = command.shortcut?.source;
    return !source || source.kind !== 'fetish_activate' && !(source.kind === 'trait_combo' && ['rage', 'gnosis', 'willpower'].includes(source.attribute ?? ''));
  }

  private async executeSharedRuleCommand(ws: WebSocket, attachment: InternalSocketAttachment, command: SharedRuleCommand, reqId: string, perform: () => void, replanCount = 0, payerOverride?: string): Promise<void> {
    if (isMockDiscordId(attachment.discordUserId)) { perform(); return; }
    const clientActionId = command.type === 'ROLL_TABLE_POOL' ? command.rollClientId ?? reqId : reqId;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientActionId)));
    const actionHash = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
    const actionKey = `${command.type}:${attachment.discordUserId}:${actionHash}`;
    const fingerprint = JSON.stringify(command);
    const previous = this.sharedActionReplies.get(actionKey);
    if (previous === 'expired') {
      this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'This action ID was already used and its reply has expired.');
      return;
    }
    if (previous) {
      if (previous.fingerprint !== fingerprint) this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'This action ID was already used with different parameters.');
      else if (previous.rejection) this.sendRejection(ws, reqId, previous.rejection.code, previous.rejection.message);
      else {
        for (const event of previous.replay ?? []) ws.send(JSON.stringify({ seq: this.roomState.seq, replyToReqId: reqId, serverTime: Date.now(), event }));
        if (previous.payerSheetId) {
          try {
            const current = await new UserSheetRepository(this.env).getById(previous.payerSheetId);
            if (current) {
              this.replaceCanonicalRuleSheet(current);
              this.persistStateSnapshot();
              this.broadcastStorytellerSeats();
              const key = buildParticipantKey(attachment.discordUserId, command.seatId);
              const grant = this.getRuleState().seatAuthorizations[key];
              if (current.ownerDiscordId === attachment.discordUserId || grant?.syncCode && grant.syncCode === current.syncCode) this.sendRuleStateToSocket(ws, attachment, reqId);
            }
          } catch { /* Known results can be replayed while fresh private state is unavailable. */ }
        }
      }
      return;
    }
    let payerId = payerOverride ?? this.getRuleState().seatBindings[buildParticipantKey(attachment.discordUserId, command.seatId)];
    if (command.type === 'END_RULE_EFFECT') payerId = this.getRuleState().effects.find((effect) => effect.instance.id === command.effectId)?.targetId ?? payerId;
    if (!payerId || !this.getRuleState().sheets[payerId]) {
      if (replanCount > 0) throw new StagedRuleRejection('VALIDATION_ERROR', 'Re-bind this character with its current authorization before using it.');
      perform(); return;
    }
    const repository = new UserSheetRepository(this.env);
    try {
      if (this.rulePersistencePromise) await this.rulePersistencePromise;
      if (this.getRuleState().persistenceQueue.some((mutation) => mutation.sheetId === payerId)) {
        await this.flushRulePersistence();
        if (this.getRuleState().persistenceQueue.some((mutation) => mutation.sheetId === payerId)) throw new Error('An earlier character update is awaiting shared storage. Retry when it has synchronized.');
      }
      const canonical = await repository.getById(payerId);
      if (!canonical) {
        const local = this.getRuleState().sheets[payerId]!;
        if (local.canonicalKnown === false && this.isOrdinaryLocalRoll(command, local.sheet)) { perform(); return; }
        throw new StagedRuleRejection('VALIDATION_ERROR', 'Save this local character to the roster before spending resources or using paid effects at a shared table.');
      }
      const bindingKey = buildParticipantKey(attachment.discordUserId, command.seatId);
      const grant = this.getRuleState().seatAuthorizations[bindingKey];
      const endingOwnCast = command.type === 'END_RULE_EFFECT' && this.getRuleState().effects.some((effect) => effect.instance.id === command.effectId && effect.casterDiscordId === attachment.discordUserId);
      if (canonical.ownerDiscordId !== attachment.discordUserId && !endingOwnCast && (!grant?.syncCode || grant.ownerDiscordId !== canonical.ownerDiscordId || grant.syncCode !== canonical.syncCode)) throw new StagedRuleRejection('VALIDATION_ERROR', 'Re-bind this character with its current sync code before using it.');
      this.replaceCanonicalRuleSheet(canonical);
      for (const targetId of command.type === 'ACTIVATE_RULE' ? command.targetIds : command.type === 'ROLL_TABLE_POOL' ? command.ruleContext?.targetIds ?? [] : []) {
        if (targetId !== payerId && this.getRuleState().sheets[targetId]) {
          const target = await repository.getById(targetId);
          if (target) this.replaceCanonicalRuleSheet(target);
        }
      }
      this.persistStateSnapshot();
      this.broadcastStorytellerSeats();
      const before = this.roomState;
      const staged = structuredClone(before);
      delete staged.sharedRuleIntent;
      const stage: SharedRuleStage = { payerSheetId: payerId, operationSeed: `${before.ruleCommitNamespace}:${command.type}:${attachment.discordUserId}:${actionHash.slice(0, 24)}`, emissions: [], costs: { rage: 0, gnosis: 0, willpower: 0 }, requiredSourceIds: [], requiredAbsentReceipts: [], characterFlushIds: [], audits: [] };
      this.roomState = staged;
      this.sharedRuleStage = stage;
      try { perform(); }
      finally { this.sharedRuleStage = null; this.roomState = before; this.pendingRuleCharacterIds.clear(); this.pendingRuleTokenUpdate = false; }
      const oldMutations = new Set(before.ruleState!.persistenceQueue.map((mutation) => `${mutation.sheetId}:${mutation.operationId}`));
      const mutations = staged.ruleState!.persistenceQueue.filter((mutation) => mutation.sheetId === payerId && !oldMutations.has(`${mutation.sheetId}:${mutation.operationId}`));
      const resourceDelta = { rage: 0, gnosis: 0, willpower: 0 };
      const permanentResourceDelta = { rage: 0, gnosis: 0, willpower: 0 };
      for (const mutation of mutations) for (const trait of ['rage', 'gnosis', 'willpower'] as const) { resourceDelta[trait] += mutation.resourceDelta[trait]; permanentResourceDelta[trait] += mutation.permanentResourceDelta?.[trait] ?? 0; }
      const finalReceipts = staged.ruleState!.sheets[payerId]!.sheet.ruleActivationReceipts ?? [];
      const newReceipts = finalReceipts.filter((receipt) => !(canonical.ruleActivationReceipts ?? []).includes(receipt));
      const payerAfter = staged.ruleState!.sheets[payerId]!.sheet;
      const requiresAuthorization = command.type !== 'ROLL_TABLE_POOL' || command.spendWillpower || (canonical.activeRuleEffects?.length ?? 0) > 0 || !this.isOrdinaryLocalRoll(command, { ...canonical, ruleActivationReceipts: [] }) || mutations.some((mutation) => mutation.resourceDelta.rage || mutation.resourceDelta.gnosis || mutation.resourceDelta.willpower || mutation.permanentResourceDelta || mutation.consumedSourceIds.length || mutation.healthChanges?.length || mutation.rank !== undefined || mutation.activeForm !== undefined) || JSON.stringify(payerAfter.activeRuleEffects ?? []) !== JSON.stringify(canonical.activeRuleEffects ?? []);
      const intent: SharedRuleIntent = {
        id: `shared:${before.ruleCommitNamespace}:${actionKey}:${payerId}`, actionKey, operationSeed: stage.operationSeed, fingerprint, reqId, requesterDiscordId: attachment.discordUserId, attachment: structuredClone(attachment), command: structuredClone(command),
        authorization: { sheetId: payerId, ownerDiscordId: canonical.ownerDiscordId, expectedUpdatedAt: canonical.updatedAt, operationId: `shared:${before.ruleCommitNamespace}:${actionKey}:${payerId}`, costs: stage.costs, resourceDelta, permanentResourceDelta, consumedSourceIds: [...new Set(mutations.flatMap((mutation) => mutation.consumedSourceIds))], requiredSourceIds: [...new Set(stage.requiredSourceIds)], sourceReservationSettlements: mutations.flatMap((mutation) => mutation.sourceReservation ? [mutation.sourceReservation] : []), requiredAbsentReceipts: [...new Set([...stage.requiredAbsentReceipts, ...newReceipts.filter((receipt) => /^(rule-use:|event-use:|reroll-use:)/.test(receipt))])], additionalReceipts: [...new Set([...newReceipts, ...mutations.map((mutation) => mutation.operationId), ...mutations.flatMap((mutation) => (mutation.grantWithdrawals ?? []).map((withdrawal) => `grant-ended:${withdrawal.effectId}`))])] },
        mutations, requiresAuthorization, stagedState: staged, emissions: stage.emissions, characterFlushIds: [...new Set(stage.characterFlushIds)], audits: stage.audits,
      };
      this.roomState.sharedRuleIntent = intent;
      this.persistStateSnapshot();
      await this.resumeSharedRuleIntent(replanCount);
    } catch (error) {
      if (this.roomState.sharedRuleIntent) {
        this.scheduleSharedRuleRecovery();
        this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Shared storage confirmation is pending. This action will recover with its original outcome and without a second charge.');
        return;
      }
      const code = error instanceof StagedRuleRejection ? error.code : error instanceof RuleSpendConflictError && error.code === 'INSUFFICIENT_RESOURCE' ? 'INSUFFICIENT_RESOURCE' : 'VALIDATION_ERROR';
      const message = error instanceof Error ? error.message : 'Shared character state is unavailable.';
      if (error instanceof StagedRuleRejection || error instanceof RuleSpendConflictError) {
        this.sharedActionReplies.put(actionKey, { fingerprint, rejection: { code, message } });
        this.persistStateSnapshot();
      }
      this.sendRejection(ws, reqId, code, message);
    }
  }

  private async resumeSharedRuleIntent(replanCount = 0): Promise<boolean> {
    const intent = this.roomState.sharedRuleIntent;
    if (!intent) return true;
    try {
      const repository = new UserSheetRepository(this.env);
      const accepted = intent.requiresAuthorization === false ? { sheet: await repository.getById(intent.authorization.sheetId) } : await repository.authorizeRuleSpend(intent.authorization, (sheet) => intent.mutations.reduce(applyRuleSheetMutation, sheet));
      if (!accepted.sheet) throw new RuleSpendConflictError('NOT_FOUND', 'The character is no longer in shared storage.');
      this.publishSharedRuleIntent(intent, accepted.sheet);
      return true;
    } catch (error) {
      if (error instanceof RuleSpendConflictError) {
        delete this.roomState.sharedRuleIntent;
        if (error.latestSheet) this.replaceCanonicalRuleSheet(error.latestSheet);
        this.persistStateSnapshot();
        if (error.latestSheet) this.broadcastStorytellerSeats();
        if (error.code === 'STALE' && replanCount < 3) {
          const socket = this.ctx.getWebSockets().find((ws) => this.getAttachment(ws).discordUserId === intent.requesterDiscordId) ?? ({ send: () => undefined } as unknown as WebSocket);
          await this.executeSharedRuleCommand(socket, intent.attachment, intent.command, intent.reqId, () => this.performSharedRuleCommand(socket, intent.attachment, intent.command, intent.reqId), replanCount + 1, intent.authorization.sheetId);
          return !this.roomState.sharedRuleIntent;
        }
        const code = error.code === 'INSUFFICIENT_RESOURCE' ? 'INSUFFICIENT_RESOURCE' : 'VALIDATION_ERROR';
        this.sharedActionReplies.put(intent.actionKey, { fingerprint: intent.fingerprint, rejection: { code, message: error.message } });
        this.persistStateSnapshot();
        for (const socket of this.ctx.getWebSockets()) if (this.getAttachment(socket).authenticated && this.getAttachment(socket).discordUserId === intent.requesterDiscordId) { this.sendRejection(socket, intent.reqId, code, error.message); }
        return true;
      }
      this.scheduleSharedRuleRecovery();
      return false;
    }
  }

  private performSharedRuleCommand(ws: WebSocket, attachment: InternalSocketAttachment, command: SharedRuleCommand, reqId: string): void {
    if (command.type === 'ROLL_TABLE_POOL') this.handleRollTablePool(ws, attachment, command, reqId);
    else if (command.type === 'REROLL_RULE_ROLL') this.rerollRuleRoll(ws, attachment, command, reqId);
    else if (command.type === 'KEEP_ACTIVATION_RESULT') this.keepActivationRoll(attachment, command, reqId);
    else if (command.type === 'APPLY_RULE_EVENT') this.applyRuleEvent(attachment, command, reqId);
    else this.handleRuleCommand(ws, attachment, command, reqId);
  }

  private scheduleSharedRuleRecovery(): void {
    if (typeof this.ctx.storage.setAlarm === 'function') this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + 5_000));
  }

  async alarm(): Promise<void> {
    return this.withRoomLock(async () => { await this.resumeSharedRuleIntent(); });
  }

  private publishSharedRuleIntent(intent: SharedRuleIntent, canonical: W20UserCharacterSheet): void {
    const before = this.roomState;
    const oldRing = this.eventRing;
    const next = structuredClone(intent.stagedState) as PersistedRoomState;
    next.seq = before.seq;
    next.storytellerTable = before.storytellerTable;
    next.characters = { ...before.characters, ...next.characters };
    for (const [key, participant] of Object.entries(before.tableParticipants ?? {})) next.tableParticipants![key] = { ...participant, ...next.tableParticipants?.[key], isConnected: participant.isConnected, avatarUrl: participant.avatarUrl };
    this.roomState = next;
    this.replaceCanonicalRuleSheet(canonical);
    const committedIds = new Set(intent.mutations.map((mutation) => mutation.operationId));
    this.getRuleState().persistenceQueue = this.getRuleState().persistenceQueue.filter((mutation) => mutation.sheetId !== canonical.id || !committedIds.has(mutation.operationId));
    const records: BufferedRoomEvent[] = [];
    const outgoing: Array<{ entry?: BufferedRoomEvent; envelope: ServerEnvelope<ServerEvent> }> = [];
    for (const emission of intent.emissions) {
      if (emission.kind === 'commit') for (const pending of emission.pending) {
        const envelope: ServerEnvelope<ServerEvent> = { seq: ++next.seq, replyToReqId: emission.replyToReqId, serverTime: Date.now(), event: pending.event };
        const entry: BufferedRoomEvent = { seq: envelope.seq, targetRole: pending.targetRole ?? null, targetDiscordId: pending.targetDiscordId ?? null, envelope, ...(pending.rawTokensSnapshot ? { rawTokensSnapshot: pending.rawTokensSnapshot } : {}), ...(pending.rawCombatSnapshot !== undefined ? { rawCombatSnapshot: pending.rawCombatSnapshot } : {}) };
        records.push(entry); outgoing.push({ entry, envelope });
      } else outgoing.push({ envelope: { seq: next.seq, replyToReqId: emission.replyToReqId, serverTime: Date.now(), event: emission.event.type === 'PARTICIPANTS_UPDATED' ? { type: 'PARTICIPANTS_UPDATED', participants: Object.values(next.tableParticipants ?? {}) } : emission.event } });
    }
    // Activation retries acknowledge the outcome without animating a secondary roll again.
    const replyType = intent.command.type === 'ACTIVATE_RULE' || intent.command.type === 'KEEP_ACTIVATION_RESULT' ? 'RULE_ACTIVATION_RESOLVED' : 'DICE_ROLLED_3D';
    const replay = records.filter((entry) => !entry.targetDiscordId || entry.targetDiscordId === intent.requesterDiscordId).map((entry) => entry.envelope.event).filter((event) => event.type === replyType);
    delete this.getRuleState().sharedActionRecords;
    this.trimRuleReplayCaches();
    this.eventRing = [...oldRing, ...records].slice(-EVENT_RING_CAPACITY);
    const persist = () => {
      this.sharedActionReplies.put(intent.actionKey, { fingerprint: intent.fingerprint, payerSheetId: canonical.id, replay });
      this.persistStateSnapshot();
      for (const entry of records) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO room_event_ring (seq, target_role, target_discord_id, envelope_json, raw_tokens_json, raw_combat_json) VALUES (?, ?, ?, ?, ?, ?)', entry.seq, entry.targetRole, entry.targetDiscordId, JSON.stringify(entry.envelope), entry.rawTokensSnapshot ? JSON.stringify(entry.rawTokensSnapshot) : null, entry.rawCombatSnapshot !== undefined ? JSON.stringify(entry.rawCombatSnapshot) : null);
      if (this.eventRing.length) this.ctx.storage.sql.exec('DELETE FROM room_event_ring WHERE seq < ?', this.eventRing[0]!.seq);
    };
    try { if (typeof this.ctx.storage.transactionSync === 'function') this.ctx.storage.transactionSync(persist); else persist(); }
    catch (error) { this.roomState = before; this.eventRing = oldRing; throw error; }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment.authenticated) continue;
      for (const output of outgoing) {
        const projected = output.entry ? projectEnvelopeForAttachment(output.entry, next, attachment) : output.envelope;
        if (projected) { try { socket.send(JSON.stringify(projected)); } catch { /* Replay remains durable for a disconnected client. */ } }
      }
    }
    this.broadcastStorytellerSeats();
    this.scheduleCharacterFlush(intent.characterFlushIds.flatMap((id) => next.characters[id] ? [next.characters[id]!] : []));
    for (const audit of intent.audits) this.scheduleRollAuditAndWebhook(audit);
    this.scheduleRulePersistence();
  }

  private getRuleState() {
    this.roomState.ruleState ??= createEmptyRuleState();
    return this.roomState.ruleState;
  }

  private trimRuleReplayCaches(): void {
    const rules = this.getRuleState();
    rules.rollReceipts = Object.fromEntries(Object.entries(rules.rollReceipts).slice(-EVENT_RING_CAPACITY));
    rules.activationReceipts = Object.fromEntries(Object.entries(rules.activationReceipts).slice(-EVENT_RING_CAPACITY));
    const current = new Set((this.roomState.rollHistory ?? []).flatMap((entry) => [entry.id, ...(entry.rerollOf ? [entry.rerollOf] : []), ...(entry.correctionOf ? [entry.correctionOf] : [])]));
    for (const [id, pending] of Object.entries(rules.pendingActivations ?? {})) {
      current.add(id);
      if (pending.referenceRollId) current.add(pending.referenceRollId);
    }
    rules.rollRequests = Object.fromEntries(Object.entries(rules.rollRequests).filter(([id]) => current.has(id)));
  }

  private reconcileRuleSources(): boolean {
    const rules = this.getRuleState();
    const removed: import('@w20-vtt/protocol').RoomRuleEffect[] = [];
    const refreshed: import('@w20-vtt/protocol').RoomRuleEffect[] = [];
    for (const effect of rules.effects) {
      if (effect.instance.parentGrantId && !rules.effects.some((parent) => parent.instance.id === effect.instance.parentGrantId)) {
        removed.push(effect);
        continue;
      }
      const source = rules.sheets[effect.sourceId]?.sheet ?? this.roomState.characters[effect.sourceId];
      if (!source) continue;
      const itemId = effect.instance.sourceItemId ?? effect.instance.sourceId.slice(source.id.length + 1);
      const sourceItem = (isRuleSheet(source) ? getSheetModifierSources(source) : getCharacterModifierSources(source)).find((entry) => entry.id === itemId);
      if (!sourceItem && !effect.instance.rule?.activation?.consumable) removed.push(effect);
      if (sourceItem) {
        effect.instance.sourceItemId = sourceItem.id;
        effect.instance.sourceOwnerId = source.id;
        effect.instance.sourceWorn = sourceItem.worn;
        effect.instance.sourceCarried = effect.targetId === source.id ? sourceItem.carried : true;
        effect.instance.sourceActive = sourceItem.active;
      }
      const wounds = computeWoundState(source.health);
      if (effect.instance.sourceTraits?.sourceWoundPenalty !== wounds.penalty) {
        effect.instance.sourceTraits = { ...effect.instance.sourceTraits, sourceWoundPenalty: wounds.penalty };
        refreshed.push(effect);
      }
      if (effect.instance.rule?.activation?.endsWhenCasterIncapacitated && wounds.isIncapacitated && !removed.includes(effect)) removed.push(effect);
    }
    if (!removed.length && !refreshed.length) return false;
    rules.effects = rules.effects.filter((effect) => !removed.includes(effect));
    for (const effect of removed) this.queueRuleSheetMutation(effect.targetId, `conditional-end:${effect.instance.id}`, this.removeEffectResourceGrants(effect), [], [effect.instance.id]);
    for (const effect of refreshed.filter((entry) => !removed.includes(entry))) this.queueRuleSheetMutation(effect.targetId, `source-refresh:${effect.instance.id}:${this.roomState.seq + 1}:${effect.instance.sourceTraits?.sourceWoundPenalty}`);
    this.persistStateSnapshot();
    this.scheduleRulePersistence();
    return true;
  }

  private requireBoundSheet(attachment: InternalSocketAttachment, seatId?: string, sheetId?: string): W20UserCharacterSheet {
    this.reconcileRuleSources();
    const rules = this.getRuleState();
    const boundId = rules.seatBindings[buildParticipantKey(attachment.discordUserId, seatId)];
    if (!boundId || (sheetId && boundId !== sheetId)) throw new Error('This seat is no longer bound to the selected character.');
    const record = rules.sheets[boundId];
    if (!record) throw new Error('Bind this character sheet before using its rules.');
    return actorWithEffects(record.sheet, rules.effects, rules.clock);
  }

  private async handleBindTableSheet(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'BIND_TABLE_SHEET' }>,
    reqId: string,
  ): Promise<void> {
    const key = buildParticipantKey(attachment.discordUserId, command.seatId);
    const rules = this.getRuleState();
    if (!command.sheet) {
      delete rules.seatBindings[key];
      delete rules.seatAuthorizations[key];
      const participant = this.roomState.tableParticipants?.[key];
      if (participant) participant.sheetId = null;
      this.broadcastRuleState(reqId);
      this.scheduleRulePersistence();
      return;
    }
    try {
      const submitted = command.sheet;
      let stored: W20UserCharacterSheet | null = null;
      if (!isMockDiscordId(attachment.discordUserId) && (new SupabaseRestClient(this.env).isConfigured() || this.env.VTT_MEDIA_BUCKET)) {
        const repository = new UserSheetRepository(this.env);
        stored = await repository.getById(submitted.id);
      }
      if (stored) {
        const controlsSheet = stored.ownerDiscordId === attachment.discordUserId ||
          Boolean(command.syncCode && stored.syncCode === command.syncCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
        if (!controlsSheet) throw new Error('This character requires its owner or a valid sync code.');
      } else if (submitted.ownerDiscordId !== attachment.discordUserId) {
        throw new Error('Only the owner may bind a local character sheet.');
      }
      const existing = rules.sheets[submitted.id];
      // A sheet outside shared storage is vouched for only by the room record its owner bound.
      if (!stored && existing && existing.sheet.ownerDiscordId !== attachment.discordUserId) {
        throw new Error('Only the owner may bind a local character sheet.');
      }
      let sheet = structuredClone(submitted);
      const pendingLocalReceipts = existing && stored && hasUnacknowledgedRuleReceipts(existing.sheet.ruleActivationReceipts, stored.ruleActivationReceipts);
      const base = pendingLocalReceipts ? existing!.sheet : stored && (!existing || stored.updatedAt > existing.sheet.updatedAt) ? stored : existing?.sheet ?? stored;
      const hasUnacknowledgedChanges = base?.ruleActivationReceipts?.some((receipt) => !(submitted.ruleActivationReceipts ?? []).includes(receipt));
      if (base && (hasUnacknowledgedChanges || (existing && submitted.updatedAt <= existing.sheet.updatedAt))) {
        sheet = {
          ...sheet,
          rage: base.rage,
          gnosis: base.gnosis,
          willpower: base.willpower,
          health: base.health,
          experience: base.experience,
          renown: base.renown,
          rank: base.rank,
          activeForm: base.activeForm,
          fetishes: sheet.fetishes.filter((item) => !(base.ruleActivationReceipts ?? []).includes(`consumed:${item.id}`)),
          equipment: sheet.equipment?.filter((item) => !(base.ruleActivationReceipts ?? []).includes(`consumed:${item.id}`)),
          combatWeapons: sheet.combatWeapons.filter((item) => !(base.ruleActivationReceipts ?? []).includes(`consumed:${item.id}`)),
          activeRuleEffects: base.activeRuleEffects,
          ruleActivationReceipts: base.ruleActivationReceipts,
        };
      }
      const consumedIds = new Set((base?.ruleActivationReceipts ?? []).filter((receipt) => receipt.startsWith('consumed:')).map((receipt) => receipt.slice(9)));
      sheet.fetishes = sheet.fetishes.filter((item) => !consumedIds.has(item.id));
      sheet.equipment = sheet.equipment?.filter((item) => !consumedIds.has(item.id));
      sheet.combatWeapons = sheet.combatWeapons.filter((item) => !consumedIds.has(item.id));
      rules.sheets[sheet.id] = { sheet, controlledByDiscordId: attachment.discordUserId, editorUpdatedAt: submitted.updatedAt, canonicalKnown: Boolean(stored || existing?.canonicalKnown || sheet.ruleActivationReceipts?.length) };
      rules.seatBindings[key] = sheet.id;
      rules.seatAuthorizations[key] = { ownerDiscordId: stored?.ownerDiscordId ?? sheet.ownerDiscordId, ...(command.syncCode ? { syncCode: command.syncCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase() } : {}) };
      const participant = this.roomState.tableParticipants?.[key] ?? this.upsertTableParticipant(attachment.discordUserId, attachment.displayName, attachment.avatarUrl ?? null, true, command.seatId);
      participant.sheetId = sheet.id;
      participant.characterName = sheet.name;
      participant.activeForm = sheet.activeForm;
      participant.trackers = { ...participant.trackers, rage: sheet.rage.temporary, gnosis: sheet.gnosis.temporary, willpower: sheet.willpower.temporary };
      for (const instance of sheet.activeRuleEffects ?? []) {
        if (!rules.effects.some((effect) => effect.instance.id === instance.id)) {
          rules.effects.push({ instance: { ...instance, clockId: this.roomState.campaignId ?? '' }, sourceId: instance.sourceId.split(':')[0] ?? sheet.id, targetId: sheet.id, casterDiscordId: attachment.discordUserId });
        }
      }
      this.broadcastRuleState(reqId);
      this.scheduleRulePersistence();
    } catch (error) {
      this.sendRejection(ws, reqId, 'VALIDATION_ERROR', error instanceof Error ? error.message : 'Unable to bind this character.');
    }
  }

  private resolveRuleActor(attachment: InternalSocketAttachment, seatId?: string, characterId?: string): RuleActor {
    if (!characterId) return this.requireBoundSheet(attachment, seatId);
    const actor = this.roomState.characters[characterId];
    if (!actor) throw new Error('Character not found.');
    if (actor.ownerDiscordId !== attachment.discordUserId && attachment.role !== 'storyteller') throw new Error('You cannot control this character.');
    const rules = this.getRuleState();
    return actorWithEffects(actor, rules.effects, rules.clock);
  }

  private findRuleTarget(id: string): RuleActor | undefined {
    const rules = this.getRuleState();
    const actor = rules.sheets[id]?.sheet ?? this.roomState.characters[id];
    return actor ? actorWithEffects(actor, rules.effects, rules.clock) : undefined;
  }

  private broadcastRuleState(reqId?: string): void {
    const rules = this.getRuleState();
    for (const record of Object.values(rules.sheets)) {
      record.sheet = actorWithEffects(record.sheet, rules.effects, rules.clock);
    }
    this.commitAndBroadcast([{ event: { type: 'RULE_STATE_UPDATED', state: { sheets: [], effects: [], clock: { ...rules.clock } } } }], reqId);
    this.sendEphemeralBroadcast({ type: 'PARTICIPANTS_UPDATED', participants: Object.values(this.roomState.tableParticipants ?? {}) }, reqId);
  }

  private handleRuleCommand(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'ACTIVATE_RULE' | 'END_RULE_EFFECT' | 'ADVANCE_RULE_CLOCK' }>,
    reqId: string,
  ): void {
    try {
      if (command.type === 'ACTIVATE_RULE') this.activateRule(ws, attachment, command, reqId);
      if (command.type === 'END_RULE_EFFECT') this.endRuleEffect(attachment, command, reqId);
      if (command.type === 'ADVANCE_RULE_CLOCK') {
        if (this.roomState.storytellerDiscordId && attachment.role !== 'storyteller') throw new Error('Only the Storyteller advances this chronicle’s time.');
        this.advanceRuleClock(command.unit, command.amount, `${attachment.discordUserId}:${reqId}`);
        this.broadcastRuleState(reqId);
      }
      this.scheduleRulePersistence();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply this rule.';
      this.sendRejection(ws, reqId, classifyCoreErrorCode(message), message);
    }
  }

  private activateRule(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'ACTIVATE_RULE' }>,
    reqId: string,
  ): void {
    const rules = this.getRuleState();
    const operationId = this.ruleOperationId('activation', attachment.discordUserId, reqId);
    const previousReceipt = rules.activationReceipts[operationId];
    if (previousReceipt) {
      ws.send(JSON.stringify({ seq: this.roomState.seq, replyToReqId: reqId, serverTime: Date.now(), event: previousReceipt }));
      this.sendRuleStateToSocket(ws, attachment, reqId);
      return;
    }
    if (Object.values(rules.pendingActivations ?? {}).some((pending) => pending.operationId === operationId)) {
      this.sendRuleStateToSocket(ws, attachment, reqId);
      return;
    }
    const actor = this.resolveRuleActor(attachment, command.seatId, command.characterId);
    const { source, rule: baseRule } = findActorRule(actor, command.sourceEntryId, command.ruleId);
    if (isRuleSheet(actor) && baseRule.id === FAIR_FORTUNE_RULE_ID) throw new Error('Choose Fair Fortune on a failed or botched result.');
    const action = command.actionId ? baseRule.actions?.find((entry) => entry.id === command.actionId) : undefined;
    if (command.actionId && !action) throw new Error('This source does not provide that action.');
    const parentEffects = rules.effects.filter((effect) => effect.sourceId === actor.id && effect.instance.sourceId === `${actor.id}:${source.id}` && effect.instance.ruleId === baseRule.id && !(effect.instance.preparationRounds ?? 0) && !(effect.instance.preparationSeconds ?? 0));
    if (action?.requiresActive && !parentEffects.length) throw new Error('Activate this source before using its action.');
    if (action?.requiresActiveTarget) {
      const evaluation = evaluateModifierRules([], { ...actor, activeRuleEffects: parentEffects.map((effect) => effect.instance), ruleTraits: ruleTraits(actor) });
      const value = applyRuleValue(evaluation, action.requiresActiveTarget, 0);
      if (!value) throw new Error('The source’s required benefit is not active.');
    }
    const rule = action ? { ...baseRule, ...action, id: `${baseRule.id}:${action.id}` } : baseRule;
    const referencedRoll = command.referenceRollId ? rules.rollRequests[command.referenceRollId] : undefined;
    if (rule.activation?.correctsPreviousRoll) {
      if (!referencedRoll || referencedRoll.sheetId !== actor.id || referencedRoll.discordUserId !== attachment.discordUserId || !canCorrectRuleRoll(rules, referencedRoll)) throw new Error('Select this character’s original failed or insufficient roll.');
    } else if (command.referenceRollId) throw new Error('This rule does not modify a previous result.');
    if (Object.values(rules.pendingActivations ?? {}).some((pending) => pending.actorId === actor.id &&
      pending.source.id === source.id && (pending.rule.activation?.consumable || pending.parentEffectIds?.length)
    )) throw new Error('Resolve the pending use of this source first.');
    if (!action && !(isRuleSheet(actor) ? getSheetModifierSources(actor) : getCharacterModifierSources(actor)).some((entry) => entry.id === source.id)) throw new Error('This consumed source can only resolve its remaining documented action.');
    const choices = { ...source.ruleChoices, ...command.ruleChoices };
    validateRuleChoices(rule, choices, false);
    const grantedGift = rule.activation?.grantsGiftChoiceKey ? buildSharedGiftGrant(actor, String(choices[rule.activation.grantsGiftChoiceKey] ?? '')) : undefined;
    const shared = rule.effects.some((effect) => effect.recipient === 'shared');
    if (!rule.activation && !shared) throw new Error('This rule applies automatically when its conditions match.');
    const targets = [...new Set(command.targetIds)].map((id) => {
      const target = this.findRuleTarget(id);
      if (!target || ('isNpc' in target && target.isNpc && attachment.role !== 'storyteller')) throw new Error('A selected target is unavailable.');
      return target;
    });
    if (baseRule.id === 'fetish-unbroken-cord') {
      const pack = isRuleSheet(actor) ? actor.packName.trim().toLowerCase() : actor.packId;
      if (!targets.length || targets.length > actor.gnosis.temporary || !pack) throw new Error('Choose packmates up to the leader’s current Gnosis.');
      for (const target of targets) {
        const targetPack = isRuleSheet(target) ? target.packName.trim().toLowerCase() : target.packId;
        if (target.id === actor.id || targetPack !== pack) throw new Error('The Unbroken Cord shares a trait with other members of the leader’s pack.');
      }
    }
    if (rule.activation?.requiresTarget && targets.length === 0) throw new Error('Select the target to which this effect is bound.');
    const targetChoices = Object.fromEntries(targets.map((target) => {
      const choicesForTarget = { ...choices, ...command.targetChoices?.[target.id] };
      validateRuleChoices(rule, choicesForTarget, true);
      return [target.id, choicesForTarget];
    }));
    for (const target of targets) {
      if (rule.effects.some((effect) => effect.target === 'renown:reset_to_rank')) {
        const rankEffect = rule.effects.find((effect) => effect.target === 'rank');
        const rank = typeof rankEffect?.value === 'number' ? rankEffect.operation === 'set' ? rankEffect.value : target.rank + rankEffect.value : target.rank;
        const requirement = getW20RankRenownRequirement(target.auspice, rank);
        const selected = { glory: Number(targetChoices[target.id]?.renown_glory), honor: Number(targetChoices[target.id]?.renown_honor), wisdom: Number(targetChoices[target.id]?.renown_wisdom) };
        if (Object.entries(selected).some(([trait, value]) => !Number.isFinite(value) || value < 0 || value > target.renown[trait as keyof typeof selected].permanent)) throw new Error('Choose the target’s reduced permanent Renown.');
        if (requirement && ('total' in requirement ? selected.glory + selected.honor + selected.wisdom !== requirement.total : selected.glory !== requirement.glory || selected.honor !== requirement.honor || selected.wisdom !== requirement.wisdom)) throw new Error('The selected Renown must match the published requirements for the lower Rank.');
      }
      for (const trait of ['glory', 'honor', 'wisdom'] as const) {
        if (rule.effects.some((effect) => effect.target === 'renown:$choices.renown:permanent') && targetChoices[target.id]?.renown === trait && target.renown[trait].temporary < 10) throw new Error('The target requires ten temporary Renown before gaining a permanent dot.');
      }
    }
    if ((rule.activation?.condition || rule.activation?.preparation) && !command.confirmedConditions) throw new Error('Confirm the documented activation conditions before using this rule.');
    if (rule.activation?.rollSpec?.opposed && command.opposingSuccesses === undefined) throw new Error('Enter the opposing roll’s successes before resolving this effect.');
    if (rule.effects.some((effect) => effect.recipient === 'target') && targets.length === 0) throw new Error('Select a target for this effect.');
    if (rule.activation?.excludeCaster && targets.some((target) => target.id === actor.id)) throw new Error('This rule benefits other characters and excludes its caster.');
    if (shared && targets.length !== 1) throw new Error('Assign this shared benefit to one pack member.');
    const packId = isRuleSheet(actor) ? actor.packName.trim().toLowerCase() : actor.packId;
    if (rule.effects.some((effect) => effect.recipient === 'pack' || effect.recipient === 'shared')) {
      for (const target of targets) {
        const targetPack = isRuleSheet(target) ? target.packName.trim().toLowerCase() : target.packId;
        if (!packId || targetPack !== packId) throw new Error('This benefit requires a member of the same pack.');
      }
    }
    const costs = activationCosts(actor, source, rule, command.spendGnosis, command.variableCosts, choices);
    const permanentCost = rule.activation?.permanentCost;
    const permanentSpend = permanentCost ? Number(choices[permanentCost.choiceKey] ?? 0) : 0;
    if (permanentCost && (!Number.isInteger(permanentSpend) || permanentSpend < 0 || permanentSpend > actor[permanentCost.resource].permanent)) throw new Error('Choose an available permanent resource expenditure.');
    const sourceTraits: Record<string, number> = { ...captureRuleTraits(actor, costs), gauntlet: this.roomState.localGauntlet };
    const spends = rules.turnSpends[actor.id];
    const permitsMixedSpends = rule.activation?.allowRageGnosis || Boolean(applyRuleValue(evaluateModifierRules(isRuleSheet(actor) ? getSheetModifierSources(actor) : getCharacterModifierSources(actor), actor), 'spend:rage-and-gnosis-same-turn', 0));
    if (!permitsMixedSpends && spends?.turn === rules.clock.turn && ((costs.rage > 0 && spends.gnosis) || (costs.gnosis > 0 && spends.rage))) throw new Error('Rage and Gnosis cannot be spent in the same turn.');
    const frequency = rule.activation?.frequency;
    const frequencyKeys = frequency ? (frequency.includes('target') ? targets.map((target) => target.id) : ['self']).map((targetId) => {
      const scope = frequency.includes('ever') ? 'ever' : frequency.includes('day') ? `day:${Math.floor(rules.clock.seconds / 86400)}` : frequency.includes('scene') ? `scene:${rules.clock.scene}` : frequency.includes('session') ? `session:${rules.clock.session}` : frequency.includes('story') ? `story:${rules.clock.story}` : `turn:${rules.clock.turn}`;
      return `rule-use:${actor.id}:${rule.id}:${targetId}:${scope === 'ever' ? scope : `${this.roomState.ruleCommitNamespace}:${scope}`}`;
    }) : [];
    if (this.sharedRuleStage && isRuleSheet(actor) && actor.id === this.sharedRuleStage.payerSheetId) {
      this.sharedRuleStage.costs = costs;
      if (getSheetModifierSources(actor).some((entry) => entry.id === source.id)) this.sharedRuleStage.requiredSourceIds.push(source.id);
      this.sharedRuleStage.requiredAbsentReceipts.push(...frequencyKeys);
    }
    if (frequencyKeys.some((key) => rules.frequencyReceipts.includes(key) || isRuleSheet(actor) && actor.ruleActivationReceipts?.includes(key))) throw new Error('This rule has already been used for its documented limit.');
    const activationContext = { ...command.context, selectedItemId: source.id, rollKind: 'activation', ruleChoices: choices };
    const roller = rule.activation?.rollSpec?.actor === 'target' ? targets[0] : actor;
    if (!roller) throw new Error('Select the character making this action’s roll.');
    let request: W20RollRequest | undefined;
    const roll = rollRuleActivation(roller, source, rule, activationContext, command.spendGnosis, rollCsprngD10, {
      difficulty: command.activationDifficulty,
      target: targets[0],
      itemOwner: actor,
      specialtyMode: this.roomState.specialtyMode,
      captureRequest: (value) => { request = value; },
    });
    const rollerController = this.getActivationRollerController(roller, attachment.discordUserId);
    const isSecretRoll = command.isSecretRoll ?? true;
    const history: RollHistoryEntry | undefined = roll ? {
      id: 'activation-' + crypto.randomUUID(),
      timestamp: Date.now(),
      rollerDiscordId: rollerController ?? attachment.discordUserId,
      rollerName: roller.name,
      rollerAvatarUrl: rollerController === attachment.discordUserId ? attachment.avatarUrl ?? null : null,
      label: rule.name,
      rageDiceCount: 0,
      isSecretRoll,
      roll,
      ...(isRuleSheet(roller) ? { sheetId: roller.id } : {}),
    } : undefined;
    const continuation = {
      operationId, casterDiscordId: attachment.discordUserId, actorId: actor.id, source, rule,
      targetIds: targets.map((target) => target.id),
      parentEffectIds: action?.requiresActive || action?.endsParent ? parentEffects.map((effect) => effect.instance.id) : undefined,
      endsParent: action?.endsParent,
      endParentOnEitherResult: baseRule.id === 'talen-moon-sign' && action?.id === 'resist',
      grantedGift, choices, targetChoices, context: activationContext, sourceTraits,
      choiceValue: command.choiceValue, opposingSuccesses: command.opposingSuccesses ?? 0,
      referenceRollId: command.referenceRollId,
      privateRollerDiscordId: isSecretRoll ? history?.rollerDiscordId : undefined,
    };
    const charge = { costs, permanentSpend, frequencyKeys };
    if (isRuleSheet(actor) && isRuleSheet(roller) && rollerController && request && history && roll) {
      const original = {
        sheetId: roller.id, discordUserId: rollerController, request, history,
        minimumSuccesses: (rule.activation?.rollSpec?.minimumSuccesses ?? 1) + continuation.opposingSuccesses,
      };
      if (getRerollOptions(this.roomState, roller, original).length) {
        // The available resource and same-turn lock must reflect the payment for the original action.
        const payment = this.applyActivationCharge(actor, rule, choices, charge, []);
        this.queueRuleSheetMutation(actor.id, operationId + ':payment', payment.delta, [], [], payment.transactions);
        this.reserveActivationFrequency(actor.id, frequencyKeys);
        const currentRoller = rules.sheets[roller.id]!.sheet;
        if (getRerollOptions(this.roomState, currentRoller, original).length) {
          rules.rollRequests[history.id] = original;
          const sourceReservation = rule.activation?.consumable
            ? { sourceId: source.id, token: operationId }
            : undefined;
          if (sourceReservation && this.sharedRuleStage) {
            this.queueRuleSheetMutation(actor.id, reserveRuleSourceReceipt(source.id, operationId));
          }
          (rules.pendingActivations ??= {})[history.id] = { ...continuation, roll,
            sourceReservation: this.sharedRuleStage ? sourceReservation : undefined };
          this.publishActivationRoll(history, reqId);
          this.broadcastRuleState(reqId);
          return;
        }
        this.completeRuleActivation(continuation, roll, reqId);
        this.publishActivationRoll(history, reqId);
        return;
      }
    }
    this.completeRuleActivation(continuation, roll, reqId, charge);
    if (history) this.publishActivationRoll(history, reqId);
  }

  private getActivationRollerController(roller: RuleActor, requester: string): string | undefined {
    if (!isRuleSheet(roller)) return roller.ownerDiscordId ?? undefined;
    const seatControllers = Object.entries(this.getRuleState().seatBindings)
      .filter(([, id]) => id === roller.id)
      .map(([key]) => key.split('::')[0]!);
    if (seatControllers.includes(requester)) return requester;
    if (seatControllers.includes(roller.ownerDiscordId)) return roller.ownerDiscordId;
    return seatControllers[0];
  }

  private publishActivationRoll(history: RollHistoryEntry, reqId: string): void {
    this.roomState.rollHistory = [history, ...(this.roomState.rollHistory ?? [])].slice(0, 50);
    this.commitAndBroadcast([{ event: {
      type: 'DICE_ROLLED_3D',
      rollerDiscordId: history.rollerDiscordId,
      rollerName: history.rollerName,
      rollerAvatarUrl: history.rollerAvatarUrl,
      label: history.label,
      roll: history.roll,
      historyEntry: history,
      isSecretStRoll: history.isSecretRoll,
    }, targetDiscordId: history.isSecretRoll ? history.rollerDiscordId : null }], reqId);
  }

  private reserveActivationFrequency(actorId: string, frequencyKeys: string[]): void {
    this.getRuleState().frequencyReceipts.push(...frequencyKeys);
    for (const key of frequencyKeys) this.queueRuleSheetMutation(actorId, key);
  }

  private applyActivationCharge(
    actor: RuleActor,
    rule: PendingRuleActivation['rule'],
    choices: PendingRuleActivation['choices'],
    charge: { costs: { rage: number; gnosis: number; willpower: number }; permanentSpend: number },
    consumed: string[],
  ) {
    const rules = this.getRuleState();
    const spends = rules.turnSpends[actor.id];
    const { costs, permanentSpend } = charge;
    const permanentCost = rule.activation?.permanentCost;
    const transactions: Pick<RuleSheetMutation, 'permanentResourceDelta' | 'healthChanges'> = {};
    rules.turnSpends[actor.id] = { turn: rules.clock.turn, rage: costs.rage > 0 || (spends?.turn === rules.clock.turn && spends.rage) || false, gnosis: costs.gnosis > 0 || (spends?.turn === rules.clock.turn && spends.gnosis) || false };
    const nextActor = {
      ...actor,
      rage: { ...actor.rage, temporary: actor.rage.temporary - costs.rage },
      gnosis: { ...actor.gnosis, temporary: actor.gnosis.temporary - costs.gnosis },
      willpower: { ...actor.willpower, temporary: actor.willpower.temporary - costs.willpower },
      fetishes: actor.fetishes.filter((item) => !consumed.includes(item.id)),
      equipment: actor.equipment?.filter((item) => !consumed.includes(item.id)),
    } as RuleActor;
    if (isRuleSheet(nextActor)) nextActor.combatWeapons = nextActor.combatWeapons.filter((item) => !consumed.includes(item.id));
    if (permanentCost) {
      const tracker = nextActor[permanentCost.resource];
      nextActor[permanentCost.resource] = { permanent: tracker.permanent - permanentSpend, temporary: Math.min(tracker.temporary, tracker.permanent - permanentSpend) };
    }
    const healthCost = rule.activation?.healthCost;
    const healthLevels = healthCost ? healthCost.levels * (healthCost.choiceKey ? Number(choices[healthCost.choiceKey] ?? 0) : 1) : 0;
    if (healthCost && healthLevels > 0) nextActor.health = applyHealthStateDamage(isRuleSheet(nextActor) ? computeUserSheetStats(nextActor).health : computeEffectiveCharacterStats(nextActor).health, healthLevels, healthCost.type);
    if (!isRuleSheet(nextActor)) {
      nextActor.turnLocks = { ...nextActor.turnLocks, hasSpentRageThisTurn: nextActor.turnLocks.hasSpentRageThisTurn || costs.rage > 0, hasSpentGnosisThisTurn: nextActor.turnLocks.hasSpentGnosisThisTurn || costs.gnosis > 0, hasSpentWillpowerThisTurn: nextActor.turnLocks.hasSpentWillpowerThisTurn || costs.willpower > 0 };
    }
    this.storeRuleActor(nextActor);
    this.spendGrantedResources(actor.id, costs);
    const delta = { rage: -costs.rage, gnosis: -costs.gnosis, willpower: -costs.willpower };
    if (healthCost && healthLevels > 0) transactions.healthChanges = [{ levels: healthLevels, type: healthCost.type, mode: 'damage' }];
    if (permanentCost) {
      transactions.permanentResourceDelta = { [permanentCost.resource]: -permanentSpend };
      delta[permanentCost.resource] += nextActor[permanentCost.resource].temporary - (actor[permanentCost.resource].temporary - costs[permanentCost.resource]);
    }
    return { nextActor, delta, transactions };
  }

  private completeRuleActivation(
    pending: Omit<PendingRuleActivation, 'roll'>,
    roll: W20RollResult | null,
    reqId: string | undefined,
    charge?: { costs: { rage: number; gnosis: number; willpower: number }; permanentSpend: number; frequencyKeys: string[] },
  ): void {
    const rules = this.getRuleState();
    const { actorId, rule, source, operationId, casterDiscordId, grantedGift, parentEffectIds, endsParent, endParentOnEitherResult, choiceValue, opposingSuccesses, referenceRollId } = pending;
    const { choices, targetChoices, context: activationContext, sourceTraits } = structuredClone(pending);
    const actor = this.findRuleTarget(actorId);
    if (!actor) throw new Error('The activation’s source character is no longer available.');
    const targets = pending.targetIds.flatMap((id) => {
      const target = this.findRuleTarget(id);
      return target ? [target] : [];
    });
    const referencedRoll = referenceRollId ? rules.rollRequests[referenceRollId] : undefined;
    const shared = rule.effects.some((effect) => effect.recipient === 'shared');
    const successes = Math.max(0, (roll?.netSuccesses ?? 1) - opposingSuccesses);
    sourceTraits.opposedFailureMargin = Math.max(0, opposingSuccesses - (roll?.netSuccesses ?? 0));
    const minimum = rule.activation?.rollSpec?.minimumSuccesses ?? 1;
    const succeeded = rule.activation?.rollSpec?.outcome === 'failure' ? Boolean(roll && successes < minimum) : successes >= minimum;
    const limit = succeeded ? allocationLimit(rule, source, successes, choices, sourceTraits) : undefined;
    if (limit !== undefined && rule.activation?.allocation) {
      const allocation = rule.activation.allocation;
      if (allocation.consumeOnRoll) {
        choices[allocation.choiceKey] = limit;
        for (const target of targets) targetChoices[target.id]![allocation.choiceKey] = limit;
      }
      else if ((rule.choiceFields ?? []).some((field) => field.key === allocation.choiceKey && field.perTarget)) {
        const values = targets.map((target) => Number(targetChoices[target.id]?.[allocation.choiceKey] ?? 0));
        if (values.reduce((sum, value) => sum + value, 0) > limit) throw new Error('The allocated benefit exceeds the available pool.');
        if (allocation.evenSplit && values.length && Math.max(...values) - Math.min(...values) > 1) throw new Error('Divide this benefit as evenly as possible between recipients.');
      } else choices[allocation.choiceKey] = Math.min(Number(choices[allocation.choiceKey] ?? choiceValue ?? limit), limit);
    }
    const consumed = succeeded && rule.activation?.consumable ? [source.id] : [];
    const granted: ReturnType<typeof createRoomRuleEffect>[] = [];
    const activationEffects = succeeded ? rule.effects : roll?.isBotch ? rule.activation?.botchEffects ?? rule.activation?.failureEffects ?? [] : rule.activation?.failureEffects ?? [];
    if (activationEffects.length) {
      for (const recipient of ['self', 'target', 'pack', 'shared'] as const) {
        const effects = activationEffects.filter((effect) => !rule.activation?.correctsPreviousRoll && (effect.recipient ?? 'self') === recipient && (effect.duration || rule.activation || recipient === 'shared'));
        if (!effects.length) continue;
        const recipients = recipient === 'self' ? [actor] : targets;
        for (const target of recipients) {
          const durations = [...new Set(effects.map((effect) => effect.duration ?? rule.activation?.duration ?? 'until-ended'))];
          for (const duration of durations) {
            granted.push(createRoomRuleEffect({ id: `${operationId}:${target.id}:${recipient}:${granted.length}`, actor, source, rule,
              effects: effects.filter((effect) => (effect.duration ?? rule.activation?.duration ?? 'until-ended') === duration),
              targetId: target.id, recipient, casterDiscordId, clockId: this.roomState.campaignId ?? '', clock: rules.clock,
              successes, choiceValue, ruleChoices: { ...choices, ...(recipient === 'self' ? {} : targetChoices[target.id]) }, sourceTraits, boundTargetIds: recipient === 'self' && rule.activation?.requiresTarget ? targets.map((entry) => entry.id) : undefined }));
          }
        }
      }
    }
    if (grantedGift) for (const effect of granted) effect.instance.grantedGift = grantedGift;
    const replaced = rules.effects.filter((effect) => {
      if (effect.sourceId !== actor.id) return false;
      if (endsParent && (succeeded || endParentOnEitherResult) && parentEffectIds?.includes(effect.instance.id)) return true;
      return succeeded && effect.instance.ruleId === rule.id && (shared || effect.instance.sourceId === actor.id + ':' + source.id);
    });
    rules.effects = [...rules.effects.filter((effect) => !replaced.includes(effect)), ...granted];
    const resourceDeltas = new Map<string, { rage: number; gnosis: number; willpower: number }>();
    const transactions = new Map<string, Partial<Pick<RuleSheetMutation, 'renownDelta' | 'experienceDelta' | 'mysticalExperienceDelta' | 'permanentResourceDelta' | 'healthChanges' | 'rank'>>>();
    if (charge) {
      const payment = this.applyActivationCharge(actor, rule, choices, charge, consumed);
      resourceDeltas.set(actor.id, payment.delta);
      transactions.set(actor.id, payment.transactions);
    } else if (consumed.length) {
      const nextActor = structuredClone(actor);
      if (isRuleSheet(nextActor)) {
        nextActor.fetishes = nextActor.fetishes.filter((item) => !consumed.includes(item.id));
        nextActor.combatWeapons = nextActor.combatWeapons.filter((item) => !consumed.includes(item.id));
      } else nextActor.fetishes = nextActor.fetishes.filter((item) => !consumed.includes(item.id));
      nextActor.equipment = nextActor.equipment?.filter((item) => !consumed.includes(item.id));
      this.storeRuleActor(nextActor);
    }
    const replacementWithdrawals = new Map<string, NonNullable<RuleSheetMutation['grantWithdrawals']>>();
    for (const effect of replaced) {
      const removed = this.removeEffectResourceGrants(effect);
      const current = resourceDeltas.get(effect.targetId) ?? { rage: 0, gnosis: 0, willpower: 0 };
      resourceDeltas.set(effect.targetId, { rage: current.rage + removed.rage, gnosis: current.gnosis + removed.gnosis, willpower: current.willpower + removed.willpower });
      replacementWithdrawals.set(effect.targetId, [...(replacementWithdrawals.get(effect.targetId) ?? []), ...removed.grantWithdrawals]);
    }
    for (const effect of granted) {
      const target = this.findRuleTarget(effect.targetId);
      if (!target || (effect.instance.preparationRounds ?? 0) > 0 || (effect.instance.preparationSeconds ?? 0) > 0) continue;
      const changes = this.applyImmediateRuleResources(target, effect, activationContext);
      const transaction = this.applyImmediateRuleTransactions(this.findRuleTarget(effect.targetId)!, effect, activationContext);
      const priorTransactions = transactions.get(target.id) ?? {};
      transactions.set(target.id, { ...priorTransactions, ...transaction, healthChanges: [...(priorTransactions.healthChanges ?? []), ...(transaction.healthChanges ?? [])] });
      const current = resourceDeltas.get(target.id) ?? { rage: 0, gnosis: 0, willpower: 0 };
      resourceDeltas.set(target.id, { rage: current.rage + changes.rage, gnosis: current.gnosis + changes.gnosis, willpower: current.willpower + changes.willpower });
    }
    rules.effects = rules.effects.filter((effect) => effect.instance.duration !== 'instant' || (effect.instance.preparationRounds ?? 0) > 0 || (effect.instance.preparationSeconds ?? 0) > 0);
    const affected = new Set([actor.id, ...granted.map((effect) => effect.targetId), ...replaced.map((effect) => effect.targetId)]);
    for (const targetId of affected) {
      this.queueRuleSheetMutation(targetId, `${operationId}:${targetId}`, resourceDeltas.get(targetId), targetId === actor.id ? consumed : [], [...replaced.map((effect) => effect.instance.id), ...granted.filter((effect) => effect.instance.duration === 'instant').map((effect) => effect.instance.id)], { ...transactions.get(targetId), grantWithdrawals: replacementWithdrawals.get(targetId),
        sourceReservation: targetId === actor.id ? pending.sourceReservation : undefined });
    }
    if (charge) this.reserveActivationFrequency(actor.id, charge.frequencyKeys);
    const receipt: Extract<ServerEvent, { type: 'RULE_ACTIVATION_RESOLVED' }> = {
      type: 'RULE_ACTIVATION_RESOLVED',
      activationId: operationId,
      sourceId: actor.id,
      ruleId: rule.id,
      roll: pending.privateRollerDiscordId && pending.privateRollerDiscordId !== casterDiscordId ? null : roll,
      succeeded,
    };
    rules.activationReceipts[operationId] = receipt;
    this.commitAndBroadcast([{ event: receipt, targetDiscordId: casterDiscordId }], reqId);
    if (referencedRoll && !referencedRoll.rerolled && !referencedRoll.superseded && succeeded) this.correctPreviousRuleRoll(referencedRoll, successes, rule.name, reqId);
    this.broadcastRuleState(reqId);
  }

  private correctPreviousRuleRoll(original: NonNullable<ReturnType<GameRoomDO['getRuleState']>['rollRequests'][string]>, successes: number, ruleName: string, reqId?: string): void {
    const previous = original.history;
    const netSuccesses = previous.roll.netSuccesses + successes;
    const degrees = ['marginal', 'moderate', 'complete', 'exceptional', 'phenomenal'] as const;
    const roll: W20RollResult = { ...previous.roll, automaticSuccesses: previous.roll.automaticSuccesses + successes, netSuccesses, isBotch: false, outcome: degrees[Math.min(5, Math.max(1, netSuccesses)) - 1]! };
    const history: RollHistoryEntry = { ...previous, id: `correction-${crypto.randomUUID()}`, timestamp: Date.now(), label: `${previous.label} + ${ruleName}`, roll, correctionOf: previous.id };
    original.superseded = true;
    this.roomState.rollHistory = [history, ...(this.roomState.rollHistory ?? [])].slice(0, 50);
    this.commitAndBroadcast([{ event: { type: 'DICE_ROLLED_3D', rollerDiscordId: history.rollerDiscordId, rollerName: history.rollerName, label: history.label, roll, historyEntry: history, isSecretStRoll: history.isSecretRoll }, targetDiscordId: history.isSecretRoll ? history.rollerDiscordId : null }], reqId);
  }

  private storeRuleActor(actor: RuleActor): void {
    const rules = this.getRuleState();
    const next = actorWithEffects(actor, rules.effects, rules.clock);
    if (isRuleSheet(next)) {
      const record = rules.sheets[next.id];
      if (record) record.sheet = { ...next, updatedAt: Math.max(Date.now(), next.updatedAt + 1) };
      for (const participant of Object.values(this.roomState.tableParticipants ?? {})) {
        if (participant.sheetId === next.id) {
          participant.trackers = { ...participant.trackers, rage: next.rage.temporary, gnosis: next.gnosis.temporary, willpower: next.willpower.temporary };
          participant.activeForm = next.activeForm;
        }
      }
    } else {
      this.roomState.characters[next.id] = { ...next, stateVersion: next.stateVersion + 1 };
      this.pendingRuleCharacterIds.add(next.id);
      this.pendingRuleTokenUpdate = this.syncTokenForCharacter(next) || this.pendingRuleTokenUpdate;
      this.scheduleCharacterFlush([this.roomState.characters[next.id]!]);
    }
  }

  private applyImmediateRuleResources(actor: RuleActor, effect: import('@w20-vtt/protocol').RoomRuleEffect, context: RuleContext) {
    const deltas = { rage: 0, gnosis: 0, willpower: 0 };
    const instant = effect.instance.duration === 'instant';
    const effects = effect.instance.rule?.effects.filter((entry) => ['resource:rage', 'resource:gnosis', 'resource:willpower'].includes(entry.target) && (instant || entry.operation === 'add' && typeof entry.value === 'number' && entry.value > 0)) ?? [];
    if (!effects.length) return deltas;
    const evaluation = evaluateModifierRules([], { ...actor, activeRuleEffects: [{ ...effect.instance, rule: { ...effect.instance.rule!, effects } }] }, context);
    let next = actor;
    for (const trait of ['rage', 'gnosis', 'willpower'] as const) {
      const updated = Math.max(0, applyRuleValue(evaluation, `resource:${trait}`, next[trait].temporary));
      deltas[trait] = updated - next[trait].temporary;
      next = { ...next, [trait]: { ...next[trait], temporary: updated } };
      if (!instant && deltas[trait] > 0) effect.instance.resourceGrants = { ...effect.instance.resourceGrants, [trait]: deltas[trait] };
    }
    const appliedTargets = new Set(evaluation.modifiers.map((modifier) => modifier.target));
    effect.instance.rule = { ...effect.instance.rule!, effects: effect.instance.rule!.effects.filter((entry) => !effects.includes(entry) || !appliedTargets.has(entry.target)) };
    this.storeRuleActor(next);
    return deltas;
  }

  private applyImmediateRuleTransactions(actor: RuleActor, effect: import('@w20-vtt/protocol').RoomRuleEffect, context: RuleContext): Partial<Pick<RuleSheetMutation, 'renownDelta' | 'experienceDelta' | 'mysticalExperienceDelta' | 'healthChanges' | 'rank' | 'activeForm'>> {
    if (effect.instance.duration !== 'instant') return {};
    const evaluation = evaluateModifierRules([], { ...actor, activeRuleEffects: [effect.instance] }, context);
    const renown = { ...actor.renown };
    const renownDelta: NonNullable<RuleSheetMutation['renownDelta']> = {};
    for (const trait of ['glory', 'honor', 'wisdom'] as const) {
      let temporary = applyRuleValue(evaluation, `renown:${trait}`, renown[trait].temporary);
      let permanent = Math.max(0, Math.min(10, applyRuleValue(evaluation, `renown:${trait}:permanent`, renown[trait].permanent)));
      while (temporary < 0 && permanent > 0) { temporary += 10; permanent -= 1; }
      temporary = Math.max(0, temporary);
      renownDelta[trait] = { temporary: temporary - renown[trait].temporary, permanent: permanent - renown[trait].permanent };
      renown[trait] = { temporary, permanent };
    }
    const levels = Math.max(0, Math.floor(applyRuleValue(evaluation, 'healing:levels', 0)));
    const healAggravated = Boolean(applyRuleValue(evaluation, 'healing:aggravated', 0));
    const health = levels ? healHealthStateDamage(isRuleSheet(actor) ? computeUserSheetStats(actor).health : computeEffectiveCharacterStats(actor).health, levels, { healAggravated }) : actor.health;
    let damagedHealth = health;
    const healthChanges: NonNullable<RuleSheetMutation['healthChanges']> = levels ? [{ levels, healAggravated, mode: 'heal' }] : [];
    for (const type of ['bashing', 'lethal', 'aggravated'] as const) {
      const damage = Math.max(0, Math.floor(applyRuleValue(evaluation, `damage:${type}_levels`, 0)));
      if (damage) {
        damagedHealth = applyHealthStateDamage(damagedHealth, damage, type);
        healthChanges.push({ levels: damage, type, mode: 'damage' });
      }
    }
    const mystical = Math.max(0, Math.floor(applyRuleValue(evaluation, 'experience:mystical', 0)));
    const experience = Math.max(0, Math.floor(applyRuleValue(evaluation, 'experience:total', 0)));
    const rank = Math.max(0, Math.min(6, Math.floor(applyRuleValue(evaluation, 'rank', actor.rank))));
    if (applyRuleValue(evaluation, 'renown:reset_to_rank', 0)) {
      for (const trait of ['glory', 'honor', 'wisdom'] as const) {
        const permanent = Number(effect.instance.ruleChoices?.[`renown_${trait}`] ?? renown[trait].permanent);
        renownDelta[trait] = { temporary: -actor.renown[trait].temporary, permanent: permanent - actor.renown[trait].permanent };
        renown[trait] = { temporary: 0, permanent };
      }
    }
    const forcedForm = (Object.keys(W20_FORM_MATRIX) as Array<RuleActor['activeForm']>).find((form) => applyRuleValue(evaluation, `form:${form}`, 0));
    let next: RuleActor = { ...actor, renown, health: damagedHealth, rank, activeForm: forcedForm ?? actor.activeForm };
    if (isRuleSheet(next)) next = { ...next, experience: { ...next.experience, total: next.experience.total + experience, mystical: (next.experience.mystical ?? 0) + mystical } };
    else next = { ...next, mysticalExperience: (next.mysticalExperience ?? 0) + mystical };
    this.storeRuleActor(next);
    return { renownDelta, experienceDelta: experience, mysticalExperienceDelta: mystical, healthChanges, ...(rank !== actor.rank ? { rank } : {}), ...(forcedForm ? { activeForm: forcedForm } : {}) };
  }

  private spendGrantedResources(actorId: string, costs: { rage: number; gnosis: number; willpower: number }): void {
    const effects = this.getRuleState().effects.filter((effect) => effect.targetId === actorId && effect.instance.resourceGrants);
    for (const trait of ['rage', 'gnosis', 'willpower'] as const) {
      let remaining = costs[trait];
      for (const effect of effects) {
        const available = effect.instance.resourceGrants?.[trait] ?? 0;
        const used = Math.min(available, remaining);
        effect.instance.resourceGrants = { ...effect.instance.resourceGrants, [trait]: available - used };
        remaining -= used;
      }
    }
  }

  private consumeNextRollEffects(actorId: string, modifiers: AppliedRuleModifier[], operationId: string, context: RuleContext = {}): void {
    const rules = this.getRuleState();
    const usedSources = new Set(modifiers.map((modifier) => modifier.sourceId));
    const reserved = new Set(Object.values(rules.pendingActivations ?? {}).flatMap((pending) => pending.parentEffectIds ?? []));
    const changed = rules.effects.filter((effect) =>
      effect.targetId === actorId && effect.instance.ruleId !== FAIR_FORTUNE_RULE_ID &&
      usedSources.has(effect.instance.sourceId) && !reserved.has(effect.instance.id)
    );
    const removed: string[] = [];
    for (const effect of changed) {
      const allocation = effect.instance.rule?.activation?.allocation;
      if (allocation?.consumeOnRoll) {
        const available = Number(effect.instance.ruleChoices?.[allocation.choiceKey] ?? effect.instance.successes ?? 0);
        const spent = Number(context.effectChoices?.[effect.instance.id]?.[allocation.choiceKey] ?? context.ruleChoices?.[allocation.choiceKey] ?? 0);
        effect.instance.ruleChoices = { ...effect.instance.ruleChoices, [allocation.choiceKey]: Math.max(0, available - spent) };
        if (available <= spent) removed.push(effect.instance.id);
      } else if (/next[- ]roll|one (?:\w+ )?roll|one attack|one failed|one insufficient/i.test(effect.instance.duration)) removed.push(effect.instance.id);
    }
    if (!changed.length) return;
    rules.effects = rules.effects.filter((effect) => !removed.includes(effect.instance.id));
    this.queueRuleSheetMutation(actorId, `${operationId}:consume`, undefined, [], removed);
  }

  private queueRuleSheetMutation(sheetId: string, operationId: string, resourceDelta: { rage: number; gnosis: number; willpower: number; grantWithdrawals?: RuleSheetMutation['grantWithdrawals'] } = { rage: 0, gnosis: 0, willpower: 0 }, consumedSourceIds: string[] = [], removedEffectIds: string[] = [], details: Partial<Pick<RuleSheetMutation, 'renownDelta' | 'experienceDelta' | 'mysticalExperienceDelta' | 'permanentResourceDelta' | 'healthChanges' | 'rank' | 'activeForm' | 'grantWithdrawals' | 'sourceReservation'>> = {}): void {
    const rules = this.getRuleState();
    const record = rules.sheets[sheetId];
    if (!record) {
      const character = this.roomState.characters[sheetId];
      if (character) this.storeRuleActor({ ...character, activeRuleEffects: (character.activeRuleEffects ?? []).filter((instance) => !removedEffectIds.includes(instance.id)) });
      return;
    }
    const effects = rules.effects.filter((effect) => effect.targetId === sheetId).map((effect) => effect.instance);
    record.sheet = { ...record.sheet, activeRuleEffects: [...(record.sheet.activeRuleEffects ?? []).filter((instance) => !removedEffectIds.includes(instance.id) && !effects.some((current) => current.id === instance.id)), ...effects], ruleActivationReceipts: [...new Set([...(record.sheet.ruleActivationReceipts ?? []), operationId, ...consumedSourceIds.map((id) => `consumed:${id}`)])] };
    const { grantWithdrawals, ...resourceChanges } = resourceDelta;
    rules.persistenceQueue.push({ sheetId, operationId, resourceDelta: resourceChanges, consumedSourceIds, effects, removedEffectIds, ...details, grantWithdrawals: [...(details.grantWithdrawals ?? []), ...(grantWithdrawals ?? [])] });
  }

  private endRuleEffect(attachment: InternalSocketAttachment, command: Extract<ClientCommand, { type: 'END_RULE_EFFECT' }>, reqId: string): void {
    const rules = this.getRuleState();
    const effect = rules.effects.find((item) => item.instance.id === command.effectId);
    if (!effect) return;
    if (Object.values(rules.pendingActivations ?? {}).some((pending) => pending.parentEffectIds?.includes(effect.instance.id))) {
      throw new Error('Resolve the pending use of this effect first.');
    }
    const target = this.findRuleTarget(effect.targetId);
    const controlsTarget = target && (target.ownerDiscordId === attachment.discordUserId || isRuleSheet(target) && Object.entries(rules.seatBindings).some(([key, id]) => id === target.id && (key === attachment.discordUserId || key.startsWith(`${attachment.discordUserId}::`))));
    if (effect.casterDiscordId !== attachment.discordUserId && !controlsTarget && attachment.role !== 'storyteller') throw new Error('Only the caster, recipient, or Storyteller may end this effect.');
    rules.effects = rules.effects.filter((item) => item !== effect);
    const resourceDelta = this.removeEffectResourceGrants(effect);
    this.queueRuleSheetMutation(effect.targetId, this.ruleOperationId('end', attachment.discordUserId, reqId), resourceDelta, [], [effect.instance.id]);
    this.broadcastRuleState(reqId);
  }

  private advanceRuleClock(unit: 'turn' | 'scene' | 'story' | 'session' | 'seconds', amount: number, operationId: string): void {
    const rules = this.getRuleState();
    if (rules.advanceReceipts.includes(operationId)) return;
    for (const rollId of Object.keys(rules.pendingActivations ?? {})) this.finishPendingActivation(rollId);
    rules.advanceReceipts.push(operationId);
    const prior = rules.effects;
    rules.clock[unit] += amount;
    rules.effects = prior.flatMap((effect) => {
      if (unit === 'scene' && effect.instance.ruleId === FAIR_FORTUNE_RULE_ID && effect.instance.duration === 'next-roll') return [];
      if (unit === 'turn' && (effect.instance.preparationRounds ?? 0) > 0) {
        const required = effect.instance.preparationRounds ?? 0;
        const prepared = { ...effect, instance: { ...effect.instance, preparationRounds: Math.max(0, required - amount) } };
        const elapsed = Math.max(0, amount - required);
        const next = elapsed > 0 ? advanceRuleEffect(prepared, unit, elapsed) : prepared;
        return next ? [next] : [];
      }
      if (unit === 'seconds' && (effect.instance.preparationSeconds ?? 0) > 0) {
        const required = effect.instance.preparationSeconds ?? 0;
        const prepared = { ...effect, instance: { ...effect.instance, preparationSeconds: Math.max(0, required - amount) } };
        const elapsed = Math.max(0, amount - required);
        const next = elapsed > 0 ? advanceRuleEffect(prepared, unit, elapsed) : prepared;
        return next ? [next] : [];
      }
      const next = advanceRuleEffect(effect, unit, amount);
      return next ? [next] : [];
    });
    const completedResources = new Map<string, { rage: number; gnosis: number; willpower: number }>();
    const completedTransactions = new Map<string, Partial<Pick<RuleSheetMutation, 'renownDelta' | 'experienceDelta' | 'mysticalExperienceDelta' | 'healthChanges' | 'rank'>>>();
    for (const effect of rules.effects) {
      const earlier = prior.find((entry) => entry.instance.id === effect.instance.id);
      const wasPreparing = (earlier?.instance.preparationRounds ?? 0) > 0 || (earlier?.instance.preparationSeconds ?? 0) > 0;
      if (!wasPreparing || (effect.instance.preparationRounds ?? 0) > 0 || (effect.instance.preparationSeconds ?? 0) > 0) continue;
      const target = this.findRuleTarget(effect.targetId);
      if (!target) continue;
      const context: RuleContext = { ruleChoices: effect.instance.ruleChoices, rollKind: 'activation' };
      completedResources.set(target.id, this.applyImmediateRuleResources(target, effect, context));
      completedTransactions.set(target.id, this.applyImmediateRuleTransactions(this.findRuleTarget(target.id)!, effect, context));
    }
    rules.effects = rules.effects.filter((effect) => effect.instance.duration !== 'instant' || (effect.instance.preparationRounds ?? 0) > 0 || (effect.instance.preparationSeconds ?? 0) > 0);
    for (const targetId of new Set(prior.map((effect) => effect.targetId))) {
      const resourceDelta = completedResources.get(targetId) ?? { rage: 0, gnosis: 0, willpower: 0 };
      const grantWithdrawals: NonNullable<RuleSheetMutation['grantWithdrawals']> = [];
      for (const expired of prior.filter((effect) => effect.targetId === targetId && !rules.effects.some((current) => current.instance.id === effect.instance.id))) {
        const delta = this.removeEffectResourceGrants(expired);
        grantWithdrawals.push(...delta.grantWithdrawals);
        for (const trait of ['rage', 'gnosis', 'willpower'] as const) resourceDelta[trait] += delta[trait];
      }
      this.queueRuleSheetMutation(targetId, `${operationId}:${targetId}`, resourceDelta, [], prior.filter((effect) => effect.targetId === targetId).map((effect) => effect.instance.id), { ...completedTransactions.get(targetId), grantWithdrawals });
    }
  }

  private removeEffectResourceGrants(effect: import('@w20-vtt/protocol').RoomRuleEffect) {
    const changes = { rage: 0, gnosis: 0, willpower: 0, grantWithdrawals: [] as NonNullable<RuleSheetMutation['grantWithdrawals']> };
    const target = this.findRuleTarget(effect.targetId);
    if (!target || !effect.instance.resourceGrants) return changes;
    let next = target;
    for (const trait of ['rage', 'gnosis', 'willpower'] as const) {
      const removed = Math.min(next[trait].temporary, effect.instance.resourceGrants[trait] ?? 0);
      changes[trait] = -removed;
      next = { ...next, [trait]: { ...next[trait], temporary: next[trait].temporary - removed } };
    }
    this.storeRuleActor(next);
    changes.grantWithdrawals.push({ effectId: effect.instance.id, resourceDelta: { rage: changes.rage, gnosis: changes.gnosis, willpower: changes.willpower } });
    return changes;
  }

  private scheduleRulePersistence(): void {
    if (this.sharedRuleStage || this.roomState.sharedRuleIntent) return;
    if (this.rulePersistencePromise) return;
    this.rulePersistencePromise = this.flushRulePersistence().finally(() => { this.rulePersistencePromise = null; });
    this.ctx.waitUntil(this.rulePersistencePromise);
  }

  private async flushRulePersistence(): Promise<void> {
    const rules = this.getRuleState();
    const repository = new UserSheetRepository(this.env);
    while (rules.persistenceQueue.length) {
      const mutation = rules.persistenceQueue[0]!;
      const record = rules.sheets[mutation.sheetId];
      if (record && isMockDiscordId(record.controlledByDiscordId)) {
        rules.persistenceQueue.shift();
        this.persistStateSnapshot();
        continue;
      }
      try {
        const current = await repository.getById(mutation.sheetId);
        if (!current) throw new RuleSpendConflictError('NOT_FOUND', 'A queued character is no longer in shared storage.');
        if (!current.ruleActivationReceipts?.includes(mutation.operationId)) {
          const saved = mutation.grantWithdrawals?.length && !mutation.sourceReservation
            ? await repository.mutateRuleState(mutation.sheetId, (sheet) => applyCanonicalGrantCleanup(sheet, mutation))
            : (await repository.authorizeRuleSpend({
                sheetId: mutation.sheetId,
                ownerDiscordId: current.ownerDiscordId,
                operationId: `outbox:${this.roomState.ruleCommitNamespace}:${mutation.operationId}`,
                costs: { rage: Math.max(0, -mutation.resourceDelta.rage), gnosis: Math.max(0, -mutation.resourceDelta.gnosis), willpower: Math.max(0, -mutation.resourceDelta.willpower) },
                resourceDelta: mutation.resourceDelta,
                permanentResourceDelta: mutation.permanentResourceDelta,
                consumedSourceIds: mutation.consumedSourceIds,
                sourceReservationSettlements: mutation.sourceReservation ? [mutation.sourceReservation] : [],
                additionalReceipts: [mutation.operationId],
              }, (sheet) => applyCanonicalGrantCleanup(sheet, { ...mutation, resourceDelta: { rage: 0, gnosis: 0, willpower: 0 }, permanentResourceDelta: undefined }))).sheet;
          if (saved && rules.sheets[saved.id]) this.replaceCanonicalRuleSheet(saved);
        }
        rules.persistenceQueue.shift();
        this.persistStateSnapshot();
      } catch (error) {
        if (error instanceof RuleSpendConflictError && error.code === 'NOT_FOUND' && record?.canonicalKnown === false) {
          // A local-only recipient has no shared row. Keep its in-room updates without blocking saved sheets.
          rules.persistenceQueue.shift();
          this.persistStateSnapshot();
          continue;
        }
        // The durable outbox is retried on the next authenticated interaction or reconnect.
        return;
      }
      this.broadcastStorytellerSeats();
    }
  }

  private sendRuleStateToSocket(ws: WebSocket, attachment: InternalSocketAttachment, reqId?: string): void {
    ws.send(JSON.stringify({ seq: this.roomState.seq, replyToReqId: reqId, serverTime: Date.now(), event: { type: 'RULE_STATE_UPDATED', state: projectRuleState(this.roomState, attachment) } }));
  }

  private applyRuleEvent(attachment: InternalSocketAttachment, command: Extract<ClientCommand, { type: 'APPLY_RULE_EVENT' }>, reqId: string): void {
    const rules = this.getRuleState();
    const actor = this.resolveRuleActor(attachment, command.seatId, command.characterId);
    if (!isRuleSheet(actor) && command.event === 'experience_award') throw new Error(`General experience awards require Storyteller approval through POST /api/campaigns/${actor.campaignId}/xp-award and the existing XP ledger.`);
    if (!isRuleSheet(actor) && command.event === 'renown_award' && this.roomState.storytellerDiscordId && attachment.role !== 'storyteller') throw new Error('Only the Storyteller awards Renown to a chronicle character.');
    const operationId = this.ruleOperationId('event', attachment.discordUserId, reqId);
    if (rules.frequencyReceipts.includes(operationId) || isRuleSheet(actor) && actor.ruleActivationReceipts?.includes(operationId)) return;
    const allSources = isRuleSheet(actor) ? getSheetModifierSources(actor) : getCharacterModifierSources(actor);
    const sources = command.sourceEntryId ? allSources.filter((source) => source.id === command.sourceEntryId) : allSources;
    if (command.sourceEntryId && !sources.length) throw new Error('This rule source is no longer available.');
    const context: RuleContext = { ...command.context, authoritativeTags: [`event:${command.event}`], tags: (command.context?.tags ?? []).filter((tag) => !tag.startsWith('event:')) };
    const eventSources = sources.flatMap((source) => {
      const definition = getSourceModifierRule(source);
      if (!definition) return [];
      if (command.ruleId && command.ruleId !== definition.id) return [];
      const receipt = `event-use:${actor.id}:${source.id}:${command.event}:${command.event === 'totem_acceptance' ? 'ever' : `${this.roomState.ruleCommitNamespace}:${command.event === 'session_start' ? rules.clock.session : rules.clock.story}`}`;
      if (!command.event.endsWith('_award') && (rules.frequencyReceipts.includes(receipt) || isRuleSheet(actor) && actor.ruleActivationReceipts?.includes(receipt))) return [];
      const effects = definition.effects.filter((effect) => effect.when?.includes(`event:${command.event}`) || command.event === 'renown_award' && effect.target.endsWith(':award_adjustment'));
      return effects.length ? [{ source: { ...source, customRule: { ...definition, effects } }, receipt }] : [];
    });
    const eventActor = { ...actor, activeRuleEffects: (actor.activeRuleEffects ?? []).map((instance) => ({ ...instance, rule: instance.rule ? { ...instance.rule, effects: instance.rule.effects.filter((effect) => effect.when?.includes(`event:${command.event}`)) } : undefined })) };
    const evaluation = evaluateModifierRules(eventSources.map((entry) => entry.source), eventActor, context);
    let next = actor;
    const deltas = { rage: 0, gnosis: 0, willpower: 0 };
    for (const trait of ['rage', 'gnosis', 'willpower'] as const) {
      const temporary = Math.max(0, applyRuleValue(evaluation, `resource:${trait}`, actor[trait].temporary));
      deltas[trait] = temporary - actor[trait].temporary;
      next = { ...next, [trait]: { ...next[trait], temporary } };
    }
    const renown = { ...actor.renown };
    const renownDelta: NonNullable<RuleSheetMutation['renownDelta']> = {};
    for (const trait of ['glory', 'honor', 'wisdom'] as const) {
      const award = command.event === 'renown_award' && command.trait === trait ? Math.max(0, (command.amount ?? 0) + applyRuleValue(evaluation, `renown:${trait}:award_adjustment`, 0)) : 0;
      let temporary = applyRuleValue(evaluation, `renown:${trait}`, actor.renown[trait].temporary) + award;
      let permanent = Math.max(0, Math.min(10, applyRuleValue(evaluation, `renown:${trait}:permanent`, actor.renown[trait].permanent)));
      while (temporary < 0 && permanent > 0) { temporary += 10; permanent -= 1; }
      temporary = Math.max(0, temporary);
      renownDelta[trait] = { temporary: temporary - actor.renown[trait].temporary, permanent: permanent - actor.renown[trait].permanent };
      renown[trait] = { temporary, permanent };
    }
    const mysticalExperienceDelta = Math.max(0, Math.floor(applyRuleValue(evaluation, 'experience:mystical', 0)));
    const experienceDelta = command.event === 'experience_award' ? command.amount ?? 0 : 0;
    next = { ...next, renown };
    if (isRuleSheet(next)) next = { ...next, experience: { ...next.experience, total: next.experience.total + experienceDelta, mystical: (next.experience.mystical ?? 0) + mysticalExperienceDelta } };
    else next = { ...next, mysticalExperience: (next.mysticalExperience ?? 0) + mysticalExperienceDelta };
    const packWillpower = Math.max(0, applyRuleValue(evaluation, 'pack:willpower:story', 0));
    if (packWillpower && command.event === 'story_start') {
      const pack = isRuleSheet(actor) ? actor.packName.trim().toLowerCase() : actor.packId;
      const poolReceipt = `pack-pool:${pack}:${rules.clock.story}`;
      if (!rules.frequencyReceipts.includes(poolReceipt)) {
        rules.packWillpower = { current: packWillpower, max: packWillpower };
        if (pack) rules.packPools[pack] = { current: packWillpower, max: packWillpower, name: isRuleSheet(actor) ? actor.packName : this.roomState.packTotem?.name ?? pack };
        rules.frequencyReceipts.push(poolReceipt);
      }
    }
    this.storeRuleActor(next);
    rules.frequencyReceipts.push(operationId, ...eventSources.map((entry) => entry.receipt));
    this.queueRuleSheetMutation(actor.id, operationId, deltas, [], [], { renownDelta, experienceDelta, mysticalExperienceDelta });
    for (const entry of eventSources) this.queueRuleSheetMutation(actor.id, entry.receipt);
    this.broadcastRuleState(reqId);
  }

  private rerollRuleRoll(ws: WebSocket, attachment: InternalSocketAttachment, command: Extract<ClientCommand, { type: 'REROLL_RULE_ROLL' }>, reqId: string): void {
    const rules = this.getRuleState();
    const operationId = this.ruleOperationId('reroll', attachment.discordUserId, reqId);
    const previous = rules.rollReceipts[operationId];
    if (previous) {
      ws.send(JSON.stringify({ seq: this.roomState.seq, replyToReqId: reqId, serverTime: Date.now(), event: { type: 'DICE_ROLLED_3D', rollerDiscordId: previous.rollerDiscordId, rollerName: previous.rollerName, label: previous.label, roll: previous.roll, historyEntry: previous, isSecretStRoll: previous.isSecretRoll } }));
      return;
    }
    const actor = this.requireBoundSheet(attachment, command.seatId, command.sheetId);
    const original = rules.rollRequests[command.rollId];
    if (!original || original.sheetId !== actor.id || original.discordUserId !== attachment.discordUserId) throw new Error('This result is unavailable for this character.');
    const option = getRerollOptions(this.roomState, actor, original).find((entry) => entry.ruleId === command.ruleId);
    if (!option) throw new Error('This reroll is unavailable for the original result or this character.');
    const roll = resolveW20DicePool(original.request);
    if (this.sharedRuleStage) {
      this.sharedRuleStage.costs.gnosis = option.gnosisCost;
      this.sharedRuleStage.requiredSourceIds.push(option.sourceId);
      this.sharedRuleStage.requiredAbsentReceipts.push(option.useReceipt);
    }
    original.rerolled = true;
    rules.rerollUsage[option.budgetKey] = option.previousUsage + 1;
    if (option.gnosisCost) {
      const previousSpend = rules.turnSpends[actor.id];
      rules.turnSpends[actor.id] = {
        turn: rules.clock.turn, gnosis: true, rage: previousSpend?.turn === rules.clock.turn && previousSpend.rage,
      };
      this.storeRuleActor({ ...actor, gnosis: { ...actor.gnosis, temporary: actor.gnosis.temporary - option.gnosisCost } });
      this.spendGrantedResources(actor.id, { rage: 0, gnosis: option.gnosisCost, willpower: 0 });
    }
    if (option.prepaid) rules.effects = rules.effects.filter((effect) => effect.instance.id !== option.prepaid?.instance.id);
    const refund = !original.refundedWillpower && getRuleResultTriggers(roll, original.request.ruleModifiers ?? [], { spentWillpower: original.request.spendWillpower }).refundWillpower;
    if (refund) {
      if (original.packKey && rules.packPools[original.packKey]) {
        const pool = rules.packPools[original.packKey]!;
        pool.current = Math.min(pool.max, pool.current + 1);
      } else {
        const current = rules.sheets[actor.id]!.sheet;
        this.storeRuleActor({ ...current, willpower: { ...current.willpower, temporary: current.willpower.temporary + 1 } });
      }
      original.refundedWillpower = true;
    }
    this.queueRuleSheetMutation(actor.id, operationId,
      { rage: 0, gnosis: -option.gnosisCost, willpower: refund && !original.packKey ? 1 : 0 }, [],
      option.prepaid ? [option.prepaid.instance.id] : []);
    this.queueRuleSheetMutation(actor.id, option.useReceipt);
    const history: RollHistoryEntry = { ...original.history, id: `roll-${this.roomState.seq + 1}-${roll.physicsSeed}`, timestamp: Date.now(), label: `${original.history.label} — ${option.name}`, roll, rerollOf: original.history.id };
    rules.rollReceipts[operationId] = history;
    this.roomState.rollHistory = [history, ...(this.roomState.rollHistory ?? [])].slice(0, 50);
    this.commitAndBroadcast([{ event: { type: 'DICE_ROLLED_3D', rollerDiscordId: attachment.discordUserId, rollerName: history.rollerName, label: history.label, roll, historyEntry: history, isSecretStRoll: history.isSecretRoll }, targetDiscordId: history.isSecretRoll ? attachment.discordUserId : null }], reqId);
    if (rules.pendingActivations?.[command.rollId]) this.finishPendingActivation(command.rollId, reqId, roll);
    else this.broadcastRuleState(reqId);
  }

  private keepActivationRoll(
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'KEEP_ACTIVATION_RESULT' }>,
    reqId: string,
  ): void {
    const actor = this.requireBoundSheet(attachment, command.seatId, command.sheetId);
    const original = this.getRuleState().rollRequests[command.rollId];
    if (!original || original.sheetId !== actor.id || original.discordUserId !== attachment.discordUserId) {
      throw new Error('This activation result is unavailable for this character.');
    }
    if (original.activationClosed) {
      this.broadcastRuleState(reqId);
      return;
    }
    this.finishPendingActivation(command.rollId, reqId);
  }

  private finishPendingActivation(rollId: string, reqId?: string, replacement?: W20RollResult): void {
    const rules = this.getRuleState();
    const pending = rules.pendingActivations?.[rollId];
    const original = rules.rollRequests[rollId];
    if (!pending || !original) throw new Error('This activation is no longer awaiting a result.');
    delete rules.pendingActivations![rollId];
    original.activationClosed = true;
    this.completeRuleActivation(pending, replacement ?? pending.roll, reqId);
  }

  private resolveTableRuleRoll(sheet: W20UserCharacterSheet, shortcut: import('@w20-vtt/core').SheetShortcut, context: RuleContext = {}, attachment?: InternalSocketAttachment) {
    for (const instance of sheet.activeRuleEffects ?? []) {
      const allocation = instance.rule?.activation?.allocation;
      if (!allocation?.consumeOnRoll) continue;
      const spent = Number(context.effectChoices?.[instance.id]?.[allocation.choiceKey] ?? context.ruleChoices?.[allocation.choiceKey] ?? 0);
      const available = Number(instance.ruleChoices?.[allocation.choiceKey] ?? instance.successes ?? 0);
      if (!Number.isFinite(spent) || spent < 0 || spent > available) throw new Error('Choose a bonus within the effect’s remaining dice.');
    }
    const shortcutSourceKey = (source: typeof shortcut.source) =>
      JSON.stringify(Object.entries(source).sort());
    const unverifiedSpecialty =
      shortcut.forceSpecialty === true &&
      shortcut.source.kind !== 'static' &&
      !sheet.shortcuts.some(
        (saved) =>
          saved.id === shortcut.id &&
          saved.forceSpecialty === true &&
          shortcutSourceKey(saved.source) === shortcutSourceKey(shortcut.source)
      );
    const resolved = resolveSheetShortcut(
      sheet,
      unverifiedSpecialty ? { ...shortcut, forceSpecialty: false } : shortcut,
      context
    );
    const defenses: AppliedRuleModifier[] = [];
    const targetPending: string[] = [];
    for (const targetId of [...new Set(context.targetIds ?? [])]) {
      const target = this.findRuleTarget(targetId);
      if (!target || 'isNpc' in target && target.isNpc && attachment?.role !== 'storyteller') throw new Error('A selected target is unavailable.');
      const evaluation = evaluateModifierRules(isRuleSheet(target) ? getSheetModifierSources(target) : getCharacterModifierSources(target), { ...target, ruleTraits: ruleTraits(target) }, { ...resolved.context, authoritativeTags: [...(resolved.context.authoritativeTags ?? []), 'target:source'] });
      defenses.push(...evaluation.modifiers.filter((modifier) => modifier.target.startsWith('target:')).map((modifier) => ({ ...modifier, target: modifier.target.slice(7) })));
      targetPending.push(...evaluation.pending.filter((entry) => entry.rule.effects.some((effect) => effect.target.startsWith('target:'))).flatMap((entry) => entry.reasons));
    }
    const pool = Math.max(0, Math.min(30, applyRuleValue({ modifiers: defenses }, 'pool', resolved.rawPool)));
    const difficulty = Math.max(2, Math.min(10, applyRuleValue({ modifiers: defenses }, 'difficulty', resolved.difficulty)));
    const modifiers = [...resolved.modifiers, ...defenses];
    const specialty = resolveW20Specialty({
      hasApplicableSpecialty: resolved.declaredSpecialty,
      ruleModifiers: modifiers,
    });
    return { pool, effectivePool: Math.max(0, pool + (resolved.applyWoundPenalty ? resolved.woundPenalty : 0)), difficulty,
      declaredSpecialty: resolved.declaredSpecialty, hasSpecialty: specialty.hasApplicableSpecialty, applyWoundPenalty: resolved.applyWoundPenalty, woundPenalty: resolved.woundPenalty,
      modifiers, pendingTags: [...resolved.pending.flatMap((pending) => pending.reasons), ...targetPending], bonusAutomaticSuccesses: resolved.bonusAutomaticSuccesses,
      ...(context.rollKind === 'initiative' ? { initiativeModifier: computeUserSheetStats(sheet, { ...context, rollKind: 'initiative' }).initiativeBonus } : {}) };
  }

  private handleRollTablePool(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'ROLL_TABLE_POOL' }>,
    reqId: string,
  ): void {
    const rules = this.getRuleState();
    const operationId = this.ruleOperationId('roll', attachment.discordUserId, command.rollClientId ?? reqId);
    const previous = rules.rollReceipts[operationId];
    if (previous) {
      ws.send(
        JSON.stringify({
          seq: this.roomState.seq,
          replyToReqId: reqId,
          serverTime: Date.now(),
          event: {
            type: 'DICE_ROLLED_3D',
            rollerDiscordId: previous.rollerDiscordId,
            rollerName: previous.rollerName,
            label: previous.label,
            roll: previous.roll,
            historyEntry: previous,
            rollClientId: command.rollClientId,
            isSecretStRoll: previous.isSecretRoll,
          },
        })
      );
      this.sendRuleStateToSocket(ws, attachment, reqId);
      return;
    }
    const participant = this.resolveTargetParticipant(attachment, command.seatId);
    participant.isConnected = true;

    const isInitiative = command.rollMode === 'initiative';
    let typed: ReturnType<GameRoomDO['resolveTableRuleRoll']> | undefined;
    let sheet: W20UserCharacterSheet | undefined;
    let packKey: string | undefined;
    try {
      if (
        command.shortcut ||
        command.sheetId ||
        rules.seatBindings[buildParticipantKey(attachment.discordUserId, command.seatId)]
      ) {
        sheet = this.requireBoundSheet(attachment, command.seatId, command.sheetId);
        if (command.shortcut)
          typed = this.resolveTableRuleRoll(
            sheet,
            command.shortcut,
            command.ruleContext,
            attachment
          );
      }
      if (command.spendWillpower && !isInitiative) {
        if (command.willpowerSource === 'pack') {
          packKey = sheet?.packName.trim().toLowerCase();
          if (!packKey || !rules.packPools[packKey] || rules.packPools[packKey]!.current < 1)
            throw new Error('This character has no available pack Willpower.');
        } else if ((sheet?.willpower.temporary ?? participant.trackers.willpower) < 1)
          throw new Error('Insufficient temporary Willpower.');
      }
    } catch (error) {
      this.sendRejection(
        ws,
        reqId,
        'VALIDATION_ERROR',
        error instanceof Error ? error.message : 'Unable to resolve this roll.'
      );
      return;
    }
    const applyWounds = typed?.applyWoundPenalty ?? command.applyWoundPenalty;
    if (this.sharedRuleStage && sheet && command.spendWillpower && !isInitiative && command.willpowerSource !== 'pack') this.sharedRuleStage.costs.willpower = 1;
    const woundPenalty = applyWounds
      ? (typed?.woundPenalty ??
        (sheet ? computeUserSheetStats(sheet).woundPenalty : participant.trackers.woundPenalty))
      : 0;
    const stats =
      sheet && isInitiative
        ? computeUserSheetStats(sheet, { ...command.ruleContext, rollKind: 'initiative' })
        : undefined;
    const resultModifiers =
      typed?.modifiers ??
      stats?.modifiers ??
      (sheet
        ? computeUserSheetStats(sheet).modifiers.filter(
            (modifier) =>
              modifier.target.startsWith('reroll:') ||
              modifier.target.startsWith('willpower:refund')
          )
        : []);
    const cleanLabel = command.label?.trim() || (isInitiative ? 'Initiative' : 'W20 Dice Pool');
    const request = {
      label: cleanLabel,
      basePool: typed?.pool ?? command.pool,
      woundPenalty,
      applyWoundPenalty: applyWounds,
      baseDifficulty: typed?.difficulty ?? command.difficulty,
      hasApplicableSpecialty: typed?.declaredSpecialty ?? command.hasSpecialty,
      spendWillpower: command.spendWillpower,
      specialtyMode: this.roomState.specialtyMode ?? 'w20_double',
      ruleModifiers: resultModifiers,
    };
    const roll = isInitiative
      ? resolveW20InitiativeRoll(
          {
            label: cleanLabel,
            initiativeModifier:
              stats ? stats.initiativeBonus - (applyWounds ? 0 : stats.woundPenalty) + (command.initiativeAdjustment ?? 0) : command.initiativeModifier !== undefined
                ? command.initiativeModifier
                : woundPenalty,
          },
          () => command.physicalDiceValues?.[0] ?? rollCsprngD10(),
        )
      : resolveW20DicePool(request, rollCsprngD10, {
          base: command.physicalDiceValues,
          bonusWaves: command.physicalBonusWaves,
        });

    const rageDiceCount = isInitiative
      ? 0
      : Math.min(roll.effectivePool, Math.max(0, command.rageDiceCount));
    let willpowerSpent = false;
    const refund =
      !isInitiative &&
      getRuleResultTriggers(roll, resultModifiers, { spentWillpower: command.spendWillpower })
        .refundWillpower;
    if (!isInitiative && command.spendWillpower && !refund && packKey) {
      rules.packPools[packKey]!.current -= 1;
      willpowerSpent = true;
    } else if (
      !isInitiative &&
      command.spendWillpower &&
      !refund &&
      participant.trackers.willpower > 0
    ) {
      participant.trackers.willpower -= 1;
      willpowerSpent = true;
      if (sheet) {
        this.storeRuleActor({
          ...sheet,
          willpower: { ...sheet.willpower, temporary: sheet.willpower.temporary - 1 },
        });
        this.queueRuleSheetMutation(
          sheet.id,
          operationId,
          { rage: 0, gnosis: 0, willpower: -1 }
        );
        this.spendGrantedResources(sheet.id, { rage: 0, gnosis: 0, willpower: 1 });
      }
    }

    const rollerName = formatRollerName(
      participant,
      attachment.displayName,
      command.rollerDisplayName,
    );

    const isSecretRoll = Boolean(command.isSecretRoll);
    const historyEntry: RollHistoryEntry = {
      id: `roll-${this.roomState.seq + 1}-${roll.physicsSeed}`,
      timestamp: Date.now(),
      rollerDiscordId: attachment.discordUserId,
      rollerName,
      rollerAvatarUrl: participant.avatarUrl,
      label: cleanLabel,
      rageDiceCount,
      isSecretRoll,
      roll,
      ...(sheet ? { modifiers: resultModifiers } : {}),
      ...(sheet ? { sheetId: sheet.id } : {}),
    };
    rules.rollReceipts[operationId] = historyEntry;
    if (sheet && !isInitiative)
      rules.rollRequests[historyEntry.id] = {
        sheetId: sheet.id,
        discordUserId: attachment.discordUserId,
        request,
        history: historyEntry,
        refundedWillpower: refund,
        packKey,
      };

    this.roomState.rollHistory = [historyEntry, ...(this.roomState.rollHistory ?? [])].slice(0, 50);

    // A non-secret initiative roll takes that seat's place in the shared order,
    // replacing any earlier roll for the same seat. Secret rolls stay private.
    const recordsInitiative = isInitiative && !isSecretRoll;
    if (recordsInitiative) {
      const seatId = normalizeSeatId(command.seatId);
      const participantKey = buildParticipantKey(attachment.discordUserId, seatId);
      this.roomState.tableInitiative = [
        ...(this.roomState.tableInitiative ?? []).filter(
          (entry) => entry.participantKey !== participantKey,
        ),
        {
          participantKey,
          discordUserId: attachment.discordUserId,
          seatId,
          displayName: rollerName,
          total: roll.initiativeTotal ?? roll.netSuccesses,
          rolledAt: historyEntry.timestamp,
        },
      ];
    }

    if (sheet) {
      this.consumeNextRollEffects(sheet.id, resultModifiers, operationId, command.ruleContext);
      this.broadcastRuleState(reqId);
      this.scheduleRulePersistence();
    }

    this.commitAndBroadcast(
      [
        {
          event: {
            type: 'DICE_ROLLED_3D',
            rollerDiscordId: attachment.discordUserId,
            label: cleanLabel,
            roll,
            rollerName: historyEntry.rollerName,
            rollerAvatarUrl: historyEntry.rollerAvatarUrl,
            rageDiceCount,
            ...(command.rollClientId ? { rollClientId: command.rollClientId } : {}),
            ...(isSecretRoll ? { isSecretStRoll: true } : {}),
            historyEntry,
          },
          targetRole: null,
          targetDiscordId: isSecretRoll ? attachment.discordUserId : null,
        },
      ],
      reqId,
    );

    if (recordsInitiative) {
      this.broadcastTableInitiative();
    }

    if (willpowerSpent) {
      this.sendEphemeralBroadcast({
        type: 'PARTICIPANTS_UPDATED',
        participants: Object.values(this.roomState.tableParticipants ?? {}),
      });
    }

    if (this.roomState.campaignId && !this.roomState.campaignId.startsWith('dice-room-')) {
      this.scheduleRollAuditAndWebhook({
        campaignId: this.roomState.campaignId,
        characterId: null,
        rollerDiscordId: attachment.discordUserId,
        rollerName: historyEntry.rollerName,
        label: cleanLabel,
        roll,
        hasSpecialty: roll.hasApplicableSpecialty,
        spentWillpower: command.spendWillpower,
        isSecretStRoll: isSecretRoll,
      });
    }
  }

  private sendEphemeralBroadcast(
    event: ServerEvent,
    replyToReqId?: string,
    excludeWs?: WebSocket,
  ): void {
    if (this.sharedRuleStage) {
      this.sharedRuleStage.emissions.push({ kind: 'ephemeral', event: structuredClone(event), replyToReqId });
      return;
    }
    const envelope: ServerEnvelope<ServerEvent> = {
      seq: this.roomState.seq,
      ...(replyToReqId ? { replyToReqId } : {}),
      serverTime: Date.now(),
      event,
    };
    const serialized = JSON.stringify(envelope);
    for (const sock of this.ctx.getWebSockets()) {
      if (excludeWs && sock === excludeWs) {
        continue;
      }
      const att = this.getAttachment(sock);
      if (!att.authenticated) {
        continue;
      }
      sock.send(serialized);
    }
    if (event.type === 'PARTICIPANTS_UPDATED') this.broadcastStorytellerSeats(excludeWs);
  }

  private sendRejection(
    ws: WebSocket,
    replyToReqId: string | undefined,
    code: CommandRejectionCode,
    message: string,
  ): void {
    if (this.sharedRuleStage) throw new StagedRuleRejection(code, message);
    const envelope: ServerEnvelope<ServerEvent> = {
      seq: this.roomState.seq,
      ...(replyToReqId ? { replyToReqId } : {}),
      serverTime: Date.now(),
      event: {
        type: 'COMMAND_REJECTED',
        code,
        message,
        currentSeq: this.roomState.seq,
      },
    };
    ws.send(JSON.stringify(envelope));
  }

  private isExpectedSeqAcceptable(
    expectedSeq: number,
    attachment: InternalSocketAttachment,
  ): boolean {
    if (expectedSeq === this.roomState.seq) {
      return true;
    }
    if (expectedSeq > this.roomState.seq || expectedSeq < 0) {
      return false;
    }

    // If all events emitted after expectedSeq were hidden from this socket (e.g. secret ST rolls or other players' whispers),
    // do not spuriously reject the player's command.
    const oldestBufferedSeq = this.eventRing[0]?.seq ?? this.roomState.seq + 1;
    if (expectedSeq < oldestBufferedSeq - 1) {
      return false;
    }

    for (const entry of this.eventRing) {
      if (entry.seq > expectedSeq && isEntryVisibleToAttachment(entry, attachment)) {
        return false;
      }
    }
    return true;
  }

  private async ensureRoomHydrated(campaignId: string): Promise<boolean> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }
    this.hydrationPromise = this.performEnsureRoomHydrated(campaignId);
    try {
      return await this.hydrationPromise;
    } finally {
      this.hydrationPromise = null;
    }
  }

  private async performEnsureRoomHydrated(campaignId: string): Promise<boolean> {
    if (campaignId.startsWith('dice-room-')) {
      this.roomState.campaignId = campaignId;
      this.roomState.tableParticipants ??= {};
      this.roomState.rollHistory ??= [];
      this.roomState.tableInitiative ??= [];
      this.persistStateSnapshot();
      return true;
    }

    if (this.roomState.campaignId === campaignId && this.roomState.storytellerDiscordId) {
      return true;
    }

    const supa = new SupabaseRestClient(this.env);
    if (!supa.isConfigured()) {
      return false;
    }

    const hydrated = await supa.loadRoomHydrationData(campaignId);
    if (!hydrated) {
      return false;
    }

    this.roomState.campaignId = hydrated.campaign.id;
    this.roomState.storytellerDiscordId = hydrated.campaign.storyteller_discord_id;
    this.roomState.diceLogWebhookUrl = hydrated.campaign.dice_log_webhook_url;
    this.roomState.guildId = hydrated.campaign.discord_guild_id;
    this.roomState.localGauntlet = Number(hydrated.campaign.local_gauntlet ?? 6);
    this.roomState.moonPhase = hydrated.campaign.current_moon_phase ?? 'half';
    this.roomState.specialtyMode = hydrated.campaign.specialty_mode ?? 'w20_double';
    this.roomState.mapAssetUrl = hydrated.campaign.map_asset_url ?? null;
    this.roomState.packTotem = hydrated.packTotem;

    this.roomState.characters = {};
    this.roomState.persistedCharacterIds = [];
    for (const char of hydrated.characters) {
      this.roomState.characters[char.id] = char;
      this.roomState.persistedCharacterIds.push(char.id);
      this.ensureTokenForCharacter(char);
    }

    this.persistStateSnapshot();
    return true;
  }

  private ensureTokenForCharacter(char: W20CharacterState): void {
    if (this.roomState.tokens.some((tok) => tok.characterId === char.id)) {
      return;
    }
    const idx = this.roomState.tokens.length;
    const x = 175 + (idx % 6) * 140;
    const y = 175 + Math.floor(idx / 6) * 140;
    this.roomState.tokens.push({
      id: `tok-${char.id}`,
      characterId: char.id,
      name: char.deedName || char.name,
      x,
      y,
      form: char.activeForm,
      realm: char.activeRealm,
      portraitUrl: char.portraitsByForm[char.activeForm] ?? Object.values(char.portraitsByForm)[0] ?? '',
      isHidden: char.isNpc,
    });
  }

  private syncTokenForCharacter(char: W20CharacterState): boolean {
    let changed = false;
    for (const token of this.roomState.tokens) {
      if (token.characterId === char.id) {
        const nextPortrait =
          char.portraitsByForm[char.activeForm] ?? token.portraitUrl ?? '';
        if (
          token.form !== char.activeForm ||
          token.realm !== char.activeRealm ||
          token.portraitUrl !== nextPortrait
        ) {
          token.form = char.activeForm;
          token.realm = char.activeRealm;
          token.portraitUrl = nextPortrait;
          changed = true;
        }
        changed = true;
      }
    }
    return changed;
  }

  private snapshotRawTokens(): StoredMapToken[] {
    return this.roomState.tokens.map((t) => ({ ...t }));
  }

  private persistStateSnapshot(): void {
    if (this.sharedRuleStage) return;
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO room_state (id, state_json, updated_at) VALUES (1, ?, ?)',
      JSON.stringify(this.roomState),
      Date.now(),
    );
  }

  private commitAndBroadcast(
    pending: PendingOutboundEvent[],
    replyToReqId?: string,
    directSnapshotSockets?: WebSocket[],
  ): void {
    if (this.reconcileRuleSources())
      pending = [
        ...pending,
        {
          event: {
            type: 'RULE_STATE_UPDATED',
            state: { sheets: [], effects: [], clock: this.getRuleState().clock },
          },
        },
      ];
    for (const id of this.pendingRuleCharacterIds) {
      const character = this.roomState.characters[id];
      if (character)
        pending = [
          ...pending,
          {
            event: { type: 'CHARACTER_PATCHED', characterId: id, character },
            targetRole: character.isNpc ? 'storyteller' : null,
          },
        ];
    }
    this.pendingRuleCharacterIds.clear();
    if (this.pendingRuleTokenUpdate)
      pending = [
        ...pending,
        {
          event: { type: 'TOKENS_UPDATED', tokens: [] },
          rawTokensSnapshot: this.snapshotRawTokens(),
        },
      ];
    this.pendingRuleTokenUpdate = false;
    if (this.sharedRuleStage) {
      this.sharedRuleStage.emissions.push({ kind: 'commit', pending: structuredClone(pending), replyToReqId });
      this.roomState.seq += pending.length;
      return;
    }
    this.trimRuleReplayCaches();
    this.persistAndBroadcastEvents(pending, replyToReqId, directSnapshotSockets);
  }

  private persistAndBroadcastEvents(
    pending: PendingOutboundEvent[],
    replyToReqId?: string,
    directSnapshotSockets?: WebSocket[],
    transactional = false,
  ): void {
    const newEntries: BufferedRoomEvent[] = [];
    const previousSeq = this.roomState.seq;
    const now = Date.now();

    for (const item of pending) {
      this.roomState.seq += 1;
      const seq = this.roomState.seq;
      const envelope: ServerEnvelope<ServerEvent> = {
        seq,
        ...(replyToReqId ? { replyToReqId } : {}),
        serverTime: now,
        event: item.event,
      };
      const entry: BufferedRoomEvent = {
        seq,
        targetRole: item.targetRole ?? null,
        targetDiscordId: item.targetDiscordId ?? null,
        envelope,
        ...(item.rawTokensSnapshot ? { rawTokensSnapshot: item.rawTokensSnapshot } : {}),
        ...(item.rawCombatSnapshot !== undefined
          ? { rawCombatSnapshot: item.rawCombatSnapshot }
          : {}),
      };
      newEntries.push(entry);
    }

    const nextRing = [...this.eventRing, ...newEntries].slice(-EVENT_RING_CAPACITY);
    const persist = () => {
      this.persistStateSnapshot();
      for (const entry of newEntries) {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO room_event_ring (seq, target_role, target_discord_id, envelope_json, raw_tokens_json, raw_combat_json) VALUES (?, ?, ?, ?, ?, ?)',
          entry.seq,
          entry.targetRole,
          entry.targetDiscordId,
          JSON.stringify(entry.envelope),
          entry.rawTokensSnapshot ? JSON.stringify(entry.rawTokensSnapshot) : null,
          entry.rawCombatSnapshot !== undefined ? JSON.stringify(entry.rawCombatSnapshot) : null,
        );
      }
      if (this.eventRing.length + newEntries.length > EVENT_RING_CAPACITY) {
        this.ctx.storage.sql.exec('DELETE FROM room_event_ring WHERE seq < ?', nextRing[0]?.seq ?? this.roomState.seq);
      }
    };
    try {
      if (transactional) this.ctx.storage.transactionSync(persist);
      else persist();
    } catch (error) {
      this.roomState.seq = previousSeq;
      throw error;
    }
    this.eventRing = nextRing;

    const speakingIds = this.collectSpeakingDiscordIds();
    const forceSnapshotSet = new Set(directSnapshotSockets ?? []);

    for (const sock of this.ctx.getWebSockets()) {
      const att = this.getAttachment(sock);
      if (!att.authenticated) {
        continue;
      }

      for (const entry of newEntries) {
        const projected = projectEnvelopeForAttachment(entry, this.roomState, att);
        if (projected) {
          try { sock.send(JSON.stringify(projected)); } catch { /* Durable events can be replayed. */ }
        }
      }

      if (forceSnapshotSet.has(sock)) {
        const snapshotEnvelope: ServerEnvelope<ServerEvent> = {
          seq: this.roomState.seq,
          ...(replyToReqId ? { replyToReqId } : {}),
          serverTime: now,
          event: {
            type: 'SYNC_SNAPSHOT',
            snapshot: buildProjectedSnapshot(this.roomState, att, speakingIds),
          },
        };
        try { sock.send(JSON.stringify(snapshotEnvelope)); } catch { /* Reconnect sends a fresh snapshot. */ }
      }
    }
  }

  private async handleHelloAuth(
    ws: WebSocket,
    envelope: ClientEnvelope,
    command: Extract<ClientCommand, { type: 'HELLO_AUTH' }>,
  ): Promise<void> {
    const routedRoomId = this.getAttachment(ws).routedRoomId;
    if (routedRoomId !== command.campaignId ||
        (this.roomState.campaignId && this.roomState.campaignId !== routedRoomId)) {
      this.sendRejection(ws, envelope.reqId, 'FORBIDDEN', 'The requested room does not match this connection.');
      ws.close(1008, 'Room mismatch');
      return;
    }
    const session = await verifySessionJwt(command.sessionJwt, this.env.SUPABASE_JWT_SECRET);
    if (!session) {
      this.sendRejection(ws, envelope.reqId, 'UNAUTHORIZED', 'Invalid or expired session token.');
      ws.close(1008, 'Unauthorized');
      return;
    }

    const ok = await this.ensureRoomHydrated(command.campaignId);
    if (!ok) {
      this.sendRejection(ws, envelope.reqId, 'VALIDATION_ERROR', 'Campaign room not found.');
      ws.close(1008, 'Campaign not found');
      return;
    }

    const role: ParticipantRole =
      !routedRoomId.startsWith(VOICE_TABLE_PREFIX) &&
      session.discordId === this.roomState.storytellerDiscordId ? 'storyteller' : 'player';

    if (
      role !== 'storyteller' &&
      this.roomState.guildId &&
      !session.guildIds.includes(this.roomState.guildId)
    ) {
      this.sendRejection(
        ws,
        envelope.reqId,
        'UNAUTHORIZED',
        'You do not belong to this chronicle Discord server.',
      );
      ws.close(1008, 'Forbidden');
      return;
    }

    let activeCharacterId = command.characterId;
    if (activeCharacterId) {
      let targetChar = this.roomState.characters[activeCharacterId];
      if (!targetChar) {
        const supa = new SupabaseRestClient(this.env);
        if (supa.isConfigured()) {
          const loaded = await supa.getCharacterById(activeCharacterId);
          if (loaded && loaded.campaignId === command.campaignId) {
            this.roomState.characters[loaded.id] = loaded;
            if (!this.roomState.persistedCharacterIds.includes(loaded.id)) {
              this.roomState.persistedCharacterIds.push(loaded.id);
            }
            this.ensureTokenForCharacter(loaded);
            this.persistStateSnapshot();
            targetChar = loaded;
          }
        }
      }

      if (!targetChar) {
        this.sendRejection(ws, envelope.reqId, 'VALIDATION_ERROR', 'Selected character not found.');
        ws.close(1008, 'Character not found');
        return;
      }

      if (role !== 'storyteller' && targetChar.ownerDiscordId !== session.discordId) {
        this.sendRejection(
          ws,
          envelope.reqId,
          'UNAUTHORIZED',
          'You cannot control another player character.',
        );
        ws.close(1008, 'Forbidden');
        return;
      }
      activeCharacterId = targetChar.id;
    }

    const attachment: InternalSocketAttachment = {
      discordUserId: session.discordId,
      displayName: session.globalName || session.username,
      role,
      activeCharacterId: activeCharacterId ?? null,
      connectedAt: Date.now(),
      authenticated: true,
      routedRoomId,
      isSpeaking: false,
      avatarUrl: session.avatarUrl,
    };
    ws.serializeAttachment(attachment);

    this.upsertTableParticipant(
      session.discordId,
      session.globalName || session.username,
      session.avatarUrl,
      true,
    );
    for (const p of Object.values(this.roomState.tableParticipants ?? {})) {
      if (p.discordUserId === session.discordId) {
        p.isConnected = true;
      }
    }
    this.persistStateSnapshot();

    // Attempt 100-event ring buffer delta replay when lastSeenSeq is in range
    const lastSeen = command.lastSeenSeq;
    const minBufferedSeq = this.eventRing[0]?.seq ?? this.roomState.seq + 1;
    const canDeltaReplay =
      typeof lastSeen === 'number' &&
      lastSeen > 0 &&
      lastSeen <= this.roomState.seq &&
      (lastSeen === this.roomState.seq ||
        (this.eventRing.length > 0 && lastSeen >= minBufferedSeq - 1));

    if (canDeltaReplay) {
      let replayedCount = 0;
      for (const entry of this.eventRing) {
        if (entry.seq > lastSeen) {
          const projected = projectEnvelopeForAttachment(entry, this.roomState, attachment);
          if (projected) {
            ws.send(JSON.stringify(projected));
            replayedCount += 1;
          }
        }
      }
      if (replayedCount > 0) {
        this.sendEphemeralBroadcast({
          type: 'PARTICIPANTS_UPDATED',
          participants: Object.values(this.roomState.tableParticipants ?? {}),
        });
        this.sendRuleStateToSocket(ws, attachment, envelope.reqId);
        ws.send(JSON.stringify({ seq: this.roomState.seq, serverTime: Date.now(), event: this.tableInitiativeEvent() } satisfies ServerEnvelope<ServerEvent>));
        this.syncStorytellerTable(ws, attachment);
        this.scheduleRulePersistence();
        return;
      }
    }

    const snapshotEnvelope: ServerEnvelope<ServerEvent> = {
      seq: this.roomState.seq,
      replyToReqId: envelope.reqId,
      serverTime: Date.now(),
      event: {
        type: 'SYNC_SNAPSHOT',
        snapshot: buildProjectedSnapshot(
          this.roomState,
          attachment,
          this.collectSpeakingDiscordIds(),
        ),
      },
    };
    ws.send(JSON.stringify(snapshotEnvelope));
    this.syncStorytellerTable(ws, attachment);
    this.scheduleRulePersistence();
    this.sendEphemeralBroadcast(
      {
        type: 'PARTICIPANTS_UPDATED',
        participants: Object.values(this.roomState.tableParticipants ?? {}),
      },
      undefined,
      ws,
    );
  }

  private canControlCharacter(
    attachment: InternalSocketAttachment,
    char: W20CharacterState,
  ): boolean {
    if (attachment.role === 'storyteller') {
      return true;
    }
    return !char.isNpc && char.ownerDiscordId === attachment.discordUserId;
  }

  private requireStoryteller(ws: WebSocket, attachment: InternalSocketAttachment, reqId: string): boolean {
    if (attachment.role !== 'storyteller') {
      this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Only the Storyteller may execute this command.');
      return false;
    }
    return true;
  }

  private scheduleCharacterFlush(chars: W20CharacterState[]): void {
    if (this.sharedRuleStage) {
      this.sharedRuleStage.characterFlushIds.push(...chars.map((character) => character.id));
      return;
    }
    const supa = new SupabaseRestClient(this.env);
    if (!supa.isConfigured()) {
      return;
    }
    const persistedSet = new Set(this.roomState.persistedCharacterIds);
    const toFlush = chars.filter((c) => persistedSet.has(c.id));
    if (toFlush.length === 0) {
      return;
    }
    this.ctx.waitUntil(
      Promise.allSettled(toFlush.map((c) => supa.flushCharacterState(c))).then(() => undefined),
    );
  }

  private scheduleRollAuditAndWebhook(audit: DeferredRollAudit): void {
    if (this.sharedRuleStage) {
      this.sharedRuleStage.audits.push(structuredClone(audit));
      return;
    }
    const supa = new SupabaseRestClient(this.env);
    const tasks: Promise<unknown>[] = [];

    if (supa.isConfigured()) {
      tasks.push(
        supa.insertRollAuditLog({
          campaign_id: audit.campaignId,
          character_id: audit.characterId ?? null,
          roller_discord_id: audit.rollerDiscordId,
          label: audit.label,
          roll: audit.roll,
          has_specialty: audit.hasSpecialty,
          spent_willpower: audit.spentWillpower,
          is_secret_st_roll: audit.isSecretStRoll,
        }),
      );
    }

    if (!audit.isSecretStRoll && isAllowedWebhookUrl(this.roomState.diceLogWebhookUrl)) {
      const isInitiative = audit.roll.rollMode === 'initiative';
      const initMod = audit.roll.initiativeModifier ?? 0;
      const initTotal = audit.roll.initiativeTotal ?? audit.roll.netSuccesses;
      const embedColor = isInitiative
        ? 0xf59e0b
        : audit.roll.isBotch
          ? 0x991b1b
          : audit.roll.netSuccesses > 0
            ? 0x10b981
            : 0x71717a;
      tasks.push(
        fetch(this.roomState.diceLogWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [
              {
                title: `${audit.rollerName}: ${audit.label}`,
                color: embedColor,
                description: isInitiative
                  ? `**INITIATIVE: ${initTotal}** (1d10 + ${initMod})`
                  : `**${audit.roll.outcome.toUpperCase()}** — **${audit.roll.netSuccesses}** net successes (Diff ${audit.roll.clampedDifficulty})`,
                fields: isInitiative
                  ? [
                      {
                        name: '1d10',
                        value: `[${audit.roll.dice[0]?.value ?? 0}]`,
                        inline: true,
                      },
                      {
                        name: 'Modifier',
                        value: `${initMod >= 0 ? '+' : ''}${initMod}`,
                        inline: true,
                      },
                    ]
                  : [
                      {
                        name: 'Dice',
                        value: `[${audit.roll.dice.map((d) => d.value).join(', ')}]`,
                        inline: true,
                      },
                      { name: 'Pool', value: `${audit.roll.effectivePool}d10`, inline: true },
                    ],
                footer: { text: `Seed: ${audit.roll.physicsSeed}` },
              },
            ],
          }),
        }),
      );
    }

    if (tasks.length > 0) {
      this.ctx.waitUntil(Promise.allSettled(tasks).then(() => undefined));
    }
  }

  private async handleAuthenticatedCommand(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    envelope: ClientEnvelope,
  ): Promise<void> {
    const command = envelope.command;
    const reqId = envelope.reqId;

    switch (command.type) {
      case 'HELLO_AUTH':
      case 'PING':
      case 'VOICE_SPEAKING_STATE':
      case 'UPDATE_LIGHT_TRACKERS':
      case 'SYNC_CLIENT_SEATS':
      case 'ROLL_TABLE_POOL':
      case 'CLEAR_TABLE_INITIATIVE':
      case 'ST_ROLL_TABLE_POOL':
      case 'ST_ROLL_TABLE_INITIATIVE':
      case 'ST_REVEAL_TABLE_INITIATIVE':
      case 'BIND_TABLE_SHEET':
      case 'PREVIEW_RULE_ROLL':
      case 'ACTIVATE_RULE':
      case 'END_RULE_EFFECT':
      case 'ADVANCE_RULE_CLOCK':
      case 'APPLY_RULE_EVENT':
      case 'REROLL_RULE_ROLL':
      case 'KEEP_ACTIVATION_RESULT':
        return;

      case 'TOKEN_MOVE': {
        const token = this.roomState.tokens.find((t) => t.id === command.tokenId);
        if (!token) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Token not found.');
          return;
        }
        const ownerChar = this.roomState.characters[token.characterId];
        const allowed =
          attachment.role === 'storyteller' ||
          (!token.isHidden && ownerChar !== undefined && this.canControlCharacter(attachment, ownerChar));
        if (!allowed) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot move another player or hidden token.');
          return;
        }
        if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Invalid coordinates.');
          return;
        }
        token.x = command.x;
        token.y = command.y;
        this.commitAndBroadcast(
          [
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          ],
          reqId,
        );
        return;
      }

      case 'CHARACTER_SHIFT_FORM': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot shift another player character.');
          return;
        }
        if (char.activeForm === command.targetForm) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', `Already in ${command.targetForm} form.`);
          return;
        }
        const ruleShift = resolveRuleShift(char, {
          targetForm: command.targetForm,
          method: command.method,
        });
        if (!ruleShift.allowed) {
          this.sendRejection(
            ws,
            reqId,
            'VALIDATION_ERROR',
            ruleShift.reason ?? 'An active rule prevents this transformation.'
          );
          return;
        }

        // Canonical W20: returning to one's natural breed form is automatic, instant, and free (no roll, no Rage).
        if (command.targetForm === getBreedNaturalForm(char.breed) || !ruleShift.requiresRoll || ruleShift.automaticSuccesses > 0) {
          const updated: W20CharacterState = {
            ...char,
            activeForm: command.targetForm,
            stateVersion: char.stateVersion + 1,
          };
          this.roomState.characters[char.id] = updated;
          this.syncTokenForCharacter(updated);

          this.commitAndBroadcast(
            [
              {
                event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
                targetRole: updated.isNpc ? 'storyteller' : null,
              },
              {
                event: { type: 'TOKENS_UPDATED', tokens: [] },
                rawTokensSnapshot: this.snapshotRawTokens(),
              },
            ],
            reqId,
          );
          this.scheduleCharacterFlush([updated]);
          return;
        }

        const shiftDiff = ruleShift.difficulty;
        if (command.method === 'instant_rage_spend') {
          const check =
            ruleShift.rageCost > 0
              ? validateResourceSpend(char.turnLocks, 'rage')
              : { allowed: true };
          if (!check.allowed) {
            this.sendRejection(ws, reqId, 'RAGE_GNOSIS_CONFLICT', check.reason ?? 'Rage conflict.');
            return;
          }
          if (char.rage.temporary < ruleShift.rageCost) {
            this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Rage.');
            return;
          }

          const updated: W20CharacterState = {
            ...char,
            activeForm: command.targetForm,
            rage: { ...char.rage, temporary: char.rage.temporary - ruleShift.rageCost },
            turnLocks: {
              ...char.turnLocks,
              hasSpentRageThisTurn: char.turnLocks.hasSpentRageThisTurn || ruleShift.rageCost > 0,
            },
            stateVersion: char.stateVersion + 1,
          };
          this.roomState.characters[char.id] = updated;
          this.syncTokenForCharacter(updated);

          this.commitAndBroadcast(
            [
              {
                event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
                targetRole: updated.isNpc ? 'storyteller' : null,
              },
              {
                event: { type: 'TOKENS_UPDATED', tokens: [] },
                rawTokensSnapshot: this.snapshotRawTokens(),
              },
            ],
            reqId,
          );
          this.scheduleCharacterFlush([updated]);
          return;
        }

        // roll_primal_urge: Stamina + Primal-Urge vs target form difficulty
        const pool = ruleShift.pool;
        const roll = resolveW20DicePool({
          label: `${char.name}: Shift to ${command.targetForm}`,
          basePool: pool,
          baseDifficulty: shiftDiff,
          woundPenalty: ruleShift.woundPenalty,
          specialtyMode: this.roomState.specialtyMode,
          ruleModifiers: ruleShift.modifiers,
        });

        const shifted = roll.netSuccesses >= 1;
        const updated: W20CharacterState = {
          ...char,
          activeForm: shifted ? command.targetForm : char.activeForm,
          stateVersion: char.stateVersion + (shifted ? 1 : 0),
        };
        if (shifted) {
          this.roomState.characters[char.id] = updated;
          this.syncTokenForCharacter(updated);
        }

        const pending: PendingOutboundEvent[] = [
          {
            event: {
              type: 'DICE_ROLLED_3D',
              rollerDiscordId: attachment.discordUserId,
              characterId: char.id,
              label: `${char.name}: Shift to ${command.targetForm}`,
              roll,
              ...(char.isNpc ? { isSecretStRoll: true } : {}),
            },
            targetRole: char.isNpc ? 'storyteller' : null,
          },
        ];

        if (shifted) {
          pending.push(
            {
              event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          );
          this.scheduleCharacterFlush([updated]);
        }

        this.commitAndBroadcast(pending, reqId);
        if (this.roomState.campaignId) {
          this.scheduleRollAuditAndWebhook({
            campaignId: this.roomState.campaignId,
            characterId: char.id,
            rollerDiscordId: attachment.discordUserId,
            rollerName: char.name,
            label: `Shift to ${command.targetForm}`,
            roll,
            isSecretStRoll: char.isNpc,
          });
        }
        return;
      }

      case 'STEP_SIDEWAYS': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot shift realms for another character.');
          return;
        }
        if (char.caughtInGauntlet && attachment.role !== 'storyteller') {
          this.sendRejection(
            ws,
            reqId,
            'VALIDATION_ERROR',
            'Character is trapped in the Gauntlet and cannot Step Sideways.',
          );
          return;
        }
        if (char.activeRealm === command.targetRealm) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Already in target realm.');
          return;
        }

        const context: RuleContext = {
          attribute: 'gnosis',
          rollKind: 'gnosis',
          tags: ['action:step_sideways', 'task:step-sideways', 'task:cross-realms'],
        };
        const stats = computeEffectiveCharacterStats(char, context);
        const crossing = resolveCharacterRuleRoll(char, {
          ...context,
          pool: stats.effectiveGnosisPool,
          difficulty: applyRuleValue(
            stats.ruleEvaluation,
            'gauntlet',
            this.roomState.localGauntlet
          ),
          woundPenalty: 0,
        });
        const roll = resolveW20DicePool({
          label: `${char.name}: Step Sideways -> ${command.targetRealm}`,
          basePool: crossing.pool,
          baseDifficulty: crossing.difficulty,
          applyWoundPenalty: false,
          specialtyMode: this.roomState.specialtyMode,
          ruleModifiers: crossing.modifiers,
        });

        const succeeded = roll.netSuccesses >= 1;
        const botched = roll.isBotch;

        const updated: W20CharacterState = {
          ...char,
          activeRealm: succeeded ? command.targetRealm : char.activeRealm,
          caughtInGauntlet: botched ? true : succeeded ? false : char.caughtInGauntlet,
          stateVersion: char.stateVersion + (succeeded || botched ? 1 : 0),
        };
        this.roomState.characters[char.id] = updated;
        if (succeeded) {
          this.syncTokenForCharacter(updated);
        }

        const snapshotRefreshSockets: WebSocket[] = [];
        if (succeeded) {
          for (const sock of this.ctx.getWebSockets()) {
            const att = this.getAttachment(sock);
            if (att.authenticated && att.activeCharacterId === updated.id) {
              snapshotRefreshSockets.push(sock);
            }
          }
        }

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'DICE_ROLLED_3D',
                rollerDiscordId: attachment.discordUserId,
                characterId: updated.id,
                label: `${updated.name}: Step Sideways -> ${command.targetRealm} (Gauntlet ${this.roomState.localGauntlet})`,
                roll,
                ...(updated.isNpc ? { isSecretStRoll: true } : {}),
              },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
            {
              event: {
                type: 'CHARACTER_PATCHED',
                characterId: updated.id,
                character: updated,
              },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          ],
          reqId,
          snapshotRefreshSockets,
        );

        this.scheduleCharacterFlush([updated]);
        if (this.roomState.campaignId) {
          this.scheduleRollAuditAndWebhook({
            campaignId: this.roomState.campaignId,
            characterId: updated.id,
            rollerDiscordId: attachment.discordUserId,
            rollerName: updated.name,
            label: `Step Sideways -> ${command.targetRealm}`,
            roll,
            isSecretStRoll: updated.isNpc,
          });
        }
        return;
      }

      case 'ROLL_FREEFORM_POOL': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot roll for another character.');
          return;
        }
        if (command.isSecretStRoll && attachment.role !== 'storyteller') {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Only Storytellers may make secret rolls.');
          return;
        }

        if (command.spendWillpower && char.willpower.temporary < 1) {
          this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Willpower.');
          return;
        }

        const stats = computeEffectiveCharacterStats(char);
        const attrVal = stats.effectiveAttributes[command.attributeKey] ?? 0;
        const abilityVal = command.abilityKey
          ? (stats.effectiveAbilities[command.abilityKey] ?? 0)
          : 0;
        const context: RuleContext = {
          ...command.ruleContext,
          attribute: command.attributeKey,
          ability: command.abilityKey,
        };
        const resolved = resolveCharacterRuleRoll(char, {
          ...context,
          pool: attrVal + abilityVal,
          difficulty: command.difficulty,
        });
        const hasSpecialty = Boolean(
          command.specialtyId && char.specialties.some((s) => s.id === command.specialtyId),
        );

        const roll = resolveW20DicePool({
          label: command.label,
          basePool: resolved.pool,
          baseDifficulty: resolved.difficulty,
          hasApplicableSpecialty: hasSpecialty,
          spendWillpower: Boolean(command.spendWillpower),
          woundPenalty: resolved.woundPenalty,
          specialtyMode: this.roomState.specialtyMode,
          ruleModifiers: resolved.modifiers,
        });

        let updatedChar = char;
        const pending: PendingOutboundEvent[] = [];

        if (
          command.spendWillpower &&
          !getRuleResultTriggers(roll, resolved.modifiers, { spentWillpower: true }).refundWillpower
        ) {
          updatedChar = {
            ...char,
            willpower: { ...char.willpower, temporary: char.willpower.temporary - 1 },
            turnLocks: { ...char.turnLocks, hasSpentWillpowerThisTurn: true },
            stateVersion: char.stateVersion + 1,
          };
          this.roomState.characters[char.id] = updatedChar;
          pending.push({
            event: {
              type: 'CHARACTER_PATCHED',
              characterId: updatedChar.id,
              character: updatedChar,
            },
            targetRole: updatedChar.isNpc ? 'storyteller' : null,
          });
          this.scheduleCharacterFlush([updatedChar]);
        }

        pending.push({
          event: {
            type: 'DICE_ROLLED_3D',
            rollerDiscordId: attachment.discordUserId,
            characterId: updatedChar.id,
            label: command.label,
            roll,
            ...(command.isSecretStRoll ? { isSecretStRoll: true } : {}),
          },
          targetRole: command.isSecretStRoll || updatedChar.isNpc ? 'storyteller' : null,
        });
        this.consumeNextRollEffects(
          char.id,
          resolved.modifiers,
          `campaign-roll:${attachment.discordUserId}:${reqId}`,
          context
        );

        if (/\brage\b/i.test(command.label) && roll.netSuccesses >= 4) {
          pending.push({
            event: {
              type: 'FRENZY_PROMPT',
              characterId: updatedChar.id,
              triggerReason: 'rage_4_plus_successes',
              baseDifficulty: MOON_BASE_FRENZY_DIFF[this.roomState.moonPhase],
              moonPhase: this.roomState.moonPhase,
            },
            targetRole: updatedChar.isNpc ? 'storyteller' : null,
          });
        }

        this.commitAndBroadcast(pending, reqId);
        if (this.roomState.campaignId) {
          this.scheduleRollAuditAndWebhook({
            campaignId: this.roomState.campaignId,
            characterId: updatedChar.id,
            rollerDiscordId: attachment.discordUserId,
            rollerName: updatedChar.name,
            label: command.label,
            roll,
            hasSpecialty,
            spentWillpower: Boolean(command.spendWillpower),
            isSecretStRoll: Boolean(command.isSecretStRoll || updatedChar.isNpc),
          });
        }
        return;
      }

      case 'CHARACTER_UPDATE_TRACKER': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot edit another player character.');
          return;
        }
        if (!Number.isInteger(command.delta) || command.delta === 0) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Tracker delta must be a non-zero integer.');
          return;
        }

        let updated = char;
        if (command.tracker === 'silver') {
          const nextSilver = Math.max(0, Math.min(20, char.silverCarriedItems + command.delta));
          updated = { ...char, silverCarriedItems: nextSilver, stateVersion: char.stateVersion + 1 };
        } else if (command.tracker === 'rage') {
          if (command.delta < 0) {
            const check = validateResourceSpend(char.turnLocks, 'rage');
            if (!check.allowed) {
              this.sendRejection(ws, reqId, 'RAGE_GNOSIS_CONFLICT', check.reason ?? 'Rage conflict.');
              return;
            }
          }
          const nextTemp = char.rage.temporary + command.delta;
          if (nextTemp < 0) {
            this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Rage.');
            return;
          }
          updated = {
            ...char,
            rage: { ...char.rage, temporary: Math.min(10, nextTemp) },
            turnLocks:
              command.delta < 0
                ? { ...char.turnLocks, hasSpentRageThisTurn: true }
                : char.turnLocks,
            stateVersion: char.stateVersion + 1,
          };
        } else if (command.tracker === 'gnosis') {
          if (command.delta < 0) {
            const check = validateResourceSpend(char.turnLocks, 'gnosis');
            if (!check.allowed) {
              this.sendRejection(ws, reqId, 'RAGE_GNOSIS_CONFLICT', check.reason ?? 'Gnosis conflict.');
              return;
            }
          }
          const nextTemp = char.gnosis.temporary + command.delta;
          if (nextTemp < 0) {
            this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Gnosis.');
            return;
          }
          updated = {
            ...char,
            gnosis: { ...char.gnosis, temporary: Math.min(10, nextTemp) },
            turnLocks:
              command.delta < 0
                ? { ...char.turnLocks, hasSpentGnosisThisTurn: true }
                : char.turnLocks,
            stateVersion: char.stateVersion + 1,
          };
        } else {
          const nextTemp = char.willpower.temporary + command.delta;
          if (nextTemp < 0) {
            this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Willpower.');
            return;
          }
          updated = {
            ...char,
            willpower: { ...char.willpower, temporary: Math.min(10, nextTemp) },
            turnLocks:
              command.delta < 0
                ? { ...char.turnLocks, hasSpentWillpowerThisTurn: true }
                : char.turnLocks,
            stateVersion: char.stateVersion + 1,
          };
        }

        this.roomState.characters[char.id] = updated;
        this.commitAndBroadcast(
          [
            {
              event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
          ],
          reqId,
        );
        this.scheduleCharacterFlush([updated]);
        return;
      }

      case 'CHARACTER_APPLY_HEALTH': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot modify health for another character.');
          return;
        }

        const prevPenalty = computeEffectiveCharacterStats(char).woundPenalty;
        const dmgType = command.damageType;
        const pending: PendingOutboundEvent[] = [];
        let updated = char;

        if (command.mode === 'heal') {
          updated = healHealthDamage(char, command.levels, {
            healAggravated: dmgType === 'aggravated',
            damageType: dmgType,
          });
        } else if (command.mode === 'damage') {
          updated = applyHealthDamage(char, command.levels, dmgType);
        } else {
          // mode === 'soak'
          const stats = computeEffectiveCharacterStats(char);
          const effectiveType = command.isSilver ? 'aggravated' : dmgType;
          const canSoak = command.isSilver
            ? stats.soakCapabilities.canSoakSilver
            : effectiveType === 'aggravated'
              ? stats.soakCapabilities.canSoakAggravated
              : effectiveType === 'lethal'
                ? stats.soakCapabilities.canSoakLethal
                : stats.soakCapabilities.canSoakBashing;
          const soakPool = canSoak ? stats.soakCapabilities.soakPool : 0;

          const soakRoll = resolveW20DicePool({
            label: `${char.name}: Soak (${effectiveType})`,
            basePool: soakPool,
            baseDifficulty: 6,
            applyWoundPenalty: false,
            specialtyMode: this.roomState.specialtyMode,
          });

          pending.push({
            event: {
              type: 'DICE_ROLLED_3D',
              rollerDiscordId: attachment.discordUserId,
              characterId: char.id,
              label: `${char.name}: Soak (${effectiveType})`,
              roll: soakRoll,
              ...(char.isNpc ? { isSecretStRoll: true } : {}),
            },
            targetRole: char.isNpc ? 'storyteller' : null,
          });

          const soaked = Math.max(0, soakRoll.netSuccesses);
          const netLevels = Math.max(0, command.levels - soaked);
          if (netLevels > 0) {
            updated = applyHealthDamage(char, netLevels, effectiveType);
          }

          if (this.roomState.campaignId) {
            this.scheduleRollAuditAndWebhook({
              campaignId: this.roomState.campaignId,
              characterId: char.id,
              rollerDiscordId: attachment.discordUserId,
              rollerName: char.name,
              label: `Soak (${effectiveType})`,
              roll: soakRoll,
              isSecretStRoll: char.isNpc,
            });
          }
        }

        updated = { ...updated, stateVersion: updated.stateVersion + 1 };
        this.roomState.characters[char.id] = updated;
        this.syncTokenForCharacter(updated);

        pending.push(
          {
            event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
            targetRole: updated.isNpc ? 'storyteller' : null,
          },
          {
            event: { type: 'TOKENS_UPDATED', tokens: [] },
            rawTokensSnapshot: this.snapshotRawTokens(),
          },
        );

        const nextPenalty = computeEffectiveCharacterStats(updated).woundPenalty;
        if (nextPenalty <= -2 && prevPenalty > -2) {
          pending.push({
            event: {
              type: 'FRENZY_PROMPT',
              characterId: updated.id,
              triggerReason: 'severe_wounds',
              baseDifficulty: MOON_BASE_FRENZY_DIFF[this.roomState.moonPhase],
              moonPhase: this.roomState.moonPhase,
            },
            targetRole: updated.isNpc ? 'storyteller' : null,
          });
        }

        this.commitAndBroadcast(pending, reqId);
        this.scheduleCharacterFlush([updated]);
        return;
      }

      case 'CHARACTER_SAVE_MACRO': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot edit macros on another character.');
          return;
        }

        const existingIdx = char.macros.findIndex((m) => m.id === command.macro.id);
        const nextMacros =
          existingIdx >= 0
            ? char.macros.map((m, idx) => (idx === existingIdx ? command.macro : m))
            : [...char.macros, command.macro];

        const updated: W20CharacterState = {
          ...char,
          macros: nextMacros,
          stateVersion: char.stateVersion + 1,
        };
        this.roomState.characters[char.id] = updated;

        this.commitAndBroadcast(
          [
            {
              event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
          ],
          reqId,
        );
        this.scheduleCharacterFlush([updated]);
        return;
      }

      case 'EXECUTE_MACRO': {
        const caster = this.roomState.characters[command.characterId];
        if (!caster) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, caster)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot execute macros for another character.');
          return;
        }

        const targetChar = command.targetCharacterId
          ? this.roomState.characters[command.targetCharacterId]
          : undefined;
        if (command.targetCharacterId && !targetChar) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Target character not found.');
          return;
        }

        let outcome;
        try {
          outcome = executeW20Macro(caster, command.macro, {
            localGauntlet: this.roomState.localGauntlet,
            targetCharacter: targetChar,
            spendWillpowerOnRoll: command.spendWillpowerOnRoll,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to execute macro.';
          this.sendRejection(ws, reqId, classifyCoreErrorCode(msg), msg);
          return;
        }

        const pending: PendingOutboundEvent[] = [];
        const updatedCaster = {
          ...outcome.updatedCaster,
          stateVersion: outcome.updatedCaster.stateVersion + 1,
        };
        this.roomState.characters[updatedCaster.id] = updatedCaster;
        this.syncTokenForCharacter(updatedCaster);

        const changedChars: W20CharacterState[] = [updatedCaster];
        pending.push({
          event: {
            type: 'CHARACTER_PATCHED',
            characterId: updatedCaster.id,
            character: updatedCaster,
          },
          targetRole: updatedCaster.isNpc ? 'storyteller' : null,
        });

        if (outcome.updatedTarget) {
          const updatedTarget = {
            ...outcome.updatedTarget,
            stateVersion: outcome.updatedTarget.stateVersion + 1,
          };
          this.roomState.characters[updatedTarget.id] = updatedTarget;
          this.syncTokenForCharacter(updatedTarget);
          changedChars.push(updatedTarget);
          pending.push({
            event: {
              type: 'CHARACTER_PATCHED',
              characterId: updatedTarget.id,
              character: updatedTarget,
            },
            targetRole: updatedTarget.isNpc ? 'storyteller' : null,
          });
        }

        if (outcome.rollResult) {
          const isRageMacro =
            (command.macro.pool.kind === 'permanent_trait' &&
              command.macro.pool.trait === 'rage') ||
            /\brage\b/i.test(command.macro.name);

          pending.push({
            event: {
              type: 'DICE_ROLLED_3D',
              rollerDiscordId: attachment.discordUserId,
              characterId: updatedCaster.id,
              label: `${updatedCaster.name}: ${command.macro.name}`,
              roll: outcome.rollResult,
              ...(updatedCaster.isNpc ? { isSecretStRoll: true } : {}),
            },
            targetRole: updatedCaster.isNpc ? 'storyteller' : null,
          });

          if (isRageMacro && outcome.rollResult.netSuccesses >= 4) {
            pending.push({
              event: {
                type: 'FRENZY_PROMPT',
                characterId: updatedCaster.id,
                triggerReason: 'rage_4_plus_successes',
                baseDifficulty: MOON_BASE_FRENZY_DIFF[this.roomState.moonPhase],
                moonPhase: this.roomState.moonPhase,
              },
              targetRole: updatedCaster.isNpc ? 'storyteller' : null,
            });
          }

          if (this.roomState.campaignId) {
            this.scheduleRollAuditAndWebhook({
              campaignId: this.roomState.campaignId,
              characterId: updatedCaster.id,
              rollerDiscordId: attachment.discordUserId,
              rollerName: updatedCaster.name,
              label: command.macro.name,
              roll: outcome.rollResult,
              spentWillpower: Boolean(command.spendWillpowerOnRoll),
              isSecretStRoll: updatedCaster.isNpc,
            });
          }
        }

        pending.push({
          event: { type: 'TOKENS_UPDATED', tokens: [] },
          rawTokensSnapshot: this.snapshotRawTokens(),
        });

        this.commitAndBroadcast(pending, reqId);
        this.scheduleCharacterFlush(changedChars);
        return;
      }

      case 'FRENZY_ROLL_CHECK': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot trigger Frenzy check for another character.');
          return;
        }

        const result = resolveFrenzyCheck(char, this.roomState.moonPhase, {
          difficultyMod: command.difficultyMod,
          preferredType: command.preferredType,
        });
        const updated = { ...result.updatedChar, stateVersion: char.stateVersion + 1 };
        this.roomState.characters[char.id] = updated;
        this.syncTokenForCharacter(updated);

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'DICE_ROLLED_3D',
                rollerDiscordId: attachment.discordUserId,
                characterId: updated.id,
                label: `${updated.name}: Frenzy Check (${this.roomState.moonPhase} moon)`,
                roll: result.rollResult,
                ...(updated.isNpc ? { isSecretStRoll: true } : {}),
              },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
            {
              event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          ],
          reqId,
        );
        this.scheduleCharacterFlush([updated]);
        if (this.roomState.campaignId) {
          this.scheduleRollAuditAndWebhook({
            campaignId: this.roomState.campaignId,
            characterId: updated.id,
            rollerDiscordId: attachment.discordUserId,
            rollerName: updated.name,
            label: `Frenzy Check (${this.roomState.moonPhase})`,
            roll: result.rollResult,
            isSecretStRoll: updated.isNpc,
          });
        }
        return;
      }

      case 'CHARACTER_CLEAR_FRENZY': {
        const char = this.roomState.characters[command.characterId];
        if (!char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Character not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot clear Frenzy for another character.');
          return;
        }
        const updated: W20CharacterState = {
          ...char,
          inFrenzy: false,
          frenzyType: null,
          stateVersion: char.stateVersion + 1,
        };
        this.roomState.characters[char.id] = updated;
        this.commitAndBroadcast(
          [
            {
              event: { type: 'CHARACTER_PATCHED', characterId: updated.id, character: updated },
              targetRole: updated.isNpc ? 'storyteller' : null,
            },
          ],
          reqId,
        );
        this.scheduleCharacterFlush([updated]);
        return;
      }

      case 'COMBAT_START': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const uniqueIds = Array.from(new Set(command.participantCharacterIds));
        const participants: W20CharacterState[] = [];
        for (const id of uniqueIds) {
          const c = this.roomState.characters[id];
          if (!c) {
            this.sendRejection(ws, reqId, 'VALIDATION_ERROR', `Unknown participant character ${id}.`);
            return;
          }
          participants.push(c);
        }
        if (participants.length === 0) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Select at least 1 combat participant.');
          return;
        }

        const encounter = createCombatEncounter(`enc-${crypto.randomUUID()}`, participants);
        this.roomState.combat = encounter;

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'COMBAT_STATE_UPDATED',
                combat: null,
                transitionReason: 'Combat encounter initiated by Storyteller.',
              },
              rawCombatSnapshot: encounter,
            },
          ],
          reqId,
        );
        return;
      }

      case 'COMBAT_DECLARE_PRE_INIT': {
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }
        const combatant = combat.combatants[command.combatantId];
        const char = combatant ? this.roomState.characters[combatant.characterId] : undefined;
        if (!combatant || !char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Combatant not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot declare for another player combatant.');
          return;
        }

        this.applyCombatTransition(ws, attachment, reqId, 'Pre-initiative declaration locked.', () =>
          declarePreInitiativeResources(
            combat,
            this.roomState.characters,
            command.combatantId,
            command.rageExtraActions,
            command.spendGnosisSpiritOfFray,
            command.spendWillpowerIgnoreWounds,
          ),
        );
        return;
      }

      case 'COMBAT_ROLL_ALL_INITIATIVE': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }

        this.applyCombatTransition(ws, attachment, reqId, 'Round initiative rolled.', () =>
          rollRoundInitiative(combat, this.roomState.characters),
        );
        return;
      }

      case 'COMBAT_SUBMIT_DECLARATION': {
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }
        const combatant = combat.combatants[command.combatantId];
        const char = combatant ? this.roomState.characters[combatant.characterId] : undefined;
        if (!combatant || !char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Combatant not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot declare for another player combatant.');
          return;
        }

        this.applyCombatTransition(
          ws,
          attachment,
          reqId,
          `${combatant.name} submitted ${command.declaration.mode} declaration.`,
          () =>
            submitReverseDeclaration(
              combat,
              this.roomState.characters,
              command.combatantId,
              command.declaration,
            ),
        );
        return;
      }

      case 'COMBAT_TRIGGER_HOLD_INTERRUPT': {
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }
        const combatant = combat.combatants[command.combatantId];
        const char = combatant ? this.roomState.characters[combatant.characterId] : undefined;
        if (!combatant || !char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Combatant not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot interrupt for another player combatant.');
          return;
        }

        this.applyCombatTransition(ws, attachment, reqId, `${combatant.name} interrupted from Hold.`, () =>
          triggerHoldInterrupt(
            combat,
            this.roomState.characters,
            command.combatantId,
            command.newDeclaration,
          ),
        );
        return;
      }

      case 'COMBAT_EXECUTE_ACTIVE_TURN': {
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }
        const combatant = combat.combatants[command.combatantId];
        const char = combatant ? this.roomState.characters[combatant.characterId] : undefined;
        if (!combatant || !char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Combatant not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Cannot act for another player combatant.');
          return;
        }

        const hasSpecialty = Boolean(
          command.specialtyId && char.specialties.some((s) => s.id === command.specialtyId),
        );

        this.applyCombatTransition(ws, attachment, reqId, `${combatant.name} executed combat slot.`, () =>
          executeActiveCombatSlot(combat, this.roomState.characters, command.combatantId, {
            spendWillpowerOnRoll: command.spendWillpowerOnRoll,
            hasSpecialty,
            localGauntlet: this.roomState.localGauntlet,
          }),
        );
        return;
      }

      case 'COMBAT_SUBMIT_REACTION': {
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }
        const combatant = combat.combatants[command.defenderCombatantId];
        const char = combatant ? this.roomState.characters[combatant.characterId] : undefined;
        if (!combatant || !char) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Defender combatant not found.');
          return;
        }
        if (!this.canControlCharacter(attachment, char)) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Only the defender owner or Storyteller may react.');
          return;
        }

        this.applyCombatTransition(ws, attachment, reqId, `${combatant.name} resolved reaction.`, () =>
          resolveDefenderReactionAndDamage(
            combat,
            this.roomState.characters,
            command.defenderCombatantId,
            command.reaction,
          ),
        );
        return;
      }

      case 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }

        this.applyCombatTransition(
          ws,
          attachment,
          reqId,
          command.reason || 'Storyteller advanced combat phase.',
          () => forceStorytellerOverride(combat, this.roomState.characters, command.reason),
        );
        return;
      }

      case 'COMBAT_NEXT_ROUND': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const combat = this.roomState.combat;
        if (!combat) {
          this.sendRejection(ws, reqId, 'INVALID_PHASE', 'No active combat encounter.');
          return;
        }

        const advanced = this.applyCombatTransition(
          ws,
          attachment,
          reqId,
          `Advancing to combat round ${combat.roundNumber + 1}.`,
          () => advanceEndOfRound(combat, this.roomState.characters),
        );
        if (advanced) {
          this.advanceRuleClock('turn', 1, `combat-round:${attachment.discordUserId}:${reqId}`);
          this.broadcastRuleState(reqId);
          this.scheduleRulePersistence();
        }
        return;
      }

      case 'COMBAT_END': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        this.roomState.combat = null;
        const pending: PendingOutboundEvent[] = [];
        const resetChars: W20CharacterState[] = [];

        for (const [id, char] of Object.entries(this.roomState.characters)) {
          const resetChar: W20CharacterState = {
            ...char,
            turnLocks: {
              hasSpentRageThisTurn: false,
              hasSpentGnosisThisTurn: false,
              hasSpentWillpowerThisTurn: false,
              ignoringWoundPenaltiesThisTurn: false,
              declaredExtraRageActions: 0,
            },
          };
          this.roomState.characters[id] = resetChar;
          resetChars.push(resetChar);
          pending.push({
            event: { type: 'CHARACTER_PATCHED', characterId: id, character: resetChar },
            targetRole: resetChar.isNpc ? 'storyteller' : null,
          });
        }

        pending.push({
          event: {
            type: 'COMBAT_STATE_UPDATED',
            combat: null,
            transitionReason: 'Combat encounter ended by Storyteller.',
          },
          rawCombatSnapshot: null,
        });

        this.commitAndBroadcast(pending, reqId);
        this.scheduleCharacterFlush(resetChars);
        return;
      }

      case 'SET_TABLE_SPECIALTY_MODE': {
        const seated = Object.values(this.roomState.tableParticipants ?? {}).some(
          (seat) => seat.discordUserId === attachment.discordUserId && seat.isConnected
        );
        if (!this.roomState.campaignId?.startsWith('dice-room-') || !seated) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Join a voice table to change its specialty rule.');
          return;
        }
        this.roomState.specialtyMode = command.specialtyMode;
        this.commitAndBroadcast([{ event: {
          type: 'WORLD_ENV_UPDATED',
          specialtyMode: command.specialtyMode,
          moonPhase: this.roomState.moonPhase,
          localGauntlet: this.roomState.localGauntlet,
          mapAssetUrl: this.roomState.mapAssetUrl,
        } }], reqId);
        return;
      }
      case 'ST_SET_WORLD_ENV': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        this.roomState.localGauntlet = command.localGauntlet;
        this.roomState.moonPhase = command.moonPhase;
        if (command.specialtyMode) {
          this.roomState.specialtyMode = command.specialtyMode;
        }
        if (command.mapAssetUrl !== undefined) {
          this.roomState.mapAssetUrl = command.mapAssetUrl;
        }

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'WORLD_ENV_UPDATED',
                localGauntlet: this.roomState.localGauntlet,
                moonPhase: this.roomState.moonPhase,
                specialtyMode: this.roomState.specialtyMode,
                mapAssetUrl: this.roomState.mapAssetUrl,
              },
            },
          ],
          reqId,
        );

        const supa = new SupabaseRestClient(this.env);
        if (supa.isConfigured() && this.roomState.campaignId) {
          const campaignId = this.roomState.campaignId;
          this.ctx.waitUntil(
            supa
              .updateCampaignWorldEnv(campaignId, {
                local_gauntlet: this.roomState.localGauntlet,
                current_moon_phase: this.roomState.moonPhase,
                specialty_mode: this.roomState.specialtyMode,
                map_asset_url: this.roomState.mapAssetUrl,
              })
              .catch(() => undefined),
          );
        }
        return;
      }

      case 'ST_FOG_STROKE': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        if (
          command.stroke.mode === 'reset_shroud_all' ||
          command.stroke.mode === 'reset_reveal_all'
        ) {
          this.roomState.fogStrokes = [command.stroke];
        } else {
          this.roomState.fogStrokes.push(command.stroke);
          if (this.roomState.fogStrokes.length > MAX_FOG_STROKES) {
            this.roomState.fogStrokes.splice(0, this.roomState.fogStrokes.length - MAX_FOG_STROKES);
          }
        }

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'FOG_UPDATED',
                stroke: command.stroke,
              },
            },
          ],
          reqId,
        );
        return;
      }

      case 'ST_SPAWN_NPC_TEMPLATE': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const baseX = command.x ?? 525;
        const baseY = command.y ?? 385;
        const pending: PendingOutboundEvent[] = [];

        for (let i = 0; i < command.quantity; i += 1) {
          const npc = createNpcFromTemplate({
            templateId: command.templateId,
            index: i,
            totalCount: command.quantity,
            campaignId: this.roomState.campaignId ?? '',
            storytellerDiscordId: this.roomState.storytellerDiscordId ?? attachment.discordUserId,
            realm: command.realm,
          });
          this.roomState.characters[npc.id] = npc;
          this.roomState.tokens.push({
            id: `tok-${npc.id}`,
            characterId: npc.id,
            name: npc.name,
            x: baseX + (i % 4) * 105,
            y: baseY + Math.floor(i / 4) * 105,
            form: npc.activeForm,
            realm: command.realm,
            portraitUrl: '',
            isHidden: command.isHidden,
          });

          pending.push({
            event: { type: 'CHARACTER_PATCHED', characterId: npc.id, character: npc },
            targetRole: 'storyteller',
          });
        }

        pending.push({
          event: { type: 'TOKENS_UPDATED', tokens: [] },
          rawTokensSnapshot: this.snapshotRawTokens(),
        });

        this.commitAndBroadcast(pending, reqId);
        return;
      }

      case 'ST_REMOVE_TOKEN': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const idx = this.roomState.tokens.findIndex((t) => t.id === command.tokenId);
        if (idx < 0) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Token not found.');
          return;
        }
        const [removed] = this.roomState.tokens.splice(idx, 1);
        if (removed) {
          const stillUsed =
            this.roomState.tokens.some((t) => t.characterId === removed.characterId) ||
            (this.roomState.combat !== null &&
              Object.values(this.roomState.combat.combatants).some(
                (c) => c.characterId === removed.characterId,
              ));
          const persisted = this.roomState.persistedCharacterIds.includes(removed.characterId);
          if (!stillUsed && !persisted) {
            delete this.roomState.characters[removed.characterId];
          }
        }

        this.commitAndBroadcast(
          [
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          ],
          reqId,
        );
        return;
      }

      case 'ST_TOGGLE_TOKEN_HIDDEN': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const token = this.roomState.tokens.find((t) => t.id === command.tokenId);
        if (!token) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'Token not found.');
          return;
        }
        token.isHidden = command.isHidden;
        this.commitAndBroadcast(
          [
            {
              event: { type: 'TOKENS_UPDATED', tokens: [] },
              rawTokensSnapshot: this.snapshotRawTokens(),
            },
          ],
          reqId,
        );
        return;
      }

      case 'ST_SYNC_AUDIO': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const syncedPayload: AudioSyncPayload = {
          physicalTrackUrl: command.payload.physicalTrackUrl,
          penumbraTrackUrl: command.payload.penumbraTrackUrl,
          startedAtServerMs: Date.now(),
          masterVolume: command.payload.masterVolume,
        };
        this.roomState.audioState = syncedPayload;

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'AUDIO_SYNCED',
                payload: {
                  ...syncedPayload,
                  ...(command.payload.stingUrl ? { stingUrl: command.payload.stingUrl } : {}),
                },
              },
            },
          ],
          reqId,
        );
        return;
      }

      case 'ST_TRIGGER_AUDIO_STING': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const payload: AudioSyncPayload = {
          physicalTrackUrl: this.roomState.audioState?.physicalTrackUrl ?? null,
          penumbraTrackUrl: this.roomState.audioState?.penumbraTrackUrl ?? null,
          startedAtServerMs: Date.now(),
          masterVolume: this.roomState.audioState?.masterVolume ?? 0.75,
          stingUrl: command.stingUrl,
        };

        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'AUDIO_SYNCED',
                payload,
              },
            },
          ],
          reqId,
        );
        return;
      }

      case 'ST_PUSH_HANDOUT': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const handout = {
          id: crypto.randomUUID(),
          imageUrl: command.imageUrl,
          caption: command.caption,
          pushedAt: Date.now(),
        };
        this.roomState.activeHandout = handout;
        this.commitAndBroadcast(
          [{ event: { type: 'HANDOUT_UPDATED', handout } }],
          reqId,
        );
        return;
      }

      case 'ST_DISMISS_HANDOUT': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        this.roomState.activeHandout = null;
        this.commitAndBroadcast(
          [{ event: { type: 'HANDOUT_UPDATED', handout: null } }],
          reqId,
        );
        return;
      }

      case 'ST_SEND_WHISPER': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        const whisper = {
          id: crypto.randomUUID(),
          targetDiscordId: command.targetDiscordId,
          senderName: 'Storyteller',
          title: command.title,
          body: command.body,
          sentAt: Date.now(),
        };
        this.commitAndBroadcast(
          [
            {
              event: { type: 'WHISPER_RECEIVED', whisper },
              targetDiscordId: command.targetDiscordId,
            },
          ],
          reqId,
        );
        return;
      }

      case 'PACK_UPDATE_POOL': {
        const pack = this.roomState.packTotem;
        if (!pack) {
          this.sendRejection(ws, reqId, 'VALIDATION_ERROR', 'No Pack Totem linked to this campaign.');
          return;
        }
        const activeChar = attachment.activeCharacterId
          ? this.roomState.characters[attachment.activeCharacterId]
          : undefined;
        const isPackMember = activeChar && activeChar.packId === pack.packId;
        if (attachment.role !== 'storyteller' && !isPackMember) {
          this.sendRejection(ws, reqId, 'UNAUTHORIZED', 'Only Pack members or Storyteller may modify Pack pool.');
          return;
        }
        const nextTemp = pack.willpowerTemp + command.delta;
        if (nextTemp < 0) {
          this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient Pack Totem pool.');
          return;
        }
        const updatedPack = {
          ...pack,
          willpowerTemp: Math.min(pack.willpowerMax, nextTemp),
        };
        this.roomState.packTotem = updatedPack;
        this.commitAndBroadcast(
          [{ event: { type: 'PACK_UPDATED', packTotem: updatedPack } }],
          reqId,
        );

        const supa = new SupabaseRestClient(this.env);
        if (supa.isConfigured()) {
          this.ctx.waitUntil(
            supa.updatePackWillpower(updatedPack.packId, updatedPack.willpowerTemp).catch(() => undefined),
          );
        }
        return;
      }

      case 'SAFETY_X_CARD_PAUSE': {
        this.roomState.safetyPaused = true;
        this.roomState.safetyPauseReason = command.reason ?? 'X-Card safety pause active';
        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'SAFETY_PAUSE_UPDATED',
                paused: true,
                reason: this.roomState.safetyPauseReason,
                triggeredByDiscordId: attachment.discordUserId,
              },
            },
          ],
          reqId,
        );
        return;
      }

      case 'SAFETY_RESUME': {
        if (!this.requireStoryteller(ws, attachment, reqId)) return;
        this.roomState.safetyPaused = false;
        this.roomState.safetyPauseReason = null;
        this.commitAndBroadcast(
          [
            {
              event: {
                type: 'SAFETY_PAUSE_UPDATED',
                paused: false,
              },
            },
          ],
          reqId,
        );
        return;
      }

      default: {
        const _exhaustive: never = command;
        return _exhaustive;
      }
    }
  }

  private applyCombatTransition(
    ws: WebSocket,
    attachment: InternalSocketAttachment,
    reqId: string,
    transitionReason: string,
    reducer: () => ReturnType<typeof rollRoundInitiative>,
  ): boolean {
    const prevChars = { ...this.roomState.characters };
    let outcome;
    try {
      outcome = reducer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Combat state transition failed.';
      this.sendRejection(ws, reqId, classifyCoreErrorCode(msg), msg);
      return false;
    }

    this.roomState.combat = outcome.combat;
    const pending: PendingOutboundEvent[] = [];
    const changedChars: W20CharacterState[] = [];
    let anyTokensChanged = false;

    for (const [id, updated] of Object.entries(outcome.characters)) {
      const prev = prevChars[id];
      this.roomState.characters[id] = updated;
      if (prev !== updated) {
        changedChars.push(updated);
        if (this.syncTokenForCharacter(updated)) {
          anyTokensChanged = true;
        }
        pending.push({
          event: { type: 'CHARACTER_PATCHED', characterId: id, character: updated },
          targetRole: updated.isNpc ? 'storyteller' : null,
        });

        if (prev) {
          const prevPenalty = computeEffectiveCharacterStats(prev).woundPenalty;
          const nextPenalty = computeEffectiveCharacterStats(updated).woundPenalty;
          if (nextPenalty <= -2 && prevPenalty > -2) {
            pending.push({
              event: {
                type: 'FRENZY_PROMPT',
                characterId: updated.id,
                triggerReason: 'severe_wounds',
                baseDifficulty: MOON_BASE_FRENZY_DIFF[this.roomState.moonPhase],
                moonPhase: this.roomState.moonPhase,
              },
              targetRole: updated.isNpc ? 'storyteller' : null,
            });
          }
        }
      }
    }

    for (const emitted of outcome.emittedRolls) {
      const char = this.roomState.characters[emitted.characterId];
      const isNpc = Boolean(char?.isNpc);
      pending.push({
        event: {
          type: 'DICE_ROLLED_3D',
          rollerDiscordId: attachment.discordUserId,
          characterId: emitted.characterId,
          label: emitted.label,
          roll: emitted.result,
          ...(isNpc ? { isSecretStRoll: true } : {}),
        },
        targetRole: isNpc ? 'storyteller' : null,
      });

      if (this.roomState.campaignId) {
        this.scheduleRollAuditAndWebhook({
          campaignId: this.roomState.campaignId,
          characterId: emitted.characterId,
          rollerDiscordId: attachment.discordUserId,
          rollerName: char?.name ?? attachment.displayName,
          label: emitted.label,
          roll: emitted.result,
          isSecretStRoll: isNpc,
        });
      }
    }

    if (anyTokensChanged) {
      pending.push({
        event: { type: 'TOKENS_UPDATED', tokens: [] },
        rawTokensSnapshot: this.snapshotRawTokens(),
      });
    }

    pending.push({
      event: {
        type: 'COMBAT_STATE_UPDATED',
        combat: null,
        transitionReason,
      },
      rawCombatSnapshot: outcome.combat,
    });

    this.commitAndBroadcast(pending, reqId);
    if (changedChars.length > 0) {
      this.scheduleCharacterFlush(changedChars);
    }
    return true;
  }
}
