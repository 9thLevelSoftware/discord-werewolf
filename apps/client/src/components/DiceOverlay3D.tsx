import React, { useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import { type Queued3DRoll, useVttRoomStore } from '../store/useVttRoomStore';
import { RollResultPlaque } from './dice-table/DieFaceTiles';
import {
  DICE_FORCE_FREEZE_MS,
  playRecordedDiceThrow,
  SafeDiceBoxController,
} from './dice-table/rollQueueController';

/**
 * Older combat events lack a Rage dice count.
 */
function getLegacyRageCount(queued: Queued3DRoll, rageDiceHint: number): number {
  const total = queued.roll.effectivePool;
  const isPureRageRoll = /\b(rage|frenzy)\b/i.test(queued.label);
  return isPureRageRoll ? total : Math.min(total, Math.max(0, rageDiceHint));
}

export const DiceOverlay3D: React.FC<{ assetPath?: string }> = ({
  assetPath = '/assets/dice-box/',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const safeBoxRef = useRef<SafeDiceBoxController | null>(null);
  if (!safeBoxRef.current) {
    safeBoxRef.current = new SafeDiceBoxController();
  }
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
        settleTimeout: DICE_FORCE_FREEZE_MS,
      });

      box
        .init()
        .then(() => {
          if (!cancelled) {
            if (container?.querySelector('canvas')) safeBoxRef.current?.setBox(box, true);
          } else {
            try {
              box.clear();
            } catch {
              // Ignore teardown errors
            }
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
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
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [assetPath]);

  const headRoll = diceQueue[0] ?? null;
  const headRollId = headRoll?.id ?? null;

  // 2. Sequentially consume queued rolls from the Durable Object
  useEffect(() => {
    if (!headRoll) return;

    let cancelled = false;

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

      const rageDiceCount = headRoll.rageDiceCount ?? getLegacyRageCount(headRoll, rageHint);
      const safeBox = safeBoxRef.current;
      if (safeBox) {
        await playRecordedDiceThrow(safeBox, headRoll.roll, rageDiceCount, () => cancelled);
      }

      if (cancelled) return;

      safeBox?.clearBoxSafely();
      setActiveBanner({ ...headRoll, rageDiceCount });

      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
      dismissTimerRef.current = setTimeout(() => {
        dismissTimerRef.current = null;
        safeBoxRef.current?.interruptCurrentThrow();
        setActiveBanner(null);
        dequeue3DRoll(headRoll.id);
      }, 4500);
    };

    void runRollAnimation();

    return () => {
      cancelled = true;
      safeBoxRef.current?.interruptCurrentThrow();
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [headRoll, dequeue3DRoll]);

  const dismissImmediately = () => {
    if (!activeBanner) return;
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    safeBoxRef.current?.interruptCurrentThrow();
    const id = activeBanner.id;
    setActiveBanner(null);
    dequeue3DRoll(id);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-drawer overflow-hidden">
      {/* Transparent Fullscreen 3D Physics Canvas */}
      <div
        id="w20-dice-canvas"
        ref={containerRef}
        className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
      />

      {activeBanner && activeBanner.id === headRollId && (
        <div className="pointer-events-auto">
          <RollResultPlaque banner={activeBanner} onDismiss={dismissImmediately} />
        </div>
      )}
    </div>
  );
};
