import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import type { W20RollResult } from '@w20-vtt/core';
import type {
  LightGarouTrackers,
  LightWoundPenalty,
  RollHistoryEntry,
  TableParticipant,
} from '@w20-vtt/protocol';
import {
  ChevronRight,
  Dices,
  Eraser,
  EyeOff,
  Flame,
  History,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { DiscordSessionContext } from '../discordBootstrap';
import { type Queued3DRoll, useVttRoomStore } from '../store/useVttRoomStore';

interface DiceTableWorkspaceProps {
  session: DiscordSessionContext;
}

const POOL_PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const WOUND_OPTIONS: Array<{ value: LightWoundPenalty; label: string }> = [
  { value: 0, label: '0' },
  { value: -1, label: '-1' },
  { value: -2, label: '-2' },
  { value: -5, label: '-5' },
];
const DEFAULT_TRACKERS: LightGarouTrackers = {
  rage: 3,
  gnosis: 3,
  willpower: 5,
  woundPenalty: 0,
};

interface DecoratedDie {
  value: number;
  contributedSuccesses: number;
  isOne: boolean;
  isBonusExplosionDie: boolean;
  isCanceled: boolean;
  isRageDie: boolean;
}

function buildDecoratedFaces(roll: W20RollResult, rageDiceCount: number): DecoratedDie[] {
  const clampedRage = Math.min(roll.effectivePool, Math.max(0, rageDiceCount));
  const obsidianCount = Math.max(0, roll.effectivePool - clampedRage);

  let nonBonusIdx = 0;
  const withRageFlag = roll.dice.map((die) => {
    let isRageDie = false;
    if (!die.isBonusExplosionDie) {
      isRageDie = nonBonusIdx >= obsidianCount;
      nonBonusIdx += 1;
    }
    return { ...die, isRageDie };
  });

  const sorted = [...withRageFlag].sort((a, b) => b.value - a.value);
  let remainingCancels = roll.onesRolled;

  return sorted.map((die) => {
    const isSuccess = die.contributedSuccesses > 0;
    let isCanceled = false;
    if (isSuccess && remainingCancels > 0) {
      isCanceled = true;
      remainingCancels -= 1;
    }
    return {
      value: die.value,
      contributedSuccesses: die.contributedSuccesses,
      isOne: die.isOne,
      isBonusExplosionDie: die.isBonusExplosionDie,
      isCanceled,
      isRageDie: die.isRageDie,
    };
  });
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function formatRollTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const ParticipantAvatar: React.FC<{
  name: string;
  avatarUrl: string | null;
  isSpeaking?: boolean;
  isConnected?: boolean;
  sizeClass?: string;
}> = ({ name, avatarUrl, isSpeaking = false, isConnected = true, sizeClass = 'h-8 w-8' }) => {
  const ringClass = isSpeaking
    ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]'
    : 'ring-1 ring-zinc-700';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ${ringClass} ${isConnected ? '' : 'grayscale opacity-55'}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-200 ${ringClass} ${isConnected ? '' : 'opacity-55'}`}
    >
      {getInitials(name)}
    </div>
  );
};

const AuthoritativeDieChips: React.FC<{
  roll: W20RollResult;
  rageDiceCount: number;
  compact?: boolean;
}> = ({ roll, rageDiceCount, compact = false }) => {
  const faces = useMemo(() => buildDecoratedFaces(roll, rageDiceCount), [roll, rageDiceCount]);
  const chipSize = compact ? 'h-6 w-6 text-[11px]' : 'h-9 w-9 text-sm';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {faces.map((die, idx) => {
        const isSuccess = die.contributedSuccesses > 0;
        let style = 'border-zinc-700 bg-zinc-900/90 text-zinc-400';
        if (die.isOne) {
          style = 'border-red-500 bg-red-950/90 text-red-300';
        } else if (die.isCanceled) {
          style = 'border-zinc-600 bg-zinc-800/70 text-zinc-500 line-through';
        } else if (isSuccess) {
          style = 'border-emerald-500 bg-emerald-950/80 text-emerald-200';
        }

        const rageAccent = die.isRageDie ? 'ring-1 ring-red-500/80 ring-offset-1 ring-offset-zinc-950' : '';

        return (
          <div
            key={idx}
            className={`relative flex ${chipSize} items-center justify-center rounded-md border font-mono font-bold shadow ${style} ${rageAccent}`}
            title={
              [
                die.isRageDie ? 'Rage Die' : 'Standard Die',
                die.isOne
                  ? 'Rolled 1 (Cancels a success)'
                  : die.isCanceled
                    ? 'Success canceled by a 1'
                    : die.contributedSuccesses === 2
                      ? 'Specialty 10 (2 Successes)'
                      : die.isBonusExplosionDie
                        ? 'Specialty Bonus Explosion'
                        : '',
              ]
                .filter(Boolean)
                .join(' • ')
            }
          >
            {die.value}
            {die.contributedSuccesses === 2 && !die.isCanceled && (
              <span className="absolute -top-1.5 -right-1.5 rounded bg-amber-500 px-1 text-[8px] font-black text-zinc-950">
                x2
              </span>
            )}
            {die.isRageDie && (
              <span className="absolute -bottom-0.5 left-1/2 h-1 w-2.5 -translate-x-1/2 rounded-full bg-red-500" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const DiceTableWorkspace: React.FC<DiceTableWorkspaceProps> = ({ session }) => {
  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);
  const lastError = useVttRoomStore((s) => s.lastError);
  const participants = useVttRoomStore((s) => s.participants);
  const speakingDiscordIds = useVttRoomStore((s) => s.speakingDiscordIds);
  const rollHistory = useVttRoomStore((s) => s.rollHistory);
  const diceQueue = useVttRoomStore((s) => s.diceQueue);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const dequeue3DRoll = useVttRoomStore((s) => s.dequeue3DRoll);

  // Personal trackers (synced with DO participant state, with optimistic responsiveness)
  const serverSelfTrackers = useMemo(
    () =>
      participants.find((p) => p.discordUserId === session.userId)?.trackers ?? null,
    [participants, session.userId]
  );
  const [localTrackers, setLocalTrackers] = useState<LightGarouTrackers>(DEFAULT_TRACKERS);
  useEffect(() => {
    if (serverSelfTrackers) {
      setLocalTrackers(serverSelfTrackers);
    }
  }, [serverSelfTrackers]);

  // Dice tray state
  const [pool, setPool] = useState(6);
  const [rageDiceCount, setRageDiceCount] = useState(0);
  const [difficulty, setDifficulty] = useState(6);
  const [hasSpecialty, setHasSpecialty] = useState(false);
  const [spendWillpower, setSpendWillpower] = useState(false);
  const [applyWoundPenalty, setApplyWoundPenalty] = useState(true);
  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [rollLabel, setRollLabel] = useState('');

  // UI & 3D canvas state
  const [feedOpen, setFeedOpen] = useState(true);
  const [isThrowing, setIsThrowing] = useState(false);
  const [hasDiceOnTable, setHasDiceOnTable] = useState(false);
  const [activeBanner, setActiveBanner] = useState<Queued3DRoll | null>(null);
  const [webglReady, setWebglReady] = useState(false);

  const arenaWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const readyRef = useRef(false);
  const localRollClientIdsRef = useRef<Set<string>>(new Set());
  const busyQueueIdRef = useRef<string | null>(null);

  // Clamp Rage dice when pool changes
  useEffect(() => {
    setRageDiceCount((prev) => Math.min(prev, pool));
  }, [pool]);

  // Initialize @3d-dice/dice-box inside full-stage responsive container
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
        scale: 6,
        enableShadows: true,
        lightIntensity: 1.15,
        gravity: 2,
        throwForce: 6,
        spinForce: 5,
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

  // Keep DiceBox canvas synced cleanly when arena container resizes (e.g., feed toggle or window resize)
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

  // Process inbound DICE_ROLLED_3D queue sequentially
  const headRoll = diceQueue[0] ?? null;
  const headRollId = headRoll?.id ?? null;

  useEffect(() => {
    if (!headRoll || !headRollId || busyQueueIdRef.current === headRollId) {
      return;
    }

    // Local roll whose settled physical dice are already resting on the felt
    if (headRoll.rollClientId && localRollClientIdsRef.current.has(headRoll.rollClientId)) {
      localRollClientIdsRef.current.delete(headRoll.rollClientId);
      setActiveBanner(headRoll);
      setHasDiceOnTable(headRoll.roll.effectivePool > 0 && readyRef.current);
      dequeue3DRoll(headRoll.id);
      return;
    }

    let cancelled = false;
    busyQueueIdRef.current = headRollId;

    const animateRemoteRoll = async () => {
      const groups = buildDiceBoxGroups(
        headRoll.roll.effectivePool,
        headRoll.rageDiceCount ?? 0
      );

      if (readyRef.current && boxRef.current && groups.length > 0) {
        try {
          await boxRef.current.roll(groups, {
            theme: 'default',
            newStartPoint: true,
          });
        } catch {
          // Graceful fallback if WebGL is throttled
        }
      } else if (readyRef.current && boxRef.current && groups.length === 0) {
        try {
          boxRef.current.clear();
        } catch {
          // Ignore WebGL clear errors
        }
      }

      if (cancelled) return;
      setHasDiceOnTable(groups.length > 0 && readyRef.current);
      setActiveBanner(headRoll);
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
      setLocalTrackers((prev) => ({
        rage:
          typeof patch.rage === 'number' ? Math.max(0, Math.min(10, patch.rage)) : prev.rage,
        gnosis:
          typeof patch.gnosis === 'number'
            ? Math.max(0, Math.min(10, patch.gnosis))
            : prev.gnosis,
        willpower:
          typeof patch.willpower === 'number'
            ? Math.max(0, Math.min(10, patch.willpower))
            : prev.willpower,
        woundPenalty:
          patch.woundPenalty !== undefined ? patch.woundPenalty : prev.woundPenalty,
      }));
      sendCommand({ type: 'UPDATE_LIGHT_TRACKERS', trackers: patch });
    },
    [sendCommand]
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

      const targetPool = overrides?.pool ?? pool;
      const targetDiff = overrides?.difficulty ?? difficulty;
      const targetSpec = overrides?.hasSpecialty ?? hasSpecialty;
      const targetWp = overrides?.spendWillpower ?? spendWillpower;
      const targetApplyWounds = overrides?.applyWoundPenalty ?? applyWoundPenalty;
      const targetSecret = overrides?.isSecretRoll ?? isSecretRoll;
      const targetLabel = (overrides?.label ?? rollLabel).trim();

      const woundMod = targetApplyWounds ? localTrackers.woundPenalty : 0;
      const effectivePool = Math.max(0, targetPool + woundMod);
      const effectiveRage = Math.min(
        effectivePool,
        Math.max(0, overrides?.rageDiceCount ?? rageDiceCount)
      );

      const rollClientId = crypto.randomUUID();
      localRollClientIdsRef.current.add(rollClientId);

      setIsThrowing(true);
      let physicalDiceValues: number[] | undefined;

      try {
        const groups = buildDiceBoxGroups(effectivePool, effectiveRage);
        if (readyRef.current && boxRef.current && groups.length > 0) {
          const settled = await boxRef.current.roll(groups, {
            theme: 'default',
            newStartPoint: true,
          });
          physicalDiceValues = extractSettledDiceValues(settled, effectivePool);
          setHasDiceOnTable(true);
        } else if (readyRef.current && boxRef.current && groups.length === 0) {
          boxRef.current.clear();
          setHasDiceOnTable(false);
        }
      } catch {
        // Fallback seamlessly to server CSPRNG
        physicalDiceValues = undefined;
      } finally {
        setIsThrowing(false);
      }

      if (targetWp) {
        setSpendWillpower(false);
      }

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
      });
    },
    [
      isThrowing,
      connectionStatus,
      pool,
      difficulty,
      hasSpecialty,
      spendWillpower,
      applyWoundPenalty,
      isSecretRoll,
      rollLabel,
      localTrackers.woundPenalty,
      rageDiceCount,
      sendCommand,
    ]
  );

  const handleRerollFromHistory = useCallback(
    (entry: RollHistoryEntry) => {
      const targetPool = Math.max(1, entry.roll.effectivePool);
      const targetRage = Math.min(targetPool, Math.max(0, entry.rageDiceCount));
      const targetDiff = entry.roll.clampedDifficulty;
      const usedSpecialty = entry.roll.dice.some(
        (d) => d.contributedSuccesses === 2 || d.isBonusExplosionDie
      );
      setPool(targetPool);
      setRageDiceCount(targetRage);
      setDifficulty(targetDiff);
      setHasSpecialty(usedSpecialty);
      setApplyWoundPenalty(false);
      setIsSecretRoll(entry.isSecretRoll);
      setRollLabel(entry.label);

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
    [executeRoll]
  );

  const handleClearTable = useCallback(() => {
    try {
      boxRef.current?.clear();
    } catch {
      // Ignore WebGL clear errors
    }
    setHasDiceOnTable(false);
    setActiveBanner(null);
  }, []);

  const sortedParticipants = useMemo(() => {
    const base: TableParticipant[] =
      participants.length > 0
        ? participants
        : [
            {
              discordUserId: session.userId,
              displayName: session.username,
              avatarUrl: session.avatarUrl,
              isConnected: connectionStatus === 'authenticated',
              trackers: localTrackers,
            },
          ];

    return [...base].sort((a, b) => {
      if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
      if (a.discordUserId === session.userId) return -1;
      if (b.discordUserId === session.userId) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [participants, session, connectionStatus, localTrackers]);

  const effectivePreviewPool = Math.max(
    0,
    pool + (applyWoundPenalty ? localTrackers.woundPenalty : 0)
  );
  const clampedPreviewRage = Math.min(effectivePreviewPool, rageDiceCount);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100 select-none">
      {/* Top Bar: Identity, Voice Participants, Personal Light Trackers & Feed Toggle */}
      <header className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/90 bg-zinc-900/85 px-3 py-2 backdrop-blur-md">
        {/* Left: Table Title & Connection Status */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-800/70 bg-red-950/70 text-red-400">
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs font-extrabold tracking-wider uppercase text-zinc-100">
              W20 3D Dice Table
            </h1>
            <div className="flex items-center gap-1.5 text-[10px]">
              {connectionStatus === 'authenticated' ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300">Live Voice Table</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 animate-pulse text-amber-400" />
                  <span className="capitalize text-amber-300">{connectionStatus}</span>
                </>
              )}
              {!webglReady && (
                <span className="rounded bg-zinc-800 px-1 text-[9px] text-zinc-400">2D RNG</span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Voice-Channel Participant Strip */}
        <div className="flex max-w-full flex-1 items-center justify-center gap-2 overflow-x-auto px-2 py-0.5">
          {sortedParticipants.map((p) => {
            const isSpeaking = speakingDiscordIds.has(p.discordUserId);
            const isMe = p.discordUserId === session.userId;
            return (
              <div
                key={p.discordUserId}
                className={`flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 transition ${
                  isSpeaking
                    ? 'border-emerald-500/70 bg-emerald-950/35'
                    : isMe
                      ? 'border-red-900/60 bg-zinc-900/90'
                      : 'border-zinc-800 bg-zinc-950/80'
                } ${p.isConnected ? '' : 'opacity-50'}`}
              >
                <div className="relative">
                  <ParticipantAvatar
                    name={p.displayName}
                    avatarUrl={p.avatarUrl}
                    isSpeaking={isSpeaking}
                    isConnected={p.isConnected}
                    sizeClass="h-6 w-6"
                  />
                  {isSpeaking && (
                    <Volume2 className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-emerald-500 p-0.5 text-zinc-950" />
                  )}
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-200">
                    <span className="max-w-[90px] truncate">{p.displayName}</span>
                    {!p.isConnected && (
                      <span className="text-[9px] font-normal text-zinc-500">(away)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-400">
                    <span className="text-red-400">R{p.trackers.rage}</span>
                    <span className="text-sky-400">G{p.trackers.gnosis}</span>
                    <span className="text-indigo-300">W{p.trackers.willpower}</span>
                    {p.trackers.woundPenalty !== 0 && (
                      <span className="rounded bg-red-950 px-1 font-bold text-red-300">
                        {p.trackers.woundPenalty}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Personal Light W20 Trackers & Feed Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Rage Tracker */}
          <div className="flex items-center gap-1 rounded-lg border border-red-900/50 bg-zinc-950/90 px-2 py-1 text-[11px]">
            <span className="font-bold text-red-400">Rage</span>
            <button
              type="button"
              onClick={() => updateTrackers({ rage: localTrackers.rage - 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Decrease Rage"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-4 text-center font-mono font-bold text-zinc-100">
              {localTrackers.rage}
            </span>
            <button
              type="button"
              onClick={() => updateTrackers({ rage: localTrackers.rage + 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Increase Rage"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Gnosis Tracker */}
          <div className="flex items-center gap-1 rounded-lg border border-sky-900/50 bg-zinc-950/90 px-2 py-1 text-[11px]">
            <span className="font-bold text-sky-400">Gnosis</span>
            <button
              type="button"
              onClick={() => updateTrackers({ gnosis: localTrackers.gnosis - 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Decrease Gnosis"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-4 text-center font-mono font-bold text-zinc-100">
              {localTrackers.gnosis}
            </span>
            <button
              type="button"
              onClick={() => updateTrackers({ gnosis: localTrackers.gnosis + 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Increase Gnosis"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Willpower Tracker */}
          <div className="flex items-center gap-1 rounded-lg border border-indigo-900/50 bg-zinc-950/90 px-2 py-1 text-[11px]">
            <span className="font-bold text-indigo-300">WP</span>
            <button
              type="button"
              onClick={() => updateTrackers({ willpower: localTrackers.willpower - 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Decrease Willpower"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-4 text-center font-mono font-bold text-zinc-100">
              {localTrackers.willpower}
            </span>
            <button
              type="button"
              onClick={() => updateTrackers({ willpower: localTrackers.willpower + 1 })}
              className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
              aria-label="Increase Willpower"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Wound Penalty Selector */}
          <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-zinc-950/90 p-0.5 text-[10px]">
            <span className="px-1.5 font-semibold text-zinc-400">Wound</span>
            {WOUND_OPTIONS.map((opt) => {
              const active = localTrackers.woundPenalty === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateTrackers({ woundPenalty: opt.value })}
                  className={`rounded px-1.5 py-0.5 font-mono font-bold transition ${
                    active
                      ? opt.value === 0
                        ? 'bg-emerald-900/70 text-emerald-200'
                        : 'bg-red-800 text-red-100'
                      : 'text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Roll Feed Toggle */}
          <button
            type="button"
            onClick={() => setFeedOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800"
          >
            <History className="h-3.5 w-3.5 text-amber-400" />
            Feed ({rollHistory.length})
          </button>
        </div>
      </header>

      {/* Main Content: 3D Dice Felt Stage + Collapsible Live Feed */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Center Column: 3D Dice Arena + Bottom Tray */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 3D Dice Physics Tabletop Arena */}
          <div
            ref={arenaWrapperRef}
            className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.22)_0%,_rgba(12,12,15,0.96)_68%,_#09090b_100%)]"
          >
            {/* Felt table inner frame */}
            <div className="pointer-events-none absolute inset-4 rounded-2xl border border-zinc-800/70 shadow-[inset_0_0_80px_rgba(0,0,0,0.8)]" />

            {/* Subtle empty-table prompt when idle */}
            {!activeBanner && !hasDiceOnTable && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center opacity-45">
                <Dices className="h-12 w-12 text-red-500/60" />
                <p className="mt-2 text-xs font-bold tracking-widest uppercase text-zinc-400">
                  Garou Dice Felt Ready
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Pick a pool below to throw Obsidian &amp; Rage d10s for everyone in voice
                </p>
              </div>
            )}

            {/* Full-stage @3d-dice/dice-box container */}
            <div
              id="w20-dice-table-canvas"
              ref={canvasHostRef}
              className="pointer-events-none absolute inset-0 h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
            />

            {/* Top-Right Clear Table Button */}
            {(hasDiceOnTable || activeBanner) && (
              <button
                type="button"
                onClick={handleClearTable}
                className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1 text-[11px] font-bold text-zinc-200 shadow-lg backdrop-blur hover:bg-zinc-800"
              >
                <Eraser className="h-3.5 w-3.5 text-zinc-400" />
                Clear Table
              </button>
            )}

            {/* Server Rejection / Error Banner */}
            {lastError && (
              <div className="absolute top-3 left-3 z-20 rounded-lg border border-red-700/70 bg-red-950/90 px-3 py-1.5 text-xs text-red-200 shadow-lg">
                {lastError.message}
              </div>
            )}

            {/* Floating Authoritative W20 Result Banner */}
            {activeBanner && (
              <div
                onClick={() => setActiveBanner(null)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setActiveBanner(null);
                }}
                title="Click to dismiss banner (dice remain on felt)"
                className={`absolute top-4 left-1/2 z-20 w-[min(92%,560px)] -translate-x-1/2 cursor-pointer rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md transition ${
                  activeBanner.roll.isBotch
                    ? 'border-red-500/80 bg-red-950/90 text-red-100'
                    : activeBanner.roll.netSuccesses > 0
                      ? 'border-emerald-500/70 bg-zinc-900/95 text-zinc-100'
                      : 'border-zinc-700 bg-zinc-900/95 text-zinc-300'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <ParticipantAvatar
                      name={activeBanner.rollerName ?? 'Player'}
                      avatarUrl={activeBanner.rollerAvatarUrl ?? null}
                      sizeClass="h-8 w-8"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                        <span className="font-bold text-white">
                          {activeBanner.rollerName ?? 'Player'}
                        </span>
                        <span className="text-zinc-500">•</span>
                        <span>{activeBanner.label}</span>
                        <span className="text-zinc-500">•</span>
                        <span>Diff {activeBanner.roll.clampedDifficulty}</span>
                        {activeBanner.isSecretRoll && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-950/90 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                            <EyeOff className="h-2.5 w-2.5" /> Secret
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-base font-extrabold tracking-tight uppercase">
                        {activeBanner.roll.isBotch
                          ? 'CATASTROPHIC BOTCH!'
                          : activeBanner.roll.netSuccesses > 0
                            ? `${activeBanner.roll.netSuccesses} Net ${
                                activeBanner.roll.netSuccesses === 1 ? 'Success' : 'Successes'
                              } (${activeBanner.roll.outcome})`
                            : 'Failure (0 Net Successes)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeBanner.roll.automaticSuccesses > 0 && (
                      <span className="rounded border border-indigo-400/50 bg-indigo-950/80 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
                        +{activeBanner.roll.automaticSuccesses} WP
                      </span>
                    )}
                    <X className="h-4 w-4 text-zinc-400" />
                  </div>
                </div>

                {activeBanner.roll.dice.length > 0 && (
                  <div className="mt-2.5">
                    <AuthoritativeDieChips
                      roll={activeBanner.roll}
                      rageDiceCount={activeBanner.rageDiceCount ?? 0}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Full W20 Dice Tray */}
          <section className="z-20 border-t border-zinc-800/90 bg-zinc-900/95 px-3 py-2.5 backdrop-blur-md">
            <div className="flex flex-col gap-2">
              {/* Row 1: Quick Pool Buttons 1-15 + Pool Stepper + Effective Readout */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-extrabold tracking-wider uppercase text-zinc-400">
                  d10 Pool
                </span>
                {POOL_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPool(n)}
                    className={`h-7 min-w-[28px] rounded-md border px-1.5 font-mono text-xs font-bold transition ${
                      pool === n
                        ? 'border-red-500 bg-red-700 text-white shadow'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <div className="ml-1 flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => setPool((p) => Math.max(1, p - 1))}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    aria-label="Decrease Pool"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-7 text-center font-mono text-xs font-bold text-zinc-100">
                    {pool}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPool((p) => Math.min(30, p + 1))}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    aria-label="Increase Pool"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="ml-auto font-mono text-[11px] text-zinc-400">
                  Effective:{' '}
                  <strong className="text-zinc-100">{effectivePreviewPool}d10</strong>
                  {applyWoundPenalty && localTrackers.woundPenalty !== 0 && (
                    <span className="ml-1 text-red-400">({localTrackers.woundPenalty} wound)</span>
                  )}
                </span>
              </div>

              {/* Row 2: Difficulty, Rage Dice, Modifiers, Label, and ROLL CTA */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Difficulty Stepper */}
                <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs">
                  <span className="font-bold text-zinc-400">Diff</span>
                  <button
                    type="button"
                    onClick={() => setDifficulty((d) => Math.max(2, d - 1))}
                    className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
                    aria-label="Decrease Difficulty"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center font-mono font-extrabold text-amber-300">
                    {difficulty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDifficulty((d) => Math.min(10, d + 1))}
                    className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
                    aria-label="Increase Difficulty"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Blood-Red Rage Dice Control */}
                <div className="flex items-center gap-1 rounded-lg border border-red-900/60 bg-red-950/25 px-2 py-1 text-xs">
                  <span className="font-bold text-red-300">Rage Dice</span>
                  <button
                    type="button"
                    onClick={() => setRageDiceCount((r) => Math.max(0, r - 1))}
                    className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
                    aria-label="Decrease Rage Dice"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center font-mono font-extrabold text-red-300">
                    {rageDiceCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRageDiceCount((r) => Math.min(pool, r + 1))}
                    className="rounded bg-zinc-800 p-0.5 text-zinc-300 hover:bg-zinc-700"
                    aria-label="Increase Rage Dice"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRageDiceCount(Math.min(pool, localTrackers.rage))}
                    className="ml-1 rounded border border-red-800/70 bg-red-950/80 px-1.5 py-0.5 text-[10px] font-bold text-red-200 hover:bg-red-900"
                    title="Set Rage dice to your personal Rage tracker"
                  >
                    Match Rage
                  </button>
                </div>

                {/* Modifier Toggle Pills */}
                <button
                  type="button"
                  onClick={() => setHasSpecialty((v) => !v)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    hasSpecialty
                      ? 'border-amber-500/80 bg-amber-950/60 text-amber-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Specialty (10s = 2x)
                </button>

                <button
                  type="button"
                  onClick={() => setSpendWillpower((v) => !v)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    spendWillpower
                      ? 'border-indigo-500/80 bg-indigo-950/70 text-indigo-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  Willpower (+1)
                </button>

                <button
                  type="button"
                  onClick={() => setApplyWoundPenalty((v) => !v)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    applyWoundPenalty
                      ? 'border-rose-500/70 bg-rose-950/50 text-rose-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  Apply Wounds
                  {localTrackers.woundPenalty !== 0 ? ` (${localTrackers.woundPenalty})` : ''}
                </button>

                <button
                  type="button"
                  onClick={() => setIsSecretRoll((v) => !v)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    isSecretRoll
                      ? 'border-amber-500/80 bg-amber-950/60 text-amber-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Secret Roll
                </button>

                {/* Roll Label Input & Primary Roll Button */}
                <div className="ml-auto flex min-w-[260px] flex-1 items-center gap-2 sm:flex-initial">
                  <input
                    type="text"
                    value={rollLabel}
                    maxLength={120}
                    onChange={(e) => setRollLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void executeRoll();
                      }
                    }}
                    placeholder="Roll label (e.g. Dex + Brawl)"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isThrowing || connectionStatus !== 'authenticated'}
                    onClick={() => void executeRoll()}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-700 px-4 py-1.5 text-xs font-extrabold tracking-wider uppercase text-white shadow-lg transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Dices className="h-4 w-4" />
                    {isThrowing
                      ? 'Rolling...'
                      : `ROLL ${effectivePreviewPool}d10${
                          clampedPreviewRage > 0 ? ` (${clampedPreviewRage}R)` : ''
                        }`}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Collapsible Live Roll Feed */}
        {feedOpen && (
          <aside className="z-30 flex w-80 shrink-0 flex-col border-l border-zinc-800/90 bg-zinc-900/90 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider uppercase text-zinc-200">
                <History className="h-3.5 w-3.5 text-amber-400" />
                Live Roll Feed
              </div>
              <button
                type="button"
                onClick={() => setFeedOpen(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Collapse Roll Feed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
              {rollHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-500">
                  No rolls yet in this voice table. Throw your first d10 pool!
                </div>
              ) : (
                rollHistory.map((entry) => {
                  const isSuccess = entry.roll.netSuccesses > 0;
                  const cardBorder = entry.roll.isBotch
                    ? 'border-red-700/70 bg-red-950/25'
                    : isSuccess
                      ? 'border-emerald-800/60 bg-zinc-950/85'
                      : 'border-zinc-800 bg-zinc-950/70';

                  return (
                    <article
                      key={entry.id}
                      className={`rounded-xl border p-2.5 transition ${cardBorder}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ParticipantAvatar
                            name={entry.rollerName}
                            avatarUrl={entry.rollerAvatarUrl}
                            sizeClass="h-6 w-6"
                          />
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-bold text-zinc-100">
                                {entry.rollerName}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {formatRollTime(entry.timestamp)}
                              </span>
                            </div>
                            <p className="truncate text-[11px] text-zinc-400">
                              {entry.label} • Diff {entry.roll.clampedDifficulty}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRerollFromHistory(entry)}
                          disabled={isThrowing || connectionStatus !== 'authenticated'}
                          title="Copy settings & re-roll"
                          className="flex shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          Re-roll
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                            entry.roll.isBotch
                              ? 'bg-red-600 text-white'
                              : isSuccess
                                ? 'bg-emerald-900/80 text-emerald-200'
                                : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {entry.roll.isBotch
                            ? 'BOTCH'
                            : isSuccess
                              ? `${entry.roll.netSuccesses} Net (${entry.roll.outcome})`
                              : 'Failure'}
                        </span>
                        {entry.isSecretRoll && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-950 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                            <EyeOff className="h-2.5 w-2.5" /> Secret
                          </span>
                        )}
                        {entry.roll.automaticSuccesses > 0 && (
                          <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">
                            +{entry.roll.automaticSuccesses} WP
                          </span>
                        )}
                        {entry.rageDiceCount > 0 && (
                          <span className="rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-bold text-red-300">
                            {entry.rageDiceCount} Rage
                          </span>
                        )}
                      </div>

                      {entry.roll.dice.length > 0 && (
                        <div className="mt-2">
                          <AuthoritativeDieChips
                            roll={entry.roll}
                            rageDiceCount={entry.rageDiceCount}
                            compact
                          />
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
