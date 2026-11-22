import { toast } from '../components/ui/Toast';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Auspice,
  Breed,
  buildDefaultSheetShortcuts,
  createBlankUserCharacterSheet,
  DamageType,
  draftToUserCharacterSheet,
  GarouForm,
  HealthState,
  normalizeSyncCode,
  SheetShortcut,
  sheetToLightTrackers,
  TableRollMode,
  W20CharacterCreationDraft,
  W20UserCharacterSheet,
} from '@w20-vtt/core';
import type {
  ClientSeatSyncItem,
  LightGarouTrackers,
  LightWoundPenalty,
} from '@w20-vtt/protocol';
import { W20UserCharacterSheetSchema } from '@w20-vtt/protocol';

export interface LocalTableSeat {
  seatId: string;
  playerName: string;
  sheetId: string | null;
  syncCode: string | null;
  unboundTrackers: LightGarouTrackers;
}

export interface SheetRollRequest {
  label: string;
  pool: number;
  difficulty: number;
  hasSpecialty: boolean;
  applyWoundPenalty: boolean;
  rageDiceCount?: number;
  isSecretRoll?: boolean;
  rollMode?: TableRollMode;
  initiativeModifier?: number;
}

export type SheetSaveStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'error';

const MAX_SEATS = 8;
const PUT_DEBOUNCE_MS = 600;

export const DEFAULT_UNBOUND_TRACKERS: LightGarouTrackers = {
  rage: 3,
  gnosis: 3,
  willpower: 5,
  woundPenalty: 0,
};

function getCacheKey(userId: string): string {
  return `w20-user-sheets:v2:${userId}`;
}

function clampDot(val: number, min = 0, max = 10): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

function clampWoundPenalty(val: unknown): LightWoundPenalty {
  return val === -1 || val === -2 || val === -5 ? val : 0;
}

function sanitizeTrackers(raw: Partial<LightGarouTrackers> | undefined): LightGarouTrackers {
  return {
    rage: clampDot(raw?.rage ?? DEFAULT_UNBOUND_TRACKERS.rage),
    gnosis: clampDot(raw?.gnosis ?? DEFAULT_UNBOUND_TRACKERS.gnosis),
    willpower: clampDot(raw?.willpower ?? DEFAULT_UNBOUND_TRACKERS.willpower),
    woundPenalty: clampWoundPenalty(raw?.woundPenalty),
  };
}

function createSeat(seatId: string, playerName: string, sheetId: string | null = null, syncCode: string | null = null): LocalTableSeat {
  return {
    seatId,
    playerName,
    sheetId,
    syncCode,
    unboundTrackers: { ...DEFAULT_UNBOUND_TRACKERS },
  };
}

function getMostRecentSheet(sheetsById: Record<string, W20UserCharacterSheet>): W20UserCharacterSheet | null {
  const list = Object.values(sheetsById);
  if (list.length === 0) return null;
  list.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  return list[0] ?? null;
}

function applyWoundPenaltyToHealth(health: HealthState, targetPenalty: LightWoundPenalty): HealthState {
  const bonusCount = Math.max(0, Math.min(10, Math.floor(health.bonusBruisedBoxes)));
  const totalLength = Math.max(7 + bonusCount, Math.min(20, health.boxes.length));
  const boxes = Array<DamageType>(totalLength).fill('none');

  if (targetPenalty === 0) {
    return { bonusBruisedBoxes: bonusCount, boxes };
  }

  // W20 base ladder indices: [0: Bruised(0), 1: Hurt(-1), 2: Injured(-1), 3: Wounded(-2), 4: Mauled(-2), 5: Crippled(-5), 6: Incapacitated]
  const baseIndex = targetPenalty === -1 ? 1 : targetPenalty === -2 ? 3 : 5;
  const fillCount = Math.min(totalLength, bonusCount + baseIndex + 1);
  for (let i = 0; i < fillCount; i++) {
    boxes[i] = 'bashing';
  }
  return { bonusBruisedBoxes: bonusCount, boxes };
}

export function buildClientSeatSyncPayload(state: {
  seats: LocalTableSeat[];
  sheetsById: Record<string, W20UserCharacterSheet>;
}): ClientSeatSyncItem[] {
  return state.seats.slice(0, MAX_SEATS).map((seat) => {
    const sheet = seat.sheetId ? state.sheetsById[seat.sheetId] : undefined;
    const displayName = (seat.playerName.trim() || 'Player').slice(0, 80);

    if (sheet) {
      const characterName = (sheet.name.trim() || 'New Garou').slice(0, 120);
      return {
        seatId: seat.seatId.slice(0, 80),
        displayName,
        characterName,
        activeForm: sheet.activeForm,
        trackers: sheetToLightTrackers(sheet),
      };
    }

    return {
      seatId: seat.seatId.slice(0, 80),
      displayName,
      characterName: null,
      activeForm: null,
      trackers: sanitizeTrackers(seat.unboundTrackers),
    };
  });
}

interface PersistedLocalCache {
  sheetsById: Record<string, W20UserCharacterSheet>;
  seats?: LocalTableSeat[];
  activeSeatId?: string;
  dirtySheetIds?: string[];
}

function readLocalCache(userId: string): {
  sheetsById: Record<string, W20UserCharacterSheet>;
  seats: LocalTableSeat[] | null;
  activeSeatId: string | null;
  dirtyIds: Set<string>;
} {
  const empty = {
    sheetsById: {} as Record<string, W20UserCharacterSheet>,
    seats: null as LocalTableSeat[] | null,
    activeSeatId: null as string | null,
    dirtyIds: new Set<string>(),
  };
  if (typeof window === 'undefined') return empty;

  try {
    const raw = window.localStorage.getItem(getCacheKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<PersistedLocalCache>;
    const sheetsById: Record<string, W20UserCharacterSheet> = {};

    if (parsed.sheetsById && typeof parsed.sheetsById === 'object') {
      for (const [id, candidate] of Object.entries(parsed.sheetsById)) {
        const valid = W20UserCharacterSheetSchema.safeParse(candidate);
        if (valid.success) {
          sheetsById[id] = valid.data;
        }
      }
    }

    let seats: LocalTableSeat[] | null = null;
    if (Array.isArray(parsed.seats) && parsed.seats.length > 0) {
      const sanitized: LocalTableSeat[] = [];
      for (const item of parsed.seats.slice(0, MAX_SEATS)) {
        if (!item || typeof item !== 'object' || typeof item.seatId !== 'string') continue;
        const seatId = item.seatId.trim().slice(0, 80);
        if (!seatId || sanitized.some((s) => s.seatId === seatId)) continue;
        const rawSheetId = typeof item.sheetId === 'string' ? item.sheetId : null;
        const rawSyncCode =
          typeof item.syncCode === 'string' ? normalizeSyncCode(item.syncCode) : null;
        const sheetId =
          rawSheetId && (sheetsById[rawSheetId] || rawSyncCode) ? rawSheetId : null;

        sanitized.push({
          seatId,
          playerName: typeof item.playerName === 'string' ? item.playerName : 'Player',
          sheetId,
          syncCode: rawSyncCode,
          unboundTrackers: sanitizeTrackers(item.unboundTrackers),
        });
      }
      if (sanitized.length > 0) {
        seats = sanitized;
      }
    }

    const dirtyIds = new Set<string>();
    if (Array.isArray(parsed.dirtySheetIds)) {
      for (const id of parsed.dirtySheetIds) {
        if (typeof id === 'string' && sheetsById[id]) {
          dirtyIds.add(id);
        }
      }
    }

    return {
      sheetsById,
      seats,
      activeSeatId: typeof parsed.activeSeatId === 'string' ? parsed.activeSeatId : null,
      dirtyIds,
    };
  } catch {
    return empty;
  }
}

let localStorageWarningShown = false;

function writeLocalCache(
  userId: string | null,
  sheetsById: Record<string, W20UserCharacterSheet>,
  seats: LocalTableSeat[],
  activeSeatId: string,
  dirtyIds: Set<string>
): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    const payload: PersistedLocalCache = {
      sheetsById,
      seats,
      activeSeatId,
      dirtySheetIds: Array.from(dirtyIds),
    };
    window.localStorage.setItem(getCacheKey(userId), JSON.stringify(payload));
  } catch {
    // Storage can be full or blocked inside the Discord frame. Say so once, because
    // the "saved on this device" promise does not hold when this fails.
    if (!localStorageWarningShown) {
      localStorageWarningShown = true;
      toast.error(
        'This device could not store your characters locally. Unsaved changes may be lost if you close the activity.',
        0
      );
    }
  }
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: string;
      errors?: Array<{ field?: string; message: string }>;
    };
    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join('; ');
    }
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Ignore JSON parse failures on non-JSON error responses
  }
  return `${fallback} (${res.status})`;
}

export interface InitializeSessionParams {
  userId: string;
  username: string;
  sessionJwt: string;
}

export interface CreateBlankSheetParams {
  name: string;
  player?: string;
  breed: Breed;
  auspice: Auspice;
  tribe: string;
  autoFillStartingTraits: boolean;
}

export interface CreateGuidedSheetParams {
  draft: W20CharacterCreationDraft;
  player?: string;
  deedName?: string;
}

export interface CharacterSheetStoreState {
  initializedUserId: string | null;
  sessionJwt: string | null;
  sheetsById: Record<string, W20UserCharacterSheet>;
  seats: LocalTableSeat[];
  activeSeatId: string;
  rosterModalOpen: boolean;
  sheetModalOpen: boolean;
  wizardSeatId: string | null;
  loadingRoster: boolean;
  saveStatus: SheetSaveStatus;
  errorMessage: string | null;

  initializeForSession: (params: InitializeSessionParams) => Promise<void>;
  updateSessionJwt: (jwt: string) => void;
  setRosterModalOpen: (open: boolean) => void;
  setSheetModalOpen: (open: boolean) => void;
  openWizardForSeat: (seatId: string | null) => void;
  setActiveSeat: (seatId: string) => void;
  addSeat: (playerName?: string) => string | null;
  removeSeat: (seatId: string) => void;
  updateSeatPlayerName: (seatId: string, playerName: string) => void;
  assignSheetToSeat: (seatId: string, sheetId: string | null, syncCode?: string | null) => void;

  createBlankSheetForSeat: (
    seatId: string,
    params: CreateBlankSheetParams
  ) => Promise<W20UserCharacterSheet>;
  createGuidedSheetForSeat: (
    seatId: string,
    params: CreateGuidedSheetParams
  ) => Promise<W20UserCharacterSheet>;
  updateSheet: (
    sheetId: string,
    updater:
      | ((prev: W20UserCharacterSheet) => W20UserCharacterSheet)
      | Partial<W20UserCharacterSheet>
  ) => void;
  deleteSheet: (sheetId: string) => Promise<void>;

  generateSyncCode: (sheetId: string) => Promise<string | null>;
  revokeSyncCode: (sheetId: string) => Promise<void>;
  loadSheetBySyncCode: (
    seatId: string,
    rawCode: string,
    playerName?: string
  ) => Promise<W20UserCharacterSheet | null>;

  exportSheetJson: (sheetId: string) => void;
  importSheetJson: (seatId: string, rawJson: string) => Promise<W20UserCharacterSheet>;

  updateActiveSeatTrackers: (patch: Partial<LightGarouTrackers>) => void;
  spendActiveSeatWillpower: () => void;
  /** Gives back 1 temporary Willpower to a seat, for a roll the table rejected. */
  refundSeatWillpower: (seatId: string) => void;
  setActiveSheetForm: (form: GarouForm) => void;
  pinShortcutToActiveSheet: (shortcut: SheetShortcut) => void;
  removeShortcutFromActiveSheet: (shortcutId: string) => void;
}

const dirtySheetIds = new Set<string>();
const putDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DIRTY_RETRY_MIN_DELAY_MS = 15_000;
const DIRTY_RETRY_MAX_DELAY_MS = 120_000;
let dirtyRetryDelayMs = DIRTY_RETRY_MIN_DELAY_MS;
let dirtyRetryTimer: ReturnType<typeof setTimeout> | null = null;
let sessionInitGeneration = 0;

function clearAllDebounceTimers(): void {
  for (const timer of putDebounceTimers.values()) {
    clearTimeout(timer);
  }
  putDebounceTimers.clear();
}

export const useCharacterSheetStore = create<CharacterSheetStoreState>()(
  subscribeWithSelector((set, get) => {
    const persistSnapshot = () => {
      const state = get();
      writeLocalCache(
        state.initializedUserId,
        state.sheetsById,
        state.seats,
        state.activeSeatId,
        dirtySheetIds
      );
    };

    /** Tries again later after a save failed for a reason that may pass (offline, 5xx). */
    const scheduleDirtyRetry = () => {
      if (dirtyRetryTimer !== null || typeof window === 'undefined') return;
      dirtyRetryTimer = setTimeout(() => {
        dirtyRetryTimer = null;
        retryDirtySheets();
      }, dirtyRetryDelayMs);
      // Back off so a long outage is not hammered every few seconds.
      dirtyRetryDelayMs = Math.min(DIRTY_RETRY_MAX_DELAY_MS, dirtyRetryDelayMs * 2);
    };

    /** Re-sends every sheet with unsaved changes that is not already waiting to send. */
    const retryDirtySheets = () => {
      const state = get();
      if (!state.sessionJwt) return;
      for (const sheetId of Array.from(dirtySheetIds)) {
        if (putDebounceTimers.has(sheetId)) continue;
        const sheet = state.sheetsById[sheetId];
        if (!sheet) {
          dirtySheetIds.delete(sheetId);
          continue;
        }
        void flushPutForSheet(sheetId, sheet.updatedAt);
      }
    };

    /** Sends edits still inside the debounce window right now (the page is closing). */
    const flushPendingSavesNow = () => {
      for (const [sheetId, timer] of Array.from(putDebounceTimers.entries())) {
        clearTimeout(timer);
        const sheet = get().sheetsById[sheetId];
        if (sheet) void flushPutForSheet(sheetId, sheet.updatedAt, true);
        else putDebounceTimers.delete(sheetId);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushPendingSavesNow);
      window.addEventListener('online', retryDirtySheets);
    }

    const flushPutForSheet = async (
      sheetId: string,
      sentUpdatedAt: number,
      keepalive = false
    ) => {
      putDebounceTimers.delete(sheetId);
      const state = get();
      const latestSheet = state.sheetsById[sheetId];
      if (!latestSheet) return;

      if (!state.sessionJwt) {
        set({ saveStatus: 'local_only' });
        persistSnapshot();
        return;
      }

      const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
      const seatWithSyncCode =
        activeSeat?.sheetId === sheetId && activeSeat.syncCode
          ? activeSeat
          : state.seats.find((s) => s.sheetId === sheetId && Boolean(s.syncCode));

      const isForeignSync =
        latestSheet.ownerDiscordId !== state.initializedUserId &&
        Boolean(seatWithSyncCode?.syncCode);
      const syncCode = seatWithSyncCode?.syncCode ?? null;
      const endpoint = isForeignSync
        ? `/api/character-sheets/by-sync-code/${encodeURIComponent(syncCode!)}`
        : `/api/me/character-sheets/${encodeURIComponent(sheetId)}`;

      try {
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.sessionJwt}`,
          },
          body: JSON.stringify({ sheet: latestSheet }),
          // Lets the request finish after the page starts unloading.
          keepalive,
        });

        if (!res.ok) {
          const msg = await extractErrorMessage(res, 'Failed to save character sheet');
          const isPermanentFailure = res.status === 400 || res.status === 403 || res.status === 404;
          set({
            saveStatus: isPermanentFailure ? 'error' : 'local_only',
            errorMessage: msg,
          });
          if (!isPermanentFailure) scheduleDirtyRetry();
          return;
        }

        const data = (await res.json()) as { sheet?: W20UserCharacterSheet };
        const currentInStore = get().sheetsById[sheetId];
        // Avoid overwriting newer optimistic edits made while this PUT was in flight
        if (currentInStore && currentInStore.updatedAt > sentUpdatedAt) {
          return;
        }

        dirtySheetIds.delete(sheetId);
        dirtyRetryDelayMs = DIRTY_RETRY_MIN_DELAY_MS;
        if (data.sheet) {
          const valid = W20UserCharacterSheetSchema.safeParse(data.sheet);
          if (valid.success) {
            set((prev) => ({
              sheetsById: {
                ...prev.sheetsById,
                [sheetId]: valid.data,
              },
              saveStatus: putDebounceTimers.size > 0 ? 'saving' : 'saved',
              errorMessage: null,
            }));
            persistSnapshot();
            return;
          }
        }

        set({
          saveStatus: putDebounceTimers.size > 0 ? 'saving' : 'saved',
          errorMessage: null,
        });
        persistSnapshot();
      } catch {
        set({
          saveStatus: 'local_only',
          errorMessage: 'Offline: your changes are saved on this device and will sync when you reconnect.',
        });
        persistSnapshot();
        scheduleDirtyRetry();
      }
    };

    return {
      initializedUserId: null,
      sessionJwt: null,
      sheetsById: {},
      seats: [createSeat('primary', 'Player')],
      activeSeatId: 'primary',
      rosterModalOpen: false,
      sheetModalOpen: false,
      wizardSeatId: null,
      loadingRoster: false,
      saveStatus: 'idle',
      errorMessage: null,

      initializeForSession: async ({ userId, username, sessionJwt }) => {
        sessionInitGeneration += 1;
        const myGen = sessionInitGeneration;
        const prevUser = get().initializedUserId;
        const isNewUserSession = prevUser !== userId;

        if (isNewUserSession) {
          clearAllDebounceTimers();
          dirtySheetIds.clear();
        }

        const cached = readLocalCache(userId);
        const defaultName = username.trim() || 'Player';
        const hadCachedSeats = Boolean(cached.seats && cached.seats.length > 0);

        let initialSeats: LocalTableSeat[];
        if (cached.seats && cached.seats.length > 0) {
          initialSeats = [...cached.seats];
          const primaryIdx = initialSeats.findIndex((s) => s.seatId === 'primary');
          if (primaryIdx === -1) {
            const recent = getMostRecentSheet(cached.sheetsById);
            initialSeats.unshift(
              createSeat('primary', defaultName, recent?.id ?? null, null)
            );
          } else if (!initialSeats[primaryIdx]!.playerName.trim()) {
            initialSeats[primaryIdx] = {
              ...initialSeats[primaryIdx]!,
              playerName: defaultName,
            };
          }
          initialSeats = initialSeats.slice(0, MAX_SEATS);
        } else {
          const recent = getMostRecentSheet(cached.sheetsById);
          initialSeats = [createSeat('primary', defaultName, recent?.id ?? null, null)];
        }

        if (isNewUserSession) {
          for (const id of cached.dirtyIds) {
            dirtySheetIds.add(id);
          }
        }

        const nextActiveSeatId =
          cached.activeSeatId && initialSeats.some((s) => s.seatId === cached.activeSeatId)
            ? cached.activeSeatId
            : 'primary';

        set((prev) => ({
          initializedUserId: userId,
          sessionJwt,
          sheetsById: cached.sheetsById,
          seats: initialSeats,
          activeSeatId: nextActiveSeatId,
          rosterModalOpen: isNewUserSession ? true : prev.rosterModalOpen,
          loadingRoster: true,
          errorMessage: null,
        }));
        persistSnapshot();

        try {
          const res = await fetch('/api/me/character-sheets', {
            headers: {
              Authorization: `Bearer ${sessionJwt}`,
            },
          });

          if (myGen !== sessionInitGeneration) return;

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Unable to load cloud character sheets');
            set({
              loadingRoster: false,
              saveStatus: 'local_only',
              errorMessage: msg,
            });
            return;
          }

          const body = (await res.json()) as { sheets?: unknown[] };
          const cloudList = Array.isArray(body.sheets) ? body.sheets : [];
          const cloudById: Record<string, W20UserCharacterSheet> = {};

          for (const item of cloudList) {
            const parsed = W20UserCharacterSheetSchema.safeParse(item);
            if (parsed.success) {
              cloudById[parsed.data.id] = parsed.data;
            }
          }

          const currentState = get();
          const reconciled: Record<string, W20UserCharacterSheet> = { ...cloudById };

          // Keep newer dirty local edits & offline-created sheets, plus any seat-referenced foreign sheets
          for (const [id, localSheet] of Object.entries(currentState.sheetsById)) {
            const cloudSheet = cloudById[id];
            const isForeignReferenced =
              localSheet.ownerDiscordId !== userId &&
              currentState.seats.some((s) => s.sheetId === id || Boolean(s.syncCode));

            if (isForeignReferenced) {
              reconciled[id] = localSheet;
              continue;
            }

            if (dirtySheetIds.has(id)) {
              if (!cloudSheet || localSheet.updatedAt >= cloudSheet.updatedAt) {
                reconciled[id] = localSheet;
              } else {
                dirtySheetIds.delete(id);
              }
            }
          }

          // Refresh any seat bound via syncCode
          const nextSeats = currentState.seats.map((seat) => ({ ...seat }));
          const uniqueSyncCodes = Array.from(
            new Set(
              nextSeats
                .map((s) => (s.syncCode ? normalizeSyncCode(s.syncCode) : null))
                .filter((code): code is string => Boolean(code))
            )
          );

          await Promise.all(
            uniqueSyncCodes.map(async (code) => {
              try {
                const syncRes = await fetch('/api/character-sheets/sync-code/resolve', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${get().sessionJwt ?? sessionJwt}`,
                  },
                  body: JSON.stringify({ syncCode: code }),
                });

                if (myGen !== sessionInitGeneration) return;

                if (syncRes.ok) {
                  const syncData = (await syncRes.json()) as {
                    sheet?: unknown;
                    syncCode?: string;
                  };
                  const parsed = W20UserCharacterSheetSchema.safeParse(syncData.sheet);
                  if (parsed.success) {
                    const resolvedSheet = parsed.data;
                    reconciled[resolvedSheet.id] = resolvedSheet;
                    for (const seat of nextSeats) {
                      if (seat.syncCode && normalizeSyncCode(seat.syncCode) === code) {
                        seat.sheetId = resolvedSheet.id;
                        seat.syncCode = resolvedSheet.syncCode ?? syncData.syncCode ?? code;
                      }
                    }
                  }
                } else if (syncRes.status === 404) {
                  for (const seat of nextSeats) {
                    if (seat.syncCode && normalizeSyncCode(seat.syncCode) === code) {
                      const prevSheet = seat.sheetId ? reconciled[seat.sheetId] : undefined;
                      seat.syncCode = null;
                      if (prevSheet && prevSheet.ownerDiscordId !== userId) {
                        delete reconciled[prevSheet.id];
                        seat.sheetId = null;
                      }
                    }
                  }
                }
              } catch {
                // Retain cached foreign sheet if offline
              }
            })
          );

          if (myGen !== sessionInitGeneration) return;

          // Clear seat sheetId references to deleted sheets
          for (const seat of nextSeats) {
            if (seat.sheetId && !reconciled[seat.sheetId]) {
              seat.sheetId = null;
              seat.syncCode = null;
            }
          }

          // On first-ever join with no cached seat choice, pre-select most recently used cloud sheet
          if (!hadCachedSeats) {
            const primary = nextSeats.find((s) => s.seatId === 'primary');
            if (primary && !primary.sheetId) {
              const recent = getMostRecentSheet(reconciled);
              if (recent) {
                primary.sheetId = recent.id;
              }
            }
          }

          set({
            sheetsById: reconciled,
            seats: nextSeats,
            loadingRoster: false,
            saveStatus: dirtySheetIds.size > 0 ? 'local_only' : 'saved',
            errorMessage: null,
          });
          persistSnapshot();
          // Changes that never reached the cloud last time are sent now.
          retryDirtySheets();
        } catch {
          if (myGen !== sessionInitGeneration) return;
          set({
            loadingRoster: false,
            saveStatus: 'local_only',
          });
          toast.error(
            'Could not load your characters from the cloud. Showing the copies saved on this device.'
          );
          scheduleDirtyRetry();
        }
      },

      updateSessionJwt: (jwt) => {
        set({ sessionJwt: jwt });
        retryDirtySheets();
      },

      setRosterModalOpen: (open) => {
        set({ rosterModalOpen: open });
      },

      setSheetModalOpen: (open) => {
        set({ sheetModalOpen: open });
      },

      openWizardForSeat: (seatId) => {
        set({ wizardSeatId: seatId });
      },

      setActiveSeat: (seatId) => {
        const exists = get().seats.some((s) => s.seatId === seatId);
        if (!exists) return;
        set({ activeSeatId: seatId });
        persistSnapshot();
      },

      addSeat: (playerName) => {
        const state = get();
        if (state.seats.length >= MAX_SEATS) {
          return null;
        }
        const seatId = `seat-${crypto.randomUUID().slice(0, 8)}`;
        const name = playerName?.trim() || `Player ${state.seats.length + 1}`;
        const nextSeats = [...state.seats, createSeat(seatId, name)];
        set({ seats: nextSeats });
        persistSnapshot();
        return seatId;
      },

      removeSeat: (seatId) => {
        if (seatId === 'primary') return;
        set((prev) => {
          const nextSeats = prev.seats.filter((s) => s.seatId !== seatId);
          return {
            seats: nextSeats,
            activeSeatId: prev.activeSeatId === seatId ? 'primary' : prev.activeSeatId,
            wizardSeatId: prev.wizardSeatId === seatId ? null : prev.wizardSeatId,
          };
        });
        persistSnapshot();
      },

      updateSeatPlayerName: (seatId, playerName) => {
        set((prev) => ({
          seats: prev.seats.map((s) =>
            s.seatId === seatId ? { ...s, playerName: playerName.slice(0, 80) } : s
          ),
        }));
        persistSnapshot();
      },

      assignSheetToSeat: (seatId, sheetId, syncCode) => {
        set((prev) => {
          const sheet = sheetId ? prev.sheetsById[sheetId] : undefined;
          const now = Date.now();
          const nextSheets =
            sheet && sheetId
              ? {
                  ...prev.sheetsById,
                  [sheetId]: { ...sheet, lastUsedAt: now },
                }
              : prev.sheetsById;

          const nextSeats = prev.seats.map((seat) => {
            if (seat.seatId !== seatId) return seat;
            if (!sheetId || !sheet) {
              return { ...seat, sheetId: null, syncCode: null };
            }
            const resolvedSyncCode =
              syncCode !== undefined
                ? syncCode
                  ? normalizeSyncCode(syncCode) ?? syncCode
                  : null
                : sheet.ownerDiscordId !== prev.initializedUserId
                  ? (sheet.syncCode ?? null)
                  : null;
            return {
              ...seat,
              sheetId,
              syncCode: resolvedSyncCode,
            };
          });

          return {
            sheetsById: nextSheets,
            seats: nextSeats,
          };
        });
        persistSnapshot();
      },

      createBlankSheetForSeat: async (seatId, params) => {
        const state = get();
        const seat = state.seats.find((s) => s.seatId === seatId);
        const ownerDiscordId = state.initializedUserId ?? 'local';
        const now = Date.now();

        let sheet = createBlankUserCharacterSheet({
          id: crypto.randomUUID(),
          ownerDiscordId,
          name: params.name.trim() || 'New Garou',
          player: (params.player ?? seat?.playerName ?? '').trim(),
          breed: params.breed,
          auspice: params.auspice,
          tribe: params.tribe,
          now,
        });

        if (params.autoFillStartingTraits === false) {
          sheet = {
            ...sheet,
            rage: { permanent: 1, temporary: 1 },
            gnosis: { permanent: 1, temporary: 1 },
            willpower: { permanent: 1, temporary: 1 },
            renown: {
              glory: { permanent: 0, temporary: 0 },
              honor: { permanent: 0, temporary: 0 },
              wisdom: { permanent: 0, temporary: 0 },
            },
          };
          sheet.shortcuts = buildDefaultSheetShortcuts(sheet);
        }

        const saveLocally = (status: SheetSaveStatus, errorMsg: string | null) => {
          dirtySheetIds.add(sheet.id);
          set((prev) => ({
            sheetsById: { ...prev.sheetsById, [sheet.id]: sheet },
            saveStatus: status,
            errorMessage: errorMsg,
          }));
          get().assignSheetToSeat(seatId, sheet.id, null);
          persistSnapshot();
          return sheet;
        };

        if (!state.sessionJwt) {
          return saveLocally('local_only', null);
        }

        set({ saveStatus: 'saving', errorMessage: null });

        try {
          const res = await fetch('/api/me/character-sheets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.sessionJwt}`,
            },
            body: JSON.stringify({ mode: 'freeform', sheet }),
          });

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Could not create cloud character sheet');
            if (res.status >= 500) {
              return saveLocally('local_only', msg);
            }
            set({ saveStatus: 'error', errorMessage: msg });
            throw new Error(msg);
          }

          const data = (await res.json()) as { sheet?: unknown };
          const parsed = W20UserCharacterSheetSchema.safeParse(data.sheet);
          const savedSheet = parsed.success ? parsed.data : sheet;

          dirtySheetIds.delete(savedSheet.id);
          set((prev) => ({
            sheetsById: { ...prev.sheetsById, [savedSheet.id]: savedSheet },
            saveStatus: 'saved',
            errorMessage: null,
          }));
          get().assignSheetToSeat(seatId, savedSheet.id, null);
          persistSnapshot();
          return savedSheet;
        } catch (err) {
          if (err instanceof TypeError) {
            return saveLocally('local_only', 'Offline: character sheet created locally.');
          }
          throw err;
        }
      },

      createGuidedSheetForSeat: async (seatId, params) => {
        const state = get();
        const seat = state.seats.find((s) => s.seatId === seatId);
        const player = (params.player ?? seat?.playerName ?? '').trim();
        const ownerDiscordId = state.initializedUserId ?? 'local';

        const localFallbackSheet = draftToUserCharacterSheet(params.draft, {
          id: crypto.randomUUID(),
          ownerDiscordId,
          player,
          deedName: params.deedName?.trim() || undefined,
        });

        const saveLocally = (errorMsg: string | null) => {
          dirtySheetIds.add(localFallbackSheet.id);
          set((prev) => ({
            sheetsById: {
              ...prev.sheetsById,
              [localFallbackSheet.id]: localFallbackSheet,
            },
            saveStatus: 'local_only',
            errorMessage: errorMsg,
          }));
          get().assignSheetToSeat(seatId, localFallbackSheet.id, null);
          persistSnapshot();
          return localFallbackSheet;
        };

        if (!state.sessionJwt) {
          return saveLocally(null);
        }

        set({ saveStatus: 'saving', errorMessage: null });

        try {
          const res = await fetch('/api/me/character-sheets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.sessionJwt}`,
            },
            body: JSON.stringify({
              mode: 'guided',
              draft: params.draft,
              player: player || undefined,
              deedName: params.deedName?.trim() || undefined,
            }),
          });

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Guided character creation failed');
            if (res.status >= 500) {
              return saveLocally(msg);
            }
            set({ saveStatus: 'error', errorMessage: msg });
            throw new Error(msg);
          }

          const data = (await res.json()) as { sheet?: unknown };
          const parsed = W20UserCharacterSheetSchema.safeParse(data.sheet);
          const savedSheet = parsed.success ? parsed.data : localFallbackSheet;

          dirtySheetIds.delete(savedSheet.id);
          set((prev) => ({
            sheetsById: { ...prev.sheetsById, [savedSheet.id]: savedSheet },
            saveStatus: 'saved',
            errorMessage: null,
          }));
          get().assignSheetToSeat(seatId, savedSheet.id, null);
          persistSnapshot();
          return savedSheet;
        } catch (err) {
          if (err instanceof TypeError) {
            return saveLocally('Offline: guided character sheet saved locally.');
          }
          throw err;
        }
      },

      updateSheet: (sheetId, updater) => {
        const prevSheet = get().sheetsById[sheetId];
        if (!prevSheet) return;

        const now = Date.now();
        const nextRaw =
          typeof updater === 'function' ? updater(prevSheet) : { ...prevSheet, ...updater };
        const nextSheet: W20UserCharacterSheet = {
          ...nextRaw,
          id: prevSheet.id,
          updatedAt: now,
          lastUsedAt: now,
        };

        dirtySheetIds.add(sheetId);
        set((prev) => ({
          sheetsById: {
            ...prev.sheetsById,
            [sheetId]: nextSheet,
          },
          saveStatus: 'saving',
          errorMessage: null,
        }));
        persistSnapshot();

        const existingTimer = putDebounceTimers.get(sheetId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          void flushPutForSheet(sheetId, now);
        }, PUT_DEBOUNCE_MS);
        putDebounceTimers.set(sheetId, timer);
      },

      deleteSheet: async (sheetId) => {
        const existingTimer = putDebounceTimers.get(sheetId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          putDebounceTimers.delete(sheetId);
        }
        dirtySheetIds.delete(sheetId);

        const state = get();
        const targetSheet = state.sheetsById[sheetId];

        set((prev) => {
          const nextSheets = { ...prev.sheetsById };
          delete nextSheets[sheetId];
          const nextSeats = prev.seats.map((seat) =>
            seat.sheetId === sheetId ? { ...seat, sheetId: null, syncCode: null } : seat
          );
          return {
            sheetsById: nextSheets,
            seats: nextSeats,
            errorMessage: null,
          };
        });
        persistSnapshot();

        const shouldDeleteRemote =
          Boolean(state.sessionJwt) &&
          (!targetSheet || targetSheet.ownerDiscordId === state.initializedUserId);

        if (!shouldDeleteRemote || !state.sessionJwt) return;

        try {
          const res = await fetch(`/api/me/character-sheets/${encodeURIComponent(sheetId)}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${state.sessionJwt}`,
            },
          });
          if (!res.ok && res.status !== 404) {
            const msg = await extractErrorMessage(res, 'Failed to delete remote sheet');
            set({ saveStatus: 'error', errorMessage: msg });
          }
        } catch {
          // The local delete already applied; the cloud copy could not be reached.
          toast.error(
            'Deleted on this device, but the cloud copy could not be removed. It may reappear next time you join.'
          );
        }
      },

      generateSyncCode: async (sheetId) => {
        const state = get();
        if (!state.sessionJwt) {
          set({ errorMessage: 'Session authentication is required to generate a sync code.' });
          return null;
        }

        set({ saveStatus: 'saving', errorMessage: null });
        try {
          const res = await fetch(
            `/api/me/character-sheets/${encodeURIComponent(sheetId)}/sync-code`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${state.sessionJwt}`,
              },
            }
          );

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Failed to generate sync code');
            set({ saveStatus: 'error', errorMessage: msg });
            return null;
          }

          const data = (await res.json()) as {
            syncCode?: string;
            sheet?: unknown;
          };
          const code = data.syncCode ? normalizeSyncCode(data.syncCode) ?? data.syncCode : null;
          const parsedSheet = W20UserCharacterSheetSchema.safeParse(data.sheet);

          set((prev) => {
            const existing = prev.sheetsById[sheetId];
            const nextSheet = parsedSheet.success
              ? parsedSheet.data
              : existing
                ? { ...existing, syncCode: code }
                : undefined;
            return {
              sheetsById: nextSheet
                ? { ...prev.sheetsById, [sheetId]: nextSheet }
                : prev.sheetsById,
              saveStatus: 'saved',
              errorMessage: null,
            };
          });
          persistSnapshot();
          return code;
        } catch {
          set({
            saveStatus: 'error',
            errorMessage: 'Network error while generating sync code.',
          });
          return null;
        }
      },

      revokeSyncCode: async (sheetId) => {
        const state = get();
        if (!state.sessionJwt) {
          set({ errorMessage: 'Session authentication is required to revoke a sync code.' });
          return;
        }

        set({ saveStatus: 'saving', errorMessage: null });
        try {
          const res = await fetch(
            `/api/me/character-sheets/${encodeURIComponent(sheetId)}/sync-code`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${state.sessionJwt}`,
              },
            }
          );

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Failed to revoke sync code');
            set({ saveStatus: 'error', errorMessage: msg });
            return;
          }

          const data = (await res.json()) as { sheet?: unknown };
          const parsedSheet = W20UserCharacterSheetSchema.safeParse(data.sheet);

          set((prev) => {
            const existing = prev.sheetsById[sheetId];
            const nextSheet = parsedSheet.success
              ? parsedSheet.data
              : existing
                ? { ...existing, syncCode: null }
                : undefined;
            return {
              sheetsById: nextSheet
                ? { ...prev.sheetsById, [sheetId]: nextSheet }
                : prev.sheetsById,
              saveStatus: 'saved',
              errorMessage: null,
            };
          });
          persistSnapshot();
        } catch {
          set({
            saveStatus: 'error',
            errorMessage: 'Network error while revoking sync code.',
          });
        }
      },

      loadSheetBySyncCode: async (seatId, rawCode, playerName) => {
        const normalized = normalizeSyncCode(rawCode);
        if (!normalized) {
          set({
            errorMessage: 'Enter a valid 8-character sync code (e.g. ABCD-2345).',
          });
          return null;
        }

        const state = get();
        if (!state.sessionJwt) {
          set({ errorMessage: 'Session authentication is required to load a sync code.' });
          return null;
        }

        set({ errorMessage: null });
        try {
          const res = await fetch('/api/character-sheets/sync-code/resolve', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.sessionJwt}`,
            },
            body: JSON.stringify({ syncCode: normalized }),
          });

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Sync code not found');
            set({ errorMessage: msg });
            return null;
          }

          const data = (await res.json()) as {
            sheet?: unknown;
            syncCode?: string;
          };
          const parsed = W20UserCharacterSheetSchema.safeParse(data.sheet);
          if (!parsed.success) {
            const msg = 'Server returned an invalid character sheet payload.';
            set({ errorMessage: msg });
            return null;
          }

          const resolvedSheet = parsed.data;
          const activeCode = resolvedSheet.syncCode ?? data.syncCode ?? normalized;

          set((prev) => ({
            sheetsById: {
              ...prev.sheetsById,
              [resolvedSheet.id]: resolvedSheet,
            },
            errorMessage: null,
          }));

          if (playerName?.trim()) {
            get().updateSeatPlayerName(seatId, playerName.trim());
          }
          get().assignSheetToSeat(seatId, resolvedSheet.id, activeCode);
          persistSnapshot();
          return resolvedSheet;
        } catch {
          set({ errorMessage: 'Network error while resolving sync code.' });
          return null;
        }
      },

      exportSheetJson: (sheetId) => {
        const sheet = get().sheetsById[sheetId];
        if (!sheet || typeof window === 'undefined' || typeof document === 'undefined') {
          return;
        }

        const slug =
          sheet.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'garou-sheet';

        const blob = new Blob([JSON.stringify(sheet, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}.w20sheet.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },

      importSheetJson: async (seatId, rawJson) => {
        let parsedRaw: unknown;
        try {
          parsedRaw = JSON.parse(rawJson);
        } catch {
          const msg = 'Invalid JSON file: could not parse character sheet.';
          set({ errorMessage: msg });
          throw new Error(msg);
        }

        if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
          const msg = 'Invalid character sheet JSON format.';
          set({ errorMessage: msg });
          throw new Error(msg);
        }

        const state = get();
        const now = Date.now();
        const ownerDiscordId = state.initializedUserId ?? 'local';
        const rawRecord = parsedRaw as Record<string, unknown>;

        const baseBlank = createBlankUserCharacterSheet({
          id: crypto.randomUUID(),
          ownerDiscordId,
          name: typeof rawRecord.name === 'string' && rawRecord.name.trim() ? rawRecord.name.trim() : 'Imported Garou',
          breed:
            rawRecord.breed === 'homid' || rawRecord.breed === 'metis' || rawRecord.breed === 'lupus'
              ? rawRecord.breed
              : 'homid',
          auspice:
            rawRecord.auspice === 'ragabash' ||
            rawRecord.auspice === 'theurge' ||
            rawRecord.auspice === 'philodox' ||
            rawRecord.auspice === 'galliard' ||
            rawRecord.auspice === 'ahroun'
              ? rawRecord.auspice
              : 'ahroun',
          tribe: typeof rawRecord.tribe === 'string' ? rawRecord.tribe : 'get_of_fenris',
          now,
        });

        const candidate = {
          ...baseBlank,
          ...rawRecord,
          id: baseBlank.id,
          ownerDiscordId,
          syncCode: null,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
        };

        const validated = W20UserCharacterSheetSchema.safeParse(candidate);
        if (!validated.success) {
          const issueText = validated.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.') || 'sheet'}: ${i.message}`)
            .join('; ');
          const msg = `Sheet validation failed: ${issueText}`;
          set({ errorMessage: msg });
          throw new Error(msg);
        }

        const importedSheet = validated.data;
        if (importedSheet.shortcuts.length === 0) {
          importedSheet.shortcuts = buildDefaultSheetShortcuts(importedSheet);
        }

        const saveLocally = (status: SheetSaveStatus, errorMsg: string | null) => {
          dirtySheetIds.add(importedSheet.id);
          set((prev) => ({
            sheetsById: { ...prev.sheetsById, [importedSheet.id]: importedSheet },
            saveStatus: status,
            errorMessage: errorMsg,
          }));
          get().assignSheetToSeat(seatId, importedSheet.id, null);
          persistSnapshot();
          return importedSheet;
        };

        if (!state.sessionJwt) {
          return saveLocally('local_only', null);
        }

        set({ saveStatus: 'saving', errorMessage: null });
        try {
          const res = await fetch('/api/me/character-sheets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.sessionJwt}`,
            },
            body: JSON.stringify({ mode: 'freeform', sheet: importedSheet }),
          });

          if (!res.ok) {
            const msg = await extractErrorMessage(res, 'Failed to save imported sheet');
            if (res.status >= 500) {
              return saveLocally('local_only', msg);
            }
            set({ saveStatus: 'error', errorMessage: msg });
            throw new Error(msg);
          }

          const data = (await res.json()) as { sheet?: unknown };
          const parsedSaved = W20UserCharacterSheetSchema.safeParse(data.sheet);
          const savedSheet = parsedSaved.success ? parsedSaved.data : importedSheet;

          dirtySheetIds.delete(savedSheet.id);
          set((prev) => ({
            sheetsById: { ...prev.sheetsById, [savedSheet.id]: savedSheet },
            saveStatus: 'saved',
            errorMessage: null,
          }));
          get().assignSheetToSeat(seatId, savedSheet.id, null);
          persistSnapshot();
          return savedSheet;
        } catch (err) {
          if (err instanceof TypeError) {
            return saveLocally('local_only', 'Offline: imported sheet saved locally.');
          }
          throw err;
        }
      },

      updateActiveSeatTrackers: (patch) => {
        const state = get();
        const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
        if (!activeSeat) return;

        const sheet = activeSeat.sheetId ? state.sheetsById[activeSeat.sheetId] : undefined;
        if (sheet) {
          const currentWoundPenalty = sheetToLightTrackers(sheet).woundPenalty;
          get().updateSheet(sheet.id, (prev) => {
            const nextHealth =
              patch.woundPenalty !== undefined && patch.woundPenalty !== currentWoundPenalty
                ? applyWoundPenaltyToHealth(prev.health, patch.woundPenalty)
                : prev.health;

            return {
              ...prev,
              rage:
                patch.rage !== undefined
                  ? { ...prev.rage, temporary: clampDot(patch.rage) }
                  : prev.rage,
              gnosis:
                patch.gnosis !== undefined
                  ? { ...prev.gnosis, temporary: clampDot(patch.gnosis) }
                  : prev.gnosis,
              willpower:
                patch.willpower !== undefined
                  ? { ...prev.willpower, temporary: clampDot(patch.willpower) }
                  : prev.willpower,
              health: nextHealth,
            };
          });
          return;
        }

        set((prev) => ({
          seats: prev.seats.map((s) =>
            s.seatId === prev.activeSeatId
              ? {
                  ...s,
                  unboundTrackers: sanitizeTrackers({
                    ...s.unboundTrackers,
                    ...patch,
                  }),
                }
              : s
          ),
        }));
        persistSnapshot();
      },

      refundSeatWillpower: (seatId) => {
        const state = get();
        const seat = state.seats.find((s) => s.seatId === seatId);
        if (!seat) return;

        const sheet = seat.sheetId ? state.sheetsById[seat.sheetId] : undefined;
        if (sheet) {
          get().updateSheet(sheet.id, (prev) => ({
            ...prev,
            willpower: {
              ...prev.willpower,
              temporary: Math.min(10, prev.willpower.temporary + 1),
            },
          }));
          return;
        }

        set((prev) => ({
          seats: prev.seats.map((s) =>
            s.seatId === seatId
              ? {
                  ...s,
                  unboundTrackers: {
                    ...s.unboundTrackers,
                    willpower: Math.min(10, s.unboundTrackers.willpower + 1),
                  },
                }
              : s
          ),
        }));
      },

      spendActiveSeatWillpower: () => {
        const state = get();
        const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
        if (!activeSeat) return;

        const sheet = activeSeat.sheetId ? state.sheetsById[activeSeat.sheetId] : undefined;
        if (sheet) {
          if (sheet.willpower.temporary <= 0) return;
          get().updateSheet(sheet.id, (prev) => ({
            ...prev,
            willpower: {
              ...prev.willpower,
              temporary: Math.max(0, prev.willpower.temporary - 1),
            },
          }));
          return;
        }

        set((prev) => ({
          seats: prev.seats.map((s) =>
            s.seatId === prev.activeSeatId
              ? {
                  ...s,
                  unboundTrackers: {
                    ...s.unboundTrackers,
                    willpower: Math.max(0, s.unboundTrackers.willpower - 1),
                  },
                }
              : s
          ),
        }));
        persistSnapshot();
      },

      setActiveSheetForm: (form) => {
        const state = get();
        const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
        if (!activeSeat?.sheetId) return;
        get().updateSheet(activeSeat.sheetId, (prev) => ({
          ...prev,
          activeForm: form,
        }));
      },

      pinShortcutToActiveSheet: (shortcut) => {
        const state = get();
        const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
        if (!activeSeat?.sheetId) return;

        // Pinning the same roll twice would only add a duplicate shortcut.
        const current = state.sheetsById[activeSeat.sheetId];
        const sameRoll = (item: SheetShortcut) =>
          item.id !== shortcut.id &&
          JSON.stringify({ ...item, id: '' }) === JSON.stringify({ ...shortcut, id: '' });
        if (current?.shortcuts.some(sameRoll)) {
          toast.info(`"${shortcut.name}" is already pinned.`);
          return;
        }

        get().updateSheet(activeSeat.sheetId, (prev) => {
          const exists = prev.shortcuts.some((item) => item.id === shortcut.id);
          const nextShortcuts = exists
            ? prev.shortcuts.map((item) => (item.id === shortcut.id ? shortcut : item))
            : [...prev.shortcuts, shortcut].slice(0, 100);
          return {
            ...prev,
            shortcuts: nextShortcuts,
          };
        });
      },

      removeShortcutFromActiveSheet: (shortcutId) => {
        const state = get();
        const activeSeat = state.seats.find((s) => s.seatId === state.activeSeatId);
        if (!activeSeat?.sheetId) return;
        get().updateSheet(activeSeat.sheetId, (prev) => ({
          ...prev,
          shortcuts: prev.shortcuts.filter((item) => item.id !== shortcutId),
        }));
      },
    };
  })
);
