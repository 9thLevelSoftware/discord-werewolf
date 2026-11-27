import React, { useMemo } from 'react';
import type { W20RollResult } from '@w20-vtt/core';
import { Check, EyeOff, Skull, X, Zap } from 'lucide-react';
import type { Queued3DRoll } from '../../store/useVttRoomStore';

export interface DecoratedDie {
  sourceIndex: number;
  chainRootIndex: number;
  value: number;
  contributedSuccesses: number;
  isOne: boolean;
  isBonusExplosionDie: boolean;
  canceledSuccesses: number;
  isRageDie: boolean;
}

export function buildDecoratedFaces(roll: W20RollResult, rageDiceCount: number): DecoratedDie[] {
  const clampedRage = Math.min(roll.effectivePool, Math.max(0, rageDiceCount));
  const obsidianCount = Math.max(0, roll.effectivePool - clampedRage);

  let nonBonusIdx = 0;
  const faces: DecoratedDie[] = [];
  for (const [sourceIndex, die] of roll.dice.entries()) {
    const parent = die.isBonusExplosionDie
      ? faces[die.parentIndex ?? sourceIndex - 1]
      : undefined;
    const isRageDie = !die.isBonusExplosionDie && nonBonusIdx >= obsidianCount;
    if (!die.isBonusExplosionDie) nonBonusIdx += 1;
    faces.push({
      ...die,
      sourceIndex,
      chainRootIndex: parent?.chainRootIndex ?? sourceIndex,
      isRageDie,
      canceledSuccesses: 0,
    });
  }

  const sorted = [...faces].sort((a, b) => b.value - a.value);
  let remainingCancels = roll.onesRolled;
  for (const die of sorted) {
    die.canceledSuccesses = Math.min(die.contributedSuccesses, remainingCancels);
    remainingCancels -= die.canceledSuccesses;
  }

  if (!faces.some((die) => die.isBonusExplosionDie)) return sorted;
  return faces.sort((a, b) => a.chainRootIndex - b.chainRootIndex || a.sourceIndex - b.sourceIndex);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'W';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function formatRollTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const ParticipantAvatar: React.FC<{
  name: string;
  avatarUrl: string | null;
  isSpeaking?: boolean;
  isConnected?: boolean;
  sizeClass?: string;
}> = ({ name, avatarUrl, isSpeaking = false, isConnected = true, sizeClass = 'h-8 w-8' }) => {
  const ringClass = isSpeaking
    ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
    : 'ring-1 ring-amber-400/35';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ${ringClass} ${isConnected ? '' : 'grayscale opacity-50'}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} font-display flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 text-xs font-bold text-amber-100 ${ringClass} ${isConnected ? '' : 'opacity-50'}`}
    >
      {getInitials(name)}
    </div>
  );
};

export const AuthoritativeDieChips: React.FC<{
  roll: W20RollResult;
  rageDiceCount: number;
  compact?: boolean;
}> = ({ roll, rageDiceCount, compact = false }) => {
  const isInitiative = roll.rollMode === 'initiative';
  const faces = useMemo(() => buildDecoratedFaces(roll, rageDiceCount), [roll, rageDiceCount]);
  const chipSize = compact ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';

  if (faces.length === 0) {
    return <p className="text-xs text-stone-400">No dice rolled</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {faces.map((die, idx) => {
        const isSuccess = die.contributedSuccesses > 0;
        const isCanceled = isSuccess && die.contributedSuccesses === die.canceledSuccesses;
        let style =
          'border-stone-700/75 bg-gradient-to-b from-zinc-800/90 to-zinc-950 text-stone-400';
        if (isInitiative) {
          style =
            'border-amber-400/90 bg-gradient-to-b from-amber-900/90 to-zinc-950 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.35)]';
        } else if (die.isOne) {
          style =
            'border-red-500/85 bg-gradient-to-b from-red-950 to-zinc-950 text-red-300 shadow-[0_0_8px_rgba(220,38,38,0.4)]';
        } else if (isCanceled) {
          style =
            'border-stone-700/50 bg-zinc-900/60 text-stone-400 line-through decoration-red-400/80 decoration-2';
        } else if (isSuccess) {
          style =
            'border-emerald-500/75 bg-gradient-to-b from-emerald-950/90 to-zinc-950 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
        }

        const rageRing =
          !isInitiative && die.isRageDie
            ? 'ring-1 ring-red-500/80 ring-offset-1 ring-offset-zinc-950'
            : '';
        const followsParent =
          die.isBonusExplosionDie && faces[idx - 1]?.chainRootIndex === die.chainRootIndex;
        const faceDescription = isInitiative
          ? `Initiative die, ${die.value}`
          : [
              die.isBonusExplosionDie
                ? 'Specialty bonus die'
                : die.isRageDie ? 'Rage die' : 'Obsidian die',
              String(die.value),
              followsParent ? 'Continues previous die' : '',
              die.isOne
                ? 'Counts toward success cancellation and botch'
                : die.isBonusExplosionDie && die.value === 1
                  ? 'No cancellation'
                  : die.contributedSuccesses === 2
                    ? '2 successes'
                    : die.contributedSuccesses === 1
                      ? '1 success'
                      : '',
              die.canceledSuccesses > 0 ? `${die.canceledSuccesses} canceled` : '',
            ].filter(Boolean).join(', ');

        return (
          <div key={die.sourceIndex} className="inline-flex items-center gap-1.5">
            {followsParent && <span aria-hidden="true" className="text-xs text-cyan-300">→</span>}
            <div
              role="img"
              aria-label={faceDescription}
              title={faceDescription}
              className={`font-display relative flex ${chipSize} items-center justify-center rounded-lg border font-bold shadow ${style} ${rageRing}`}
            >
              {die.value}
              {!isInitiative && die.contributedSuccesses === 2 && (
                <span className="absolute -top-1.5 -right-1.5 rounded border border-amber-300/80 bg-gradient-to-b from-amber-300 to-amber-600 px-1 font-sans text-xs font-black text-zinc-950 shadow">
                  x2
                </span>
              )}
              {die.canceledSuccesses > 0 && die.contributedSuccesses === 2 && (
                <span className="absolute -bottom-1.5 -right-1.5 rounded bg-red-800 px-1 text-xs text-red-100">
                  −{die.canceledSuccesses}
                </span>
              )}
              {die.isBonusExplosionDie && (
                <span className="absolute -bottom-1.5 -right-1.5 rounded bg-cyan-500 px-1 text-xs text-zinc-950">
                  +
                </span>
              )}
              {!isInitiative && die.isRageDie && (
                <span className="absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ActiveThrowPill: React.FC<{
  activeThrowLabel: string | null;
  queuedCount: number;
  compact?: boolean;
  /** Desktop only: distance from the top of the stage, below the measured top bar. */
  topOffset?: number;
}> = ({ activeThrowLabel, queuedCount, compact = false, topOffset }) => (
  <div
    role="status"
    aria-live="polite"
    style={!compact && topOffset !== undefined ? { top: topOffset } : undefined}
    className={`w20-obsidian-panel pointer-events-none absolute left-1/2 z-20 flex max-w-[min(92vw,520px)] -translate-x-1/2 items-center gap-2 rounded-full !border-amber-500/45 px-3.5 py-1.5 shadow-xl ${
      compact ? 'top-14 mt-[env(safe-area-inset-top,0px)] text-xs' : 'top-16 text-xs'
    }`}
  >
    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
    <span className="truncate font-semibold text-amber-100">
      Rolling: {activeThrowLabel || 'W20 Dice Pool'}
    </span>
    {queuedCount > 0 && (
      <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-950/80 px-2 py-0.5 font-mono text-xs font-extrabold text-amber-200">
        +{queuedCount} queued
      </span>
    )}
  </div>
);

interface RollResultPlaqueProps {
  banner: Queued3DRoll;
  onDismiss: () => void;
  compact?: boolean;
  queuedCount?: number;
  nextQueuedLabel?: string | null;
  /** Desktop only: distance from the top of the stage, below the measured top bar. */
  topOffset?: number;
}

type PlaqueTone = 'success' | 'failure' | 'botch' | 'initiative';

const PLAQUE_TONES: Record<
  PlaqueTone,
  { border: string; numeral: string; word: string; Icon: typeof Check }
> = {
  success: {
    border: '!border-emerald-500/70',
    numeral: 'border-emerald-500/60 bg-emerald-950/60 text-emerald-200 shadow-glow-emerald',
    word: 'text-emerald-300',
    Icon: Check,
  },
  failure: {
    border: '!border-stone-600/80',
    numeral: 'border-stone-600 bg-obsidian-900 text-stone-300',
    word: 'text-stone-300',
    Icon: X,
  },
  botch: {
    border: '!border-red-500/85',
    numeral: 'border-red-500/70 bg-red-950/70 text-red-200 shadow-glow-crimson',
    word: 'text-red-300',
    Icon: Skull,
  },
  initiative: {
    border: '!border-amber-400/80',
    numeral: 'border-amber-400/70 bg-amber-950/60 text-amber-100 shadow-glow-gold',
    word: 'text-amber-200',
    Icon: Zap,
  },
};

/**
 * The result of a roll, shown over the felt. The outcome is carried three ways at
 * once (a large number, an icon and a word) so it never depends on colour alone.
 */
export const RollResultPlaque: React.FC<RollResultPlaqueProps> = ({
  banner,
  onDismiss,
  compact = false,
  queuedCount = 0,
  nextQueuedLabel = null,
  topOffset,
}) => {
  const isInitiative = banner.roll.rollMode === 'initiative';
  const initDie = banner.roll.dice[0]?.value ?? 0;
  const initMod = banner.roll.initiativeModifier ?? 0;
  const initTotal = banner.roll.initiativeTotal ?? initDie + initMod;
  const modExpr = initMod >= 0 ? `+ ${initMod}` : `- ${Math.abs(initMod)}`;
  const net = banner.roll.netSuccesses;

  const tone: PlaqueTone = isInitiative
    ? 'initiative'
    : banner.roll.isBotch
      ? 'botch'
      : net > 0
        ? 'success'
        : 'failure';
  const toneStyle = PLAQUE_TONES[tone];
  const ToneIcon = toneStyle.Icon;

  const numeral = isInitiative ? initTotal : banner.roll.isBotch ? 0 : net;
  const numeralCaption = isInitiative ? 'total' : net === 1 ? 'success' : 'successes';

  const outcomeWord = isInitiative
    ? 'Initiative'
    : banner.roll.isBotch
      ? 'Botch'
      : net > 0
        ? `${banner.roll.outcome} success`
        : 'Failure';

  return (
    <div
      role="status"
      aria-live="polite"
      style={!compact && topOffset !== undefined ? { top: topOffset } : undefined}
      className={`w20-obsidian-panel animate-plaque-in absolute left-1/2 z-20 -translate-x-1/2 ${
        compact
          ? 'top-14 mt-[env(safe-area-inset-top,0px)] w-[min(94%,440px)] rounded-xl px-3 py-2.5'
          : 'top-16 w-[min(92%,560px)] rounded-2xl px-4 py-3.5'
      } ${toneStyle.border}`}
    >
      <div className={`flex items-stretch ${compact ? 'gap-2.5' : 'gap-3.5'}`}>
        {/* The number: the first thing read from across the room. */}
        <div
          className={`flex shrink-0 flex-col items-center justify-center rounded-xl border ${
            compact ? 'h-14 w-[4.5rem]' : 'h-[4.5rem] w-20'
          } ${toneStyle.numeral}`}
        >
          <span
            className={`font-display font-black leading-none tabular-nums ${
              compact ? 'text-3xl' : 'text-4xl'
            }`}
          >
            {numeral}
          </span>
          <span className="mt-0.5 text-xs font-semibold leading-none opacity-90">
            {numeralCaption}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p
            className={`font-display flex items-center gap-1.5 font-black tracking-wide uppercase ${
              compact ? 'text-base leading-tight' : 'text-lg leading-tight'
            } ${toneStyle.word}`}
          >
            <ToneIcon className={compact ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} />
            <span className="truncate">{outcomeWord}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-300">
            <ParticipantAvatar
              name={banner.rollerName ?? 'Player'}
              avatarUrl={banner.rollerAvatarUrl ?? null}
              sizeClass="h-5 w-5 shrink-0"
            />
            <span className="max-w-[140px] truncate font-bold text-amber-100">
              {banner.rollerName ?? 'Player'}
            </span>
            <span className="max-w-[160px] truncate">{banner.label}</span>
            <span className="font-mono text-amber-300/90">
              {isInitiative
                ? `1d10 [${initDie}] ${modExpr}`
                : `Diff ${banner.roll.clampedDifficulty}`}
            </span>
            {banner.isSecretRoll && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/50 bg-amber-950/80 px-1.5 py-0.5 text-xs font-bold text-amber-200">
                <EyeOff className="h-2.5 w-2.5" /> Secret
              </span>
            )}
            {!isInitiative && banner.roll.automaticSuccesses > 0 && (
              <span className="rounded-full border border-indigo-400/50 bg-indigo-950/80 px-1.5 py-0.5 text-xs font-bold text-indigo-200">
                +{banner.roll.automaticSuccesses} Willpower
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label={
            queuedCount > 0 ? 'Dismiss result and show the next roll' : 'Dismiss roll result'
          }
          title="Dismiss (the dice stay on the felt)"
          onClick={onDismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-lg text-stone-300 transition hover:bg-obsidian-800 hover:text-parchment"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className={compact ? 'mt-2' : 'mt-3'}>
        <AuthoritativeDieChips
          roll={banner.roll}
          rageDiceCount={banner.rageDiceCount ?? 0}
          compact={compact}
        />
      </div>

      {queuedCount > 0 && (
        <div
          className={`flex items-center justify-between gap-2 border-t border-amber-500/20 text-xs ${
            compact ? 'mt-2 pt-2' : 'mt-3 pt-2.5'
          }`}
        >
          <p className="min-w-0 truncate text-stone-300">
            <span className="font-mono font-extrabold text-amber-300">+{queuedCount} waiting</span>
            {nextQueuedLabel ? ` • Next: ${nextQueuedLabel}` : ''}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 shrink-0 items-center rounded-lg border border-gold-500/45 bg-obsidian-900 px-2.5 font-semibold text-gold-200 transition hover:border-gold-300"
          >
            Show next roll
          </button>
        </div>
      )}
    </div>
  );
};
