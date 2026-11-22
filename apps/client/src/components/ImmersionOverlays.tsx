import React, { useEffect, useState } from 'react';
import {
  EyeOff,
  Flame,
  MessageSquareLock,
  PauseCircle,
  Play,
  Shield,
  X,
} from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';
import {
  Button,
  ConfirmButton,
  IconButton,
  Modal,
  NumberStepper,
  Select,
  TextInput,
  useToasts,
} from './ui';

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

  // Show each server rejection once in the shared toast, then clear it.
  useEffect(() => {
    if (!lastError) return;
    useToasts.getState().push({ id: 'room-error', tone: 'error', message: lastError.message });
    useVttRoomStore.getState().clearLastError();
  }, [lastError]);

  const activeChar = activeCharacterId ? characters[activeCharacterId] : undefined;
  const frenziedCharacters = Object.values(characters).filter((c) => c.inFrenzy);

  return (
    <>
      {/* 1. Pack Totem shared pool (top centre, below the status pill) */}
      {packTotem && (
        <div className="w20-obsidian-panel pointer-events-auto absolute top-11 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 rounded-full px-3 py-1 text-xs">
          <Shield className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span className="font-bold text-stone-200">{packTotem.name}</span>
          {packTotem.totemName && <span className="text-emerald-300">({packTotem.totemName})</span>}
          <span className="h-3 w-px bg-stone-700" aria-hidden="true" />
          <NumberStepper
            label="Pack Willpower"
            showLabel
            value={packTotem.willpowerTemp}
            min={0}
            max={packTotem.willpowerMax}
            size="sm"
            valueClassName="text-indigo-300"
            format={(v) => `${v}/${packTotem.willpowerMax}`}
            onChange={(next) =>
              sendCommand({ type: 'PACK_UPDATE_POOL', delta: next - packTotem.willpowerTemp })
            }
          />
        </div>
      )}

      {/* Active frenzy banner for the Storyteller and the frenzied Garou */}
      {(activeChar?.inFrenzy || (viewerRole === 'storyteller' && frenziedCharacters.length > 0)) && (
        <div
          role="status"
          className="pointer-events-auto absolute top-24 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-red-600/80 bg-red-950/90 px-3 py-1.5 text-xs text-red-100 shadow-lg"
        >
          <Flame className="h-3.5 w-3.5 animate-pulse text-red-400" aria-hidden="true" />
          <span>
            {activeChar?.inFrenzy
              ? `${activeChar.name} is in a ${activeChar.frenzyType ?? 'berserk'} frenzy`
              : `In frenzy: ${frenziedCharacters.map((c) => c.name).join(', ')}`}
          </span>
          {viewerRole === 'storyteller' &&
            frenziedCharacters.map((c) => (
              <Button
                key={c.id}
                size="sm"
                onClick={() => sendCommand({ type: 'CHARACTER_CLEAR_FRENZY', characterId: c.id })}
              >
                Calm {c.name}
              </Button>
            ))}
        </div>
      )}

      {/* 2. Private whisper cards */}
      {whispers.length > 0 && (
        <div className="pointer-events-none fixed top-28 left-1/2 z-drawer flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-3">
          {whispers.map((w) => (
            <div
              key={w.id}
              role="status"
              className="w20-obsidian-panel animate-toast-in pointer-events-auto rounded-xl !border-purple-500/70 p-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-display flex items-center gap-1.5 font-bold tracking-wide uppercase text-purple-300">
                  <MessageSquareLock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{w.title}</span>
                </div>
                <IconButton
                  label={`Dismiss whisper: ${w.title}`}
                  icon={<X className="h-3.5 w-3.5" />}
                  size="sm"
                  className="h-7 w-7"
                  onClick={() => dismissWhisper(w.id)}
                />
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-stone-200">{w.body}</p>
              <p className="mt-1.5 text-stone-400">Whisper from {w.senderName}</p>
            </div>
          ))}
        </div>
      )}

      {/* 3. Handout */}
      <Modal
        open={Boolean(activeHandout && hiddenHandoutId !== activeHandout.id)}
        onClose={() => activeHandout && setHiddenHandoutId(activeHandout.id)}
        title="Chronicle handout"
        subtitle="Closing hides it for you only."
        size="md"
        bodyClassName="flex items-center justify-center bg-zinc-900/60 p-4"
        headerActions={
          viewerRole === 'storyteller' ? (
            <ConfirmButton
              prompt="Remove this handout for the whole pack?"
              confirmLabel="Remove"
              onConfirm={() => sendCommand({ type: 'ST_DISMISS_HANDOUT' })}
            >
              Dismiss for pack
            </ConfirmButton>
          ) : undefined
        }
        footer={
          activeHandout?.caption ? (
            <p className="text-center text-sm text-stone-300">{activeHandout.caption}</p>
          ) : undefined
        }
      >
        {activeHandout && (
          <img
            src={activeHandout.imageUrl}
            alt={activeHandout.caption || 'Storyteller handout'}
            className="max-h-[62dvh] rounded-lg object-contain shadow-lg"
          />
        )}
      </Modal>

      {/* Re-open a handout hidden locally */}
      {activeHandout && hiddenHandoutId === activeHandout.id && (
        <Button
          className="pointer-events-auto fixed bottom-24 right-4 z-drawer shadow-lg"
          onClick={() => setHiddenHandoutId(null)}
        >
          <EyeOff className="h-3.5 w-3.5" />
          View handout
        </Button>
      )}

      {/* 4. Frenzy check prompt */}
      <Modal
        open={Boolean(frenzyPrompt)}
        onClose={dismissFrenzyPrompt}
        title="Frenzy check"
        subtitle={frenzyPrompt ? TRIGGER_REASON_LABELS[frenzyPrompt.triggerReason] : undefined}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button onClick={dismissFrenzyPrompt}>Later</Button>
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                if (!frenzyPrompt) return;
                sendCommand({
                  type: 'FRENZY_ROLL_CHECK',
                  characterId: frenzyPrompt.characterId,
                  difficultyMod: frenzyDiffMod || undefined,
                  preferredType: frenzyType,
                });
                dismissFrenzyPrompt();
              }}
            >
              <Flame className="h-4 w-4" />
              Roll frenzy check
            </Button>
          </div>
        }
      >
        {frenzyPrompt && (
          <div className="space-y-3 text-xs">
            <div className="rounded-lg border border-stone-800 bg-zinc-900/70 p-3">
              <p className="text-sm text-stone-200">
                <strong className="text-parchment">
                  {characters[frenzyPrompt.characterId]?.name ?? frenzyPrompt.characterId}
                </strong>
              </p>
              <p className="mt-1 text-stone-300">
                <span className="capitalize">{frenzyPrompt.moonPhase}</span> moon. Base difficulty{' '}
                <strong className="font-mono text-amber-300">{frenzyPrompt.baseDifficulty}</strong>.
                Four or more successes means frenzy.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Frenzy type"
                value={frenzyType}
                onChange={(e) => setFrenzyType(e.target.value as 'berserk' | 'fox')}
              >
                <option value="berserk">Berserk (attack)</option>
                <option value="fox">Fox (flee)</option>
              </Select>
              <TextInput
                label="Difficulty modifier"
                hint="From -5 to +5"
                type="number"
                min={-5}
                max={5}
                value={frenzyDiffMod}
                onChange={(e) =>
                  setFrenzyDiffMod(Math.max(-5, Math.min(5, Number(e.target.value) || 0)))
                }
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 5. Safety pause. It stays until someone resumes, so Escape does not close it. */}
      <Modal
        open={safetyPaused}
        onClose={() => {}}
        title="Scene paused"
        size="sm"
        renderHeader={() => null}
        bodyClassName="p-6 text-center"
      >
        <PauseCircle className="mx-auto h-12 w-12 text-warning" aria-hidden="true" />
        <h2 className="font-display mt-3 text-lg font-black tracking-wide uppercase text-amber-100">
          Scene paused
        </h2>
        <p className="mt-2 text-sm text-stone-300">
          {safetyPauseReason ||
            'Someone at the table asked for a pause. Take a breath and check in with each other in voice before carrying on.'}
        </p>
        <Button
          variant="primary"
          size="touch"
          className="mt-5"
          onClick={() => sendCommand({ type: 'SAFETY_RESUME' })}
        >
          <Play className="h-4 w-4" />
          Resume
        </Button>
      </Modal>
    </>
  );
};
