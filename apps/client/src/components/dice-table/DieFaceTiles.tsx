import React, { useMemo } from 'react';
import type { W20RollResult } from '@w20-vtt/core';
import { EyeOff, X } from 'lucide-react';
import type { Queued3DRoll } from '../../store/useVttRoomStore';

export interface DecoratedDie {
  value: number;
  contributedSuccesses: number;
  isOne: boolean;
  isBonusExplosionDie: boolean;
  isCanceled: boolean;
  isRageDie: boolean;
}

export function buildDecoratedFaces(roll: W20RollResult, rageDiceCount: number): DecoratedDie[] {
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
      className={`${sizeClass} font-display flex items-center justify-center rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 text-[11px] font-bold text-amber-100 ${ringClass} ${isConnected ? '' : 'opacity-50'}`}
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
  const faces = useMemo(() => buildDecoratedFaces(roll, rageDiceCount), [roll, rageDiceCount]);
  const chipSize = compact ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-sm';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {faces.map((die, idx) => {
        const isSuccess = die.contributedSuccesses > 0;
        let style =
          'border-stone-700/75 bg-gradient-to-b from-zinc-800/90 to-zinc-950 text-stone-400';
        if (die.isOne) {
          style =
            'border-red-500/85 bg-gradient-to-b from-red-950 to-zinc-950 text-red-300 shadow-[0_0_8px_rgba(220,38,38,0.4)]';
        } else if (die.isCanceled) {
          style =
            'border-stone-700/50 bg-zinc-900/60 text-stone-500 line-through decoration-red-400/80 decoration-2';
        } else if (isSuccess) {
          style =
            'border-emerald-500/75 bg-gradient-to-b from-emerald-950/90 to-zinc-950 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]';
        }

        const rageRing = die.isRageDie
          ? 'ring-1 ring-red-500/80 ring-offset-1 ring-offset-zinc-950'
          : '';

        return (
          <div
            key={idx}
            className={`font-display relative flex ${chipSize} items-center justify-center rounded-lg border font-bold shadow ${style} ${rageRing}`}
            title={
              [
                die.isRageDie ? 'Rage Die' : 'Obsidian Die',
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
              <span className="absolute -top-1.5 -right-1.5 rounded border border-amber-300/80 bg-gradient-to-b from-amber-300 to-amber-600 px-1 font-sans text-[8px] font-black text-zinc-950 shadow">
                x2
              </span>
            )}
            {die.isRageDie && (
              <span className="absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
            )}
          </div>
        );
      })}
    </div>
  );
};

interface RollResultPlaqueProps {
  banner: Queued3DRoll;
  onDismiss: () => void;
}

export const RollResultPlaque: React.FC<RollResultPlaqueProps> = ({ banner, onDismiss }) => {
  const accentBorder = banner.roll.isBotch
    ? '!border-red-500/85'
    : banner.roll.netSuccesses > 0
      ? '!border-emerald-500/70'
      : '';

  return (
    <div
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDismiss();
      }}
      title="Click to dismiss plaque (dice stay on felt)"
      className={`w20-obsidian-panel absolute top-16 left-1/2 z-20 w-[min(92%,560px)] -translate-x-1/2 cursor-pointer rounded-2xl px-4 py-3 transition hover:brightness-105 ${accentBorder}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ParticipantAvatar
            name={banner.rollerName ?? 'Player'}
            avatarUrl={banner.rollerAvatarUrl ?? null}
            sizeClass="h-9 w-9"
          />
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-stone-300">
              <span className="font-bold text-amber-100">{banner.rollerName ?? 'Player'}</span>
              <span className="text-stone-600">•</span>
              <span>{banner.label}</span>
              <span className="text-stone-600">•</span>
              <span className="font-mono text-amber-300/90">
                Diff {banner.roll.clampedDifficulty}
              </span>
              {banner.isSecretRoll && (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/50 bg-amber-950/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                  <EyeOff className="h-2.5 w-2.5" /> Secret
                </span>
              )}
            </div>
            <p
              className={`font-display mt-0.5 text-base font-black tracking-wide uppercase ${
                banner.roll.isBotch
                  ? 'text-red-300'
                  : banner.roll.netSuccesses > 0
                    ? 'text-emerald-300'
                    : 'text-stone-300'
              }`}
            >
              {banner.roll.isBotch
                ? 'Catastrophic Botch'
                : banner.roll.netSuccesses > 0
                  ? `${banner.roll.netSuccesses} Net ${
                      banner.roll.netSuccesses === 1 ? 'Success' : 'Successes'
                    } (${banner.roll.outcome})`
                  : 'Failure — 0 Net Successes'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {banner.roll.automaticSuccesses > 0 && (
            <span className="rounded-full border border-indigo-400/50 bg-indigo-950/80 px-2 py-0.5 text-[10px] font-bold text-indigo-200">
              +{banner.roll.automaticSuccesses} WP
            </span>
          )}
          <X className="h-4 w-4 text-stone-400" />
        </div>
      </div>

      {banner.roll.dice.length > 0 && (
        <div className="mt-2.5">
          <AuthoritativeDieChips
            roll={banner.roll}
            rageDiceCount={banner.rageDiceCount ?? 0}
          />
        </div>
      )}
    </div>
  );
};
