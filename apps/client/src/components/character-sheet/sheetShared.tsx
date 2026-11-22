import React from 'react';
import {
  AbilityCategory,
  AttributeKey,
  Auspice,
  Breed,
  CanonicalAbilityKey,
  GarouForm,
  GarouTribe,
  resolveSheetShortcut,
  SheetShortcut,
  W20_BACKGROUND_CATALOG,
  W20UserCharacterSheet,
} from '@w20-vtt/core';
import { diceSoundEngine } from '../../audio/DiceSoundEngine';
import type { SheetRollRequest } from '../../store/useCharacterSheetStore';

export const W20_BREEDS: readonly { key: Breed; label: string }[] = [
  { key: 'homid', label: 'Homid' },
  { key: 'metis', label: 'Metis' },
  { key: 'lupus', label: 'Lupus' },
];

export const W20_AUSPICES: readonly { key: Auspice; label: string; moon: string }[] = [
  { key: 'ragabash', label: 'Ragabash', moon: 'New Moon' },
  { key: 'theurge', label: 'Theurge', moon: 'Crescent Moon' },
  { key: 'philodox', label: 'Philodox', moon: 'Half Moon' },
  { key: 'galliard', label: 'Galliard', moon: 'Gibbous Moon' },
  { key: 'ahroun', label: 'Ahroun', moon: 'Full Moon' },
];

export const W20_FORMS: readonly GarouForm[] = ['homid', 'glabro', 'crinos', 'hispo', 'lupus'];

export const W20_TRIBES: readonly { key: GarouTribe | string; label: string }[] = [
  { key: 'black_furies', label: 'Black Furies' },
  { key: 'bone_gnawers', label: 'Bone Gnawers' },
  { key: 'children_of_gaia', label: 'Children of Gaia' },
  { key: 'fianna', label: 'Fianna' },
  { key: 'get_of_fenris', label: 'Get of Fenris' },
  { key: 'glass_walkers', label: 'Glass Walkers' },
  { key: 'red_talons', label: 'Red Talons' },
  { key: 'shadow_lords', label: 'Shadow Lords' },
  { key: 'silent_striders', label: 'Silent Striders' },
  { key: 'silver_fangs', label: 'Silver Fangs' },
  { key: 'stargazers', label: 'Stargazers' },
  { key: 'uktena', label: 'Uktena' },
  { key: 'wendigo', label: 'Wendigo' },
  { key: 'ronin', label: 'Ronin / Custom' },
];

export const W20_RANK_NAMES: readonly string[] = [
  '0 • Cub',
  '1 • Cliath',
  '2 • Fostern',
  '3 • Adren',
  '4 • Athro',
  '5 • Elder',
  '6 • Legend',
];

export const CANONICAL_BACKGROUND_SUGGESTIONS: readonly string[] = W20_BACKGROUND_CATALOG.map(
  (entry) => entry.label
);

export const DEFAULT_ATTR_FOR_ABILITY: Record<CanonicalAbilityKey, AttributeKey> = {
  alertness: 'perception',
  athletics: 'dexterity',
  brawl: 'dexterity',
  empathy: 'perception',
  expression: 'charisma',
  intimidation: 'strength',
  leadership: 'charisma',
  primal_urge: 'stamina',
  streetwise: 'charisma',
  subterfuge: 'manipulation',
  animal_ken: 'charisma',
  crafts: 'dexterity',
  drive: 'dexterity',
  etiquette: 'charisma',
  firearms: 'dexterity',
  larceny: 'dexterity',
  melee: 'dexterity',
  performance: 'charisma',
  stealth: 'dexterity',
  survival: 'perception',
  academics: 'intelligence',
  computer: 'intelligence',
  enigmas: 'perception',
  investigation: 'perception',
  law: 'intelligence',
  medicine: 'intelligence',
  occult: 'intelligence',
  rituals: 'wits',
  science: 'intelligence',
  technology: 'intelligence',
};

export function getDefaultAttributeForAbility(
  abilityKeyOrId: string,
  category?: AbilityCategory
): AttributeKey {
  if (abilityKeyOrId in DEFAULT_ATTR_FOR_ABILITY) {
    return DEFAULT_ATTR_FOR_ABILITY[abilityKeyOrId as CanonicalAbilityKey];
  }
  if (category === 'knowledges') return 'intelligence';
  if (category === 'talents') return 'perception';
  return 'dexterity';
}

export function formatTraitName(raw: string): string {
  if (!raw.trim()) return '';
  if (raw === 'primal_urge') return 'Primal-Urge';
  const tribeMatch = W20_TRIBES.find((t) => t.key === raw);
  if (tribeMatch) return tribeMatch.label;
  return raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatFormName(form: GarouForm): string {
  return form.charAt(0).toUpperCase() + form.slice(1);
}

export function shortcutToRollRequest(
  sheet: W20UserCharacterSheet,
  shortcut: SheetShortcut
): SheetRollRequest {
  const resolved = resolveSheetShortcut(sheet, shortcut);
  return {
    label: resolved.label,
    pool: resolved.basePool,
    difficulty: resolved.difficulty,
    hasSpecialty: resolved.hasSpecialty,
    applyWoundPenalty: resolved.applyWoundPenalty,
    rageDiceCount: resolved.rageDiceCount,
    isSecretRoll: resolved.isSecretRoll,
  };
}

export type PipTone = 'amber' | 'crimson' | 'cyan' | 'indigo' | 'emerald';

const PIP_TONE_STYLES: Record<PipTone, { filled: string; empty: string }> = {
  amber: {
    filled:
      'border-amber-200/85 bg-gradient-to-br from-amber-300 to-amber-700 shadow-[0_0_6px_rgba(245,158,11,0.5)]',
    empty: 'border-stone-600/60 bg-zinc-950/90 hover:border-amber-400/70',
  },
  crimson: {
    filled:
      'border-red-300/85 bg-gradient-to-br from-red-500 to-red-900 shadow-[0_0_6px_rgba(220,38,38,0.6)]',
    empty: 'border-stone-600/60 bg-zinc-950/90 hover:border-red-400/70',
  },
  cyan: {
    filled:
      'border-cyan-200/85 bg-gradient-to-br from-cyan-400 to-cyan-800 shadow-[0_0_6px_rgba(34,211,238,0.5)]',
    empty: 'border-stone-600/60 bg-zinc-950/90 hover:border-cyan-400/70',
  },
  indigo: {
    filled:
      'border-indigo-200/85 bg-gradient-to-br from-indigo-400 to-indigo-800 shadow-[0_0_6px_rgba(129,140,248,0.5)]',
    empty: 'border-stone-600/60 bg-zinc-950/90 hover:border-indigo-400/70',
  },
  emerald: {
    filled:
      'border-emerald-200/85 bg-gradient-to-br from-emerald-400 to-emerald-800 shadow-[0_0_6px_rgba(52,211,153,0.45)]',
    empty: 'border-stone-600/60 bg-zinc-950/90 hover:border-emerald-400/70',
  },
};

interface SheetPipTrackProps {
  label: string;
  value: number;
  max?: number;
  shape?: 'circle' | 'square';
  tone?: PipTone;
  isMobile: boolean;
  onChange: (nextValue: number) => void;
}

export const SheetPipTrack: React.FC<SheetPipTrackProps> = ({
  label,
  value,
  max = 5,
  shape = 'circle',
  tone = 'amber',
  isMobile,
  onChange,
}) => {
  const styles = PIP_TONE_STYLES[tone];
  const clamped = Math.max(0, Math.min(max, Math.floor(value)));
  const sizeClass = isMobile ? 'h-6 w-6' : 'h-3.5 w-3.5';
  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-[3px]';

  return (
    <div
      className={`flex flex-wrap items-center ${isMobile ? 'gap-1.5' : 'gap-1'}`}
      role="group"
      aria-label={label}
    >
      {Array.from({ length: max }, (_, idx) => {
        const rating = idx + 1;
        const active = rating <= clamped;
        const nextValue = clamped === rating ? rating - 1 : rating;
        return (
          <button
            key={rating}
            type="button"
            onClick={() => {
              diceSoundEngine.playPipClick();
              onChange(nextValue);
            }}
            aria-label={`Set ${label} to ${nextValue}`}
            aria-pressed={active}
            className={`${sizeClass} ${radiusClass} border transition-transform duration-100 hover:scale-110 active:scale-95 focus:outline-none focus:ring-1 focus:ring-amber-400/65 ${
              active ? styles.filled : styles.empty
            }`}
          />
        );
      })}
    </div>
  );
};
