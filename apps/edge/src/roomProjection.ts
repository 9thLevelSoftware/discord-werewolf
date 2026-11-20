import {
  computeEffectiveCharacterStats,
  type CombatEncounterState,
  type CombatEncounterView,
  type GarouForm,
  type MoonPhase,
  type RealmLayer,
  type SpecialtyMode,
  type W20CharacterState,
} from '@w20-vtt/core';
import type {
  AudioSyncPayload,
  FogBrushStroke,
  HandoutRevealPayload,
  PackTotemState,
  ParticipantRole,
  ProjectedMapToken,
  RoomSnapshotView,
  ServerEnvelope,
  ServerEvent,
  SocketAttachment,
} from '@w20-vtt/protocol';

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
  attachment: Pick<SocketAttachment, 'role' | 'activeCharacterId'>,
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

  if (event.type === 'CHARACTER_PATCHED') {
    if (event.character.isNpc && attachment.role !== 'storyteller') {
      return null;
    }
    return envelope;
  }

  if (event.type === 'DICE_ROLLED_3D') {
    if (event.isSecretStRoll && attachment.role !== 'storyteller') {
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
