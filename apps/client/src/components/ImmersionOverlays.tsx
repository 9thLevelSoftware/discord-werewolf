import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  EyeOff,
  Flame,
  MessageSquareLock,
  PauseCircle,
  Play,
  Shield,
  X,
} from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';

const TRIGGER_REASON_LABELS: Record<
  'rage_4_plus_successes' | 'severe_wounds' | 'manual_check',
  string
> = {
  rage_4_plus_successes: '4+ Successes on a Rage Roll!',
  severe_wounds: 'Severe Wound Threshold Reached!',
  manual_check: 'Storyteller Frenzy Provocation',
};

export const ImmersionOverlays: React.FC = () => {
  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const characters = useVttRoomStore((s) => s.characters);
  const packTotem = useVttRoomStore((s) => s.packTotem);
  const activeHandout = useVttRoomStore((s) => s.activeHandout);
  const whispers = useVttRoomStore((s) => s.whispers);
  const frenzyPrompt = useVttRoomStore((s) => s.frenzyPrompt);
  const safetyPaused = useVttRoomStore((s) => s.safetyPaused);
  const safetyPauseReason = useVttRoomStore((s) => s.safetyPauseReason);
  const lastError = useVttRoomStore((s) => s.lastError);

  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const dismissWhisper = useVttRoomStore((s) => s.dismissWhisper);
  const dismissFrenzyPrompt = useVttRoomStore((s) => s.dismissFrenzyPrompt);

  // Local state for handout minimize, frenzy composer, and error toast visibility
  const [hiddenHandoutId, setHiddenHandoutId] = useState<string | null>(null);
  const [frenzyType, setFrenzyType] = useState<'berserk' | 'fox'>('berserk');
  const [frenzyDiffMod, setFrenzyDiffMod] = useState<number>(0);
  const [dismissedErrorObj, setDismissedErrorObj] = useState<typeof lastError>(null);

  useEffect(() => {
    if (!lastError) return;
    const timer = window.setTimeout(() => {
      setDismissedErrorObj(lastError);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [lastError]);

  const showErrorToast = Boolean(lastError && lastError !== dismissedErrorObj);
  const activeChar = activeCharacterId ? characters[activeCharacterId] : undefined;
  const frenziedCharacters = Object.values(characters).filter((c) => c.inFrenzy);

  return (
    <>
      {/* 1. Pack Totem Shared Pool Widget (Top-Center, below status bar) */}
      {packTotem && (
        <div className="pointer-events-auto absolute top-11 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-950/90 px-3 py-1 text-xs shadow-lg backdrop-blur">
          <Shield className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-bold text-zinc-200">{packTotem.name}</span>
          {packTotem.totemName && (
            <span className="text-[11px] text-emerald-300">({packTotem.totemName})</span>
          )}
          <span className="h-3 w-px bg-zinc-700" />
          <span className="text-[11px] text-zinc-400">
            Pack WP:{' '}
            <strong className="font-mono text-indigo-300">
              {packTotem.willpowerTemp}/{packTotem.willpowerMax}
            </strong>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={packTotem.willpowerTemp <= 0}
              onClick={() => sendCommand({ type: 'PACK_UPDATE_POOL', delta: -1 })}
              className="h-5 w-5 rounded-full border border-zinc-700 bg-zinc-900 font-mono text-[11px] font-bold hover:bg-zinc-800 disabled:opacity-40"
            >
              -
            </button>
            <button
              type="button"
              disabled={packTotem.willpowerTemp >= packTotem.willpowerMax}
              onClick={() => sendCommand({ type: 'PACK_UPDATE_POOL', delta: 1 })}
              className="h-5 w-5 rounded-full border border-zinc-700 bg-zinc-900 font-mono text-[11px] font-bold hover:bg-zinc-800 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Active Frenzy Banner for ST / Frenzied Garou */}
      {(activeChar?.inFrenzy || (viewerRole === 'storyteller' && frenziedCharacters.length > 0)) && (
        <div className="pointer-events-auto absolute top-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-600/80 bg-red-950/90 px-3 py-1 text-xs text-red-100 shadow-lg">
          <Flame className="h-3.5 w-3.5 animate-pulse text-red-400" />
          <span>
            {activeChar?.inFrenzy
              ? `${activeChar.name} is in ${activeChar.frenzyType ?? 'berserk'} FRENZY!`
              : `Frenzy Active: ${frenziedCharacters.map((c) => c.name).join(', ')}`}
          </span>
          {viewerRole === 'storyteller' &&
            frenziedCharacters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  sendCommand({ type: 'CHARACTER_CLEAR_FRENZY', characterId: c.id })
                }
                className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-zinc-800"
              >
                Calm {c.name}
              </button>
            ))}
        </div>
      )}

      {/* 2. Private Whisper Toast Cards */}
      {whispers.length > 0 && (
        <div className="pointer-events-none fixed top-24 left-1/2 z-45 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-3">
          {whispers.map((w) => (
            <div
              key={w.id}
              className="pointer-events-auto rounded-xl border border-purple-500/70 bg-zinc-950/95 p-3 text-xs shadow-2xl backdrop-blur"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-wide text-purple-300">
                  <MessageSquareLock className="h-4 w-4 shrink-0" />
                  <span>{w.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => dismissWhisper(w.id)}
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-zinc-200">{w.body}</p>
              <p className="mt-1.5 text-[10px] text-zinc-500">Whisper from {w.senderName}</p>
            </div>
          ))}
        </div>
      )}

      {/* 3. Floating COMMAND_REJECTED Error Toast */}
      {showErrorToast && lastError && (
        <div className="pointer-events-auto fixed bottom-28 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2.5 rounded-xl border border-red-500/80 bg-red-950/95 px-3.5 py-2 text-xs text-red-100 shadow-2xl">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase text-red-300">
              [{lastError.code}]
            </span>{' '}
            <span>{lastError.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedErrorObj(lastError)}
            className="rounded p-0.5 text-red-300 hover:bg-red-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4. Fullscreen Handout Modal */}
      {activeHandout && hiddenHandoutId !== activeHandout.id && (
        <div className="pointer-events-auto fixed inset-0 z-45 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 text-xs">
              <span className="font-extrabold tracking-wider uppercase text-zinc-200">
                Chronicle Handout
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHiddenHandoutId(activeHandout.id)}
                  className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  <EyeOff className="h-3 w-3" />
                  Hide Locally
                </button>
                {viewerRole === 'storyteller' && (
                  <button
                    type="button"
                    onClick={() => sendCommand({ type: 'ST_DISMISS_HANDOUT' })}
                    className="rounded bg-red-700 px-2.5 py-1 font-bold text-white hover:bg-red-600"
                  >
                    Dismiss for Pack
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center overflow-auto bg-zinc-900/60 p-4">
              <img
                src={activeHandout.imageUrl}
                alt={activeHandout.caption || 'Storyteller Handout'}
                className="max-h-[68vh] rounded-lg object-contain shadow-lg"
              />
            </div>

            {activeHandout.caption && (
              <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 text-center text-xs text-zinc-300">
                {activeHandout.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Re-open locally hidden handout pill */}
      {activeHandout && hiddenHandoutId === activeHandout.id && (
        <button
          type="button"
          onClick={() => setHiddenHandoutId(null)}
          className="pointer-events-auto fixed bottom-24 right-4 z-40 rounded-lg border border-indigo-500/70 bg-indigo-950/90 px-3 py-1.5 text-xs font-bold text-indigo-200 shadow-lg"
        >
          View Active Handout
        </button>
      )}

      {/* 5. Interactive Frenzy Check Prompt Modal */}
      {frenzyPrompt && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-600/80 bg-zinc-950 p-5 text-xs text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-red-400">
                <Flame className="h-6 w-6 animate-pulse" />
                <div>
                  <h3 className="text-sm font-black tracking-wider uppercase">
                    Frenzy Check Triggered!
                  </h3>
                  <p className="text-[11px] text-red-200/80">
                    {TRIGGER_REASON_LABELS[frenzyPrompt.triggerReason]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissFrenzyPrompt}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-zinc-300">
                Garou:{' '}
                <strong className="text-white">
                  {characters[frenzyPrompt.characterId]?.name ?? frenzyPrompt.characterId}
                </strong>
              </p>
              <p className="mt-1 capitalize text-zinc-400">
                Moon Phase: <strong className="text-zinc-200">{frenzyPrompt.moonPhase}</strong> •
                Base Difficulty:{' '}
                <strong className="font-mono text-amber-300">
                  {frenzyPrompt.baseDifficulty}
                </strong>{' '}
                (4+ net successes triggers Frenzy)
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Frenzy Type</span>
                <select
                  value={frenzyType}
                  onChange={(e) => setFrenzyType(e.target.value as 'berserk' | 'fox')}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5"
                >
                  <option value="berserk">Berserk Frenzy (Attack!)</option>
                  <option value="fox">Fox Frenzy (Flee!)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase text-zinc-400">
                  Diff Modifier (-5 to +5)
                </span>
                <input
                  type="number"
                  min={-5}
                  max={5}
                  value={frenzyDiffMod}
                  onChange={(e) =>
                    setFrenzyDiffMod(Math.max(-5, Math.min(5, Number(e.target.value) || 0)))
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono"
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={dismissFrenzyPrompt}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Skip / Later
              </button>
              <button
                type="button"
                onClick={() => {
                  sendCommand({
                    type: 'FRENZY_ROLL_CHECK',
                    characterId: frenzyPrompt.characterId,
                    difficultyMod: frenzyDiffMod || undefined,
                    preferredType: frenzyType,
                  });
                  dismissFrenzyPrompt();
                }}
                className="flex-1 rounded-lg bg-red-700 py-2 font-extrabold uppercase tracking-wider text-white hover:bg-red-600"
              >
                Roll Rage Frenzy Check
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Fullscreen Safety X-Card Pause Overlay */}
      {safetyPaused && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/95 p-6 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/60 bg-zinc-900 p-6 text-center shadow-2xl">
            <PauseCircle className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-3 text-lg font-black tracking-wide uppercase text-zinc-100">
              Scene Paused — X-Card
            </h2>
            <p className="mt-2 text-xs text-zinc-300">
              {safetyPauseReason ||
                'A table participant requested an immediate safety pause. Take a breath and check in with your pack in voice chat before continuing.'}
            </p>
            <button
              type="button"
              onClick={() => sendCommand({ type: 'SAFETY_RESUME' })}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-emerald-600"
            >
              <Play className="h-4 w-4" />
              Resume Chronicle
            </button>
          </div>
        </div>
      )}
    </>
  );
};
