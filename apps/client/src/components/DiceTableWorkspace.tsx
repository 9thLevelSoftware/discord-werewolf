import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import {
  computeUserSheetStats,
  resolveSheetShortcut,
  getSourceModifierRule,
  type RuleContext,
  type ResolvedSheetShortcut,
  type SheetShortcut,
  type SpecialtyMode,
  sheetToLightTrackers,
} from '@w20-vtt/core';
import type { LightGarouTrackers, RollHistoryEntry, RollReplacementOption, TableParticipant } from '@w20-vtt/protocol';
import { diceSoundEngine, type DiceSoundPreferences } from '../audio/DiceSoundEngine';
import type { DiscordSessionContext } from '../discordBootstrap';
import { useViewportLayout, VIEWPORT_BREAKPOINTS } from '../hooks/useViewportLayout';
import {
  buildClientSeatSyncPayload,
  DEFAULT_UNBOUND_TRACKERS,
  type SheetRollRequest,
  useCharacterSheetStore,
} from '../store/useCharacterSheetStore';
import {
  type ConnectionStatus,
  type Queued3DRoll,
  useVttRoomStore,
} from '../store/useVttRoomStore';
import { CharacterRosterModal } from './character-sheet/CharacterRosterModal';
import { W20InteractiveSheetModal } from './character-sheet/W20InteractiveSheetModal';
import { DesktopDiceTableHud } from './dice-table/DesktopDiceTableHud';
import { MobileDiceTableHud } from './dice-table/MobileDiceTableHud';
import {
  type DiceTableHudProps,
  type QuickRollPreset,
  useUnboundQuickRollStore,
} from './dice-table/QuickRollBar';
import {
  type ComposerAttributeKey,
  resolveTraitRollSelection,
  type RollSourceMode,
} from './dice-table/TraitRollBuilder';
import {
  type LocalQueuedRollSpec,
  MAX_LOCAL_QUEUED_ROLLS,
  RollStageCoordinator,
  type RollStageStatus,
  DICE_FORCE_FREEZE_MS,
  SafeDiceBoxController,
  isRageDieThemeColor,
} from './dice-table/rollQueueController';
import { PackPresenceDrawer } from './dice-table/PackPresenceDrawer';
import { Button, cx, Modal, toast, useToasts } from './ui';
import { useUiPref } from '../store/useUiPrefsStore';
import { openSheetRule, useRuleTargetOptions } from './character-sheet/sheetShared';
import {
  RuleRollReview,
  actionableFacts,
  getRollReserves,
  canResolveWithoutDice,
  type RollPreview,
} from './dice-table/RuleRollReview';
import { RollFeedDrawer } from './dice-table/RollFeedDrawer';
import { RollReplacementActions } from './dice-table/RollReplacementActions';
import { AuthoritativeDieChips } from './dice-table/DieFaceTiles';

type RollOptions = Partial<SheetRollRequest> & {
  spendWillpower?: boolean;
  ruleContext?: RuleContext;
  preview?: RollPreview;
};
interface PendingRuleRoll {
  options: RollOptions;
  shortcut: SheetShortcut;
  context: RuleContext;
  sheetId: string;
  seatId: string;
}

interface DiceTableWorkspaceProps {
  session: DiscordSessionContext;
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

const QUEUE_FULL_MESSAGE = `Too many rolls waiting (${MAX_LOCAL_QUEUED_ROLLS}). Let the dice settle, then roll again.`;

const NO_3D_DICE_MESSAGE =
  '3D dice are not available on this device. Rolls still work and show as numbers.';

function notConnectedMessage(status: ConnectionStatus): string {
  if (status === 'session_expired') return 'Your session has expired. Rejoin to roll.';
  if (status === 'connecting') return 'Still connecting to the table. Try again in a moment.';
  return 'Not connected to the table, so the roll was not sent.';
}

export const DiceTableWorkspace: React.FC<DiceTableWorkspaceProps> = ({ session }) => {
  const { isMobile, mode: layoutMode, cycleMode } = useViewportLayout();

  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);
  const lastError = useVttRoomStore((s) => s.lastError);
  const tableInitiative = useVttRoomStore((s) => s.tableInitiative);
  const clearTableInitiative = useVttRoomStore((s) => s.clearTableInitiative);

  // Show each server rejection once as a toast, then clear it.
  useEffect(() => {
    if (!lastError) return;
    coordinatorRef.current?.notifyCommandRejected();
    useToasts.getState().push({ id: 'room-error', tone: 'error', message: lastError.message });
    useVttRoomStore.getState().clearLastError();
  }, [lastError]);
  const participants = useVttRoomStore((s) => s.participants);
  const speakingDiscordIds = useVttRoomStore((s) => s.speakingDiscordIds);
  const rollHistory = useVttRoomStore((s) => s.rollHistory);
  const replacementOptions = useVttRoomStore((s) => s.ruleState?.rerollOptions) ?? [];
  const pendingActivations = useVttRoomStore((s) => s.ruleState?.pendingActivations) ?? [];
  const [deferredChoiceIds, setDeferredChoiceIds] = useState<string[]>([]);
  const diceQueue = useVttRoomStore((s) => s.diceQueue);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const specialtyMode = useVttRoomStore((s) => s.specialtyMode);
  const canChangeSpecialtyMode =
    connectionStatus === 'authenticated' &&
    participants.some((seat) => seat.discordUserId === session.userId && seat.isConnected);

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

  const hasRuleTargets = useRuleTargetOptions().some((p) => p.id !== activeSheet?.id);
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

  const lastBindings = useRef(new Map<string, string>());
  useEffect(() => {
    if (connectionStatus !== 'authenticated') {
      lastBindings.current.clear();
      return;
    }
    for (const seat of seats) {
      const sheet = seat.sheetId ? (sheetsById[seat.sheetId] ?? null) : null;
      const fingerprint = JSON.stringify([sheet, seat.syncCode]);
      if (lastBindings.current.get(seat.seatId) === fingerprint) continue;
      lastBindings.current.set(seat.seatId, fingerprint);
      sendCommand({
        type: 'BIND_TABLE_SHEET',
        seatId: seat.seatId,
        sheet,
        ...(seat.syncCode ? { syncCode: seat.syncCode } : {}),
      });
    }
    for (const key of lastBindings.current.keys()) {
      if (!seats.some((seat) => seat.seatId === key)) {
        sendCommand({ type: 'BIND_TABLE_SHEET', seatId: key, sheet: null });
        lastBindings.current.delete(key);
      }
    }
  }, [connectionStatus, seats, sheetsById, sendCommand]);
  const [review, setReview] = useState<PendingRuleRoll | null>(null);
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
  const [reviewTarget, setReviewTarget] = useState(false);
  const [spendPackWillpower, setSpendPackWillpower] = useState(false);
  const packPools = useVttRoomStore((s) => s.ruleState?.packPools);
  const activePack = packPools?.[activeSheet?.packName.trim().toLowerCase() ?? ''];
  const [spendWillpower, setSpendWillpower] = useState(false);
  const [manualApplyWounds, setManualApplyWounds] = useState(true);
  const [woundOverride, setWoundOverride] = useState<boolean | null>(null);
  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [rollLabel, setRollLabel] = useState('');
  const [manualControlsOpen, setManualControlsOpen] = useUiPref('modifiersOpen');
  const [composerAttr, setComposerAttr] = useState<ComposerAttributeKey | ''>('dexterity');
  const [composerAbil, setComposerAbil] = useState('');

  // Arena & Drawer state
  // Desktop drawers are remembered between sessions. The mobile roll log is a
  // transient sheet, so it keeps its own state and never overwrites the desktop choice.
  const [packOpen, setPackOpen] = useUiPref('packOpen');
  const [desktopFeedPref, setDesktopFeedPref] = useUiPref('feedOpen');
  const [mobileFeedOpen, setMobileFeedOpen] = useState(false);
  const desktopFeedOpen =
    desktopFeedPref ??
    (typeof window !== 'undefined'
      ? window.innerWidth >= VIEWPORT_BREAKPOINTS.dockedDrawersMinWidth
      : true);
  const feedOpen = isMobile ? mobileFeedOpen : desktopFeedOpen;
  const setFeedOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (isMobile) {
        setMobileFeedOpen(next);
        return;
      }
      setDesktopFeedPref((prev) => {
        const current =
          prev ??
          (typeof window !== 'undefined'
            ? window.innerWidth >= VIEWPORT_BREAKPOINTS.dockedDrawersMinWidth
            : true);
        return typeof next === 'function' ? next(current) : next;
      });
    },
    [isMobile, setDesktopFeedPref]
  );
  const [rollStageStatus, setRollStageStatus] = useState<RollStageStatus>({
    isRolling: false,
    activeThrowLabel: null,
    queuedCount: 0,
    nextQueuedLabel: null,
    localPendingCount: 0,
  });
  const isThrowing = rollStageStatus.localPendingCount > 0;
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
      // Entering the mobile layout starts with its roll log sheet closed.
      setMobileFeedOpen(false);
    }
    prevIsMobileRef.current = isMobile;
  }, [isMobile]);

  const arenaWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const safeDiceBoxRef = useRef<SafeDiceBoxController | null>(null);
  if (!safeDiceBoxRef.current) {
    safeDiceBoxRef.current = new SafeDiceBoxController();
  }
  const coordinatorRef = useRef<RollStageCoordinator | null>(null);

  useEffect(() => {
    setRageDiceCount((prev) => Math.min(prev, Math.max(0, activeBasePool)));
  }, [activeBasePool]);

  // Mount single-flight RollStageCoordinator & flush unsent queued rolls on pagehide/unmount
  useEffect(() => {
    const safeBox = safeDiceBoxRef.current!;
    const coordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => useVttRoomStore.getState().diceQueue,
      dequeueRemoteRoll: (id) => useVttRoomStore.getState().dequeue3DRoll(id),
      consumeRemoteRollByClientId: (clientId) =>
        useVttRoomStore.getState().consume3DRollByClientId(clientId),
      onSendRollCommand: (spec: LocalQueuedRollSpec, physicalDiceValues, physicalBonusWaves) => {
        useVttRoomStore.getState().sendCommand({
          type: 'ROLL_TABLE_POOL',
          pool: spec.pool,
          sheetId: spec.sheetId,
          willpowerSource: spec.willpowerSource,
          shortcut: spec.shortcut,
          ruleContext: spec.ruleContext,
          initiativeAdjustment: spec.initiativeAdjustment,
          rageDiceCount: spec.rageDiceCount,
          difficulty: spec.difficulty,
          hasSpecialty: spec.hasSpecialty,
          spendWillpower: spec.spendWillpower,
          applyWoundPenalty: spec.applyWoundPenalty,
          ...(spec.rollMode === 'initiative'
            ? {
                rollMode: 'initiative' as const,
                ...(spec.initiativeModifier !== undefined
                  ? { initiativeModifier: spec.initiativeModifier }
                  : {}),
              }
            : {}),
          ...(spec.label ? { label: spec.label } : {}),
          isSecretRoll: spec.isSecretRoll,
          ...(physicalDiceValues ? { physicalDiceValues } : {}),
          ...(physicalBonusWaves ? { physicalBonusWaves } : {}),
          rollClientId: spec.rollClientId,
          seatId: spec.seatId,
          rollerDisplayName: spec.rollerDisplayName,
        });
      },
      onSetBanner: (banner) => setActiveBanner(banner),
      onSetHasDiceOnTable: (hasDice) => setHasDiceOnTable(hasDice),
      onPlayThrowSound: (effectivePool, rageCount) =>
        diceSoundEngine.playThrowCascade(effectivePool, rageCount),
      onStopThrowSound: () => diceSoundEngine.stopActiveRollCascade(),
      onPlayOutcomeSound: (roll) => diceSoundEngine.playOutcomeAccent(roll),
      onStatusChange: (status) => setRollStageStatus(status),
      onLocalRollUnconfirmed: (spec, reason) => {
        if (reason === 'rejected') {
          // The rejection message itself is shown from the room store's lastError.
          if (spec.spendWillpower && !spec.sheetId) {
            useCharacterSheetStore.getState().refundSeatWillpower(spec.seatId);
            toast.info('That roll was rejected, so your Willpower point was returned.');
          }
          return;
        }
        toast.info(
          `The table did not confirm "${spec.label}". It may still appear in the roll log.`
        );
      },
    });

    coordinatorRef.current = coordinator;

    const handlePageHide = () => {
      coordinator.flushUnsentLocalRolls();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, []);

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
        scale:
          typeof window !== 'undefined' &&
          window.innerWidth < VIEWPORT_BREAKPOINTS.smallDiceMaxWidth
            ? 4.8
            : 6,
        enableShadows: true,
        lightIntensity: 1.15,
        gravity: 2,
        throwForce: 6,
        spinForce: 5,
        settleTimeout: DICE_FORCE_FREEZE_MS,
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
          diceSoundEngine.playDieSettle(val, isRageDieThemeColor(rec.themeColor));
        },
      });

      box
        .init()
        .then(() => {
          if (cancelled) {
            try {
              box.clear();
            } catch {
              // Ignore teardown error
            }
            return;
          }
          // dice-box can initialize with a random-number fallback and no physics canvas.
          if (!host?.querySelector('canvas')) {
            toast.info(NO_3D_DICE_MESSAGE);
            return;
          }
          safeDiceBoxRef.current?.setBox(box, true);
          setWebglReady(true);
          window.dispatchEvent(new Event('resize'));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.warn('3D DiceBox unavailable; using authoritative CSPRNG mode.', err);
          toast.info(NO_3D_DICE_MESSAGE);
          safeDiceBoxRef.current?.setBox(null, false);
          setWebglReady(false);
        });
    } catch (err: unknown) {
      console.warn('3D DiceBox initialization failed; using authoritative CSPRNG mode.', err);
      toast.info(NO_3D_DICE_MESSAGE);
      safeDiceBoxRef.current?.setBox(null, false);
      setWebglReady(false);
    }

    return () => {
      cancelled = true;
      safeDiceBoxRef.current?.setBox(null, false);
      setWebglReady(false);
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

  // Notify stage coordinator whenever remote DICE_ROLLED_3D events arrive
  useEffect(() => {
    coordinatorRef.current?.notifyInboundQueueChanged();
  }, [diceQueue]);

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
    (overrides?: RollOptions) => {
      if (
        connectionStatus !== 'authenticated' &&
        connectionStatus !== 'reconnecting'
      ) {
        toast.error(notConnectedMessage(connectionStatus));
        return;
      }

      const shortcut =
        overrides?.shortcut ??
        (!overrides && isSheetTraitsMode ? traitSelection?.shortcut : undefined);
      const context: RuleContext =
        overrides?.ruleContext ??
        (!overrides
          ? {
              ...(specialtyOverride !== null && { specialtyOverride }),
              ...(woundOverride !== null && { woundOverride }),
            }
          : {});
      const local =
        shortcut && activeSheet ? resolveSheetShortcut(activeSheet, shortcut, context) : undefined;
      if (shortcut && activeSheet && local && !overrides?.preview) {
        const facts = actionableFacts(local.pending.flatMap((item) => item.reasons));
        if (
          (overrides && shortcut.forceSpecialty === undefined && local.hasEligibleNamedSpecialty) ||
          facts.length ||
          getRollReserves(activeSheet).length ||
          (hasRuleTargets &&
            (reviewTarget ||
              ['attack', 'damage', 'defense'].includes(local.context.rollKind ?? '') ||
              activeSheet.activeRuleEffects?.some((effect) => effect.boundTargetIds?.length)))
        ) {
          setReview({
            shortcut,
            context,
            sheetId: activeSheet.id,
            seatId: activeSeat.seatId,
            options: {
              ...overrides,
              shortcut,
              hasSpecialty: overrides?.hasSpecialty ?? activeHasSpecialty,
              applyWoundPenalty: overrides?.applyWoundPenalty ?? activeApplyWounds,
            },
          });
          return;
        }
      }
      const preview = overrides?.preview;
      const rawTargetPool = preview?.pool ?? local?.rawPool ?? overrides?.pool ?? activeBasePool;
      if (
        rawTargetPool <= 0 &&
        !canResolveWithoutDice(preview?.modifiers ?? local?.modifiers ?? [])
      ) {
        toast.info('Nothing to roll: the dice pool is 0.');
        return;
      }
      const targetPool = Math.max(0, Math.min(30, Math.round(rawTargetPool)));
      const targetDiff =
        preview?.difficulty ?? local?.difficulty ?? overrides?.difficulty ?? difficulty;
      const targetSpec =
        preview?.hasSpecialty ??
        local?.hasSpecialty ??
        overrides?.hasSpecialty ??
        activeHasSpecialty;
      const usePack = Boolean(
        spendPackWillpower &&
          activePack &&
          activePack.current > 0 &&
          overrides?.spendWillpower !== false
      );
      const targetWp = usePack || (overrides?.spendWillpower ?? spendWillpower);
      const targetApplyWounds =
        preview?.applyWoundPenalty ??
        local?.applyWoundPenalty ??
        overrides?.applyWoundPenalty ??
        activeApplyWounds;
      const targetSecret = overrides?.isSecretRoll ?? isSecretRoll;
      const targetLabel = (overrides?.label ?? effectiveRollLabel).trim();

      const woundMod = targetApplyWounds
        ? (preview?.woundPenalty ?? local?.woundPenalty ?? activeTrackers.woundPenalty)
        : 0;
      const effectivePool = Math.max(0, targetPool + woundMod);
      const effectiveRage = Math.min(
        effectivePool,
        Math.max(0, overrides?.rageDiceCount ?? rageDiceCount)
      );

      const rollerDisplayName = activeSheet
        ? `${activeSheet.name} (${activeSeat.playerName})`
        : activeSeat.playerName;

      const accepted =
        coordinatorRef.current?.enqueueLocalRoll({
          rollClientId: crypto.randomUUID(),
          pool: targetPool,
          sheetId:activeSheet?.id,
          ...(shortcut ? {shortcut,ruleContext:context} : {}),
          rageDiceCount: effectiveRage,
          difficulty: targetDiff,
          hasSpecialty: targetSpec,
          specialtyMode,
          spendWillpower: targetWp,
          willpowerSource:usePack ? 'pack' : undefined,
          applyWoundPenalty: targetApplyWounds,
          rollMode: 'pool',
          label: targetLabel || 'W20 Dice Pool',
          isSecretRoll: targetSecret,
          seatId: activeSeat.seatId,
          rollerDisplayName,
          effectivePool,
          effectiveRage,
        }) ?? false;

      if (!accepted) {
        toast.error(QUEUE_FULL_MESSAGE);
        return;
      }
      setReviewTarget(false);
      if (targetWp) {
        setSpendPackWillpower(false);
        setSpendWillpower(false);
        if (!activeSheet) spendActiveSeatWillpower();
      }
    },
    [
      connectionStatus,
      activeBasePool,
      isSheetTraitsMode, traitSelection, specialtyOverride, woundOverride,hasRuleTargets,reviewTarget,spendPackWillpower,activePack,
      difficulty,
      activeHasSpecialty,
      specialtyMode,
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
    ]
  );

  const initiativeMeta = useMemo(() => {
    const woundMod = activeApplyWounds ? activeTrackers.woundPenalty : 0;
    const sitMod = isSheetTraitsMode ? bonusDice : 0;
    if (activeSheet) {
      const stats = computeUserSheetStats(activeSheet);
      const dex = stats.effectiveAttributes.dexterity;
      const wits = stats.effectiveAttributes.wits;
      const modifier =
        stats.initiativeBonus -
        stats.woundPenalty +
        (activeApplyWounds ? stats.woundPenalty : 0) +
        sitMod;
      const parts = [
        `1d10 + Dex ${dex} + Wits ${wits}`,
        stats.ruleInitiativeBonus ? `+${stats.ruleInitiativeBonus} rules` : '',
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
    (overrides?: {
      initiativeModifier?: number;
      fromSheet?: boolean;
      label?: string;
      isSecretRoll?: boolean;
    }) => {
      if (
        connectionStatus !== 'authenticated' &&
        connectionStatus !== 'reconnecting'
      ) {
        toast.error(notConnectedMessage(connectionStatus));
        return;
      }

      const targetMod = overrides?.initiativeModifier ?? initiativeMeta.modifier;
      const targetSecret = overrides?.isSecretRoll ?? isSecretRoll;
      const targetLabel = (overrides?.label ?? 'Initiative').trim() || 'Initiative';
      const rollerDisplayName = activeSheet
        ? `${activeSheet.name} (${activeSeat.playerName})`
        : activeSeat.playerName;

      const accepted = coordinatorRef.current?.enqueueLocalRoll({
        rollClientId: crypto.randomUUID(),
        pool: 1,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: activeApplyWounds,
        rollMode: 'initiative',
        initiativeModifier: targetMod,
        ...(activeSheet && (!overrides || overrides.fromSheet)
          ? {
              sheetId: activeSheet.id,
              ruleContext: { rollKind: 'initiative' },
              initiativeAdjustment: overrides?.fromSheet ? 0 : isSheetTraitsMode ? bonusDice : 0,
            }
          : {}),
        label: targetLabel,
        isSecretRoll: targetSecret,
        seatId: activeSeat.seatId,
        rollerDisplayName,
        effectivePool: 1,
        effectiveRage: 0,
      });
      if (!accepted) toast.error(QUEUE_FULL_MESSAGE);
    },
    [
      connectionStatus,
      initiativeMeta.modifier, bonusDice, isSheetTraitsMode,
      isSecretRoll,
      activeSheet,
      activeSeat.playerName,
      activeSeat.seatId,
      activeApplyWounds,
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
    if (isSheetTraitsMode) {
      if (traitSelection?.specialtyReason) setSpecialtyOverride((prev) => !prev);
      return;
    }
    setManualSpecialty((v) => !v);
  }, [isSheetTraitsMode, traitSelection?.specialtyReason]);

  const handleSetSpecialtyMode = useCallback(
    (mode: SpecialtyMode) => {
      if (canChangeSpecialtyMode && mode !== specialtyMode) {
        sendCommand({ type: 'SET_TABLE_SPECIALTY_MODE', specialtyMode: mode });
      }
    },
    [canChangeSpecialtyMode, sendCommand, specialtyMode]
  );

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
      const activate =
        activeSheet &&
        [...activeSheet.gifts, ...activeSheet.fetishes].find(
          (item) =>
            (resolved.shortcut.id === 'gift-' + item.id ||
              (resolved.shortcut.source.kind === 'fetish_activate' &&
                resolved.shortcut.source.fetishId === item.id)) &&
            getSourceModifierRule({
              ...item,
              rollAbility: 'rollAbility' in item ? (item.rollAbility ?? undefined) : undefined,
              kind: resolved.shortcut.source.kind === 'fetish_activate' ? 'fetish' : 'gift',
            })?.activation
        );
      if (activate) {
        openSheetRule(activate.id);
        return;
      }
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
          difficulty: resolved.shortcut.difficulty,
          specialtyOverride: null,
          woundOverride: null,
        });
        setRollSourceMode('traits');
        setComposerAttr(attr);
        setComposerAbil(abil);
        setBonusDice(flatMod);
        setDifficulty(resolved.shortcut.difficulty);
        setRageDiceCount(nextRage);
        setSpecialtyOverride(
          autoBaseline.specialtyReason ? resolved.shortcut.forceSpecialty ?? null : null
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
        shortcut: resolved.shortcut,
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
          fromSheet: true,
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
        shortcut: req.shortcut,
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

      const targetPool = entry.roll.effectivePool;
      const targetRage = Math.min(targetPool, Math.max(0, entry.rageDiceCount));
      const targetDiff = entry.roll.clampedDifficulty;
      const usedSpecialty = entry.roll.declaredSpecialty ?? entry.roll.hasApplicableSpecialty;
      if (!isSheetTraitsMode || usedSpecialty === undefined || targetPool === 0) {
        setManualPool(Math.max(1, targetPool));
        setRageDiceCount(targetRage);
        setDifficulty(targetDiff);
        setManualSpecialty(usedSpecialty ?? false);
        setManualApplyWounds(false);
        setIsSecretRoll(entry.isSecretRoll);
        setRollLabel(entry.label);
      }
      if (usedSpecialty === undefined || targetPool === 0) {
        setRollSourceMode('manual');
        setManualControlsOpen(true);
        setSpendWillpower(false);
        setSpendPackWillpower(false);
        setFeedOpen(false);
        toast.info('Review the pool and specialty before rolling again.');
        return;
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
    [executeInitiativeRoll, executeRoll, isSheetTraitsMode, setFeedOpen, setManualControlsOpen]
  );

  const pendingChoice = pendingActivations.find((choice) =>
    seats.some((seat) => seat.sheetId === choice.sheetId) && !deferredChoiceIds.includes(choice.rollId));
  const chooseReplacement = (option: RollReplacementOption) => {
    const seat = seats.find((item) => item.sheetId === option.sheetId);
    if (seat) sendCommand({ type: 'REROLL_RULE_ROLL', seatId: seat.seatId,
      sheetId: option.sheetId, rollId: option.rollId, ruleId: option.ruleId });
  };

  const handleClearTable = useCallback(() => {
    coordinatorRef.current?.clearFelt();
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
    } else {
      toast.info('The table is full (8 seats). Remove a seat to add another.');
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
      forceSpecialty: Boolean(traitSelection?.specialtyReason && specialtyOverride),
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
    specialtyOverride,
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
      forceSpecialty: manualSpecialty,
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
    manualSpecialty,
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

  const effectivePreviewPool = isSheetTraitsMode && traitSelection ? traitSelection.effectivePool : Math.max(
    0,
    activeBasePool + (activeApplyWounds ? activeTrackers.woundPenalty : 0)
  );
  const clampedPreviewRage = Math.min(effectivePreviewPool, rageDiceCount);
  const obsidianPreviewCount = Math.max(0, effectivePreviewPool - clampedPreviewRage);

  const specialtyDeclared = isSheetTraitsMode
    ? Boolean(traitSelection?.specialtyReason && specialtyOverride)
    : manualSpecialty;
  const activeModifierCount =
    (isSheetTraitsMode && bonusDice !== 0 ? 1 : 0) +
    (rageDiceCount > 0 ? 1 : 0) +
    (specialtyDeclared ? 1 : 0) +
    (spendWillpower ? 1 : 0) +
    (!activeApplyWounds ? 1 : 0) +
    (isSecretRoll ? 1 : 0);

  const hudProps: DiceTableHudProps = {
    session,
    connectionStatus,
    lastError,
    webglReady,
    sortedParticipants,
    tableInitiative,
    onClearTableInitiative: clearTableInitiative,
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
    specialtyDeclared,
    specialtyMode,
    canChangeSpecialtyMode,
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
    rollStageStatus,
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
    onDismissBanner: () => coordinatorRef.current?.dismissBanner(),
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
    onSetSpecialtyMode: handleSetSpecialtyMode,
    onToggleSpendWillpower: () => {
      setSpendPackWillpower(false);
      setSpendWillpower((v) => !v);
    },
    ruleRollOptions: activeSheet && (
      <div className="flex flex-wrap gap-2 text-xs text-stone-300">
        {hasRuleTargets && (
          <label>
            <input
              type="checkbox"
              checked={reviewTarget}
              onChange={(e) => setReviewTarget(e.target.checked)}
            />{' '}
            Choose target for next sheet roll
          </label>
        )}
        {!!activePack?.current && (
          <label>
            <input
              type="checkbox"
              checked={spendPackWillpower}
              onChange={(e) => {
                setSpendPackWillpower(e.target.checked);
                if (e.target.checked) setSpendWillpower(false);
              }}
            />{' '}
            Spend pack Willpower ({activePack.current} left)
          </label>
        )}
      </div>
    ),
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
    <div className="relative flex h-dvh w-full overflow-hidden bg-obsidian-950 text-stone-100 select-none">
      {/* Collapsible Pack Presence Drawer (Docked Left Drawer on PC) */}
      {!isMobile && (
        <PackPresenceDrawer
          open={packOpen}
          currentUserId={session.userId}
          sortedParticipants={sortedParticipants}
          tableInitiative={tableInitiative}
          onClearTableInitiative={clearTableInitiative}
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
        {!activeBanner && !hasDiceOnTable && !rollStageStatus.isRolling && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 pb-24 text-center">
            <p className="font-display text-xs font-bold tracking-[0.28em] uppercase text-amber-200/80">
              Ready to roll
            </p>
            <p className="mt-1.5 text-sm text-stone-300">
              {activeSheet
                ? `Pick an Attribute and an Ability below to roll from ${activeSheet.name}'s sheet`
                : 'Choose a character to roll from its traits, or set a number of dice below'}
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

      {/* Collapsible Roll Log (Bottom Sheet on Mobile, Docked Right Drawer on PC) */}
      <RollFeedDrawer
        open={feedOpen}
        mobileSheet={isMobile}
        rollHistory={rollHistory}
        disabled={
          (connectionStatus !== 'authenticated' && connectionStatus !== 'reconnecting') ||
          rollStageStatus.localPendingCount >= MAX_LOCAL_QUEUED_ROLLS
        }
        onClose={() => setFeedOpen(false)}
        onReroll={handleRerollFromHistory}
        replacementOptions={replacementOptions}
        onReplace={chooseReplacement}
        pendingActivations={pendingActivations}
        onReviewActivation={(id) => setDeferredChoiceIds((ids) => ids.filter((item) => item !== id))}
      />

      {/* Single-Instance Roster & Interactive W20 Sheet Modals mounted outside isMobile branch */}
      {review && activeSheet?.id === review.sheetId && activeSeat.seatId === review.seatId && <RuleRollReview
        sheet={activeSheet} seatId={review.seatId} shortcut={review.shortcut} initial={review.context}
        onCancel={()=>setReview(null)} onConfirm={(ruleContext,preview)=>{
          setReview(null);
          executeRoll({...review.options,ruleContext,preview});
        }}/>}
      <CharacterRosterModal session={session} />
      <W20InteractiveSheetModal onRollFromSheet={handleRollFromSheet} />
      {pendingChoice && (
        <Modal
          open
          size="sm"
          title={pendingChoice.label}
          subtitle="Choose the result before this activation takes effect."
          onClose={() => {
            setDeferredChoiceIds((ids) => [...ids, pendingChoice.rollId]);
            setFeedOpen(true);
          }}
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <RollReplacementActions
                options={replacementOptions.filter(
                  (option) => option.rollId === pendingChoice.rollId
                )}
                disabled={connectionStatus !== 'authenticated'}
                onChoose={chooseReplacement}
              />
              <Button
                variant="primary"
                disabled={connectionStatus !== 'authenticated'}
                onClick={() => {
                  const seat = seats.find((item) => item.sheetId === pendingChoice.sheetId);
                  if (seat)
                    sendCommand({
                      type: 'KEEP_ACTIVATION_RESULT',
                      seatId: seat.seatId,
                      sheetId: pendingChoice.sheetId,
                      rollId: pendingChoice.rollId,
                    });
                }}
              >
                Keep result
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p
                className={cx(
                  'font-display text-lg font-bold tracking-wide',
                  pendingChoice.roll.isBotch
                    ? 'text-red-300'
                    : pendingChoice.roll.netSuccesses > 0
                      ? 'text-emerald-300'
                      : 'text-stone-200'
                )}
              >
                {pendingChoice.roll.isBotch
                  ? 'Botch'
                  : pendingChoice.roll.netSuccesses === 0
                    ? 'Failure'
                    : pendingChoice.roll.netSuccesses === 1
                      ? '1 net success'
                      : `${pendingChoice.roll.netSuccesses} net successes`}
              </p>
              <p className="text-xs font-semibold text-stone-400">
                Difficulty {pendingChoice.roll.clampedDifficulty}
              </p>
            </div>
            <AuthoritativeDieChips roll={pendingChoice.roll} rageDiceCount={0} compact />
            <p className="text-xs text-stone-400">
              Closing this leaves the choice waiting in the roll feed.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
