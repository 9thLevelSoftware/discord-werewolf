import React, { useEffect, useMemo, useState } from 'react';
import {
  type AttributeKey,
  type CanonicalAbilityKey,
  computeUserSheetStats,
  type GarouForm,
  type ResolvedSheetShortcut,
  resolveSheetShortcut,
  type SheetShortcut,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { LightGarouTrackers, TableParticipant } from '@w20-vtt/protocol';
import { BookmarkPlus, Check, EyeOff, Pin, Sparkles, X } from 'lucide-react';
import { create } from 'zustand';
import type { DiceSoundPreferences } from '../../audio/DiceSoundEngine';
import type { DiscordSessionContext } from '../../discordBootstrap';
import type { ViewportLayoutMode } from '../../hooks/useViewportLayout';
import type { LocalTableSeat } from '../../store/useCharacterSheetStore';
import type { ConnectionStatus, Queued3DRoll } from '../../store/useVttRoomStore';
import { formatTraitName } from '../character-sheet/sheetShared';

export interface QuickRollPreset {
  id: string;
  name: string;
  pool: number;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  isSecretRoll: boolean;
}

export type ComposerAttributeKey = AttributeKey | 'rage' | 'gnosis' | 'willpower';

export const POOL_QUICK_JUMPS = [3, 5, 7, 10, 12] as const;

export const COMPOSER_ATTRIBUTE_GROUPS: ReadonlyArray<{
  group: string;
  keys: readonly ComposerAttributeKey[];
}> = [
  { group: 'Physical', keys: ['strength', 'dexterity', 'stamina'] },
  { group: 'Social', keys: ['charisma', 'manipulation', 'appearance'] },
  { group: 'Mental', keys: ['perception', 'intelligence', 'wits'] },
  { group: 'Inner Traits', keys: ['rage', 'gnosis', 'willpower'] },
];

export const COMPOSER_ABILITY_GROUPS: ReadonlyArray<{
  group: string;
  keys: readonly CanonicalAbilityKey[];
}> = [
  {
    group: 'Talents',
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

export interface DiceTableHudProps {
  session: DiscordSessionContext;
  connectionStatus: ConnectionStatus;
  lastError: { code: string; message: string } | null;
  webglReady: boolean;
  sortedParticipants: TableParticipant[];
  speakingDiscordIds: Set<string>;
  seats: LocalTableSeat[];
  activeSeat: LocalTableSeat;
  activeSheet: W20UserCharacterSheet | null;
  sheetsById: Record<string, W20UserCharacterSheet>;
  activeTrackers: LightGarouTrackers;
  rollHistoryCount: number;
  feedOpen: boolean;
  hasDiceOnTable: boolean;
  activeBanner: Queued3DRoll | null;
  sfxPrefs: DiceSoundPreferences;
  layoutMode: ViewportLayoutMode;
  pool: number;
  editingPool: boolean;
  poolInputValue: string;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  spendWillpower: boolean;
  applyWoundPenalty: boolean;
  isSecretRoll: boolean;
  rollLabel: string;
  manualControlsOpen: boolean;
  isThrowing: boolean;
  effectivePreviewPool: number;
  clampedPreviewRage: number;
  obsidianPreviewCount: number;
  activeModifierCount: number;
  composerAttr: ComposerAttributeKey | '';
  composerAbil: string;
  onCycleLayoutMode: () => void;
  onToggleFeed: () => void;
  onCloseFeed: () => void;
  onClearTable: () => void;
  onDismissBanner: () => void;
  onToggleMuteSfx: () => void;
  onSfxVolumeChange: (pct: number) => void;
  onUpdateTrackers: (patch: Partial<LightGarouTrackers>) => void;
  onSelectSeat: (seatId: string) => void;
  onAddSeatAndOpenRoster: () => void;
  onOpenRoster: () => void;
  onOpenSheet: () => void;
  onSetActiveSheetForm: (form: GarouForm) => void;
  onSetPool: React.Dispatch<React.SetStateAction<number>>;
  onSetEditingPool: (editing: boolean) => void;
  onSetPoolInputValue: (val: string) => void;
  onCommitPoolInput: () => void;
  onSetRageDiceCount: React.Dispatch<React.SetStateAction<number>>;
  onSetDifficulty: React.Dispatch<React.SetStateAction<number>>;
  onToggleSpecialty: () => void;
  onToggleSpendWillpower: () => void;
  onToggleApplyWoundPenalty: () => void;
  onToggleSecretRoll: () => void;
  onSetRollLabel: (label: string) => void;
  onSetManualControlsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onExecuteRoll: () => void;
  onTriggerPreset: (preset: QuickRollPreset) => void;
  onTriggerResolvedShortcut: (resolved: ResolvedSheetShortcut) => void;
  onRemoveSheetShortcut: (shortcutId: string) => void;
  onComposerChange: (attr: ComposerAttributeKey | '', abil: string) => void;
  onPinComposerShortcut: () => void;
  onPinCurrentToSheet: () => void;
  onSaveCurrentUnboundPreset: () => void;
}

const DEFAULT_QUICK_ROLLS: QuickRollPreset[] = [
  {
    id: 'starter-claw-strike',
    name: 'Claw Strike',
    pool: 7,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: true,
    isSecretRoll: false,
  },
  {
    id: 'starter-perception',
    name: 'Perception + Alertness',
    pool: 6,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: false,
    isSecretRoll: false,
  },
  {
    id: 'starter-step-sideways',
    name: 'Step Sideways',
    pool: 4,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: false,
    isSecretRoll: false,
  },
];

function getStorageKey(userId: string, seatId: string): string {
  return `w20-quick-rolls:v1:${userId}:${seatId}`;
}

function getLegacyStorageKey(userId: string): string {
  return `w20-quick-rolls:v1:${userId}`;
}

function isValidPreset(item: unknown): item is QuickRollPreset {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.pool === 'number' &&
    typeof candidate.rageDiceCount === 'number' &&
    typeof candidate.difficulty === 'number' &&
    typeof candidate.hasSpecialty === 'boolean' &&
    typeof candidate.isSecretRoll === 'boolean'
  );
}

function loadPresetsFromStorage(userId: string, seatId: string): QuickRollPreset[] {
  if (typeof window === 'undefined') return DEFAULT_QUICK_ROLLS;
  const storageKey = getStorageKey(userId, seatId);
  try {
    let raw = window.localStorage.getItem(storageKey);
    if (raw === null && seatId === 'primary') {
      raw = window.localStorage.getItem(getLegacyStorageKey(userId));
    }
    if (raw === null) {
      window.localStorage.setItem(storageKey, JSON.stringify(DEFAULT_QUICK_ROLLS));
      return DEFAULT_QUICK_ROLLS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isValidPreset);
      window.localStorage.setItem(storageKey, JSON.stringify(valid));
      return valid;
    }
  } catch {
    // Ignore localStorage access errors in restricted iframe environments
  }
  return DEFAULT_QUICK_ROLLS;
}

function persistPresetsToStorage(userId: string, seatId: string, presets: QuickRollPreset[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(userId, seatId), JSON.stringify(presets));
  } catch {
    // Ignore storage write failures
  }
}

interface UnboundQuickRollStore {
  byKey: Record<string, QuickRollPreset[]>;
  ensureLoaded: (userId: string, seatId: string) => QuickRollPreset[];
  addPreset: (userId: string, seatId: string, preset: Omit<QuickRollPreset, 'id'>) => void;
  removePreset: (userId: string, seatId: string, id: string) => void;
}

export const useUnboundQuickRollStore = create<UnboundQuickRollStore>()((set, get) => ({
  byKey: {},
  ensureLoaded: (userId, seatId) => {
    const key = getStorageKey(userId, seatId);
    const existing = get().byKey[key];
    if (existing) return existing;
    const loaded = loadPresetsFromStorage(userId, seatId);
    set((state) => ({
      byKey: { ...state.byKey, [key]: loaded },
    }));
    return loaded;
  },
  addPreset: (userId, seatId, presetInput) => {
    const key = getStorageKey(userId, seatId);
    const current = get().byKey[key] ?? loadPresetsFromStorage(userId, seatId);
    const nextPreset: QuickRollPreset = {
      ...presetInput,
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: presetInput.name.trim().slice(0, 32) || `Pool ${presetInput.pool}d10`,
    };
    const updated = [...current, nextPreset];
    persistPresetsToStorage(userId, seatId, updated);
    set((state) => ({
      byKey: { ...state.byKey, [key]: updated },
    }));
  },
  removePreset: (userId, seatId, id) => {
    const key = getStorageKey(userId, seatId);
    const current = get().byKey[key] ?? loadPresetsFromStorage(userId, seatId);
    const updated = current.filter((item) => item.id !== id);
    persistPresetsToStorage(userId, seatId, updated);
    set((state) => ({
      byKey: { ...state.byKey, [key]: updated },
    }));
  },
}));

export function resolveComposerSelection(
  sheet: W20UserCharacterSheet,
  attr: ComposerAttributeKey | '',
  abil: string
): {
  label: string;
  resolved: ResolvedSheetShortcut | null;
} {
  if (!attr && !abil) {
    return { label: '', resolved: null };
  }
  const parts: string[] = [];
  if (attr) parts.push(formatTraitName(attr));
  if (abil) {
    const custom = sheet.customAbilities.find((c) => c.id === abil);
    parts.push(custom ? custom.name : formatTraitName(abil));
  }
  const label = parts.join(' + ');
  const synthetic: SheetShortcut = {
    id: 'composer-preview',
    name: label,
    source: {
      kind: 'trait_combo',
      attribute: attr || null,
      ability: abil || null,
      useFormStats: true,
      applyPerceptionFormDiff: attr === 'perception',
    },
    difficulty: 6,
    rageDiceCount: 0,
    applyWoundPenalty: true,
    isSecretRoll: false,
  };
  return {
    label,
    resolved: resolveSheetShortcut(sheet, synthetic),
  };
}

interface TraitPairQuickComposerProps {
  activeSheet: W20UserCharacterSheet;
  composerAttr: ComposerAttributeKey | '';
  composerAbil: string;
  compact?: boolean;
  onChange: (attr: ComposerAttributeKey | '', abil: string) => void;
  onPinShortcut: () => void;
}

export const TraitPairQuickComposer: React.FC<TraitPairQuickComposerProps> = ({
  activeSheet,
  composerAttr,
  composerAbil,
  compact = false,
  onChange,
  onPinShortcut,
}) => {
  const [pinnedFlash, setPinnedFlash] = useState(false);

  const preview = useMemo(
    () => resolveComposerSelection(activeSheet, composerAttr, composerAbil),
    [activeSheet, composerAttr, composerAbil]
  );

  const stats = useMemo(() => computeUserSheetStats(activeSheet), [activeSheet]);

  const handlePin = () => {
    if (!composerAttr && !composerAbil) return;
    onPinShortcut();
    setPinnedFlash(true);
    window.setTimeout(() => setPinnedFlash(false), 1400);
  };

  return (
    <div
      className={`rounded-xl border border-amber-500/25 bg-zinc-950/75 ${
        compact ? 'space-y-2 p-2.5' : 'flex flex-wrap items-center gap-2 px-2.5 py-2'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display shrink-0 text-[10px] font-bold tracking-wider uppercase text-amber-200/85">
          Trait Pair
        </span>
        {compact && preview.resolved && (
          <span className="font-mono text-[10px] text-amber-300">
            {preview.resolved.formulaSummary}
          </span>
        )}
      </div>

      <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex min-w-0 flex-1 flex-wrap items-center gap-1.5'}>
        <select
          value={composerAttr}
          onChange={(e) => onChange(e.target.value as ComposerAttributeKey | '', composerAbil)}
          aria-label="Select Attribute or Inner Trait"
          className={`rounded-lg border border-stone-700/80 bg-zinc-900/95 px-2 text-xs text-stone-100 focus:border-amber-400/75 focus:outline-none ${
            compact ? 'min-h-[38px] w-full py-1.5' : 'h-7 max-w-[165px] py-0.5 text-[11px]'
          }`}
        >
          <option value="">Attribute (None)</option>
          {COMPOSER_ATTRIBUTE_GROUPS.map((grp) => (
            <optgroup key={grp.group} label={grp.group}>
              {grp.keys.map((key) => {
                const dots =
                  key === 'rage'
                    ? activeSheet.rage.permanent
                    : key === 'gnosis'
                      ? stats.effectiveGnosisPool
                      : key === 'willpower'
                        ? activeSheet.willpower.permanent
                        : stats.effectiveAttributes[key];
                return (
                  <option key={key} value={key}>
                    {formatTraitName(key)} ({dots})
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>

        <select
          value={composerAbil}
          onChange={(e) => onChange(composerAttr, e.target.value)}
          aria-label="Select Ability"
          className={`rounded-lg border border-stone-700/80 bg-zinc-900/95 px-2 text-xs text-stone-100 focus:border-amber-400/75 focus:outline-none ${
            compact ? 'min-h-[38px] w-full py-1.5' : 'h-7 max-w-[180px] py-0.5 text-[11px]'
          }`}
        >
          <option value="">Ability (None)</option>
          {COMPOSER_ABILITY_GROUPS.map((grp) => (
            <optgroup key={grp.group} label={grp.group}>
              {grp.keys.map((key) => (
                <option key={key} value={key}>
                  {formatTraitName(key)} ({activeSheet.abilities[key] ?? 0})
                </option>
              ))}
            </optgroup>
          ))}
          {activeSheet.customAbilities.length > 0 && (
            <optgroup label="Custom Abilities">
              {activeSheet.customAbilities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.dots})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {!compact && preview.resolved && (
        <span className="font-mono text-[10px] text-amber-200/85">
          {preview.resolved.formulaSummary} ={' '}
          <strong className="text-amber-300">{preview.resolved.effectivePool}d10</strong>
          {preview.resolved.hasSpecialty ? ' • Spec' : ''}
        </span>
      )}

      <button
        type="button"
        disabled={!composerAttr && !composerAbil}
        onClick={handlePin}
        className={`flex shrink-0 items-center justify-center gap-1 rounded-lg border border-amber-500/50 bg-amber-950/35 px-2.5 font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-40 ${
          compact ? 'min-h-[38px] w-full text-xs' : 'h-7 text-[10px]'
        }`}
      >
        {pinnedFlash ? <Check className="h-3 w-3 text-emerald-300" /> : <Pin className="h-3 w-3" />}
        {pinnedFlash ? 'Pinned!' : 'Pin Shortcut'}
      </button>
    </div>
  );
};

interface QuickRollBarProps {
  userId: string;
  seatId: string;
  activeSheet: W20UserCharacterSheet | null;
  currentPool: number;
  currentRageDiceCount: number;
  currentDifficulty: number;
  currentHasSpecialty: boolean;
  currentIsSecretRoll: boolean;
  currentRollLabel: string;
  disabled: boolean;
  compact?: boolean;
  showSavePresetButton?: boolean;
  onTriggerPreset: (preset: QuickRollPreset) => void;
  onTriggerResolvedShortcut: (resolved: ResolvedSheetShortcut) => void;
  onRemoveSheetShortcut: (shortcutId: string) => void;
}

export const QuickRollBar: React.FC<QuickRollBarProps> = ({
  userId,
  seatId,
  activeSheet,
  currentPool,
  currentRageDiceCount,
  currentDifficulty,
  currentHasSpecialty,
  currentIsSecretRoll,
  currentRollLabel,
  disabled,
  compact = false,
  showSavePresetButton = true,
  onTriggerPreset,
  onTriggerResolvedShortcut,
  onRemoveSheetShortcut,
}) => {
  const storageKey = getStorageKey(userId, seatId);
  const storedPresets = useUnboundQuickRollStore((s) => s.byKey[storageKey]);
  const ensureLoaded = useUnboundQuickRollStore((s) => s.ensureLoaded);
  const addPreset = useUnboundQuickRollStore((s) => s.addPreset);
  const removePreset = useUnboundQuickRollStore((s) => s.removePreset);

  const [namingOpen, setNamingOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (!activeSheet) {
      ensureLoaded(userId, seatId);
    }
    setNamingOpen(false);
    setDraftName('');
  }, [activeSheet, ensureLoaded, userId, seatId]);

  const presets = storedPresets ?? DEFAULT_QUICK_ROLLS;

  const resolvedShortcuts = useMemo(() => {
    if (!activeSheet) return [];
    return activeSheet.shortcuts.map((sc) => resolveSheetShortcut(activeSheet, sc));
  }, [activeSheet]);

  const savePresetWithName = (rawName: string) => {
    const cleanName = rawName.trim();
    if (!cleanName) return;

    addPreset(userId, seatId, {
      name: cleanName.slice(0, 32),
      pool: currentPool,
      rageDiceCount: currentRageDiceCount,
      difficulty: currentDifficulty,
      hasSpecialty: currentHasSpecialty,
      isSecretRoll: currentIsSecretRoll,
    });
    setNamingOpen(false);
    setDraftName('');
  };

  const handleSaveClick = () => {
    const labelTrimmed = currentRollLabel.trim();
    if (labelTrimmed.length > 0) {
      savePresetWithName(labelTrimmed);
      return;
    }
    setNamingOpen(true);
    setDraftName('');
  };

  const pillTextClass = compact ? 'text-[10.5px]' : 'text-[11px]';
  const pillBtnClass = compact ? 'py-1 pl-2 pr-1 min-h-[30px]' : 'py-1 pl-2.5 pr-1.5';

  return (
    <div
      className={`no-scrollbar flex min-w-0 items-center gap-1.5 overflow-x-auto ${
        compact ? '' : 'pb-0.5'
      }`}
    >
      {!compact && (
        <span className="font-display shrink-0 text-[10px] font-bold tracking-wider uppercase text-amber-300/75">
          {activeSheet ? 'Sheet Rolls' : 'Quick Rolls'}
        </span>
      )}

      {activeSheet ? (
        resolvedShortcuts.length === 0 ? (
          <span className="shrink-0 text-[10px] italic text-stone-500">
            No pinned shortcuts — pin from Sheet or Controls
          </span>
        ) : (
          resolvedShortcuts.map((resolved) => {
            const sc = resolved.shortcut;
            const tooltip = [
              resolved.label !== sc.name ? `${resolved.label}` : '',
              resolved.formulaSummary,
              resolved.specialtyReason ? `Specialty: ${resolved.specialtyReason}` : '',
              `Diff ${resolved.difficulty}`,
            ]
              .filter(Boolean)
              .join(' • ');

            return (
              <div
                key={sc.id}
                className={`group flex shrink-0 items-center rounded-full border border-stone-700/80 bg-zinc-950/90 ${pillTextClass} transition hover:border-amber-500/60`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onTriggerResolvedShortcut(resolved)}
                  className={`flex items-center gap-1.5 ${pillBtnClass} text-left disabled:opacity-50`}
                  title={tooltip}
                >
                  <span className="max-w-[130px] truncate font-semibold text-stone-100">
                    {sc.name}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold ${
                      resolved.effectivePool <= 0 ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    {resolved.effectivePool}d10
                  </span>
                  {resolved.difficulty !== 6 && (
                    <span className="font-mono text-[9px] text-stone-400">
                      D{resolved.difficulty}
                    </span>
                  )}
                  {resolved.rageDiceCount > 0 && (
                    <span className="font-mono text-[9px] text-red-400">
                      {resolved.rageDiceCount}R
                    </span>
                  )}
                  {resolved.hasSpecialty && <Sparkles className="h-2.5 w-2.5 text-amber-400" />}
                  {resolved.isSecretRoll && <EyeOff className="h-2.5 w-2.5 text-amber-300" />}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSheetShortcut(sc.id)}
                  aria-label={`Remove ${sc.name}`}
                  className="mr-1 rounded-full p-0.5 text-stone-500 hover:bg-red-950/70 hover:text-red-300"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })
        )
      ) : (
        <>
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`group flex shrink-0 items-center rounded-full border border-stone-700/75 bg-zinc-950/90 ${pillTextClass} transition hover:border-amber-500/55`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onTriggerPreset(preset)}
                className={`flex items-center gap-1.5 ${pillBtnClass} text-left disabled:opacity-50`}
                title={`Roll ${preset.name}: ${preset.pool}d10 Diff ${preset.difficulty}`}
              >
                <span className="max-w-[130px] truncate font-semibold text-stone-100">
                  {preset.name}
                </span>
                <span className="font-mono text-[10px] font-bold text-amber-300">
                  {preset.pool}d10
                </span>
                {preset.difficulty !== 6 && (
                  <span className="font-mono text-[9px] text-stone-400">D{preset.difficulty}</span>
                )}
                {preset.rageDiceCount > 0 && (
                  <span className="font-mono text-[9px] text-red-400">
                    {preset.rageDiceCount}R
                  </span>
                )}
                {preset.hasSpecialty && <Sparkles className="h-2.5 w-2.5 text-amber-400" />}
                {preset.isSecretRoll && <EyeOff className="h-2.5 w-2.5 text-amber-300" />}
              </button>
              <button
                type="button"
                onClick={() => removePreset(userId, seatId, preset.id)}
                aria-label={`Remove ${preset.name}`}
                className="mr-1 rounded-full p-0.5 text-stone-500 hover:bg-red-950/70 hover:text-red-300"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}

          {showSavePresetButton &&
            (namingOpen ? (
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/65 bg-zinc-950 px-2 py-0.5">
                <input
                  type="text"
                  value={draftName}
                  maxLength={32}
                  autoFocus
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      savePresetWithName(draftName);
                    } else if (e.key === 'Escape') {
                      setNamingOpen(false);
                      setDraftName('');
                    }
                  }}
                  placeholder="Preset name..."
                  className="w-28 bg-transparent text-[11px] text-stone-100 placeholder-stone-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => savePresetWithName(draftName)}
                  className="rounded-full bg-amber-600/80 p-0.5 text-zinc-950 hover:bg-amber-500"
                  aria-label="Confirm preset name"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNamingOpen(false);
                    setDraftName('');
                  }}
                  className="rounded-full p-0.5 text-stone-400 hover:text-stone-100"
                  aria-label="Cancel preset"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSaveClick}
                className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-amber-500/45 bg-amber-950/20 px-2.5 py-1 text-[10px] font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/40"
                title="Save current Dice Console setup as a personal Quick Roll"
              >
                <BookmarkPlus className="h-3 w-3" />
                Save Preset
              </button>
            ))}
        </>
      )}
    </div>
  );
};
