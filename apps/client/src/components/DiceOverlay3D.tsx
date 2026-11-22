import React, { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import { Queued3DRoll, useVttRoomStore } from '../store/useVttRoomStore';
import { SafeDiceBoxController } from './dice-table/rollQueueController';

/**
 * Splits effective pool into Obsidian base d10s (#18181b) and Blood-Red Rage d10s (#991b1b).
 */
function partitionObsidianAndRageDice(
  queued: Queued3DRoll,
  rageDiceHint: number
): { obsidianCount: number; rageCount: number } {
  const total = queued.roll.effectivePool;
  if (total <= 0) return { obsidianCount: 0, rageCount: 0 };

  const isPureRageRoll = /\b(rage|frenzy)\b/i.test(queued.label);
  if (isPureRageRoll) {
    return { obsidianCount: 0, rageCount: total };
  }

  const clampedRage = Math.min(total, Math.max(0, rageDiceHint));
  return {
    obsidianCount: total - clampedRage,
    rageCount: clampedRage,
  };
}

export const DiceOverlay3D: React.FC<{ assetPath?: string }> = ({
  assetPath = '/assets/dice-box/',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<DiceBox | null>(null);
  const safeBoxRef = useRef<SafeDiceBoxController | null>(null);
  if (!safeBoxRef.current) {
    safeBoxRef.current = new SafeDiceBoxController();
  }
  const busyRollIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const diceQueue = useVttRoomStore((s) => s.diceQueue);
  const dequeue3DRoll = useVttRoomStore((s) => s.dequeue3DRoll);

  const [activeBanner, setActiveBanner] = useState<Queued3DRoll | null>(null);

  // 1. Initialize @3d-dice/dice-box WebGL/WASM canvas once
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (container) {
      container.innerHTML = '';
    }

    try {
      const box = new DiceBox({
        container: '#w20-dice-canvas',
        assetPath,
        theme: 'default',
        scale: 6,
        gravity: 2,
        throwForce: 6,
        spinForce: 5,
        lightIntensity: 1.1,
        autoResize: false,
        canvasWidth: 16,
        canvasHeight: 9,
      });

      box
        .init()
        .then(() => {
          if (!cancelled) {
            boxRef.current = box;
            safeBoxRef.current?.setBox(box, true);
          } else {
            try {
              box.clear();
            } catch {
              // Ignore teardown errors
            }
          }
        })
        .catch((err: unknown) => {
          console.warn(
            '3D DiceBox WebGL unavailable; falling back to authoritative 2D dice banner.',
            err
          );
          safeBoxRef.current?.setBox(null, false);
        });
    } catch (err: unknown) {
      console.warn(
        '3D DiceBox initialization failed; falling back to authoritative 2D dice banner.',
        err
      );
      safeBoxRef.current?.setBox(null, false);
    }

    return () => {
      cancelled = true;
      safeBoxRef.current?.setBox(null, false);
      try {
        boxRef.current?.clear();
      } catch {
        // Ignore cleanup errors if WebGL context was already lost
      }
      boxRef.current = null;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [assetPath]);

  const headRoll = diceQueue[0] ?? null;
  const headRollId = headRoll?.id ?? null;

  // 2. Sequentially consume queued rolls from the Durable Object
  useEffect(() => {
    if (!headRoll || !headRollId || busyRollIdRef.current === headRollId) {
      return;
    }

    let cancelled = false;
    busyRollIdRef.current = headRollId;

    const runRollAnimation = async () => {
      const { characters, combat } = useVttRoomStore.getState();
      const char = headRoll.characterId
        ? characters[headRoll.characterId]
        : undefined;
      const isRagePass = (combat?.currentPassNumber ?? 1) >= 2;

      const rageHint = isRagePass
        ? headRoll.roll.effectivePool
        : char?.turnLocks.hasSpentRageThisTurn
          ? Math.min(char.rage.permanent, headRoll.roll.effectivePool)
          : 0;

      const { obsidianCount, rageCount } = partitionObsidianAndRageDice(
        headRoll,
        rageHint
      );

      const rollGroups: Array<{ qty: number; sides: number; themeColor: string }> =
        [];
      if (obsidianCount > 0) {
        rollGroups.push({ qty: obsidianCount, sides: 10, themeColor: '#18181b' });
      }
      if (rageCount > 0) {
        rollGroups.push({ qty: rageCount, sides: 10, themeColor: '#991b1b' });
      }

      if (safeBoxRef.current?.isReady() && rollGroups.length > 0) {
        safeBoxRef.current.clearBoxSafely();
        await safeBoxRef.current.throwDice(rollGroups, {
          rollOptions: { seed: headRoll.roll.physicsSeed },
        });
      }

      if (cancelled) return;

      setActiveBanner(headRoll);

      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        safeBoxRef.current?.interruptCurrentThrow();
        setActiveBanner(null);
        busyRollIdRef.current = null;
        dequeue3DRoll(headRoll.id);
      }, 4500);
    };

    void runRollAnimation();

    return () => {
      cancelled = true;
      safeBoxRef.current?.interruptCurrentThrow();
      busyRollIdRef.current = null;
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [headRollId, dequeue3DRoll]);

  const dismissImmediately = () => {
    if (!activeBanner) return;
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    safeBoxRef.current?.interruptCurrentThrow();
    const id = activeBanner.id;
    setActiveBanner(null);
    busyRollIdRef.current = null;
    dequeue3DRoll(id);
  };

  // Sort authoritative dice highest-first and mark which successes were canceled by 1s
  const renderAuthoritativeFaces = (queued: Queued3DRoll) => {
    const sorted = [...queued.roll.dice].sort((a, b) => b.value - a.value);
    let remainingCancels = queued.roll.onesRolled;

    return sorted.map((die, idx) => {
      const isSuccess = die.contributedSuccesses > 0;
      let isCanceled = false;
      if (isSuccess && remainingCancels > 0) {
        isCanceled = true;
        remainingCancels -= 1;
      }

      return (
        <div
          key={idx}
          className={`relative flex h-9 w-9 items-center justify-center rounded-md border font-mono text-sm font-bold shadow ${
            die.isOne
              ? 'border-red-500 bg-red-950/90 text-red-300'
              : isCanceled
                ? 'border-zinc-600 bg-zinc-800/70 text-zinc-500 line-through'
                : isSuccess
                  ? 'border-emerald-500 bg-emerald-950/80 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900/90 text-zinc-400'
          }`}
          title={
            die.isOne
              ? 'Rolled 1 (Cancels a success)'
              : isCanceled
                ? 'Success canceled by a 1'
                : die.contributedSuccesses === 2
                  ? 'Specialty 10 (2 Successes)'
                  : die.isBonusExplosionDie
                    ? 'Specialty Bonus Explosion Die'
                    : undefined
          }
        >
          {die.value}
          {die.contributedSuccesses === 2 && !isCanceled && (
            <span className="absolute -top-1.5 -right-1.5 rounded bg-amber-500 px-1 text-[9px] font-black text-zinc-950">
              x2
            </span>
          )}
          {die.isBonusExplosionDie && (
            <span className="absolute -bottom-1.5 -right-1.5 rounded bg-cyan-500 px-1 text-[8px] font-black text-zinc-950">
              +
            </span>
          )}
        </div>
      );
    });
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {/* Transparent Fullscreen 3D Physics Canvas */}
      <div
        id="w20-dice-canvas"
        ref={containerRef}
        className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
      />

      {/* Authoritative W20 Roll Result Banner */}
      {activeBanner && (
        <div
          onClick={dismissImmediately}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') dismissImmediately();
          }}
          className={`pointer-events-auto absolute top-16 left-1/2 -translate-x-1/2 cursor-pointer rounded-xl border px-5 py-3.5 shadow-2xl backdrop-blur-md transition ${
            activeBanner.roll.isBotch
              ? 'border-red-500/80 bg-red-950/90 text-red-100'
              : activeBanner.roll.netSuccesses > 0
                ? 'border-emerald-500/60 bg-zinc-900/95 text-zinc-100'
                : 'border-zinc-700 bg-zinc-900/95 text-zinc-300'
          }`}
        >
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-zinc-400">
                {activeBanner.label} • Diff {activeBanner.roll.clampedDifficulty}
              </p>
              <p className="mt-0.5 text-lg font-extrabold tracking-tight uppercase">
                {activeBanner.roll.isBotch
                  ? 'CATASTROPHIC BOTCH!'
                  : activeBanner.roll.netSuccesses > 0
                    ? `${activeBanner.roll.netSuccesses} Net ${
                        activeBanner.roll.netSuccesses === 1
                          ? 'Success'
                          : 'Successes'
                      } (${activeBanner.roll.outcome})`
                    : 'Failure (0 Net Successes)'}
              </p>
            </div>
            {activeBanner.roll.automaticSuccesses > 0 && (
              <span className="rounded-md border border-indigo-400/40 bg-indigo-950/70 px-2 py-1 text-xs font-semibold text-indigo-200">
                +{activeBanner.roll.automaticSuccesses} Willpower Auto
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {renderAuthoritativeFaces(activeBanner)}
          </div>
        </div>
      )}
    </div>
  );
};
