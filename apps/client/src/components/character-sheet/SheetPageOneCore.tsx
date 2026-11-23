import React, { useMemo, useState } from 'react';
import {
  ABILITY_GROUPS,
  AbilityCategory,
  ATTRIBUTE_GROUPS,
  AttributeCategory,
  AttributeKey,
  Auspice,
  Breed,
  CANONICAL_GIFT_CATALOG,
  CanonicalAbilityKey,
  CustomAbilityEntry,
  DamageType,
  filterGiftCatalog,
  formatCatalogSource,
  lookupSheetAbilityDots,
  SheetGiftEntry,
  SheetShortcut,
  UserSheetComputedStats,
  W20_BACKGROUND_CATALOG,
  W20_TOTEM_CATALOG,
  W20UserCharacterSheet,
} from '@w20-vtt/core';
import {
  Award,
  BookOpen,
  Dices,
  Flame,
  HeartPulse,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { diceSoundEngine } from '../../audio/DiceSoundEngine';
import type { SheetRollRequest } from '../../store/useCharacterSheetStore';
import {
  formatFormName,
  formatTraitName,
  getDefaultAttributeForAbility,
  SheetPipTrack,
  shortcutToRollRequest,
  W20_AUSPICES,
  W20_BREEDS,
  W20_RANK_NAMES,
  W20_TRIBES,
} from './sheetShared';
import { ConfirmButton, NumberStepper } from '../ui';

export type PageOneMobileSection =
  | 'identity'
  | 'attributes'
  | 'abilities'
  | 'bg_merits'
  | 'vitals'
  | 'combat_gifts';

export interface SheetPageOneCoreProps {
  sheet: W20UserCharacterSheet;
  stats: UserSheetComputedStats;
  isMobile: boolean;
  mobileSection?: PageOneMobileSection;
  onUpdateSheet: (updater: (prev: W20UserCharacterSheet) => W20UserCharacterSheet) => void;
  onRoll: (req: SheetRollRequest) => void;
  onPinShortcut: (shortcut: SheetShortcut) => void;
  onRemoveShortcut: (shortcutId: string) => void;
}

const BASE_HEALTH_LABELS = [
  'Bruised (0)',
  'Hurt (-1)',
  'Injured (-1)',
  'Wounded (-2)',
  'Mauled (-2)',
  'Crippled (-5)',
  'Incapacitated',
] as const;

const ALL_ATTRIBUTES: AttributeKey[] = [
  ...ATTRIBUTE_GROUPS.physical,
  ...ATTRIBUTE_GROUPS.social,
  ...ATTRIBUTE_GROUPS.mental,
];

const ALL_CANONICAL_ABILITIES: CanonicalAbilityKey[] = [
  ...ABILITY_GROUPS.talents,
  ...ABILITY_GROUPS.skills,
  ...ABILITY_GROUPS.knowledges,
];

function cycleDamageType(cur: DamageType): DamageType {
  if (cur === 'none') return 'bashing';
  if (cur === 'bashing') return 'lethal';
  if (cur === 'lethal') return 'aggravated';
  return 'none';
}

function damageGlyph(dmg: DamageType): { symbol: string; classes: string; label: string } {
  switch (dmg) {
    case 'bashing':
      return {
        symbol: '/',
        classes: 'border-amber-400/80 bg-amber-950/60 text-amber-200',
        label: 'Bashing',
      };
    case 'lethal':
      return {
        symbol: 'X',
        classes: 'border-red-500/85 bg-red-950/75 text-red-200',
        label: 'Lethal',
      };
    case 'aggravated':
      return {
        symbol: '*',
        classes: 'border-rose-400 bg-rose-900/80 text-amber-100 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
        label: 'Aggravated',
      };
    default:
      return {
        symbol: '',
        classes: 'border-stone-600/70 bg-zinc-950 text-stone-400 hover:border-stone-400',
        label: 'Empty',
      };
  }
}

export const SheetPageOneCore: React.FC<SheetPageOneCoreProps> = ({
  sheet,
  stats,
  isMobile,
  mobileSection,
  onUpdateSheet,
  onRoll,
  onPinShortcut,
  onRemoveShortcut,
}) => {
  const hasElderRatings = useMemo(() => {
    const attrOver5 = Object.values(sheet.baseAttributes).some((v) => v > 5);
    const abilOver5 = Object.values(sheet.abilities).some((v) => v > 5);
    const customOver5 = sheet.customAbilities.some((c) => c.dots > 5);
    const bgOver5 = sheet.backgrounds.some((b) => b.dots > 5);
    return attrOver5 || abilOver5 || customOver5 || bgOver5;
  }, [sheet]);

  const [elderMode, setElderMode] = useState(hasElderRatings);
  const maxTraitDots = elderMode ? 10 : 5;

  // Ability roll attribute-pairing popover state
  const [pairingAbilityKey, setPairingAbilityKey] = useState<string | null>(null);
  const [pairedAttr, setPairedAttr] = useState<AttributeKey>('dexterity');
  const [pairDifficulty, setPairDifficulty] = useState<number>(6);

  // Add custom ability inputs per category
  const [customAbilDrafts, setCustomAbilDrafts] = useState<Record<AbilityCategory, string>>({
    talents: '',
    skills: '',
    knowledges: '',
  });

  // Add background input & suggestion drawer
  const [newBgName, setNewBgName] = useState('');
  const [showExpandedBgChips, setShowExpandedBgChips] = useState(false);

  // Gift picker & custom gift form
  const [giftSearch, setGiftSearch] = useState('');
  const [giftLevelFilter, setGiftLevelFilter] = useState<number | 'all'>('all');
  const [giftScope, setGiftScope] = useState<'mine' | 'all'>('mine');
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showCustomGiftForm, setShowCustomGiftForm] = useState(false);
  const [customGiftName, setCustomGiftName] = useState('');
  const [customGiftLevel, setCustomGiftLevel] = useState(1);
  const [customGiftRollAttr, setCustomGiftRollAttr] = useState<
    AttributeKey | 'rage' | 'gnosis' | 'willpower' | ''
  >('');
  const [customGiftRollAbility, setCustomGiftRollAbility] = useState('');
  const [customGiftAbilityText, setCustomGiftAbilityText] = useState('');
  const [customGiftDiff, setCustomGiftDiff] = useState(6);
  const [customGiftRageCost, setCustomGiftRageCost] = useState(0);
  const [customGiftGnosisCost, setCustomGiftGnosisCost] = useState(0);
  const [customGiftWpCost, setCustomGiftWpCost] = useState(0);
  const [customGiftSummary, setCustomGiftSummary] = useState('');

  const isShortcutPinned = (id: string) => sheet.shortcuts.some((s) => s.id === id);

  const toggleShortcutPin = (shortcut: SheetShortcut) => {
    if (isShortcutPinned(shortcut.id)) {
      onRemoveShortcut(shortcut.id);
    } else {
      onPinShortcut(shortcut);
    }
  };

  const filteredCatalogGifts = useMemo(() => {
    const matches = filterGiftCatalog({
      query: giftSearch,
      ...(giftLevelFilter !== 'all' ? { level: giftLevelFilter } : {}),
    });
    if (giftScope === 'all') return matches;
    const mine = new Set<string>([sheet.breed, sheet.auspice, sheet.tribe]);
    return matches.filter((g) => g.sources.some((src) => mine.has(src)));
  }, [giftSearch, giftLevelFilter, giftScope, sheet.breed, sheet.auspice, sheet.tribe]);
  const GIFT_PICKER_PAGE = 60;

  const showIdentity = !mobileSection || mobileSection === 'identity';
  const showAttributes = !mobileSection || mobileSection === 'attributes';
  const showAbilities = !mobileSection || mobileSection === 'abilities';
  const showBackgrounds = !mobileSection || mobileSection === 'bg_merits';
  const showGifts = !mobileSection || mobileSection === 'combat_gifts';
  const showVitals = !mobileSection || mobileSection === 'vitals';

  const openAbilityPopover = (abilityKeyOrId: string, category: AbilityCategory) => {
    if (pairingAbilityKey === abilityKeyOrId) {
      setPairingAbilityKey(null);
      return;
    }
    setPairingAbilityKey(abilityKeyOrId);
    setPairedAttr(getDefaultAttributeForAbility(abilityKeyOrId, category));
    setPairDifficulty(6);
  };

  const handleAddCustomAbility = (category: AbilityCategory) => {
    const name = customAbilDrafts[category].trim().slice(0, 120);
    if (!name) return;
    const entry: CustomAbilityEntry = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      category,
      name,
      dots: 1,
    };
    onUpdateSheet((prev) => ({
      ...prev,
      customAbilities: [...prev.customAbilities, entry].slice(0, 50),
    }));
    setCustomAbilDrafts((prev) => ({ ...prev, [category]: '' }));
  };

  const handleAddBackground = (explicitName?: string) => {
    const name = (explicitName ?? newBgName).trim().slice(0, 120);
    if (!name) return;
    const duplicate = sheet.backgrounds.some(
      (b) => b.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      if (!explicitName) setNewBgName('');
      return;
    }
    onUpdateSheet((prev) => ({
      ...prev,
      backgrounds: [
        ...prev.backgrounds,
        { id: `bg-${crypto.randomUUID().slice(0, 8)}`, name, dots: 1 },
      ].slice(0, 50),
    }));
    if (!explicitName) {
      setNewBgName('');
    }
  };

  const quickBgSuggestions = useMemo(() => {
    const existingNames = new Set(sheet.backgrounds.map((b) => b.name.trim().toLowerCase()));
    const q = newBgName.trim().toLowerCase();
    const available = W20_BACKGROUND_CATALOG.filter(
      (entry) => !existingNames.has(entry.label.toLowerCase())
    );
    if (q) {
      return available.filter(
        (entry) =>
          entry.label.toLowerCase().includes(q) || entry.summary.toLowerCase().includes(q)
      );
    }
    return showExpandedBgChips ? available : available.filter((entry) => entry.tier === 'core');
  }, [sheet.backgrounds, newBgName, showExpandedBgChips]);

  const handleAddCatalogGift = (entry: (typeof CANONICAL_GIFT_CATALOG)[number]) => {
    if (sheet.gifts.some((g) => g.id === entry.id)) return;
    const newGift: SheetGiftEntry = {
      id: entry.id,
      name: entry.name,
      level: entry.level,
      rollAttribute: entry.rollAttribute,
      rollAbility: entry.rollAbility,
      difficulty: entry.defaultDifficulty,
      rageCost: entry.rageCost,
      gnosisCost: entry.gnosisCost,
      willpowerCost: entry.willpowerCost,
      summary: entry.summary,
    };
    onUpdateSheet((prev) => ({
      ...prev,
      gifts: [...prev.gifts, newGift].slice(0, 100),
    }));
  };

  const handleAddCustomGift = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customGiftName.trim().slice(0, 120);
    if (!name) return;
    const resolvedAbility =
      customGiftRollAbility === '__custom__'
        ? customGiftAbilityText.trim().slice(0, 120)
        : customGiftRollAbility.trim();
    const newGift: SheetGiftEntry = {
      id: `gift-${crypto.randomUUID().slice(0, 8)}`,
      name,
      level: Math.max(1, Math.min(6, Math.floor(customGiftLevel))),
      rollAttribute: customGiftRollAttr || null,
      rollAbility: customGiftRollAttr && resolvedAbility ? resolvedAbility : null,
      difficulty: Math.max(2, Math.min(10, Math.floor(customGiftDiff))),
      rageCost: Math.max(0, Math.min(10, Math.floor(customGiftRageCost))),
      gnosisCost: Math.max(0, Math.min(10, Math.floor(customGiftGnosisCost))),
      willpowerCost: Math.max(0, Math.min(10, Math.floor(customGiftWpCost))),
      summary: customGiftSummary.trim().slice(0, 2000),
    };
    onUpdateSheet((prev) => ({
      ...prev,
      gifts: [...prev.gifts, newGift].slice(0, 100),
    }));
    setCustomGiftName('');
    setCustomGiftRollAbility('');
    setCustomGiftAbilityText('');
    setCustomGiftSummary('');
    setShowCustomGiftForm(false);
  };

  const handleAdjustBonusBruised = (delta: number) => {
    onUpdateSheet((prev) => {
      const curBonus = Math.max(0, Math.min(10, Math.floor(prev.health.bonusBruisedBoxes)));
      const nextBonus = Math.max(0, Math.min(10, curBonus + delta));
      if (nextBonus === curBonus) return prev;
      let nextBoxes = [...prev.health.boxes];
      if (nextBonus > curBonus) {
        nextBoxes = [...Array<DamageType>(nextBonus - curBonus).fill('none'), ...nextBoxes];
      } else {
        nextBoxes = nextBoxes.slice(curBonus - nextBonus);
      }
      const targetLen = 7 + nextBonus;
      while (nextBoxes.length < targetLen) nextBoxes.push('none');
      if (nextBoxes.length > targetLen) nextBoxes = nextBoxes.slice(0, targetLen);
      return {
        ...prev,
        health: {
          bonusBruisedBoxes: nextBonus,
          boxes: nextBoxes,
        },
      };
    });
  };

  const isStandardTribe = W20_TRIBES.some((t) => t.key === sheet.tribe);

  const renderGiftCard = (gift: SheetGiftEntry) => {
    const isPureInner =
      (gift.rollAttribute === 'gnosis' ||
        gift.rollAttribute === 'willpower' ||
        gift.rollAttribute === 'rage') &&
      !gift.rollAbility;
    const giftShortcut: SheetShortcut | null = gift.rollAttribute
      ? {
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
        }
      : null;
    const pinned = giftShortcut ? isShortcutPinned(giftShortcut.id) : false;

    return (
      <div
        key={gift.id}
        className="rounded-xl border border-stone-800 bg-zinc-950/90 p-2.5 text-xs"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-amber-100">{gift.name}</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-caption font-semibold text-stone-300">
                Lv {gift.level}
              </span>
              {(gift.rageCost ?? 0) > 0 && (
                <span className="rounded bg-red-950/80 px-1.5 py-0.5 text-caption text-red-200">
                  {gift.rageCost}R
                </span>
              )}
              {(gift.gnosisCost ?? 0) > 0 && (
                <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-caption text-cyan-200">
                  {gift.gnosisCost}G
                </span>
              )}
              {(gift.willpowerCost ?? 0) > 0 && (
                <span className="rounded bg-indigo-950/80 px-1.5 py-0.5 text-caption text-indigo-200">
                  {gift.willpowerCost}WP
                </span>
              )}
            </div>
            {gift.rollAttribute && (
              <div className="mt-0.5 text-caption text-emerald-300">
                {formatTraitName(gift.rollAttribute)}
                {gift.rollAbility ? ` + ${formatTraitName(gift.rollAbility)}` : ''} • Diff{' '}
                {gift.difficulty ?? 6}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {giftShortcut && (
              <>
                <button
                  type="button"
                  onClick={() => onRoll(shortcutToRollRequest(sheet, giftShortcut))}
                  className="flex items-center gap-1 rounded-md bg-red-800/90 px-2 py-1 text-caption font-bold text-amber-50 hover:bg-red-700"
                >
                  <Dices className="h-3 w-3" />
                  Roll
                </button>
                <button
                  type="button"
                  onClick={() => toggleShortcutPin(giftShortcut)}
                  aria-label={pinned ? 'Unpin shortcut' : 'Pin shortcut'}
                  title={pinned ? 'Unpin shortcut' : 'Pin shortcut'}
                  className={`rounded-md border p-1 transition ${
                    pinned
                      ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                      : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-amber-200'
                  }`}
                >
                  <Star className={`h-3 w-3 ${pinned ? 'fill-amber-300' : ''}`} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() =>
                onUpdateSheet((prev) => ({
                  ...prev,
                  gifts: prev.gifts.filter((g) => g.id !== gift.id),
                }))
              }
              aria-label={`Remove gift ${gift.name}`}
              className="rounded p-1 text-stone-400 hover:bg-red-950/60 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {gift.summary && <p className="mt-1 text-xs text-stone-400">{gift.summary}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 1. IDENTITY HEADER + ELDER 10-DOT MODE */}
      {showIdentity && (
        <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
            <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              Garou Identity
            </h3>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-950/25 px-2.5 py-1 text-xs font-semibold text-amber-200">
              <input
                type="checkbox"
                checked={elderMode}
                onChange={(e) => setElderMode(e.target.checked)}
                className="accent-amber-500"
              />
              Elder 10-Dot Mode
            </label>
          </div>

          <div className={isMobile ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-3 gap-3'}>
            {/* Col 1 */}
            <div className="space-y-2">
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Name</span>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.name}
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, name: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 focus:border-amber-400/75"
                />
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Player</span>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.player}
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, player: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 focus:border-amber-400/75"
                />
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Chronicle</span>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.chronicle}
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, chronicle: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 focus:border-amber-400/75"
                />
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Concept</span>
                <input
                  type="text"
                  maxLength={240}
                  value={sheet.concept}
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, concept: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 focus:border-amber-400/75"
                />
              </label>
            </div>

            {/* Col 2 */}
            <div className="space-y-2">
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Breed</span>
                <select
                  value={sheet.breed}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({ ...p, breed: e.target.value as Breed }))
                  }
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                >
                  {W20_BREEDS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Auspice</span>
                <select
                  value={sheet.auspice}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({ ...p, auspice: e.target.value as Auspice }))
                  }
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                >
                  {W20_AUSPICES.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label} ({a.moon})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Tribe</span>
                <select
                  value={isStandardTribe ? sheet.tribe : '__custom__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateSheet((p) => ({
                      ...p,
                      tribe: val === '__custom__' ? '' : val,
                    }));
                  }}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                >
                  {W20_TRIBES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                  <option value="__custom__">Other / Custom Tribe...</option>
                </select>
                {!isStandardTribe && (
                  <input
                    type="text"
                    maxLength={120}
                    value={sheet.tribe}
                    onChange={(e) => onUpdateSheet((p) => ({ ...p, tribe: e.target.value }))}
                    placeholder="Custom tribe name"
                    className="mt-1 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1 text-xs text-stone-100"
                  />
                )}
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Deed Name</span>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.deedName ?? ''}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({
                      ...p,
                      deedName: e.target.value || undefined,
                    }))
                  }
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                />
              </label>
            </div>

            {/* Col 3 */}
            <div className="space-y-2">
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Pack Name</span>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.packName}
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, packName: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Pack Totem</span>
                <datalist id="w20-pack-totems">
                  {W20_TOTEM_CATALOG.map((totem) => (
                    <option
                      key={totem.id}
                      value={totem.name}
                      label={`${formatTraitName(totem.category)} totem, cost ${totem.backgroundCost}`}
                    />
                  ))}
                </datalist>
                <input
                  type="text"
                  maxLength={120}
                  value={sheet.packTotem}
                  list="w20-pack-totems"
                  onChange={(e) => onUpdateSheet((p) => ({ ...p, packTotem: e.target.value }))}
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                />
              </label>
              <label className="block">
                <span className="text-caption font-bold uppercase text-stone-400">Rank</span>
                <select
                  value={sheet.rank}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({
                      ...p,
                      rank: Math.max(0, Math.min(6, Number(e.target.value))),
                    }))
                  }
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                >
                  {W20_RANK_NAMES.map((label, idx) => (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {(sheet.breed === 'metis' || Boolean(sheet.metisDeformity)) && (
                <label className="block">
                  <span className="text-caption font-bold uppercase text-amber-300">
                    Metis Deformity
                  </span>
                  <input
                    type="text"
                    maxLength={240}
                    value={sheet.metisDeformity ?? ''}
                    onChange={(e) =>
                      onUpdateSheet((p) => ({
                        ...p,
                        metisDeformity: e.target.value || undefined,
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-amber-700/70 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                  />
                </label>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 2. ATTRIBUTES (3-COL PC / 1-COL MOBILE) */}
      {showAttributes && (
        <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
            <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              Attributes (Active Form: {formatFormName(sheet.activeForm)})
            </h3>
            {isMobile && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-200">
                <input
                  type="checkbox"
                  checked={elderMode}
                  onChange={(e) => setElderMode(e.target.checked)}
                  className="accent-amber-500"
                />
                10-Dot Elder
              </label>
            )}
          </div>

          <div className={isMobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
            {(['physical', 'social', 'mental'] as AttributeCategory[]).map((cat) => (
              <div key={cat} className="rounded-xl border border-stone-800/90 bg-zinc-900/45 p-3">
                <div className="mb-2 border-b border-stone-800 pb-1 text-xs font-display font-bold uppercase tracking-wider text-stone-300">
                  {cat}
                </div>
                <div className="space-y-3">
                  {ATTRIBUTE_GROUPS[cat].map((attr) => {
                    const base = sheet.baseAttributes[attr];
                    const eff = stats.effectiveAttributes[attr];
                    const delta = eff - base;
                    const specialty = sheet.specialties[attr] ?? '';
                    const shortcut: SheetShortcut = {
                      id: `attr-${attr}`,
                      name: formatTraitName(attr),
                      source: {
                        kind: 'trait_combo',
                        attribute: attr,
                        ability: null,
                        useFormStats: true,
                        applyPerceptionFormDiff: attr === 'perception',
                      },
                      difficulty: 6,
                      rageDiceCount: 0,
                      applyWoundPenalty: true,
                      isSecretRoll: false,
                    };
                    const pinned = isShortcutPinned(shortcut.id);

                    return (
                      <div key={attr} className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold capitalize text-stone-200">
                              {attr}
                            </span>
                            {eff !== base && (
                              <span
                                className={`rounded px-1.5 py-0.5 font-mono text-caption font-bold ${
                                  delta > 0
                                    ? 'bg-emerald-950/75 text-emerald-300'
                                    : 'bg-amber-950/75 text-amber-300'
                                }`}
                                title={`Base ${base} -> ${eff} in ${formatFormName(sheet.activeForm)}`}
                              >
                                {delta > 0 ? `+${delta}` : delta} → {eff}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onRoll(shortcutToRollRequest(sheet, shortcut))}
                              className="flex items-center gap-1 rounded bg-red-800/85 px-1.5 py-0.5 text-caption font-bold text-amber-50 hover:bg-red-700"
                              aria-label={`Roll ${formatTraitName(attr)} (${eff}d10)`}
                              title={`Roll ${formatTraitName(attr)} (${eff}d10)`}
                            >
                              <Dices className="h-3 w-3" />
                              Roll
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleShortcutPin(shortcut)}
                              aria-pressed={pinned}
                              aria-label={`${pinned ? 'Unpin' : 'Pin'} ${formatTraitName(attr)} roll`}
                              title={`${pinned ? 'Unpin' : 'Pin'} ${formatTraitName(attr)} roll`}
                              className={`rounded border p-0.5 transition ${
                                pinned
                                  ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                  : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-amber-200'
                              }`}
                            >
                              <Star className={`h-3 w-3 ${pinned ? 'fill-amber-300' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <SheetPipTrack
                          label={formatTraitName(attr)}
                          value={base}
                          max={Math.max(maxTraitDots, base)}
                          shape="circle"
                          tone="amber"
                          isMobile={isMobile}
                          onChange={(nextVal) =>
                            onUpdateSheet((prev) => ({
                              ...prev,
                              baseAttributes: {
                                ...prev.baseAttributes,
                                [attr]: Math.max(0, Math.min(10, nextVal)),
                              },
                            }))
                          }
                        />

                        <input
                          type="text"
                          maxLength={160}
                          value={specialty}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateSheet((prev) => {
                              const nextSpecs = { ...prev.specialties };
                              if (val.trim()) nextSpecs[attr] = val;
                              else delete nextSpecs[attr];
                              return { ...prev, specialties: nextSpecs };
                            });
                          }}
                          aria-label={`${formatTraitName(attr)} specialty`}
                          placeholder="Specialty (at 4+ dots)"
                          className="w-full rounded border border-stone-800/80 bg-zinc-950/80 px-2 py-0.5 text-caption text-stone-300 placeholder-stone-500 focus:border-amber-500/50"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. ABILITIES (3-COL PC / 1-COL MOBILE + CUSTOM + PAIRING POPOVER) */}
      {showAbilities && (
        <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
            <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              Abilities
            </h3>
            <span className="text-caption text-stone-400">
              Click Roll on any Ability to pair with an Attribute
            </span>
          </div>

          <div className={isMobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
            {(['talents', 'skills', 'knowledges'] as AbilityCategory[]).map((cat) => {
              const customInCat = sheet.customAbilities.filter((c) => c.category === cat);
              const rows: Array<{
                key: string;
                label: string;
                dots: number;
                specialty: string;
                isCustom: boolean;
              }> = [
                ...ABILITY_GROUPS[cat].map((k) => ({
                  key: k,
                  label: formatTraitName(k),
                  dots: sheet.abilities[k] ?? 0,
                  specialty: sheet.specialties[k] ?? '',
                  isCustom: false,
                })),
                ...customInCat.map((c) => ({
                  key: c.id,
                  label: c.name,
                  dots: c.dots,
                  specialty: c.specialty ?? '',
                  isCustom: true,
                })),
              ];

              return (
                <div key={cat} className="rounded-xl border border-stone-800/90 bg-zinc-900/45 p-3">
                  <div className="mb-2 border-b border-stone-800 pb-1 text-xs font-display font-bold uppercase tracking-wider text-stone-300">
                    {cat}
                  </div>

                  <div className="space-y-2.5">
                    {rows.map((row) => {
                      const defaultAttr = getDefaultAttributeForAbility(row.key, cat);
                      const defaultShortcut: SheetShortcut = {
                        id: `abil-${row.key}`,
                        name: `${formatTraitName(defaultAttr)} + ${row.label}`,
                        source: {
                          kind: 'trait_combo',
                          attribute: defaultAttr,
                          ability: row.key,
                          useFormStats: true,
                          applyPerceptionFormDiff: defaultAttr === 'perception',
                        },
                        difficulty: 6,
                        rageDiceCount: 0,
                        applyWoundPenalty: true,
                        isSecretRoll: false,
                      };
                      const defaultPinned = isShortcutPinned(defaultShortcut.id);
                      const popoverOpen = pairingAbilityKey === row.key;

                      const popoverShortcut: SheetShortcut | null = popoverOpen
                        ? {
                            id: `combo-${pairedAttr}-${row.key}`,
                            name: `${formatTraitName(pairedAttr)} + ${row.label}`,
                            source: {
                              kind: 'trait_combo',
                              attribute: pairedAttr,
                              ability: row.key,
                              useFormStats: true,
                              applyPerceptionFormDiff: pairedAttr === 'perception',
                            },
                            difficulty: pairDifficulty,
                            rageDiceCount: 0,
                            applyWoundPenalty: true,
                            isSecretRoll: false,
                          }
                        : null;

                      return (
                        <div key={row.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex min-w-0 items-center gap-1">
                              <span
                                className={`truncate text-xs font-semibold ${
                                  row.dots > 0 ? 'text-stone-100' : 'text-stone-400'
                                }`}
                              >
                                {row.label}
                              </span>
                              {row.isCustom && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSheet((prev) => ({
                                      ...prev,
                                      customAbilities: prev.customAbilities.filter(
                                        (c) => c.id !== row.key
                                      ),
                                    }))
                                  }
                                  className="text-stone-400 hover:text-red-300"
                                  aria-label={`Remove ${row.label}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openAbilityPopover(row.key, cat)}
                                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-bold transition ${
                                  popoverOpen
                                    ? 'bg-red-700 text-white'
                                    : 'bg-zinc-800 text-stone-200 hover:bg-red-800/85 hover:text-amber-50'
                                }`}
                              >
                                <Dices className="h-3 w-3" />
                                Roll
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleShortcutPin(defaultShortcut)}
                                aria-label={`Pin ${defaultShortcut.name}`}
                                title={`Pin ${defaultShortcut.name}`}
                                className={`rounded border p-0.5 transition ${
                                  defaultPinned
                                    ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                    : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-amber-200'
                                }`}
                              >
                                <Star className={`h-3 w-3 ${defaultPinned ? 'fill-amber-300' : ''}`} />
                              </button>
                            </div>
                          </div>

                          <SheetPipTrack
                            label={row.label}
                            value={row.dots}
                            max={Math.max(maxTraitDots, row.dots)}
                            shape="circle"
                            tone="amber"
                            isMobile={isMobile}
                            onChange={(nextVal) =>
                              onUpdateSheet((prev) => {
                                const clamped = Math.max(0, Math.min(10, nextVal));
                                if (row.isCustom) {
                                  return {
                                    ...prev,
                                    customAbilities: prev.customAbilities.map((c) =>
                                      c.id === row.key ? { ...c, dots: clamped } : c
                                    ),
                                  };
                                }
                                return {
                                  ...prev,
                                  abilities: {
                                    ...prev.abilities,
                                    [row.key]: clamped,
                                  },
                                };
                              })
                            }
                          />

                          <input
                            type="text"
                            maxLength={160}
                            value={row.specialty}
                            onChange={(e) => {
                              const val = e.target.value;
                              onUpdateSheet((prev) => {
                                if (row.isCustom) {
                                  return {
                                    ...prev,
                                    customAbilities: prev.customAbilities.map((c) =>
                                      c.id === row.key
                                        ? { ...c, specialty: val.trim() ? val : undefined }
                                        : c
                                    ),
                                  };
                                }
                                const nextSpecs = { ...prev.specialties };
                                if (val.trim()) nextSpecs[row.key] = val;
                                else delete nextSpecs[row.key];
                                return { ...prev, specialties: nextSpecs };
                              });
                            }}
                            aria-label={`${row.label} specialty`}
                            placeholder="Specialty"
                            className="w-full rounded border border-stone-800/80 bg-zinc-950/80 px-2 py-0.5 text-caption text-stone-300 placeholder-stone-500 focus:border-amber-500/50"
                          />

                          {/* Compact Attribute-Pairing Popover */}
                          {popoverOpen && popoverShortcut && (
                            <div className="mt-1.5 rounded-lg border border-red-700/70 bg-zinc-950 p-2 text-xs shadow-lg">
                              <div className="flex items-center justify-between gap-1 pb-1.5">
                                <span className="font-bold text-amber-200">
                                  Pair {row.label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPairingAbilityKey(null)}
                                  className="text-stone-400 hover:text-stone-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <label className="block">
                                  <span className="text-caption uppercase text-stone-400">
                                    Attribute
                                  </span>
                                  <select
                                    value={pairedAttr}
                                    onChange={(e) => setPairedAttr(e.target.value as AttributeKey)}
                                    className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-xs capitalize"
                                  >
                                    {ALL_ATTRIBUTES.map((a) => (
                                      <option key={a} value={a}>
                                        {a} ({stats.effectiveAttributes[a]})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="text-caption uppercase text-stone-400">
                                    Difficulty
                                  </span>
                                  <input
                                    type="number"
                                    min={2}
                                    max={10}
                                    value={pairDifficulty}
                                    onChange={(e) =>
                                      setPairDifficulty(
                                        Math.max(2, Math.min(10, Number(e.target.value) || 6))
                                      )
                                    }
                                    className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 font-mono text-xs"
                                  />
                                </label>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-1">
                                <span className="font-mono text-caption text-emerald-300">
                                  {stats.effectiveAttributes[pairedAttr] + lookupSheetAbilityDots(sheet, row.key)}
                                  d10 • Diff{' '}
                                  {Math.max(
                                    2,
                                    Math.min(
                                      10,
                                      pairDifficulty +
                                        (pairedAttr === 'perception'
                                          ? stats.perceptionDifficultyMod
                                          : 0)
                                    )
                                  )}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleShortcutPin(popoverShortcut)}
                                    className="rounded border border-amber-500/45 bg-amber-950/35 px-1.5 py-1 text-caption font-bold text-amber-200 hover:bg-amber-900/50"
                                    aria-label="Pin this combo"
                                    title="Pin this combo"
                                  >
                                    ★ Pin
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onRoll(shortcutToRollRequest(sheet, popoverShortcut));
                                      setPairingAbilityKey(null);
                                    }}
                                    className="w20-crimson-seal rounded px-2.5 py-1 text-caption font-bold text-amber-50"
                                  >
                                    Roll
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Ability */}
                  <div className="mt-3 flex gap-1 border-t border-stone-800 pt-2">
                    <input
                      type="text"
                      maxLength={120}
                      value={customAbilDrafts[cat]}
                      onChange={(e) =>
                        setCustomAbilDrafts((prev) => ({ ...prev, [cat]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomAbility(cat);
                        }
                      }}
                      aria-label={`Add a custom ${cat.slice(0, -1)}`}
                      placeholder={`Custom ${cat.slice(0, -1)}...`}
                      className="min-w-0 flex-1 rounded border border-stone-700 bg-zinc-950 px-2 py-1 text-xs text-stone-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCustomAbility(cat)}
                      aria-label={`Add custom ${cat.slice(0, -1)}`}
                      title={`Add custom ${cat.slice(0, -1)}`}
                      className="rounded border border-stone-700 bg-zinc-800 px-2 py-1 text-caption font-bold text-stone-200 hover:bg-zinc-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. BACKGROUNDS & GIFTS */}
      {(showBackgrounds || showGifts) && (
        <div
          className={
            isMobile || (showBackgrounds !== showGifts)
              ? 'grid grid-cols-1 gap-4'
              : 'grid grid-cols-2 gap-4'
          }
        >
          {/* Backgrounds */}
          {showBackgrounds && (
            <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <div className="mb-2.5 flex items-center justify-between border-b border-stone-800 pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                  <BookOpen className="h-3.5 w-3.5 text-amber-300" />
                  Backgrounds
                </h3>
              </div>

              {sheet.backgrounds.length === 0 ? (
                <p className="text-xs text-stone-400">No Backgrounds added yet.</p>
              ) : (
                <div className="space-y-2">
                  {sheet.backgrounds.map((bg) => (
                    <div
                      key={bg.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-800 bg-zinc-900/50 px-2.5 py-1.5"
                    >
                      <span className="text-xs font-semibold text-stone-200">{bg.name}</span>
                      <div className="flex items-center gap-2">
                        <SheetPipTrack
                          label={bg.name}
                          value={bg.dots}
                          max={Math.max(maxTraitDots, bg.dots)}
                          shape="circle"
                          tone="amber"
                          isMobile={isMobile}
                          onChange={(nextVal) =>
                            onUpdateSheet((prev) => ({
                              ...prev,
                              backgrounds: prev.backgrounds.map((item) =>
                                item.id === bg.id
                                  ? { ...item, dots: Math.max(0, Math.min(10, nextVal)) }
                                  : item
                              ),
                            }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSheet((prev) => ({
                              ...prev,
                              backgrounds: prev.backgrounds.filter((item) => item.id !== bg.id),
                            }))
                          }
                          className="text-stone-400 hover:text-red-300"
                          aria-label={`Remove background ${bg.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={120}
                    value={newBgName}
                    onChange={(e) => setNewBgName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBackground();
                      }
                    }}
                    aria-label="Background name"
                    placeholder="Type any Background (e.g. Fate, Caern, Custom)..."
                    className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddBackground()}
                    className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                {/* Mobile & Desktop Quick-Pick Background Chips */}
                <div className="space-y-1.5 rounded-lg border border-stone-800/80 bg-zinc-900/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-bold uppercase tracking-wider text-stone-400">
                      Quick Add W20 Backgrounds ({quickBgSuggestions.length})
                    </span>
                    {!newBgName.trim() && (
                      <button
                        type="button"
                        onClick={() => setShowExpandedBgChips((v) => !v)}
                        className="text-caption font-semibold text-amber-300 hover:text-amber-200"
                      >
                        {showExpandedBgChips ? 'Core Only (12)' : 'Show Expanded (+12)'}
                      </button>
                    )}
                  </div>
                  {quickBgSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {quickBgSuggestions.map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => handleAddBackground(entry.label)}
                          aria-label={entry.summary}
                          title={entry.summary}
                          className="rounded-md border border-stone-700/80 bg-zinc-950/90 px-2 py-1 text-caption font-semibold text-stone-200 transition hover:border-amber-400/65 hover:text-amber-100"
                        >
                          + {entry.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Gifts */}
          {showGifts && (
            <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  Gifts ({sheet.gifts.length})
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGiftPicker((v) => !v);
                      setShowCustomGiftForm(false);
                    }}
                    className={`rounded-lg border px-2 py-1 text-caption font-bold transition ${
                      showGiftPicker
                        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                        : 'border-stone-700 bg-zinc-900 text-stone-200 hover:border-emerald-500/60'
                    }`}
                  >
                    + Catalog Gift
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomGiftForm((v) => !v);
                      setShowGiftPicker(false);
                    }}
                    className={`rounded-lg border px-2 py-1 text-caption font-bold transition ${
                      showCustomGiftForm
                        ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                        : 'border-stone-700 bg-zinc-900 text-stone-200 hover:border-amber-500/60'
                    }`}
                  >
                    + Custom Gift
                  </button>
                </div>
              </div>

              {/* Searchable CANONICAL_GIFT_CATALOG Picker */}
              {showGiftPicker && (
                <div className="mb-3 space-y-2 rounded-xl border border-emerald-800/60 bg-zinc-900/80 p-2.5">
                  <div className="flex items-center gap-2 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-stone-400" />
                    <input
                      type="text"
                      value={giftSearch}
                      onChange={(e) => setGiftSearch(e.target.value)}
                      aria-label="Search W20 Gifts"
                      placeholder="Search W20 Gifts by name, effect, tribe, auspice..."
                      className="min-w-0 flex-1 bg-transparent text-xs text-stone-100 placeholder-stone-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <select
                      value={String(giftLevelFilter)}
                      onChange={(e) =>
                        setGiftLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                      }
                      aria-label="Gift level"
                      className="min-h-[32px] rounded-lg border border-stone-700 bg-zinc-950 px-2 py-1 text-xs text-stone-100"
                    >
                      <option value="all">All levels</option>
                      {[1, 2, 3, 4, 5, 6].map((lv) => (
                        <option key={lv} value={lv}>
                          Level {lv}
                        </option>
                      ))}
                    </select>
                    <div
                      className="flex overflow-hidden rounded-lg border border-stone-700"
                      role="group"
                      aria-label="Gift lists"
                    >
                      {(
                        [
                          { key: 'mine', label: 'My breed, auspice, tribe' },
                          { key: 'all', label: 'All Gifts' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          aria-pressed={giftScope === opt.key}
                          onClick={() => setGiftScope(opt.key)}
                          className={`min-h-[32px] px-2.5 py-1 text-xs font-bold transition ${
                            giftScope === opt.key
                              ? 'bg-emerald-900/60 text-emerald-100'
                              : 'bg-zinc-950 text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-stone-400">
                      {filteredCatalogGifts.length} of {CANONICAL_GIFT_CATALOG.length} Gifts
                    </span>
                  </div>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {filteredCatalogGifts.length === 0 && (
                      <p className="p-2 text-xs text-stone-400">
                        No Gifts match. Try another level, or switch to All Gifts.
                      </p>
                    )}
                    {filteredCatalogGifts.length > GIFT_PICKER_PAGE && (
                      <p className="px-1 text-xs text-stone-400">
                        Showing the first {GIFT_PICKER_PAGE}. Search or pick a level to narrow the
                        list.
                      </p>
                    )}
                    {filteredCatalogGifts.slice(0, GIFT_PICKER_PAGE).map((entry) => {
                      const alreadyAdded = sheet.gifts.some((g) => g.id === entry.id);
                      return (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-stone-800 bg-zinc-950/90 p-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-stone-100">
                                {entry.name}
                              </span>
                              <span className="rounded border border-emerald-800/60 px-1 text-xs font-bold text-emerald-300">
                                Lv {entry.level}
                              </span>
                              <span className="text-xs text-stone-400">
                                ({entry.sources.map((s) => formatTraitName(s)).join(', ')})
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {entry.summary}{' '}
                              <span className="text-stone-500">
                                {formatCatalogSource(entry.source)}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => handleAddCatalogGift(entry)}
                            className="shrink-0 rounded-md bg-emerald-700 px-2 py-1 text-caption font-bold text-white hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-stone-400"
                          >
                            {alreadyAdded ? 'Added' : 'Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom Rollable Gift Form */}
              {showCustomGiftForm && (
                <form
                  onSubmit={handleAddCustomGift}
                  className="mb-3 space-y-2 rounded-xl border border-amber-700/55 bg-zinc-900/80 p-2.5 text-xs"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <label className="col-span-2 block">
                      <span className="text-caption text-stone-400">Gift Name *</span>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={customGiftName}
                        onChange={(e) => setCustomGiftName(e.target.value)}
                        placeholder="e.g. Luna's Armor"
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-caption text-stone-400">Level</span>
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={customGiftLevel}
                        onChange={(e) => setCustomGiftLevel(Number(e.target.value) || 1)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-caption text-stone-400">Roll Trait</span>
                      <select
                        value={customGiftRollAttr}
                        onChange={(e) =>
                          setCustomGiftRollAttr(
                            e.target.value as AttributeKey | 'rage' | 'gnosis' | 'willpower' | ''
                          )
                        }
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-1.5 py-1 text-xs capitalize"
                      >
                        <option value="">None (Passive)</option>
                        {ALL_ATTRIBUTES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                        <option value="rage">Rage</option>
                        <option value="gnosis">Gnosis</option>
                        <option value="willpower">Willpower</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-caption text-stone-400">Ability (Opt)</span>
                      <select
                        value={customGiftRollAbility}
                        disabled={!customGiftRollAttr}
                        onChange={(e) => setCustomGiftRollAbility(e.target.value)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-1.5 py-1 text-xs disabled:opacity-45"
                      >
                        <option value="">None</option>
                        {ALL_CANONICAL_ABILITIES.map((ab) => (
                          <option key={ab} value={ab}>
                            {formatTraitName(ab)}
                          </option>
                        ))}
                        {sheet.customAbilities.map((ca) => (
                          <option key={ca.id} value={ca.name}>
                            {ca.name}
                          </option>
                        ))}
                        <option value="__custom__">Other / Type Custom...</option>
                      </select>
                      {customGiftRollAttr && customGiftRollAbility === '__custom__' && (
                        <input
                          type="text"
                          maxLength={120}
                          value={customGiftAbilityText}
                          onChange={(e) => setCustomGiftAbilityText(e.target.value)}
                          placeholder="Type custom Ability..."
                          className="mt-1 min-h-[34px] w-full rounded border border-amber-500/50 bg-zinc-950 px-2 py-1 text-xs text-stone-100"
                        />
                      )}
                    </label>
                    <label className="block">
                      <span className="text-caption text-stone-400">Diff</span>
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={customGiftDiff}
                        onChange={(e) => setCustomGiftDiff(Number(e.target.value) || 6)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-caption text-red-300">Rage Cost</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={customGiftRageCost}
                        onChange={(e) => setCustomGiftRageCost(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                    <label className="block">
                      <span className="text-caption text-cyan-300">Gnosis Cost</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={customGiftGnosisCost}
                        onChange={(e) => setCustomGiftGnosisCost(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                    <label className="block">
                      <span className="text-caption text-indigo-300">WP Cost</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={customGiftWpCost}
                        onChange={(e) => setCustomGiftWpCost(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                  </div>

                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={customGiftSummary}
                    onChange={(e) => setCustomGiftSummary(e.target.value)}
                    placeholder="Gift system summary..."
                    className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomGiftForm(false)}
                      className="rounded border border-stone-700 px-2.5 py-1 text-xs text-stone-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-zinc-950 hover:bg-amber-500"
                    >
                      Save Gift
                    </button>
                  </div>
                </form>
              )}

              {sheet.gifts.length === 0 ? (
                <p className="text-xs text-stone-400">
                  No Gifts recorded yet. Add from the W20 catalog or create a custom Gift.
                </p>
              ) : (
                <div className="space-y-2">{sheet.gifts.map(renderGiftCard)}</div>
              )}
            </section>
          )}
        </div>
      )}

      {/* 5. VITALS: RENOWN, RAGE/GNOSIS/WILLPOWER, HEALTH, RANK & EXPERIENCE */}
      {showVitals && (
        <div className={isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-3 gap-4'}>
          {/* Col 1: Renown + Rank & XP */}
          <div className="space-y-4">
            <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <h3 className="mb-2.5 flex items-center gap-1.5 border-b border-stone-800 pb-2 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                <Award className="h-3.5 w-3.5 text-amber-300" />
                Renown
              </h3>
              <div className="space-y-3">
                {(['glory', 'honor', 'wisdom'] as const).map((rKey) => {
                  const tracker = sheet.renown[rKey];
                  return (
                    <div key={rKey} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold capitalize text-stone-200">{rKey}</span>
                        <span className="font-mono text-caption text-stone-400">
                          Perm {tracker.permanent} / Temp {tracker.temporary}
                        </span>
                      </div>
                      <SheetPipTrack
                        label={`${rKey} Permanent`}
                        value={tracker.permanent}
                        max={10}
                        shape="circle"
                        tone="amber"
                        isMobile={isMobile}
                        onChange={(val) =>
                          onUpdateSheet((prev) => ({
                            ...prev,
                            renown: {
                              ...prev.renown,
                              [rKey]: { ...prev.renown[rKey], permanent: val },
                            },
                          }))
                        }
                      />
                      <SheetPipTrack
                        label={`${rKey} Temporary`}
                        value={tracker.temporary}
                        max={10}
                        shape="square"
                        tone="amber"
                        isMobile={isMobile}
                        onChange={(val) =>
                          onUpdateSheet((prev) => ({
                            ...prev,
                            renown: {
                              ...prev.renown,
                              [rKey]: { ...prev.renown[rKey], temporary: val },
                            },
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Rank & Experience */}
            <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <h3 className="mb-2.5 border-b border-stone-800 pb-2 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                Rank &amp; Experience
              </h3>
              <div className="space-y-2.5 text-xs">
                <label className="block">
                  <span className="text-caption uppercase text-stone-400">Garou Rank</span>
                  <select
                    value={sheet.rank}
                    onChange={(e) =>
                      onUpdateSheet((p) => ({
                        ...p,
                        rank: Math.max(0, Math.min(6, Number(e.target.value))),
                      }))
                    }
                    className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5"
                  >
                    {W20_RANK_NAMES.map((label, idx) => (
                      <option key={idx} value={idx}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-caption uppercase text-stone-400">Total XP</span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={sheet.experience.total}
                      onChange={(e) =>
                        onUpdateSheet((p) => ({
                          ...p,
                          experience: {
                            ...p.experience,
                            total: Math.max(0, Math.min(10000, Math.floor(Number(e.target.value) || 0))),
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2 py-1 font-mono"
                    />
                  </label>
                  <label className="block">
                    <span className="text-caption uppercase text-stone-400">Spent XP</span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={sheet.experience.spent}
                      onChange={(e) =>
                        onUpdateSheet((p) => ({
                          ...p,
                          experience: {
                            ...p.experience,
                            spent: Math.max(0, Math.min(10000, Math.floor(Number(e.target.value) || 0))),
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2 py-1 font-mono"
                    />
                  </label>
                  <div className="flex flex-col justify-end">
                    <span className="text-caption uppercase text-stone-400">Remaining</span>
                    <div
                      className={`mt-0.5 rounded border px-2 py-1 text-center font-mono font-bold ${
                        stats.experienceRemaining < 0
                          ? 'border-red-700 bg-red-950/50 text-red-300'
                          : 'border-emerald-700/60 bg-emerald-950/35 text-emerald-300'
                      }`}
                    >
                      {stats.experienceRemaining}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Col 2: Rage, Gnosis, Willpower Dual Perm / Temp */}
          <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
            <h3 className="mb-2.5 flex items-center gap-1.5 border-b border-stone-800 pb-2 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              <Flame className="h-3.5 w-3.5 text-red-400" />
              Rage • Gnosis • Willpower
            </h3>

            <div className="space-y-4">
              {(
                [
                  ['rage', 'Rage', 'crimson', 'text-red-300', sheet.rage.permanent],
                  ['gnosis', 'Gnosis', 'cyan', 'text-cyan-300', stats.effectiveGnosisPool],
                  ['willpower', 'Willpower', 'indigo', 'text-indigo-300', sheet.willpower.permanent],
                ] as const
              ).map(([traitKey, label, tone, labelColor, rollPool]) => {
                const tracker = sheet[traitKey];
                const traitShortcut: SheetShortcut = {
                  id: `default-${traitKey}`,
                  name: `${label} Roll`,
                  source: { kind: 'trait_combo', attribute: traitKey, ability: null },
                  difficulty: 6,
                  rageDiceCount: 0,
                  applyWoundPenalty: false,
                  isSecretRoll: false,
                };
                const pinned = isShortcutPinned(traitShortcut.id);

                return (
                  <div key={traitKey} className="space-y-1.5 rounded-lg border border-stone-800/80 bg-zinc-900/45 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className={`font-display text-xs font-bold uppercase ${labelColor}`}>
                          {label}
                        </span>
                        <span className="ml-2 font-mono text-caption text-stone-400">
                          {tracker.permanent} Perm / {tracker.temporary} Temp
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={rollPool <= 0}
                          onClick={() => onRoll(shortcutToRollRequest(sheet, traitShortcut))}
                          aria-label={
                            rollPool <= 0
                              ? `${label} pool is 0`
                              : `Roll ${label} (${rollPool}d10)`
                          }
                          title={
                            rollPool <= 0
                              ? `${label} pool is 0`
                              : `Roll ${label} (${rollPool}d10)`
                          }
                          className="flex items-center gap-1 rounded bg-red-800/85 px-2 py-0.5 text-caption font-bold text-amber-50 hover:bg-red-700 disabled:opacity-40"
                        >
                          <Dices className="h-3 w-3" />
                          Roll ({rollPool})
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleShortcutPin(traitShortcut)}
                          aria-label={pinned ? 'Unpin shortcut' : 'Pin shortcut'}
                          title={pinned ? 'Unpin shortcut' : 'Pin shortcut'}
                          className={`rounded border p-0.5 transition ${
                            pinned
                              ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                              : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-amber-200'
                          }`}
                        >
                          <Star className={`h-3 w-3 ${pinned ? 'fill-amber-300' : ''}`} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-caption uppercase tracking-wider text-stone-400">
                        Permanent (Circles)
                      </div>
                      <SheetPipTrack
                        label={`${label} Permanent`}
                        value={tracker.permanent}
                        max={10}
                        shape="circle"
                        tone={tone}
                        isMobile={isMobile}
                        onChange={(val) =>
                          onUpdateSheet((prev) => ({
                            ...prev,
                            [traitKey]: { ...prev[traitKey], permanent: val },
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-caption uppercase tracking-wider text-stone-400">
                        Temporary (Squares)
                      </div>
                      <SheetPipTrack
                        label={`${label} Temporary`}
                        value={tracker.temporary}
                        max={10}
                        shape="square"
                        tone={tone}
                        isMobile={isMobile}
                        onChange={(val) =>
                          onUpdateSheet((prev) => ({
                            ...prev,
                            [traitKey]: { ...prev[traitKey], temporary: val },
                          }))
                        }
                      />
                    </div>

                    {traitKey === 'gnosis' && (
                      <div className="mt-1.5 flex items-center justify-between rounded border border-stone-800 bg-zinc-950 px-2 py-1 text-caption">
                        <span className="text-stone-300">
                          Silver Carried{' '}
                          <span className="text-cyan-300">
                            (Eff. Gnosis {stats.effectiveGnosisPool})
                          </span>
                        </span>
                        <NumberStepper
                          label="Silver items carried"
                          value={sheet.silverCarriedItems}
                          min={0}
                          max={20}
                          size="sm"
                          valueClassName="text-amber-200"
                          onChange={(next) =>
                            onUpdateSheet((p) => ({ ...p, silverCarriedItems: next }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Col 3: Interactive Health Track */}
          <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                <HeartPulse className="h-3.5 w-3.5 text-red-400" />
                Health
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-caption font-bold ${
                  stats.isIncapacitated
                    ? 'border border-red-500 bg-red-950 text-red-200'
                    : stats.woundPenalty < 0
                      ? 'border border-amber-600/70 bg-amber-950/60 text-amber-200'
                      : 'border border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                }`}
              >
                {stats.woundLabel}
              </span>
            </div>

            <div className="mb-2.5 flex items-center justify-between rounded-lg border border-stone-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs">
              <span className="text-stone-300">Bonus Bruised Boxes</span>
              <NumberStepper
                label="Bonus Bruised boxes"
                value={sheet.health.bonusBruisedBoxes}
                min={0}
                max={10}
                size="sm"
                valueClassName="text-amber-200"
                onChange={(next) => handleAdjustBonusBruised(next - sheet.health.bonusBruisedBoxes)}
              />
            </div>

            <div className="space-y-1.5">
              {sheet.health.boxes.map((dmg, idx) => {
                const bonusCount = sheet.health.bonusBruisedBoxes;
                const label =
                  idx < bonusCount
                    ? 'Bonus Bruised (0)'
                    : BASE_HEALTH_LABELS[idx - bonusCount] ?? 'Incapacitated';
                const visual = damageGlyph(dmg);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      diceSoundEngine.playPipClick();
                      onUpdateSheet((prev) => {
                        const nextBoxes = [...prev.health.boxes];
                        nextBoxes[idx] = cycleDamageType(nextBoxes[idx] ?? 'none');
                        return {
                          ...prev,
                          health: { ...prev.health, boxes: nextBoxes },
                        };
                      });
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-stone-800/80 bg-zinc-900/50 px-2.5 py-1.5 text-left transition hover:border-stone-600"
                  >
                    <span className="text-xs font-semibold text-stone-200">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-stone-400">{visual.label}</span>
                      <span
                        className={`flex items-center justify-center rounded border font-mono text-sm font-black ${
                          isMobile ? 'h-7 w-7' : 'h-6 w-6'
                        } ${visual.classes}`}
                      >
                        {visual.symbol}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 flex items-center justify-between text-caption text-stone-400">
              <span>Tap box: None → / → X → *</span>
              <ConfirmButton
                variant="secondary"
                prompt="Clear all health damage?"
                confirmLabel="Clear"
                onConfirm={() =>
                  onUpdateSheet((prev) => ({
                    ...prev,
                    health: {
                      ...prev.health,
                      boxes: prev.health.boxes.map(() => 'none'),
                    },
                  }))
                }
              >
                Clear All
              </ConfirmButton>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
