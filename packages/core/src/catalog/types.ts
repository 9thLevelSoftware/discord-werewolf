import type { AttributeKey, MeritOrFlawChoice } from '../types';

/**
 * Where a catalog entry comes from.
 * - `W20`: Werewolf: The Apocalypse 20th Anniversary Edition core rulebook (`page` is the printed page).
 * - `Wolfbane`: the third-party "Wolfbane Werewolf Master List" compilations (name and cost only).
 * - `legacy`: entries that shipped with earlier versions of this app and could not be matched to a source.
 */
export interface CatalogSourceRef {
  book: 'W20' | 'Wolfbane' | 'legacy';
  page?: number;
}

export type GiftRollTrait = AttributeKey | 'rage' | 'gnosis' | 'willpower';

/**
 * - `core`: listed for a breed, auspice or one of the 13 tribes.
 * - `camp`: tribal camp Gifts printed in sidebars (Hakken, Boli Zousizhe, Kucha Ekundu).
 * - `outsider`: Gifts for characters outside the Garou Nation (Skin Dancers).
 */
export type GiftCatalogTier = 'core' | 'camp' | 'outsider';

export interface W20GiftCatalogEntry {
  /** Stable id. UUID-shaped so it can double as `compendium_gifts.id`. */
  id: string;
  slug: string;
  name: string;
  /** Gift level / minimum Rank, 1-6. */
  level: number;
  /** Breed, auspice, tribe or camp keys whose list includes this Gift. */
  sources: string[];
  rollAttribute: GiftRollTrait | null;
  rollAbility: string | null;
  /** Fixed difficulty when the book gives one; 6 when it is variable (see `difficultyNote`) or there is no roll. */
  defaultDifficulty: number;
  difficultyNote?: string;
  rageCost: number;
  gnosisCost: number;
  willpowerCost: number;
  /** Original one-line mechanical summary. */
  summary: string;
  tier: GiftCatalogTier;
  /** Parent tribe for `camp` Gifts. */
  campOf?: string;
  /** Slug of the Gift this one duplicates under another name. */
  aliasOf?: string;
  source: CatalogSourceRef;
}

/**
 * - `core`: W20 rulebook Merits and Flaws for Garou.
 * - `kinfolk`: W20 rulebook Merits and Flaws for Kinfolk characters.
 * - `compilation`: entries found only in the Wolfbane compilation (name and cost; may be house rules).
 * - `legacy`: entries from earlier versions of this app that do not match the book.
 */
export type MeritFlawCatalogTier = 'core' | 'kinfolk' | 'compilation' | 'legacy';

export interface CatalogRestrictions {
  breeds?: string[];
  auspices?: string[];
  tribes?: string[];
  note?: string;
}

export interface W20MeritFlawCatalogEntry extends MeritOrFlawChoice {
  /** `pointValue` is the lowest cost; set when the cost is a range. */
  maxPointValue?: number;
  /** Set when only specific costs inside the range are allowed. */
  costOptions?: number[];
  /** Conditional cost text from the compilation (for example a discount for one auspice). */
  costNote?: string;
  tier: MeritFlawCatalogTier;
  restrictions?: CatalogRestrictions;
  repeatable?: boolean;
  source: CatalogSourceRef;
}

export type RiteType =
  | 'accord'
  | 'caern'
  | 'death'
  | 'mystic'
  | 'punishment'
  | 'renown'
  | 'seasonal'
  | 'minor';

export interface W20RiteCatalogEntry {
  id: string;
  name: string;
  type: RiteType;
  /** 1-5; 0 for minor rites. */
  level: number;
  /** Standard roll for the rite's type (W20 p. 202); null when it varies or there is none. */
  rollAttribute: AttributeKey | null;
  rollAbility: string | null;
  difficulty: number | null;
  difficultyNote?: string;
  summary: string;
  source: CatalogSourceRef;
}

export interface W20FetishCatalogEntry {
  id: string;
  name: string;
  level: number;
  gnosis: number;
  summary: string;
  source: CatalogSourceRef;
}

export interface W20TalenCatalogEntry {
  id: string;
  name: string;
  gnosis: number;
  summary: string;
  source: CatalogSourceRef;
}

export type TotemCategory = 'respect' | 'war' | 'wisdom' | 'cunning';

export interface W20TotemCatalogEntry {
  id: string;
  name: string;
  category: TotemCategory;
  backgroundCost: number;
  summary: string;
  individualTraits: string | null;
  packTraits: string | null;
  ban: string | null;
  source: CatalogSourceRef;
}

export type BackgroundTier = 'core' | 'expanded';

export interface W20BackgroundCatalogEntry {
  key: string;
  label: string;
  tier: BackgroundTier;
  summary: string;
  /** Present for Backgrounds printed in the W20 core rulebook. */
  source?: CatalogSourceRef;
  /** Tribes that may not take this Background at creation without Storyteller approval. */
  restrictedTribes?: string[];
  /** Tribes for whom this Background is rare. */
  discouragedTribes?: string[];
}
