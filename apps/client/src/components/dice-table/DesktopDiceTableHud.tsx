import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Dices,
  Eraser,
  Flame,
  Hash,
  Minus,
  Pin,
  Plus,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { formatFormName, W20_FORMS } from '../character-sheet/sheetShared';
import { TableSettingsMenu } from './console/TableSettingsMenu';
import {
  BonusDiceStepper,
  ConnectionDot,
  DicePreviewStrip,
  getRollBlockReason,
  getRollCtaText,
  getRollGate,
  RageDiceStepper,
  RollModifierToggles,
  SavePinButton,
  useSavedFlash,
} from './console/consoleShared';
import { ActiveThrowPill, RollResultPlaque } from './DieFaceTiles';
import {
  type DiceTableHudProps,
  POOL_QUICK_JUMPS,
  QuickRollBar,
} from './QuickRollBar';
import { DesktopTraitRollBar, DifficultyQuickControl } from './TraitRollBuilder';
import { PersonalTrackersControl } from './W20DotTracker';

interface CompactRawPoolStepperProps {
  pool: number;
  editingPool: boolean;
  poolInputValue: string;
  onSetPool: React.Dispatch<React.SetStateAction<number>>;
  onSetEditingPool: (editing: boolean) => void;
  onSetPoolInputValue: (val: string) => void;
  onCommitPoolInput: () => void;
  showLabel?: boolean;
}

const CompactRawPoolStepper: React.FC<CompactRawPoolStepperProps> = ({
  pool,
  editingPool,
  poolInputValue,
  onSetPool,
  onSetEditingPool,
  onSetPoolInputValue,
  onCommitPoolInput,
  showLabel = true,
}) => (
  <div className="flex shrink-0 items-center gap-1.5">
    {showLabel && (
      <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200/80">
        Pool
      </span>
    )}
    <div className="flex h-9 items-center gap-1 rounded-xl border border-amber-500/35 bg-zinc-950/90 px-1.5 shadow-inner">
      <button
        type="button"
        onClick={() => onSetPool((p) => Math.max(1, p - 1))}
        className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
        aria-label="Decrease Pool"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      {editingPool ? (
        <input
          type="number"
          aria-label="Dice pool (1 to 30)"
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
          className="font-display w-12 bg-transparent text-center text-base font-black text-amber-100"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            onSetPoolInputValue(String(pool));
            onSetEditingPool(true);
          }}
          aria-label={`Dice pool ${pool}. Type an exact number`}
          title="Type an exact pool (1 to 30)"
          className="flex min-w-[44px] items-baseline justify-center gap-0.5 px-1 text-amber-100 hover:text-amber-300"
        >
          <span className="font-display text-base font-black leading-none">{pool}</span>
          <span className="font-mono text-xs font-bold text-stone-400">d10</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => onSetPool((p) => Math.min(30, p + 1))}
        className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
        aria-label="Increase Pool"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);

export const DesktopDiceTableHud: React.FC<DiceTableHudProps> = ({
  session,
  connectionStatus,
  lastError,
  webglReady,
  sortedParticipants,
  speakingDiscordIds,
  seats,
  activeSeat,
  activeSheet,
  sheetsById,
  activeTrackers,
  rollHistoryCount,
  feedOpen,
  packOpen,
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
  specialtyReason,
  hasTraitSelection,
  traitSelection,
  spendWillpower,
  applyWoundPenalty,
  isSecretRoll,
  rollLabel,
  effectiveRollLabel,
  manualControlsOpen,
  isThrowing,
  rollStageStatus,
  effectivePreviewPool,
  clampedPreviewRage,
  obsidianPreviewCount,
  activeModifierCount,
  composerAttr,
  composerAbil,
  onCycleLayoutMode,
  onToggleFeed,
  onTogglePack,
  onClearTable,
  onDismissBanner,
  onToggleMuteSfx,
  onSfxVolumeChange,
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
  onSetManualControlsOpen,
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
  const [savedFlash, flashSaved] = useSavedFlash();

  // The top bar wraps onto extra rows when space is tight. Measure it so the roll
  // plaque, throw pill and error message always sit below it instead of under it.
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(40);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // 12px top inset of the bar + its height + an 8px gap.
  const belowHeaderTop = 12 + headerHeight + 8;

  const isSheetTraitsMode = Boolean(activeSheet && rollSourceMode === 'traits');
  const { isDisabled, rollBlockedByEmptyTraits } = getRollGate({
    connectionStatus,
    localPendingCount: rollStageStatus.localPendingCount,
    isSheetTraitsMode,
    hasTraitSelection,
    pool,
  });
  const anySpeaking = sortedParticipants.some((p) => speakingDiscordIds.has(p.discordUserId));
  const initButtonLabel =
    activeSheet || initiativeModifier !== 0
      ? `Init ${initiativeModifier >= 0 ? `+${initiativeModifier}` : initiativeModifier}`
      : 'Init 1d10';


  const handleSaveOrPinAction = () => {
    if (activeSheet) {
      onPinCurrentToSheet();
    } else {
      onSaveCurrentUnboundPreset();
    }
    flashSaved();
  };

  const primaryRollCtaText = getRollCtaText({
    blockReason: getRollBlockReason({
      connectionStatus,
      localPendingCount: rollStageStatus.localPendingCount,
    }),
    isSheetTraitsMode,
    hasTraitSelection,
    pool,
    effectivePreviewPool,
    difficulty,
    clampedPreviewRage,
  });

  return (
    <>
      {/* Slim Floating Top Presence & Tracker Bar */}
      <header
        ref={headerRef}
        className="pointer-events-none absolute inset-x-3 top-3 z-hud flex flex-wrap items-center gap-2"
      >
        {/* Left: Compact W20 Crest + Left Pack Drawer Toggle Pill */}
        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
          <div className="w20-obsidian-panel flex h-8 items-center gap-2 rounded-full px-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-red-700/70 bg-red-950/80 text-red-300">
              <Flame className="h-3 w-3" />
            </div>
            <span className="font-display text-xs font-black tracking-widest uppercase text-amber-100">
              W20
            </span>
            <ConnectionDot status={connectionStatus} />
            {!webglReady && (
              <span
                title="3D dice are loading or not available on this device. Rolls still work."
                className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-xs text-stone-300"
              >
                No 3D dice
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onTogglePack}
            aria-expanded={packOpen}
            title="Show or hide the Pack: everyone in this voice channel"
            className={`w20-obsidian-panel flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition hover:border-amber-400/55 ${
              packOpen
                ? '!border-amber-500/50 text-amber-200'
                : anySpeaking
                  ? '!border-emerald-400/75 text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.28)]'
                  : 'text-stone-200'
            }`}
          >
            <Users className="h-3.5 w-3.5 text-amber-300" />
            <span>Pack ({sortedParticipants.length})</span>
            {anySpeaking && !packOpen && (
              <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
            )}
          </button>
        </div>

        {/* Centre: who is rolling. Stays centred; a long seat list scrolls sideways. */}
        <div className="pointer-events-auto flex min-w-[220px] flex-1 justify-center">
          {/* Hot-Seat Switcher */}
          <div className="w20-obsidian-panel flex min-w-0 max-w-full items-center gap-1 rounded-2xl px-1.5 py-1">
            {seats.length >= 2 ? (
              <>
                <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto">
                  {seats.map((seat, idx) => {
                    const seatSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                    const isActive = seat.seatId === activeSeat.seatId;
                    const seatLabel = seatSheet ? seatSheet.name : seat.playerName || 'Seat';
                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        onClick={() => onSelectSeat(seat.seatId)}
                        title={`Switch to Seat ${idx + 1}: ${seatLabel} (Alt+${idx + 1})`}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold transition ${
                          isActive
                            ? 'border border-amber-400/75 bg-red-950/75 text-amber-100 shadow-[0_0_8px_rgba(245,158,11,0.28)]'
                            : 'border border-transparent text-stone-400 hover:bg-zinc-900 hover:text-stone-200'
                        }`}
                      >
                        <span className="font-mono text-xs text-amber-300/80">
                          {idx + 1}.
                        </span>
                        <span className="max-w-[84px] truncate">{seatLabel}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={onOpenRoster}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-stone-700/75 bg-zinc-900/90 px-2 py-0.5 text-xs font-bold text-stone-200 transition hover:border-amber-400/60 hover:text-amber-100"
                  title="Manage table seats & Garou roster"
                >
                  <Users className="h-3 w-3 text-amber-300" />
                  Seats
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={activeSheet ? onOpenSheet : onOpenRoster}
                  className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold text-amber-100 transition hover:bg-zinc-900/80"
                  title={
                    activeSheet
                      ? `Open ${activeSheet.name}'s interactive W20 sheet`
                      : 'Choose or create a character'
                  }
                >
                  <Flame className="h-3 w-3 text-red-400" />
                  <span className="max-w-[110px] truncate">
                    {activeSheet ? activeSheet.name : 'Choose character'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onAddSeatAndOpenRoster}
                  className="flex items-center gap-1 rounded-full border border-amber-500/45 bg-amber-950/35 px-2 py-0.5 text-xs font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/60"
                  title="Add another player on this screen"
                >
                  <Plus className="h-3 w-3" />
                  Seat
                </button>
              </>
            )}

            {activeSheet && (
              <button
                type="button"
                onClick={onOpenSheet}
                className="flex shrink-0 items-center gap-1 rounded-full border border-red-700/65 bg-red-950/65 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-100 transition hover:border-amber-400/75 hover:bg-red-900/70"
                title="Open Interactive W20 Character Sheet"
              >
                Sheet
              </button>
            )}
          </div>
        </div>

        {/* Right: my resources, then table tools. Occasional settings live in one menu.
            If the bar runs out of room, this zone wraps below as a unit. */}
        <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5">
          <PersonalTrackersControl trackers={activeTrackers} onUpdate={onUpdateTrackers} />

          <button
            type="button"
            onClick={onClearTable}
            disabled={!(hasDiceOnTable || activeBanner || rollStageStatus.isRolling)}
            aria-label="Clear dice from the felt"
            title="Clear dice from the felt"
            className="w20-obsidian-panel flex h-8 w-8 items-center justify-center rounded-full text-amber-300 transition hover:not-disabled:border-amber-400/55 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleFeed}
            aria-expanded={feedOpen}
            className={`w20-obsidian-panel flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition hover:border-amber-400/55 ${
              feedOpen ? '!border-amber-500/50 text-amber-200' : 'text-stone-200'
            }`}
          >
            <ScrollText className="h-3.5 w-3.5 text-amber-300" />
            <span>Roll Log ({rollHistoryCount})</span>
          </button>

          <TableSettingsMenu
            muted={sfxPrefs.muted}
            volume={sfxPrefs.volume}
            layoutMode={layoutMode}
            onToggleMute={onToggleMuteSfx}
            onVolumeChange={onSfxVolumeChange}
            onCycleLayoutMode={onCycleLayoutMode}
          />
        </div>
      </header>

      {/* Active 3D Throw & Queue Indicator */}
      {!activeBanner && rollStageStatus.isRolling && (
        <ActiveThrowPill
          activeThrowLabel={rollStageStatus.activeThrowLabel}
          queuedCount={rollStageStatus.queuedCount}
          topOffset={belowHeaderTop}
        />
      )}

      {/* Dismissible Floating Roll Result Plaque */}
      {activeBanner && (
        <RollResultPlaque
          key={activeBanner.id}
          banner={activeBanner}
          onDismiss={onDismissBanner}
          queuedCount={rollStageStatus.queuedCount}
          nextQueuedLabel={rollStageStatus.nextQueuedLabel}
          topOffset={belowHeaderTop}
        />
      )}

      {/* Floating Full-Width Bottom Sheet-Driven Console */}
      <section className="@container w20-obsidian-panel pointer-events-auto absolute inset-x-3 bottom-3 z-hud rounded-2xl px-4 py-2.5">
        {/* Top Slim Strip: 5-Form Switcher + Pinned Sheet Rolls / Quick Rolls */}
        <div className="mb-2 flex items-center gap-2">
          {activeSheet && (
            <div
              className="flex shrink-0 items-center rounded-xl border border-stone-700/75 bg-zinc-950/90 p-0.5"
              role="group"
              aria-label="Garou 5-Form Quick Switcher"
            >
              {W20_FORMS.map((form) => {
                const active = activeSheet.activeForm === form;
                return (
                  <button
                    key={form}
                    type="button"
                    onClick={() => onSetActiveSheetForm(form)}
                    className={`rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-wider transition ${
                      active
                        ? 'bg-gradient-to-b from-red-800 to-red-950 text-amber-100 shadow-[0_0_8px_rgba(185,28,28,0.5)] ring-1 ring-amber-400/50'
                        : 'text-stone-400 hover:text-stone-100'
                    }`}
                  >
                    {formatFormName(form)}
                  </button>
                );
              })}
            </div>
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
              showSavePresetButton={false}
              onTriggerPreset={onTriggerPreset}
              onTriggerResolvedShortcut={onTriggerResolvedShortcut}
              onRemoveSheetShortcut={onRemoveSheetShortcut}
            />
          </div>
        </div>

        {/* Expandable Modifiers Tray */}
        {manualControlsOpen && (
          <div className="mb-2.5 space-y-2 border-t border-amber-500/15 pt-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Either Situational Bonus Dice (Traits Mode) or Raw Pool + Quick Jumps (Manual / Unbound Mode) */}
              {isSheetTraitsMode ? (
                <BonusDiceStepper
                  layout="inline"
                  bonusDice={bonusDice}
                  onSetBonusDice={onSetBonusDice}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <CompactRawPoolStepper
                    pool={pool}
                    editingPool={editingPool}
                    poolInputValue={poolInputValue}
                    onSetPool={onSetPool}
                    onSetEditingPool={onSetEditingPool}
                    onSetPoolInputValue={onSetPoolInputValue}
                    onCommitPoolInput={onCommitPoolInput}
                  />
                  <div className="flex items-center gap-1">
                    {POOL_QUICK_JUMPS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onSetPool(val)}
                        className={`h-7 min-w-[26px] rounded-md border px-1.5 font-mono text-xs font-bold transition ${
                          pool === val
                            ? 'border-amber-400/80 bg-red-900/75 text-amber-100 shadow'
                            : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rage Dice Stepper + Sync */}
              <RageDiceStepper
                layout="inline"
                rageDiceCount={rageDiceCount}
                pool={pool}
                trackerRage={activeTrackers.rage}
                onSetRageDiceCount={onSetRageDiceCount}
              />

              {/* Modifiers: Specialty, +1 Willpower, Wounds, Secret */}
              <RollModifierToggles
                layout="row"
                hasSpecialty={hasSpecialty}
                specialtyFromSheet={isSheetTraitsMode && isAutoSpecialty}
                specialtyReason={specialtyReason}
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
            </div>

            {/* Dual-tone Obsidian / Rage Dice Preview Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
              <div className="flex items-center gap-2">
                <DicePreviewStrip
                  effectivePool={effectivePreviewPool}
                  normalDiceCount={obsidianPreviewCount}
                />
                <span className="font-mono text-stone-300">
                  {isSheetTraitsMode && traitSelection
                    ? traitSelection.formulaSummary
                    : `Base ${pool}d10`}
                  {applyWoundPenalty && activeTrackers.woundPenalty !== 0
                    ? ` -> ${effectivePreviewPool}d10 (${activeTrackers.woundPenalty} wnd)`
                    : ''}
                </span>
              </div>

              {activeSheet && (
                <button
                  type="button"
                  onClick={() => onSetRollSourceMode(isSheetTraitsMode ? 'manual' : 'traits')}
                  className="text-xs font-semibold text-stone-400 underline decoration-stone-600 underline-offset-2 hover:text-amber-200"
                >
                  {isSheetTraitsMode ? 'Enter pool manually' : 'Use sheet traits'}
                </button>
              )}
            </div>

            {/* Label Input + Pin to Sheet / Save Preset */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Roll label"
                value={rollLabel}
                maxLength={120}
                onChange={(e) => onSetRollLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onExecuteRoll();
                  }
                }}
                placeholder={effectiveRollLabel || 'Custom roll label (e.g. Dexterity + Firearms)'}
                className="min-w-0 flex-1 rounded-xl border border-stone-700/75 bg-zinc-950/90 px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75"
              />
              <SavePinButton
                pinsToSheet={Boolean(activeSheet)}
                saved={savedFlash}
                disabled={Boolean(activeSheet && isSheetTraitsMode && !hasTraitSelection)}
                onClick={handleSaveOrPinAction}
              />
            </div>
          </div>
        )}

        {/* Primary Always-Visible Row: composer on the left, actions on the right.
            When they cannot share a line, the actions wrap below as one group. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <div className="flex flex-1 items-center gap-2.5">
          {/* 1-Click Segmented Toggle: Skills vs Numbers */}
          <div
            role="group"
            aria-label="Roll mode: from sheet traits, or a manual pool"
            className="flex h-9 shrink-0 items-center rounded-xl border border-stone-700/80 bg-zinc-950/90 p-0.5"
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
              title={
                activeSheet
                  ? 'Roll from your character sheet: Attribute + Ability'
                  : 'Choose a character to roll from its traits'
              }
              className={`flex h-full items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition ${
                isSheetTraitsMode
                  ? 'bg-gradient-to-b from-amber-500/30 to-amber-900/40 text-amber-100 ring-1 ring-amber-400/60'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span>Traits</span>
            </button>
            <button
              type="button"
              onClick={() => onSetRollSourceMode('manual')}
              title="Enter the number of dice yourself"
              className={`flex h-full items-center gap-1 rounded-lg px-2.5 text-xs font-bold transition ${
                !isSheetTraitsMode
                  ? 'bg-gradient-to-b from-red-800/75 to-red-950/90 text-amber-100 ring-1 ring-amber-400/55'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Hash className="h-3 w-3 text-amber-300" />
              <span>Manual</span>
            </button>
          </div>

          {isSheetTraitsMode && activeSheet && traitSelection ? (
            <DesktopTraitRollBar
              sheet={activeSheet}
              composerAttr={composerAttr}
              composerAbil={composerAbil}
              difficulty={difficulty}
              selection={traitSelection}
              onChangeSelection={onComposerChange}
              onChangeDifficulty={onSetDifficulty}
            />
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {!activeSheet && (
                <button
                  type="button"
                  onClick={onOpenRoster}
                  title="Bind a Garou character sheet to roll by Attribute + Skill"
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/60 bg-gradient-to-b from-red-950/80 to-zinc-950 px-2.5 text-xs font-bold text-amber-100 shadow-[0_0_12px_rgba(185,28,28,0.28)] transition hover:border-amber-400"
                >
                  <Flame className="h-3.5 w-3.5 text-red-400" />
                  <span className="hidden xl:inline">Choose character</span>
                </button>
              )}
              <CompactRawPoolStepper
                pool={pool}
                editingPool={editingPool}
                poolInputValue={poolInputValue}
                onSetPool={onSetPool}
                onSetEditingPool={onSetEditingPool}
                onSetPoolInputValue={onSetPoolInputValue}
                onCommitPoolInput={onCommitPoolInput}
              />
              <div className="hidden items-center gap-1 md:flex">
                {POOL_QUICK_JUMPS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onSetPool(val)}
                    title={`Set pool to ${val}d10`}
                    className={`h-8 min-w-[26px] rounded-lg border px-1.5 font-mono text-xs font-bold transition ${
                      pool === val
                        ? 'border-amber-400/80 bg-red-900/75 text-amber-100 shadow'
                        : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              <DifficultyQuickControl
                difficulty={difficulty}
                onChangeDifficulty={onSetDifficulty}
              />
            </div>
          )}

          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {/* Hardcoded 1-Click Initiative Button */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={onRollInitiative}
            title={`Roll W20 Initiative (${initiativeFormula})`}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-stone-700/80 bg-zinc-950/90 px-2.5 text-xs font-bold text-amber-100 transition hover:not-disabled:border-amber-500/55 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Zap className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>{initButtonLabel}</span>
          </button>

          {/* Quick Pin Icon Button (when Sheet is active) */}
          {activeSheet && (
            <button
              type="button"
              onClick={handleSaveOrPinAction}
              disabled={isSheetTraitsMode && !hasTraitSelection}
              title={
                savedFlash
                  ? 'Pinned to Sheet Rolls!'
                  : `Pin "${effectiveRollLabel || 'Roll'}" (Diff ${difficulty}) to Sheet Rolls`
              }
              aria-label="Pin current roll to sheet"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-700/80 bg-zinc-950/90 text-amber-300 transition hover:border-amber-400/75 hover:bg-amber-950/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savedFlash ? (
                <Check className="h-4 w-4 text-emerald-300" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Modifiers Drawer Toggle */}
          <button
            type="button"
            onClick={() => onSetManualControlsOpen((v) => !v)}
            aria-expanded={manualControlsOpen}
            className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
              manualControlsOpen
                ? 'border-amber-400/75 bg-amber-950/55 text-amber-100'
                : 'border-stone-700/80 bg-zinc-950/90 text-stone-300 hover:border-amber-500/55 hover:text-amber-100'
            }`}
            title="Toggle Bonus Dice, Rage Dice, Specialty, +1 Willpower & Secret modifiers"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-amber-300" />
            <span>Modifiers</span>
            {activeModifierCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-xs font-black text-zinc-950">
                {activeModifierCount}
              </span>
            )}
          </button>

          {/* Crimson Roll CTA */}
          <button
            type="button"
            disabled={isDisabled || rollBlockedByEmptyTraits}
            onClick={onExecuteRoll}
            title={
              effectiveRollLabel
                ? `Roll ${effectiveRollLabel}: ${effectivePreviewPool}d10 at Difficulty ${difficulty}`
                : undefined
            }
            className="w20-crimson-seal font-display flex h-11 min-w-[11rem] shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-sm font-black tracking-widest uppercase text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Dices className={`h-5 w-5 shrink-0 ${isThrowing ? 'animate-spin' : ''}`} />
            <span>{primaryRollCtaText}</span>
            {rollStageStatus.localPendingCount > 0 && (
              <span className="rounded-full bg-amber-300/20 px-1.5 py-0.5 font-mono text-xs font-extrabold text-amber-200">
                +{rollStageStatus.localPendingCount}
              </span>
            )}
          </button>
          </div>
        </div>
      </section>
    </>
  );
};
