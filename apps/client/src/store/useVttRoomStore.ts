import { create } from 'zustand';
import { resolveModifierRule } from '@w20-vtt/core';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  CombatEncounterView,
  DeclaredActionInput,
  GarouForm,
  MoonPhase,
  ReactionChoice,
  RealmLayer,
  SpecialtyMode,
  W20CharacterState,
  W20RollResult,
} from '@w20-vtt/core';
import type {
  AudioSyncPayload,
  ClientCommand,
  ClientEnvelope,
  CommandRejectionCode,
  FogBrushStroke,
  HandoutRevealPayload,
  PackTotemState,
  ParticipantRole,
  ProjectedMapToken,
  RollHistoryEntry,
  RoomRuleStateView,
  ServerEnvelope,
  ServerEvent,
  TableInitiativeEntry,
  TableParticipant,
  WhisperCardPayload,
} from '@w20-vtt/protocol';
import { useCharacterSheetStore } from './useCharacterSheetStore';
import { toast } from '../components/ui/Toast';
import { soundscapeEngine } from '../audio/SyncedSoundscapeEngine';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'reconnecting'
  /** The server refused our session. Reconnecting stops until a new session is supplied. */
  | 'session_expired';

export interface Queued3DRoll {
  id: string;
  rollerDiscordId: string;
  characterId?: string;
  label: string;
  roll: W20RollResult;
  rollerName?: string;
  rollerAvatarUrl?: string | null;
  rageDiceCount?: number;
  rollClientId?: string;
  isSecretRoll?: boolean;
}

export interface ActiveFogToolState {
  active: boolean;
  mode: 'reveal' | 'shroud';
  shape: 'circle' | 'rect';
  radius: number;
}

export interface FrenzyPromptState {
  characterId: string;
  triggerReason: 'rage_4_plus_successes' | 'severe_wounds' | 'manual_check';
  baseDifficulty: number;
  moonPhase: MoonPhase;
}

export interface ConnectRoomParams {
  wsUrl: string;
  sessionJwt: string;
  localDiscordId: string;
  campaignId: string;
  characterId: string | null;
}

interface VttRoomStoreState {
  // Connection & Causal Ordering
  connectionStatus: ConnectionStatus;
  lastSeq: number;
  serverClockOffsetMs: number;
  lastError: { code: CommandRejectionCode | string; message: string; reqId?:string } | null;

  // Viewer Context
  sessionJwt: string | null;
  localDiscordId: string | null;
  activeCharacterId: string | null;
  viewerRole: ParticipantRole;
  viewerRealm: RealmLayer;
  storytellerPreviewRealm: RealmLayer | 'both';

  // Authoritative Room State
  campaignId: string;
  localGauntlet: number;
  moonPhase: MoonPhase;
  specialtyMode: SpecialtyMode;
  mapAssetUrl: string | null;
  fogStrokes: FogBrushStroke[];
  activeFogTool: ActiveFogToolState;
  audioState: AudioSyncPayload | null;
  activeHandout: HandoutRevealPayload | null;
  whispers: WhisperCardPayload[];
  packTotem: PackTotemState | null;
  safetyPaused: boolean;
  safetyPauseReason: string | null;
  frenzyPrompt: FrenzyPromptState | null;
  characters: Record<string, W20CharacterState>;
  tokens: ProjectedMapToken[];
  optimisticTokenCoords: Record<string, { x: number; y: number }>;
  combat: CombatEncounterView | null;
  speakingDiscordIds: Set<string>;
  diceQueue: Queued3DRoll[];
  participants: TableParticipant[];
  rollHistory: RollHistoryEntry[];
  ruleState: RoomRuleStateView | null;
  lastRuleActivation:{reqId:string;ruleId:string} | null;
  rulePreview: {reqId:string;event:Extract<ServerEvent,{type:'RULE_ROLL_PREVIEW'}>} | null;
  /** Shared initiative order for this dice room (unsorted; see rankInitiative). */
  tableInitiative: TableInitiativeEntry[];
  clearTableInitiative: () => void;

  // Store Actions
  connectRoom: (params: ConnectRoomParams) => void;
  updateSessionJwt: (jwt: string) => void;
  /** Dismisses the last server rejection once it has been shown to the player. */
  clearLastError: () => void;
  disconnectRoom: () => void;
  sendCommand: (command: ClientCommand) => string;

  // High-Frequency & Gameplay Helpers
  moveTokenOptimistic: (
    tokenId: string,
    x: number,
    y: number,
    commitToServer: boolean
  ) => void;
  setLocalVoiceSpeaking: (
    speakingUserId: string,
    isLocal: boolean,
    active: boolean
  ) => void;
  setStorytellerPreviewRealm: (mode: RealmLayer | 'both') => void;
  setActiveFogTool: (tool: {
    active: boolean;
    mode?: 'reveal' | 'shroud';
    shape?: 'circle' | 'rect';
    radius?: number;
  }) => void;
  shiftCharacterForm: (
    characterId: string,
    targetForm: GarouForm,
    instantRage: boolean
  ) => void;
  stepSideways: (characterId: string, targetRealm: RealmLayer) => void;
  submitCombatDeclaration: (
    combatantId: string,
    declaration: DeclaredActionInput
  ) => void;
  submitCombatReaction: (
    defenderCombatantId: string,
    reaction: ReactionChoice
  ) => void;
  dequeue3DRoll: (id: string) => void;
  consume3DRollByClientId: (rollClientId: string) => Queued3DRoll | null;
  dismissWhisper: (id: string) => void;
  dismissFrenzyPrompt: () => void;
}

const MAX_SEEN_ROLL_IDS = 150;
const MAX_PENDING_OUTBOUND_COMMANDS = 32;
const QUEUEABLE_RECONNECT_COMMANDS = new Set<ClientCommand['type']>([
  'ROLL_TABLE_POOL',
  'ROLL_FREEFORM_POOL',
  'UPDATE_LIGHT_TRACKERS',
  'SYNC_CLIENT_SEATS',
]);

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;
/** Set when the server answers UNAUTHORIZED; blocks the automatic reconnect loop. */
let sessionRejected = false;
let connectionGeneration = 0;
let latestConnectParams: ConnectRoomParams | null = null;
const seenRollHistoryIds = new Set<string>();
let pendingOutboundCommands: Array<{ reqId: string; command: ClientCommand }> = [];

function recordSeenRollHistoryId(id: string): void {
  if (seenRollHistoryIds.has(id)) return;
  seenRollHistoryIds.add(id);
  while (seenRollHistoryIds.size > MAX_SEEN_ROLL_IDS) {
    const oldest = seenRollHistoryIds.values().next().value;
    if (oldest === undefined) break;
    seenRollHistoryIds.delete(oldest);
  }
}

function clearTransientRollBuffers(): void {
  seenRollHistoryIds.clear();
  pendingOutboundCommands = [];
}

function flushPendingOutboundCommands(
  getState: () => Pick<VttRoomStoreState, 'connectionStatus' | 'lastSeq'>
): void {
  if (pendingOutboundCommands.length === 0) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (getState().connectionStatus !== 'authenticated') return;

  const queued = pendingOutboundCommands;
  pendingOutboundCommands = [];
  for (let i = 0; i < queued.length; i += 1) {
    const item = queued[i]!;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pendingOutboundCommands = queued.slice(i).concat(pendingOutboundCommands);
      break;
    }
    const envelope: ClientEnvelope = {
      reqId: item.reqId,
      expectedSeq: getState().lastSeq,
      sentAt: Date.now(),
      command: item.command,
    };
    socket.send(JSON.stringify(envelope));
  }
}

function clearTimers(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function closeActiveSocket(): void {
  if (!socket) return;
  const old = socket;
  socket = null;
  old.onopen = null;
  old.onmessage = null;
  old.onclose = null;
  old.onerror = null;
  if (old.readyState <= WebSocket.OPEN) {
    old.close();
  }
}

export const useVttRoomStore = create<VttRoomStoreState>()(
  subscribeWithSelector((set, get) => ({
    connectionStatus: 'disconnected',
    lastSeq: 0,
    serverClockOffsetMs: 0,
    lastError: null,

    sessionJwt: null,
    localDiscordId: null,
    activeCharacterId: null,
    viewerRole: 'player',
    viewerRealm: 'physical',
    storytellerPreviewRealm: 'both',

    campaignId: '',
    localGauntlet: 6,
    moonPhase: 'half',
    specialtyMode: 'w20_double',
    mapAssetUrl: null,
    fogStrokes: [],
    activeFogTool: {
      active: false,
      mode: 'reveal',
      shape: 'circle',
      radius: 110,
    },
    audioState: null,
    activeHandout: null,
    whispers: [],
    packTotem: null,
    safetyPaused: false,
    safetyPauseReason: null,
    frenzyPrompt: null,
    characters: {},
    tokens: [],
    optimisticTokenCoords: {},
    combat: null,
    speakingDiscordIds: new Set<string>(),
    diceQueue: [],
    participants: [],
    ruleState: null, rulePreview:null,lastRuleActivation:null,
    rollHistory: [],
    tableInitiative: [],

    connectRoom: (params) => {
      connectionGeneration += 1;
      const myGen = connectionGeneration;
      sessionRejected = false;

      const isSameRoom =
        latestConnectParams !== null &&
        latestConnectParams.campaignId === params.campaignId &&
        latestConnectParams.characterId === params.characterId;
      latestConnectParams = { ...params };
      if (!isSameRoom) {
        clearTransientRollBuffers();
      }

      clearTimers();
      closeActiveSocket();

      set((state) => ({
        connectionStatus: reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
        sessionJwt: params.sessionJwt,
        localDiscordId: params.localDiscordId,
        activeCharacterId: params.characterId,
        campaignId: params.campaignId,
        lastSeq: isSameRoom ? state.lastSeq : 0,
        lastError: null,
        ...(isSameRoom
          ? {}
          : {
              characters: {},
              tokens: [],
              optimisticTokenCoords: {},
              fogStrokes: [],
              combat: null,
              activeHandout: null,
              whispers: [],
              packTotem: null,
              safetyPaused: false,
              safetyPauseReason: null,
              frenzyPrompt: null,
              diceQueue: [],
              participants: [],
              ruleState: null,
              rulePreview: null,
              lastRuleActivation: null,
              rollHistory: [],
              tableInitiative: [],
            }),
      }));

      const ws = new WebSocket(params.wsUrl);
      socket = ws;

      ws.onopen = () => {
        if (myGen !== connectionGeneration) return;
        reconnectAttempt = 0;

        const state = get();
        const activeJwt = state.sessionJwt ?? params.sessionJwt;
        get().sendCommand({
          type: 'HELLO_AUTH',
          sessionJwt: activeJwt,
          campaignId: params.campaignId,
          characterId: params.characterId,
          lastSeenSeq: state.lastSeq > 0 ? state.lastSeq : null,
        });

        if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (myGen !== connectionGeneration) return;
          if (socket?.readyState === WebSocket.OPEN) {
            get().sendCommand({ type: 'PING' });
          }
        }, 25_000);
      };

      ws.onmessage = (msgEvent) => {
        if (myGen !== connectionGeneration) return;
        if (typeof msgEvent.data !== 'string') return;

        let envelope: ServerEnvelope;
        try {
          envelope = JSON.parse(msgEvent.data) as ServerEnvelope;
        } catch {
          return;
        }

        const { seq, serverTime, event } = envelope;
        const offsetMs = Number.isFinite(serverTime)
          ? serverTime - Date.now()
          : get().serverClockOffsetMs;

        switch (event.type) {
          case 'SYNC_SNAPSHOT': {
            const { snapshot } = event;
            const prevRealm = get().viewerRealm;
            if (snapshot.ruleState)
              useCharacterSheetStore
                .getState()
                .receiveRuleSheets(snapshot.ruleState.sheets, get().ruleState?.sheets);
            for (const entry of snapshot.rollHistory ?? []) {
              recordSeenRollHistoryId(entry.id);
            }
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              campaignId: snapshot.campaignId,
              ruleState: snapshot.ruleState ?? null,
              localGauntlet: snapshot.localGauntlet,
              moonPhase: snapshot.moonPhase,
              specialtyMode: snapshot.specialtyMode,
              mapAssetUrl: snapshot.mapAssetUrl,
              fogStrokes: snapshot.fogStrokes,
              audioState: snapshot.audioState,
              activeHandout: snapshot.activeHandout,
              packTotem: snapshot.packTotem,
              safetyPaused: snapshot.safetyPaused,
              safetyPauseReason: snapshot.safetyPauseReason ?? null,
              viewerRole: snapshot.viewerRole,
              viewerRealm: snapshot.viewerRealm,
              characters: snapshot.characters,
              tokens: snapshot.tokens,
              optimisticTokenCoords: {},
              combat: snapshot.combat,
              speakingDiscordIds: new Set(snapshot.speakingDiscordIds),
              participants: snapshot.participants ?? [],
              rollHistory: snapshot.rollHistory ?? [],
              tableInitiative: snapshot.tableInitiative ?? [],
              lastError: null,
            });
            flushPendingOutboundCommands(get);
            if (snapshot.audioState) {
              soundscapeEngine.syncState(
                snapshot.audioState,
                offsetMs,
                snapshot.viewerRealm
              );
            } else if (prevRealm !== snapshot.viewerRealm) {
              soundscapeEngine.crossfadeToRealm(snapshot.viewerRealm);
            }
            break;
          }

          case 'COMMAND_REJECTED': {
            if (event.code === 'UNAUTHORIZED') {
              // An expired or invalid session cannot be fixed by reconnecting with the
              // same token, so stop here and let the app obtain a new session.
              sessionRejected = true;
              set({
                connectionStatus: 'session_expired',
                lastSeq: event.currentSeq,
                serverClockOffsetMs: offsetMs,
              });
              break;
            }
            set({
              lastSeq: event.currentSeq,
              serverClockOffsetMs: offsetMs,
              optimisticTokenCoords: {},
              lastError: { code: event.code, message: event.message, reqId: envelope.replyToReqId },
            });
            break;
          }

          case 'RULE_ROLL_PREVIEW': {
            set({rulePreview:{reqId:envelope.replyToReqId ?? '',event}});
            break;
          }
          case 'RULE_STATE_UPDATED': {
            useCharacterSheetStore.getState().receiveRuleSheets(event.state.sheets,get().ruleState?.sheets);
            set({ruleState:event.state,lastSeq:Math.max(seq,get().lastSeq),serverClockOffsetMs:offsetMs});
            break;
          }
          case 'RULE_ACTIVATION_RESOLVED': {
            set({lastRuleActivation:{reqId:envelope.replyToReqId ?? '',ruleId:event.ruleId},lastSeq:Math.max(get().lastSeq,seq)});
            const name = resolveModifierRule(event.ruleId)?.name ?? 'Activation';
            toast.info(event.succeeded ? name + ' succeeded.' : (event.reason ?? name + ' failed.'));
            break;
          }
          case 'TABLE_INITIATIVE_UPDATED': {
            set({ tableInitiative: event.entries });
            break;
          }

          case 'PARTICIPANTS_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              participants: event.participants,
            });
            flushPendingOutboundCommands(get);
            break;
          }

          case 'DICE_ROLLED_3D': {
            set((state) => {
              const historyEntry: RollHistoryEntry = event.historyEntry ?? {
                id: `roll-${seq}-${event.roll.physicsSeed}`,
                timestamp: envelope.serverTime || Date.now(),
                rollerDiscordId: event.rollerDiscordId,
                rollerName:
                  event.rollerName ??
                  state.participants.find((p) => p.discordUserId === event.rollerDiscordId)
                    ?.displayName ??
                  'Player',
                rollerAvatarUrl:
                  event.rollerAvatarUrl ??
                  state.participants.find((p) => p.discordUserId === event.rollerDiscordId)
                    ?.avatarUrl ??
                  null,
                label: event.label,
                rageDiceCount: event.rageDiceCount ?? 0,
                isSecretRoll: Boolean(event.isSecretStRoll),
                roll: event.roll,
              };
              const alreadySeen = seenRollHistoryIds.has(historyEntry.id);
              recordSeenRollHistoryId(historyEntry.id);

              const nextHistory = [
                historyEntry,
                ...state.rollHistory.filter((item) => item.id !== historyEntry.id),
              ].slice(0, 50);

              return {
                connectionStatus: 'authenticated',
                lastSeq: seq,
                serverClockOffsetMs: offsetMs,
                rollHistory: nextHistory,
                diceQueue: alreadySeen
                  ? state.diceQueue
                  : [
                      ...state.diceQueue,
                      {
                        id: historyEntry.id,
                        rollerDiscordId: event.rollerDiscordId,
                        characterId: event.characterId,
                        label: event.label,
                        roll: event.roll,
                        rollerName: historyEntry.rollerName,
                        rollerAvatarUrl: historyEntry.rollerAvatarUrl,
                        rageDiceCount: event.rageDiceCount,
                        rollClientId: event.rollClientId,
                        isSecretRoll: event.isSecretStRoll,
                      },
                    ],
              };
            });
            flushPendingOutboundCommands(get);
            break;
          }

          case 'COMBAT_STATE_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              combat: event.combat,
            });
            break;
          }

          case 'CHARACTER_PATCHED': {
            const prevState = get();
            const isActiveViewerChar =
              event.characterId === prevState.activeCharacterId;
            const nextViewerRealm = isActiveViewerChar
              ? event.character.activeRealm
              : prevState.viewerRealm;

            set((state) => ({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              viewerRealm: nextViewerRealm,
              characters: {
                ...state.characters,
                [event.characterId]: event.character,
              },
            }));

            if (nextViewerRealm !== prevState.viewerRealm) {
              soundscapeEngine.crossfadeToRealm(
                nextViewerRealm,
                prevState.audioState?.masterVolume
              );
            }
            break;
          }

          case 'TOKENS_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              tokens: event.tokens,
              optimisticTokenCoords: {},
            });
            break;
          }

          case 'VOICE_SPEAKERS_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              speakingDiscordIds: new Set(event.speakingDiscordIds),
            });
            break;
          }

          case 'WORLD_ENV_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              localGauntlet: event.localGauntlet,
              moonPhase: event.moonPhase,
              specialtyMode: event.specialtyMode,
              mapAssetUrl: event.mapAssetUrl,
            });
            break;
          }

          case 'FOG_UPDATED': {
            const isReset =
              event.stroke.mode === 'reset_shroud_all' ||
              event.stroke.mode === 'reset_reveal_all';
            set((state) => ({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              fogStrokes: isReset
                ? [event.stroke]
                : [...state.fogStrokes, event.stroke],
            }));
            break;
          }

          case 'AUDIO_SYNCED': {
            const activeRealm = get().viewerRealm;
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              audioState: event.payload,
            });
            soundscapeEngine.syncState(event.payload, offsetMs, activeRealm);
            if (event.payload.stingUrl) {
              soundscapeEngine.playSting(
                event.payload.stingUrl,
                event.payload.masterVolume
              );
            }
            break;
          }

          case 'HANDOUT_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              activeHandout: event.handout,
            });
            break;
          }

          case 'WHISPER_RECEIVED': {
            set((state) => {
              const exists = state.whispers.some(
                (w) => w.id === event.whisper.id
              );
              return {
                connectionStatus: 'authenticated',
                lastSeq: seq,
                serverClockOffsetMs: offsetMs,
                whispers: exists
                  ? state.whispers
                  : [...state.whispers, event.whisper],
              };
            });
            break;
          }

          case 'PACK_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              packTotem: event.packTotem,
            });
            break;
          }

          case 'SAFETY_PAUSE_UPDATED': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              safetyPaused: event.paused,
              safetyPauseReason: event.paused ? (event.reason ?? null) : null,
            });
            break;
          }

          case 'FRENZY_PROMPT': {
            set({
              connectionStatus: 'authenticated',
              lastSeq: seq,
              serverClockOffsetMs: offsetMs,
              frenzyPrompt: {
                characterId: event.characterId,
                triggerReason: event.triggerReason,
                baseDifficulty: event.baseDifficulty,
                moonPhase: event.moonPhase,
              },
            });
            break;
          }
        }
      };

      ws.onclose = () => {
        if (myGen !== connectionGeneration) return;
        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        socket = null;
        if (sessionRejected) {
          set({ connectionStatus: 'session_expired' });
          return;
        }
        set({ connectionStatus: 'reconnecting' });

        const backoffMs = Math.min(10_000, 500 * Math.pow(2, reconnectAttempt));
        reconnectAttempt += 1;

        reconnectTimer = setTimeout(() => {
          if (myGen !== connectionGeneration) return;
          const nextParams = latestConnectParams ?? params;
          const latestJwt = get().sessionJwt ?? nextParams.sessionJwt;
          get().connectRoom({
            ...nextParams,
            sessionJwt: latestJwt,
          });
        }, backoffMs);
      };
    },

    updateSessionJwt: (jwt) => {
      if (latestConnectParams) {
        latestConnectParams = { ...latestConnectParams, sessionJwt: jwt };
      }
      set({ sessionJwt: jwt });
      // A fresh session lifts an expiry stop.
      if (get().connectionStatus === 'session_expired' && latestConnectParams) {
        reconnectAttempt = 0;
        get().connectRoom({ ...latestConnectParams, sessionJwt: jwt });
      }
    },

    clearLastError: () => set({ lastError: null }),

    clearTableInitiative: () => {
      get().sendCommand({ type: 'CLEAR_TABLE_INITIATIVE' });
    },

    disconnectRoom: () => {
      connectionGeneration += 1;
      reconnectAttempt = 0;
      latestConnectParams = null;
      clearTimers();
      closeActiveSocket();
      clearTransientRollBuffers();
      set({
        connectionStatus: 'disconnected',
        lastSeq: 0,
        lastError: null,
        campaignId: '',
        activeCharacterId: null,
        characters: {},
        tokens: [],
        optimisticTokenCoords: {},
        fogStrokes: [],
        combat: null,
        activeHandout: null,
        whispers: [],
        packTotem: null,
        safetyPaused: false,
        safetyPauseReason: null,
        frenzyPrompt: null,
        diceQueue: [],
        participants: [],
        ruleState: null,
        rulePreview: null,
        lastRuleActivation: null,
        rollHistory: [],
        tableInitiative: [],
      });
    },

    sendCommand: (command) => {
      const reqId = crypto.randomUUID();
      const isOpen = Boolean(socket && socket.readyState === WebSocket.OPEN);

      // HELLO_AUTH and PING must always send immediately while socket is open (before authenticated)
      if (command.type === 'HELLO_AUTH' || command.type === 'PING') {
        if (!isOpen || !socket) return reqId;
        const envelope: ClientEnvelope = {
          reqId,
          expectedSeq: get().lastSeq,
          sentAt: Date.now(),
          command,
        };
        socket.send(JSON.stringify(envelope));
        return reqId;
      }

      if (get().connectionStatus === 'authenticated' && isOpen && socket) {
        const envelope: ClientEnvelope = {
          reqId,
          expectedSeq: get().lastSeq,
          sentAt: Date.now(),
          command,
        };
        socket.send(JSON.stringify(envelope));
        return reqId;
      }

      if (QUEUEABLE_RECONNECT_COMMANDS.has(command.type) && latestConnectParams !== null) {
        if (command.type === 'SYNC_CLIENT_SEATS') {
          pendingOutboundCommands = [
            ...pendingOutboundCommands.filter(
              (item) => item.command.type !== 'SYNC_CLIENT_SEATS'
            ),
            { reqId, command },
          ];
        } else {
          if (pendingOutboundCommands.length >= MAX_PENDING_OUTBOUND_COMMANDS) {
            pendingOutboundCommands.shift();
          }
          pendingOutboundCommands.push({ reqId, command });
        }
      }

      return reqId;
    },

    moveTokenOptimistic: (tokenId, x, y, commitToServer) => {
      set((state) => ({
        optimisticTokenCoords: {
          ...state.optimisticTokenCoords,
          [tokenId]: { x, y },
        },
      }));
      if (commitToServer) {
        get().sendCommand({ type: 'TOKEN_MOVE', tokenId, x, y });
      }
    },

    setLocalVoiceSpeaking: (speakingUserId, isLocal, active) => {
      set((state) => {
        const next = new Set(state.speakingDiscordIds);
        if (active) next.add(speakingUserId);
        else next.delete(speakingUserId);
        return { speakingDiscordIds: next };
      });
      if (isLocal) {
        get().sendCommand({ type: 'VOICE_SPEAKING_STATE', isSpeaking: active });
      }
    },

    setStorytellerPreviewRealm: (mode) => set({ storytellerPreviewRealm: mode }),

    setActiveFogTool: (tool) =>
      set((state) => ({
        activeFogTool: {
          active: tool.active,
          mode: tool.mode ?? state.activeFogTool.mode,
          shape: tool.shape ?? state.activeFogTool.shape,
          radius: tool.radius ?? state.activeFogTool.radius,
        },
      })),

    shiftCharacterForm: (characterId, targetForm, instantRage) => {
      get().sendCommand({
        type: 'CHARACTER_SHIFT_FORM',
        characterId,
        targetForm,
        method: instantRage ? 'instant_rage_spend' : 'roll_primal_urge',
      });
    },

    stepSideways: (characterId, targetRealm) => {
      get().sendCommand({
        type: 'STEP_SIDEWAYS',
        characterId,
        targetRealm,
      });
    },

    submitCombatDeclaration: (combatantId, declaration) => {
      get().sendCommand({
        type: 'COMBAT_SUBMIT_DECLARATION',
        combatantId,
        declaration,
      });
    },

    submitCombatReaction: (defenderCombatantId, reaction) => {
      get().sendCommand({
        type: 'COMBAT_SUBMIT_REACTION',
        defenderCombatantId,
        reaction,
      });
    },

    dequeue3DRoll: (id) => {
      set((state) => ({
        diceQueue: state.diceQueue.filter((item) => item.id !== id),
      }));
    },

    consume3DRollByClientId: (rollClientId) => {
      const match = get().diceQueue.find((item) => item.rollClientId === rollClientId) ?? null;
      if (!match) return null;
      set((state) => ({
        diceQueue: state.diceQueue.filter((item) => item.id !== match.id),
      }));
      return match;
    },

    dismissWhisper: (id) => {
      set((state) => ({
        whispers: state.whispers.filter((w) => w.id !== id),
      }));
    },

    dismissFrenzyPrompt: () => {
      set({ frenzyPrompt: null });
    },
  }))
);
