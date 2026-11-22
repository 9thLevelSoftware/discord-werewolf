import {
  AbilityCategory,
  STARTING_GNOSIS_BY_BREED,
  STARTING_RAGE_BY_AUSPICE,
  STARTING_WILLPOWER_BY_TRIBE,
  validateW20CharacterCreation,
  W20_BACKGROUND_CATALOG,
  W20CharacterCreationDraft,
} from './characterCreation';
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

export interface SheetBackgroundEntry {
  id: string;
  name: string;
  dots: number;
}

export interface SheetGiftEntry {
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

export interface SheetFetishItem {
  id: string;
  name: string;
  level: number;
  gnosisRating: number;
  power: string;
  isSilver?: boolean;
}

export interface SheetRiteEntry {
  id: string;
  name: string;
  level?: number;
  summary: string;
}

export type OtherTraitKind = 'merit' | 'flaw' | 'other';

export interface SheetOtherTraitEntry {
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

export interface SheetWeaponEntry {
  id: string;
  name: string;
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
  difficulty: number;
  rageDiceCount: number;
  applyWoundPenalty: boolean;
  forceSpecialty?: boolean;
  isSecretRoll: boolean;
}

export interface ResolvedSheetShortcut {
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
    total: number;
    spent: number;
  };
  activeForm: GarouForm;
  otherTraits: SheetOtherTraitEntry[];
  fetishes: SheetFetishItem[];
  rites: SheetRiteEntry[];
  combatWeapons: SheetWeaponEntry[];
  armor: {
    rating: number;
    description: string;
  };
  shortcuts: SheetShortcut[];
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface CanonicalGiftCatalogEntry {
  id: string;
  name: string;
  level: number;
  sources: string[];
  rollAttribute: AttributeKey | 'rage' | 'gnosis' | 'willpower' | null;
  rollAbility: string | null;
  defaultDifficulty: number;
  rageCost: number;
  gnosisCost: number;
  willpowerCost: number;
  summary: string;
}

/**
 * All 44 canonical W20 Level 1 starting Gifts across the 3 Breeds, 5 Auspices, and 13 Tribes.
 */
export const CANONICAL_GIFT_CATALOG: readonly CanonicalGiftCatalogEntry[] = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    name: 'Master of Fire',
    level: 1,
    sources: ['homid', 'get_of_fenris'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis: fire damage heals as Bashing rather than Aggravated for the scene (W20 p. 152).',
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    name: 'Persuasion',
    level: 1,
    sources: ['homid', 'philodox', 'fianna', 'glass_walkers'],
    rollAttribute: 'charisma',
    rollAbility: 'subterfuge',
    defaultDifficulty: 7,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Charisma + Subterfuge (Diff 7) to gain -1 difficulty on Social rolls and sway skeptical listeners.',
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    name: 'Smell of Man',
    level: 1,
    sources: ['homid'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Passive/Willpower: normal animals perceive the Garou as an apex human hunter and flee or hesitate.',
  },
  {
    id: '10000000-0000-4000-8000-000000000104',
    name: 'Create Element',
    level: 1,
    sources: ['metis'],
    rollAttribute: 'gnosis',
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Gnosis (Diff 6) to conjure up to one cubic foot of air, earth, fire, or water.',
  },
  {
    id: '10000000-0000-4000-8000-000000000105',
    name: 'Primal Anger',
    level: 1,
    sources: ['metis'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Passive/Instant: draw upon inner resentment to store up to two extra Rage points above permanent Rage for one scene.',
  },
  {
    id: '10000000-0000-4000-8000-000000000106',
    name: 'Sense Wyrm',
    level: 1,
    sources: ['metis', 'theurge', 'black_furies', 'silent_striders', 'silver_fangs', 'stargazers', 'uktena'],
    rollAttribute: 'perception',
    rollAbility: 'occult',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Perception + Occult (Diff 6, or higher if masked) to detect nearby Wyrm taint, Banes, or possessed vessels.',
  },
  {
    id: '10000000-0000-4000-8000-000000000107',
    name: "Hare's Leap",
    level: 1,
    sources: ['lupus', 'fianna'],
    rollAttribute: 'strength',
    rollAbility: 'athletics',
    defaultDifficulty: 7,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary: 'Roll Strength + Athletics (Diff 7) to double normal jumping distances in any form.',
  },
  {
    id: '10000000-0000-4000-8000-000000000108',
    name: 'Heightened Senses',
    level: 1,
    sources: ['lupus', 'galliard', 'black_furies'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis to sharpen sight, hearing, and scent for the scene (-2 Perception difficulty in Homid/Glabro; acute tracking in wolf forms).',
  },
  {
    id: '10000000-0000-4000-8000-000000000109',
    name: 'Sense Prey',
    level: 1,
    sources: ['lupus'],
    rollAttribute: 'perception',
    rollAbility: 'primal_urge',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Perception + Primal-Urge (Diff 6) to pinpoint the trail, distance, and condition of hunted quarry (W20 p. 159).',
  },
  {
    id: '10000000-0000-4000-8000-000000000110',
    name: 'Blur of the Milky Eye',
    level: 1,
    sources: ['ragabash'],
    rollAttribute: 'manipulation',
    rollAbility: 'stealth',
    defaultDifficulty: 8,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Manipulation + Stealth (Diff 8) to become unremarkable and slip past onlookers unnoticed while motionless or walking casually.',
  },
  {
    id: '10000000-0000-4000-8000-000000000111',
    name: 'Open Seal',
    level: 1,
    sources: ['ragabash'],
    rollAttribute: 'gnosis',
    rollAbility: null,
    defaultDifficulty: 7,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Gnosis (Diff 7) to unlock nearly any physical lock, latch, or sealed door.',
  },
  {
    id: '10000000-0000-4000-8000-000000000112',
    name: 'Scent of Running Water',
    level: 1,
    sources: ['ragabash', 'red_talons'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Passive: completely masks natural scent so tracking dogs and Garou take +2 difficulty to track by smell.',
  },
  {
    id: '10000000-0000-4000-8000-000000000113',
    name: "Mother's Touch",
    level: 1,
    sources: ['theurge', 'children_of_gaia'],
    rollAttribute: 'intelligence',
    rollAbility: 'empathy',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Intelligence + Empathy (Diff 6, or higher for Aggravated) to heal 1 health level per success.',
  },
  {
    id: '10000000-0000-4000-8000-000000000114',
    name: 'Spirit Speech',
    level: 1,
    sources: ['theurge', 'uktena'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary: 'Passive: understand and speak the high speech of spirits across the Umbra.',
  },
  {
    id: '10000000-0000-4000-8000-000000000115',
    name: 'Resist Pain',
    level: 1,
    sources: ['philodox', 'children_of_gaia', 'get_of_fenris', 'wendigo'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 1,
    summary: 'Spend 1 Willpower to ignore all wound penalties for the remainder of the scene.',
  },
  {
    id: '10000000-0000-4000-8000-000000000116',
    name: 'Truth of Gaia',
    level: 1,
    sources: ['philodox'],
    rollAttribute: 'intelligence',
    rollAbility: 'empathy',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Intelligence + Empathy (Diff target Manipulation + Subterfuge or 6) to discern deliberate lies.',
  },
  {
    id: '10000000-0000-4000-8000-000000000117',
    name: 'Beast Speech',
    level: 1,
    sources: ['galliard', 'red_talons'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary: 'Passive: communicate effortlessly with mundane animals of any species.',
  },
  {
    id: '10000000-0000-4000-8000-000000000118',
    name: 'Call of the Wyld',
    level: 1,
    sources: ['galliard'],
    rollAttribute: 'stamina',
    rollAbility: 'expression',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Stamina + Expression (Diff 6) to send a supernatural howl miles across terrain, summoning allies or rallying packmates.',
  },
  {
    id: '10000000-0000-4000-8000-000000000119',
    name: 'Mindspeak',
    level: 1,
    sources: ['galliard'],
    rollAttribute: 'manipulation',
    rollAbility: 'expression',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      "Spend 1 Gnosis and roll Manipulation + Expression (Diff 6) to project thoughts or emotions into a packmate's mind.",
  },
  {
    id: '10000000-0000-4000-8000-000000000120',
    name: 'Razor Claws',
    level: 1,
    sources: ['ahroun', 'get_of_fenris'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 1,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Spend 1 Rage and rake claws over stone or metal to gain +2 damage dice and -1 claw difficulty for the scene (Crinos/Hispo/Lupus).',
  },
  {
    id: '10000000-0000-4000-8000-000000000121',
    name: 'Inspiration',
    level: 1,
    sources: ['ahroun', 'silver_fangs'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis to rally packmates within sight, granting each ally 1 automatic Willpower success on their next action or Courage check.',
  },
  {
    id: '10000000-0000-4000-8000-000000000122',
    name: 'Falling Touch',
    level: 1,
    sources: ['ahroun', 'stargazers'],
    rollAttribute: 'dexterity',
    rollAbility: 'medicine',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Dexterity + Medicine (Diff target Stamina + 3) to drop an opponent prone with a single precise strike.',
  },
  {
    id: '10000000-0000-4000-8000-000000000123',
    name: 'Breath of the Wyld',
    level: 1,
    sources: ['black_furies'],
    rollAttribute: 'charisma',
    rollAbility: 'empathy',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Charisma + Empathy (Diff 6) to revitalize an exhausted or grieving ally.',
  },
  {
    id: '10000000-0000-4000-8000-000000000124',
    name: 'Cooking',
    level: 1,
    sources: ['bone_gnawers'],
    rollAttribute: 'intelligence',
    rollAbility: 'survival',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Intelligence + Survival (Diff 6) to turn scrap into nourishing sustenance for a pack.',
  },
  {
    id: '10000000-0000-4000-8000-000000000125',
    name: 'Resist Toxin',
    level: 1,
    sources: ['bone_gnawers', 'fianna'],
    rollAttribute: 'stamina',
    rollAbility: 'survival',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Stamina + Survival (Diff 6) to neutralize poisons, drugs, or Wyrm-tainted toxins.',
  },
  {
    id: '10000000-0000-4000-8000-000000000126',
    name: 'Calm',
    level: 1,
    sources: ['children_of_gaia'],
    rollAttribute: 'charisma',
    rollAbility: 'empathy',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Charisma + Empathy (Diff target Rage or Willpower) to soothe Rage and avert Frenzy.',
  },
  {
    id: '10000000-0000-4000-8000-000000000127',
    name: "Brother's Scent",
    level: 1,
    sources: ['children_of_gaia'],
    rollAttribute: 'charisma',
    rollAbility: 'primal_urge',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Charisma + Primal-Urge (Diff 6) to radiate peaceful familiarity so hostile packmates hesitate before attacking.',
  },
  {
    id: '10000000-0000-4000-8000-000000000128',
    name: 'Two Tongues',
    level: 1,
    sources: ['fianna'],
    rollAttribute: 'intelligence',
    rollAbility: 'expression',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Intelligence + Expression (Diff 6) to deliver a statement carrying two clear meanings at once.',
  },
  {
    id: '10000000-0000-4000-8000-000000000129',
    name: 'Visage of Fenris',
    level: 1,
    sources: ['get_of_fenris'],
    rollAttribute: 'charisma',
    rollAbility: 'intimidation',
    defaultDifficulty: 6,
    rageCost: 1,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Spend 1 Rage and roll Charisma + Intimidation (Diff 6) to project terrifying battle fury, penalizing weak-willed foes.',
  },
  {
    id: '10000000-0000-4000-8000-000000000130',
    name: 'Control Simple Machine',
    level: 1,
    sources: ['glass_walkers'],
    rollAttribute: 'manipulation',
    rollAbility: 'technology',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Manipulation + Technology (Diff 6) to operate, jam, or command simple mechanical devices.',
  },
  {
    id: '10000000-0000-4000-8000-000000000131',
    name: 'Diagnostics',
    level: 1,
    sources: ['glass_walkers'],
    rollAttribute: 'perception',
    rollAbility: 'science',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Perception + Science (Diff 6) to immediately understand how a device functions and identify faults or sabotage.',
  },
  {
    id: '10000000-0000-4000-8000-000000000132',
    name: 'Wolf at the Door',
    level: 1,
    sources: ['red_talons'],
    rollAttribute: 'manipulation',
    rollAbility: 'intimidation',
    defaultDifficulty: 7,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Manipulation + Intimidation (Diff 7) to trap a human indoors through primal dread of the wild outside.',
  },
  {
    id: '10000000-0000-4000-8000-000000000133',
    name: 'Aura of Confidence',
    level: 1,
    sources: ['shadow_lords'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary: 'Passive/Instant: hide all emotional uncertainty and resist mind-reading attempts.',
  },
  {
    id: '10000000-0000-4000-8000-000000000134',
    name: 'Fatal Flaw',
    level: 1,
    sources: ['shadow_lords'],
    rollAttribute: 'perception',
    rollAbility: 'empathy',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      "Spend 1 Gnosis and roll Perception + Empathy (Diff target Willpower) to expose an adversary's greatest weakness.",
  },
  {
    id: '10000000-0000-4000-8000-000000000135',
    name: 'Speed of Thought',
    level: 1,
    sources: ['silent_striders'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary: 'Spend 1 Gnosis to double running speed for the scene.',
  },
  {
    id: '10000000-0000-4000-8000-000000000136',
    name: "Heaven's Guidance",
    level: 1,
    sources: ['silent_striders'],
    rollAttribute: 'perception',
    rollAbility: 'survival',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Perception + Survival (Diff 6) under open sky to gain uncanny bearings and navigate unerringly.',
  },
  {
    id: '10000000-0000-4000-8000-000000000137',
    name: 'Eye of the Falcon',
    level: 1,
    sources: ['silver_fangs'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary: 'Spend 1 Gnosis to command respect from all Garou of lower Rank for one scene.',
  },
  {
    id: '10000000-0000-4000-8000-000000000138',
    name: 'Lambent Flame',
    level: 1,
    sources: ['silver_fangs'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis to surround your body in silver moonlight (+1 difficulty on incoming attacks; -1 Social difficulty with Garou).',
  },
  {
    id: '10000000-0000-4000-8000-000000000139',
    name: 'Balance',
    level: 1,
    sources: ['stargazers'],
    rollAttribute: null,
    rollAbility: null,
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Passive: maintain flawless footing on narrow ledges, slick ice, or unstable surfaces; reduce knockdown difficulty.',
  },
  {
    id: '10000000-0000-4000-8000-000000000140',
    name: 'Inner Strength',
    level: 1,
    sources: ['stargazers'],
    rollAttribute: 'stamina',
    rollAbility: 'athletics',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Stamina + Athletics (Diff 6) to focus chi and add temporary Willpower or ignore fatigue.',
  },
  {
    id: '10000000-0000-4000-8000-000000000141',
    name: 'Sense Magic',
    level: 1,
    sources: ['uktena'],
    rollAttribute: 'perception',
    rollAbility: 'occult',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Perception + Occult (Diff 6) to detect active Fetishes, Gifts, Rites, or sorcery nearby.',
  },
  {
    id: '10000000-0000-4000-8000-000000000142',
    name: 'Shroud',
    level: 1,
    sources: ['uktena'],
    rollAttribute: 'gnosis',
    rollAbility: null,
    defaultDifficulty: 7,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Gnosis (Diff 7) to blanket an area in unnatural shadow, raising Perception/Ranged difficulties.',
  },
  {
    id: '10000000-0000-4000-8000-000000000143',
    name: 'Call the Breeze',
    level: 1,
    sources: ['wendigo'],
    rollAttribute: 'charisma',
    rollAbility: 'survival',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 1,
    willpowerCost: 0,
    summary:
      'Spend 1 Gnosis and roll Charisma + Survival (Diff 6) to summon biting wind that chills foes and masks scents.',
  },
  {
    id: '10000000-0000-4000-8000-000000000144',
    name: 'Camouflage',
    level: 1,
    sources: ['wendigo'],
    rollAttribute: 'wits',
    rollAbility: 'stealth',
    defaultDifficulty: 6,
    rageCost: 0,
    gnosisCost: 0,
    willpowerCost: 0,
    summary:
      'Roll Wits + Stealth (Diff 6) to blend seamlessly into snow, timber, or natural wilderness cover.',
  },
];

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
  effectiveAttributes: BaseAttributes;
  formSpec: FormModifierSpec;
  effectiveGnosisPool: number;
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
export function computeUserSheetStats(sheet: W20UserCharacterSheet): UserSheetComputedStats {
  const spec = W20_FORM_MATRIX[sheet.activeForm];
  const base = sheet.baseAttributes;

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

  const woundState = computeWoundState(sheet.health);
  const naturalBreedForm = getBreedNaturalForm(sheet.breed);
  const isBreedForm = sheet.activeForm === naturalBreedForm;
  const isHumanForm = sheet.activeForm === 'homid';

  const naturalSoakPool = effectiveAttributes.stamina;
  const armorRating = Math.max(0, Math.floor(sheet.armor.rating));
  const brawlDots = lookupSheetAbilityDots(sheet, 'brawl');
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
    formSpec: spec,
    effectiveGnosisPool: Math.max(
      0,
      Math.floor(sheet.gnosis.permanent) - Math.max(0, Math.floor(sheet.silverCarriedItems))
    ),
    woundPenalty: woundState.penalty,
    isIncapacitated: woundState.isIncapacitated,
    woundLabel: woundState.woundLabel,
    perceptionDifficultyMod: spec.perceptionDifficultyMod,
    shiftDifficulty: spec.shiftDifficulty,
    incitesDelirium: spec.incitesDelirium,
    initiativeBonus:
      effectiveAttributes.dexterity + effectiveAttributes.wits + woundState.penalty,
    soakCapabilities: {
      naturalSoakPool,
      armorRating,
      soakPool: naturalSoakPool + armorRating,
      canSoakBashing: true,
      canSoakLethal: !isHumanForm,
      canSoakAggravated: !isHumanForm,
      canSoakSilver: sheet.breed !== 'metis' && isBreedForm,
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
  shortcut: SheetShortcut
): ResolvedSheetShortcut {
  const stats = computeUserSheetStats(sheet);
  const spec = stats.formSpec;
  const source = shortcut.source;

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
        attrDots = Math.max(0, Math.floor(sheet.rage.permanent));
        parts.push(`Rage (${attrDots})`);
      } else if (source.attribute === 'gnosis') {
        attrDots = stats.effectiveGnosisPool;
        parts.push(
          sheet.silverCarriedItems > 0
            ? `Gnosis (${sheet.gnosis.permanent} - ${sheet.silverCarriedItems} Silver = ${attrDots})`
            : `Gnosis (${attrDots})`
        );
      } else if (source.attribute === 'willpower') {
        attrDots = Math.max(0, Math.floor(sheet.willpower.permanent));
        parts.push(`Willpower (${attrDots})`);
      } else if (source.attribute) {
        const attrSource = useFormStats ? stats.effectiveAttributes : sheet.baseAttributes;
        attrDots = Math.max(0, Math.floor(attrSource[source.attribute]));
        parts.push(`${formatTraitLabel(source.attribute)} (${attrDots})`);
      }

      let abilDots = 0;
      if (source.ability) {
        abilDots = lookupSheetAbilityDots(sheet, source.ability);
        const custom = findCustomAbility(sheet, source.ability);
        parts.push(`${custom ? custom.name : formatTraitLabel(source.ability)} (${abilDots})`);
      }

      const flatMod = source.flatModifier ?? 0;
      if (flatMod !== 0) {
        parts.push(flatMod > 0 ? `+${flatMod}` : `${flatMod}`);
      }

      rawPool = attrDots + abilDots + flatMod;

      if (source.attribute === 'perception' && source.applyPerceptionFormDiff !== false) {
        rawDiff += spec.perceptionDifficultyMod;
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
      if (weapon) {
        const attrDots = stats.effectiveAttributes[weapon.rollAttribute];
        const abilDots = lookupSheetAbilityDots(sheet, weapon.rollAbility);
        const custom = findCustomAbility(sheet, weapon.rollAbility);
        rawPool = attrDots + abilDots;
        rawDiff =
          weapon.difficulty +
          (weapon.rollAttribute === 'perception' ? spec.perceptionDifficultyMod : 0);
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
        formulaSummary = `Missing weapon (${source.weaponId})`;
      }
      break;
    }

    case 'weapon_damage': {
      const weapon = sheet.combatWeapons.find((w) => w.id === source.weaponId);
      applyWoundPenalty = false;
      if (weapon) {
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
        formulaSummary = `Missing weapon (${source.weaponId})`;
      }
      break;
    }

    case 'fetish_activate': {
      const fetish = sheet.fetishes.find((f) => f.id === source.fetishId);
      applyWoundPenalty = false;
      if (fetish) {
        rawPool = fetish.gnosisRating;
        formulaSummary = `Fetish Gnosis (${fetish.gnosisRating})`;
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

  const basePool = Math.max(1, Math.min(30, rawPool));
  const difficulty = Math.max(2, Math.min(10, rawDiff));
  const effectivePool = Math.max(0, rawPool + (applyWoundPenalty ? stats.woundPenalty : 0));

  return {
    shortcut,
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
        summary: match.summary,
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
