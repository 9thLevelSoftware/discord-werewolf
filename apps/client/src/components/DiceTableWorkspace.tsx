import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import type { LightGarouTrackers, RollHistoryEntry, TableParticipant } from '@w20-vtt/protocol';
import {
  Dices,
  Eraser,
  EyeOff,
  Flame,
  Minus,
  Plus,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { DiscordSessionContext } from '../discordBootstrap';
import { type Queued3DRoll, useVttRoomStore } from '../store/useVttRoomStore';
import { ParticipantAvatar, RollResultPlaque } from './dice-table/DieFaceTiles';
import { QuickRollBar, type QuickRollPreset } from './dice-table/QuickRollBar';
import { RollFeedDrawer } from './dice-table/RollFeedDrawer';
import { PersonalTrackersControl } from './dice-table/W20DotTracker';

interface DiceTableWorkspaceProps {
  session: DiscordSessionContext;
}

const POOL_QUICK_JUMPS = [3, 5, 7, 10, 12];
const DEFAULT_TRACKERS: LightGarouTrackers = {
  rage: 3,
  gnosis: 3,
  willpower: 5,
  woundPenalty: 0,
};

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
  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);
  const lastError = useVttRoomStore((s) => s.lastError);
  const participants = useVttRoomStore((s) => s.participants);
  const speakingDiscordIds = useVttRoomStore((s) => s.speakingDiscordIds);
  const rollHistory = useVttRoomStore((s) => s.rollHistory);
  const diceQueue = useVttRoomStore((s) => s.diceQueue);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const dequeue3DRoll = useVttRoomStore((s) => s.dequeue3DRoll);

  const serverSelfTrackers = useMemo(
    () => participants.find((p) => p.discordUserId === session.userId)?.trackers ?? null,
    [participants, session.userId]
  );
  const [localTrackers, setLocalTrackers] = useState<LightGarouTrackers>(DEFAULT_TRACKERS);
  useEffect(() => {
    if (serverSelfTrackers) {
      setLocalTrackers(serverSelfTrackers);
    }
  }, [serverSelfTrackers]);

  // Console state (independent per player)
  const [pool, setPool] = useState(6);
  const [editingPool, setEditingPool] = useState(false);
  const [poolInputValue, setPoolInputValue] = useState('6');
  const [rageDiceCount, setRageDiceCount] = useState(0);
  const [difficulty, setDifficulty] = useState(6);
  const [hasSpecialty, setHasSpecialty] = useState(false);
  const [spendWillpower, setSpendWillpower] = useState(false);
  const [applyWoundPenalty, setApplyWoundPenalty] = useState(true);
  const [isSecretRoll, setIsSecretRoll] = useState(false);
  const [rollLabel, setRollLabel] = useState('');

  // Arena & Drawer state
  const [feedOpen, setFeedOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
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

  useEffect(() => {
    setRageDiceCount((prev) => Math.min(prev, pool));
  }, [pool]);

  // Initialize full-stage @3d-dice/dice-box
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

  const handleTriggerPreset = useCallback(
    (preset: QuickRollPreset) => {
      setPool(preset.pool);
      setRageDiceCount(Math.min(preset.pool, preset.rageDiceCount));
      setDifficulty(preset.difficulty);
      setHasSpecialty(preset.hasSpecialty);
      setIsSecretRoll(preset.isSecretRoll);
      setRollLabel(preset.name);

      void executeRoll({
        pool: preset.pool,
        rageDiceCount: Math.min(preset.pool, preset.rageDiceCount),
        difficulty: preset.difficulty,
        hasSpecialty: preset.hasSpecialty,
        spendWillpower: false,
        applyWoundPenalty,
        label: preset.name,
        isSecretRoll: preset.isSecretRoll,
      });
    },
    [applyWoundPenalty, executeRoll]
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

  const commitPoolInput = useCallback(() => {
    const parsed = Number.parseInt(poolInputValue, 10);
    if (Number.isFinite(parsed)) {
      setPool(Math.max(1, Math.min(30, parsed)));
    }
    setEditingPool(false);
  }, [poolInputValue]);

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
  const obsidianPreviewCount = Math.max(0, effectivePreviewPool - clampedPreviewRage);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#070609] text-stone-100 select-none">
      {/* Main Full-Height 3D Felt Stage */}
      <div
        ref={arenaWrapperRef}
        className="relative h-full min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.22)_0%,_rgba(12,10,16,0.97)_66%,_#060508_100%)]"
      >
        {/* Subtle Umbral Felt Framing & Antique Bronze Corner Brackets */}
        <div className="pointer-events-none absolute inset-3 rounded-3xl border border-amber-500/15 shadow-[inset_0_0_95px_rgba(0,0,0,0.85)]" />
        <div className="pointer-events-none absolute top-4 left-4 h-5 w-5 border-t-2 border-l-2 border-amber-500/40 rounded-tl-lg" />
        <div className="pointer-events-none absolute top-4 right-4 h-5 w-5 border-t-2 border-r-2 border-amber-500/40 rounded-tr-lg" />
        <div className="pointer-events-none absolute bottom-4 left-4 h-5 w-5 border-b-2 border-l-2 border-amber-500/40 rounded-bl-lg" />
        <div className="pointer-events-none absolute bottom-4 right-4 h-5 w-5 border-b-2 border-r-2 border-amber-500/40 rounded-br-lg" />

        {/* Etched Garou Moon-Phase & Auspice Medallion */}
        <GarouFeltMedallion />

        {/* Idle Prompt */}
        {!activeBanner && !hasDiceOnTable && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-24 text-center opacity-55">
            <p className="font-display text-xs font-bold tracking-[0.28em] uppercase text-amber-200/80">
              Garou Umbral Felt
            </p>
            <p className="mt-1.5 text-[11px] text-stone-400">
              Dial your pool below to cast Obsidian &amp; Rage d10s
            </p>
          </div>
        )}

        {/* Full-Stage @3d-dice/dice-box Physics Canvas */}
        <div
          id="w20-dice-table-canvas"
          ref={canvasHostRef}
          className="pointer-events-none absolute inset-0 h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
        />

        {/* Slim Floating Top Presence & Tracker Bar */}
        <header className="pointer-events-none absolute inset-x-4 top-3 z-30 flex items-center justify-between gap-3">
          {/* Left: W20 Crest + Voice Participant Strip */}
          <div className="w20-obsidian-panel pointer-events-auto flex max-w-[66%] items-center gap-2.5 rounded-full px-3 py-1.5">
            <div className="flex shrink-0 items-center gap-2 pr-2 border-r border-amber-500/20">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-red-700/70 bg-red-950/80 text-red-300">
                <Flame className="h-3.5 w-3.5" />
              </div>
              <span className="font-display text-xs font-black tracking-widest uppercase text-amber-100">
                W20
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'authenticated'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                    : 'animate-pulse bg-amber-400'
                }`}
                title={`Connection: ${connectionStatus}`}
              />
              {!webglReady && (
                <span className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[9px] text-stone-400">
                  2D RNG
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {sortedParticipants.map((p) => {
                const isSpeaking = speakingDiscordIds.has(p.discordUserId);
                return (
                  <div
                    key={p.discordUserId}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${
                      isSpeaking
                        ? 'border-emerald-400/75 bg-emerald-950/45'
                        : 'border-stone-700/60 bg-zinc-950/75'
                    } ${p.isConnected ? '' : 'opacity-45'}`}
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
                        <Volume2 className="absolute -right-1 -bottom-1 h-2.5 w-2.5 rounded-full bg-emerald-400 p-0.5 text-zinc-950" />
                      )}
                    </div>
                    <span className="max-w-[82px] truncate text-[11px] font-semibold text-stone-200">
                      {p.displayName}
                    </span>
                    <div className="hidden items-center gap-1 font-mono text-[9px] text-stone-400 sm:flex">
                      <span className="text-red-300">R{p.trackers.rage}</span>
                      <span className="text-amber-200">G{p.trackers.gnosis}</span>
                      <span className="text-indigo-200">W{p.trackers.willpower}</span>
                      {p.trackers.woundPenalty !== 0 && (
                        <span className="rounded bg-red-950 px-1 font-bold text-red-300">
                          {p.trackers.woundPenalty}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Personal W20 Dot Trackers Popover + Arena Utilities */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <PersonalTrackersControl trackers={localTrackers} onUpdate={updateTrackers} />

            {(hasDiceOnTable || activeBanner) && (
              <button
                type="button"
                onClick={handleClearTable}
                className="w20-obsidian-panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold text-stone-200 transition hover:border-amber-400/55"
              >
                <Eraser className="h-3.5 w-3.5 text-amber-300" />
                <span className="hidden sm:inline">Clear Felt</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFeedOpen((v) => !v)}
              className={`w20-obsidian-panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition hover:border-amber-400/55 ${
                feedOpen ? 'text-amber-200 !border-amber-500/50' : 'text-stone-200'
              }`}
            >
              <ScrollText className="h-3.5 w-3.5 text-amber-300" />
              <span>Feed ({rollHistory.length})</span>
            </button>
          </div>
        </header>

        {/* Server Error Toast */}
        {lastError && (
          <div className="w20-obsidian-panel absolute top-16 left-4 z-30 !border-red-600/80 rounded-xl px-3 py-1.5 text-xs text-red-200">
            {lastError.message}
          </div>
        )}

        {/* Dismissible Floating Roll Result Plaque */}
        {activeBanner && (
          <RollResultPlaque banner={activeBanner} onDismiss={() => setActiveBanner(null)} />
        )}

        {/* Centered Floating Dark Gothic Dice Console */}
        <section className="w20-obsidian-panel absolute bottom-3 left-1/2 z-30 w-[min(96%,770px)] -translate-x-1/2 rounded-2xl px-4 py-3">
          {/* Quick-Roll Presets Strip */}
          <QuickRollBar
            userId={session.userId}
            currentPool={pool}
            currentRageDiceCount={rageDiceCount}
            currentDifficulty={difficulty}
            currentHasSpecialty={hasSpecialty}
            currentIsSecretRoll={isSecretRoll}
            currentRollLabel={rollLabel}
            disabled={isThrowing || connectionStatus !== 'authenticated'}
            onTriggerPreset={handleTriggerPreset}
          />

          <div className="w20-gold-divider my-2.5" />

          {/* Main Tactical Console Row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Tactile Pool Dial + Quick-Jump Chips */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[10px] font-bold tracking-wider uppercase text-amber-200/80">
                  Pool
                </span>
                <div className="flex items-center gap-1 rounded-xl border border-amber-500/35 bg-zinc-950/90 px-1.5 py-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setPool((p) => Math.max(1, p - 1))}
                    className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
                    aria-label="Decrease Pool"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>

                  {editingPool ? (
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={poolInputValue}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setPoolInputValue(e.target.value)}
                      onBlur={commitPoolInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitPoolInput();
                        } else if (e.key === 'Escape') {
                          setEditingPool(false);
                        }
                      }}
                      className="font-display w-14 bg-transparent text-center text-xl font-black text-amber-100 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPoolInputValue(String(pool));
                        setEditingPool(true);
                      }}
                      title="Click to type exact d10 pool (1-30)"
                      className="flex min-w-[54px] items-baseline justify-center gap-0.5 px-1 text-amber-100 hover:text-amber-300"
                    >
                      <span className="font-display text-xl font-black leading-none">{pool}</span>
                      <span className="font-mono text-[10px] font-bold text-stone-400">d10</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setPool((p) => Math.min(30, p + 1))}
                    className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
                    aria-label="Increase Pool"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Quick-Jump Pool Chips */}
                <div className="flex items-center gap-1">
                  {POOL_QUICK_JUMPS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPool(val)}
                      className={`h-7 min-w-[26px] rounded-md border px-1.5 font-mono text-[11px] font-bold transition ${
                        pool === val
                          ? 'border-amber-400/80 bg-red-900/75 text-amber-100 shadow'
                          : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dual-tone Pool Composition Preview Bar */}
              <div className="flex items-center gap-2 text-[10px] text-stone-400">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(effectivePreviewPool, 18) }, (_, idx) => {
                    const isRage = idx >= obsidianPreviewCount;
                    return (
                      <span
                        key={idx}
                        className={`h-1.5 w-2 rounded-xs ${
                          isRage
                            ? 'bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.75)]'
                            : 'bg-stone-500/80'
                        }`}
                      />
                    );
                  })}
                  {effectivePreviewPool > 18 && (
                    <span className="font-mono text-[9px] text-stone-400">
                      +{effectivePreviewPool - 18}
                    </span>
                  )}
                </div>
                {applyWoundPenalty && localTrackers.woundPenalty !== 0 && (
                  <span className="font-mono text-red-300">
                    Effective: {effectivePreviewPool}d10 ({localTrackers.woundPenalty} wound)
                  </span>
                )}
              </div>
            </div>

            {/* Difficulty & Rage Dice Steppers */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-stone-700/70 bg-zinc-950/90 px-2 py-1 text-xs">
                <span className="font-display text-[10px] font-bold uppercase text-stone-400">
                  Diff
                </span>
                <button
                  type="button"
                  onClick={() => setDifficulty((d) => Math.max(2, d - 1))}
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Decrease Difficulty"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="font-display w-5 text-center text-sm font-black text-amber-300">
                  {difficulty}
                </span>
                <button
                  type="button"
                  onClick={() => setDifficulty((d) => Math.min(10, d + 1))}
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Increase Difficulty"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-red-900/65 bg-red-950/30 px-2 py-1 text-xs">
                <span className="font-display text-[10px] font-bold uppercase text-red-300">
                  Rage
                </span>
                <button
                  type="button"
                  onClick={() => setRageDiceCount((r) => Math.max(0, r - 1))}
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Decrease Rage Dice"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="font-display w-5 text-center text-sm font-black text-red-300">
                  {rageDiceCount}
                </span>
                <button
                  type="button"
                  onClick={() => setRageDiceCount((r) => Math.min(pool, r + 1))}
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Increase Rage Dice"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setRageDiceCount(Math.min(pool, localTrackers.rage))}
                  className="ml-0.5 rounded border border-red-700/65 bg-red-950/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-200 hover:bg-red-900"
                  title="Sync Rage dice to your personal Rage rating"
                >
                  Sync
                </button>
              </div>
            </div>

            {/* W20 Toggle Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHasSpecialty((v) => !v)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  hasSpecialty
                    ? 'border-amber-400/80 bg-amber-950/65 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.28)]'
                    : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Specialty
              </button>

              <button
                type="button"
                onClick={() => setSpendWillpower((v) => !v)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  spendWillpower
                    ? 'border-indigo-400/80 bg-indigo-950/70 text-indigo-200 shadow-[0_0_10px_rgba(129,140,248,0.28)]'
                    : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                }`}
              >
                +1 Willpower
              </button>

              <button
                type="button"
                onClick={() => setApplyWoundPenalty((v) => !v)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  applyWoundPenalty
                    ? 'border-rose-500/65 bg-rose-950/55 text-rose-200'
                    : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                Wounds{localTrackers.woundPenalty !== 0 ? ` (${localTrackers.woundPenalty})` : ''}
              </button>

              <button
                type="button"
                onClick={() => setIsSecretRoll((v) => !v)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  isSecretRoll
                    ? 'border-amber-400/80 bg-amber-950/65 text-amber-200'
                    : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                }`}
              >
                <EyeOff className="h-3 w-3" />
                Secret
              </button>
            </div>

            {/* Label Input & Crimson Wax-Seal ROLL Button */}
            <div className="ml-auto flex min-w-[240px] flex-1 items-center gap-2">
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
                placeholder="Label (e.g. Dex + Brawl)"
                className="min-w-0 flex-1 rounded-xl border border-stone-700/75 bg-zinc-950/90 px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75 focus:outline-none"
              />
              <button
                type="button"
                disabled={isThrowing || connectionStatus !== 'authenticated'}
                onClick={() => void executeRoll()}
                className="w20-crimson-seal font-display flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black tracking-widest uppercase text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Dices className="h-4 w-4" />
                {isThrowing
                  ? 'Casting...'
                  : `Roll ${effectivePreviewPool}d10${
                      clampedPreviewRage > 0 ? ` (${clampedPreviewRage}R)` : ''
                    }`}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Right Collapsible Chronicle of Rolls */}
      <RollFeedDrawer
        open={feedOpen}
        rollHistory={rollHistory}
        disabled={isThrowing || connectionStatus !== 'authenticated'}
        onClose={() => setFeedOpen(false)}
        onReroll={handleRerollFromHistory}
      />
    </div>
  );
};
