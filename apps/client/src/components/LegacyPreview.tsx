import React, { useEffect, useState } from 'react';
import { materializeCharacterFromDraft, type W20CharacterCreationDraft } from '@w20-vtt/core';
import { useVttRoomStore } from '../store/useVttRoomStore';
import { ActivityWorkspace } from './ActivityWorkspace';
import { ToastViewport } from './ui';

/**
 * Development-only harness for the campaign (battlemap) screens, which the live app
 * does not mount. Open /?preview=legacy in a dev build. It fills the room store with
 * sample state so every panel and overlay can be seen and checked without a server.
 * Nothing here is shipped to production.
 */

const PREVIEW_USER_ID = 'preview-user';
const PREVIEW_CHARACTER_ID = 'preview-pc-1';

const SAMPLE_DRAFT: W20CharacterCreationDraft = {
  name: 'Talia Stormhowl',
  concept: 'Fianna Galliard',
  breed: 'homid',
  auspice: 'galliard',
  tribe: 'fianna',
  attributePriorities: { physical: 'primary', social: 'secondary', mental: 'tertiary' },
  abilityPriorities: { talents: 'primary', skills: 'secondary', knowledges: 'tertiary' },
  priorityAttributeDots: {
    strength: 2,
    dexterity: 3,
    stamina: 2,
    charisma: 3,
    manipulation: 1,
    appearance: 1,
    perception: 2,
    intelligence: 0,
    wits: 1,
  },
  priorityAbilityDots: {
    alertness: 3,
    athletics: 2,
    brawl: 3,
    empathy: 2,
    expression: 3,
    animal_ken: 2,
    etiquette: 2,
    melee: 2,
    performance: 3,
    enigmas: 2,
    occult: 2,
    rituals: 1,
  },
  priorityBackgroundDots: { allies: 2, totem: 3 },
  startingRenown: { glory: 2, honor: 0, wisdom: 1 },
  selectedGifts: [
    { giftId: 'gift-1', level: 1, slotSource: 'breed' },
    { giftId: 'gift-2', level: 1, slotSource: 'auspice' },
    { giftId: 'gift-3', level: 1, slotSource: 'tribe' },
  ],
  freebieAttributeDots: { stamina: 1 },
  freebieAbilityDots: { alertness: 1, brawl: 1 },
  freebieBackgroundDots: {},
  freebieRageDots: 0,
  freebieGnosisDots: 2,
  freebieWillpowerDots: 2,
  meritsAndFlaws: [],
};

type OverlayKey = 'handout' | 'whisper' | 'frenzy' | 'xcard' | 'error';

function seedRoom(role: 'storyteller' | 'player'): void {
  const character = materializeCharacterFromDraft(SAMPLE_DRAFT, {
    id: PREVIEW_CHARACTER_ID,
    campaignId: 'preview-campaign',
    ownerDiscordId: PREVIEW_USER_ID,
  });
  useVttRoomStore.setState({
    connectionStatus: 'authenticated',
    localDiscordId: PREVIEW_USER_ID,
    campaignId: 'preview-campaign',
    activeCharacterId: PREVIEW_CHARACTER_ID,
    viewerRole: role,
    characters: { [PREVIEW_CHARACTER_ID]: character },
    packTotem: {
      packId: 'preview-pack',
      name: 'Ashen Howl',
      totemName: 'Stag',
      willpowerMax: 5,
      willpowerTemp: 3,
    },
  });
}

function applyOverlay(key: OverlayKey, on: boolean): void {
  const set = useVttRoomStore.setState;
  switch (key) {
    case 'handout':
      set({
        activeHandout: on
          ? {
              id: 'preview-handout',
              imageUrl:
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="100%" height="100%" fill="%23221b22"/><text x="50%" y="50%" fill="%23dab373" font-size="28" text-anchor="middle">Sample handout</text></svg>',
              caption: 'A torn page from the caern ledger',
              pushedAt: Date.now(),
            }
          : null,
      });
      break;
    case 'whisper':
      set({
        whispers: on
          ? [
              {
                id: 'preview-whisper',
                targetDiscordId: PREVIEW_USER_ID,
                senderName: 'Storyteller',
                title: 'You notice something',
                body: 'The scent on the wind is not wolf.',
                sentAt: Date.now(),
              },
            ]
          : [],
      });
      break;
    case 'frenzy':
      set({
        frenzyPrompt: on
          ? {
              characterId: PREVIEW_CHARACTER_ID,
              triggerReason: 'manual_check',
              baseDifficulty: 6,
              moonPhase: 'gibbous',
            }
          : null,
      });
      break;
    case 'xcard':
      set({ safetyPaused: on, safetyPauseReason: on ? 'Sample pause' : null });
      break;
    case 'error':
      set({
        lastError: on ? { code: 'VALIDATION_ERROR', message: 'Sample server rejection.' } : null,
      });
      break;
  }
}

const OVERLAYS: Array<{ key: OverlayKey; label: string }> = [
  { key: 'handout', label: 'Handout' },
  { key: 'whisper', label: 'Whisper' },
  { key: 'frenzy', label: 'Frenzy prompt' },
  { key: 'xcard', label: 'X-Card pause' },
  { key: 'error', label: 'Server error' },
];

export const LegacyPreview: React.FC = () => {
  const [role, setRole] = useState<'storyteller' | 'player'>('storyteller');
  const [active, setActive] = useState<Record<OverlayKey, boolean>>({
    handout: false,
    whisper: false,
    frenzy: false,
    xcard: false,
    error: false,
  });
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    seedRoom(role);
    setSeeded(true);
  }, [role]);

  if (!seeded) return null;

  return (
    <>
      <ToastViewport />
      <ActivityWorkspace />

      {/* Preview controls: bottom centre, above everything, so they never hide a panel edge. */}
      <div
        role="toolbar"
        aria-label="Preview controls"
        className="w20-obsidian-panel fixed bottom-2 left-1/2 z-toast flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs"
      >
        <span className="font-semibold text-stone-300">Preview</span>
        <button
          type="button"
          aria-pressed={role === 'storyteller'}
          onClick={() => setRole((r) => (r === 'storyteller' ? 'player' : 'storyteller'))}
          className="h-7 rounded-lg border border-stone-700 bg-obsidian-950 px-2 font-semibold text-gold-200"
        >
          Role: {role}
        </button>
        {OVERLAYS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={active[key]}
            onClick={() => {
              const next = !active[key];
              applyOverlay(key, next);
              setActive((prev) => ({ ...prev, [key]: next }));
            }}
            className={`h-7 rounded-lg border px-2 font-semibold ${
              active[key]
                ? 'border-gold-300 bg-amber-950/60 text-amber-100'
                : 'border-stone-700 bg-obsidian-950 text-stone-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
};

export default LegacyPreview;
