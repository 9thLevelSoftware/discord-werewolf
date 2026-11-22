import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Dices,
  Eraser,
  EyeOff,
  Flame,
  Hash,
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
      <span className="font-display text-[10px] font-bold tracking-wider uppercase text-amber-200/80">
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
          className="font-display w-12 bg-transparent text-center text-base font-black text-amber-100 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            onSetPoolInputValue(String(pool));
            onSetEditingPool(true);
          }}
          title="Click to type exact d10 pool (1-30)"
          className="flex min-w-[44px] items-baseline justify-center gap-0.5 px-1 text-amber-100 hover:text-amber-300"
        >
          <span className="font-display text-base font-black leading-none">{pool}</span>
          <span className="font-mono text-[10px] font-bold text-stone-400">d10</span>
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
  effectivePreviewPool,
  clampedPreviewRage,
  obsidianPreviewCount,
  activeModifierCount,
  composerAttr,
  composerAbil,
  onCycleLayoutMode,
  onToggleFeed,
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
  const [savedFlash, setSavedFlash] = useState(false);
  const [packPopoverOpen, setPackPopoverOpen] = useState(false);
  const packPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!packPopoverOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (packPopoverRef.current && !packPopoverRef.current.contains(e.target as Node)) {
        setPackPopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPackPopoverOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [packPopoverOpen]);

  const isSheetTraitsMode = Boolean(activeSheet && rollSourceMode === 'traits');
  const isDisabled = isThrowing || connectionStatus !== 'authenticated';
  const rollBlockedByEmptyTraits = isSheetTraitsMode && (!hasTraitSelection || pool <= 0);
  const initButtonLabel =
    activeSheet || initiativeModifier !== 0
      ? `Init ${initiativeModifier >= 0 ? `+${initiativeModifier}` : initiativeModifier}`
      : 'Init 1d10';

  const layoutLabel =
    layoutMode === 'auto' ? 'Auto' : layoutMode === 'desktop' ? 'PC' : 'Mobile';

  const handleSaveOrPinAction = () => {
    if (activeSheet) {
      onPinCurrentToSheet();
    } else {
      onSaveCurrentUnboundPreset();
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const primaryRollCtaText = isThrowing
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
      {/* Slim Floating Top Presence & Tracker Bar */}
      <header className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-center justify-between gap-2">
        {/* Left: W20 Crest + Voice Participant Strip + Full Pack Popover */}
        <div
          ref={packPopoverRef}
          className="w20-obsidian-panel pointer-events-auto relative flex min-w-[200px] max-w-full flex-1 items-center gap-2 rounded-2xl px-3 py-1.5"
        >
          <div className="flex shrink-0 items-center gap-2 border-r border-amber-500/20 pr-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-red-700/70 bg-red-950/80 text-red-300">
              <Flame className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-xs font-black tracking-widest uppercase text-amber-100">
              W20
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                connectionStatus === 'authenticated'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                  : 'animate-pulse bg-amber-400'
              }`}
              title={`Connection: ${connectionStatus}`}
            />
            {!webglReady && (
              <span className="rounded bg-zinc-800/90 px-1.5 py-0.5 text-[9px] text-stone-400">
                2D RNG
              </span>
            )}
          </div>

          <div className="w20-thin-scrollbar flex min-w-0 max-h-[68px] flex-1 flex-wrap items-center gap-1.5 overflow-y-auto pr-1">
            {sortedParticipants.map((p) => {
              const isSpeaking = speakingDiscordIds.has(p.discordUserId);
              const label = p.characterName
                ? `${p.characterName} (${p.displayName})`
                : p.displayName;
              const isLocalSeat =
                p.discordUserId === session.userId && Boolean(p.seatId);
              const isCurrentActiveSeat =
                isLocalSeat && p.seatId === activeSeat.seatId;

              return (
                <div
                  key={p.participantKey ?? p.discordUserId}
                  onClick={
                    isLocalSeat && p.seatId
                      ? () => onSelectSeat(p.seatId!)
                      : undefined
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 transition ${
                    isSpeaking
                      ? 'border-emerald-400/80 bg-emerald-950/45 shadow-[0_0_10px_rgba(52,211,153,0.28)]'
                      : isCurrentActiveSeat
                        ? 'border-amber-500/55 bg-zinc-900/90'
                        : 'border-stone-700/60 bg-zinc-950/75'
                  } ${p.isConnected ? '' : 'opacity-45'} ${
                    isLocalSeat ? 'cursor-pointer hover:border-amber-400/70' : ''
                  }`}
                  title={label}
                >
                  <div className="relative">
                    <ParticipantAvatar
                      name={label}
                      avatarUrl={p.avatarUrl}
                      isSpeaking={isSpeaking}
                      isConnected={p.isConnected}
                      sizeClass="h-6 w-6"
                    />
                    {isSpeaking && (
                      <Volume2 className="absolute -right-1 -bottom-1 h-2.5 w-2.5 rounded-full bg-emerald-400 p-0.5 text-zinc-950" />
                    )}
                  </div>
                  <span className="max-w-[120px] truncate text-[11px] font-semibold text-stone-200">
                    {label}
                  </span>
                  {p.activeForm && (
                    <span className="rounded border border-red-800/50 bg-red-950/80 px-1.5 py-0.2 font-display text-[9px] font-bold uppercase tracking-wide text-amber-200">
                      {formatFormName(p.activeForm)}
                    </span>
                  )}
                  <div className="hidden items-center gap-1 font-mono text-[9px] text-stone-400 md:flex">
                    <span className="text-red-300">R{p.trackers.rage}</span>
                    <span className="text-amber-200">G{p.trackers.gnosis}</span>
                    <span className="text-indigo-200">W{p.trackers.willpower}</span>
                    {p.trackers.woundPenalty !== 0 && (
                      <span className="rounded bg-red-950 px-1 font-bold text-red-300">
                        {p.trackers.woundPenalty}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setPackPopoverOpen((v) => !v)}
            aria-expanded={packPopoverOpen}
            title="View all connected players and table seats"
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition ${
              packPopoverOpen
                ? 'border-amber-400/75 bg-amber-950/55 text-amber-100'
                : 'border-stone-700/80 bg-zinc-950/85 text-stone-300 hover:border-amber-500/55 hover:text-amber-100'
            }`}
          >
            <Users className="h-3 w-3 text-amber-300" />
            <span>Pack ({sortedParticipants.length})</span>
          </button>

          {packPopoverOpen && (
            <div className="w20-obsidian-panel absolute top-full left-0 z-50 mt-2 w-[min(92vw,420px)] rounded-2xl p-3 shadow-2xl">
              <div className="flex items-center justify-between pb-2">
                <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200">
                  Table Players &amp; Pack ({sortedParticipants.length})
                </span>
                <button
                  type="button"
                  onClick={() => setPackPopoverOpen(false)}
                  aria-label="Close Pack list"
                  className="rounded p-1 text-stone-400 hover:bg-zinc-800 hover:text-stone-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="w20-gold-divider mb-2" />
              <div className="w20-thin-scrollbar max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {sortedParticipants.map((p) => {
                  const isSpeaking = speakingDiscordIds.has(p.discordUserId);
                  const label = p.characterName
                    ? `${p.characterName} (${p.displayName})`
                    : p.displayName;
                  const isLocalSeat =
                    p.discordUserId === session.userId && Boolean(p.seatId);
                  const isCurrentActiveSeat =
                    isLocalSeat && p.seatId === activeSeat.seatId;

                  return (
                    <div
                      key={`pop-${p.participantKey ?? p.discordUserId}`}
                      onClick={
                        isLocalSeat && p.seatId
                          ? () => {
                              onSelectSeat(p.seatId!);
                              setPackPopoverOpen(false);
                            }
                          : undefined
                      }
                      className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${
                        isSpeaking
                          ? 'border-emerald-400/80 bg-emerald-950/35'
                          : isCurrentActiveSeat
                            ? 'border-amber-500/60 bg-red-950/25'
                            : 'border-stone-800 bg-zinc-950/85'
                      } ${p.isConnected ? '' : 'opacity-50'} ${
                        isLocalSeat ? 'cursor-pointer hover:border-amber-400/75' : ''
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <ParticipantAvatar
                          name={label}
                          avatarUrl={p.avatarUrl}
                          isSpeaking={isSpeaking}
                          isConnected={p.isConnected}
                          sizeClass="h-7 w-7 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-amber-50">
                              {label}
                            </span>
                            {p.activeForm && (
                              <span className="rounded border border-red-800/50 bg-red-950/80 px-1.5 py-0.2 font-display text-[9px] font-bold uppercase text-amber-200">
                                {formatFormName(p.activeForm)}
                              </span>
                            )}
                            {isCurrentActiveSeat && (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-200">
                                Active Seat
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
                      <span
                        className={`shrink-0 text-[9px] font-bold uppercase ${
                          p.isConnected ? 'text-emerald-400' : 'text-stone-500'
                        }`}
                      >
                        {p.isConnected ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Hot-Seat Switcher + Sheet + SFX + Trackers + View Mode + Clear + Feed */}
        <div className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {/* Hot-Seat Switcher */}
          <div className="w20-obsidian-panel flex items-center gap-1 rounded-2xl px-1.5 py-1">
            {seats.length >= 2 ? (
              <>
                <div className="w20-thin-scrollbar flex max-w-[380px] max-h-[54px] flex-wrap items-center gap-1 overflow-y-auto">
                  {seats.map((seat, idx) => {
                    const seatSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                    const isActive = seat.seatId === activeSeat.seatId;
                    const seatLabel = seatSheet ? seatSheet.name : seat.playerName || 'Unbound';
                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        onClick={() => onSelectSeat(seat.seatId)}
                        title={`Switch to Seat ${idx + 1}: ${seatLabel} (Alt+${idx + 1})`}
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${
                          isActive
                            ? 'border border-amber-400/75 bg-red-950/75 text-amber-100 shadow-[0_0_8px_rgba(245,158,11,0.28)]'
                            : 'border border-transparent text-stone-400 hover:bg-zinc-900 hover:text-stone-200'
                        }`}
                      >
                        <span className="font-mono text-[10px] text-amber-300/80">
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
                  className="flex shrink-0 items-center gap-1 rounded-full border border-stone-700/75 bg-zinc-900/90 px-2 py-0.5 text-[10px] font-bold text-stone-200 transition hover:border-amber-400/60 hover:text-amber-100"
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
                  className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-amber-100 transition hover:bg-zinc-900/80"
                  title={
                    activeSheet
                      ? `Open ${activeSheet.name}'s interactive W20 sheet`
                      : 'Select or create a Garou sheet'
                  }
                >
                  <Flame className="h-3 w-3 text-red-400" />
                  <span className="max-w-[110px] truncate">
                    {activeSheet ? activeSheet.name : 'Select Garou'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onAddSeatAndOpenRoster}
                  className="flex items-center gap-1 rounded-full border border-amber-500/45 bg-amber-950/35 px-2 py-0.5 text-[10px] font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/60"
                  title="Add another hot-seat Garou to this table"
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
                className="flex shrink-0 items-center gap-1 rounded-full border border-red-700/65 bg-red-950/65 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-100 transition hover:border-amber-400/75 hover:bg-red-900/70"
                title="Open Interactive W20 Character Sheet"
              >
                Sheet
              </button>
            )}
          </div>

          {/* SFX Volume Pill */}
          <div className="w20-obsidian-panel flex items-center gap-1.5 rounded-full px-2.5 py-1.5">
            <button
              type="button"
              onClick={onToggleMuteSfx}
              aria-label={sfxPrefs.muted ? 'Unmute dice sound effects' : 'Mute dice sound effects'}
              title={sfxPrefs.muted ? 'Unmute dice SFX' : 'Mute dice SFX'}
              className="flex items-center justify-center rounded-full text-stone-200 transition hover:text-amber-200"
            >
              {sfxPrefs.muted ? (
                <VolumeX className="h-3.5 w-3.5 text-red-400" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-amber-300" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={sfxPrefs.muted ? 0 : Math.round(sfxPrefs.volume * 100)}
              onChange={(e) => onSfxVolumeChange(Number(e.target.value))}
              aria-label="Dice sound volume"
              className="hidden h-1 w-14 cursor-pointer accent-amber-400 xl:block"
            />
          </div>

          {/* Synced Personal W20 Dot Trackers */}
          <PersonalTrackersControl trackers={activeTrackers} onUpdate={onUpdateTrackers} />

          {/* Layout View Mode Toggle (Auto / PC / Mobile) */}
          <button
            type="button"
            onClick={onCycleLayoutMode}
            title={`Layout View Mode: ${layoutLabel} (click to cycle Auto / Mobile / PC)`}
            className="w20-obsidian-panel flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-stone-200 transition hover:border-amber-400/55 hover:text-amber-100"
          >
            {layoutMode === 'mobile' ? (
              <Smartphone className="h-3.5 w-3.5 text-amber-300" />
            ) : (
              <Monitor className="h-3.5 w-3.5 text-amber-300" />
            )}
            <span>{layoutLabel}</span>
          </button>

          {(hasDiceOnTable || activeBanner) && (
            <button
              type="button"
              onClick={onClearTable}
              className="w20-obsidian-panel flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-stone-200 transition hover:border-amber-400/55"
            >
              <Eraser className="h-3.5 w-3.5 text-amber-300" />
              <span className="hidden xl:inline">Clear Felt</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFeed}
            className={`w20-obsidian-panel flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition hover:border-amber-400/55 ${
              feedOpen ? '!border-amber-500/50 text-amber-200' : 'text-stone-200'
            }`}
          >
            <ScrollText className="h-3.5 w-3.5 text-amber-300" />
            <span>Feed ({rollHistoryCount})</span>
          </button>
        </div>
      </header>

      {/* Server Error Toast */}
      {lastError && (
        <div className="w20-obsidian-panel absolute top-16 left-4 z-30 !border-red-600/80 rounded-xl px-3 py-1.5 text-xs text-red-200">
          {lastError.message}
        </div>
      )}

      {/* Dismissible Floating Roll Result Plaque */}
      {activeBanner && (
        <RollResultPlaque banner={activeBanner} onDismiss={onDismissBanner} />
      )}

      {/* Floating Bottom Sheet-Driven Console */}
      <section className="w20-obsidian-panel pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(97%,1020px)] -translate-x-1/2 rounded-2xl px-3.5 py-2.5">
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
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
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
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-[10px] font-bold tracking-wider uppercase text-amber-200/80">
                      Bonus / Penalty
                    </span>
                    <div className="flex h-8 items-center gap-1 rounded-xl border border-amber-500/35 bg-zinc-950/90 px-1.5 shadow-inner">
                      <button
                        type="button"
                        onClick={() => onSetBonusDice((b) => Math.max(-15, b - 1))}
                        className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
                        aria-label="Decrease Bonus Dice"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetBonusDice(0)}
                        title="Click to reset situational bonus dice to 0"
                        className={`font-display min-w-[42px] px-1 text-center text-sm font-black ${
                          bonusDice > 0
                            ? 'text-emerald-300'
                            : bonusDice < 0
                              ? 'text-rose-300'
                              : 'text-stone-300'
                        }`}
                      >
                        {bonusDice > 0 ? `+${bonusDice}` : bonusDice}d
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetBonusDice((b) => Math.min(15, b + 1))}
                        className="rounded-lg bg-zinc-900 p-1 text-stone-300 hover:bg-zinc-800 hover:text-amber-200"
                        aria-label="Increase Bonus Dice"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {bonusDice !== 0 && (
                      <button
                        type="button"
                        onClick={() => onSetBonusDice(0)}
                        aria-label="Reset bonus dice"
                        className="rounded-lg border border-stone-700 bg-zinc-900 p-1 text-stone-400 hover:text-stone-100"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
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
                        className={`h-7 min-w-[26px] rounded-md border px-1.5 font-mono text-[11px] font-bold transition ${
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
              <div className="flex h-8 items-center gap-1 rounded-xl border border-red-900/65 bg-red-950/30 px-2 text-xs">
                <span className="font-display text-[10px] font-bold uppercase text-red-300">
                  Rage
                </span>
                <button
                  type="button"
                  onClick={() => onSetRageDiceCount((r) => Math.max(0, r - 1))}
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Decrease Rage Dice"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="font-display w-5 text-center text-sm font-black text-red-300">
                  {rageDiceCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSetRageDiceCount((r) => Math.min(Math.max(0, Math.min(30, pool)), r + 1))
                  }
                  className="rounded bg-zinc-900 p-0.5 text-stone-300 hover:bg-zinc-800"
                  aria-label="Increase Rage Dice"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSetRageDiceCount(Math.min(Math.max(0, Math.min(30, pool)), activeTrackers.rage))
                  }
                  className="ml-0.5 rounded border border-red-700/65 bg-red-950/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-200 hover:bg-red-900"
                  title="Sync Rage dice to active Garou temporary Rage"
                >
                  Sync
                </button>
              </div>

              {/* Modifiers: Specialty, +1 Willpower, Wounds, Secret */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleSpecialty}
                  title={specialtyReason ?? 'Exploding 10s (specialty matches roll)'}
                  className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition ${
                    hasSpecialty
                      ? 'border-amber-400/80 bg-amber-950/65 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.28)]'
                      : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Specialty</span>
                  {isSheetTraitsMode && isAutoSpecialty && hasSpecialty && (
                    <span className="rounded bg-amber-400/20 px-1 text-[9px] font-extrabold text-amber-200">
                      Sheet
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={activeTrackers.willpower <= 0 && !spendWillpower}
                  onClick={onToggleSpendWillpower}
                  title={
                    activeTrackers.willpower <= 0
                      ? 'No temporary Willpower remaining'
                      : 'Spend 1 temporary Willpower for +1 automatic success'
                  }
                  className={`h-8 rounded-lg border px-2 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    spendWillpower
                      ? 'border-indigo-400/80 bg-indigo-950/70 text-indigo-200 shadow-[0_0_10px_rgba(129,140,248,0.28)]'
                      : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  +1 Willpower
                </button>

                <button
                  type="button"
                  onClick={onToggleApplyWoundPenalty}
                  className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition ${
                    applyWoundPenalty
                      ? 'border-rose-500/65 bg-rose-950/55 text-rose-200'
                      : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  <ShieldAlert className="h-3 w-3" />
                  Wounds
                  {activeTrackers.woundPenalty !== 0
                    ? ` (${activeTrackers.woundPenalty})`
                    : ''}
                </button>

                <button
                  type="button"
                  onClick={onToggleSecretRoll}
                  className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition ${
                    isSecretRoll
                      ? 'border-amber-400/80 bg-amber-950/65 text-amber-200'
                      : 'border-stone-800 bg-zinc-950/85 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  <EyeOff className="h-3 w-3" />
                  Secret
                </button>
              </div>
            </div>

            {/* Dual-tone Obsidian / Rage Dice Preview Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-400">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(effectivePreviewPool, 20) }, (_, idx) => {
                    const isRage = idx >= obsidianPreviewCount;
                    return (
                      <span
                        key={idx}
                        className={`h-1.5 w-2 rounded-xs ${
                          isRage
                            ? 'bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.75)]'
                            : 'bg-stone-500/80'
                        }`}
                      />
                    );
                  })}
                  {effectivePreviewPool > 20 && (
                    <span className="font-mono text-[9px] text-stone-400">
                      +{effectivePreviewPool - 20}
                    </span>
                  )}
                </div>
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
                  className="text-[10px] font-semibold text-stone-400 underline decoration-stone-600 underline-offset-2 hover:text-amber-200"
                >
                  {isSheetTraitsMode ? 'Raw Pool Override' : 'Use Sheet Traits'}
                </button>
              )}
            </div>

            {/* Label Input + Pin to Sheet / Save Preset */}
            <div className="flex items-center gap-2">
              <input
                type="text"
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
                className="min-w-0 flex-1 rounded-xl border border-stone-700/75 bg-zinc-950/90 px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveOrPinAction}
                disabled={Boolean(activeSheet && isSheetTraitsMode && !hasTraitSelection)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/30 px-3 py-1.5 text-[11px] font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/55 disabled:opacity-40"
              >
                {savedFlash ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : activeSheet ? (
                  <Pin className="h-3.5 w-3.5" />
                ) : (
                  <BookmarkPlus className="h-3.5 w-3.5" />
                )}
                {savedFlash
                  ? activeSheet
                    ? 'Pinned!'
                    : 'Saved!'
                  : activeSheet
                    ? 'Pin to Sheet'
                    : 'Save Preset'}
              </button>
            </div>
          </div>
        )}

        {/* Primary Always-Visible Row */}
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          {/* 1-Click Segmented Toggle: Skills vs Numbers */}
          <div
            role="group"
            aria-label="Dice Roll Mode: Skills or Numbers"
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
                  ? 'Roll using Character Sheet Attribute + Skill traits'
                  : 'Select a Garou sheet to roll by Attribute + Skill'
              }
              className={`flex h-full items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition ${
                isSheetTraitsMode
                  ? 'bg-gradient-to-b from-amber-500/30 to-amber-900/40 text-amber-100 ring-1 ring-amber-400/60'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span>Skills</span>
            </button>
            <button
              type="button"
              onClick={() => onSetRollSourceMode('manual')}
              title="Roll raw d10 pool by direct number count"
              className={`flex h-full items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition ${
                !isSheetTraitsMode
                  ? 'bg-gradient-to-b from-red-800/75 to-red-950/90 text-amber-100 ring-1 ring-amber-400/55'
                  : 'text-stone-400 hover:text-stone-100'
              }`}
            >
              <Hash className="h-3 w-3 text-amber-300" />
              <span>Numbers</span>
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
                  <span className="hidden xl:inline">Select Garou</span>
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
                    className={`h-8 min-w-[26px] rounded-lg border px-1.5 font-mono text-[11px] font-bold transition ${
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

          {/* Hardcoded 1-Click Initiative Button */}
          <button
            type="button"
            disabled={isDisabled}
            onClick={onRollInitiative}
            title={`Roll W20 Initiative (${initiativeFormula})`}
            className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-amber-500/65 bg-gradient-to-b from-amber-950/75 to-zinc-950 px-2.5 text-xs font-extrabold tracking-wide text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.18)] transition hover:border-amber-400 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
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
            className="w20-crimson-seal font-display flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-black tracking-widest uppercase text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Dices className="h-4 w-4 shrink-0" />
            <span>{primaryRollCtaText}</span>
          </button>

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
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[10px] font-black text-zinc-950">
                {activeModifierCount}
              </span>
            )}
          </button>
        </div>
      </section>
    </>
  );
};
