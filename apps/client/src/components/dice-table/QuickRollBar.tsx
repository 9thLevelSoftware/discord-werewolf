import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GarouForm,
  type ResolvedSheetShortcut,
  resolveSheetShortcut,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { LightGarouTrackers, TableParticipant } from '@w20-vtt/protocol';
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  EyeOff,
  Sparkles,
  X,
} from 'lucide-react';
import { create } from 'zustand';
import type { DiceSoundPreferences } from '../../audio/DiceSoundEngine';
import type { DiscordSessionContext } from '../../discordBootstrap';
import type { ViewportLayoutMode } from '../../hooks/useViewportLayout';
import type { LocalTableSeat } from '../../store/useCharacterSheetStore';
import type { ConnectionStatus, Queued3DRoll } from '../../store/useVttRoomStore';
import type {
  ComposerAttributeKey,
  ResolvedTraitRollSelection,
  RollSourceMode,
} from './traitRollMath';
import type { RollStageStatus } from './rollQueueController';

export interface QuickRollPreset {
  id: string;
  name: string;
  pool: number;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  isSecretRoll: boolean;
}

export const POOL_QUICK_JUMPS = [3, 5, 7, 10, 12] as const;

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
  packOpen: boolean;
  hasDiceOnTable: boolean;
  activeBanner: Queued3DRoll | null;
  sfxPrefs: DiceSoundPreferences;
  layoutMode: ViewportLayoutMode;
  rollSourceMode: RollSourceMode;
  pool: number;
  editingPool: boolean;
  poolInputValue: string;
  bonusDice: number;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  isAutoSpecialty: boolean;
  specialtyReason?: string;
  perceptionFormMod: number;
  untrainedHint?: string;
  compactTraitFormula: string;
  hasTraitSelection: boolean;
  traitSelection: ResolvedTraitRollSelection | null;
  spendWillpower: boolean;
  applyWoundPenalty: boolean;
  isSecretRoll: boolean;
  rollLabel: string;
  effectiveRollLabel: string;
  manualControlsOpen: boolean;
  isThrowing: boolean;
  rollStageStatus: RollStageStatus;
  effectivePreviewPool: number;
  clampedPreviewRage: number;
  obsidianPreviewCount: number;
  activeModifierCount: number;
  composerAttr: ComposerAttributeKey | '';
  composerAbil: string;
  onCycleLayoutMode: () => void;
  onToggleFeed: () => void;
  onCloseFeed: () => void;
  onTogglePack: () => void;
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
  onSetRollSourceMode: (mode: RollSourceMode) => void;
  onSetPool: React.Dispatch<React.SetStateAction<number>>;
  onSetEditingPool: (editing: boolean) => void;
  onSetPoolInputValue: (val: string) => void;
  onCommitPoolInput: () => void;
  onSetBonusDice: React.Dispatch<React.SetStateAction<number>>;
  onSetRageDiceCount: React.Dispatch<React.SetStateAction<number>>;
  onSetDifficulty: React.Dispatch<React.SetStateAction<number>>;
  onToggleSpecialty: () => void;
  onToggleSpendWillpower: () => void;
  onToggleApplyWoundPenalty: () => void;
  onToggleSecretRoll: () => void;
  onSetRollLabel: (label: string) => void;
  onSetManualControlsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onExecuteRoll: () => void;
  initiativeModifier: number;
  initiativeFormula: string;
  onRollInitiative: () => void;
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
  const [expanded, setExpanded] = useState(!compact);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);

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

  const itemCount = activeSheet ? resolvedShortcuts.length : presets.length;
  const showExpandToggle = itemCount > (compact ? 2 : 4);

  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    if (expanded || !scrollRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const nudgeScroll = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

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
    <div className="flex min-w-0 items-start gap-1.5">
      {!compact && (
        <span className="font-display shrink-0 pt-1.5 text-[10px] font-bold tracking-wider uppercase text-amber-300/75">
          {activeSheet ? 'Pinned Rolls' : 'Quick Rolls'}
        </span>
      )}

      {!expanded && !compact && itemCount > 2 && (
        <button
          type="button"
          onClick={() => nudgeScroll(-160)}
          aria-label="Scroll pinned rolls left"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-700/80 bg-zinc-950/90 text-stone-300 hover:border-amber-400/60 hover:text-amber-200"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={scrollRef}
        onWheel={handleWheelScroll}
        className={
          expanded
            ? `w20-thin-scrollbar flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-y-auto pr-1 ${
                compact ? 'max-h-[124px] py-0.5' : 'max-h-[96px]'
              }`
            : `w20-thin-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5`
        }
      >
        {activeSheet ? (
          resolvedShortcuts.length === 0 ? (
            <span className="shrink-0 text-[10px] italic text-stone-500">
              No pinned rolls — click Pin to save any Trait + Skill setup
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
                    <span className="font-mono text-[9px] text-stone-400">
                      D{preset.difficulty}
                    </span>
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

      {!expanded && !compact && itemCount > 2 && (
        <button
          type="button"
          onClick={() => nudgeScroll(160)}
          aria-label="Scroll pinned rolls right"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-700/80 bg-zinc-950/90 text-stone-300 hover:border-amber-400/60 hover:text-amber-200"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      {showExpandToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? 'Collapse to 1 row' : `Show all ${itemCount} pinned rolls`}
          className={`flex shrink-0 items-center gap-0.5 rounded-full border px-2 font-bold transition ${
            compact ? 'min-h-[30px] text-[10px]' : 'mt-0.5 h-6 text-[10px]'
          } ${
            expanded
              ? 'border-amber-500/60 bg-amber-950/45 text-amber-200'
              : 'border-stone-700/85 bg-zinc-950/90 text-stone-300 hover:border-amber-500/55 hover:text-amber-100'
          }`}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>1 Row</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>All ({itemCount})</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};
