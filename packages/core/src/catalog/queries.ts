import { W20_GIFT_CATALOG } from './gifts.data';
import { W20_MERITS_FLAWS_CATALOG } from './meritsFlaws.data';
import type {
  GiftCatalogTier,
  MeritFlawCatalogTier,
  W20GiftCatalogEntry,
  W20MeritFlawCatalogEntry,
} from './types';

export interface GiftCatalogFilter {
  /** Free text matched against name, summary and sources. */
  query?: string;
  /** Exact Gift level. */
  level?: number;
  maxLevel?: number;
  /** Breed, auspice, tribe or camp key. */
  source?: string;
  /** Defaults to every tier. */
  tiers?: readonly GiftCatalogTier[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

export function filterGiftCatalog(
  filter: GiftCatalogFilter = {},
  catalog: readonly W20GiftCatalogEntry[] = W20_GIFT_CATALOG
): W20GiftCatalogEntry[] {
  const q = normalize(filter.query ?? '');
  return catalog.filter((gift) => {
    if (filter.level !== undefined && gift.level !== filter.level) return false;
    if (filter.maxLevel !== undefined && gift.level > filter.maxLevel) return false;
    if (filter.source && !gift.sources.includes(filter.source)) return false;
    if (filter.tiers && !filter.tiers.includes(gift.tier)) return false;
    if (!q) return true;
    return (
      gift.name.toLowerCase().includes(q) ||
      gift.summary.toLowerCase().includes(q) ||
      gift.sources.some((src) => src.replace(/_/g, ' ').includes(q) || src.includes(q))
    );
  });
}

/** Resolves a stored Gift reference, which may be a catalog id, a slug or a typed name. */
export function findGiftInCatalog(idOrName: string): W20GiftCatalogEntry | undefined {
  const needle = normalize(idOrName);
  if (!needle) return undefined;
  return W20_GIFT_CATALOG.find(
    (gift) => gift.id === idOrName || gift.slug === needle || gift.name.toLowerCase() === needle
  );
}

export interface MeritFlawCatalogFilter {
  query?: string;
  kind?: 'merit' | 'flaw';
  category?: string;
  /** Defaults to every tier. */
  tiers?: readonly MeritFlawCatalogTier[];
}

export function filterMeritFlawCatalog(
  filter: MeritFlawCatalogFilter = {},
  catalog: readonly W20MeritFlawCatalogEntry[] = W20_MERITS_FLAWS_CATALOG
): W20MeritFlawCatalogEntry[] {
  const q = normalize(filter.query ?? '');
  return catalog.filter((entry) => {
    if (filter.kind && entry.kind !== filter.kind) return false;
    if (filter.category && entry.category !== filter.category) return false;
    if (filter.tiers && !filter.tiers.includes(entry.tier)) return false;
    if (!q) return true;
    return (
      entry.name.toLowerCase().includes(q) || (entry.summary ?? '').toLowerCase().includes(q)
    );
  });
}

/** "2", "1-5" or "1 or 5", for showing a catalog entry's cost. */
export function formatMeritFlawCost(entry: W20MeritFlawCatalogEntry): string {
  if (entry.costOptions && entry.costOptions.length > 1) return entry.costOptions.join(' or ');
  if (entry.maxPointValue && entry.maxPointValue !== entry.pointValue) {
    return `${entry.pointValue}-${entry.maxPointValue}`;
  }
  return String(entry.pointValue);
}

/** The point values a player may pick for an entry. */
export function meritFlawCostChoices(entry: W20MeritFlawCatalogEntry): number[] {
  if (entry.costOptions && entry.costOptions.length > 0) return [...entry.costOptions];
  const max = entry.maxPointValue ?? entry.pointValue;
  const choices: number[] = [];
  for (let value = entry.pointValue; value <= max; value += 1) choices.push(value);
  return choices;
}

const SOURCE_BOOK_LABELS = { W20: 'W20', Wolfbane: 'Wolfbane list', legacy: 'Earlier app list' } as const;

/** "W20 p. 472", "Wolfbane list". */
export function formatCatalogSource(source: { book: keyof typeof SOURCE_BOOK_LABELS; page?: number }): string {
  const label = SOURCE_BOOK_LABELS[source.book];
  return source.page ? `${label} p. ${source.page}` : label;
}
