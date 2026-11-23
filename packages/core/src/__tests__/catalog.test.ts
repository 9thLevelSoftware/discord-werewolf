import { describe, expect, it } from 'vitest';
import {
  filterGiftCatalog,
  filterMeritFlawCatalog,
  findGiftInCatalog,
  formatCatalogSource,
  formatMeritFlawCost,
  meritFlawCostChoices,
  W20_BACKGROUND_CATALOG,
  W20_FETISH_CATALOG,
  W20_GIFT_CATALOG,
  W20_MERITS_FLAWS_CATALOG,
  W20_RITE_CATALOG,
  W20_TALEN_CATALOG,
  W20_TOTEM_CATALOG,
} from '../catalog';
import type { CatalogSourceRef } from '../catalog';
import { validateW20CharacterCreation } from '../characterCreation';
import { makeValidCreationDraft } from './testHelpers';

const BREEDS = ['homid', 'metis', 'lupus'];
const AUSPICES = ['ragabash', 'theurge', 'philodox', 'galliard', 'ahroun'];
const TRIBES = [
  'black_furies',
  'bone_gnawers',
  'children_of_gaia',
  'fianna',
  'get_of_fenris',
  'glass_walkers',
  'red_talons',
  'shadow_lords',
  'silent_striders',
  'silver_fangs',
  'stargazers',
  'uktena',
  'wendigo',
];
const CAMPS = ['hakken', 'boli_zousizhe', 'kucha_ekundu', 'skin_dancer'];
const ATTRIBUTES = [
  'strength',
  'dexterity',
  'stamina',
  'charisma',
  'manipulation',
  'appearance',
  'perception',
  'intelligence',
  'wits',
];
const ABILITIES = [
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
];

const expectUnique = (values: readonly string[]) => {
  expect(new Set(values).size).toBe(values.length);
};

const expectBookSource = (source: CatalogSourceRef, firstPage: number, lastPage: number) => {
  expect(source.book).toBe('W20');
  expect(source.page).toBeGreaterThanOrEqual(firstPage);
  expect(source.page).toBeLessThanOrEqual(lastPage);
};

const expectSummary = (summary: string | undefined) => {
  expect(summary?.trim().length ?? 0).toBeGreaterThan(10);
  // One-line original summaries, never pasted paragraphs.
  expect(summary?.length ?? 0).toBeLessThanOrEqual(170);
};

describe('W20 Gift catalog', () => {
  it('has unique ids, slugs and names', () => {
    expectUnique(W20_GIFT_CATALOG.map((g) => g.id));
    expectUnique(W20_GIFT_CATALOG.map((g) => g.slug));
    expectUnique(W20_GIFT_CATALOG.map((g) => g.name.toLowerCase()));
    for (const gift of W20_GIFT_CATALOG) {
      expect(gift.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('keeps every field inside its valid range', () => {
    const validSources = new Set([...BREEDS, ...AUSPICES, ...TRIBES, ...CAMPS]);
    const rollTraits = new Set([...ATTRIBUTES, 'rage', 'gnosis', 'willpower']);
    for (const gift of W20_GIFT_CATALOG) {
      expect(gift.level).toBeGreaterThanOrEqual(1);
      expect(gift.level).toBeLessThanOrEqual(6);
      expect(gift.sources.length).toBeGreaterThan(0);
      for (const source of gift.sources) expect(validSources.has(source)).toBe(true);
      if (gift.rollAttribute !== null) expect(rollTraits.has(gift.rollAttribute)).toBe(true);
      if (gift.rollAbility !== null) {
        expect(gift.rollAttribute).not.toBeNull();
        expect(ABILITIES).toContain(gift.rollAbility);
      }
      expect(gift.defaultDifficulty).toBeGreaterThanOrEqual(2);
      expect(gift.defaultDifficulty).toBeLessThanOrEqual(10);
      for (const cost of [gift.rageCost, gift.gnosisCost, gift.willpowerCost]) {
        expect(Number.isInteger(cost)).toBe(true);
        expect(cost).toBeGreaterThanOrEqual(0);
        expect(cost).toBeLessThanOrEqual(10);
      }
      expectSummary(gift.summary);
      expectBookSource(gift.source, 152, 201);
      if (gift.tier === 'core') {
        expect(gift.sources.some((s) => !CAMPS.includes(s))).toBe(true);
      }
      if (gift.aliasOf) {
        expect(W20_GIFT_CATALOG.some((other) => other.slug === gift.aliasOf)).toBe(true);
      }
    }
  });

  it('covers every breed, auspice and tribe at ranks 1 to 5', () => {
    for (const source of [...BREEDS, ...AUSPICES, ...TRIBES]) {
      for (let level = 1; level <= 5; level += 1) {
        const count = filterGiftCatalog({ source, level }).length;
        expect(count, `${source} level ${level}`).toBeGreaterThanOrEqual(2);
      }
      expect(filterGiftCatalog({ source, level: 1 }).length, `${source} level 1`).toBeGreaterThanOrEqual(5);
    }
    expect(filterGiftCatalog({ level: 6 }).length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the ids of the 44 Gifts that shipped before the catalog expansion', () => {
    const legacyIds = W20_GIFT_CATALOG.filter((g) =>
      /^10000000-0000-4000-8000-0000000001(0[1-9]|[1-3][0-9]|4[0-4])$/.test(g.id)
    );
    expect(legacyIds).toHaveLength(44);
    // The rulebook lists Calm and Inner Strength at Level Two; the earlier list had them at Level One.
    const notLevelOne = legacyIds.filter((g) => g.level !== 1).map((g) => g.name);
    expect(notLevelOne.sort()).toEqual(['Calm', 'Inner Strength']);
    expect(findGiftInCatalog('10000000-0000-4000-8000-000000000102')?.name).toBe('Persuasion');
    expect(findGiftInCatalog('10000000-0000-4000-8000-000000000142')?.name).toBe('Shroud');
    expect(findGiftInCatalog('razor claws')?.sources).toEqual(
      expect.arrayContaining(['ahroun', 'get_of_fenris'])
    );
  });

  it('filters by text, level, source and tier', () => {
    expect(filterGiftCatalog({ query: 'silent striders', level: 1 }).length).toBeGreaterThanOrEqual(5);
    expect(filterGiftCatalog({ maxLevel: 1 }).every((g) => g.level === 1)).toBe(true);
    expect(filterGiftCatalog({ tiers: ['camp'] }).every((g) => g.campOf !== undefined)).toBe(true);
    expect(filterGiftCatalog({ query: 'zzz-no-such-gift' })).toHaveLength(0);
  });
});

describe('W20 Merit and Flaw catalog', () => {
  it('has unique ids and no duplicate name within a kind and tier', () => {
    expectUnique(W20_MERITS_FLAWS_CATALOG.map((m) => m.id));
    expectUnique(
      W20_MERITS_FLAWS_CATALOG.map((m) => `${m.tier}|${m.kind}|${m.name.toLowerCase()}`)
    );
  });

  it('keeps costs between 1 and 7 and ranges well formed', () => {
    for (const entry of W20_MERITS_FLAWS_CATALOG) {
      expect(['merit', 'flaw']).toContain(entry.kind);
      expect(Number.isInteger(entry.pointValue)).toBe(true);
      expect(entry.pointValue).toBeGreaterThanOrEqual(1);
      expect(entry.pointValue).toBeLessThanOrEqual(7);
      if (entry.maxPointValue !== undefined) {
        expect(entry.maxPointValue).toBeGreaterThan(entry.pointValue);
        expect(entry.maxPointValue).toBeLessThanOrEqual(7);
      }
      const choices = meritFlawCostChoices(entry);
      expect(choices[0]).toBe(entry.pointValue);
      expect(choices.every((value) => value >= 1 && value <= 7)).toBe(true);
      if (entry.category) {
        expect(['physical', 'mental', 'social', 'supernatural']).toContain(entry.category);
      }
      for (const breed of entry.restrictions?.breeds ?? []) expect(BREEDS).toContain(breed);
      for (const auspice of entry.restrictions?.auspices ?? []) expect(AUSPICES).toContain(auspice);
      for (const tribe of entry.restrictions?.tribes ?? []) expect(TRIBES).toContain(tribe);
    }
  });

  it('gives every rulebook entry a category, summary and page', () => {
    const core = W20_MERITS_FLAWS_CATALOG.filter((m) => m.tier === 'core');
    expect(core.filter((m) => m.kind === 'merit').length).toBeGreaterThanOrEqual(55);
    expect(core.filter((m) => m.kind === 'flaw').length).toBeGreaterThanOrEqual(60);
    for (const entry of core) {
      expect(entry.category).toBeDefined();
      expectSummary(entry.summary);
      expectBookSource(entry.source, 471, 485);
    }
    for (const entry of W20_MERITS_FLAWS_CATALOG.filter((m) => m.tier === 'kinfolk')) {
      expectBookSource(entry.source, 380, 384);
      expect(entry.restrictions?.note).toMatch(/kinfolk/i);
    }
  });

  it('labels compilation and legacy entries by source and keeps earlier ids', () => {
    for (const entry of W20_MERITS_FLAWS_CATALOG.filter((m) => m.tier === 'compilation')) {
      expect(entry.source.book).toBe('Wolfbane');
    }
    for (const id of [
      'merit-acute-senses',
      'merit-huge-size',
      'merit-silver-tolerance',
      'merit-pack-mentality',
      'flaw-dark-fate',
      'flaw-sign-of-wolf',
      'flaw-bad-taste',
      'flaw-deep-sleeper',
      'flaw-slippery-mind',
    ]) {
      expect(W20_MERITS_FLAWS_CATALOG.some((m) => m.id === id), id).toBe(true);
    }
  });

  it('filters and formats costs', () => {
    const bookMerits = filterMeritFlawCatalog({ kind: 'merit', tiers: ['core'] });
    expect(bookMerits.every((m) => m.kind === 'merit' && m.tier === 'core')).toBe(true);
    expect(filterMeritFlawCatalog({ query: 'silver tolerance' })[0]?.pointValue).toBe(7);
    const enemy = W20_MERITS_FLAWS_CATALOG.find((m) => m.id === 'flaw-enemy');
    expect(enemy && formatMeritFlawCost(enemy)).toBe('1-5');
    expect(enemy && meritFlawCostChoices(enemy)).toEqual([1, 2, 3, 4, 5]);
    const mixed = W20_MERITS_FLAWS_CATALOG.find((m) => m.name === 'Mixed-morph');
    expect(mixed && formatMeritFlawCost(mixed)).toBe('1 or 5');
    expect(formatCatalogSource({ book: 'W20', page: 472 })).toBe('W20 p. 472');
    expect(formatCatalogSource({ book: 'Wolfbane' })).toBe('Wolfbane list');
  });
});

describe('W20 Background, Rite, Fetish, Talen and Totem catalogs', () => {
  it('keeps Background keys stable and tribe restrictions valid', () => {
    expectUnique(W20_BACKGROUND_CATALOG.map((b) => b.key));
    const core = W20_BACKGROUND_CATALOG.filter((b) => b.tier === 'core');
    expect(core.map((b) => b.key).sort()).toEqual(
      [
        'allies',
        'ancestors',
        'contacts',
        'fate',
        'fetish',
        'kinfolk',
        'mentor',
        'pure_breed',
        'resources',
        'rites',
        'spirit_heritage',
        'totem',
      ].sort()
    );
    for (const entry of core) expectBookSource(entry.source as CatalogSourceRef, 135, 140);
    for (const entry of W20_BACKGROUND_CATALOG) {
      for (const tribe of [...(entry.restrictedTribes ?? []), ...(entry.discouragedTribes ?? [])]) {
        expect(TRIBES).toContain(tribe);
      }
    }
  });

  it('has well-formed Rites', () => {
    expectUnique(W20_RITE_CATALOG.map((r) => r.id));
    expect(W20_RITE_CATALOG.length).toBeGreaterThanOrEqual(50);
    for (const rite of W20_RITE_CATALOG) {
      expect(rite.level).toBeGreaterThanOrEqual(0);
      expect(rite.level).toBeLessThanOrEqual(5);
      expect(rite.level === 0).toBe(rite.type === 'minor');
      if (rite.rollAttribute) expect(ATTRIBUTES).toContain(rite.rollAttribute);
      expectSummary(rite.summary);
      expectBookSource(rite.source, 202, 221);
    }
  });

  it('has well-formed Fetishes, Talens and Totems', () => {
    expectUnique(W20_FETISH_CATALOG.map((f) => f.id));
    expectUnique(W20_TALEN_CATALOG.map((t) => t.id));
    expectUnique(W20_TOTEM_CATALOG.map((t) => t.id));
    for (const fetish of W20_FETISH_CATALOG) {
      expect(fetish.level).toBeGreaterThanOrEqual(1);
      expect(fetish.level).toBeLessThanOrEqual(5);
      expect(fetish.gnosis).toBeGreaterThanOrEqual(1);
      expect(fetish.gnosis).toBeLessThanOrEqual(10);
      expectSummary(fetish.summary);
      expectBookSource(fetish.source, 221, 228);
    }
    for (const talen of W20_TALEN_CATALOG) {
      expect(talen.gnosis).toBeGreaterThanOrEqual(1);
      expect(talen.gnosis).toBeLessThanOrEqual(10);
      expectSummary(talen.summary);
      expectBookSource(talen.source, 227, 231);
    }
    for (const totem of W20_TOTEM_CATALOG) {
      expect(['respect', 'war', 'wisdom', 'cunning']).toContain(totem.category);
      expect(totem.backgroundCost).toBeGreaterThanOrEqual(1);
      expect(totem.backgroundCost).toBeLessThanOrEqual(10);
      expectSummary(totem.summary);
      expectBookSource(totem.source, 372, 378);
    }
  });
});

describe('creation validation with the expanded catalogs', () => {
  it('still accepts a valid draft, including catalog Merits and Flaws', () => {
    const base = makeValidCreationDraft();
    expect(validateW20CharacterCreation(base).isValid).toBe(true);

    const flaw = W20_MERITS_FLAWS_CATALOG.find((m) => m.id === 'flaw-short-fuse');
    expect(flaw).toBeDefined();
    const withFlaw = validateW20CharacterCreation({
      ...base,
      meritsAndFlaws: flaw
        ? [{ id: flaw.id, name: flaw.name, kind: flaw.kind, pointValue: flaw.pointValue }]
        : [],
    });
    expect(withFlaw.errors.filter((e) => e.field === 'meritsAndFlaws')).toHaveLength(0);
    expect(withFlaw.freebieLedger.creditedFlawBonus).toBe(flaw?.pointValue ?? 0);
  });

  it('accepts ids that are not in any catalog (custom entries and older saves)', () => {
    const base = makeValidCreationDraft();
    const summary = validateW20CharacterCreation({
      ...base,
      meritsAndFlaws: [{ id: 'flaw-custom-1234', name: 'House Flaw', kind: 'flaw', pointValue: 2 }],
    });
    expect(summary.errors.filter((e) => e.field === 'meritsAndFlaws')).toHaveLength(0);
  });
});
