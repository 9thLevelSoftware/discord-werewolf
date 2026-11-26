import { applyRuleValue, effectiveRuleHealth, evaluateModifierRules, getSheetModifierSources, ruleTraits, ruleSilverPenalty, resolveRulePenalties } from './modifierRules';
import type { RuleBinding, ActiveRuleInstance, RuleContext, AppliedRuleModifier, EvaluatedRules } from './ruleTypes';
import {
  AbilityCategory,
  ABILITY_GROUPS,
  STARTING_GNOSIS_BY_BREED,
  STARTING_RAGE_BY_AUSPICE,
  STARTING_WILLPOWER_BY_TRIBE,
  validateW20CharacterCreation,
  W20_BACKGROUND_CATALOG,
  W20CharacterCreationDraft,
} from './characterCreation';
import { giftSheetSummary, W20_GIFT_CATALOG } from './catalog';
import type { W20GiftCatalogEntry } from './catalog';
import { computeWoundState, FormModifierSpec, getBreedNaturalForm, W20_FORM_MATRIX } from './forms';
import {
  AttributeKey,
  Auspice,
  BaseAttributes,
  Breed,
  CanonicalAbilityKey,
  DamageType,
  DualTracker,
  GarouForm,
  GarouTribe,
  HealthState,
  MeritFlawCategory,
} from './types';

export interface CustomAbilityEntry {
  id: string;
  category: AbilityCategory;
  name: string;
  dots: number;
  specialty?: string;
}

export interface SheetBackgroundEntry extends RuleBinding {
  id: string;
  name: string;
  dots: number;
}

export interface SheetGiftEntry extends RuleBinding {
  id: string;
  name: string;
  level: number;
  rollAttribute?: AttributeKey | 'rage' | 'gnosis' | 'willpower' | null;
  rollAbility?: string | null;
  difficulty?: number;
  rageCost?: number;
  gnosisCost?: number;
  willpowerCost?: number;
  summary: string;
}

export interface SheetFetishItem extends RuleBinding {
  id: string;
  name: string;
  level: number;
  gnosisRating: number;
  power: string;
  carried?: boolean;
  active?: boolean;
  isSilver?: boolean;
  isAttuned?: boolean;
}

export interface SheetRiteEntry extends RuleBinding {
  id: string;
  name: string;
  level?: number;
  summary: string;
}

export type OtherTraitKind = 'merit' | 'flaw' | 'other';

export interface SheetOtherTraitEntry extends RuleBinding {
  id: string;
  name: string;
  dots: number;
  kind?: OtherTraitKind;
  category?: MeritFlawCategory;
}

/**
 * Resolves the semantic classification ('merit' | 'flaw' | 'other') for an OtherTrait entry,
 * falling back to legacy "(Merit)" / "(Flaw)" suffixes on older saved sheets.
 */
export function resolveOtherTraitKind(
  entry: Pick<SheetOtherTraitEntry, 'name' | 'kind'>
): OtherTraitKind {
  if (entry.kind === 'merit' || entry.kind === 'flaw' || entry.kind === 'other') {
    return entry.kind;
  }
  if (/\(merit\)|\bmerit\b/i.test(entry.name)) {
    return 'merit';
  }
  if (/\(flaw\)|\bflaw\b/i.test(entry.name)) {
    return 'flaw';
  }
  return 'other';
}

/**
 * Removes redundant trailing "(Merit)" / "(Flaw)" suffixes so differentiated UI badges remain crisp.
 */
export function cleanOtherTraitDisplayName(name: string): string {
  return name.replace(/\s*\((?:merit|flaw)\)\s*$/i, '').trim() || name.trim();
}

export interface SheetWeaponEntry extends RuleBinding {
  id: string;
  name: string;
  carried?: boolean;
  isSilver?: boolean;
  rollAttribute: AttributeKey;
  rollAbility: string;
  difficulty: number;
  damageMode: 'strength_plus' | 'flat';
  damageDice: number;
  damageType: Exclude<DamageType, 'none'>;
  range: string;
  rate: string;
  clip: string;
}

export type ShortcutPoolSource =
  | {
      kind: 'trait_combo';
      attribute?: AttributeKey | 'rage' | 'gnosis' | 'willpower' | null;
      ability?: string | null;
      flatModifier?: number;
      useFormStats?: boolean;
      applyPerceptionFormDiff?: boolean;
    }
  | { kind: 'soak'; includeArmor?: boolean }
  | { kind: 'natural_brawl_damage'; maneuver: 'claw' | 'bite' | 'punch' | 'kick' }
  | { kind: 'weapon_attack'; weaponId: string }
  | { kind: 'weapon_damage'; weaponId: string }
  | { kind: 'fetish_activate'; fetishId: string }
  | { kind: 'static'; pool: number };

export interface SheetShortcut {
  id: string;
  name: string;
  source: ShortcutPoolSource;
  ruleContext?: RuleContext;
  difficulty: number;
  rageDiceCount: number;
  applyWoundPenalty: boolean;
  forceSpecialty?: boolean;
  isSecretRoll: boolean;
}

export interface ResolvedSheetShortcut {
  context: RuleContext;
  shortcut: SheetShortcut;
  label: string;
  basePool: number;
  rawPool: number;
  effectivePool: number;
  difficulty: number;
  hasSpecialty: boolean;
  specialtyReason?: string;
  rageDiceCount: number;
  applyWoundPenalty: boolean;
  isSecretRoll: boolean;
  formulaSummary: string;
  modifiers: AppliedRuleModifier[];
  pending: EvaluatedRules['pending'];
  woundPenalty: number;
  bonusAutomaticSuccesses: number;
  automaticFailure: boolean;
}

export interface BrawlingManeuverRow {
  key: 'bite' | 'body_tackle' | 'claw' | 'grapple' | 'kick' | 'punch';
  name: string;
  attackPool: number;
  difficulty: number;
  damagePool: number | null;
  damageLabel: string;
  damageType: Exclude<DamageType, 'none'>;
  availableInCurrentForm: boolean;
}

export interface W20UserCharacterSheet {
  /** Idempotency keys for accepted room resource and effect mutations. */
  ruleActivationReceipts?: string[];
  id: string;
  ownerDiscordId: string;
  syncCode?: string | null;
  name: string;
  player: string;
  chronicle: string;
  breed: Breed;
  auspice: Auspice;
  tribe: string;
  packName: string;
  packTotem: string;
  packTotemRule?: RuleBinding;
  concept: string;
  deedName?: string;
  metisDeformity?: string;
  baseAttributes: BaseAttributes;
  abilities: Partial<Record<CanonicalAbilityKey, number>> & Record<string, number>;
  customAbilities: CustomAbilityEntry[];
  specialties: Record<string, string>;
  backgrounds: SheetBackgroundEntry[];
  gifts: SheetGiftEntry[];
  renown: {
    glory: DualTracker;
    honor: DualTracker;
    wisdom: DualTracker;
  };
  rank: number;
  rage: DualTracker;
  gnosis: DualTracker;
  willpower: DualTracker;
  silverCarriedItems: number;
  health: HealthState;
  experience: {
    mystical?: number;
    total: number;
    spent: number;
  };
  activeForm: GarouForm;
  ruleContextTags?: string[];
  activeRuleEffects?: ActiveRuleInstance[];
  ruleHealthBonus?: number;
  otherTraits: SheetOtherTraitEntry[];
  fetishes: SheetFetishItem[];
  rites: SheetRiteEntry[];
  combatWeapons: SheetWeaponEntry[];
  equipment?: Array<
    RuleBinding & {
      id: string;
      name: string;
      worn?: boolean;
      carried?: boolean;
      isSilver?: boolean;
    }
  >;
  armor: RuleBinding & {
    dexterityDifficultyPenalty?: number;
    worn?: boolean;
    rating: number;
    description: string;
  };
  shortcuts: SheetShortcut[];
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
}

/** Kept for existing imports; the Gift catalog now lives in ./catalog. */
export type CanonicalGiftCatalogEntry = W20GiftCatalogEntry;

/** Every Gift in the W20 core rulebook (all ranks, breeds, auspices, tribes and camps). */
export const CANONICAL_GIFT_CATALOG: readonly W20GiftCatalogEntry[] = W20_GIFT_CATALOG;

// ============================================================================
// Sync Code Utilities
// ============================================================================

export const SYNC_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SYNC_CODE_LENGTH = 8;
const SYNC_CODE_CHAR_SET = new Set(SYNC_CODE_ALPHABET.split(''));

/**
 * Normalizes a user-entered sync code by trimming, uppercasing, and stripping
 * spaces/hyphens. Returns null if the code does not match 8 valid base32-safe chars.
 */
export function normalizeSyncCode(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (cleaned.length !== SYNC_CODE_LENGTH) {
    return null;
  }
  for (const ch of cleaned) {
    if (!SYNC_CODE_CHAR_SET.has(ch)) {
      return null;
    }
  }
  return cleaned;
}

/**
 * Formats a sync code into hyphenated 4-character groups (e.g., "ABCD-2345").
 */
export function formatSyncCode(code: string): string {
  const cleaned = code.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!cleaned) return '';
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join('-') : cleaned;
}

/**
 * Generates an 8-character sync code from SYNC_CODE_ALPHABET using unbiased modulo
 * on the 32-character alphabet (or supplied random bytes).
 */
export function generateRandomSyncCode(rngBytes?: Uint8Array): string {
  const bytes = new Uint8Array(SYNC_CODE_LENGTH);
  if (rngBytes && rngBytes.length >= SYNC_CODE_LENGTH) {
    bytes.set(rngBytes.subarray(0, SYNC_CODE_LENGTH));
  } else {
    crypto.getRandomValues(bytes);
    if (rngBytes && rngBytes.length > 0) {
      bytes.set(rngBytes, 0);
    }
  }

  let out = '';
  for (let i = 0; i < SYNC_CODE_LENGTH; i++) {
    out += SYNC_CODE_ALPHABET[bytes[i] % SYNC_CODE_ALPHABET.length];
  }
  return out;
}

// ============================================================================
// Sheet Derived Stats, Ability Lookup, & Shortcut Resolution
// ============================================================================

export interface UserSheetComputedStats {
  modifiers: AppliedRuleModifier[];
  effectiveAbilities: Record<string, number>;
  ruleEvaluation: EvaluatedRules;
  health: HealthState;
  ruleInitiativeBonus: number;
  effectiveAttributes: BaseAttributes;
  formSpec: FormModifierSpec;
  effectiveGnosisPool: number;
  effectiveRagePool: number;
  effectiveWillpowerPool: number;
  woundPenalty: number;
  isIncapacitated: boolean;
  woundLabel: string;
  perceptionDifficultyMod: number;
  shiftDifficulty: number;
  incitesDelirium: boolean;
  initiativeBonus: number;
  soakCapabilities: {
    naturalSoakPool: number;
    armorRating: number;
    soakPool: number;
    canSoakBashing: boolean;
    canSoakLethal: boolean;
    canSoakAggravated: boolean;
    canSoakSilver: boolean;
  };
  brawlingChart: BrawlingManeuverRow[];
  experienceRemaining: number;
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function formatTraitLabel(key: string): string {
  if (key === 'primal_urge') return 'Primal-Urge';
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findCustomAbility(
  sheet: W20UserCharacterSheet,
  abilityKeyOrId: string
): CustomAbilityEntry | undefined {
  const needle = abilityKeyOrId.trim().toLowerCase();
  if (!needle) return undefined;
  return sheet.customAbilities.find(
    (entry) => entry.id === abilityKeyOrId || entry.name.trim().toLowerCase() === needle
  );
}

/**
 * Resolves dots for either a canonical ability key (e.g., "brawl", "primal_urge")
 * or a custom ability (matched by id or case-insensitive name).
 */
export function lookupSheetAbilityDots(
  sheet: W20UserCharacterSheet,
  abilityKeyOrId: string
): number {
  if (!abilityKeyOrId) return 0;

  const direct = sheet.abilities[abilityKeyOrId];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return Math.max(0, Math.floor(direct));
  }

  const normalized = normalizeKey(abilityKeyOrId);
  const normalizedHit = sheet.abilities[normalized];
  if (typeof normalizedHit === 'number' && Number.isFinite(normalizedHit)) {
    return Math.max(0, Math.floor(normalizedHit));
  }

  const custom = findCustomAbility(sheet, abilityKeyOrId);
  if (custom && Number.isFinite(custom.dots)) {
    return Math.max(0, Math.floor(custom.dots));
  }

  return 0;
}

function lookupSpecialtyForTrait(
  sheet: W20UserCharacterSheet,
  traitKey: string | null | undefined
): string | undefined {
  if (!traitKey) return undefined;
  const direct = sheet.specialties[traitKey]?.trim();
  if (direct) return direct;

  const normalized = normalizeKey(traitKey);
  const normalizedVal = sheet.specialties[normalized]?.trim();
  if (normalizedVal) return normalizedVal;

  return undefined;
}

/**
 * Computes W20 five-form effective stats, soak capabilities, wound state,
 * initiative bonus, and the Page 2 brawling maneuver chart.
 */
export function computeUserSheetStats(sheet: W20UserCharacterSheet, context: RuleContext = {}): UserSheetComputedStats {
  const spec = W20_FORM_MATRIX[sheet.activeForm];
  const base = sheet.baseAttributes;
  const rules = evaluateModifierRules(
    getSheetModifierSources(sheet),
    { ...sheet, ruleTraits: ruleTraits(sheet) },
    context
  );

  const effectiveAttributes: BaseAttributes = {
    strength: Math.max(1, base.strength + (spec.deltas.strength ?? 0)),
    dexterity: Math.max(1, base.dexterity + (spec.deltas.dexterity ?? 0)),
    stamina: Math.max(1, base.stamina + (spec.deltas.stamina ?? 0)),
    charisma: base.charisma,
    manipulation: Math.max(0, base.manipulation + (spec.deltas.manipulation ?? 0)),
    appearance: spec.overrideAppearanceZero
      ? 0
      : Math.max(0, base.appearance + (spec.deltas.appearance ?? 0)),
    perception: base.perception,
    intelligence: base.intelligence,
    wits: base.wits,
  };

  if (applyRuleValue(rules, 'form:social_penalty', 1) === 0) {
    effectiveAttributes.manipulation = base.manipulation;
    effectiveAttributes.appearance = base.appearance;
  }
  for (const key of Object.keys(effectiveAttributes) as AttributeKey[]) {
    effectiveAttributes[key] = Math.max(
      key === 'manipulation' || key === 'appearance' ? 0 : 1,
      applyRuleValue(rules, `attribute:${key}`, effectiveAttributes[key])
    );
  }
  if (
    spec.overrideAppearanceZero ||
    rules.modifiers.some(
      (modifier) =>
        modifier.target === 'attribute:appearance' &&
        modifier.operation === 'set' &&
        modifier.value === 0
    )
  )
    effectiveAttributes.appearance = 0;
  const effectiveAbilities = Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(sheet.abilities),
        ...rules.modifiers
          .filter((mod) => mod.target.startsWith('ability:'))
          .map((mod) => mod.target.slice(8)),
      ]),
    ].map((key) => [
      key,
      Math.max(0, applyRuleValue(rules, `ability:${key}`, lookupSheetAbilityDots(sheet, key))),
    ])
  );
  const health = reconcileSheetRuleHealth(sheet).health;
  const woundState = computeWoundState(health);
  woundState.penalty = Math.min(0, applyRuleValue(rules, 'wound:penalty', woundState.penalty));
  const naturalBreedForm = getBreedNaturalForm(sheet.breed);
  const isBreedForm = sheet.activeForm === naturalBreedForm;
  const isHumanForm = sheet.activeForm === 'homid';

  const naturalSoakPool = effectiveAttributes.stamina;
  const armorRating = Math.max(
    0,
    applyRuleValue(
      rules,
      'armor:rating',
      sheet.armor.worn === false ? 0 : Math.floor(sheet.armor.rating)
    )
  );
  const brawlDots = effectiveAbilities.brawl ?? lookupSheetAbilityDots(sheet, 'brawl');
  const attackPool = effectiveAttributes.dexterity + brawlDots;
  const str = effectiveAttributes.strength;
  const biteDamage = str + 1 + spec.bonusBiteDamageDice;
  const clawDamage = str + 2;
  const kickDamage = str + 1;

  const brawlingChart: BrawlingManeuverRow[] = [
    {
      key: 'bite',
      name: 'Bite',
      attackPool,
      difficulty: 5,
      damagePool: biteDamage,
      damageLabel: `${biteDamage}/A`,
      damageType: 'aggravated',
      availableInCurrentForm: spec.hasFangs,
    },
    {
      key: 'body_tackle',
      name: 'Body Tackle',
      attackPool,
      difficulty: 7,
      damagePool: null,
      damageLabel: 'Special/B',
      damageType: 'bashing',
      availableInCurrentForm: true,
    },
    {
      key: 'claw',
      name: 'Claw',
      attackPool,
      difficulty: 6,
      damagePool: clawDamage,
      damageLabel: `${clawDamage}/A`,
      damageType: 'aggravated',
      availableInCurrentForm: spec.hasClaws,
    },
    {
      key: 'grapple',
      name: 'Grapple',
      attackPool,
      difficulty: 6,
      damagePool: str,
      damageLabel: `${str}/B`,
      damageType: 'bashing',
      availableInCurrentForm: true,
    },
    {
      key: 'kick',
      name: 'Kick',
      attackPool,
      difficulty: 7,
      damagePool: kickDamage,
      damageLabel: `${kickDamage}/B`,
      damageType: 'bashing',
      availableInCurrentForm: true,
    },
    {
      key: 'punch',
      name: 'Punch',
      attackPool,
      difficulty: 6,
      damagePool: str,
      damageLabel: `${str}/B`,
      damageType: 'bashing',
      availableInCurrentForm: true,
    },
  ];

  return {
    effectiveAttributes,
    effectiveAbilities,
    ruleEvaluation:rules,
    modifiers:rules.modifiers,
    health,
    ruleInitiativeBonus: applyRuleValue(rules,'initiative',0),
    formSpec: spec,
    effectiveRagePool: Math.max(0,applyRuleValue(rules,'resource:rage:max',applyRuleValue(rules,'resource:rage',sheet.rage.permanent))),
    effectiveWillpowerPool: Math.max(0,applyRuleValue(rules,'resource:willpower:max',applyRuleValue(rules,'resource:willpower',sheet.willpower.permanent))),
    effectiveGnosisPool: Math.max(
      0,
      applyRuleValue(rules,'resource:gnosis', Math.floor(sheet.gnosis.permanent)) - ruleSilverPenalty(sheet,getSheetModifierSources(sheet),rules)
    ),
    woundPenalty: woundState.penalty,
    isIncapacitated: woundState.isIncapacitated,
    woundLabel: woundState.woundLabel,
    perceptionDifficultyMod: rules.modifiers.some(mod => mod.stackingKey === 'perception-form') ? 0 : applyRuleValue(rules,'form:perception_difficulty',spec.perceptionDifficultyMod),
    shiftDifficulty: spec.shiftDifficulty,
    incitesDelirium: Boolean(applyRuleValue(rules,'delirium:trigger',applyRuleValue(rules,'delirium:enabled',Number(spec.incitesDelirium)))),
    initiativeBonus:
      applyRuleValue(rules,'initiative',effectiveAttributes.dexterity + effectiveAttributes.wits + woundState.penalty),
    soakCapabilities: {
      naturalSoakPool,
      armorRating,
      soakPool: naturalSoakPool + armorRating,
      canSoakBashing: true,
      canSoakLethal: !isHumanForm,
      canSoakAggravated: !isHumanForm,
      canSoakSilver: Boolean(applyRuleValue(rules,'soak:silver',Number(sheet.breed !== 'metis' && isBreedForm))),
    },
    brawlingChart,
    experienceRemaining: sheet.experience.total - sheet.experience.spent,
  };
}

function resolveTraitComboSpecialty(
  sheet: W20UserCharacterSheet,
  attribute: AttributeKey | 'rage' | 'gnosis' | 'willpower' | null | undefined,
  ability: string | null | undefined,
  forceSpecialty: boolean | undefined
): { hasSpecialty: boolean; specialtyReason?: string } {
  const reasons: string[] = [];

  if (attribute) {
    const attrSpec = lookupSpecialtyForTrait(sheet, attribute);
    if (attrSpec) {
      reasons.push(`${formatTraitLabel(attribute)}: ${attrSpec}`);
    }
  }

  if (ability) {
    const custom = findCustomAbility(sheet, ability);
    const abilSpec = lookupSpecialtyForTrait(sheet, ability);
    if (abilSpec) {
      reasons.push(`${custom ? custom.name : formatTraitLabel(ability)}: ${abilSpec}`);
    } else if (custom?.specialty?.trim()) {
      reasons.push(`${custom.name}: ${custom.specialty.trim()}`);
    }
  }

  if (reasons.length > 0) {
    return { hasSpecialty: true, specialtyReason: reasons.join('; ') };
  }

  if (forceSpecialty) {
    return { hasSpecialty: true, specialtyReason: 'Forced on shortcut' };
  }

  return { hasSpecialty: false };
}

/**
 * Resolves a sheet shortcut into exact dice pool, difficulty, wound penalty application,
 * specialty status, and human-readable formula summary.
 */
export function resolveSheetShortcut(
  sheet: W20UserCharacterSheet,
  shortcut: SheetShortcut,
  context: RuleContext = {}
): ResolvedSheetShortcut {
  const source = shortcut.source;
  const weapon =
    source.kind === 'weapon_attack' || source.kind === 'weapon_damage'
      ? sheet.combatWeapons.find((item) => item.id === source.weaponId)
      : undefined;
  const inferred: RuleContext =
    source.kind === 'trait_combo'
      ? {
          attribute: source.attribute ?? undefined,
          ability: source.ability ?? undefined,
          tags: source.ability === 'brawl' ? ['weapon:natural'] : [],
        }
      : source.kind === 'weapon_attack'
        ? {
            attribute: weapon?.rollAttribute,
            ability: weapon?.rollAbility,
            rollKind: 'attack',
            selectedItemId: source.weaponId,
          }
        : source.kind === 'weapon_damage'
          ? {
              rollKind: 'damage',
              attribute: weapon?.damageMode === 'strength_plus' ? 'strength' : undefined,
              selectedItemId: source.weaponId,
            }
          : source.kind === 'natural_brawl_damage'
            ? { rollKind: 'damage', attribute: 'strength', maneuver: source.maneuver }
            : source.kind === 'soak'
              ? { rollKind: 'soak', attribute: 'stamina' }
              : source.kind === 'fetish_activate'
                ? { rollKind: 'activation', attribute: 'gnosis', selectedItemId: source.fetishId }
                : {};
  const rollContext = { ...inferred, ...shortcut.ruleContext, ...context };
  rollContext.authoritativeTags = [
    ...(shortcut.difficulty >= 6 ? ['roll:difficulty_6_or_more'] : []),
  ];
  if (
    shortcut.applyWoundPenalty &&
    !['damage', 'soak'].includes(rollContext.rollKind ?? '') &&
    !['rage', 'gnosis', 'willpower'].includes(rollContext.attribute ?? '')
  )
    rollContext.authoritativeTags.push('roll:wound-sensitive');
  const stats = computeUserSheetStats(sheet, rollContext);
  const spec = stats.formSpec;

  let label = shortcut.name;
  let rawPool = 0;
  let rawDiff = shortcut.difficulty;
  let applyWoundPenalty = shortcut.applyWoundPenalty;
  let hasSpecialty = Boolean(shortcut.forceSpecialty);
  let specialtyReason: string | undefined = shortcut.forceSpecialty
    ? 'Forced on shortcut'
    : undefined;
  let formulaSummary = '';

  switch (source.kind) {
    case 'trait_combo': {
      const useFormStats = source.useFormStats !== false;
      const parts: string[] = [];
      let attrDots = 0;

      if (source.attribute === 'rage') {
        attrDots = stats.effectiveRagePool;
        parts.push(`Rage (${attrDots})`);
      } else if (source.attribute === 'gnosis') {
        attrDots = stats.effectiveGnosisPool;
        parts.push(
          sheet.silverCarriedItems > 0
            ? `Gnosis (${sheet.gnosis.permanent} - ${sheet.silverCarriedItems} Silver = ${attrDots})`
            : `Gnosis (${attrDots})`
        );
      } else if (source.attribute === 'willpower') {
        attrDots = stats.effectiveWillpowerPool;
        parts.push(`Willpower (${attrDots})`);
      } else if (source.attribute) {
        const attrSource = useFormStats ? stats.effectiveAttributes : sheet.baseAttributes;
        attrDots = Math.max(0, Math.floor(attrSource[source.attribute]));
        parts.push(`${formatTraitLabel(source.attribute)} (${attrDots})`);
      }

      let abilDots = 0;
      if (source.ability) {
        abilDots =
          stats.effectiveAbilities[source.ability] ?? lookupSheetAbilityDots(sheet, source.ability);
        const custom = findCustomAbility(sheet, source.ability);
        parts.push(`${custom ? custom.name : formatTraitLabel(source.ability)} (${abilDots})`);
      }

      const flatMod = source.flatModifier ?? 0;
      if (flatMod !== 0) {
        parts.push(flatMod > 0 ? `+${flatMod}` : `${flatMod}`);
      }

      rawPool = attrDots + abilDots + flatMod;

      if (source.attribute === 'perception' && source.applyPerceptionFormDiff !== false) {
        rawDiff += stats.perceptionDifficultyMod;
      }

      const isPureInnerTrait =
        (source.attribute === 'gnosis' ||
          source.attribute === 'willpower' ||
          source.attribute === 'rage') &&
        !source.ability;
      if (isPureInnerTrait) {
        applyWoundPenalty = false;
      }

      const specResult = resolveTraitComboSpecialty(
        sheet,
        source.attribute,
        source.ability,
        shortcut.forceSpecialty
      );
      hasSpecialty = specResult.hasSpecialty;
      specialtyReason = specResult.specialtyReason;
      formulaSummary = parts.length > 0 ? parts.join(' + ').replace(' + -', ' - ') : '0 dice';
      break;
    }

    case 'soak': {
      const includeArmor = source.includeArmor !== false;
      const armorBonus = includeArmor ? stats.soakCapabilities.armorRating : 0;
      rawPool = stats.effectiveAttributes.stamina + armorBonus;
      applyWoundPenalty = false;
      formulaSummary =
        includeArmor && armorBonus > 0
          ? `Stamina (${stats.effectiveAttributes.stamina}) + Armor (${armorBonus})`
          : `Stamina (${stats.effectiveAttributes.stamina})`;
      break;
    }

    case 'natural_brawl_damage': {
      const str = stats.effectiveAttributes.strength;
      applyWoundPenalty = false;

      if (source.maneuver === 'claw') {
        if (spec.hasClaws) {
          rawPool = str + 2;
          formulaSummary = `Strength (${str}) + 2 (Claws, Aggravated)`;
        } else if (spec.hasFangs) {
          const biteBonus = 1 + spec.bonusBiteDamageDice;
          rawPool = str + biteBonus;
          label = 'Bite Damage';
          formulaSummary = `Strength (${str}) + ${biteBonus} (Bite, Aggravated; adapted from Claw in ${sheet.activeForm})`;
        } else {
          rawPool = str;
          label = 'Unarmed Punch Damage';
          formulaSummary = `Strength (${str}) (Punch, Bashing; adapted from Claw in ${sheet.activeForm})`;
        }
      } else if (source.maneuver === 'bite') {
        if (spec.hasFangs) {
          const biteBonus = 1 + spec.bonusBiteDamageDice;
          rawPool = str + biteBonus;
          formulaSummary = `Strength (${str}) + ${biteBonus} (Bite, Aggravated)`;
        } else {
          rawPool = str;
          label = 'Unarmed Punch Damage';
          formulaSummary = `Strength (${str}) (Punch, Bashing; no fangs in ${sheet.activeForm})`;
        }
      } else if (source.maneuver === 'kick') {
        rawPool = str + 1;
        formulaSummary = `Strength (${str}) + 1 (Kick, Bashing)`;
      } else {
        rawPool = str;
        formulaSummary = `Strength (${str}) (Punch, Bashing)`;
      }
      break;
    }

    case 'weapon_attack': {
      const weapon = sheet.combatWeapons.find((w) => w.id === source.weaponId);
      if (weapon && weapon.carried !== false) {
        const attrDots = stats.effectiveAttributes[weapon.rollAttribute];
        const abilDots =
          stats.effectiveAbilities[weapon.rollAbility] ??
          lookupSheetAbilityDots(sheet, weapon.rollAbility);
        const custom = findCustomAbility(sheet, weapon.rollAbility);
        rawPool = attrDots + abilDots;
        rawDiff =
          weapon.difficulty +
          (weapon.rollAttribute === 'perception' ? stats.perceptionDifficultyMod : 0);
        const specResult = resolveTraitComboSpecialty(
          sheet,
          weapon.rollAttribute,
          weapon.rollAbility,
          shortcut.forceSpecialty
        );
        hasSpecialty = specResult.hasSpecialty;
        specialtyReason = specResult.specialtyReason;
        formulaSummary = `${formatTraitLabel(weapon.rollAttribute)} (${attrDots}) + ${
          custom ? custom.name : formatTraitLabel(weapon.rollAbility)
        } (${abilDots})`;
      } else {
        rawPool = 0;
        formulaSummary = weapon
          ? `${weapon.name} is not carried`
          : `Missing weapon (${source.weaponId})`;
      }
      break;
    }

    case 'weapon_damage': {
      const weapon = sheet.combatWeapons.find((w) => w.id === source.weaponId);
      applyWoundPenalty = false;
      if (weapon && weapon.carried !== false) {
        const str = stats.effectiveAttributes.strength;
        rawPool =
          weapon.damageMode === 'strength_plus'
            ? str + weapon.damageDice
            : weapon.damageDice;
        formulaSummary =
          weapon.damageMode === 'strength_plus'
            ? `Strength (${str}) + ${weapon.damageDice} (${weapon.damageType})`
            : `${weapon.damageDice} dice (${weapon.damageType})`;
      } else {
        rawPool = 0;
        formulaSummary = weapon
          ? `${weapon.name} is not carried`
          : `Missing weapon (${source.weaponId})`;
      }
      break;
    }

    case 'fetish_activate': {
      const fetish = sheet.fetishes.find((f) => f.id === source.fetishId);
      applyWoundPenalty = false;
      if (fetish) {
        rawPool = stats.effectiveGnosisPool;
        rawDiff = fetish.gnosisRating;
        formulaSummary = `Gnosis (${stats.effectiveGnosisPool}), difficulty ${fetish.gnosisRating} (${fetish.name})`;
      } else {
        rawPool = 0;
        formulaSummary = `Missing fetish (${source.fetishId})`;
      }
      break;
    }

    case 'static': {
      rawPool = source.pool;
      formulaSummary = `Static Pool (${source.pool})`;
      break;
    }
  }

  const rules = stats.ruleEvaluation;
  if (
    rollContext.rollKind === 'damage' &&
    rules.modifiers.some((mod) => mod.target === 'weapon:strength_damage_bonus')
  ) {
    rawPool =
      stats.effectiveAttributes.strength + applyRuleValue(rules, 'weapon:strength_damage_bonus', 0);
  }
  if (
    rollContext.rollKind === 'damage' &&
    rules.modifiers.some((mod) => mod.target === 'damage:base-strength-bonus')
  )
    rawPool =
      stats.effectiveAttributes.strength + applyRuleValue(rules, 'damage:base-strength-bonus', 0);
  if (
    rollContext.rollKind === 'damage' &&
    rules.modifiers.some((mod) => mod.target === 'weapon:flat_damage')
  )
    rawPool = applyRuleValue(rules, 'weapon:flat_damage', rawPool);
  const rolledAbility =
    source.kind === 'trait_combo'
      ? source.ability
      : source.kind === 'weapon_attack'
        ? weapon?.rollAbility
        : undefined;
  const untrainedAbility =
    rolledAbility &&
    (stats.effectiveAbilities[rolledAbility] ?? lookupSheetAbilityDots(sheet, rolledAbility)) === 0
      ? rolledAbility
      : undefined;
  const untrainedSkill =
    untrainedAbility && (ABILITY_GROUPS.skills as string[]).includes(untrainedAbility);
  const untrainedKnowledge =
    untrainedAbility && (ABILITY_GROUPS.knowledges as string[]).includes(untrainedAbility);
  if (untrainedKnowledge && !applyRuleValue(rules, 'untrained:knowledge', 0))
    rules.modifiers.push({
      sourceId: 'untrained-knowledge',
      ruleId: 'w20-untrained-knowledge',
      name: 'Untrained Knowledge',
      source: { book: 'W20' },
      target: 'roll:automatic_failure',
      operation: 'allow',
      value: 1,
    });
  const penalties = resolveRulePenalties(rules, {
    ...rollContext,
    penalties: [
      ...(rollContext.penalties ?? []),
      ...(untrainedSkill ? [{ key: 'untrained_skill', difficulty: 1 }] : []),
    ],
  });
  rawPool = Math.floor(applyRuleValue(rules, 'pool', rawPool) + penalties.pool);
  rawDiff = applyRuleValue(rules, 'difficulty', rawDiff) + penalties.difficulty;
  if (rollContext.rollKind === 'soak') rawDiff = applyRuleValue(rules, 'soak:difficulty', rawDiff);
  if (
    rollContext.attribute === 'dexterity' &&
    sheet.armor.worn !== false &&
    !rules.modifiers.some((mod) => mod.sourceId === 'armor' && mod.target === 'difficulty')
  )
    rawDiff += sheet.armor.dexterityDifficultyPenalty ?? 0;
  if (rollContext.specialtyOverride !== undefined) hasSpecialty = rollContext.specialtyOverride;
  if (rollContext.woundOverride !== undefined) applyWoundPenalty = rollContext.woundOverride;
  const woundPenalty = stats.woundPenalty;
  const explanations = rules.modifiers
    .filter((mod) => mod.target === 'pool' || mod.target === 'difficulty')
    .map((mod) => `${mod.name} (${mod.value > 0 ? '+' : ''}${mod.value} ${mod.target})`);
  if (explanations.length) formulaSummary += `; ${explanations.join(', ')}`;
  if (
    (source.kind === 'weapon_damage' || source.kind === 'weapon_attack') &&
    (!weapon || weapon.carried === false)
  )
    rawPool = 0;
  const basePool = Math.max(1, Math.min(30, rawPool));
  const difficulty = Math.max(2, Math.min(10, rawDiff));
  const effectivePool = Math.max(0, Math.min(30, rawPool) + (applyWoundPenalty ? woundPenalty : 0));

  return {
    shortcut,
    context:rollContext,
    label,
    basePool,
    rawPool,
    effectivePool,
    difficulty,
    hasSpecialty,
    ...(specialtyReason ? { specialtyReason } : {}),
    rageDiceCount: Math.max(0, shortcut.rageDiceCount),
    applyWoundPenalty,
    isSecretRoll: shortcut.isSecretRoll,
    formulaSummary,
    modifiers: rules.modifiers,
    pending: rules.pending,
    woundPenalty,
    bonusAutomaticSuccesses: Math.max(0,applyRuleValue(rules,'roll:automatic_successes',0)),
    automaticFailure: Boolean(applyRuleValue(rules,'roll:automatic_failure',0) || (untrainedKnowledge && !applyRuleValue(rules,'untrained:knowledge',0))),
  };
}

/**
 * Builds the default quick-roll shortcuts for a W20 character sheet, including
 * core combat/skill/trait shortcuts plus any weapons, rollable Gifts, and Fetishes.
 */
export function buildDefaultSheetShortcuts(sheet: W20UserCharacterSheet): SheetShortcut[] {
  const shortcuts: SheetShortcut[] = [
    {
      id: 'default-brawl',
      name: 'Brawl Attack',
      ruleContext: { rollKind: 'attack', tags: ['weapon:natural'] },
      source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'brawl' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    },
    {
      id: 'default-claw-damage',
      name: 'Claw Damage',
      source: { kind: 'natural_brawl_damage', maneuver: 'claw' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    },
    {
      id: 'default-dodge',
      name: 'Dodge (Dex + Athletics)',
      source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'athletics' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    },
    {
      id: 'default-soak',
      name: 'Soak',
      source: { kind: 'soak', includeArmor: true },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    },
    {
      id: 'default-alertness',
      name: 'Perception + Alertness',
      source: {
        kind: 'trait_combo',
        attribute: 'perception',
        ability: 'alertness',
        applyPerceptionFormDiff: true,
      },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    },
    {
      id: 'default-primal-urge',
      name: 'Perception + Primal-Urge',
      source: {
        kind: 'trait_combo',
        attribute: 'perception',
        ability: 'primal_urge',
        applyPerceptionFormDiff: true,
      },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    },
    {
      id: 'default-stealth',
      name: 'Stealth',
      source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'stealth' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    },
    {
      id: 'default-gnosis',
      name: 'Gnosis Roll',
      source: { kind: 'trait_combo', attribute: 'gnosis', ability: null },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    },
    {
      id: 'default-willpower',
      name: 'Willpower Roll',
      source: { kind: 'trait_combo', attribute: 'willpower', ability: null },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    },
  ];

  for (const weapon of sheet.combatWeapons) {
    shortcuts.push(
      {
        id: `weapon-atk-${weapon.id}`,
        name: `${weapon.name} Attack`,
        source: { kind: 'weapon_attack', weaponId: weapon.id },
        difficulty: weapon.difficulty,
        rageDiceCount: 0,
        applyWoundPenalty: true,
        isSecretRoll: false,
      },
      {
        id: `weapon-dmg-${weapon.id}`,
        name: `${weapon.name} Damage`,
        source: { kind: 'weapon_damage', weaponId: weapon.id },
        difficulty: 6,
        rageDiceCount: 0,
        applyWoundPenalty: false,
        isSecretRoll: false,
      }
    );
  }

  for (const gift of sheet.gifts) {
    if (!gift.rollAttribute) continue;
    const isPureInner =
      (gift.rollAttribute === 'gnosis' ||
        gift.rollAttribute === 'willpower' ||
        gift.rollAttribute === 'rage') &&
      !gift.rollAbility;
    shortcuts.push({
      id: `gift-${gift.id}`,
      name: gift.name,
      source: {
        kind: 'trait_combo',
        attribute: gift.rollAttribute,
        ability: gift.rollAbility ?? null,
        applyPerceptionFormDiff: gift.rollAttribute === 'perception',
      },
      difficulty: gift.difficulty ?? 6,
      rageDiceCount: 0,
      applyWoundPenalty: !isPureInner,
      isSecretRoll: false,
    });
  }

  for (const fetish of sheet.fetishes) {
    shortcuts.push({
      id: `fetish-${fetish.id}`,
      name: `Activate ${fetish.name}`,
      source: { kind: 'fetish_activate', fetishId: fetish.id },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    });
  }

  return shortcuts;
}

// ============================================================================
// Sheet Constructors & Protocol Adapters
// ============================================================================

export interface CreateBlankUserSheetParams {
  id: string;
  ownerDiscordId: string;
  syncCode?: string | null;
  name?: string;
  player?: string;
  chronicle?: string;
  breed?: Breed;
  auspice?: Auspice;
  tribe?: GarouTribe | string;
  packName?: string;
  packTotem?: string;
  concept?: string;
  deedName?: string;
  metisDeformity?: string;
  now?: number;
}

/**
 * Creates a fresh W20 Pages 1 & 2 character sheet populated with canonical
 * starting Rage, Gnosis, Willpower, breed form, and default quick-roll shortcuts.
 */
export function createBlankUserCharacterSheet(
  params: CreateBlankUserSheetParams
): W20UserCharacterSheet {
  const breed: Breed = params.breed ?? 'homid';
  const auspice: Auspice = params.auspice ?? 'ragabash';
  const tribe = params.tribe ?? '';
  const normalizedTribe = normalizeKey(tribe);
  const startingRage = STARTING_RAGE_BY_AUSPICE[auspice];
  const startingGnosis = STARTING_GNOSIS_BY_BREED[breed];
  const startingWillpower =
    (STARTING_WILLPOWER_BY_TRIBE as Record<string, number>)[normalizedTribe] ?? 3;
  const now = params.now ?? Date.now();

  const sheet: W20UserCharacterSheet = {
    id: params.id,
    ownerDiscordId: params.ownerDiscordId,
    syncCode: params.syncCode !== undefined ? params.syncCode : null,
    name: params.name ?? 'New Garou',
    player: params.player ?? '',
    chronicle: params.chronicle ?? '',
    breed,
    auspice,
    tribe,
    packName: params.packName ?? '',
    packTotem: params.packTotem ?? '',
    concept: params.concept ?? '',
    ...(params.deedName ? { deedName: params.deedName } : {}),
    ...(params.metisDeformity ? { metisDeformity: params.metisDeformity } : {}),
    baseAttributes: {
      strength: 1,
      dexterity: 1,
      stamina: 1,
      charisma: 1,
      manipulation: 1,
      appearance: 1,
      perception: 1,
      intelligence: 1,
      wits: 1,
    },
    abilities: {},
    customAbilities: [],
    specialties: {},
    backgrounds: [],
    gifts: [],
    renown: {
      glory: { permanent: 0, temporary: 0 },
      honor: { permanent: 0, temporary: 0 },
      wisdom: { permanent: 0, temporary: 0 },
    },
    rank: 1,
    rage: { permanent: startingRage, temporary: startingRage },
    gnosis: { permanent: startingGnosis, temporary: startingGnosis },
    willpower: { permanent: startingWillpower, temporary: startingWillpower },
    silverCarriedItems: 0,
    health: {
      bonusBruisedBoxes: 0,
      boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
    },
    experience: {
      total: 0,
      spent: 0,
    },
    activeForm: getBreedNaturalForm(breed),
    otherTraits: [],
    fetishes: [],
    rites: [],
    combatWeapons: [],
    armor: {
      rating: 0,
      description: '',
    },
    shortcuts: [],
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  sheet.shortcuts = buildDefaultSheetShortcuts(sheet);
  return sheet;
}

export interface DraftToUserSheetMeta {
  id: string;
  ownerDiscordId: string;
  syncCode?: string | null;
  player?: string;
  chronicle?: string;
  packName?: string;
  packTotem?: string;
  deedName?: string;
  now?: number;
}

/**
 * Converts a W20CharacterCreationDraft into a full Pages 1 & 2 W20UserCharacterSheet,
 * resolving catalog Gift mechanics, backgrounds, merits/flaws, Huge Size health boxes,
 * and default roll shortcuts.
 */
export function draftToUserCharacterSheet(
  draft: W20CharacterCreationDraft,
  meta: DraftToUserSheetMeta
): W20UserCharacterSheet {
  const { finalComputedSheetPreview: preview } = validateW20CharacterCreation(draft);
  const now = meta.now ?? Date.now();

  const hasHugeSize = draft.meritsAndFlaws.some(
    (m) => m.kind === 'merit' && /huge\s*size/i.test(m.name)
  );
  const bonusBruisedBoxes = hasHugeSize ? 1 : 0;
  const boxes = Array<DamageType>(7 + bonusBruisedBoxes).fill('none');

  const backgrounds: SheetBackgroundEntry[] = Object.entries(preview.backgrounds)
    .filter(([, dots]) => dots > 0)
    .map(([key, dots]) => {
      const customLabel = draft.customBackgroundLabels?.[key]?.trim();
      const catalogEntry = W20_BACKGROUND_CATALOG.find((b) => b.key === key);
      return {
        id: key,
        name: customLabel || catalogEntry?.label || formatTraitLabel(key),
        dots,
      };
    });

  const gifts: SheetGiftEntry[] = draft.selectedGifts.map((sel) => {
    const match = CANONICAL_GIFT_CATALOG.find(
      (entry) =>
        entry.id === sel.giftId || entry.name.toLowerCase() === sel.giftId.trim().toLowerCase()
    );
    if (match) {
      return {
        id: match.id,
        name: match.name,
        level: match.level,
        rollAttribute: match.rollAttribute,
        rollAbility: match.rollAbility,
        difficulty: match.defaultDifficulty,
        rageCost: match.rageCost,
        gnosisCost: match.gnosisCost,
        willpowerCost: match.willpowerCost,
        summary: giftSheetSummary(match),
      };
    }
    return {
      id: sel.giftId,
      name: sel.giftId,
      level: sel.level,
      summary: '',
    };
  });

  const otherTraits: SheetOtherTraitEntry[] = draft.meritsAndFlaws.map((mf) => ({
    id: mf.id,
    name: mf.name,
    dots: mf.pointValue,
    kind: mf.kind,
    ruleId: mf.ruleId,
    ruleChoice: mf.ruleChoice,
    ruleChoices: mf.ruleChoices,
    customRule: mf.customRule,
    ...(mf.category ? { category: mf.category } : {}),
  }));

  const sheet: W20UserCharacterSheet = {
    id: meta.id,
    ownerDiscordId: meta.ownerDiscordId,
    syncCode: meta.syncCode !== undefined ? meta.syncCode : null,
    name: draft.name.trim() || 'New Garou',
    player: meta.player ?? '',
    chronicle: meta.chronicle ?? '',
    breed: draft.breed,
    auspice: draft.auspice,
    tribe: draft.tribe,
    packName: meta.packName ?? '',
    packTotem: meta.packTotem ?? '',
    concept: draft.concept,
    ...(meta.deedName ? { deedName: meta.deedName } : {}),
    ...(draft.metisDeformity?.trim() ? { metisDeformity: draft.metisDeformity.trim() } : {}),
    baseAttributes: { ...preview.attributes },
    abilities: { ...preview.abilities },
    customAbilities: [],
    specialties: {},
    backgrounds,
    gifts,
    renown: {
      glory: { permanent: preview.renown.glory, temporary: 0 },
      honor: { permanent: preview.renown.honor, temporary: 0 },
      wisdom: { permanent: preview.renown.wisdom, temporary: 0 },
    },
    rank: 1,
    rage: { permanent: preview.rage, temporary: preview.rage },
    gnosis: { permanent: preview.gnosis, temporary: preview.gnosis },
    willpower: { permanent: preview.willpower, temporary: preview.willpower },
    silverCarriedItems: 0,
    health: {
      bonusBruisedBoxes,
      boxes,
    },
    experience: {
      total: 0,
      spent: 0,
    },
    activeForm: getBreedNaturalForm(draft.breed),
    otherTraits,
    fetishes: [],
    rites: [],
    combatWeapons: [],
    armor: {
      rating: 0,
      description: '',
    },
    shortcuts: [],
    lastUsedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  sheet.shortcuts = buildDefaultSheetShortcuts(sheet);
  return sheet;
}

/**
 * Projects a W20UserCharacterSheet into the lightweight VTT seat tracker payload.
 */
export function sheetToLightTrackers(sheet: W20UserCharacterSheet): {
  rage: number;
  gnosis: number;
  willpower: number;
  woundPenalty: 0 | -1 | -2 | -5;
} {
  const woundState = computeWoundState(sheet.health);
  const woundPenalty =
    woundState.penalty === -1 || woundState.penalty === -2 || woundState.penalty === -5
      ? woundState.penalty
      : 0;

  return {
    rage: Math.max(0, Math.min(10, Math.floor(sheet.rage.temporary))),
    gnosis: Math.max(0, Math.min(10, Math.floor(sheet.gnosis.temporary))),
    willpower: Math.max(0, Math.min(10, Math.floor(sheet.willpower.temporary))),
    woundPenalty,
  };
}

export function reconcileSheetRuleHealth(
  sheet: W20UserCharacterSheet,
  previous?: W20UserCharacterSheet
): W20UserCharacterSheet {
  sheet = reconcileSheetRuleSources(sheet);
  const evaluation = evaluateModifierRules(getSheetModifierSources(sheet), {
    ...sheet,
    ruleTraits: ruleTraits(sheet),
  });
  const bonus = Math.max(
    0,
    Math.floor(
      applyRuleValue(evaluation, 'health:bruised', 0) +
        applyRuleValue(evaluation, 'health:temporary', 0)
    )
  );
  const priorBonus =
    sheet.ruleHealthBonus ??
    previous?.ruleHealthBonus ??
    (previous
      ? Math.max(
          0,
          applyRuleValue(
            evaluateModifierRules(getSheetModifierSources(previous), previous),
            'health:bruised',
            0
          )
        )
      : bonus);
  const inherited = Math.max(0, sheet.health.bonusBruisedBoxes - priorBonus);
  const damage = sheet.health.boxes.filter((box) => box !== 'none');
  const desiredBonus = Math.max(inherited + bonus, damage.length - 7);
  const boxes = (
    sheet.health.boxes.length <= 7 + desiredBonus
      ? [...sheet.health.boxes, ...Array(7 + desiredBonus - sheet.health.boxes.length).fill('none')]
      : [...damage, ...Array(Math.max(0, 7 + desiredBonus - damage.length)).fill('none')]
  ) as DamageType[];
  const managedBonus = desiredBonus - inherited;
  if (
    sheet.ruleHealthBonus === managedBonus &&
    sheet.health.bonusBruisedBoxes === desiredBonus &&
    sheet.health.boxes.length === boxes.length
  )
    return sheet;
  return {
    ...sheet,
    ruleHealthBonus: managedBonus,
    health: { bonusBruisedBoxes: desiredBonus, boxes },
  };
}

export function reconcileSheetRuleSources(sheet: W20UserCharacterSheet): W20UserCharacterSheet {
  const used = new Set<string>();
  let changed = false;
  const reconcile = <T extends { id: string }>(entries: T[], category: string): T[] =>
    entries.map((entry, index) => {
      let id = entry.id;
      if (used.has(id)) {
        const base = `${id}-${category}-${index + 1}`;
        id = base;
        let suffix = 1;
        while (used.has(id)) id = `${base}-${suffix++}`;
        changed = true;
      }
      used.add(id);
      return id === entry.id ? entry : { ...entry, id };
    });
  const otherTraits = reconcile(sheet.otherTraits, 'trait');
  const backgrounds = reconcile(sheet.backgrounds, 'background');
  const gifts = reconcile(sheet.gifts, 'gift');
  const rites = reconcile(sheet.rites, 'rite');
  const fetishes = reconcile(sheet.fetishes, 'fetish');
  const combatWeapons = reconcile(sheet.combatWeapons, 'weapon');
  const equipment = sheet.equipment ? reconcile(sheet.equipment, 'equipment') : undefined;
  return changed
    ? { ...sheet, otherTraits, backgrounds, gifts, rites, fetishes, combatWeapons, equipment }
    : sheet;
}
