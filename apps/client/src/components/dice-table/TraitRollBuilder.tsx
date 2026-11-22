import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { W20UserCharacterSheet } from '@w20-vtt/core';
import { usePopoverDismiss } from '../ui/usePopoverDismiss';
import {
  Check,
  ChevronDown,
  Dices,
  Minus,
  Pin,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { formatFormName } from '../character-sheet/sheetShared';
import {
  COMPOSER_ABILITY_GROUPS,
  COMPOSER_ATTRIBUTE_GROUPS,
  type ComposerAttributeKey,
  getSheetAbilityOptions,
  getSheetTraitOptions,
  type ResolvedTraitRollSelection,
} from './traitRollMath';

export {
  type AbilityOptionItem,
  COMPOSER_ABILITY_GROUPS,
  COMPOSER_ATTRIBUTE_GROUPS,
  type ComposerAttributeKey,
  getSheetAbilityOptions,
  getSheetTraitOptions,
  type ResolvedTraitRollSelection,
  resolveTraitRollSelection,
  type RollSourceMode,
  type TraitGroupName,
  type TraitOptionItem,
} from './traitRollMath';

const QUICK_DIFFICULTIES = [3, 4, 5, 6, 7, 8, 9, 10] as const;

interface DifficultyQuickControlProps {
  difficulty: number;
  perceptionFormMod?: number;
  onChangeDifficulty: React.Dispatch<React.SetStateAction<number>>;
  compact?: boolean;
}

export const DifficultyQuickControl: React.FC<DifficultyQuickControlProps> = ({
  difficulty,
  perceptionFormMod = 0,
  onChangeDifficulty,
  compact = false,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement | null>(null);

  usePopoverDismiss({
    open: pickerOpen,
    onClose: () => setPickerOpen(false),
    containerRef: rootRef,
    triggerRef: pickerTriggerRef,
  });

  const formPerceptionDiff = Math.max(2, Math.min(10, 6 + perceptionFormMod));

  return (
    <div ref={rootRef} className="relative shrink-0">
      <div
        className={`flex items-center rounded-xl border border-stone-700/80 bg-zinc-950/90 ${
          compact ? 'h-[38px] gap-0.5 px-1' : 'h-9 gap-1 px-1.5'
        }`}
      >
        {!compact && (
          <span className="font-display pl-0.5 text-xs font-bold tracking-wider uppercase text-amber-200/75">
            Diff
          </span>
        )}
        <button
          type="button"
          onClick={() => onChangeDifficulty((d) => Math.max(2, d - 1))}
          aria-label="Decrease Difficulty"
          className={`flex items-center justify-center rounded-lg bg-zinc-900 text-stone-300 transition hover:bg-zinc-800 hover:text-amber-200 active:scale-95 ${
            compact ? 'h-7 w-6' : 'h-6 w-6'
          }`}
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          ref={pickerTriggerRef}
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-label={`Difficulty ${difficulty}. Open difficulty presets`}
          title="Difficulty presets"
          className={`font-display flex items-center justify-center rounded-lg px-1 text-center font-black transition hover:bg-zinc-900 ${
            difficulty !== 6 ? 'text-amber-300' : 'text-amber-100'
          } ${compact ? 'h-7 min-w-[30px] text-xs' : 'h-6 min-w-[26px] text-sm'}`}
        >
          {compact ? `D${difficulty}` : difficulty}
        </button>
        <button
          type="button"
          onClick={() => onChangeDifficulty((d) => Math.min(10, d + 1))}
          aria-label="Increase Difficulty"
          className={`flex items-center justify-center rounded-lg bg-zinc-900 text-stone-300 transition hover:bg-zinc-800 hover:text-amber-200 active:scale-95 ${
            compact ? 'h-7 w-6' : 'h-6 w-6'
          }`}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {pickerOpen && (
        <div
          role="dialog"
          aria-label="Difficulty presets"
          className="w20-obsidian-panel absolute right-0 bottom-full z-modal mb-2 w-max max-w-[90vw] rounded-xl p-2 shadow-2xl"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200/80">
              Target Difficulty
            </span>
            {perceptionFormMod !== 0 && (
              <button
                type="button"
                onClick={() => {
                  onChangeDifficulty(formPerceptionDiff);
                  setPickerOpen(false);
                }}
                className="rounded-md border border-emerald-500/45 bg-emerald-950/50 px-1.5 py-0.5 text-xs font-bold text-emerald-200 hover:border-emerald-400"
              >
                Form Per ({formPerceptionDiff})
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {QUICK_DIFFICULTIES.map((val) => {
              const active = difficulty === val;
              return (
                <button
                  key={val}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Difficulty ${val}`}
                  onClick={() => {
                    onChangeDifficulty(val);
                    setPickerOpen(false);
                    pickerTriggerRef.current?.focus();
                  }}
                  className={`h-7 min-w-[28px] rounded-lg border px-1.5 font-mono text-xs font-bold transition ${
                    active
                      ? 'border-amber-400/85 bg-red-950/80 text-amber-100 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                      : val === 6
                        ? 'border-amber-500/35 bg-zinc-900/90 text-amber-200 hover:border-amber-400'
                        : 'border-stone-800 bg-zinc-950/90 text-stone-300 hover:border-stone-600'
                  }`}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface DesktopTraitRollBarProps {
  sheet: W20UserCharacterSheet;
  composerAttr: ComposerAttributeKey | '';
  composerAbil: string;
  difficulty: number;
  selection: ResolvedTraitRollSelection;
  onChangeSelection: (attr: ComposerAttributeKey | '', abil: string) => void;
  onChangeDifficulty: React.Dispatch<React.SetStateAction<number>>;
}

export const DesktopTraitRollBar: React.FC<DesktopTraitRollBarProps> = ({
  sheet,
  composerAttr,
  composerAbil,
  difficulty,
  selection,
  onChangeSelection,
  onChangeDifficulty,
}) => {
  const [openPopover, setOpenPopover] = useState<'attr' | 'skill' | null>(null);
  const [abilQuery, setAbilQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const attrTriggerRef = useRef<HTMLButtonElement | null>(null);
  const skillTriggerRef = useRef<HTMLButtonElement | null>(null);

  const traitOptions = useMemo(() => getSheetTraitOptions(sheet), [sheet]);
  const abilityOptions = useMemo(() => getSheetAbilityOptions(sheet), [sheet]);

  usePopoverDismiss({
    open: openPopover !== null,
    onClose: () => setOpenPopover(null),
    containerRef,
    triggerRef: openPopover === 'skill' ? skillTriggerRef : attrTriggerRef,
  });

  useEffect(() => {
    setOpenPopover(null);
  }, [sheet.id]);

  const normalizedQuery = abilQuery.trim().toLowerCase();

  const filteredAbilities = useMemo(() => {
    if (!normalizedQuery) return abilityOptions;
    return abilityOptions.filter(
      (item) =>
        item.label.toLowerCase().includes(normalizedQuery) ||
        (item.specialty && item.specialty.toLowerCase().includes(normalizedQuery))
    );
  }, [abilityOptions, normalizedQuery]);

  const firstEnterMatch = useMemo(() => {
    if (filteredAbilities.length === 0) return null;
    const startsWithMatch = filteredAbilities.find((item) =>
      item.label.toLowerCase().startsWith(normalizedQuery)
    );
    return (
      filteredAbilities.find((item) => item.dots > 0 && item.label.toLowerCase().startsWith(normalizedQuery)) ??
      startsWithMatch ??
      filteredAbilities.find((item) => item.dots > 0) ??
      filteredAbilities[0]
    );
  }, [filteredAbilities, normalizedQuery]);

  const attrOpt = selection.attrOption;
  const abilOpt = selection.abilOption;

  const formPerceptionDiff = Math.max(2, Math.min(10, 6 + selection.perceptionFormMod));

  return (
    <div ref={containerRef} className="relative flex min-w-[430px] flex-1 items-center gap-2">
      {/* Attribute / Inner Trait Pill + Popover */}
      <div className="relative flex min-w-[130px] flex-1 items-center rounded-xl border border-stone-700/80 bg-zinc-950/90 transition hover:border-amber-500/55">
        <button
          type="button"
          ref={attrTriggerRef}
          onClick={() => setOpenPopover((prev) => (prev === 'attr' ? null : 'attr'))}
          aria-expanded={openPopover === 'attr'}
          aria-haspopup="dialog"
          title="Choose Attribute or Inner Trait from your character sheet"
          className={`flex h-9 min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left transition ${
            openPopover === 'attr' ? 'text-amber-100' : 'text-stone-100'
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-display shrink-0 text-xs font-bold tracking-wider uppercase text-amber-300/75">
              Attr
            </span>
            {attrOpt ? (
              <>
                <span className="truncate text-xs font-bold text-amber-50">
                  {attrOpt.label}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-amber-500/40 bg-amber-950/60 px-1.5 py-0.5 font-mono text-xs font-black text-amber-200">
                  {attrOpt.effectiveDots}
                  {attrOpt.formDelta !== 0 && (
                    <span
                      className={
                        attrOpt.formDelta > 0 ? 'text-emerald-300' : 'text-rose-300'
                      }
                    >
                      ({attrOpt.formDelta > 0 ? `+${attrOpt.formDelta}` : attrOpt.formDelta})
                    </span>
                  )}
                </span>
                {attrOpt.specialty && (
                  <Sparkles
                    className="h-3 w-3 shrink-0 text-amber-400"
                    aria-label={`Specialty: ${attrOpt.specialty}`}
                  />
                )}
              </>
            ) : (
              <span className="truncate text-xs font-semibold text-stone-400">+ Attribute</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-400" />
        </button>

        {composerAttr !== '' && composerAbil !== '' && (
          <button
            type="button"
            onClick={() => onChangeSelection('', composerAbil)}
            aria-label="Clear Attribute"
            title="Clear Attribute (roll Skill alone)"
            className="mr-1 flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-zinc-900 hover:text-stone-200"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {openPopover === 'attr' && (
          <div
            role="dialog"
            aria-label="Choose an Attribute or Inner Trait"
            className="w20-obsidian-panel absolute bottom-full left-0 z-modal mb-2 w-[min(92vw,560px)] rounded-2xl p-3 shadow-2xl"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
                  Attribute or Inner Trait
                </span>
                <span className="rounded-md border border-red-800/50 bg-red-950/70 px-1.5 py-0.5 font-display text-xs font-bold uppercase text-amber-200">
                  Form: {formatFormName(sheet.activeForm)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onChangeSelection('', composerAbil);
                  setOpenPopover(null);
                }}
                className={`rounded-lg border px-2 py-1 text-xs font-bold transition ${
                  composerAttr === ''
                    ? 'border-amber-400/80 bg-amber-950/50 text-amber-100'
                    : 'border-stone-700/80 bg-zinc-900/90 text-stone-300 hover:border-stone-500'
                }`}
              >
                None (Skill Only)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {COMPOSER_ATTRIBUTE_GROUPS.map((grp) => {
                const groupItems = traitOptions.filter((t) => t.group === grp.group);
                return (
                  <div key={grp.group} className="space-y-1">
                    <div className="font-display border-b border-amber-500/20 pb-0.5 text-xs font-bold tracking-wider uppercase text-amber-300/80">
                      {grp.group}
                    </div>
                    <div className="space-y-1">
                      {groupItems.map((item) => {
                        const selected = composerAttr === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              onChangeSelection(item.key, composerAbil);
                              setOpenPopover(null);
                            }}
                            title={
                              item.specialty
                                ? `${item.label} (${item.effectiveDots}) — Specialty: ${item.specialty}`
                                : `${item.label} (${item.effectiveDots})`
                            }
                            className={`flex w-full items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                              selected
                                ? 'border-amber-400/85 bg-red-950/70 text-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                                : 'border-stone-800/90 bg-zinc-950/85 text-stone-200 hover:border-amber-500/45 hover:bg-zinc-900'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-1 truncate font-semibold">
                              <span className="truncate">{item.label}</span>
                              {item.specialty && (
                                <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5 font-mono text-xs font-bold">
                              <span className="text-amber-300">{item.effectiveDots}</span>
                              {item.formDelta !== 0 && (
                                <span
                                  className={`text-xs ${
                                    item.formDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {item.formDelta > 0 ? `+${item.formDelta}` : item.formDelta}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <span className="font-display shrink-0 text-xs font-black text-amber-400/75">+</span>

      {/* Skill / Ability Pill + Searchable Popover */}
      <div className="relative flex min-w-[150px] flex-1 items-center rounded-xl border border-stone-700/80 bg-zinc-950/90 transition hover:border-amber-500/55">
        <button
          type="button"
          onClick={() => {
            setAbilQuery('');
            setOpenPopover((prev) => (prev === 'skill' ? null : 'skill'));
          }}
          ref={skillTriggerRef}
          aria-expanded={openPopover === 'skill'}
          aria-haspopup="dialog"
          title="Choose Talent, Skill, or Knowledge from your character sheet"
          className={`flex h-9 min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left transition ${
            openPopover === 'skill' ? 'text-amber-100' : 'text-stone-100'
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-display shrink-0 text-xs font-bold tracking-wider uppercase text-amber-300/75">
              Skill
            </span>
            {abilOpt ? (
              <>
                <span className="truncate text-xs font-bold text-amber-50">
                  {abilOpt.label}
                </span>
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-xs font-black ${
                    abilOpt.dots > 0
                      ? 'border-amber-500/40 bg-amber-950/60 text-amber-200'
                      : 'border-stone-700 bg-zinc-900 text-stone-400'
                  }`}
                >
                  {abilOpt.dots}
                </span>
                {abilOpt.specialty && (
                  <Sparkles
                    className="h-3 w-3 shrink-0 text-amber-400"
                    aria-label={`Specialty: ${abilOpt.specialty}`}
                  />
                )}
              </>
            ) : (
              <span className="truncate text-xs font-semibold text-stone-400">+ Skill / Ability</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-400" />
        </button>

        {composerAbil !== '' && (
          <button
            type="button"
            onClick={() => onChangeSelection(composerAttr, '')}
            aria-label="Clear Skill or Ability"
            title="Clear Skill (roll pure Attribute / Inner Trait)"
            className="mr-1 flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-zinc-900 hover:text-stone-200"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {openPopover === 'skill' && (
          <div
            role="dialog"
            aria-label="Choose a Skill or Ability"
            className="w20-obsidian-panel absolute bottom-full left-0 z-modal mb-2 w-[min(94vw,660px)] rounded-2xl p-3 shadow-2xl"
          >
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={abilQuery}
                  autoFocus
                  onChange={(e) => setAbilQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && firstEnterMatch) {
                      e.preventDefault();
                      onChangeSelection(composerAttr, firstEnterMatch.key);
                      setOpenPopover(null);
                      setAbilQuery('');
                    }
                  }}
                  aria-label="Filter abilities"
                  placeholder="Type to filter Abilities (e.g. Firearms, Alertness)..."
                  className="h-8 w-full rounded-xl border border-stone-700/80 bg-zinc-950/95 pr-2.5 pl-8 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  onChangeSelection(composerAttr, '');
                  setOpenPopover(null);
                  setAbilQuery('');
                }}
                className={`h-8 shrink-0 rounded-xl border px-2.5 text-xs font-bold transition ${
                  composerAbil === ''
                    ? 'border-amber-400/80 bg-amber-950/50 text-amber-100'
                    : 'border-stone-700/80 bg-zinc-900/90 text-stone-300 hover:border-stone-500'
                }`}
              >
                None (Pure Trait)
              </button>
            </div>

            <div className="max-h-[min(56vh,360px)] space-y-3 overflow-y-auto pr-1">
              {filteredAbilities.length === 0 ? (
                <p className="py-4 text-center text-xs text-stone-400">
                  No Abilities matching &ldquo;{abilQuery.trim()}&rdquo;
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {COMPOSER_ABILITY_GROUPS.map((grp) => {
                      const items = filteredAbilities.filter((a) => a.category === grp.category);
                      if (items.length === 0) return null;
                      return (
                        <div key={grp.group} className="space-y-1">
                          <div className="font-display border-b border-amber-500/20 pb-0.5 text-xs font-bold tracking-wider uppercase text-amber-300/80">
                            {grp.group}
                          </div>
                          <div className="space-y-1">
                            {items.map((item) => {
                              const selected = composerAbil === item.key;
                              const trained = item.dots > 0;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => {
                                    onChangeSelection(composerAttr, item.key);
                                    setOpenPopover(null);
                                    setAbilQuery('');
                                  }}
                                  title={
                                    item.specialty
                                      ? `${item.label} (${item.dots}) — Specialty: ${item.specialty}`
                                      : `${item.label} (${item.dots})`
                                  }
                                  className={`flex w-full items-center justify-between gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition ${
                                    selected
                                      ? 'border-amber-400/85 bg-red-950/75 text-amber-50 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                                      : trained
                                        ? 'border-amber-500/30 bg-zinc-900/95 text-amber-50 hover:border-amber-400/70'
                                        : 'border-stone-800/75 bg-zinc-950/80 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                                  }`}
                                >
                                  <span className="flex min-w-0 items-center gap-1 truncate font-medium">
                                    <span className="truncate">{item.label}</span>
                                    {item.specialty && (
                                      <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                                    )}
                                  </span>
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                                      trained
                                        ? 'bg-amber-950/80 text-amber-300'
                                        : 'text-stone-400'
                                    }`}
                                  >
                                    {item.dots}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredAbilities.some((a) => a.category === 'custom') && (
                    <div className="space-y-1">
                      <div className="font-display border-b border-amber-500/20 pb-0.5 text-xs font-bold tracking-wider uppercase text-amber-300/80">
                        Custom Abilities
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {filteredAbilities
                          .filter((a) => a.category === 'custom')
                          .map((item) => {
                            const selected = composerAbil === item.key;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  onChangeSelection(composerAttr, item.key);
                                  setOpenPopover(null);
                                  setAbilQuery('');
                                }}
                                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                                  selected
                                    ? 'border-amber-400/85 bg-red-950/75 text-amber-50'
                                    : 'border-amber-500/30 bg-zinc-900/95 text-amber-100 hover:border-amber-400/70'
                                }`}
                              >
                                <span className="font-semibold">{item.label}</span>
                                {item.specialty && (
                                  <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                                )}
                                <span className="font-mono text-xs font-bold text-amber-300">
                                  {item.dots}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Difficulty Selector Right Next to Traits */}
      <DifficultyQuickControl
        difficulty={difficulty}
        perceptionFormMod={selection.perceptionFormMod}
        onChangeDifficulty={onChangeDifficulty}
      />

      {/* Live Derived Formula & Specialty Readout */}
      {selection.hasSelection && (
        <div className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-stone-800/90 bg-zinc-950/80 px-2.5 py-1.5 @min-[1150px]:flex">
          <span
            className="font-mono text-xs text-stone-300"
            title={selection.formulaSummary}
          >
            {selection.compactFormula} ={' '}
            <strong
              className={
                selection.effectivePool <= 0 ? 'text-red-400' : 'text-amber-300'
              }
            >
              {selection.effectivePool}d10
            </strong>
          </span>
          {selection.effectiveHasSpecialty && (
            <span
              title={selection.specialtyReason ?? 'Specialty active (10s explode)'}
              className="flex items-center gap-0.5 rounded bg-amber-950/80 px-1 py-0.5 text-xs font-bold text-amber-300"
            >
              <Sparkles className="h-2.5 w-2.5" />
              Spec
            </span>
          )}
          {selection.untrainedHint && (
            <span
              title={selection.untrainedHint}
              className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-xs text-stone-400"
            >
              0-dot
            </span>
          )}
          {selection.perceptionFormMod !== 0 && selection.difficulty === 6 && (
            <button
              type="button"
              onClick={() => onChangeDifficulty(formPerceptionDiff)}
              title={`In ${formatFormName(sheet.activeForm)}, Perception Difficulty is ${selection.perceptionFormMod} (Diff ${formPerceptionDiff}). Click to apply.`}
              className="rounded border border-emerald-500/40 bg-emerald-950/45 px-1 py-0.5 font-mono text-xs font-bold text-emerald-300 hover:border-emerald-400"
            >
              Per {selection.perceptionFormMod}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface MobileTraitPickerContentProps {
  sheet: W20UserCharacterSheet;
  composerAttr: ComposerAttributeKey | '';
  composerAbil: string;
  difficulty: number;
  selection: ResolvedTraitRollSelection;
  initialTab: 'attr' | 'skill';
  isDisabled: boolean;
  isThrowing: boolean;
  rageDiceCount: number;
  onChangeSelection: (attr: ComposerAttributeKey | '', abil: string) => void;
  onChangeDifficulty: React.Dispatch<React.SetStateAction<number>>;
  onPinShortcut: () => void;
  onExecuteRoll: () => void;
  onDone: () => void;
}

type SkillCategoryFilter = 'all' | 'trained' | 'talents' | 'skills' | 'knowledges' | 'custom';

export const MobileTraitPickerContent: React.FC<MobileTraitPickerContentProps> = ({
  sheet,
  composerAttr,
  composerAbil,
  difficulty,
  selection,
  initialTab,
  isDisabled,
  isThrowing,
  rageDiceCount,
  onChangeSelection,
  onChangeDifficulty,
  onPinShortcut,
  onExecuteRoll,
  onDone,
}) => {
  const [tab, setTab] = useState<'attr' | 'skill'>(initialTab);
  const [skillFilter, setSkillFilter] = useState<SkillCategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [pinnedFlash, setPinnedFlash] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const traitOptions = useMemo(() => getSheetTraitOptions(sheet), [sheet]);
  const abilityOptions = useMemo(() => getSheetAbilityOptions(sheet), [sheet]);

  const filteredAbilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return abilityOptions.filter((item) => {
      if (skillFilter === 'trained' && item.dots <= 0) return false;
      if (
        skillFilter !== 'all' &&
        skillFilter !== 'trained' &&
        item.category !== skillFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        (item.specialty && item.specialty.toLowerCase().includes(q))
      );
    });
  }, [abilityOptions, skillFilter, query]);

  const handlePinClick = () => {
    if (!selection.hasSelection) return;
    onPinShortcut();
    setPinnedFlash(true);
    window.setTimeout(() => setPinnedFlash(false), 1400);
  };

  const clampedRage = Math.min(selection.effectivePool, rageDiceCount);
  const formPerceptionDiff = Math.max(2, Math.min(10, 6 + selection.perceptionFormMod));

  return (
    <div className="space-y-3">
      {/* Live Formula Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-zinc-950/90 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-bold text-amber-100">
            {selection.hasSelection ? selection.autoLabel : 'Pick Attribute & Skill'}
          </span>
          <span
            className={`shrink-0 font-mono text-xs font-black ${
              selection.effectivePool <= 0 ? 'text-red-400' : 'text-amber-300'
            }`}
          >
            {selection.effectivePool}d10 • Diff {difficulty}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
          <span className="font-mono">{selection.formulaSummary}</span>
          {selection.effectiveHasSpecialty && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-950/80 px-1.5 py-0.5 text-xs font-bold text-amber-300">
              <Sparkles className="h-2.5 w-2.5" />
              Spec
            </span>
          )}
          {selection.effectiveApplyWounds && selection.woundPenalty !== 0 && (
            <span className="rounded bg-red-950/80 px-1.5 py-0.5 font-mono text-xs font-bold text-red-300">
              {selection.woundPenalty} Wnd
            </span>
          )}
          {selection.perceptionFormMod !== 0 && difficulty === 6 && (
            <button
              type="button"
              onClick={() => onChangeDifficulty(formPerceptionDiff)}
              className="rounded border border-emerald-500/45 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-300"
            >
              Apply Form Per ({formPerceptionDiff})
            </button>
          )}
        </div>
      </div>

      {/* 2-Tab Switcher */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-stone-800 bg-zinc-950 p-1">
        <button
          type="button"
          onClick={() => setTab('attr')}
          className={`min-h-[38px] rounded-lg px-2 text-xs font-bold transition ${
            tab === 'attr'
              ? 'bg-red-950/80 text-amber-100 ring-1 ring-amber-400/50'
              : 'text-stone-400'
          }`}
        >
          1. Attr:{' '}
          <span className="text-amber-300">
            {selection.attrOption
              ? `${selection.attrOption.shortLabel} (${selection.attrOption.effectiveDots})`
              : 'None'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('skill')}
          className={`min-h-[38px] rounded-lg px-2 text-xs font-bold transition ${
            tab === 'skill'
              ? 'bg-red-950/80 text-amber-100 ring-1 ring-amber-400/50'
              : 'text-stone-400'
          }`}
        >
          2. Skill:{' '}
          <span className="text-amber-300">
            {selection.abilOption
              ? `${selection.abilOption.label} (${selection.abilOption.dots})`
              : 'None'}
          </span>
        </button>
      </div>

      {tab === 'attr' ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              onChangeSelection('', composerAbil);
              setTab('skill');
            }}
            className={`min-h-[38px] w-full rounded-xl border px-3 text-xs font-bold ${
              composerAttr === ''
                ? 'border-amber-400/80 bg-amber-950/50 text-amber-100'
                : 'border-stone-800 bg-zinc-950 text-stone-300'
            }`}
          >
            None (Skill / Ability Only)
          </button>

          {COMPOSER_ATTRIBUTE_GROUPS.map((grp) => {
            const items = traitOptions.filter((t) => t.group === grp.group);
            return (
              <div key={grp.group} className="space-y-1.5">
                <span className="font-display block text-xs font-bold tracking-wider uppercase text-amber-300/80">
                  {grp.group}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {items.map((item) => {
                    const active = composerAttr === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          onChangeSelection(item.key, composerAbil);
                          setTab('skill');
                        }}
                        className={`flex min-h-[42px] flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left transition active:scale-95 ${
                          active
                            ? 'border-amber-400/85 bg-red-950/75 text-amber-50'
                            : 'border-stone-800 bg-zinc-950/90 text-stone-200'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <span className="truncate text-xs font-bold">{item.shortLabel}</span>
                          <span className="font-mono text-xs font-black text-amber-300">
                            {item.effectiveDots}
                          </span>
                        </div>
                        {item.specialty && (
                          <span className="mt-0.5 flex items-center gap-0.5 truncate text-xs text-amber-400">
                            <Sparkles className="h-2.5 w-2.5 shrink-0" />
                            Spec
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Search Input (NO autoFocus on mobile to avoid keyboard jump) */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter skills & abilities..."
              className="min-h-[38px] w-full rounded-xl border border-stone-700/80 bg-zinc-950/90 pr-8 pl-8 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear filter"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
            {(
              [
                ['all', 'All'],
                ['trained', 'Trained'],
                ['talents', 'Talents'],
                ['skills', 'Skills'],
                ['knowledges', 'Knowledges'],
                ...(sheet.customAbilities.length > 0 ? [['custom', 'Custom']] : []),
              ] as Array<[SkillCategoryFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSkillFilter(key)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${
                  skillFilter === key
                    ? 'border-amber-400/80 bg-amber-950/60 text-amber-100'
                    : 'border-stone-800 bg-zinc-950 text-stone-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChangeSelection(composerAttr, '')}
            className={`min-h-[38px] w-full rounded-xl border px-3 text-xs font-bold ${
              composerAbil === ''
                ? 'border-amber-400/80 bg-amber-950/50 text-amber-100'
                : 'border-stone-800 bg-zinc-950 text-stone-300'
            }`}
          >
            None (Pure Attribute / Trait Roll)
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            {filteredAbilities.map((item) => {
              const active = composerAbil === item.key;
              const trained = item.dots > 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChangeSelection(composerAttr, item.key)}
                  className={`flex min-h-[42px] items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-left transition active:scale-95 ${
                    active
                      ? 'border-amber-400/85 bg-red-950/75 text-amber-50'
                      : trained
                        ? 'border-amber-500/35 bg-zinc-900/95 text-amber-50'
                        : 'border-stone-800/80 bg-zinc-950/85 text-stone-400'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold">
                    <span className="truncate">{item.label}</span>
                    {item.specialty && (
                      <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                      trained ? 'bg-amber-950/80 text-amber-300' : 'text-stone-400'
                    }`}
                  >
                    {item.dots}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sticky Footer Row */}
      <div className="w20-gold-divider" />
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <div className="flex items-center gap-1 rounded-xl border border-stone-700/80 bg-zinc-950 px-1.5 py-1">
          <span className="font-display pl-1 text-xs font-bold uppercase text-stone-400">
            Diff
          </span>
          <button
            type="button"
            onClick={() => onChangeDifficulty((d) => Math.max(2, d - 1))}
            aria-label="Decrease Difficulty"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="font-display min-w-[24px] text-center text-sm font-black text-amber-300">
            {difficulty}
          </span>
          <button
            type="button"
            onClick={() => onChangeDifficulty((d) => Math.min(10, d + 1))}
            aria-label="Increase Difficulty"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          disabled={!selection.hasSelection}
          onClick={handlePinClick}
          className="flex min-h-[42px] items-center justify-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/35 px-3 text-xs font-bold text-amber-200 disabled:opacity-40"
        >
          {pinnedFlash ? (
            <Check className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
          {pinnedFlash ? 'Pinned' : 'Pin'}
        </button>

        <button
          type="button"
          disabled={isDisabled || !selection.hasSelection || selection.basePool <= 0}
          onClick={() => {
            onDone();
            onExecuteRoll();
          }}
          className="w20-crimson-seal font-display flex min-h-[42px] min-w-[110px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black tracking-wider uppercase text-amber-50 disabled:opacity-50"
        >
          <Dices className="h-4 w-4 shrink-0" />
          {isThrowing
            ? 'Casting...'
            : !selection.hasSelection
              ? 'Pick a trait'
              : `Roll ${selection.effectivePool}d10${clampedRage > 0 ? ` (${clampedRage}R)` : ''}`}
        </button>

        <button
          type="button"
          onClick={onDone}
          className="min-h-[42px] rounded-xl border border-stone-700/80 bg-zinc-950 px-3 text-xs font-bold text-stone-300"
        >
          Done
        </button>
      </div>
    </div>
  );
};
