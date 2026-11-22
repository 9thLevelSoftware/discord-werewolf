import React, { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Dices,
  Eraser,
  EyeOff,
  FileText,
  Flame,
  Hash,
  HeartPulse,
  Minus,
  Monitor,
  Pin,
  Plus,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { formatFormName, W20_FORMS } from '../character-sheet/sheetShared';
import { ParticipantAvatar, RollResultPlaque } from './DieFaceTiles';
import {
  type DiceTableHudProps,
  POOL_QUICK_JUMPS,
  QuickRollBar,
} from './QuickRollBar';
import { MobileTraitPickerContent } from './TraitRollBuilder';
import { PersonalTrackersPanel } from './W20DotTracker';

type MobileSheetKind = 'presence' | 'vitals' | 'traits' | 'tune' | null;

const MobileBottomSheet: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <>
    <div
      className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px]"
      onClick={onClose}
      aria-hidden="true"
    />
    <section
      role="dialog"
      aria-label={title}
      className="w20-obsidian-panel pb-safe fixed inset-x-0 bottom-0 z-50 flex max-h-[84dvh] w-full flex-col rounded-t-2xl border-t border-x-0 border-b-0 shadow-2xl"
    >
      <div className="flex justify-center pt-2 pb-1">
        <span className="h-1 w-10 rounded-full bg-stone-600/80" />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 pb-2.5">
        <div className="min-w-0">
          <h2 className="font-display truncate text-xs font-extrabold tracking-wider uppercase text-amber-100">
            {title}
          </h2>
          {subtitle && <p className="truncate text-[10px] text-stone-400">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-zinc-800/80 hover:text-stone-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="w20-gold-divider" />
      <div className="flex-1 overflow-y-auto p-3.5">{children}</div>
    </section>
  </>
);

const MobileCompactDiffStepper: React.FC<{
  difficulty: number;
  onSetDifficulty: React.Dispatch<React.SetStateAction<number>>;
}> = ({ difficulty, onSetDifficulty }) => (
  <div className="flex h-[38px] shrink-0 items-center gap-0.5 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-0.5">
    <button
      type="button"
      onClick={() => onSetDifficulty((d) => Math.max(2, d - 1))}
      aria-label="Decrease Difficulty"
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-stone-300 active:scale-95"
    >
      <Minus className="h-3 w-3" />
    </button>
    <span
      className={`font-display min-w-[26px] text-center text-xs font-black ${
        difficulty !== 6 ? 'text-amber-300' : 'text-amber-100'
      }`}
    >
      D{difficulty}
    </span>
    <button
      type="button"
      onClick={() => onSetDifficulty((d) => Math.min(10, d + 1))}
      aria-label="Increase Difficulty"
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-stone-300 active:scale-95"
    >
      <Plus className="h-3 w-3" />
    </button>
  </div>
);

const MobileModifierGrid: React.FC<{
  hasSpecialty: boolean;
  isSheetTraitsMode: boolean;
  isAutoSpecialty: boolean;
  spendWillpower: boolean;
  applyWoundPenalty: boolean;
  isSecretRoll: boolean;
  willpowerRemaining: number;
  woundPenalty: number;
  onToggleSpecialty: () => void;
  onToggleSpendWillpower: () => void;
  onToggleApplyWoundPenalty: () => void;
  onToggleSecretRoll: () => void;
}> = ({
  hasSpecialty,
  isSheetTraitsMode,
  isAutoSpecialty,
  spendWillpower,
  applyWoundPenalty,
  isSecretRoll,
  willpowerRemaining,
  woundPenalty,
  onToggleSpecialty,
  onToggleSpendWillpower,
  onToggleApplyWoundPenalty,
  onToggleSecretRoll,
}) => (
  <div className="grid grid-cols-2 gap-2">
    <button
      type="button"
      onClick={onToggleSpecialty}
      className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
        hasSpecialty
          ? 'border-amber-400/80 bg-amber-950/65 text-amber-200'
          : 'border-stone-800 bg-zinc-950/85 text-stone-400'
      }`}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>Specialty</span>
      {isSheetTraitsMode && isAutoSpecialty && hasSpecialty && (
        <span className="rounded bg-amber-400/20 px-1 text-[9px] font-extrabold text-amber-200">
          Sheet
        </span>
      )}
    </button>

    <button
      type="button"
      disabled={willpowerRemaining <= 0 && !spendWillpower}
      onClick={onToggleSpendWillpower}
      className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-40 ${
        spendWillpower
          ? 'border-indigo-400/80 bg-indigo-950/70 text-indigo-200'
          : 'border-stone-800 bg-zinc-950/85 text-stone-400'
      }`}
    >
      +1 Willpower
    </button>

    <button
      type="button"
      onClick={onToggleApplyWoundPenalty}
      className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
        applyWoundPenalty
          ? 'border-rose-500/65 bg-rose-950/55 text-rose-200'
          : 'border-stone-800 bg-zinc-950/85 text-stone-400'
      }`}
    >
      <ShieldAlert className="h-3.5 w-3.5" />
      Wounds
      {woundPenalty !== 0 ? ` (${woundPenalty})` : ''}
    </button>

    <button
      type="button"
      onClick={onToggleSecretRoll}
      className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
        isSecretRoll
          ? 'border-amber-400/80 bg-amber-950/65 text-amber-200'
          : 'border-stone-800 bg-zinc-950/85 text-stone-400'
      }`}
    >
      <EyeOff className="h-3.5 w-3.5" />
      Secret
    </button>
  </div>
);

export const MobileDiceTableHud: React.FC<DiceTableHudProps> = ({
  session,
  connectionStatus,
  lastError,
  sortedParticipants,
  speakingDiscordIds,
  seats,
  activeSeat,
  activeSheet,
  sheetsById,
  activeTrackers,
  rollHistoryCount,
  feedOpen,
  hasDiceOnTable,
  activeBanner,
  sfxPrefs,
  layoutMode,
  rollSourceMode,
  pool,
  editingPool,
  poolInputValue,
  bonusDice,
  rageDiceCount,
  difficulty,
  hasSpecialty,
  isAutoSpecialty,
  hasTraitSelection,
  traitSelection,
  spendWillpower,
  applyWoundPenalty,
  isSecretRoll,
  rollLabel,
  effectiveRollLabel,
  isThrowing,
  effectivePreviewPool,
  clampedPreviewRage,
  obsidianPreviewCount,
  activeModifierCount,
  composerAttr,
  composerAbil,
  onCycleLayoutMode,
  onToggleFeed,
  onCloseFeed,
  onClearTable,
  onDismissBanner,
  onToggleMuteSfx,
  onUpdateTrackers,
  onSelectSeat,
  onAddSeatAndOpenRoster,
  onOpenRoster,
  onOpenSheet,
  onSetActiveSheetForm,
  onSetRollSourceMode,
  onSetPool,
  onSetEditingPool,
  onSetPoolInputValue,
  onCommitPoolInput,
  onSetBonusDice,
  onSetRageDiceCount,
  onSetDifficulty,
  onToggleSpecialty,
  onToggleSpendWillpower,
  onToggleApplyWoundPenalty,
  onToggleSecretRoll,
  onSetRollLabel,
  onExecuteRoll,
  initiativeModifier,
  initiativeFormula,
  onRollInitiative,
  onTriggerPreset,
  onTriggerResolvedShortcut,
  onRemoveSheetShortcut,
  onComposerChange,
  onPinCurrentToSheet,
  onSaveCurrentUnboundPreset,
}) => {
  const [activeMobileSheet, setActiveMobileSheet] = useState<MobileSheetKind>(null);
  const [traitSheetTab, setTraitSheetTab] = useState<'attr' | 'skill'>('attr');
  const [savedFlash, setSavedFlash] = useState(false);

  const isSheetTraitsMode = Boolean(activeSheet && rollSourceMode === 'traits');
  const isDisabled = isThrowing || connectionStatus !== 'authenticated';
  const rollBlockedByEmptyTraits = isSheetTraitsMode && (!hasTraitSelection || pool <= 0);

  useEffect(() => {
    if (!activeMobileSheet) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMobileSheet(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMobileSheet]);

  const openMobileSheet = (kind: Exclude<MobileSheetKind, null>) => {
    if (feedOpen) {
      onCloseFeed();
    }
    setActiveMobileSheet((prev) => (prev === kind ? null : kind));
  };

  const openTraitsSheet = (tab: 'attr' | 'skill') => {
    if (feedOpen) {
      onCloseFeed();
    }
    setTraitSheetTab(tab);
    setActiveMobileSheet('traits');
  };

  const handleFeedClick = () => {
    setActiveMobileSheet(null);
    onToggleFeed();
  };

  const handleSaveOrPin = () => {
    if (activeSheet) {
      onPinCurrentToSheet();
    } else {
      onSaveCurrentUnboundPreset();
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const onlineCount = sortedParticipants.filter((p) => p.isConnected).length;
  const anySpeaking = sortedParticipants.some((p) => speakingDiscordIds.has(p.discordUserId));

  const centerPillLabel = activeSheet
    ? `${activeSheet.name} • ${formatFormName(activeSheet.activeForm)}`
    : seats.length >= 2
      ? `${activeSeat.playerName || 'Unbound'} • Seats`
      : 'Unbound • Select Garou';

  const layoutTitle =
    layoutMode === 'auto'
      ? 'Layout: Auto (Mobile) — tap to switch to PC'
      : layoutMode === 'mobile'
        ? 'Layout: Mobile — tap to switch to PC'
        : 'Layout: PC';

  const rollCtaText = isThrowing
    ? 'Casting...'
    : isSheetTraitsMode && !hasTraitSelection
      ? 'Select Trait'
      : isSheetTraitsMode && pool <= 0
        ? '0 Dice'
        : `Roll ${effectivePreviewPool}d10${
            difficulty !== 6 ? ` • D${difficulty}` : ''
          }${clampedPreviewRage > 0 ? ` (${clampedPreviewRage}R)` : ''}`;

  return (
    <>
      {/* Slim Top Bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-safe">
        <div className="flex items-center justify-between gap-1.5 px-2.5 pt-2">
          {/* Left: Compact Presence Pill */}
          <button
            type="button"
            onClick={() => openMobileSheet('presence')}
            aria-label="Open table participants and seats"
            className={`w20-obsidian-panel pointer-events-auto flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold transition ${
              anySpeaking
                ? '!border-emerald-400/80 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.4)]'
                : 'text-stone-100'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connectionStatus === 'authenticated'
                  ? anySpeaking
                    ? 'animate-ping bg-emerald-400'
                    : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]'
                  : 'animate-pulse bg-amber-400'
              }`}
            />
            <span className="font-mono">{onlineCount}</span>
          </button>

          {/* Center: Active Seat / Garou Pill */}
          <button
            type="button"
            onClick={activeSheet ? onOpenSheet : onOpenRoster}
            title={
              activeSheet
                ? `Open ${activeSheet.name}'s interactive W20 sheet`
                : 'Select or create a Garou sheet'
            }
            className="w20-obsidian-panel pointer-events-auto flex h-8 min-w-0 max-w-[46%] flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold text-amber-100 transition active:scale-[0.98]"
          >
            <Flame className="h-3 w-3 shrink-0 text-red-400" />
            <span className="truncate">{centerPillLabel}</span>
          </button>

          {/* Right: Compact Icon Buttons */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {(hasDiceOnTable || activeBanner) && (
              <button
                type="button"
                onClick={onClearTable}
                aria-label="Clear dice from felt"
                title="Clear Felt"
                className="w20-obsidian-panel flex h-8 w-8 items-center justify-center rounded-full text-amber-300 transition active:scale-95"
              >
                <Eraser className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleMuteSfx}
              aria-label={sfxPrefs.muted ? 'Unmute dice sound effects' : 'Mute dice sound effects'}
              title={sfxPrefs.muted ? 'Unmute dice SFX' : 'Mute dice SFX'}
              className="w20-obsidian-panel flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
            >
              {sfxPrefs.muted ? (
                <VolumeX className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-amber-300" />
              )}
            </button>

            <button
              type="button"
              onClick={handleFeedClick}
              aria-label={`Chronicle of Rolls (${rollHistoryCount})`}
              title="Chronicle of Rolls"
              className={`w20-obsidian-panel relative flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 ${
                feedOpen ? '!border-amber-400/75 text-amber-200' : 'text-stone-200'
              }`}
            >
              <ScrollText className="h-3.5 w-3.5 text-amber-300" />
              {rollHistoryCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[9px] font-black text-zinc-950">
                  {rollHistoryCount > 99 ? '99+' : rollHistoryCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onCycleLayoutMode}
              aria-label={layoutTitle}
              title={layoutTitle}
              className="w20-obsidian-panel flex h-8 w-8 items-center justify-center rounded-full text-amber-300 transition active:scale-95"
            >
              {layoutMode === 'mobile' ? (
                <Smartphone className="h-3.5 w-3.5" />
              ) : (
                <Monitor className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Server Error Toast */}
      {lastError && (
        <div className="w20-obsidian-panel absolute top-14 inset-x-3 z-30 mt-[env(safe-area-inset-top,0px)] !border-red-600/80 rounded-xl px-3 py-1.5 text-xs text-red-200">
          {lastError.message}
        </div>
      )}

      {/* Compact Roll Result Plaque */}
      {activeBanner && (
        <RollResultPlaque
          banner={activeBanner}
          compact
          onDismiss={onDismissBanner}
        />
      )}

      {/* Thumb-Zone Mobile Bottom Dock */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 pb-safe">
        <div className="w20-obsidian-panel pointer-events-auto mx-2 mb-2 space-y-1.5 rounded-2xl px-2.5 py-2">
          {/* Row 1: Form Pill (if bound) + Swipeable QuickRollBar */}
          <div className="flex min-w-0 items-center gap-1.5">
            {activeSheet && (
              <button
                type="button"
                onClick={() => openMobileSheet('vitals')}
                className="font-display shrink-0 rounded-full border border-red-700/70 bg-red-950/75 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-200 transition active:scale-95"
                title="Tap to change Garou Form or Vitals"
              >
                {formatFormName(activeSheet.activeForm)}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <QuickRollBar
                userId={session.userId}
                seatId={activeSeat.seatId}
                activeSheet={activeSheet}
                currentPool={pool}
                currentRageDiceCount={rageDiceCount}
                currentDifficulty={difficulty}
                currentHasSpecialty={hasSpecialty}
                currentIsSecretRoll={isSecretRoll}
                currentRollLabel={rollLabel}
                disabled={isDisabled}
                compact
                showSavePresetButton={false}
                onTriggerPreset={onTriggerPreset}
                onTriggerResolvedShortcut={onTriggerResolvedShortcut}
                onRemoveSheetShortcut={onRemoveSheetShortcut}
              />
            </div>
          </div>

          {/* Row 2: Persistent 1-Click Skills/Numbers Toggle + Trait+Skill or Numbers Pool + Diff */}
          <div className="flex min-w-0 items-center gap-1">
            {/* Compact 2-Way Segmented Toggle: Skills vs Numbers */}
            <div
              role="group"
              aria-label="Dice Roll Mode: Skills or Numbers"
              className="flex h-[38px] shrink-0 items-center rounded-xl border border-stone-700/80 bg-zinc-950/90 p-0.5"
            >
              <button
                type="button"
                onClick={() => {
                  if (!activeSheet) {
                    onSetRollSourceMode('traits');
                    onOpenRoster();
                  } else {
                    onSetRollSourceMode('traits');
                  }
                }}
                aria-label="Skills mode"
                title={
                  activeSheet
                    ? 'Roll by Character Sheet Skills & Attributes'
                    : 'Select a Garou sheet for Skill rolls'
                }
                className={`flex h-full items-center gap-0.5 rounded-lg px-2 text-[10px] font-bold transition ${
                  isSheetTraitsMode
                    ? 'bg-gradient-to-b from-amber-500/30 to-amber-900/45 text-amber-100 ring-1 ring-amber-400/60'
                    : 'text-stone-400'
                }`}
              >
                <Sparkles className="h-3 w-3 text-amber-300" />
                <span>Skills</span>
              </button>
              <button
                type="button"
                onClick={() => onSetRollSourceMode('manual')}
                aria-label="Numbers mode"
                title="Roll raw d10 pool by number"
                className={`flex h-full items-center gap-0.5 rounded-lg px-2 text-[10px] font-bold transition ${
                  !isSheetTraitsMode
                    ? 'bg-gradient-to-b from-red-800/80 to-red-950 text-amber-100 ring-1 ring-amber-400/55'
                    : 'text-stone-400'
                }`}
              >
                <Hash className="h-3 w-3 text-amber-300" />
                <span>#</span>
              </button>
            </div>

            {isSheetTraitsMode && activeSheet && traitSelection ? (
              <>
                <button
                  type="button"
                  onClick={() => openTraitsSheet('attr')}
                  className="flex h-[38px] min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-2 text-left transition active:scale-[0.98]"
                >
                  {traitSelection.attrOption ? (
                    <>
                      <span className="truncate text-[11px] font-bold text-amber-50">
                        {traitSelection.attrOption.label}
                      </span>
                      <span className="shrink-0 rounded bg-amber-950/75 px-1.5 py-0.5 font-mono text-[10px] font-black text-amber-200">
                        {traitSelection.attrOption.effectiveDots}
                      </span>
                    </>
                  ) : (
                    <span className="truncate text-[11px] font-semibold text-stone-400">
                      + Attr
                    </span>
                  )}
                </button>

                <span className="font-display shrink-0 text-[11px] font-black text-amber-400/75">
                  +
                </span>

                <button
                  type="button"
                  onClick={() => openTraitsSheet('skill')}
                  className="flex h-[38px] min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-2 text-left transition active:scale-[0.98]"
                >
                  {traitSelection.abilOption ? (
                    <>
                      <span className="truncate text-[11px] font-bold text-amber-50">
                        {traitSelection.abilOption.label}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-black ${
                          traitSelection.abilOption.dots > 0
                            ? 'bg-amber-950/75 text-amber-200'
                            : 'bg-zinc-900 text-stone-400'
                        }`}
                      >
                        {traitSelection.abilOption.dots}
                      </span>
                    </>
                  ) : (
                    <span className="truncate text-[11px] font-semibold text-stone-400">
                      + Skill
                    </span>
                  )}
                </button>
              </>
            ) : (
              <div className="flex h-[38px] min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-1">
                <button
                  type="button"
                  onClick={() => onSetPool((p) => Math.max(1, p - 1))}
                  aria-label="Decrease Pool"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-stone-300 active:scale-95"
                >
                  <Minus className="h-3 w-3" />
                </button>
                {editingPool ? (
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={poolInputValue}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => onSetPoolInputValue(e.target.value)}
                    onBlur={onCommitPoolInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onCommitPoolInput();
                      } else if (e.key === 'Escape') {
                        onSetEditingPool(false);
                      }
                    }}
                    className="font-display w-12 bg-transparent text-center text-xs font-black text-amber-100 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSetPoolInputValue(String(pool));
                      onSetEditingPool(true);
                    }}
                    title="Tap to type exact d10 pool"
                    className="font-display min-w-[44px] text-center text-xs font-black text-amber-100"
                  >
                    {pool}d10
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSetPool((p) => Math.min(30, p + 1))}
                  aria-label="Increase Pool"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-stone-300 active:scale-95"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}

            <MobileCompactDiffStepper
              difficulty={difficulty}
              onSetDifficulty={onSetDifficulty}
            />
          </div>

          {/* Row 3: 5 Clean Thumb Controls */}
          <div className="flex items-center gap-1">
            {/* 1. Sheet / Roster */}
            <button
              type="button"
              onClick={activeSheet ? onOpenSheet : onOpenRoster}
              className="flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-1.5 text-stone-200 transition active:scale-95"
            >
              {activeSheet ? (
                <FileText className="h-4 w-4 text-amber-300" />
              ) : (
                <Users className="h-4 w-4 text-amber-300" />
              )}
              <span className="text-[9.5px] font-bold leading-none">
                {activeSheet ? 'Sheet' : 'Roster'}
              </span>
            </button>

            {/* 2. Vitals Pill */}
            <button
              type="button"
              onClick={() => openMobileSheet('vitals')}
              className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 transition active:scale-95 ${
                activeMobileSheet === 'vitals'
                  ? 'border-amber-400/80 bg-amber-950/50'
                  : 'border-stone-700/80 bg-zinc-950/90'
              }`}
            >
              <div className="flex items-center gap-1 font-mono text-[9.5px] font-extrabold leading-none">
                <span className="text-red-300">R{activeTrackers.rage}</span>
                <span className="text-amber-200">G{activeTrackers.gnosis}</span>
                <span className="text-indigo-200">W{activeTrackers.willpower}</span>
              </div>
              <span className="flex items-center gap-0.5 text-[9px] font-bold leading-none text-stone-400">
                <HeartPulse className="h-2.5 w-2.5 text-red-400" />
                {activeTrackers.woundPenalty !== 0 ? (
                  <span className="font-mono text-red-300">
                    {activeTrackers.woundPenalty}
                  </span>
                ) : (
                  'Vitals'
                )}
              </span>
            </button>

            {/* 3. Hardcoded Initiative Button */}
            <button
              type="button"
              disabled={isDisabled}
              onClick={onRollInitiative}
              title={`Roll W20 Initiative (${initiativeFormula})`}
              className="flex min-h-[44px] min-w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-amber-500/60 bg-amber-950/35 px-1.5 text-amber-100 transition active:scale-95 disabled:opacity-45"
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <span className="font-mono text-[9.5px] font-extrabold leading-none">
                {activeSheet || initiativeModifier !== 0
                  ? `${initiativeModifier >= 0 ? `+${initiativeModifier}` : initiativeModifier}`
                  : 'Init'}
              </span>
            </button>

            {/* 4. Primary Roll CTA */}
            <button
              type="button"
              disabled={isDisabled || rollBlockedByEmptyTraits}
              onClick={onExecuteRoll}
              className="w20-crimson-seal font-display flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-2 text-xs font-black tracking-wider uppercase text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Dices className="h-4 w-4 shrink-0" />
              <span className="truncate">{rollCtaText}</span>
              {hasSpecialty && hasTraitSelection && (
                <Sparkles className="h-3 w-3 shrink-0 text-amber-300" />
              )}
            </button>

            {/* 5. Mods Button */}
            <button
              type="button"
              onClick={() => openMobileSheet('tune')}
              className={`relative flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 transition active:scale-95 ${
                activeMobileSheet === 'tune'
                  ? 'border-amber-400/80 bg-amber-950/55 text-amber-100'
                  : 'border-stone-700/80 bg-zinc-950/90 text-stone-200'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 text-amber-300" />
              <span className="text-[9.5px] font-bold leading-none">Mods</span>
              {activeModifierCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[9px] font-black text-zinc-950">
                  {activeModifierCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Sheet 1: Presence & Hot-Seat Switcher */}
      {activeMobileSheet === 'presence' && (
        <MobileBottomSheet
          title="Table Presence & Seats"
          subtitle={`${onlineCount} connected • Hot-seat switcher`}
          onClose={() => setActiveMobileSheet(null)}
        >
          <div className="space-y-4">
            {/* Local Hot-Seats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] font-bold tracking-wider uppercase text-amber-200">
                  Your Table Seats ({seats.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMobileSheet(null);
                      onOpenRoster();
                    }}
                    className="rounded-lg border border-stone-700/80 bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-stone-200"
                  >
                    Roster
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMobileSheet(null);
                      onAddSeatAndOpenRoster();
                    }}
                    className="flex items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-950/40 px-2.5 py-1 text-[11px] font-bold text-amber-200"
                  >
                    <Plus className="h-3 w-3" />
                    Add Seat
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {seats.map((seat, idx) => {
                  const seatSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                  const isActive = seat.seatId === activeSeat.seatId;
                  return (
                    <div
                      key={seat.seatId}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                        isActive
                          ? 'border-amber-400/75 bg-red-950/35'
                          : 'border-stone-800 bg-zinc-950/80'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSeat(seat.seatId);
                          setActiveMobileSheet(null);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs font-bold text-amber-300">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-amber-50">
                            {seatSheet ? seatSheet.name : seat.playerName || 'Unbound Seat'}
                          </p>
                          <p className="truncate text-[10px] text-stone-400">
                            {seatSheet
                              ? `${formatFormName(seatSheet.activeForm)} • ${seat.playerName}`
                              : 'Unbound dice pool'}
                          </p>
                        </div>
                      </button>
                      {seatSheet && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSeat(seat.seatId);
                            setActiveMobileSheet(null);
                            onOpenSheet();
                          }}
                          className="shrink-0 rounded-lg border border-red-700/60 bg-red-950/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-amber-100"
                        >
                          Sheet
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="w20-gold-divider" />

            {/* Connected Voice Table Participants */}
            <div className="space-y-2">
              <span className="font-display block text-[11px] font-bold tracking-wider uppercase text-stone-300">
                Voice Channel Pack ({sortedParticipants.length})
              </span>
              <div className="space-y-1.5">
                {sortedParticipants.map((p) => {
                  const isSpeaking = speakingDiscordIds.has(p.discordUserId);
                  const display = p.characterName
                    ? `${p.characterName} (${p.displayName})`
                    : p.displayName;
                  return (
                    <div
                      key={p.participantKey ?? p.discordUserId}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                        isSpeaking
                          ? 'border-emerald-400/80 bg-emerald-950/35'
                          : 'border-stone-800/90 bg-zinc-950/80'
                      } ${p.isConnected ? '' : 'opacity-45'}`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ParticipantAvatar
                          name={display}
                          avatarUrl={p.avatarUrl}
                          isSpeaking={isSpeaking}
                          isConnected={p.isConnected}
                          sizeClass="h-8 w-8 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-stone-100">
                              {display}
                            </span>
                            {p.activeForm && (
                              <span className="font-display shrink-0 rounded border border-red-800/50 bg-red-950/75 px-1.5 py-0.2 text-[9px] font-bold uppercase text-amber-200">
                                {formatFormName(p.activeForm)}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-red-300">R {p.trackers.rage}</span>
                            <span className="text-amber-200">G {p.trackers.gnosis}</span>
                            <span className="text-indigo-200">W {p.trackers.willpower}</span>
                            {p.trackers.woundPenalty !== 0 && (
                              <span className="rounded bg-red-950 px-1 font-bold text-red-300">
                                {p.trackers.woundPenalty} Wnd
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </MobileBottomSheet>
      )}

      {/* Mobile Bottom Sheet 2: Vitals & 5-Form Switcher */}
      {activeMobileSheet === 'vitals' && (
        <MobileBottomSheet
          title={activeSheet ? `${activeSheet.name} • Vitals & Form` : 'Garou Vitals'}
          subtitle={activeSheet ? 'Shift forms or adjust temporary trait pips' : 'Adjust temporary Rage, Gnosis, Willpower & Wounds'}
          onClose={() => setActiveMobileSheet(null)}
        >
          <div className="space-y-4">
            {seats.length >= 2 && (
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {seats.map((seat, idx) => {
                  const sSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                  const active = seat.seatId === activeSeat.seatId;
                  return (
                    <button
                      key={seat.seatId}
                      type="button"
                      onClick={() => onSelectSeat(seat.seatId)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
                        active
                          ? 'border-amber-400/80 bg-red-950/70 text-amber-100'
                          : 'border-stone-700/75 bg-zinc-950 text-stone-400'
                      }`}
                    >
                      {idx + 1}. {sSheet ? sSheet.name : seat.playerName}
                    </button>
                  );
                })}
              </div>
            )}

            {activeSheet && (
              <div className="space-y-1.5">
                <span className="font-display block text-[11px] font-bold tracking-wider uppercase text-amber-200">
                  Garou Form
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {W20_FORMS.map((form) => {
                    const active = activeSheet.activeForm === form;
                    return (
                      <button
                        key={form}
                        type="button"
                        onClick={() => onSetActiveSheetForm(form)}
                        className={`font-display min-h-[40px] rounded-xl border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide transition ${
                          active
                            ? 'border-amber-400/80 bg-gradient-to-b from-red-800 to-red-950 text-amber-50 shadow-[0_0_10px_rgba(185,28,28,0.5)]'
                            : 'border-stone-700/75 bg-zinc-950 text-stone-400'
                        }`}
                      >
                        {formatFormName(form)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <PersonalTrackersPanel
              trackers={activeTrackers}
              onUpdate={onUpdateTrackers}
              touchFriendly
            />
          </div>
        </MobileBottomSheet>
      )}

      {/* Mobile Bottom Sheet 3: Interactive Attribute + Skill Picker */}
      {activeMobileSheet === 'traits' && activeSheet && traitSelection && (
        <MobileBottomSheet
          title="Select Roll Traits"
          subtitle={`${activeSheet.name} • ${formatFormName(activeSheet.activeForm)} Form`}
          onClose={() => setActiveMobileSheet(null)}
        >
          <MobileTraitPickerContent
            sheet={activeSheet}
            composerAttr={composerAttr}
            composerAbil={composerAbil}
            difficulty={difficulty}
            selection={traitSelection}
            initialTab={traitSheetTab}
            isDisabled={isDisabled}
            isThrowing={isThrowing}
            rageDiceCount={rageDiceCount}
            onChangeSelection={onComposerChange}
            onChangeDifficulty={onSetDifficulty}
            onPinShortcut={onPinCurrentToSheet}
            onExecuteRoll={onExecuteRoll}
            onDone={() => setActiveMobileSheet(null)}
          />
        </MobileBottomSheet>
      )}

      {/* Mobile Bottom Sheet 4: Modifiers (Traits Mode or Raw Pool Mode) */}
      {activeMobileSheet === 'tune' && (
        <MobileBottomSheet
          title={isSheetTraitsMode ? 'Roll Modifiers' : 'Tune Dice Pool'}
          subtitle={
            isSheetTraitsMode
              ? 'Bonus dice, Rage dice, Specialty, Willpower & Secret modifiers'
              : 'Adjust raw dice pool, difficulty, Rage dice & modifiers'
          }
          onClose={() => setActiveMobileSheet(null)}
        >
          <div className="space-y-4">
            {isSheetTraitsMode && traitSelection ? (
              <>
                {/* Active Trait Combo Card */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-zinc-950/80 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-amber-100">
                      {traitSelection.hasSelection
                        ? traitSelection.autoLabel
                        : 'No Traits Selected'}
                    </p>
                    <p className="truncate font-mono text-[10.5px] text-stone-400">
                      {traitSelection.formulaSummary} • Diff {difficulty}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openTraitsSheet('attr')}
                    className="shrink-0 rounded-lg border border-amber-500/50 bg-amber-950/35 px-2.5 py-1.5 text-[11px] font-bold text-amber-200"
                  >
                    Change Traits
                  </button>
                </div>

                {/* Bonus/Penalty Dice & Rage Dice Steppers */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5 rounded-xl border border-stone-700/70 bg-zinc-950/85 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[10px] font-bold uppercase text-amber-200">
                        Bonus Dice
                      </span>
                      {bonusDice !== 0 && (
                        <button
                          type="button"
                          onClick={() => onSetBonusDice(0)}
                          aria-label="Reset bonus dice"
                          className="rounded border border-stone-700 bg-zinc-900 p-1 text-stone-300"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetBonusDice((b) => Math.max(-15, b - 1))}
                        aria-label="Decrease Bonus Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span
                        className={`font-display text-lg font-black ${
                          bonusDice > 0
                            ? 'text-emerald-300'
                            : bonusDice < 0
                              ? 'text-rose-300'
                              : 'text-stone-300'
                        }`}
                      >
                        {bonusDice > 0 ? `+${bonusDice}` : bonusDice}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetBonusDice((b) => Math.min(15, b + 1))}
                        aria-label="Increase Bonus Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-red-900/65 bg-red-950/25 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[10px] font-bold uppercase text-red-300">
                        Rage Dice
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onSetRageDiceCount(
                            Math.min(Math.max(0, Math.min(30, pool)), activeTrackers.rage)
                          )
                        }
                        className="rounded border border-red-700/65 bg-red-950 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-200"
                      >
                        Sync
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetRageDiceCount((r) => Math.max(0, r - 1))}
                        aria-label="Decrease Rage Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-display text-lg font-black text-red-300">
                        {rageDiceCount}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onSetRageDiceCount((r) =>
                            Math.min(Math.max(0, Math.min(30, pool)), r + 1)
                          )
                        }
                        aria-label="Increase Rage Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {activeSheet && (
                  <button
                    type="button"
                    onClick={() => onSetRollSourceMode('traits')}
                    className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/55 bg-amber-950/40 text-xs font-bold text-amber-200"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Return to Sheet Attribute + Skill Mode
                  </button>
                )}

                {/* Big Touch Raw Pool Control */}
                <div className="space-y-2 rounded-xl border border-amber-500/25 bg-zinc-950/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                      Dice Pool
                    </span>
                    {applyWoundPenalty && activeTrackers.woundPenalty !== 0 && (
                      <span className="font-mono text-[11px] font-bold text-red-300">
                        Effective: {effectivePreviewPool}d10 ({activeTrackers.woundPenalty})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSetPool((p) => Math.max(1, p - 1))}
                      aria-label="Decrease Pool"
                      className="flex h-11 w-12 items-center justify-center rounded-xl border border-stone-700 bg-zinc-900 text-stone-100 active:scale-95"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    {editingPool ? (
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={poolInputValue}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => onSetPoolInputValue(e.target.value)}
                        onBlur={onCommitPoolInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onCommitPoolInput();
                          } else if (e.key === 'Escape') {
                            onSetEditingPool(false);
                          }
                        }}
                        className="font-display w-20 bg-transparent text-center text-2xl font-black text-amber-100 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSetPoolInputValue(String(pool));
                          onSetEditingPool(true);
                        }}
                        className="flex flex-1 items-baseline justify-center gap-1 py-1 text-amber-100"
                      >
                        <span className="font-display text-2xl font-black">{pool}</span>
                        <span className="font-mono text-xs font-bold text-stone-400">d10</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSetPool((p) => Math.min(30, p + 1))}
                      aria-label="Increase Pool"
                      className="flex h-11 w-12 items-center justify-center rounded-xl border border-stone-700 bg-zinc-900 text-stone-100 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Quick-jump chips */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {POOL_QUICK_JUMPS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onSetPool(val)}
                        className={`min-h-[36px] rounded-lg border font-mono text-xs font-bold ${
                          pool === val
                            ? 'border-amber-400/80 bg-red-900/75 text-amber-100'
                            : 'border-stone-800 bg-zinc-900/90 text-stone-300'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>

                  {/* Dual-tone Obsidian / Rage bar */}
                  <div className="flex items-center gap-0.5 pt-1">
                    {Array.from({ length: Math.min(effectivePreviewPool, 18) }, (_, idx) => {
                      const isRage = idx >= obsidianPreviewCount;
                      return (
                        <span
                          key={idx}
                          className={`h-1.5 flex-1 rounded-xs ${
                            isRage
                              ? 'bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.75)]'
                              : 'bg-stone-500/80'
                          }`}
                        />
                      );
                    })}
                    {effectivePreviewPool > 18 && (
                      <span className="ml-1 font-mono text-[10px] text-stone-400">
                        +{effectivePreviewPool - 18}
                      </span>
                    )}
                  </div>
                </div>

                {/* Diff & Rage Steppers */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5 rounded-xl border border-stone-700/70 bg-zinc-950/85 p-2.5">
                    <span className="font-display block text-center text-[10px] font-bold uppercase text-stone-400">
                      Difficulty
                    </span>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetDifficulty((d) => Math.max(2, d - 1))}
                        aria-label="Decrease Difficulty"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-display text-lg font-black text-amber-300">
                        {difficulty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetDifficulty((d) => Math.min(10, d + 1))}
                        aria-label="Increase Difficulty"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-red-900/65 bg-red-950/25 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-[10px] font-bold uppercase text-red-300">
                        Rage Dice
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetRageDiceCount(Math.min(pool, activeTrackers.rage))}
                        className="rounded border border-red-700/65 bg-red-950 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-200"
                      >
                        Sync
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => onSetRageDiceCount((r) => Math.max(0, r - 1))}
                        aria-label="Decrease Rage Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-display text-lg font-black text-red-300">
                        {rageDiceCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSetRageDiceCount((r) => Math.min(pool, r + 1))}
                        aria-label="Increase Rage Dice"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-stone-200 active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Shared 2x2 Modifier Tiles */}
            <MobileModifierGrid
              hasSpecialty={hasSpecialty}
              isSheetTraitsMode={isSheetTraitsMode}
              isAutoSpecialty={isAutoSpecialty}
              spendWillpower={spendWillpower}
              applyWoundPenalty={applyWoundPenalty}
              isSecretRoll={isSecretRoll}
              willpowerRemaining={activeTrackers.willpower}
              woundPenalty={activeTrackers.woundPenalty}
              onToggleSpecialty={onToggleSpecialty}
              onToggleSpendWillpower={onToggleSpendWillpower}
              onToggleApplyWoundPenalty={onToggleApplyWoundPenalty}
              onToggleSecretRoll={onToggleSecretRoll}
            />

            {/* Label Input + Pin / Save + Roll Now */}
            <div className="space-y-2.5">
              <input
                type="text"
                value={rollLabel}
                maxLength={120}
                onChange={(e) => onSetRollLabel(e.target.value)}
                placeholder={effectiveRollLabel || 'Custom roll label (e.g. Dexterity + Firearms)'}
                className="min-h-[42px] w-full rounded-xl border border-stone-700/75 bg-zinc-950/90 px-3 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSaveOrPin}
                  disabled={Boolean(isSheetTraitsMode && !hasTraitSelection)}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/35 px-3 text-xs font-bold text-amber-200 disabled:opacity-40"
                >
                  {savedFlash ? (
                    <Check className="h-4 w-4 text-emerald-300" />
                  ) : activeSheet ? (
                    <Pin className="h-4 w-4" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  {savedFlash
                    ? activeSheet
                      ? 'Pinned!'
                      : 'Saved!'
                    : activeSheet
                      ? 'Pin to Sheet'
                      : 'Save Preset'}
                </button>
                <button
                  type="button"
                  disabled={isDisabled || rollBlockedByEmptyTraits}
                  onClick={() => {
                    setActiveMobileSheet(null);
                    onExecuteRoll();
                  }}
                  className="w20-crimson-seal font-display flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black tracking-wider uppercase text-amber-50 disabled:opacity-50"
                >
                  <Dices className="h-4 w-4" />
                  Roll {effectivePreviewPool}d10
                </button>
              </div>
            </div>

            {isSheetTraitsMode && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => onSetRollSourceMode('manual')}
                  className="text-[11px] font-semibold text-stone-400 underline decoration-stone-600 underline-offset-2"
                >
                  Switch to Raw Pool Override
                </button>
              </div>
            )}
          </div>
        </MobileBottomSheet>
      )}
    </>
  );
};
