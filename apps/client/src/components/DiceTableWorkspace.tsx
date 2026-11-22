import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import {
  computeUserSheetStats,
  type ResolvedSheetShortcut,
  type SheetShortcut,
  sheetToLightTrackers,
} from '@w20-vtt/core';
import type { LightGarouTrackers, RollHistoryEntry, TableParticipant } from '@w20-vtt/protocol';
import { diceSoundEngine, type DiceSoundPreferences } from '../audio/DiceSoundEngine';
import type { DiscordSessionContext } from '../discordBootstrap';
import { useViewportLayout } from '../hooks/useViewportLayout';
import {
  buildClientSeatSyncPayload,
  DEFAULT_UNBOUND_TRACKERS,
  type SheetRollRequest,
  useCharacterSheetStore,
} from '../store/useCharacterSheetStore';
import { type Queued3DRoll, useVttRoomStore } from '../store/useVttRoomStore';
import { CharacterRosterModal } from './character-sheet/CharacterRosterModal';
import { W20InteractiveSheetModal } from './character-sheet/W20InteractiveSheetModal';
import { DesktopDiceTableHud } from './dice-table/DesktopDiceTableHud';
import { MobileDiceTableHud } from './dice-table/MobileDiceTableHud';
import {
  type DiceTableHudProps,
  type QuickRollPreset,
  useUnboundQuickRollStore,
} from './dice-table/QuickRollBar';
import { QuickRollBar } from './dice-table/QuickRollBar';
import {
  type ComposerAttributeKey,
  resolveTraitRollSelection,
  type RollSourceMode,
} from './dice-table/TraitRollBuilder';
import { PackPresenceDrawer } from './dice-table/PackPresenceDrawer';
import { RollFeedDrawer } from './dice-table/RollFeedDrawer';

interface DiceTableWorkspaceProps {
  session: DiscordSessionContext;
}

function extractSettledDiceValues(raw: unknown, expectedCount: number): number[] | undefined {
  if (!Array.isArray(raw) || expectedCount <= 0) {
    return undefined;
  }
  const values: number[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !('value' in item)) {
      continue;
    }
    const rawVal = Number((item as { value?: unknown }).value);
    if (!Number.isFinite(rawVal)) {
      continue;
    }
    const normalized = rawVal === 0 ? 10 : Math.max(1, Math.min(10, Math.round(rawVal)));
    values.push(normalized);
  }
  return values.length === expectedCount ? values : undefined;
}

function buildDiceBoxGroups(
  effectivePool: number,
  rageDiceCount: number
): Array<{ qty: number; sides: number; themeColor: string }> {
  if (effectivePool <= 0) return [];
  const clampedRage = Math.min(effectivePool, Math.max(0, rageDiceCount));
  const obsidianCount = effectivePool - clampedRage;
  const groups: Array<{ qty: number; sides: number; themeColor: string }> = [];
  if (obsidianCount > 0) {
    groups.push({ qty: obsidianCount, sides: 10, themeColor: '#18181b' });
  }
  if (clampedRage > 0) {
    groups.push({ qty: clampedRage, sides: 10, themeColor: '#991b1b' });
  }
  return groups;
}

const GarouFeltMedallion: React.FC = () => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
    <svg
      viewBox="0 0 360 360"
      aria-hidden="true"
      className="h-[min(58vh,420px)] w-[min(58vw,420px)] opacity-[0.16]"
    >
      <circle
        cx="180"
        cy="180"
        r="164"
        fill="none"
        stroke="#c9a366"
        strokeWidth="1.25"
        strokeDasharray="4 6"
      />
      <circle cx="180" cy="180" r="142" fill="none" stroke="#b48e58" strokeWidth="1.2" />
      <circle cx="180" cy="180" r="96" fill="none" stroke="#991b1b" strokeWidth="1" />
      {/* Cardinal Auspice Spikes */}
      <polygon points="180,14 186,44 174,44" fill="#c9a366" />
      <polygon points="180,346 186,316 174,316" fill="#c9a366" />
      <polygon points="14,180 44,174 44,186" fill="#c9a366" />
      <polygon points="346,180 316,174 316,186" fill="#c9a366" />
      {/* Five Moon Phase Glyphs around the Seal */}
      <circle cx="180" cy="64" r="9" fill="#c9a366" />
      <path d="M254,82 A10,10 0 1,1 244,97 A7.5,7.5 0 1,0 254,82 Z" fill="#c9a366" />
      <path d="M286,204 A9,9 0 0,0 286,186 Z" fill="#c9a366" />
      <circle cx="74" cy="195" r="9" fill="none" stroke="#c9a366" strokeWidth="1.5" />
      <path d="M107,84 A9,9 0 1,0 118,98 A6.5,6.5 0 1,1 107,84 Z" fill="#c9a366" />
      {/* Inner Triquetra-Style Scar */}
      <polygon
        points="180,106 244,218 116,218"
        fill="none"
        stroke="#b48e58"
        strokeWidth="1.2"
      />
      <polygon
        points="180,254 244,142 116,142"
        fill="none"
        stroke="#991b1b"
        strokeWidth="1.1"
      />
    </svg>
  </div>
);

export const DiceTableWorkspace: React.FC<DiceTableWorkspaceProps> = ({ session }) => {
  const { isMobile, mode: layoutMode, cycleMode } = useViewportLayout();

  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);
  const lastError = useVttRoomStore((s) => s.lastError);
  const participants = useVttRoomStore((s) => s.participants);
  const speakingDiscordIds = useVttRoomStore((s) => s.speakingDiscordIds);
  const rollHistory = useVttRoomStore((s) => s.rollHistory);
  const diceQueue = useVttRoomStore((s) => s.diceQueue);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const dequeue3DRoll = useVttRoomStore((s) => s.dequeue3DRoll);

  const sheetsById = useCharacterSheetStore((s) => s.sheetsById);
  const seats = useCharacterSheetStore((s) => s.seats);
  const activeSeatId = useCharacterSheetStore((s) => s.activeSeatId);
  const initializeForSession = useCharacterSheetStore((s) => s.initializeForSession);
  const updateSessionJwt = useCharacterSheetStore((s) => s.updateSessionJwt);
  const setActiveSeat = useCharacterSheetStore((s) => s.setActiveSeat);
  const addSeat = useCharacterSheetStore((s) => s.addSeat);
  const setRosterModalOpen = useCharacterSheetStore((s) => s.setRosterModalOpen);
  const setSheetModalOpen = useCharacterSheetStore((s) => s.setSheetModalOpen);
  const updateActiveSeatTrackers = useCharacterSheetStore((s) => s.updateActiveSeatTrackers);
  const spendActiveSeatWillpower = useCharacterSheetStore((s) => s.spendActiveSeatWillpower);
  const setActiveSheetForm = useCharacterSheetStore((s) => s.setActiveSheetForm);
  const pinShortcutToActiveSheet = useCharacterSheetStore((s) => s.pinShortcutToActiveSheet);
  const removeShortcutFromActiveSheet = useCharacterSheetStore(
    (s) => s.removeShortcutFromActiveSheet
  );

  const latestSessionJwtRef = useRef(session.sessionJwt);
  latestSessionJwtRef.current = session.sessionJwt;

  // Initialize character sheet store when Discord session mounts/changes
  useEffect(() => {
    void initializeForSession({
      userId: session.userId,
      username: session.username,
      sessionJwt: latestSessionJwtRef.current,
    });
  }, [session.userId, session.username, initializeForSession]);

  // Keep character sheet store JWT synced on 45-minute refresh
  useEffect(() => {
    updateSessionJwt(session.sessionJwt);
  }, [session.sessionJwt, updateSessionJwt]);

  const activeSeat = useMemo(
    () =>
      seats.find((s) => s.seatId === activeSeatId) ??
      seats[0] ?? {
        seatId: 'primary',
        playerName: session.username || 'Player',
        sheetId: null,
        syncCode: null,
        unboundTrackers: { ...DEFAULT_UNBOUND_TRACKERS },
      },
    [seats, activeSeatId, session.username]
  );

  const activeSheet = useMemo(
    () => (activeSeat.sheetId ? (sheetsById[activeSeat.sheetId] ?? null) : null),
    [activeSeat.sheetId, sheetsById]
  );

  const activeTrackers: LightGarouTrackers = useMemo(
    () => (activeSheet ? sheetToLightTrackers(activeSheet) : activeSeat.unboundTrackers),
    [activeSheet, activeSeat.unboundTrackers]
  );

  // Sync local seats & active sheet trackers to GameRoomDO whenever authenticated state changes
  const seatSyncPayload = useMemo(
    () => buildClientSeatSyncPayload({ seats, sheetsById }),
    [seats, sheetsById]
  );
  const seatSyncJson = useMemo(() => JSON.stringify(seatSyncPayload), [seatSyncPayload]);
  const lastSyncedSeatJsonRef = useRef<string | null>(null);

  useEffect(() => {
    if (connectionStatus !== 'authenticated') {
      lastSyncedSeatJsonRef.current = null;
      return;
    }
    if (lastSyncedSeatJsonRef.current === seatSyncJson) {
      return;
    }
    lastSyncedSeatJsonRef.current = seatSyncJson;
    sendCommand({ type: 'SYNC_CLIENT_SEATS', seats: seatSyncPayload });
  }, [connectionStatus, seatSyncJson, seatSyncPayload, sendCommand]);

  // Alt+1 .. Alt+9 hot-seat keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase();
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      const digit =
        event.key >= '1' && event.key <= '9'
          ? Number.parseInt(event.key, 10)
          : /^Digit([1-9])$/.test(event.code)
            ? Number.parseInt(event.code.slice(5), 10)
            : null;
      if (digit === null) return;

      const targetSeat = seats[digit - 1];
      if (targetSeat) {
        event.preventDefault();
        setActiveSeat(targetSeat.seatId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seats, setActiveSeat]);

  // Console state (independent per player)
  const [rollSourceMode, setRollSourceMode] = useState<RollSourceMode>('traits');
  const [manualPool, setManualPool] = useState(6);
  const [editingPool, setEditingPool] = useState(false);
  const [poolInputValue, setPoolInputValue] = useState('6');
  const [bonusDice, setBonusDice] = useState(0);
  const [rageDiceCount, setRageDiceCount] = useState(0);
  const [difficulty, setDifficulty] = useState(6);
  const [manualSpecialty, setManualSpecialty] = useState(false);
  const [specialtyOverride, setSpecialtyOverride] = useState<boolean | null>(null);
  const [spendWillpower, setSpendWillpower] = useState(false);
  const [manualApplyWounds, setManualApplyWounds] = useState(true);
  const [woundOverride, setWoundOverride] = useState<boolean | null>(null);
  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [rollLabel, setRollLabel] = useState('');
  const [manualControlsOpen, setManualControlsOpen] = useState(false);
  const [composerAttr, setComposerAttr] = useState<ComposerAttributeKey | ''>('dexterity');
  const [composerAbil, setComposerAbil] = useState('');

  // Arena & Drawer state
  const [packOpen, setPackOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isThrowing, setIsThrowing] = useState(false);
  const [hasDiceOnTable, setHasDiceOnTable] = useState(false);
  const [activeBanner, setActiveBanner] = useState<Queued3DRoll | null>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [sfxPrefs, setSfxPrefs] = useState<DiceSoundPreferences>(() =>
    diceSoundEngine.loadPreferences(session.userId)
  );

  useEffect(() => {
    setSfxPrefs(diceSoundEngine.loadPreferences(session.userId));
  }, [session.userId]);

  // Reset trait builder selection cleanly whenever switching seats or changing bound sheet
  const prevSeatOrSheetRef = useRef<{ seatId: string; sheetId: string | null }>({
    seatId: activeSeat.seatId,
    sheetId: activeSheet?.id ?? null,
  });

  useEffect(() => {
    const nextSheetId = activeSheet?.id ?? null;
    const prev = prevSeatOrSheetRef.current;
    if (prev.seatId !== activeSeat.seatId || prev.sheetId !== nextSheetId) {
      prevSeatOrSheetRef.current = { seatId: activeSeat.seatId, sheetId: nextSheetId };
      setRollSourceMode('traits');
      setComposerAttr(nextSheetId ? 'dexterity' : '');
      setComposerAbil('');
      setBonusDice(0);
      setSpecialtyOverride(null);
      setWoundOverride(null);
      setRollLabel('');
    }
  }, [activeSeat.seatId, activeSheet?.id]);

  // Live reactive sheet-driven pool & specialty derivation (tracks form shifts and sheet edits automatically)
  const isSheetTraitsMode = Boolean(activeSheet && rollSourceMode === 'traits');
  const traitSelection = useMemo(
    () =>
      activeSheet
        ? resolveTraitRollSelection({
            sheet: activeSheet,
            attribute: composerAttr,
            ability: composerAbil,
            bonusDice,
            difficulty,
            specialtyOverride,
            woundOverride,
          })
        : null,
    [
      activeSheet,
      composerAttr,
      composerAbil,
      bonusDice,
      difficulty,
      specialtyOverride,
      woundOverride,
    ]
  );

  const activeBasePool =
    isSheetTraitsMode && traitSelection ? traitSelection.basePool : manualPool;
  const activeHasSpecialty =
    isSheetTraitsMode && traitSelection
      ? traitSelection.effectiveHasSpecialty
      : manualSpecialty;
  const activeApplyWounds =
    isSheetTraitsMode && traitSelection
      ? traitSelection.effectiveApplyWounds
      : manualApplyWounds;
  const effectiveRollLabel =
    isSheetTraitsMode && traitSelection
      ? rollLabel.trim() || traitSelection.autoLabel
      : rollLabel;

  // Clear spendWillpower if temporary Willpower drops to 0
  useEffect(() => {
    if (activeTrackers.willpower <= 0 && spendWillpower) {
      setSpendWillpower(false);
    }
  }, [activeTrackers.willpower, spendWillpower]);

  // Close drawers automatically when transitioning into mobile layout
  const prevIsMobileRef = useRef(isMobile);
  useEffect(() => {
    if (!prevIsMobileRef.current && isMobile) {
      setFeedOpen(false);
      setPackOpen(false);
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile]);

  const arenaWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const readyRef = useRef(false);
  const localRollClientIdsRef = useRef<Set<string>>(new Set());
  const busyQueueIdRef = useRef<string | null>(null);

  useEffect(() => {
    setRageDiceCount((prev) => Math.min(prev, Math.max(0, activeBasePool)));
  }, [activeBasePool]);

  // Initialize full-stage @3d-dice/dice-box ONCE outside the isMobile branch
  useEffect(() => {
    let cancelled = false;
    const host = canvasHostRef.current;
    if (host) {
      host.innerHTML = '';
    }

    try {
      const box = new DiceBox({
        container: '#w20-dice-table-canvas',
        assetPath: '/assets/dice-box/',
        theme: 'default',
        offscreen: false,
        scale: typeof window !== 'undefined' && window.innerWidth < 640 ? 4.8 : 6,
        enableShadows: true,
        lightIntensity: 1.15,
        gravity: 2,
        throwForce: 6,
        spinForce: 5,
        onDieComplete: (dieResult: unknown) => {
          if (!dieResult || typeof dieResult !== 'object') {
            diceSoundEngine.playDieSettle();
            return;
          }
          const rec = dieResult as { value?: unknown; themeColor?: unknown };
          const rawVal = Number(rec.value);
          const val = Number.isFinite(rawVal)
            ? rawVal === 0
              ? 10
              : Math.round(rawVal)
            : undefined;
          diceSoundEngine.playDieSettle(val, rec.themeColor === '#991b1b');
        },
      });

      box
        .init()
        .then(() => {
          if (cancelled) return;
          boxRef.current = box;
          readyRef.current = true;
          setWebglReady(true);
          window.dispatchEvent(new Event('resize'));
        })
        .catch((err: unknown) => {
          console.warn('3D DiceBox unavailable; using authoritative CSPRNG mode.', err);
          readyRef.current = false;
          setWebglReady(false);
        });
    } catch (err: unknown) {
      console.warn('3D DiceBox initialization failed; using authoritative CSPRNG mode.', err);
      readyRef.current = false;
      setWebglReady(false);
    }

    return () => {
      cancelled = true;
      readyRef.current = false;
      setWebglReady(false);
      try {
        boxRef.current?.clear();
      } catch {
        // Ignore cleanup errors if WebGL context already tore down
      }
      boxRef.current = null;
      if (host) {
        host.innerHTML = '';
      }
    };
  }, []);

  // Resize canvas smoothly when arena changes width/height
  useEffect(() => {
    const wrapper = arenaWrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    });
    observer.observe(wrapper);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Sequential inbound DICE_ROLLED_3D handler
  const headRoll = diceQueue[0] ?? null;
  const headRollId = headRoll?.id ?? null;

  useEffect(() => {
    if (!headRoll || !headRollId || busyQueueIdRef.current === headRollId) {
      return;
    }

    if (headRoll.rollClientId && localRollClientIdsRef.current.has(headRoll.rollClientId)) {
      localRollClientIdsRef.current.delete(headRoll.rollClientId);
      setActiveBanner(headRoll);
      setHasDiceOnTable(headRoll.roll.effectivePool > 0 && readyRef.current);
      diceSoundEngine.playOutcomeAccent(headRoll.roll);
      dequeue3DRoll(headRoll.id);
      return;
    }

    let cancelled = false;
    busyQueueIdRef.current = headRollId;

    const animateRemoteRoll = async () => {
      const rageCount = headRoll.rageDiceCount ?? 0;
      const groups = buildDiceBoxGroups(headRoll.roll.effectivePool, rageCount);

      diceSoundEngine.playThrowCascade(headRoll.roll.effectivePool, rageCount);

      if (readyRef.current && boxRef.current && groups.length > 0) {
        try {
          await boxRef.current.roll(groups, {
            theme: 'default',
            newStartPoint: true,
          });
          diceSoundEngine.stopActiveRollCascade();
        } catch {
          // Fallback to banner if WebGL is throttled
        }
      } else if (readyRef.current && boxRef.current && groups.length === 0) {
        try {
          boxRef.current.clear();
        } catch {
          // Ignore clear errors
        }
      }

      if (cancelled) return;
      setHasDiceOnTable(groups.length > 0 && readyRef.current);
      setActiveBanner(headRoll);
      diceSoundEngine.playOutcomeAccent(headRoll.roll);
      busyQueueIdRef.current = null;
      dequeue3DRoll(headRoll.id);
    };

    void animateRemoteRoll();

    return () => {
      cancelled = true;
    };
  }, [headRollId, headRoll, dequeue3DRoll]);

  const updateTrackers = useCallback(
    (patch: Partial<LightGarouTrackers>) => {
      updateActiveSeatTrackers(patch);
      sendCommand({
        type: 'UPDATE_LIGHT_TRACKERS',
        trackers: patch,
        seatId: activeSeat.seatId,
        displayName: activeSeat.playerName,
        characterName: activeSheet ? activeSheet.name : null,
        activeForm: activeSheet ? activeSheet.activeForm : null,
      });
    },
    [
      updateActiveSeatTrackers,
      sendCommand,
      activeSeat.seatId,
      activeSeat.playerName,
      activeSheet,
    ]
  );

  const executeRoll = useCallback(
    async (overrides?: {
      pool?: number;
      rageDiceCount?: number;
      difficulty?: number;
      hasSpecialty?: boolean;
      spendWillpower?: boolean;
      applyWoundPenalty?: boolean;
      label?: string;
      isSecretRoll?: boolean;
    }) => {
      if (isThrowing || connectionStatus !== 'authenticated') return;

      const rawTargetPool = overrides?.pool ?? activeBasePool;
      if (rawTargetPool <= 0) return;
      const targetPool = Math.max(1, Math.min(30, Math.round(rawTargetPool)));
      const targetDiff = Math.max(2, Math.min(10, Math.round(overrides?.difficulty ?? difficulty)));
      const targetSpec = overrides?.hasSpecialty ?? activeHasSpecialty;
      const targetWp = overrides?.spendWillpower ?? spendWillpower;
      const targetApplyWounds = overrides?.applyWoundPenalty ?? activeApplyWounds;
      const targetSecret = overrides?.isSecretRoll ?? isSecretRoll;
      const targetLabel = (overrides?.label ?? effectiveRollLabel).trim();

      const woundMod = targetApplyWounds ? activeTrackers.woundPenalty : 0;
      const effectivePool = Math.max(0, targetPool + woundMod);
      const effectiveRage = Math.min(
        effectivePool,
        Math.max(0, overrides?.rageDiceCount ?? rageDiceCount)
      );

      const rollClientId = crypto.randomUUID();
      localRollClientIdsRef.current.add(rollClientId);

      setIsThrowing(true);
      let physicalDiceValues: number[] | undefined;

      diceSoundEngine.playThrowCascade(effectivePool, effectiveRage);

      try {
        const groups = buildDiceBoxGroups(effectivePool, effectiveRage);
        if (readyRef.current && boxRef.current && groups.length > 0) {
          const settled = await boxRef.current.roll(groups, {
            theme: 'default',
            newStartPoint: true,
          });
          diceSoundEngine.stopActiveRollCascade();
          physicalDiceValues = extractSettledDiceValues(settled, effectivePool);
          setHasDiceOnTable(true);
        } else if (readyRef.current && boxRef.current && groups.length === 0) {
          boxRef.current.clear();
          setHasDiceOnTable(false);
        }
      } catch {
        physicalDiceValues = undefined;
      } finally {
        setIsThrowing(false);
      }

      if (targetWp) {
        setSpendWillpower(false);
        spendActiveSeatWillpower();
      }

      const rollerDisplayName = activeSheet
        ? `${activeSheet.name} (${activeSeat.playerName})`
        : activeSeat.playerName;

      sendCommand({
        type: 'ROLL_TABLE_POOL',
        pool: targetPool,
        rageDiceCount: effectiveRage,
        difficulty: targetDiff,
        hasSpecialty: targetSpec,
        spendWillpower: targetWp,
        applyWoundPenalty: targetApplyWounds,
        ...(targetLabel ? { label: targetLabel } : {}),
        isSecretRoll: targetSecret,
        ...(physicalDiceValues ? { physicalDiceValues } : {}),
        rollClientId,
        seatId: activeSeat.seatId,
        rollerDisplayName,
      });
    },
    [
      isThrowing,
      connectionStatus,
      activeBasePool,
      difficulty,
      activeHasSpecialty,
      spendWillpower,
      activeApplyWounds,
      isSecretRoll,
      effectiveRollLabel,
      activeTrackers.woundPenalty,
      rageDiceCount,
      spendActiveSeatWillpower,
      activeSheet,
      activeSeat.playerName,
      activeSeat.seatId,
      sendCommand,
    ]
  );

  const initiativeMeta = useMemo(() => {
    const woundMod = activeApplyWounds ? activeTrackers.woundPenalty : 0;
    const sitMod = isSheetTraitsMode ? bonusDice : 0;
    if (activeSheet) {
      const stats = computeUserSheetStats(activeSheet);
      const dex = stats.effectiveAttributes.dexterity;
      const wits = stats.effectiveAttributes.wits;
      const modifier = dex + wits + woundMod + sitMod;
      const parts = [
        `1d10 + Dex ${dex} + Wits ${wits}`,
        woundMod !== 0 ? `${woundMod} Wnd` : '',
        sitMod !== 0 ? `${sitMod > 0 ? `+${sitMod}` : sitMod} Mod` : '',
      ].filter(Boolean);
      return {
        modifier,
        formula: parts.join(' '),
      };
    }
    const modifier = woundMod;
    return {
      modifier,
      formula:
        modifier === 0
          ? '1d10'
          : `1d10 ${modifier > 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`} Wnd`,
    };
  }, [activeSheet, activeApplyWounds, activeTrackers.woundPenalty, isSheetTraitsMode, bonusDice]);

  const executeInitiativeRoll = useCallback(
    async (overrides?: {
      initiativeModifier?: number;
      label?: string;
      isSecretRoll?: boolean;
    }) => {
      if (isThrowing || connectionStatus !== 'authenticated') return;

      const targetMod = overrides?.initiativeModifier ?? initiativeMeta.modifier;
      const targetSecret = overrides?.isSecretRoll ?? isSecretRoll;
      const targetLabel = (overrides?.label ?? 'Initiative').trim() || 'Initiative';

      const rollClientId = crypto.randomUUID();
      localRollClientIdsRef.current.add(rollClientId);

      setIsThrowing(true);
      let physicalDiceValues: number[] | undefined;

      diceSoundEngine.playThrowCascade(1, 0);

      try {
        const groups = buildDiceBoxGroups(1, 0);
        if (readyRef.current && boxRef.current && groups.length > 0) {
          const settled = await boxRef.current.roll(groups, {
            theme: 'default',
            newStartPoint: true,
          });
          diceSoundEngine.stopActiveRollCascade();
          physicalDiceValues = extractSettledDiceValues(settled, 1);
          setHasDiceOnTable(true);
        }
      } catch {
        physicalDiceValues = undefined;
      } finally {
        setIsThrowing(false);
      }

      const rollerDisplayName = activeSheet
        ? `${activeSheet.name} (${activeSeat.playerName})`
        : activeSeat.playerName;

      sendCommand({
        type: 'ROLL_TABLE_POOL',
        pool: 1,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: activeApplyWounds,
        rollMode: 'initiative',
        initiativeModifier: targetMod,
        label: targetLabel,
        isSecretRoll: targetSecret,
        ...(physicalDiceValues ? { physicalDiceValues } : {}),
        rollClientId,
        seatId: activeSeat.seatId,
        rollerDisplayName,
      });
    },
    [
      isThrowing,
      connectionStatus,
      initiativeMeta.modifier,
      isSecretRoll,
      activeSheet,
      activeSeat.playerName,
      activeSeat.seatId,
      activeApplyWounds,
      sendCommand,
    ]
  );

  const handleSetManualPool: React.Dispatch<React.SetStateAction<number>> = useCallback(
    (updater) => {
      setManualPool((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        return Math.max(1, Math.min(30, next));
      });
    },
    []
  );

  const handleSetBonusDice: React.Dispatch<React.SetStateAction<number>> = useCallback(
    (updater) => {
      setBonusDice((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        return Math.max(-15, Math.min(15, next));
      });
    },
    []
  );

  const handleSetRollSourceMode = useCallback((mode: RollSourceMode) => {
    setRollSourceMode(mode);
  }, []);

  const handleToggleSpecialty = useCallback(() => {
    if (isSheetTraitsMode && traitSelection) {
      setSpecialtyOverride((prev) => !(prev ?? traitSelection.autoSpecialty));
      return;
    }
    setManualSpecialty((v) => !v);
  }, [isSheetTraitsMode, traitSelection]);

  const handleToggleApplyWoundPenalty = useCallback(() => {
    if (isSheetTraitsMode && traitSelection) {
      setWoundOverride((prev) => !(prev ?? traitSelection.autoApplyWounds));
      return;
    }
    setManualApplyWounds((v) => !v);
  }, [isSheetTraitsMode, traitSelection]);

  const handleTriggerPreset = useCallback(
    (preset: QuickRollPreset) => {
      const nextRage = Math.min(preset.pool, preset.rageDiceCount);
      setManualPool(preset.pool);
      setRageDiceCount(nextRage);
      setDifficulty(preset.difficulty);
      setManualSpecialty(preset.hasSpecialty);
      setIsSecretRoll(preset.isSecretRoll);
      setRollLabel(preset.name);

      void executeRoll({
        pool: preset.pool,
        rageDiceCount: nextRage,
        difficulty: preset.difficulty,
        hasSpecialty: preset.hasSpecialty,
        spendWillpower: false,
        applyWoundPenalty: manualApplyWounds,
        label: preset.name,
        isSecretRoll: preset.isSecretRoll,
      });
    },
    [manualApplyWounds, executeRoll]
  );

  const handleTriggerResolvedShortcut = useCallback(
    (resolved: ResolvedSheetShortcut) => {
      const nextRage = Math.min(resolved.basePool, resolved.rageDiceCount);
      const src = resolved.shortcut.source;
      if (src.kind === 'trait_combo' && activeSheet) {
        const attr = src.attribute ?? '';
        const abil = src.ability ?? '';
        const flatMod = src.flatModifier ?? 0;
        const autoBaseline = resolveTraitRollSelection({
          sheet: activeSheet,
          attribute: attr,
          ability: abil,
          bonusDice: flatMod,
          difficulty: resolved.difficulty,
          specialtyOverride: null,
          woundOverride: null,
        });
        setRollSourceMode('traits');
        setComposerAttr(attr);
        setComposerAbil(abil);
        setBonusDice(flatMod);
        setDifficulty(resolved.difficulty);
        setRageDiceCount(nextRage);
        setSpecialtyOverride(
          resolved.hasSpecialty !== autoBaseline.autoSpecialty ? resolved.hasSpecialty : null
        );
        setWoundOverride(
          resolved.applyWoundPenalty !== autoBaseline.autoApplyWounds
            ? resolved.applyWoundPenalty
            : null
        );
        setIsSecretRoll(resolved.isSecretRoll);
        setRollLabel('');
      } else {
        setManualPool(Math.max(1, Math.min(30, resolved.basePool)));
      }

      void executeRoll({
        pool: resolved.basePool,
        rageDiceCount: nextRage,
        difficulty: resolved.difficulty,
        hasSpecialty: resolved.hasSpecialty,
        spendWillpower: false,
        applyWoundPenalty: resolved.applyWoundPenalty,
        label: resolved.label,
        isSecretRoll: resolved.isSecretRoll,
      });
    },
    [activeSheet, executeRoll]
  );

  const handleRollFromSheet = useCallback(
    (req: SheetRollRequest) => {
      setSheetModalOpen(false);
      if (req.rollMode === 'initiative') {
        void executeInitiativeRoll({
          initiativeModifier: req.initiativeModifier,
          label: req.label,
          isSecretRoll: req.isSecretRoll ?? false,
        });
        return;
      }

      const nextRage = Math.min(req.pool, req.rageDiceCount ?? 0);
      if (!isSheetTraitsMode) {
        setManualPool(Math.max(1, Math.min(30, req.pool)));
        setRageDiceCount(nextRage);
        setDifficulty(req.difficulty);
        setManualSpecialty(req.hasSpecialty);
        setManualApplyWounds(req.applyWoundPenalty);
        setIsSecretRoll(req.isSecretRoll ?? false);
        setRollLabel(req.label);
      }

      void executeRoll({
        pool: req.pool,
        rageDiceCount: nextRage,
        difficulty: req.difficulty,
        hasSpecialty: req.hasSpecialty,
        spendWillpower: false,
        applyWoundPenalty: req.applyWoundPenalty,
        label: req.label,
        isSecretRoll: req.isSecretRoll ?? false,
      });
    },
    [executeInitiativeRoll, executeRoll, isSheetTraitsMode, setSheetModalOpen]
  );

  const handleRerollFromHistory = useCallback(
    (entry: RollHistoryEntry) => {
      if (entry.roll.rollMode === 'initiative') {
        void executeInitiativeRoll({
          initiativeModifier: entry.roll.initiativeModifier ?? 0,
          label: entry.label,
          isSecretRoll: entry.isSecretRoll,
        });
        return;
      }

      const targetPool = Math.max(1, entry.roll.effectivePool);
      const targetRage = Math.min(targetPool, Math.max(0, entry.rageDiceCount));
      const targetDiff = entry.roll.clampedDifficulty;
      const usedSpecialty = entry.roll.dice.some(
        (d) => d.contributedSuccesses === 2 || d.isBonusExplosionDie
      );
      if (!isSheetTraitsMode) {
        setManualPool(targetPool);
        setRageDiceCount(targetRage);
        setDifficulty(targetDiff);
        setManualSpecialty(usedSpecialty);
        setManualApplyWounds(false);
        setIsSecretRoll(entry.isSecretRoll);
        setRollLabel(entry.label);
      }

      void executeRoll({
        pool: targetPool,
        rageDiceCount: targetRage,
        difficulty: targetDiff,
        hasSpecialty: usedSpecialty,
        spendWillpower: false,
        applyWoundPenalty: false,
        label: entry.label,
        isSecretRoll: entry.isSecretRoll,
      });
    },
    [executeInitiativeRoll, executeRoll, isSheetTraitsMode]
  );

  const handleClearTable = useCallback(() => {
    diceSoundEngine.stopActiveRollCascade();
    try {
      boxRef.current?.clear();
    } catch {
      // Ignore WebGL clear errors
    }
    setHasDiceOnTable(false);
    setActiveBanner(null);
  }, []);

  const handleToggleMuteSfx = useCallback(() => {
    diceSoundEngine.unlock();
    setSfxPrefs((prev) => {
      const next: DiceSoundPreferences = {
        muted: !prev.muted,
        volume: prev.volume > 0 ? prev.volume : 0.75,
      };
      diceSoundEngine.savePreferences(session.userId, next);
      return next;
    });
  }, [session.userId]);

  const handleSfxVolumeChange = useCallback(
    (pct: number) => {
      const volume = Math.max(0, Math.min(1, pct / 100));
      if (volume > 0) {
        diceSoundEngine.unlock();
      }
      const next: DiceSoundPreferences = {
        muted: volume === 0,
        volume,
      };
      diceSoundEngine.savePreferences(session.userId, next);
      setSfxPrefs(next);
    },
    [session.userId]
  );

  const commitPoolInput = useCallback(() => {
    const parsed = Number.parseInt(poolInputValue, 10);
    if (Number.isFinite(parsed)) {
      setManualPool(Math.max(1, Math.min(30, parsed)));
    }
    setEditingPool(false);
  }, [poolInputValue]);

  const handleAddSeatAndOpenRoster = useCallback(() => {
    const newSeatId = addSeat();
    if (newSeatId) {
      setActiveSeat(newSeatId);
    }
    setRosterModalOpen(true);
  }, [addSeat, setActiveSeat, setRosterModalOpen]);

  const handleComposerChange = useCallback(
    (attr: ComposerAttributeKey | '', abil: string) => {
      setComposerAttr(attr);
      setComposerAbil(abil);
      setSpecialtyOverride(null);
      setWoundOverride(null);
      setRollLabel('');
    },
    []
  );

  const handlePinComposerShortcut = useCallback(() => {
    if (!activeSheet || (!composerAttr && !composerAbil)) return;
    const autoSpecialty = traitSelection?.autoSpecialty ?? false;

    const shortcut: SheetShortcut = {
      id: `sc-${crypto.randomUUID().slice(0, 8)}`,
      name: (
        rollLabel.trim() ||
        traitSelection?.autoLabel ||
        `Pool ${activeBasePool}d10`
      ).slice(0, 48),
      source: {
        kind: 'trait_combo',
        attribute: composerAttr || null,
        ability: composerAbil || null,
        useFormStats: true,
        applyPerceptionFormDiff: false,
        ...(bonusDice !== 0 ? { flatModifier: bonusDice } : {}),
      },
      difficulty,
      rageDiceCount,
      applyWoundPenalty: activeApplyWounds,
      ...(activeHasSpecialty && !autoSpecialty ? { forceSpecialty: true } : {}),
      isSecretRoll,
    };
    pinShortcutToActiveSheet(shortcut);
  }, [
    activeSheet,
    composerAttr,
    composerAbil,
    traitSelection,
    rollLabel,
    activeBasePool,
    bonusDice,
    difficulty,
    rageDiceCount,
    activeApplyWounds,
    activeHasSpecialty,
    isSecretRoll,
    pinShortcutToActiveSheet,
  ]);

  const handlePinCurrentToSheet = useCallback(() => {
    if (!activeSheet) return;
    if (rollSourceMode === 'traits' && (composerAttr || composerAbil)) {
      handlePinComposerShortcut();
      return;
    }

    const staticPool = Math.max(1, Math.min(30, activeBasePool));
    const shortcut: SheetShortcut = {
      id: `sc-${crypto.randomUUID().slice(0, 8)}`,
      name: (rollLabel.trim() || `Pool ${staticPool}d10`).slice(0, 48),
      source: {
        kind: 'static',
        pool: staticPool,
      },
      difficulty,
      rageDiceCount,
      applyWoundPenalty: activeApplyWounds,
      ...(activeHasSpecialty ? { forceSpecialty: true } : {}),
      isSecretRoll,
    };
    pinShortcutToActiveSheet(shortcut);
  }, [
    activeSheet,
    rollSourceMode,
    composerAttr,
    composerAbil,
    handlePinComposerShortcut,
    rollLabel,
    activeBasePool,
    difficulty,
    rageDiceCount,
    activeApplyWounds,
    activeHasSpecialty,
    isSecretRoll,
    pinShortcutToActiveSheet,
  ]);

  const handleSaveCurrentUnboundPreset = useCallback(() => {
    useUnboundQuickRollStore.getState().addPreset(session.userId, activeSeat.seatId, {
      name: (rollLabel.trim() || `Pool ${manualPool}d10`).slice(0, 32),
      pool: manualPool,
      rageDiceCount,
      difficulty,
      hasSpecialty: manualSpecialty,
      isSecretRoll,
    });
  }, [
    session.userId,
    activeSeat.seatId,
    rollLabel,
    manualPool,
    rageDiceCount,
    difficulty,
    manualSpecialty,
    isSecretRoll,
  ]);

  const sortedParticipants = useMemo(() => {
    const base: TableParticipant[] =
      participants.length > 0
        ? participants
        : seats.map((seat) => {
            const seatSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
            return {
              participantKey:
                seat.seatId === 'primary'
                  ? session.userId
                  : `${session.userId}::${seat.seatId}`,
              seatId: seat.seatId,
              discordUserId: session.userId,
              displayName: seat.playerName || session.username,
              characterName: seatSheet ? seatSheet.name : null,
              activeForm: seatSheet ? seatSheet.activeForm : null,
              avatarUrl: seat.seatId === 'primary' ? session.avatarUrl : null,
              isConnected: connectionStatus === 'authenticated',
              trackers: seatSheet ? sheetToLightTrackers(seatSheet) : seat.unboundTrackers,
            };
          });

    return [...base].sort((a, b) => {
      if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
      if (a.discordUserId === session.userId && b.discordUserId !== session.userId) return -1;
      if (b.discordUserId === session.userId && a.discordUserId !== session.userId) return 1;
      if (a.discordUserId === session.userId && b.discordUserId === session.userId) {
        if (a.seatId === activeSeat.seatId && b.seatId !== activeSeat.seatId) return -1;
        if (b.seatId === activeSeat.seatId && a.seatId !== activeSeat.seatId) return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    participants,
    seats,
    sheetsById,
    session.userId,
    session.username,
    session.avatarUrl,
    connectionStatus,
    activeSeat.seatId,
  ]);

  const effectivePreviewPool = Math.max(
    0,
    activeBasePool + (activeApplyWounds ? activeTrackers.woundPenalty : 0)
  );
  const clampedPreviewRage = Math.min(effectivePreviewPool, rageDiceCount);
  const obsidianPreviewCount = Math.max(0, effectivePreviewPool - clampedPreviewRage);

  const activeModifierCount =
    (isSheetTraitsMode && bonusDice !== 0 ? 1 : 0) +
    (rageDiceCount > 0 ? 1 : 0) +
    (isSheetTraitsMode
      ? specialtyOverride !== null && specialtyOverride !== traitSelection?.autoSpecialty
        ? 1
        : 0
      : manualSpecialty
        ? 1
        : 0) +
    (spendWillpower ? 1 : 0) +
    (!activeApplyWounds ? 1 : 0) +
    (isSecretRoll ? 1 : 0);

  const hudProps: DiceTableHudProps = {
    session,
    connectionStatus,
    lastError,
    webglReady,
    sortedParticipants,
    speakingDiscordIds,
    seats,
    activeSeat,
    activeSheet,
    sheetsById,
    activeTrackers,
    rollHistoryCount: rollHistory.length,
    feedOpen,
    packOpen,
    hasDiceOnTable,
    activeBanner,
    sfxPrefs,
    layoutMode,
    rollSourceMode,
    pool: activeBasePool,
    editingPool,
    poolInputValue,
    bonusDice,
    rageDiceCount,
    difficulty,
    hasSpecialty: activeHasSpecialty,
    isAutoSpecialty: Boolean(isSheetTraitsMode && traitSelection?.autoSpecialty),
    specialtyReason: isSheetTraitsMode ? traitSelection?.specialtyReason : undefined,
    perceptionFormMod: isSheetTraitsMode ? (traitSelection?.perceptionFormMod ?? 0) : 0,
    untrainedHint: isSheetTraitsMode ? traitSelection?.untrainedHint : undefined,
    compactTraitFormula: isSheetTraitsMode ? (traitSelection?.compactFormula ?? '') : '',
    hasTraitSelection: Boolean(traitSelection?.hasSelection),
    traitSelection,
    spendWillpower,
    applyWoundPenalty: activeApplyWounds,
    isSecretRoll,
    rollLabel,
    effectiveRollLabel,
    manualControlsOpen,
    isThrowing,
    effectivePreviewPool,
    clampedPreviewRage,
    obsidianPreviewCount,
    activeModifierCount,
    composerAttr,
    composerAbil,
    onCycleLayoutMode: cycleMode,
    onToggleFeed: () => setFeedOpen((v) => !v),
    onCloseFeed: () => setFeedOpen(false),
    onTogglePack: () => setPackOpen((v) => !v),
    onClearTable: handleClearTable,
    onDismissBanner: () => setActiveBanner(null),
    onToggleMuteSfx: handleToggleMuteSfx,
    onSfxVolumeChange: handleSfxVolumeChange,
    onUpdateTrackers: updateTrackers,
    onSelectSeat: setActiveSeat,
    onAddSeatAndOpenRoster: handleAddSeatAndOpenRoster,
    onOpenRoster: () => setRosterModalOpen(true),
    onOpenSheet: () => setSheetModalOpen(true),
    onSetActiveSheetForm: setActiveSheetForm,
    onSetRollSourceMode: handleSetRollSourceMode,
    onSetPool: handleSetManualPool,
    onSetEditingPool: setEditingPool,
    onSetPoolInputValue: setPoolInputValue,
    onCommitPoolInput: commitPoolInput,
    onSetBonusDice: handleSetBonusDice,
    onSetRageDiceCount: setRageDiceCount,
    onSetDifficulty: setDifficulty,
    onToggleSpecialty: handleToggleSpecialty,
    onToggleSpendWillpower: () => setSpendWillpower((v) => !v),
    onToggleApplyWoundPenalty: handleToggleApplyWoundPenalty,
    onToggleSecretRoll: () => setIsSecretRoll((v) => !v),
    onSetRollLabel: setRollLabel,
    onSetManualControlsOpen: setManualControlsOpen,
    onExecuteRoll: () => void executeRoll(),
    initiativeModifier: initiativeMeta.modifier,
    initiativeFormula: initiativeMeta.formula,
    onRollInitiative: () => void executeInitiativeRoll(),
    onTriggerPreset: handleTriggerPreset,
    onTriggerResolvedShortcut: handleTriggerResolvedShortcut,
    onRemoveSheetShortcut: removeShortcutFromActiveSheet,
    onComposerChange: handleComposerChange,
    onPinComposerShortcut: handlePinComposerShortcut,
    onPinCurrentToSheet: handlePinCurrentToSheet,
    onSaveCurrentUnboundPreset: handleSaveCurrentUnboundPreset,
  };

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-[#070609] text-stone-100 select-none">
      {/* Collapsible Pack & Table Presence Drawer (Docked Left Drawer on PC) */}
      {!isMobile && (
        <PackPresenceDrawer
          open={packOpen}
          currentUserId={session.userId}
          sortedParticipants={sortedParticipants}
          speakingDiscordIds={speakingDiscordIds}
          seats={seats}
          activeSeatId={activeSeat.seatId}
          sheetsById={sheetsById}
          onClose={() => setPackOpen(false)}
          onSelectSeat={setActiveSeat}
          onOpenSheet={() => setSheetModalOpen(true)}
          onOpenRoster={() => setRosterModalOpen(true)}
          onAddSeatAndOpenRoster={handleAddSeatAndOpenRoster}
        />
      )}

      {/* Main Full-Height 3D Felt Stage */}
      <div
        ref={arenaWrapperRef}
        className="relative h-full min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.22)_0%,_rgba(12,10,16,0.97)_66%,_#060508_100%)]"
      >
        {/* Subtle Umbral Felt Framing & Antique Bronze Corner Brackets */}
        <div className="pointer-events-none absolute inset-3 rounded-3xl border border-amber-500/15 shadow-[inset_0_0_95px_rgba(0,0,0,0.85)]" />
        <div className="pointer-events-none absolute top-4 left-4 h-5 w-5 rounded-tl-lg border-t-2 border-l-2 border-amber-500/40" />
        <div className="pointer-events-none absolute top-4 right-4 h-5 w-5 rounded-tr-lg border-t-2 border-r-2 border-amber-500/40" />
        <div className="pointer-events-none absolute bottom-4 left-4 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-amber-500/40" />
        <div className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-amber-500/40" />

        {/* Single Etched Garou Moon-Phase & Auspice Medallion */}
        <GarouFeltMedallion />

        {/* Idle Prompt */}
        {!activeBanner && !hasDiceOnTable && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 pb-24 text-center opacity-55">
            <p className="font-display text-xs font-bold tracking-[0.28em] uppercase text-amber-200/80">
              Garou Umbral Felt
            </p>
            <p className="mt-1.5 text-[11px] text-stone-400">
              {activeSheet
                ? `Pick an Attribute + Skill and Difficulty below to roll from ${activeSheet.name}'s sheet`
                : 'Select a Garou sheet below to roll by Attribute + Skill, or dial a raw d10 pool'}
            </p>
          </div>
        )}

        {/* Single Full-Stage @3d-dice/dice-box Physics Canvas (never unmounted on layout toggle) */}
        <div
          id="w20-dice-table-canvas"
          ref={canvasHostRef}
          className="pointer-events-none absolute inset-0 h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
        />

        {/* Separate Mobile vs PC HUD */}
        {isMobile ? (
          <MobileDiceTableHud {...hudProps} />
        ) : (
          <DesktopDiceTableHud {...hudProps} />
        )}
      </div>

      {/* Collapsible Chronicle of Rolls (Bottom Sheet on Mobile, Docked Right Drawer on PC) */}
      <RollFeedDrawer
        open={feedOpen}
        mobileSheet={isMobile}
        rollHistory={rollHistory}
        disabled={isThrowing || connectionStatus !== 'authenticated'}
        onClose={() => setFeedOpen(false)}
        onReroll={handleRerollFromHistory}
      />

      {/* Single-Instance Roster & Interactive W20 Sheet Modals mounted outside isMobile branch */}
      <CharacterRosterModal session={session} />
      <W20InteractiveSheetModal onRollFromSheet={handleRollFromSheet} />
    </div>
  );
};
