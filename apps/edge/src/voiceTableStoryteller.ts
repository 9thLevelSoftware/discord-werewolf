import { computeUserSheetStats, type W20UserCharacterSheet } from '@w20-vtt/core';
import type {
  RollHistoryEntry,
  StorytellerInitiativeEntry,
  StorytellerSeatView,
  StorytellerSheetStats,
} from '@w20-vtt/protocol';
import type { PersistedRoomState } from './roomProjection';

export const VOICE_TABLE_PREFIX = 'dice-room-';
export interface StoredStorytellerTable {
  rollHistory: RollHistoryEntry[];
  initiative: Array<StorytellerInitiativeEntry & { rollerDiscordId: string }>;
  rollReceipts: Record<string, string>;
}

export function readVoiceTableStorytellers(value: string | undefined): ReadonlyMap<string, string> {
  const assignments = new Map<string, string>();
  if (!value) return assignments;
  try {
    const config: unknown = JSON.parse(value);
    if (!config || typeof config !== 'object' || Array.isArray(config)) return assignments;
    for (const [channelId, discordId] of Object.entries(config)) {
      if (/^(?:\d{17,20}|mock-channel)$/.test(channelId) &&
          typeof discordId === 'string' && /^\d{17,20}$/.test(discordId)) {
        assignments.set(`${VOICE_TABLE_PREFIX}${channelId}`, discordId);
      }
    }
  } catch {
    // Invalid configuration grants no Storyteller permissions.
  }
  return assignments;
}

function projectSheet(sheet: W20UserCharacterSheet): StorytellerSheetStats {
  const {
    name, player, chronicle, breed, auspice, tribe, packName, packTotem, concept, deedName,
    metisDeformity, baseAttributes, abilities, customAbilities, specialties, backgrounds, gifts,
    renown, rank, rage, gnosis, willpower, silverCarriedItems, health, experience, activeForm,
    otherTraits, fetishes, rites, combatWeapons, equipment, armor,
  } = sheet;
  const {
    effectiveAbilities, health: computedHealth, effectiveAttributes, effectiveGnosisPool,
    effectiveRagePool, effectiveWillpowerPool, woundPenalty, woundLabel, perceptionDifficultyMod,
    shiftDifficulty, initiativeBonus, soakCapabilities, experienceRemaining,
  } = computeUserSheetStats(sheet);
  return {
    sheet: {
      name, player, chronicle, breed, auspice, tribe, packName, packTotem, concept, deedName,
      metisDeformity, baseAttributes, abilities, customAbilities, specialties, backgrounds, gifts,
      renown, rank, rage, gnosis, willpower, silverCarriedItems, health, experience, activeForm,
      otherTraits, fetishes, rites, combatWeapons, equipment, armor,
    },
    computed: {
      effectiveAbilities, health: computedHealth, effectiveAttributes, effectiveGnosisPool,
      effectiveRagePool, effectiveWillpowerPool, woundPenalty, woundLabel, perceptionDifficultyMod,
      shiftDifficulty, initiativeBonus, soakCapabilities, experienceRemaining,
    },
  };
}

export function projectStorytellerSeats(
  state: PersistedRoomState,
  connectedDiscordIds: ReadonlySet<string>,
): StorytellerSeatView[] {
  const rules = state.ruleState;
  return Object.entries(state.tableParticipants ?? {})
    .filter(([, seat]) => seat.isConnected && connectedDiscordIds.has(seat.discordUserId))
    .map(([participantKey]) => {
      const sheetId = rules?.seatBindings[participantKey];
      const sheet = sheetId ? rules?.sheets[sheetId]?.sheet : undefined;
      return { participantKey, sheet: sheet ? projectSheet(sheet) : null };
    });
}

export function projectStorytellerInitiative(
  table: StoredStorytellerTable | undefined,
  discordId: string,
): StorytellerInitiativeEntry[] {
  return (table?.initiative ?? [])
    .filter((entry) => entry.rollerDiscordId === discordId)
    .map(({ id, label, total, revealed }) => ({ id, label, total, revealed }));
}
