import type {
  AttributeKey,
  CanonicalAbilityKey,
  CombatEncounterView,
  DamageType,
  DeclaredActionInput,
  GarouForm,
  MoonPhase,
  ReactionChoice,
  RealmLayer,
  SpecialtyMode,
  W20CharacterState,
  W20MacroDefinition,
  W20RollResult,
} from '@w20-vtt/core';

export type ParticipantRole = 'storyteller' | 'player' | 'spectator';

export interface SocketAttachment {
  discordUserId: string;
  displayName: string;
  role: ParticipantRole;
  activeCharacterId: string | null;
  connectedAt: number;
}

export interface FogBrushStroke {
  mode: 'reveal' | 'shroud' | 'reset_shroud_all' | 'reset_reveal_all';
  shape: 'circle' | 'rect';
  x: number;
  y: number;
  radiusOrWidth: number;
  height?: number;
}

export interface AudioSyncPayload {
  physicalTrackUrl: string | null;
  penumbraTrackUrl: string | null;
  startedAtServerMs: number;
  masterVolume: number;
  stingUrl?: string;
}

export interface HandoutRevealPayload {
  id: string;
  imageUrl: string;
  caption: string;
  pushedAt: number;
}

export interface WhisperCardPayload {
  id: string;
  targetDiscordId: string;
  senderName: string;
  title: string;
  body: string;
  sentAt: number;
}

export interface PackTotemState {
  packId: string;
  name: string;
  totemName: string;
  willpowerMax: number;
  willpowerTemp: number;
}

export type LightWoundPenalty = 0 | -1 | -2 | -5;

export interface LightGarouTrackers {
  rage: number;
  gnosis: number;
  willpower: number;
  woundPenalty: LightWoundPenalty;
}

export interface TableParticipant {
  discordUserId: string;
  displayName: string;
  avatarUrl: string | null;
  isConnected: boolean;
  trackers: LightGarouTrackers;
}

export interface RollHistoryEntry {
  id: string;
  timestamp: number;
  rollerDiscordId: string;
  rollerName: string;
  rollerAvatarUrl: string | null;
  label: string;
  rageDiceCount: number;
  isSecretRoll: boolean;
  roll: W20RollResult;
}

export type NpcSpawnTemplateId =
  | 'pentex_first_team'
  | 'fomor_berserker'
  | 'bsd_crinos'
  | 'scrag_bane'
  | 'nexus_crawler';

// ============================================================================
// CLIENT -> SERVER COMMANDS
// ============================================================================

export interface ClientEnvelope<TPayload = ClientCommand> {
  reqId: string;
  expectedSeq: number;
  sentAt: number;
  command: TPayload;
}

export type ClientCommand =
  | {
      type: 'HELLO_AUTH';
      sessionJwt: string;
      campaignId: string;
      characterId: string | null;
      lastSeenSeq: number | null;
    }
  | {
      type: 'PING';
    }
  | {
      type: 'VOICE_SPEAKING_STATE';
      isSpeaking: boolean;
    }
  | {
      type: 'TOKEN_MOVE';
      tokenId: string;
      x: number;
      y: number;
      waypoints?: Array<{ x: number; y: number }>;
    }
  | {
      type: 'CHARACTER_SHIFT_FORM';
      characterId: string;
      targetForm: GarouForm;
      method: 'roll_primal_urge' | 'instant_rage_spend';
    }
  | {
      type: 'STEP_SIDEWAYS';
      characterId: string;
      targetRealm: RealmLayer;
    }
  | {
      type: 'ROLL_FREEFORM_POOL';
      characterId: string;
      label: string;
      attributeKey: AttributeKey;
      abilityKey?: CanonicalAbilityKey | string;
      difficulty: number;
      specialtyId?: string;
      spendWillpower?: boolean;
      isSecretStRoll?: boolean;
    }
  | {
      type: 'ROLL_TABLE_POOL';
      pool: number;
      rageDiceCount: number;
      difficulty: number;
      hasSpecialty: boolean;
      spendWillpower: boolean;
      applyWoundPenalty: boolean;
      label?: string;
      isSecretRoll?: boolean;
      physicalDiceValues?: number[];
      rollClientId?: string;
    }
  | {
      type: 'UPDATE_LIGHT_TRACKERS';
      trackers: Partial<LightGarouTrackers>;
    }
  | {
      type: 'CHARACTER_UPDATE_TRACKER';
      characterId: string;
      tracker: 'rage' | 'gnosis' | 'willpower' | 'silver';
      delta: number;
    }
  | {
      type: 'CHARACTER_APPLY_HEALTH';
      characterId: string;
      mode: 'damage' | 'heal' | 'soak';
      levels: number;
      damageType: Exclude<DamageType, 'none'>;
      isSilver?: boolean;
    }
  | {
      type: 'CHARACTER_SAVE_MACRO';
      characterId: string;
      macro: W20MacroDefinition;
    }
  | {
      type: 'EXECUTE_MACRO';
      characterId: string;
      macro: W20MacroDefinition;
      targetCharacterId?: string;
      spendWillpowerOnRoll?: boolean;
    }
  | {
      type: 'FRENZY_ROLL_CHECK';
      characterId: string;
      difficultyMod?: number;
      preferredType?: 'berserk' | 'fox';
    }
  | {
      type: 'CHARACTER_CLEAR_FRENZY';
      characterId: string;
    }
  // --- W20 Combat State Machine Commands ---
  | {
      type: 'COMBAT_START';
      participantCharacterIds: string[];
    }
  | {
      type: 'COMBAT_DECLARE_PRE_INIT';
      combatantId: string;
      rageExtraActions: number;
      spendGnosisSpiritOfFray: boolean;
      spendWillpowerIgnoreWounds: boolean;
    }
  | {
      type: 'COMBAT_ROLL_ALL_INITIATIVE';
    }
  | {
      type: 'COMBAT_SUBMIT_DECLARATION';
      combatantId: string;
      declaration: DeclaredActionInput;
    }
  | {
      type: 'COMBAT_TRIGGER_HOLD_INTERRUPT';
      combatantId: string;
      newDeclaration: DeclaredActionInput;
    }
  | {
      type: 'COMBAT_EXECUTE_ACTIVE_TURN';
      combatantId: string;
      spendWillpowerOnRoll?: boolean;
      specialtyId?: string;
    }
  | {
      type: 'COMBAT_SUBMIT_REACTION';
      defenderCombatantId: string;
      reaction: ReactionChoice;
    }
  | {
      type: 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE';
      reason: string;
    }
  | {
      type: 'COMBAT_NEXT_ROUND';
    }
  | {
      type: 'COMBAT_END';
    }
  // --- Storyteller, Pack & Safety Controls ---
  | {
      type: 'ST_SET_WORLD_ENV';
      localGauntlet: number;
      moonPhase: MoonPhase;
      specialtyMode?: SpecialtyMode;
      mapAssetUrl?: string | null;
    }
  | {
      type: 'ST_FOG_STROKE';
      stroke: FogBrushStroke;
    }
  | {
      type: 'ST_SPAWN_NPC_TEMPLATE';
      templateId: NpcSpawnTemplateId;
      quantity: number;
      realm: RealmLayer;
      isHidden: boolean;
      x?: number;
      y?: number;
    }
  | {
      type: 'ST_REMOVE_TOKEN';
      tokenId: string;
    }
  | {
      type: 'ST_TOGGLE_TOKEN_HIDDEN';
      tokenId: string;
      isHidden: boolean;
    }
  | {
      type: 'ST_SYNC_AUDIO';
      payload: AudioSyncPayload;
    }
  | {
      type: 'ST_TRIGGER_AUDIO_STING';
      stingUrl: string;
    }
  | {
      type: 'ST_PUSH_HANDOUT';
      imageUrl: string;
      caption: string;
    }
  | {
      type: 'ST_DISMISS_HANDOUT';
    }
  | {
      type: 'ST_SEND_WHISPER';
      targetDiscordId: string;
      title: string;
      body: string;
    }
  | {
      type: 'PACK_UPDATE_POOL';
      delta: number;
    }
  | {
      type: 'SAFETY_X_CARD_PAUSE';
      reason?: string;
    }
  | {
      type: 'SAFETY_RESUME';
    };

// ============================================================================
// SERVER -> CLIENT EVENTS (ROLE & REALM SCRUBBED)
// ============================================================================

export interface ServerEnvelope<TEvent = ServerEvent> {
  seq: number;
  replyToReqId?: string;
  serverTime: number;
  event: TEvent;
}

export type TokenVisibilityMode = 'full' | 'gauntlet_silhouette';

export interface ProjectedMapToken {
  id: string;
  characterId: string;
  name: string;
  x: number;
  y: number;
  form: GarouForm;
  realm: RealmLayer;
  portraitUrl: string;
  visibilityMode: TokenVisibilityMode;
  woundBadge: string;
  isHidden?: boolean;
}

export interface RoomSnapshotView {
  campaignId: string;
  localGauntlet: number;
  moonPhase: MoonPhase;
  specialtyMode: SpecialtyMode;
  mapAssetUrl: string | null;
  fogStrokes: FogBrushStroke[];
  audioState: AudioSyncPayload | null;
  activeHandout: HandoutRevealPayload | null;
  packTotem: PackTotemState | null;
  safetyPaused: boolean;
  safetyPauseReason?: string | null;
  viewerRole: ParticipantRole;
  viewerRealm: RealmLayer;
  speakingDiscordIds: string[];
  characters: Record<string, W20CharacterState>;
  tokens: ProjectedMapToken[];
  combat: CombatEncounterView | null;
  participants?: TableParticipant[];
  rollHistory?: RollHistoryEntry[];
}

export type CommandRejectionCode =
  | 'SEQ_MISMATCH'
  | 'UNAUTHORIZED'
  | 'INVALID_PHASE'
  | 'OUT_OF_TURN'
  | 'RAGE_GNOSIS_CONFLICT'
  | 'INSUFFICIENT_RESOURCE'
  | 'VALIDATION_ERROR';

export type ServerEvent =
  | {
      type: 'SYNC_SNAPSHOT';
      snapshot: RoomSnapshotView;
    }
  | {
      type: 'COMMAND_REJECTED';
      code: CommandRejectionCode;
      message: string;
      currentSeq: number;
    }
  | {
      type: 'DICE_ROLLED_3D';
      rollerDiscordId: string;
      characterId?: string;
      label: string;
      roll: W20RollResult;
      isSecretStRoll?: boolean;
      rollerName?: string;
      rollerAvatarUrl?: string | null;
      rageDiceCount?: number;
      rollClientId?: string;
      historyEntry?: RollHistoryEntry;
    }
  | {
      type: 'PARTICIPANTS_UPDATED';
      participants: TableParticipant[];
    }
  | {
      type: 'COMBAT_STATE_UPDATED';
      combat: CombatEncounterView | null;
      transitionReason: string;
    }
  | {
      type: 'CHARACTER_PATCHED';
      characterId: string;
      character: W20CharacterState;
    }
  | {
      type: 'TOKENS_UPDATED';
      tokens: ProjectedMapToken[];
    }
  | {
      type: 'VOICE_SPEAKERS_UPDATED';
      speakingDiscordIds: string[];
    }
  | {
      type: 'WORLD_ENV_UPDATED';
      localGauntlet: number;
      moonPhase: MoonPhase;
      specialtyMode: SpecialtyMode;
      mapAssetUrl: string | null;
    }
  | {
      type: 'FOG_UPDATED';
      stroke: FogBrushStroke;
    }
  | {
      type: 'AUDIO_SYNCED';
      payload: AudioSyncPayload;
    }
  | {
      type: 'HANDOUT_UPDATED';
      handout: HandoutRevealPayload | null;
    }
  | {
      type: 'WHISPER_RECEIVED';
      whisper: WhisperCardPayload;
    }
  | {
      type: 'PACK_UPDATED';
      packTotem: PackTotemState;
    }
  | {
      type: 'SAFETY_PAUSE_UPDATED';
      paused: boolean;
      reason?: string;
      triggeredByDiscordId?: string;
    }
  | {
      type: 'FRENZY_PROMPT';
      characterId: string;
      triggerReason: 'rage_4_plus_successes' | 'severe_wounds' | 'manual_check';
      baseDifficulty: number;
      moonPhase: MoonPhase;
    };
