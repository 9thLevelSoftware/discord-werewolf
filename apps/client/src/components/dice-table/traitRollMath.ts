import {
  type AttributeKey,
  type CanonicalAbilityKey,
  computeUserSheetStats,
  lookupSheetAbilityDots,
  resolveSheetShortcut,
  type SheetShortcut,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import { formatTraitName } from '../character-sheet/sheetShared';

export type RollSourceMode = 'traits' | 'manual';

export type ComposerAttributeKey = AttributeKey | 'rage' | 'gnosis' | 'willpower';

export type TraitGroupName = 'Physical' | 'Social' | 'Mental' | 'Inner Traits';

export interface TraitOptionItem {
  key: ComposerAttributeKey;
  label: string;
  shortLabel: string;
  group: TraitGroupName;
  effectiveDots: number;
  baseDots: number;
  formDelta: number;
  specialty?: string;
}

export interface AbilityOptionItem {
  key: string;
  label: string;
  category: 'talents' | 'skills' | 'knowledges' | 'custom';
  dots: number;
  specialty?: string;
  untrainedHint?: string;
}

export interface ResolvedTraitRollSelection {
  hasSelection: boolean;
  attrOption: TraitOptionItem | null;
  abilOption: AbilityOptionItem | null;
  attrDots: number;
  abilDots: number;
  bonusDice: number;
  basePool: number;
  autoSpecialty: boolean;
  specialtyReason?: string;
  effectiveHasSpecialty: boolean;
  autoApplyWounds: boolean;
  effectiveApplyWounds: boolean;
  woundPenalty: number;
  effectivePool: number;
  difficulty: number;
  autoLabel: string;
  formulaSummary: string;
  compactFormula: string;
  perceptionFormMod: number;
  untrainedHint?: string;
}

export const COMPOSER_ATTRIBUTE_GROUPS: ReadonlyArray<{
  group: TraitGroupName;
  keys: readonly ComposerAttributeKey[];
}> = [
  { group: 'Physical', keys: ['strength', 'dexterity', 'stamina'] },
  { group: 'Social', keys: ['charisma', 'manipulation', 'appearance'] },
  { group: 'Mental', keys: ['perception', 'intelligence', 'wits'] },
  { group: 'Inner Traits', keys: ['rage', 'gnosis', 'willpower'] },
];

export const COMPOSER_ABILITY_GROUPS: ReadonlyArray<{
  group: 'Talents' | 'Skills' | 'Knowledges';
  category: 'talents' | 'skills' | 'knowledges';
  keys: readonly CanonicalAbilityKey[];
}> = [
  {
    group: 'Talents',
    category: 'talents',
    keys: [
      'alertness',
      'athletics',
      'brawl',
      'empathy',
      'expression',
      'intimidation',
      'leadership',
      'primal_urge',
      'streetwise',
      'subterfuge',
    ],
  },
  {
    group: 'Skills',
    category: 'skills',
    keys: [
      'animal_ken',
      'crafts',
      'drive',
      'etiquette',
      'firearms',
      'larceny',
      'melee',
      'performance',
      'stealth',
      'survival',
    ],
  },
  {
    group: 'Knowledges',
    category: 'knowledges',
    keys: [
      'academics',
      'computer',
      'enigmas',
      'investigation',
      'law',
      'medicine',
      'occult',
      'rituals',
      'science',
      'technology',
    ],
  },
];

const SHORT_TRAIT_LABELS: Record<ComposerAttributeKey, string> = {
  strength: 'Str',
  dexterity: 'Dex',
  stamina: 'Sta',
  charisma: 'Cha',
  manipulation: 'Man',
  appearance: 'App',
  perception: 'Per',
  intelligence: 'Int',
  wits: 'Wits',
  rage: 'Rage',
  gnosis: 'Gnosis',
  willpower: 'Willpower',
};

function readSpecialty(sheet: W20UserCharacterSheet, key: string): string | undefined {
  const direct = sheet.specialties[key]?.trim();
  if (direct) return direct;
  const normalized = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const norm = sheet.specialties[normalized]?.trim();
  return norm || undefined;
}

export function getSheetTraitOptions(sheet: W20UserCharacterSheet): TraitOptionItem[] {
  const stats = computeUserSheetStats(sheet);
  const items: TraitOptionItem[] = [];

  for (const grp of COMPOSER_ATTRIBUTE_GROUPS) {
    for (const key of grp.keys) {
      let baseDots = 0;
      let effectiveDots = 0;
      if (key === 'rage') {
        baseDots = Math.max(0, Math.floor(sheet.rage.permanent));
        effectiveDots = baseDots;
      } else if (key === 'gnosis') {
        baseDots = Math.max(0, Math.floor(sheet.gnosis.permanent));
        effectiveDots = stats.effectiveGnosisPool;
      } else if (key === 'willpower') {
        baseDots = Math.max(0, Math.floor(sheet.willpower.permanent));
        effectiveDots = baseDots;
      } else {
        baseDots = Math.max(0, Math.floor(sheet.baseAttributes[key]));
        effectiveDots = Math.max(0, Math.floor(stats.effectiveAttributes[key]));
      }

      const specialty = readSpecialty(sheet, key);
      items.push({
        key,
        label: formatTraitName(key),
        shortLabel: SHORT_TRAIT_LABELS[key],
        group: grp.group,
        effectiveDots,
        baseDots,
        formDelta:
          key === 'rage' || key === 'gnosis' || key === 'willpower'
            ? 0
            : effectiveDots - baseDots,
        ...(specialty ? { specialty } : {}),
      });
    }
  }

  return items;
}

export function getSheetAbilityOptions(sheet: W20UserCharacterSheet): AbilityOptionItem[] {
  const items: AbilityOptionItem[] = [];

  for (const grp of COMPOSER_ABILITY_GROUPS) {
    for (const key of grp.keys) {
      const dots = lookupSheetAbilityDots(sheet, key);
      const specialty = readSpecialty(sheet, key);
      const untrainedHint =
        dots === 0
          ? grp.category === 'skills'
            ? 'Untrained Skill'
            : grp.category === 'knowledges'
              ? 'Untrained Knowledge'
              : undefined
          : undefined;
      items.push({
        key,
        label: formatTraitName(key),
        category: grp.category,
        dots,
        ...(specialty ? { specialty } : {}),
        ...(untrainedHint ? { untrainedHint } : {}),
      });
    }
  }

  for (const custom of sheet.customAbilities) {
    const dots = Math.max(0, Math.floor(custom.dots));
    const specialty = custom.specialty?.trim() || readSpecialty(sheet, custom.id);
    const untrainedHint =
      dots === 0
        ? custom.category === 'skills'
          ? 'Untrained Skill'
          : custom.category === 'knowledges'
            ? 'Untrained Knowledge'
            : undefined
        : undefined;
    items.push({
      key: custom.id,
      label: custom.name,
      category: 'custom',
      dots,
      ...(specialty ? { specialty } : {}),
      ...(untrainedHint ? { untrainedHint } : {}),
    });
  }

  return items;
}

export function resolveTraitRollSelection(params: {
  sheet: W20UserCharacterSheet;
  attribute: ComposerAttributeKey | '';
  ability: string;
  bonusDice: number;
  difficulty: number;
  specialtyOverride: boolean | null;
  woundOverride: boolean | null;
}): ResolvedTraitRollSelection {
  const { sheet, attribute, ability, bonusDice, specialtyOverride, woundOverride } = params;
  const clampedDifficulty = Math.max(2, Math.min(10, Math.round(params.difficulty)));
  const stats = computeUserSheetStats(sheet);

  if (!attribute && !ability) {
    const autoApplyWounds = true;
    const effectiveApplyWounds = woundOverride ?? autoApplyWounds;
    const basePool = Math.max(0, bonusDice);
    const effectivePool = Math.max(0, basePool + (effectiveApplyWounds ? stats.woundPenalty : 0));
    return {
      hasSelection: false,
      attrOption: null,
      abilOption: null,
      attrDots: 0,
      abilDots: 0,
      bonusDice,
      basePool,
      autoSpecialty: false,
      effectiveHasSpecialty: specialtyOverride ?? false,
      autoApplyWounds,
      effectiveApplyWounds,
      woundPenalty: stats.woundPenalty,
      effectivePool,
      difficulty: clampedDifficulty,
      autoLabel: '',
      formulaSummary: 'Select an Attribute or Skill to build a roll',
      compactFormula: 'Select traits',
      perceptionFormMod: 0,
    };
  }

  const traitOptions = getSheetTraitOptions(sheet);
  const abilityOptions = getSheetAbilityOptions(sheet);
  const attrOption = attribute ? traitOptions.find((t) => t.key === attribute) ?? null : null;
  const abilOption = ability
    ? abilityOptions.find(
        (a) => a.key === ability || a.label.trim().toLowerCase() === ability.trim().toLowerCase()
      ) ?? null
    : null;

  const attrDots = attrOption ? attrOption.effectiveDots : 0;
  const abilDots = abilOption ? abilOption.dots : ability ? lookupSheetAbilityDots(sheet, ability) : 0;

  const nameParts: string[] = [];
  if (attrOption) nameParts.push(attrOption.label);
  else if (attribute) nameParts.push(formatTraitName(attribute));
  if (abilOption) nameParts.push(abilOption.label);
  else if (ability) nameParts.push(formatTraitName(ability));
  const traitTitle = nameParts.join(' + ');
  const bonusSuffix = bonusDice !== 0 ? ` (${bonusDice > 0 ? `+${bonusDice}` : bonusDice})` : '';
  const autoLabel = `${traitTitle}${bonusSuffix}`;

  const synthetic: SheetShortcut = {
    id: 'trait-roll-builder',
    name: autoLabel,
    source: {
      kind: 'trait_combo',
      attribute: attribute || null,
      ability: ability || null,
      useFormStats: true,
      applyPerceptionFormDiff: false,
      flatModifier: bonusDice,
    },
    difficulty: clampedDifficulty,
    rageDiceCount: 0,
    applyWoundPenalty: true,
    isSecretRoll: false,
  };

  const resolved = resolveSheetShortcut(sheet, synthetic);
  const basePool = Math.max(0, attrDots + abilDots + bonusDice);
  const autoSpecialty = resolved.hasSpecialty;
  const effectiveHasSpecialty = specialtyOverride ?? autoSpecialty;
  const autoApplyWounds = resolved.applyWoundPenalty;
  const effectiveApplyWounds = woundOverride ?? autoApplyWounds;
  const effectivePool = Math.max(0, basePool + (effectiveApplyWounds ? stats.woundPenalty : 0));

  const compactParts: string[] = [];
  if (attribute) compactParts.push(String(attrDots));
  if (ability) compactParts.push(String(abilDots));
  let compactFormula = compactParts.join(' + ');
  if (bonusDice > 0) compactFormula += ` + ${bonusDice}`;
  else if (bonusDice < 0) compactFormula += ` - ${Math.abs(bonusDice)}`;
  if (effectiveApplyWounds && stats.woundPenalty !== 0) {
    compactFormula += ` - ${Math.abs(stats.woundPenalty)} Wnd`;
  }

  return {
    hasSelection: true,
    attrOption,
    abilOption,
    attrDots,
    abilDots,
    bonusDice,
    basePool,
    autoSpecialty,
    ...(resolved.specialtyReason ? { specialtyReason: resolved.specialtyReason } : {}),
    effectiveHasSpecialty,
    autoApplyWounds,
    effectiveApplyWounds,
    woundPenalty: stats.woundPenalty,
    effectivePool,
    difficulty: clampedDifficulty,
    autoLabel,
    formulaSummary: resolved.formulaSummary,
    compactFormula,
    perceptionFormMod: attribute === 'perception' ? stats.perceptionDifficultyMod : 0,
    ...(abilOption?.untrainedHint ? { untrainedHint: abilOption.untrainedHint } : {}),
  };
}
