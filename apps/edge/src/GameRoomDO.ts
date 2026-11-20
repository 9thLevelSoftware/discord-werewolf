import { DurableObject } from 'cloudflare:workers';
import {
  advanceEndOfRound,
  applyHealthDamage,
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
  rollCsprngD10,
  rollRoundInitiative,
  submitReverseDeclaration,
  triggerHoldInterrupt,
  validateResourceSpend,
  W20_FORM_MATRIX,
  type W20CharacterState,
  type W20RollResult,
} from '@w20-vtt/core';
import {
  parseClientEnvelope,
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
  isEntryVisibleToAttachment,
  projectEnvelopeForAttachment,
  type BufferedRoomEvent,
  type PersistedRoomState,
  type StoredMapToken,
} from './roomProjection';
import { SupabaseRestClient } from './supabaseRest';

const EVENT_RING_CAPACITY = 100;
const MAX_FOG_STROKES = 2000;

interface InternalSocketAttachment extends SocketAttachment {
  authenticated: boolean;
  isSpeaking?: boolean;
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

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
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
      isSpeaking: false,
    };

    this.ctx.acceptWebSocket(serverSocket);
    serverSocket.serializeAttachment(initialAttachment);

    return new Response(null, {
      status: 101,
      webSocket: clientSocket,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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

    if (envelope.command.type === 'ROLL_TABLE_POOL') {
      this.handleRollTablePool(attachment, envelope.command, envelope.reqId);
      return;
    }

    if (!this.isExpectedSeqAcceptable(envelope.expectedSeq, attachment)) {
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
    this.handleSocketDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleSocketDisconnect(ws);
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
  ): TableParticipant {
    this.roomState.tableParticipants ??= {};
    const existing = this.roomState.tableParticipants[discordUserId];
    const next: TableParticipant = {
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
    };
    this.roomState.tableParticipants[discordUserId] = next;
    return next;
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

    const participant = this.roomState.tableParticipants[att.discordUserId];
    if (!participant) {
      return;
    }

    const stillConnectedElsewhere = this.ctx.getWebSockets().some((sock) => {
      if (sock === closingWs) return false;
      const otherAtt = this.getAttachment(sock);
      return otherAtt.authenticated && otherAtt.discordUserId === att.discordUserId;
    });

    if (!stillConnectedElsewhere && participant.isConnected) {
      participant.isConnected = false;
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

  private handleUpdateLightTrackers(
    _ws: WebSocket,
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'UPDATE_LIGHT_TRACKERS' }>,
    reqId: string,
  ): void {
    const participant = this.upsertTableParticipant(
      attachment.discordUserId,
      attachment.displayName,
      null,
      true,
    );
    const nextTrackers: LightGarouTrackers = {
      rage:
        typeof command.trackers.rage === 'number'
          ? Math.max(0, Math.min(10, command.trackers.rage))
          : participant.trackers.rage,
      gnosis:
        typeof command.trackers.gnosis === 'number'
          ? Math.max(0, Math.min(10, command.trackers.gnosis))
          : participant.trackers.gnosis,
      willpower:
        typeof command.trackers.willpower === 'number'
          ? Math.max(0, Math.min(10, command.trackers.willpower))
          : participant.trackers.willpower,
      woundPenalty:
        command.trackers.woundPenalty !== undefined
          ? command.trackers.woundPenalty
          : participant.trackers.woundPenalty,
    };
    participant.trackers = nextTrackers;
    this.persistStateSnapshot();
    this.sendEphemeralBroadcast(
      {
        type: 'PARTICIPANTS_UPDATED',
        participants: Object.values(this.roomState.tableParticipants ?? {}),
      },
      reqId,
    );
  }

  private handleRollTablePool(
    attachment: InternalSocketAttachment,
    command: Extract<ClientCommand, { type: 'ROLL_TABLE_POOL' }>,
    reqId: string,
  ): void {
    const participant = this.upsertTableParticipant(
      attachment.discordUserId,
      attachment.displayName,
      null,
      true,
    );

    const woundPenalty = command.applyWoundPenalty ? participant.trackers.woundPenalty : 0;
    const cleanLabel = command.label?.trim() || 'W20 Dice Pool';
    const supplied = command.physicalDiceValues ?? [];
    let idx = 0;
    const rng = () => {
      if (idx < supplied.length) {
        const val = supplied[idx]!;
        idx += 1;
        return val;
      }
      return rollCsprngD10();
    };

    const roll = resolveW20DicePool(
      {
        label: cleanLabel,
        basePool: command.pool,
        woundPenalty,
        applyWoundPenalty: command.applyWoundPenalty,
        baseDifficulty: command.difficulty,
        hasApplicableSpecialty: command.hasSpecialty,
        spendWillpower: command.spendWillpower,
        specialtyMode: 'w20_double',
      },
      rng,
    );

    const rageDiceCount = Math.min(roll.effectivePool, Math.max(0, command.rageDiceCount));
    let willpowerSpent = false;
    if (command.spendWillpower && participant.trackers.willpower > 0) {
      participant.trackers.willpower -= 1;
      willpowerSpent = true;
    }

    const isSecretRoll = Boolean(command.isSecretRoll);
    const historyEntry: RollHistoryEntry = {
      id: `roll-${this.roomState.seq + 1}-${roll.physicsSeed}`,
      timestamp: Date.now(),
      rollerDiscordId: attachment.discordUserId,
      rollerName: participant.displayName || attachment.displayName,
      rollerAvatarUrl: participant.avatarUrl,
      label: cleanLabel,
      rageDiceCount,
      isSecretRoll,
      roll,
    };

    this.roomState.rollHistory = [historyEntry, ...(this.roomState.rollHistory ?? [])].slice(0, 50);

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
        hasSpecialty: command.hasSpecialty,
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
  }

  private sendRejection(
    ws: WebSocket,
    replyToReqId: string | undefined,
    code: CommandRejectionCode,
    message: string,
  ): void {
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
    if (campaignId.startsWith('dice-room-')) {
      this.roomState.campaignId = campaignId;
      this.roomState.tableParticipants ??= {};
      this.roomState.rollHistory ??= [];
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
    const newEntries: BufferedRoomEvent[] = [];
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

    // Persist-first in SQLite BEFORE broadcasting to any client socket
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
      this.eventRing.push(entry);
    }

    if (this.eventRing.length > EVENT_RING_CAPACITY) {
      const overflow = this.eventRing.length - EVENT_RING_CAPACITY;
      this.eventRing.splice(0, overflow);
      const minSeqToKeep = this.eventRing[0]?.seq ?? this.roomState.seq;
      this.ctx.storage.sql.exec('DELETE FROM room_event_ring WHERE seq < ?', minSeqToKeep);
    }

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
          sock.send(JSON.stringify(projected));
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
        sock.send(JSON.stringify(snapshotEnvelope));
      }
    }
  }

  private async handleHelloAuth(
    ws: WebSocket,
    envelope: ClientEnvelope,
    command: Extract<ClientCommand, { type: 'HELLO_AUTH' }>,
  ): Promise<void> {
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
      isSpeaking: false,
    };
    ws.serializeAttachment(attachment);

    this.upsertTableParticipant(
      session.discordId,
      session.globalName || session.username,
      session.avatarUrl,
      true,
    );
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
      const embedColor = audit.roll.isBotch
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
                description: `**${audit.roll.outcome.toUpperCase()}** — **${audit.roll.netSuccesses}** net successes (Diff ${audit.roll.clampedDifficulty})`,
                fields: [
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
      case 'ROLL_TABLE_POOL':
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

        // Canonical W20: returning to one's natural breed form is automatic, instant, and free (no roll, no Rage).
        if (command.targetForm === getBreedNaturalForm(char.breed)) {
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

        const shiftDiff = W20_FORM_MATRIX[command.targetForm].shiftDifficulty;
        if (command.method === 'instant_rage_spend') {
          const check = validateResourceSpend(char.turnLocks, 'rage');
          if (!check.allowed) {
            this.sendRejection(ws, reqId, 'RAGE_GNOSIS_CONFLICT', check.reason ?? 'Rage conflict.');
            return;
          }
          if (char.rage.temporary < 1) {
            this.sendRejection(ws, reqId, 'INSUFFICIENT_RESOURCE', 'Insufficient temporary Rage.');
            return;
          }

          const updated: W20CharacterState = {
            ...char,
            activeForm: command.targetForm,
            rage: { ...char.rage, temporary: char.rage.temporary - 1 },
            turnLocks: { ...char.turnLocks, hasSpentRageThisTurn: true },
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
        const stats = computeEffectiveCharacterStats(char);
        const pool = stats.effectiveAttributes.stamina + (char.abilities['primal_urge'] ?? 0);
        const roll = resolveW20DicePool({
          label: `${char.name}: Shift to ${command.targetForm}`,
          basePool: pool,
          baseDifficulty: shiftDiff,
          woundPenalty: stats.woundPenalty,
          specialtyMode: this.roomState.specialtyMode,
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

        const stats = computeEffectiveCharacterStats(char);
        const roll = resolveW20DicePool({
          label: `${char.name}: Step Sideways -> ${command.targetRealm}`,
          basePool: stats.effectiveGnosisPool,
          baseDifficulty: this.roomState.localGauntlet,
          applyWoundPenalty: false,
          specialtyMode: this.roomState.specialtyMode,
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
        const abilityVal = command.abilityKey ? char.abilities[command.abilityKey] ?? 0 : 0;
        const hasSpecialty = Boolean(
          command.specialtyId && char.specialties.some((s) => s.id === command.specialtyId),
        );

        const roll = resolveW20DicePool({
          label: command.label,
          basePool: attrVal + abilityVal,
          baseDifficulty: command.difficulty,
          hasApplicableSpecialty: hasSpecialty,
          spendWillpower: Boolean(command.spendWillpower),
          woundPenalty: stats.woundPenalty,
          specialtyMode: this.roomState.specialtyMode,
        });

        let updatedChar = char;
        const pending: PendingOutboundEvent[] = [];

        if (command.spendWillpower) {
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

        this.applyCombatTransition(
          ws,
          attachment,
          reqId,
          `Advancing to combat round ${combat.roundNumber + 1}.`,
          () => advanceEndOfRound(combat, this.roomState.characters),
        );
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
  ): void {
    const prevChars = { ...this.roomState.characters };
    let outcome;
    try {
      outcome = reducer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Combat state transition failed.';
      this.sendRejection(ws, reqId, classifyCoreErrorCode(msg), msg);
      return;
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
  }
}
