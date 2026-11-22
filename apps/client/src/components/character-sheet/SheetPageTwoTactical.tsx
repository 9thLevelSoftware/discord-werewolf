import React, { useEffect, useState } from 'react';
import {
  ABILITY_GROUPS,
  AttributeKey,
  ATTRIBUTE_GROUPS,
  BrawlingManeuverRow,
  CanonicalAbilityKey,
  cleanOtherTraitDisplayName,
  DamageType,
  GarouForm,
  getBreedNaturalForm,
  OtherTraitKind,
  resolveOtherTraitKind,
  SheetFetishItem,
  SheetOtherTraitEntry,
  SheetRiteEntry,
  SheetShortcut,
  SheetWeaponEntry,
  UserSheetComputedStats,
  W20_FORM_MATRIX,
  W20_MERITS_FLAWS_CATALOG,
  W20UserCharacterSheet,
} from '@w20-vtt/core';
import {
  AlertTriangle,
  Dices,
  Flame,
  Plus,
  ScrollText,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Trash2,
  Zap,
} from 'lucide-react';
import type { SheetRollRequest } from '../../store/useCharacterSheetStore';
import {
  formatFormName,
  formatTraitName,
  SheetPipTrack,
  shortcutToRollRequest,
  W20_FORMS,
} from './sheetShared';

export type PageTwoMobileSection = 'forms' | 'combat_gifts' | 'bg_merits';

export interface SheetPageTwoTacticalProps {
  sheet: W20UserCharacterSheet;
  stats: UserSheetComputedStats;
  isMobile: boolean;
  mobileSection?: PageTwoMobileSection;
  onUpdateSheet: (updater: (prev: W20UserCharacterSheet) => W20UserCharacterSheet) => void;
  onSetActiveForm: (form: GarouForm) => void;
  onRoll: (req: SheetRollRequest) => void;
  onPinShortcut: (shortcut: SheetShortcut) => void;
  onRemoveShortcut: (shortcutId: string) => void;
}

const ALL_ATTRIBUTES: AttributeKey[] = [
  ...ATTRIBUTE_GROUPS.physical,
  ...ATTRIBUTE_GROUPS.social,
  ...ATTRIBUTE_GROUPS.mental,
];

const ALL_CANONICAL_ABILITIES = [
  ...ABILITY_GROUPS.talents,
  ...ABILITY_GROUPS.skills,
  ...ABILITY_GROUPS.knowledges,
];

function computeFormPreviewAttributes(
  sheet: W20UserCharacterSheet,
  form: GarouForm
): {
  strength: number;
  dexterity: number;
  stamina: number;
  manipulation: number;
  appearance: number;
} {
  const spec = W20_FORM_MATRIX[form];
  const base = sheet.baseAttributes;
  return {
    strength: Math.max(1, base.strength + (spec.deltas.strength ?? 0)),
    dexterity: Math.max(1, base.dexterity + (spec.deltas.dexterity ?? 0)),
    stamina: Math.max(1, base.stamina + (spec.deltas.stamina ?? 0)),
    manipulation: Math.max(0, base.manipulation + (spec.deltas.manipulation ?? 0)),
    appearance: spec.overrideAppearanceZero
      ? 0
      : Math.max(0, base.appearance + (spec.deltas.appearance ?? 0)),
  };
}

function buildWeaponAttackShortcut(weapon: SheetWeaponEntry): SheetShortcut {
  return {
    id: `weapon-atk-${weapon.id}`,
    name: `${weapon.name} Attack`,
    source: { kind: 'weapon_attack', weaponId: weapon.id },
    difficulty: weapon.difficulty,
    rageDiceCount: 0,
    applyWoundPenalty: true,
    isSecretRoll: false,
  };
}

function buildWeaponDamageShortcut(weapon: SheetWeaponEntry): SheetShortcut {
  return {
    id: `weapon-dmg-${weapon.id}`,
    name: `${weapon.name} Damage`,
    source: { kind: 'weapon_damage', weaponId: weapon.id },
    difficulty: 6,
    rageDiceCount: 0,
    applyWoundPenalty: false,
    isSecretRoll: false,
  };
}

function buildBrawlingAttackShortcut(row: BrawlingManeuverRow): SheetShortcut {
  return {
    id: `brawl-atk-${row.key}`,
    name: `${row.name} Attack`,
    source: {
      kind: 'trait_combo',
      attribute: 'dexterity',
      ability: 'brawl',
      useFormStats: true,
    },
    difficulty: row.difficulty,
    rageDiceCount: 0,
    applyWoundPenalty: true,
    isSecretRoll: false,
  };
}

function buildBrawlingDamageShortcut(row: BrawlingManeuverRow): SheetShortcut | null {
  if (row.damagePool === null) return null;
  if (row.key === 'claw' || row.key === 'bite' || row.key === 'punch' || row.key === 'kick') {
    return {
      id: `brawl-dmg-${row.key}`,
      name: `${row.name} Damage`,
      source: { kind: 'natural_brawl_damage', maneuver: row.key },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    };
  }
  return {
    id: `brawl-dmg-${row.key}`,
    name: `${row.name} Damage`,
    source: {
      kind: 'trait_combo',
      attribute: 'strength',
      ability: null,
      useFormStats: true,
    },
    difficulty: 6,
    rageDiceCount: 0,
    applyWoundPenalty: false,
    isSecretRoll: false,
  };
}

export const SheetPageTwoTactical: React.FC<SheetPageTwoTacticalProps> = ({
  sheet,
  stats,
  isMobile,
  mobileSection,
  onUpdateSheet,
  onSetActiveForm,
  onRoll,
  onPinShortcut,
  onRemoveShortcut,
}) => {
  const [inspectedForm, setInspectedForm] = useState<GarouForm>(sheet.activeForm);
  useEffect(() => {
    setInspectedForm(sheet.activeForm);
  }, [sheet.activeForm]);

  // Add Merit / Flaw / Other Trait
  const [newTraitName, setNewTraitName] = useState('');
  const [newTraitKind, setNewTraitKind] = useState<OtherTraitKind>('merit');
  const [newTraitDots, setNewTraitDots] = useState(1);
  const [showPresetMeritsFlaws, setShowPresetMeritsFlaws] = useState(false);

  // Weapon custom ability input tracking
  const [customAbilityWeaponId, setCustomAbilityWeaponId] = useState<string | null>(null);
  const [weaponCustomAbilityDraft, setWeaponCustomAbilityDraft] = useState('');

  // Add Rite
  const [showRiteForm, setShowRiteForm] = useState(false);
  const [riteName, setRiteName] = useState('');
  const [riteLevel, setRiteLevel] = useState(1);
  const [riteSummary, setRiteSummary] = useState('');

  // Add Fetish
  const [showFetishForm, setShowFetishForm] = useState(false);
  const [fetishName, setFetishName] = useState('');
  const [fetishLevel, setFetishLevel] = useState(1);
  const [fetishGnosis, setFetishGnosis] = useState(5);
  const [fetishPower, setFetishPower] = useState('');
  const [fetishSilver, setFetishSilver] = useState(false);

  const showForms = !mobileSection || mobileSection === 'forms';
  const showCombat = !mobileSection || mobileSection === 'combat_gifts';
  const showOtherTraits = !mobileSection || mobileSection === 'bg_merits';

  const isPinned = (id: string) => sheet.shortcuts.some((s) => s.id === id);
  const togglePin = (shortcut: SheetShortcut) => {
    if (isPinned(shortcut.id)) onRemoveShortcut(shortcut.id);
    else onPinShortcut(shortcut);
  };

  const renderWeaponAbilityOptions = (currentAbility: string) => {
    const isKnown =
      ALL_CANONICAL_ABILITIES.includes(currentAbility as CanonicalAbilityKey) ||
      sheet.customAbilities.some(
        (ca) => ca.name === currentAbility || ca.id === currentAbility
      );
    return (
      <>
        {!isKnown && currentAbility && (
          <option value={currentAbility}>{formatTraitName(currentAbility)}</option>
        )}
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
      </>
    );
  };

  const handleWeaponAbilitySelectChange = (weapon: SheetWeaponEntry, val: string) => {
    if (val === '__custom__') {
      setCustomAbilityWeaponId(weapon.id);
      setWeaponCustomAbilityDraft('');
      return;
    }
    setCustomAbilityWeaponId(null);
    updateWeaponField(weapon.id, { rollAbility: val });
  };

  const commitCustomWeaponAbility = (weaponId: string) => {
    const clean = weaponCustomAbilityDraft.trim().slice(0, 120);
    if (clean) {
      updateWeaponField(weaponId, { rollAbility: clean });
    }
    setCustomAbilityWeaponId(null);
    setWeaponCustomAbilityDraft('');
  };

  const naturalForm = getBreedNaturalForm(sheet.breed);

  const handleRollShift = (targetForm: GarouForm) => {
    const spec = W20_FORM_MATRIX[targetForm];
    const shiftShortcut: SheetShortcut = {
      id: `shift-${targetForm}`,
      name: `Shift to ${formatFormName(targetForm)}`,
      source: {
        kind: 'trait_combo',
        attribute: 'stamina',
        ability: 'primal_urge',
        useFormStats: true,
      },
      difficulty: spec.shiftDifficulty,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    };
    onRoll(shortcutToRollRequest(sheet, shiftShortcut));
  };

  const renderFormCard = (form: GarouForm) => {
    const spec = W20_FORM_MATRIX[form];
    const preview = computeFormPreviewAttributes(sheet, form);
    const isActive = sheet.activeForm === form;
    const isNatural = naturalForm === form;

    const statRows: Array<{ label: string; key: keyof typeof preview; val: number }> = [
      { label: 'Str', key: 'strength', val: preview.strength },
      { label: 'Dex', key: 'dexterity', val: preview.dexterity },
      { label: 'Sta', key: 'stamina', val: preview.stamina },
      { label: 'Man', key: 'manipulation', val: preview.manipulation },
      { label: 'App', key: 'appearance', val: preview.appearance },
    ];

    return (
      <div
        key={form}
        className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3 transition ${
          isActive
            ? 'border-red-500/85 bg-red-950/25 shadow-[0_0_16px_rgba(185,28,28,0.3)]'
            : 'border-stone-800 bg-zinc-950/85 hover:border-stone-600'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-1 border-b border-stone-800 pb-2">
            <div>
              <h4 className="font-display text-sm font-black uppercase text-amber-100">
                {formatFormName(form)}
              </h4>
              <div className="flex flex-wrap items-center gap-1 text-caption">
                <span className="font-mono text-stone-400">
                  Shift Diff {spec.shiftDifficulty}
                </span>
                {isNatural && (
                  <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-caption font-bold text-cyan-200">
                    Breed
                  </span>
                )}
              </div>
            </div>
            {isActive && (
              <span className="rounded-full border border-red-500/75 bg-red-900/80 px-2 py-0.5 text-caption font-extrabold uppercase text-amber-50">
                Active
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1 text-xs">
            {statRows.map((row) => {
              const base = sheet.baseAttributes[row.key];
              const delta = row.val - base;
              return (
                <div key={row.key} className="flex items-center justify-between">
                  <span className="text-stone-400">{row.label}</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    {row.key === 'appearance' && spec.overrideAppearanceZero ? (
                      <span className="text-caption text-red-300">=0</span>
                    ) : delta !== 0 ? (
                      <span
                        className={`text-caption ${
                          delta > 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    ) : null}
                    <span className="font-bold text-stone-100">{row.val}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap gap-1 text-caption">
            {spec.incitesDelirium && (
              <span className="rounded border border-red-700/60 bg-red-950/60 px-1.5 py-0.5 font-bold text-red-200">
                Delirium
              </span>
            )}
            {spec.hasClaws && (
              <span className="rounded border border-amber-600/60 bg-amber-950/50 px-1.5 py-0.5 font-semibold text-amber-200">
                Claws Str+2/A
              </span>
            )}
            {spec.hasFangs && (
              <span className="rounded border border-amber-600/60 bg-amber-950/50 px-1.5 py-0.5 font-semibold text-amber-200">
                Bite Str+{1 + spec.bonusBiteDamageDice}/A
              </span>
            )}
            {spec.perceptionDifficultyMod !== 0 && (
              <span className="rounded border border-cyan-700/60 bg-cyan-950/50 px-1.5 py-0.5 font-semibold text-cyan-200">
                Perc {spec.perceptionDifficultyMod} Diff
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-stone-800/80 pt-2">
          <button
            type="button"
            disabled={isActive}
            onClick={() => onSetActiveForm(form)}
            className={`w-full rounded-lg px-2 py-1.5 text-xs font-bold transition ${
              isActive
                ? 'border border-emerald-600/50 bg-emerald-950/40 text-emerald-200'
                : 'border border-amber-500/45 bg-amber-950/35 text-amber-100 hover:bg-amber-900/50'
            }`}
          >
            {isActive ? 'Current Form' : 'Set Active Form'}
          </button>

          <button
            type="button"
            onClick={() => handleRollShift(form)}
            className="w20-crimson-seal flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-50"
          >
            <Dices className="h-3.5 w-3.5" />
            Roll Shift (Diff {spec.shiftDifficulty})
          </button>
        </div>
      </div>
    );
  };

  const addWeaponPreset = (preset: 'blank' | 'klaive' | 'pistol' | 'silver_knife') => {
    const id = `wpn-${crypto.randomUUID().slice(0, 8)}`;
    const entry: SheetWeaponEntry =
      preset === 'klaive'
        ? {
            id,
            name: 'Klaive',
            rollAttribute: 'dexterity',
            rollAbility: 'melee',
            difficulty: 6,
            damageMode: 'strength_plus',
            damageDice: 2,
            damageType: 'aggravated',
            range: 'Melee',
            rate: '1',
            clip: '-',
          }
        : preset === 'pistol'
          ? {
              id,
              name: 'Heavy Pistol',
              rollAttribute: 'dexterity',
              rollAbility: 'firearms',
              difficulty: 6,
              damageMode: 'flat',
              damageDice: 5,
              damageType: 'lethal',
              range: '35m',
              rate: '3',
              clip: '12',
            }
          : preset === 'silver_knife'
            ? {
                id,
                name: 'Silver Dagger',
                rollAttribute: 'dexterity',
                rollAbility: 'melee',
                difficulty: 6,
                damageMode: 'strength_plus',
                damageDice: 1,
                damageType: 'aggravated',
                range: 'Melee',
                rate: '1',
                clip: '-',
              }
            : {
                id,
                name: 'New Weapon',
                rollAttribute: 'dexterity',
                rollAbility: 'melee',
                difficulty: 6,
                damageMode: 'strength_plus',
                damageDice: 1,
                damageType: 'lethal',
                range: 'Melee',
                rate: '1',
                clip: '-',
              };

    onUpdateSheet((prev) => ({
      ...prev,
      combatWeapons: [...prev.combatWeapons, entry].slice(0, 50),
    }));
  };

  const updateWeaponField = (weaponId: string, patch: Partial<SheetWeaponEntry>) => {
    onUpdateSheet((prev) => ({
      ...prev,
      combatWeapons: prev.combatWeapons.map((w) => (w.id === weaponId ? { ...w, ...patch } : w)),
    }));
  };

  const handleAddRite = (e: React.FormEvent) => {
    e.preventDefault();
    const name = riteName.trim().slice(0, 120);
    if (!name) return;
    const entry: SheetRiteEntry = {
      id: `rite-${crypto.randomUUID().slice(0, 8)}`,
      name,
      level: Math.max(0, Math.min(6, Math.floor(riteLevel))),
      summary: riteSummary.trim().slice(0, 2000),
    };
    onUpdateSheet((prev) => ({
      ...prev,
      rites: [...prev.rites, entry].slice(0, 100),
    }));
    setRiteName('');
    setRiteSummary('');
    setShowRiteForm(false);
  };

  const handleAddFetish = (e: React.FormEvent) => {
    e.preventDefault();
    const name = fetishName.trim().slice(0, 120);
    if (!name) return;
    const entry: SheetFetishItem = {
      id: `fetish-${crypto.randomUUID().slice(0, 8)}`,
      name,
      level: Math.max(0, Math.min(6, Math.floor(fetishLevel))),
      gnosisRating: Math.max(1, Math.min(10, Math.floor(fetishGnosis))),
      power: fetishPower.trim().slice(0, 2000),
      isSilver: fetishSilver || undefined,
    };
    onUpdateSheet((prev) => ({
      ...prev,
      fetishes: [...prev.fetishes, entry].slice(0, 50),
    }));
    setFetishName('');
    setFetishPower('');
    setFetishSilver(false);
    setShowFetishForm(false);
  };

  const soakShortcut: SheetShortcut = {
    id: 'default-soak',
    name: 'Soak',
    source: { kind: 'soak', includeArmor: true },
    difficulty: 6,
    rageDiceCount: 0,
    applyWoundPenalty: false,
    isSecretRoll: false,
  };
  const soakPinned = isPinned(soakShortcut.id);

  return (
    <div className="space-y-5">
      {/* 1. FIVE-FORM MATRIX */}
      {showForms && (
        <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
            <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
              <Flame className="h-3.5 w-3.5 text-red-400" />
              Five Garou Forms
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
              <span>
                Active:{' '}
                <strong className="text-red-300">{formatFormName(sheet.activeForm)}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  onRoll({
                    label: 'Initiative',
                    pool: 1,
                    difficulty: 6,
                    hasSpecialty: false,
                    applyWoundPenalty: true,
                    rollMode: 'initiative',
                    initiativeModifier: stats.initiativeBonus,
                  })
                }
                aria-label={`Roll 1d10 ${stats.initiativeBonus >= 0 ? `+ ${stats.initiativeBonus}` : `- ${Math.abs(stats.initiativeBonus)}`} Initiative`}
                title={`Roll 1d10 ${stats.initiativeBonus >= 0 ? `+ ${stats.initiativeBonus}` : `- ${Math.abs(stats.initiativeBonus)}`} Initiative`}
                className="flex items-center gap-1 rounded-lg border border-amber-500/55 bg-amber-950/45 px-2.5 py-1 text-xs font-bold text-amber-100 transition hover:border-amber-400 hover:bg-amber-900/55"
              >
                <Zap className="h-3 w-3 text-amber-300" />
                Roll Initiative (1d10{stats.initiativeBonus >= 0 ? `+${stats.initiativeBonus}` : stats.initiativeBonus})
              </button>
            </div>
          </div>

          {isMobile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-5 gap-1 rounded-xl border border-stone-800 bg-zinc-900/80 p-1">
                {W20_FORMS.map((f) => {
                  const isActive = sheet.activeForm === f;
                  const isViewed = inspectedForm === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInspectedForm(f)}
                      className={`relative rounded-lg px-1 py-2 text-xs font-bold transition ${
                        isViewed
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {formatFormName(f)}
                      {isActive && (
                        <span className="mx-auto mt-0.5 block h-1 w-3 rounded-full bg-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              {renderFormCard(inspectedForm)}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2.5">
              {W20_FORMS.map((f) => renderFormCard(f))}
            </div>
          )}
        </section>
      )}

      {/* 2. ARMOR & SOAK + COMBAT WEAPONS + CANONICAL BRAWLING CHART */}
      {showCombat && (
        <>
          {/* Armor & Soak */}
          <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                <Shield className="h-3.5 w-3.5 text-cyan-300" />
                Armor &amp; Soak
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onRoll(shortcutToRollRequest(sheet, soakShortcut))}
                  className="w20-crimson-seal flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-amber-50"
                >
                  <Dices className="h-3.5 w-3.5" />
                  Roll Soak ({stats.soakCapabilities.soakPool}d10)
                </button>
                <button
                  type="button"
                  onClick={() => togglePin(soakShortcut)}
                  aria-label={soakPinned ? 'Unpin Soak' : 'Pin Soak'}
                  title={soakPinned ? 'Unpin Soak' : 'Pin Soak'}
                  className={`rounded-lg border p-1.5 transition ${
                    soakPinned
                      ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                      : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-amber-200'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${soakPinned ? 'fill-amber-300' : ''}`} />
                </button>
              </div>
            </div>

            <div className={isMobile ? 'space-y-2.5' : 'grid grid-cols-3 items-end gap-3'}>
              <label className="block">
                <span className="text-caption uppercase text-stone-400">Armor Rating (0–15)</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={sheet.armor.rating}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({
                      ...p,
                      armor: {
                        ...p.armor,
                        rating: Math.max(0, Math.min(15, Math.floor(Number(e.target.value) || 0))),
                      },
                    }))
                  }
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-stone-100"
                />
              </label>

              <label className="block">
                <span className="text-caption uppercase text-stone-400">Armor Description</span>
                <input
                  type="text"
                  maxLength={500}
                  value={sheet.armor.description}
                  onChange={(e) =>
                    onUpdateSheet((p) => ({
                      ...p,
                      armor: { ...p.armor, description: e.target.value },
                    }))
                  }
                  placeholder="e.g. Heavy Leather / Kevlar Vest"
                  className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
                />
              </label>

              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-800 bg-zinc-900/60 p-2 text-caption">
                <span className="font-mono font-bold text-cyan-200">
                  Stamina {stats.soakCapabilities.naturalSoakPool} + Armor{' '}
                  {stats.soakCapabilities.armorRating}
                </span>
                <span className="rounded bg-emerald-950/70 px-1.5 py-0.5 text-emerald-300">
                  Bashing <span aria-hidden="true">✓</span>
                  <span className="sr-only"> can be soaked</span>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    stats.soakCapabilities.canSoakLethal
                      ? 'border border-emerald-700/50 bg-emerald-950/70 text-emerald-300'
                      : 'border border-stone-600 bg-zinc-800 text-stone-300'
                  }`}
                >
                  Lethal{' '}
                  <span aria-hidden="true">{stats.soakCapabilities.canSoakLethal ? '✓' : '✗'}</span>
                  <span className="sr-only">
                    {stats.soakCapabilities.canSoakLethal ? ' can be soaked' : ' cannot be soaked'}
                  </span>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    stats.soakCapabilities.canSoakAggravated
                      ? 'border border-emerald-700/50 bg-emerald-950/70 text-emerald-300'
                      : 'border border-stone-600 bg-zinc-800 text-stone-300'
                  }`}
                >
                  Agg{' '}
                  <span aria-hidden="true">{stats.soakCapabilities.canSoakAggravated ? '✓' : '✗'}</span>
                  <span className="sr-only">
                    {stats.soakCapabilities.canSoakAggravated ? ' can be soaked' : ' cannot be soaked'}
                  </span>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    stats.soakCapabilities.canSoakSilver
                      ? 'border border-emerald-700/50 bg-emerald-950/70 text-emerald-300'
                      : 'border border-stone-600 bg-zinc-800 text-stone-300'
                  }`}
                >
                  Silver{' '}
                  <span aria-hidden="true">{stats.soakCapabilities.canSoakSilver ? '✓' : '✗'}</span>
                  <span className="sr-only">
                    {stats.soakCapabilities.canSoakSilver ? ' can be soaked' : ' cannot be soaked'}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {/* Combat Weapons */}
          <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                <Swords className="h-3.5 w-3.5 text-red-400" />
                Combat Weapons ({sheet.combatWeapons.length})
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addWeaponPreset('klaive')}
                  className="rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-caption font-semibold text-amber-200 hover:border-amber-500/60"
                >
                  + Klaive
                </button>
                <button
                  type="button"
                  onClick={() => addWeaponPreset('silver_knife')}
                  className="rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-caption font-semibold text-stone-200 hover:border-stone-500"
                >
                  + Silver Knife
                </button>
                <button
                  type="button"
                  onClick={() => addWeaponPreset('pistol')}
                  className="rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-caption font-semibold text-stone-200 hover:border-stone-500"
                >
                  + Heavy Pistol
                </button>
                <button
                  type="button"
                  onClick={() => addWeaponPreset('blank')}
                  className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-950/35 px-2.5 py-1 text-caption font-bold text-amber-200 hover:bg-amber-900/45"
                >
                  <Plus className="h-3 w-3" />
                  Custom Weapon
                </button>
              </div>
            </div>

            {sheet.combatWeapons.length === 0 ? (
              <p className="text-xs text-stone-400">
                No weapons equipped. Add a Klaive, firearm, or custom weapon above.
              </p>
            ) : isMobile ? (
              <div className="space-y-3">
                {sheet.combatWeapons.map((weapon) => {
                  const atkShortcut = buildWeaponAttackShortcut(weapon);
                  const dmgShortcut = buildWeaponDamageShortcut(weapon);
                  const atkReq = shortcutToRollRequest(sheet, atkShortcut);
                  const dmgReq = shortcutToRollRequest(sheet, dmgShortcut);
                  const atkPinned = isPinned(atkShortcut.id);
                  const dmgPinned = isPinned(dmgShortcut.id);

                  return (
                    <div
                      key={weapon.id}
                      className="space-y-2 rounded-xl border border-stone-800 bg-zinc-900/60 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={120}
                          value={weapon.name}
                          onChange={(e) => updateWeaponField(weapon.id, { name: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-bold text-amber-100"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSheet((p) => ({
                              ...p,
                              combatWeapons: p.combatWeapons.filter((w) => w.id !== weapon.id),
                            }))
                          }
                          aria-label={`Remove ${weapon.name}`}
                          className="rounded p-1 text-stone-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <label className="block">
                          <span className="text-caption text-stone-400">Attr</span>
                          <select
                            value={weapon.rollAttribute}
                            onChange={(e) =>
                              updateWeaponField(weapon.id, {
                                rollAttribute: e.target.value as AttributeKey,
                              })
                            }
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-1 py-1 capitalize"
                          >
                            {ALL_ATTRIBUTES.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Ability</span>
                          <select
                            value={
                              customAbilityWeaponId === weapon.id
                                ? '__custom__'
                                : weapon.rollAbility
                            }
                            onChange={(e) => handleWeaponAbilitySelectChange(weapon, e.target.value)}
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-1 py-1"
                          >
                            {renderWeaponAbilityOptions(weapon.rollAbility)}
                          </select>
                          {customAbilityWeaponId === weapon.id && (
                            <div className="mt-1 flex gap-1">
                              <input
                                type="text"
                                maxLength={120}
                                value={weaponCustomAbilityDraft}
                                onChange={(e) => setWeaponCustomAbilityDraft(e.target.value)}
                                placeholder="Custom ability..."
                                className="min-w-0 flex-1 rounded border border-amber-500/50 bg-zinc-950 px-1.5 py-0.5 text-caption"
                              />
                              <button
                                type="button"
                                onClick={() => commitCustomWeaponAbility(weapon.id)}
                                className="rounded bg-amber-600 px-1.5 py-0.5 text-caption font-bold text-zinc-950"
                              >
                                OK
                              </button>
                            </div>
                          )}
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Diff</span>
                          <input
                            type="number"
                            min={2}
                            max={10}
                            value={weapon.difficulty}
                            onChange={(e) =>
                              updateWeaponField(weapon.id, {
                                difficulty: Math.max(2, Math.min(10, Number(e.target.value) || 6)),
                              })
                            }
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <label className="block">
                          <span className="text-caption text-stone-400">Dmg Mode</span>
                          <select
                            value={weapon.damageMode}
                            onChange={(e) =>
                              updateWeaponField(weapon.id, {
                                damageMode: e.target.value as 'strength_plus' | 'flat',
                              })
                            }
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-1 py-1"
                          >
                            <option value="strength_plus">Str +</option>
                            <option value="flat">Flat</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Dice</span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={weapon.damageDice}
                            onChange={(e) =>
                              updateWeaponField(weapon.id, {
                                damageDice: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                          />
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Type</span>
                          <select
                            value={weapon.damageType}
                            onChange={(e) =>
                              updateWeaponField(weapon.id, {
                                damageType: e.target.value as Exclude<DamageType, 'none'>,
                              })
                            }
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-1 py-1 capitalize"
                          >
                            <option value="bashing">Bashing</option>
                            <option value="lethal">Lethal</option>
                            <option value="aggravated">Aggravated</option>
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <label className="block">
                          <span className="text-caption text-stone-400">Range</span>
                          <input
                            type="text"
                            maxLength={60}
                            value={weapon.range}
                            onChange={(e) => updateWeaponField(weapon.id, { range: e.target.value })}
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                          />
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Rate</span>
                          <input
                            type="text"
                            maxLength={60}
                            value={weapon.rate}
                            onChange={(e) => updateWeaponField(weapon.id, { rate: e.target.value })}
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                          />
                        </label>
                        <label className="block">
                          <span className="text-caption text-stone-400">Clip</span>
                          <input
                            type="text"
                            maxLength={60}
                            value={weapon.clip}
                            onChange={(e) => updateWeaponField(weapon.id, { clip: e.target.value })}
                            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onRoll(atkReq)}
                            className="w20-crimson-seal flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-50"
                          >
                            <Dices className="h-3.5 w-3.5" />
                            Atk ({atkReq.pool}d10)
                          </button>
                          <button
                            type="button"
                            aria-label={`Pin ${atkShortcut.name} to quick rolls`}
                            aria-pressed={atkPinned}
                            onClick={() => togglePin(atkShortcut)}
                            className={`rounded-lg border px-2 ${
                              atkPinned
                                ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                : 'border-stone-700 bg-zinc-950 text-stone-400'
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${atkPinned ? 'fill-amber-300' : ''}`} />
                          </button>
                        </div>

                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onRoll(dmgReq)}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/40 px-2 py-1.5 text-xs font-bold text-amber-100"
                          >
                            <Dices className="h-3.5 w-3.5" />
                            Dmg ({dmgReq.pool}d10)
                          </button>
                          <button
                            type="button"
                            aria-label={`Pin ${dmgShortcut.name} to quick rolls`}
                            aria-pressed={dmgPinned}
                            onClick={() => togglePin(dmgShortcut)}
                            className={`rounded-lg border px-2 ${
                              dmgPinned
                                ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                : 'border-stone-700 bg-zinc-950 text-stone-400'
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${dmgPinned ? 'fill-amber-300' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-800 text-caption uppercase text-stone-400">
                      <th className="py-1.5 pr-2">Weapon</th>
                      <th className="py-1.5 pr-2">Pool</th>
                      <th className="py-1.5 pr-2">Diff</th>
                      <th className="py-1.5 pr-2">Damage</th>
                      <th className="py-1.5 pr-2">Rng / Rate / Clip</th>
                      <th className="py-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/70">
                    {sheet.combatWeapons.map((weapon) => {
                      const atkShortcut = buildWeaponAttackShortcut(weapon);
                      const dmgShortcut = buildWeaponDamageShortcut(weapon);
                      const atkReq = shortcutToRollRequest(sheet, atkShortcut);
                      const dmgReq = shortcutToRollRequest(sheet, dmgShortcut);
                      const atkPinned = isPinned(atkShortcut.id);
                      const dmgPinned = isPinned(dmgShortcut.id);

                      return (
                        <tr key={weapon.id} className="align-middle">
                          <td className="py-2 pr-2">
                            <input
                              type="text"
                              maxLength={120}
                              value={weapon.name}
                              onChange={(e) =>
                                updateWeaponField(weapon.id, { name: e.target.value })
                              }
                              className="w-36 rounded border border-stone-700/80 bg-zinc-900 px-2 py-1 font-semibold text-amber-100"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1">
                              <select
                                value={weapon.rollAttribute}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, {
                                    rollAttribute: e.target.value as AttributeKey,
                                  })
                                }
                                className="rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-xs capitalize"
                              >
                                {ALL_ATTRIBUTES.map((a) => (
                                  <option key={a} value={a}>
                                    {a.slice(0, 3)}
                                  </option>
                                ))}
                              </select>
                              <span>+</span>
                              <select
                                value={
                                  customAbilityWeaponId === weapon.id
                                    ? '__custom__'
                                    : weapon.rollAbility
                                }
                                onChange={(e) =>
                                  handleWeaponAbilitySelectChange(weapon, e.target.value)
                                }
                                className="rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-xs"
                              >
                                {renderWeaponAbilityOptions(weapon.rollAbility)}
                              </select>
                              {customAbilityWeaponId === weapon.id && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    maxLength={120}
                                    value={weaponCustomAbilityDraft}
                                    onChange={(e) => setWeaponCustomAbilityDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        commitCustomWeaponAbility(weapon.id);
                                      }
                                    }}
                                    placeholder="Custom ability..."
                                    className="w-24 rounded border border-amber-500/50 bg-zinc-950 px-1.5 py-0.5 text-xs"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => commitCustomWeaponAbility(weapon.id)}
                                    className="rounded bg-amber-600 px-1.5 py-0.5 text-caption font-bold text-zinc-950"
                                  >
                                    OK
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              min={2}
                              max={10}
                              value={weapon.difficulty}
                              onChange={(e) =>
                                updateWeaponField(weapon.id, {
                                  difficulty: Math.max(
                                    2,
                                    Math.min(10, Number(e.target.value) || 6)
                                  ),
                                })
                              }
                              className="w-12 rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-center font-mono"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1">
                              <select
                                value={weapon.damageMode}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, {
                                    damageMode: e.target.value as 'strength_plus' | 'flat',
                                  })
                                }
                                className="rounded border border-stone-700 bg-zinc-900 px-1 py-1 text-xs"
                              >
                                <option value="strength_plus">Str+</option>
                                <option value="flat">Flat</option>
                              </select>
                              <input
                                type="number"
                                min={0}
                                max={30}
                                value={weapon.damageDice}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, {
                                    damageDice: Math.max(
                                      0,
                                      Math.min(30, Number(e.target.value) || 0)
                                    ),
                                  })
                                }
                                className="w-12 rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-center font-mono"
                              />
                              <select
                                value={weapon.damageType}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, {
                                    damageType: e.target.value as Exclude<DamageType, 'none'>,
                                  })
                                }
                                className="rounded border border-stone-700 bg-zinc-900 px-1 py-1 text-xs"
                              >
                                <option value="bashing">B</option>
                                <option value="lethal">L</option>
                                <option value="aggravated">A</option>
                              </select>
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                maxLength={60}
                                value={weapon.range}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, { range: e.target.value })
                                }
                                className="w-14 rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-xs"
                                title="Range"
                              />
                              <input
                                type="text"
                                maxLength={60}
                                value={weapon.rate}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, { rate: e.target.value })
                                }
                                className="w-10 rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-center text-xs"
                                title="Rate"
                              />
                              <input
                                type="text"
                                maxLength={60}
                                value={weapon.clip}
                                onChange={(e) =>
                                  updateWeaponField(weapon.id, { clip: e.target.value })
                                }
                                className="w-10 rounded border border-stone-700 bg-zinc-900 px-1.5 py-1 text-center text-xs"
                                title="Clip"
                              />
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onRoll(atkReq)}
                                className="rounded bg-red-800/90 px-2 py-1 text-caption font-bold text-amber-50 hover:bg-red-700"
                              >
                                Atk ({atkReq.pool})
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePin(atkShortcut)}
                                aria-label="Pin Attack"
                                title="Pin Attack"
                                className={`rounded border p-1 ${
                                  atkPinned
                                    ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                    : 'border-stone-700 bg-zinc-900 text-stone-400'
                                }`}
                              >
                                <Star className={`h-3 w-3 ${atkPinned ? 'fill-amber-300' : ''}`} />
                              </button>

                              <button
                                type="button"
                                onClick={() => onRoll(dmgReq)}
                                className="rounded border border-amber-500/45 bg-amber-950/40 px-2 py-1 text-caption font-bold text-amber-100 hover:bg-amber-900/50"
                              >
                                Dmg ({dmgReq.pool})
                              </button>
                              <button
                                type="button"
                                onClick={() => togglePin(dmgShortcut)}
                                aria-label="Pin Damage"
                                title="Pin Damage"
                                className={`rounded border p-1 ${
                                  dmgPinned
                                    ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                    : 'border-stone-700 bg-zinc-900 text-stone-400'
                                }`}
                              >
                                <Star className={`h-3 w-3 ${dmgPinned ? 'fill-amber-300' : ''}`} />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSheet((p) => ({
                                    ...p,
                                    combatWeapons: p.combatWeapons.filter(
                                      (w) => w.id !== weapon.id
                                    ),
                                  }))
                                }
                                className="p-1 text-stone-400 hover:text-red-300"
                                aria-label={`Delete ${weapon.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Canonical W20 Brawling Chart */}
          <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
            <div className="mb-2.5 flex items-center justify-between border-b border-stone-800 pb-2">
              <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                W20 Brawling Maneuvers ({formatFormName(sheet.activeForm)})
              </h3>
              <span className="text-caption text-stone-400">
                Dexterity + Brawl • Natural Weapons
              </span>
            </div>

            {isMobile ? (
              <div className="space-y-2.5">
                {stats.brawlingChart.map((row) => {
                  const atkShortcut = buildBrawlingAttackShortcut(row);
                  const dmgShortcut = buildBrawlingDamageShortcut(row);
                  const atkPinned = isPinned(atkShortcut.id);
                  const dmgPinned = dmgShortcut ? isPinned(dmgShortcut.id) : false;

                  return (
                    <div
                      key={row.key}
                      className={`rounded-xl border p-3 text-xs ${
                        row.availableInCurrentForm
                          ? 'border-stone-800 bg-zinc-900/60'
                          : 'border-stone-800/60 bg-zinc-950/50 opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-amber-100">{row.name}</span>
                          {!row.availableInCurrentForm && (
                            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-caption text-stone-400">
                              No {row.name} in {formatFormName(sheet.activeForm)}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-stone-300">
                          Diff {row.difficulty} • Dmg {row.damageLabel}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onRoll(shortcutToRollRequest(sheet, atkShortcut))}
                            className="w20-crimson-seal flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-50"
                          >
                            <Dices className="h-3.5 w-3.5" />
                            Atk ({row.attackPool}d10)
                          </button>
                          <button
                            type="button"
                            aria-label={`Pin ${atkShortcut.name} to quick rolls`}
                            aria-pressed={atkPinned}
                            onClick={() => togglePin(atkShortcut)}
                            className={`rounded-lg border px-2 ${
                              atkPinned
                                ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                : 'border-stone-700 bg-zinc-950 text-stone-400'
                            }`}
                          >
                            <Star className={`h-3.5 w-3.5 ${atkPinned ? 'fill-amber-300' : ''}`} />
                          </button>
                        </div>

                        {dmgShortcut ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => onRoll(shortcutToRollRequest(sheet, dmgShortcut))}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/40 px-2 py-1.5 text-xs font-bold text-amber-100"
                            >
                              <Dices className="h-3.5 w-3.5" />
                              Dmg ({row.damagePool}d10)
                            </button>
                            <button
                              type="button"
                              aria-label={`Pin ${dmgShortcut.name} to quick rolls`}
                              aria-pressed={dmgPinned}
                              onClick={() => togglePin(dmgShortcut)}
                              className={`rounded-lg border px-2 ${
                                dmgPinned
                                  ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                  : 'border-stone-700 bg-zinc-950 text-stone-400'
                              }`}
                            >
                              <Star className={`h-3.5 w-3.5 ${dmgPinned ? 'fill-amber-300' : ''}`} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center rounded-lg border border-stone-800 bg-zinc-950 text-caption text-stone-400">
                            Knockdown / Special
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-800 text-caption uppercase text-stone-400">
                    <th className="py-1.5 pr-2">Maneuver</th>
                    <th className="py-1.5 pr-2">Attack Pool</th>
                    <th className="py-1.5 pr-2">Diff</th>
                    <th className="py-1.5 pr-2">Damage</th>
                    <th className="py-1.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/70">
                  {stats.brawlingChart.map((row) => {
                    const atkShortcut = buildBrawlingAttackShortcut(row);
                    const dmgShortcut = buildBrawlingDamageShortcut(row);
                    const atkPinned = isPinned(atkShortcut.id);
                    const dmgPinned = dmgShortcut ? isPinned(dmgShortcut.id) : false;

                    return (
                      <tr
                        key={row.key}
                        className={row.availableInCurrentForm ? '' : 'opacity-60'}
                      >
                        <td className="py-2 pr-2 font-bold text-amber-100">
                          {row.name}
                          {!row.availableInCurrentForm && (
                            <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-caption font-normal text-stone-400">
                              Requires shifted form
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-2 font-mono text-stone-200">{row.attackPool}d10</td>
                        <td className="py-2 pr-2 font-mono text-amber-300">{row.difficulty}</td>
                        <td className="py-2 pr-2 font-mono text-stone-200">{row.damageLabel}</td>
                        <td className="py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onRoll(shortcutToRollRequest(sheet, atkShortcut))}
                              className="rounded bg-red-800/90 px-2 py-1 text-caption font-bold text-amber-50 hover:bg-red-700"
                            >
                              Attack
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePin(atkShortcut)}
                              aria-label={`Pin ${row.name} Attack`}
                              title={`Pin ${row.name} Attack`}
                              className={`rounded border p-1 ${
                                atkPinned
                                  ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                  : 'border-stone-700 bg-zinc-900 text-stone-400'
                              }`}
                            >
                              <Star className={`h-3 w-3 ${atkPinned ? 'fill-amber-300' : ''}`} />
                            </button>
                            {dmgShortcut && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onRoll(shortcutToRollRequest(sheet, dmgShortcut))}
                                  className="rounded border border-amber-500/45 bg-amber-950/40 px-2 py-1 text-caption font-bold text-amber-100 hover:bg-amber-900/50"
                                >
                                  Damage
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePin(dmgShortcut)}
                                  aria-label={`Pin ${row.name} Damage`}
                                  title={`Pin ${row.name} Damage`}
                                  className={`rounded border p-1 ${
                                    dmgPinned
                                      ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                      : 'border-stone-700 bg-zinc-900 text-stone-400'
                                  }`}
                                >
                                  <Star
                                    className={`h-3 w-3 ${dmgPinned ? 'fill-amber-300' : ''}`}
                                  />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

        </>
      )}

      {/* 3. FETISHES, RITES & DIFFERENTIATED MERITS / FLAWS / OTHER TRAITS */}
      {(showCombat || showOtherTraits) && (
        <div
          className={
            !showCombat || isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-3 gap-4'
          }
        >
          {showCombat && (
            <>
              {/* Fetishes */}
              <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <div className="mb-2.5 flex items-center justify-between border-b border-stone-800 pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                  Fetishes ({sheet.fetishes.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowFetishForm((v) => !v)}
                  className="rounded border border-stone-700 bg-zinc-900 px-2 py-0.5 text-caption font-bold text-amber-200 hover:border-amber-500/60"
                >
                  + Add
                </button>
              </div>

              {showFetishForm && (
                <form
                  onSubmit={handleAddFetish}
                  className="mb-3 space-y-2 rounded-lg border border-stone-700 bg-zinc-900/70 p-2.5 text-xs"
                >
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={fetishName}
                    onChange={(e) => setFetishName(e.target.value)}
                    placeholder="Fetish name"
                    className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-caption text-stone-400">Level (0=Talen)</span>
                      <input
                        type="number"
                        min={0}
                        max={6}
                        value={fetishLevel}
                        onChange={(e) => setFetishLevel(Number(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                    <label className="block">
                      <span className="text-caption text-stone-400">Gnosis Rating</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={fetishGnosis}
                        onChange={(e) => setFetishGnosis(Number(e.target.value) || 5)}
                        className="mt-0.5 w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-300">
                    <input
                      type="checkbox"
                      checked={fetishSilver}
                      onChange={(e) => setFetishSilver(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Made of Silver
                  </label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={fetishPower}
                    onChange={(e) => setFetishPower(e.target.value)}
                    placeholder="Power / Activation effect"
                    className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowFetishForm(false)}
                      className="rounded border border-stone-700 px-2 py-1 text-caption"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-amber-600 px-2.5 py-1 text-caption font-bold text-zinc-950"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              {sheet.fetishes.length === 0 ? (
                <p className="text-xs text-stone-400">No Fetishes or Talens bound.</p>
              ) : (
                <div className="space-y-2">
                  {sheet.fetishes.map((f) => {
                    const fetishShortcut: SheetShortcut = {
                      id: `fetish-${f.id}`,
                      name: `Activate ${f.name}`,
                      source: { kind: 'fetish_activate', fetishId: f.id },
                      difficulty: 6,
                      rageDiceCount: 0,
                      applyWoundPenalty: false,
                      isSecretRoll: false,
                    };
                    const pinned = isPinned(fetishShortcut.id);

                    return (
                      <div
                        key={f.id}
                        className="rounded-lg border border-stone-800 bg-zinc-900/50 p-2.5 text-xs"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-bold text-amber-100">{f.name}</span>
                              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-caption text-stone-300">
                                {f.level === 0 ? 'Talen' : `Lv ${f.level}`} • Gn {f.gnosisRating}
                              </span>
                              {f.isSilver && (
                                <span className="rounded border border-stone-500/70 bg-stone-800 px-1.5 py-0.5 text-caption font-bold text-stone-100">
                                  Silver
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onRoll(shortcutToRollRequest(sheet, fetishShortcut))}
                              className="flex items-center gap-1 rounded bg-red-800/85 px-1.5 py-0.5 text-caption font-bold text-amber-50 hover:bg-red-700"
                              aria-label={`Roll Gnosis Activation (${f.gnosisRating}d10)`}
                              title={`Roll Gnosis Activation (${f.gnosisRating}d10)`}
                            >
                              <Dices className="h-3 w-3" />
                              Activate
                            </button>
                            <button
                              type="button"
                              aria-label={`Pin ${fetishShortcut.name} to quick rolls`}
                              aria-pressed={pinned}
                              onClick={() => togglePin(fetishShortcut)}
                              className={`rounded border p-0.5 ${
                                pinned
                                  ? 'border-amber-400 bg-amber-950/60 text-amber-300'
                                  : 'border-stone-700 bg-zinc-900 text-stone-400'
                              }`}
                            >
                              <Star className={`h-3 w-3 ${pinned ? 'fill-amber-300' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateSheet((p) => ({
                                  ...p,
                                  fetishes: p.fetishes.filter((item) => item.id !== f.id),
                                }))
                              }
                              className="p-0.5 text-stone-400 hover:text-red-300"
                              aria-label={`Remove ${f.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {f.power && <p className="mt-1 text-caption text-stone-400">{f.power}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Rites */}
            <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
              <div className="mb-2.5 flex items-center justify-between border-b border-stone-800 pb-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                  <ScrollText className="h-3.5 w-3.5 text-amber-300" />
                  Rites ({sheet.rites.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRiteForm((v) => !v)}
                  className="rounded border border-stone-700 bg-zinc-900 px-2 py-0.5 text-caption font-bold text-amber-200 hover:border-amber-500/60"
                >
                  + Add
                </button>
              </div>

              {showRiteForm && (
                <form
                  onSubmit={handleAddRite}
                  className="mb-3 space-y-2 rounded-lg border border-stone-700 bg-zinc-900/70 p-2.5 text-xs"
                >
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={riteName}
                      onChange={(e) => setRiteName(e.target.value)}
                      placeholder="Rite name"
                      className="col-span-2 rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={riteLevel}
                      onChange={(e) => setRiteLevel(Number(e.target.value) || 0)}
                      className="rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
                      title="Rite Level"
                    />
                  </div>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={riteSummary}
                    onChange={(e) => setRiteSummary(e.target.value)}
                    placeholder="Rite system summary"
                    className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowRiteForm(false)}
                      className="rounded border border-stone-700 px-2 py-1 text-caption"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded bg-amber-600 px-2.5 py-1 text-caption font-bold text-zinc-950"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              {sheet.rites.length === 0 ? (
                <p className="text-xs text-stone-400">No Rites learned yet.</p>
              ) : (
                <div className="space-y-2">
                  {sheet.rites.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-stone-800 bg-zinc-900/50 p-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div>
                          <span className="font-bold text-amber-100">{r.name}</span>
                          {r.level !== undefined && (
                            <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-caption text-stone-300">
                              Lv {r.level}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSheet((p) => ({
                              ...p,
                              rites: p.rites.filter((item) => item.id !== r.id),
                            }))
                          }
                          className="p-0.5 text-stone-400 hover:text-red-300"
                          aria-label={`Remove ${r.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {r.summary && <p className="mt-1 text-caption text-stone-400">{r.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
            </>
          )}

          {/* Differentiated Merits, Flaws & Other Traits */}
          {showOtherTraits && (() => {
            const meritEntries = sheet.otherTraits.filter(
              (ot) => resolveOtherTraitKind(ot) === 'merit'
            );
            const flawEntries = sheet.otherTraits.filter(
              (ot) => resolveOtherTraitKind(ot) === 'flaw'
            );
            const otherEntries = sheet.otherTraits.filter(
              (ot) => resolveOtherTraitKind(ot) === 'other'
            );

            const addOtherTrait = (explicit?: {
              name: string;
              kind: OtherTraitKind;
              dots: number;
              category?: SheetOtherTraitEntry['category'];
            }) => {
              const clean = (explicit?.name ?? newTraitName).trim().slice(0, 120);
              if (!clean) return;
              const kind = explicit?.kind ?? newTraitKind;
              const dots = Math.max(0, Math.min(10, Math.floor(explicit?.dots ?? newTraitDots)));
              onUpdateSheet((prev) => ({
                ...prev,
                otherTraits: [
                  ...prev.otherTraits,
                  {
                    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
                    name: clean,
                    dots,
                    kind,
                    ...(explicit?.category ? { category: explicit.category } : {}),
                  },
                ].slice(0, 50),
              }));
              if (!explicit) {
                setNewTraitName('');
              }
            };

            const renderEntryRow = (ot: SheetOtherTraitEntry, resolvedKind: OtherTraitKind) => {
              const tone =
                resolvedKind === 'merit'
                  ? 'emerald'
                  : resolvedKind === 'flaw'
                    ? 'crimson'
                    : 'amber';
              const rowClasses =
                resolvedKind === 'merit'
                  ? 'border-emerald-700/45 bg-emerald-950/20'
                  : resolvedKind === 'flaw'
                    ? 'border-rose-700/45 bg-rose-950/20'
                    : 'border-stone-800 bg-zinc-900/50';
              const badgeClasses =
                resolvedKind === 'merit'
                  ? 'border-emerald-500/45 bg-emerald-950/80 text-emerald-200'
                  : resolvedKind === 'flaw'
                    ? 'border-rose-500/45 bg-rose-950/80 text-rose-200'
                    : 'border-amber-500/35 bg-amber-950/60 text-amber-200';
              const badgeText =
                resolvedKind === 'merit'
                  ? `Merit • ${ot.dots}pt`
                  : resolvedKind === 'flaw'
                    ? `Flaw • ${ot.dots}pt`
                    : `Trait • ${ot.dots}`;

              return (
                <div
                  key={ot.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs ${rowClasses}`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-caption font-extrabold uppercase tracking-wider ${badgeClasses}`}
                    >
                      {badgeText}
                    </span>
                    <span className="truncate font-semibold text-stone-100">
                      {cleanOtherTraitDisplayName(ot.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <SheetPipTrack
                      label={cleanOtherTraitDisplayName(ot.name)}
                      value={ot.dots}
                      max={Math.max(5, ot.dots)}
                      shape="circle"
                      tone={tone}
                      isMobile={isMobile}
                      onChange={(val) =>
                        onUpdateSheet((prev) => ({
                          ...prev,
                          otherTraits: prev.otherTraits.map((item) =>
                            item.id === ot.id
                              ? { ...item, dots: Math.max(0, Math.min(10, val)) }
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
                          otherTraits: prev.otherTraits.filter((item) => item.id !== ot.id),
                        }))
                      }
                      className="text-stone-400 hover:text-red-300"
                      aria-label={`Remove ${ot.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            };

            const catalogForKind = W20_MERITS_FLAWS_CATALOG.filter(
              (m) => newTraitKind === 'other' || m.kind === newTraitKind
            );

            return (
              <section className="rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
                  <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                    Merits, Flaws &amp; Other Traits
                  </h3>
                  <div className="flex items-center gap-1.5 text-caption font-bold">
                    <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-emerald-300 border border-emerald-700/50">
                      {meritEntries.length} Merit{meritEntries.length === 1 ? '' : 's'}
                    </span>
                    <span className="rounded bg-rose-950/80 px-1.5 py-0.5 text-rose-300 border border-rose-700/50">
                      {flawEntries.length} Flaw{flawEntries.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Visually Separated Lists */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/10 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption font-extrabold uppercase tracking-wider text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Merits (Boons)</span>
                    </div>
                    {meritEntries.length === 0 ? (
                      <p className="text-xs text-stone-400">No Merits recorded.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {meritEntries.map((ot) => renderEntryRow(ot, 'merit'))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-rose-800/45 bg-rose-950/10 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption font-extrabold uppercase tracking-wider text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Flaws (Drawbacks)</span>
                    </div>
                    {flawEntries.length === 0 ? (
                      <p className="text-xs text-stone-400">No Flaws recorded.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {flawEntries.map((ot) => renderEntryRow(ot, 'flaw'))}
                      </div>
                    )}
                  </div>

                  {otherEntries.length > 0 && (
                    <div className="rounded-lg border border-stone-800 bg-zinc-900/40 p-2.5">
                      <div className="mb-1.5 text-caption font-extrabold uppercase tracking-wider text-amber-200">
                        Other Traits &amp; Lore
                      </div>
                      <div className="space-y-1.5">
                        {otherEntries.map((ot) => renderEntryRow(ot, 'other'))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Differentiated Free-Text + Preset Adder (Mobile & Desktop friendly) */}
                <div className="mt-3 space-y-2 rounded-lg border border-stone-800 bg-zinc-900/60 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      role="group"
                      aria-label="New Entry Classification"
                      className="grid grid-cols-3 gap-1 rounded-lg border border-stone-800 bg-zinc-950 p-0.5 text-caption font-bold"
                    >
                      <button
                        type="button"
                        onClick={() => setNewTraitKind('merit')}
                        className={`rounded-md px-2 py-1 transition ${
                          newTraitKind === 'merit'
                            ? 'bg-emerald-700/80 text-white'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        Merit
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTraitKind('flaw')}
                        className={`rounded-md px-2 py-1 transition ${
                          newTraitKind === 'flaw'
                            ? 'bg-rose-700/80 text-white'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        Flaw
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewTraitKind('other')}
                        className={`rounded-md px-2 py-1 transition ${
                          newTraitKind === 'other'
                            ? 'bg-amber-700/80 text-amber-50'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        Other
                      </button>
                    </div>

                    {newTraitKind !== 'other' && (
                      <button
                        type="button"
                        onClick={() => setShowPresetMeritsFlaws((v) => !v)}
                        className="text-caption font-semibold text-amber-300 underline decoration-amber-500/40 underline-offset-2 hover:text-amber-200"
                      >
                        {showPresetMeritsFlaws
                          ? 'Hide W20 Presets'
                          : `Browse W20 ${newTraitKind === 'merit' ? 'Merits' : 'Flaws'}`}
                      </button>
                    )}
                  </div>

                  {showPresetMeritsFlaws && newTraitKind !== 'other' && (
                    <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded border border-stone-800 bg-zinc-950/90 p-2">
                      {catalogForKind.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            addOtherTrait({
                              name: item.name,
                              kind: item.kind,
                              dots: item.pointValue,
                              category: item.category,
                            })
                          }
                          aria-label={item.summary}
                          title={item.summary}
                          className={`rounded border px-2 py-1 text-caption font-semibold transition ${
                            item.kind === 'merit'
                              ? 'border-emerald-800/60 bg-emerald-950/35 text-emerald-200 hover:border-emerald-400'
                              : 'border-rose-800/60 bg-rose-950/35 text-rose-200 hover:border-rose-400'
                          }`}
                        >
                          + {item.name} ({item.pointValue}pt)
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <input
                      type="text"
                      aria-label="New trait name"
                      maxLength={120}
                      value={newTraitName}
                      onChange={(e) => setNewTraitName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTraitName.trim()) {
                          e.preventDefault();
                          addOtherTrait();
                        }
                      }}
                      placeholder={
                        newTraitKind === 'merit'
                          ? 'Type Merit name...'
                          : newTraitKind === 'flaw'
                            ? 'Type Flaw name...'
                            : 'Type Other Trait or Lore...'
                      }
                      className="min-h-[40px] min-w-[140px] flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-stone-100 placeholder-stone-500"
                    />
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={newTraitDots}
                      onChange={(e) =>
                        setNewTraitDots(Math.max(1, Math.min(7, Number(e.target.value) || 1)))
                      }
                      aria-label="Points or Dots"
                      title="Points / Dots (1-7)"
                      className="min-h-[40px] w-14 rounded-lg border border-stone-700 bg-zinc-950 px-2 py-1 text-center font-mono text-xs text-stone-100"
                    />
                    <button
                      type="button"
                      onClick={() => addOtherTrait()}
                      className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-bold ${
                        newTraitKind === 'merit'
                          ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/50'
                          : newTraitKind === 'flaw'
                            ? 'border-rose-500/50 bg-rose-950/50 text-rose-200 hover:bg-rose-900/50'
                            : 'border-amber-500/45 bg-amber-950/40 text-amber-200 hover:bg-amber-900/45'
                      }`}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
};
