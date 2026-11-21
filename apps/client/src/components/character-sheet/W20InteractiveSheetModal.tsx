import React, { useEffect, useMemo, useRef, useState } from 'react';
import { computeUserSheetStats, formatSyncCode } from '@w20-vtt/core';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Flame,
  KeyRound,
  Loader2,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { useViewportLayout } from '../../hooks/useViewportLayout';
import {
  type SheetRollRequest,
  type SheetSaveStatus,
  useCharacterSheetStore,
} from '../../store/useCharacterSheetStore';
import { SheetPageOneCore } from './SheetPageOneCore';
import { SheetPageTwoTactical } from './SheetPageTwoTactical';
import { formatFormName, formatTraitName } from './sheetShared';

type DesktopPage = 'page1' | 'page2';
type MobileSectionTab =
  | 'identity'
  | 'attributes'
  | 'abilities'
  | 'vitals'
  | 'forms'
  | 'combat_gifts';

const MOBILE_TABS: readonly { key: MobileSectionTab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'attributes', label: 'Attributes' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'vitals', label: 'Vitals' },
  { key: 'forms', label: 'Forms' },
  { key: 'combat_gifts', label: 'Combat & Gifts' },
];

const SAVE_STATUS_META: Record<
  SheetSaveStatus,
  { label: string; classes: string; spinning?: boolean }
> = {
  idle: {
    label: 'Ready',
    classes: 'border-stone-700/70 bg-zinc-900/80 text-stone-300',
  },
  saving: {
    label: 'Saving...',
    classes: 'border-amber-500/60 bg-amber-950/50 text-amber-200',
    spinning: true,
  },
  saved: {
    label: 'Saved',
    classes: 'border-emerald-600/60 bg-emerald-950/50 text-emerald-200',
  },
  local_only: {
    label: 'Local Cache',
    classes: 'border-cyan-600/60 bg-cyan-950/50 text-cyan-200',
  },
  error: {
    label: 'Save Error',
    classes: 'border-red-600/70 bg-red-950/60 text-red-200',
  },
};

export interface W20InteractiveSheetModalProps {
  onRollFromSheet: (req: SheetRollRequest) => void;
}

export const W20InteractiveSheetModal: React.FC<W20InteractiveSheetModalProps> = ({
  onRollFromSheet,
}) => {
  const { isMobile } = useViewportLayout();

  const initializedUserId = useCharacterSheetStore((s) => s.initializedUserId);
  const sheetModalOpen = useCharacterSheetStore((s) => s.sheetModalOpen);
  const sheetsById = useCharacterSheetStore((s) => s.sheetsById);
  const seats = useCharacterSheetStore((s) => s.seats);
  const activeSeatId = useCharacterSheetStore((s) => s.activeSeatId);
  const saveStatus = useCharacterSheetStore((s) => s.saveStatus);
  const errorMessage = useCharacterSheetStore((s) => s.errorMessage);

  const setActiveSeat = useCharacterSheetStore((s) => s.setActiveSeat);
  const setSheetModalOpen = useCharacterSheetStore((s) => s.setSheetModalOpen);
  const setRosterModalOpen = useCharacterSheetStore((s) => s.setRosterModalOpen);
  const updateSheet = useCharacterSheetStore((s) => s.updateSheet);
  const generateSyncCode = useCharacterSheetStore((s) => s.generateSyncCode);
  const revokeSyncCode = useCharacterSheetStore((s) => s.revokeSyncCode);
  const exportSheetJson = useCharacterSheetStore((s) => s.exportSheetJson);
  const setActiveSheetForm = useCharacterSheetStore((s) => s.setActiveSheetForm);
  const pinShortcutToActiveSheet = useCharacterSheetStore((s) => s.pinShortcutToActiveSheet);
  const removeShortcutFromActiveSheet = useCharacterSheetStore(
    (s) => s.removeShortcutFromActiveSheet
  );

  const [desktopPage, setDesktopPage] = useState<DesktopPage>('page1');
  const [mobileTab, setMobileTab] = useState<MobileSectionTab>('identity');
  const [shareOpen, setShareOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [busySync, setBusySync] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shareOpen) return;
    const handlePointerDown = (ev: PointerEvent) => {
      if (shareRef.current && !shareRef.current.contains(ev.target as Node)) {
        setShareOpen(false);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setShareOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shareOpen]);

  const activeSeat = seats.find((s) => s.seatId === activeSeatId) ?? seats[0];
  const activeSheet =
    activeSeat?.sheetId && sheetsById[activeSeat.sheetId]
      ? sheetsById[activeSeat.sheetId]
      : undefined;

  const stats = useMemo(
    () => (activeSheet ? computeUserSheetStats(activeSheet) : null),
    [activeSheet]
  );

  if (!sheetModalOpen) return null;

  const handleRoll = (req: SheetRollRequest) => {
    onRollFromSheet(req);
    setSheetModalOpen(false);
  };

  const handleOpenRoster = () => {
    setShareOpen(false);
    setSheetModalOpen(false);
    setRosterModalOpen(true);
  };

  const handleCopySyncCode = async (code: string) => {
    const formatted = formatSyncCode(code);
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Fallback ignored if clipboard blocked inside iframe
    }
  };

  const handleGenerateCode = async () => {
    if (!activeSheet) return;
    setBusySync(true);
    try {
      await generateSyncCode(activeSheet.id);
    } finally {
      setBusySync(false);
    }
  };

  const handleRevokeCode = async () => {
    if (!activeSheet) return;
    setBusySync(true);
    try {
      await revokeSyncCode(activeSheet.id);
    } finally {
      setBusySync(false);
    }
  };

  const isOwner = Boolean(
    activeSheet && initializedUserId && activeSheet.ownerDiscordId === initializedUserId
  );
  const activeSyncCode = activeSheet?.syncCode ?? activeSeat?.syncCode ?? null;
  const statusMeta = SAVE_STATUS_META[saveStatus];

  const renderSharePopover = () => {
    if (!shareOpen || !activeSheet) return null;
    return (
      <div className="w20-obsidian-panel absolute right-0 top-full z-50 mt-2 w-72 rounded-xl p-3 text-xs shadow-2xl">
        <div className="flex items-center justify-between pb-2">
          <span className="flex items-center gap-1.5 font-display text-xs font-bold uppercase text-amber-200">
            <KeyRound className="h-3.5 w-3.5 text-amber-300" />
            Sync Code &amp; Backup
          </span>
          <button
            type="button"
            onClick={() => setShareOpen(false)}
            className="text-stone-400 hover:text-stone-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="w20-gold-divider mb-2.5" />

        {activeSyncCode ? (
          <div className="space-y-2 rounded-lg border border-amber-500/35 bg-zinc-950/90 p-2.5">
            <div className="text-[10px] uppercase text-stone-400">
              Cross-Account Sync Code
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-base font-black tracking-widest text-amber-200">
                {formatSyncCode(activeSyncCode)}
              </span>
              <button
                type="button"
                onClick={() => void handleCopySyncCode(activeSyncCode)}
                className="flex items-center gap-1 rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-[10px] font-bold text-stone-200 hover:border-amber-400/60"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            {isOwner ? (
              <button
                type="button"
                disabled={busySync}
                onClick={() => void handleRevokeCode()}
                className="w-full rounded border border-red-800/70 bg-red-950/40 px-2 py-1 text-[10px] font-bold text-red-200 hover:bg-red-900/50 disabled:opacity-45"
              >
                {busySync ? 'Revoking...' : 'Revoke Sync Code'}
              </button>
            ) : (
              <p className="text-[10px] text-cyan-300">
                Synced from owner — edits save back to this code.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-stone-800 bg-zinc-950/90 p-2.5">
            <p className="text-[10px] text-stone-400">
              Generate an 8-char sync code to access and edit this Garou sheet from another Discord account.
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={busySync}
                onClick={() => void handleGenerateCode()}
                className="w20-crimson-seal w-full rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-amber-50 disabled:opacity-45"
              >
                {busySync ? 'Generating...' : 'Generate Sync Code'}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => exportSheetJson(activeSheet.id)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-stone-200 hover:border-amber-500/50"
        >
          <Download className="h-3.5 w-3.5 text-amber-300" />
          Export .w20sheet.json
        </button>

        {isMobile && (
          <button
            type="button"
            onClick={handleOpenRoster}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-bold text-stone-200 hover:border-amber-500/50"
          >
            <Users className="h-3.5 w-3.5 text-amber-300" />
            Roster &amp; Table Seats
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className={
        isMobile
          ? 'fixed inset-0 z-50 flex flex-col bg-[#070609]'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm'
      }
    >
      <div
        className={
          isMobile
            ? 'flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070609] text-stone-100'
            : 'w20-obsidian-panel flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl text-stone-100'
        }
      >
        {/* HEADER */}
        {isMobile ? (
          <header className="sticky top-0 z-20 shrink-0 border-b border-amber-500/20 bg-zinc-950/95 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Flame className="h-4 w-4 shrink-0 text-red-400" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-display truncate text-sm font-black uppercase text-amber-100">
                      {activeSheet ? activeSheet.name || 'New Garou' : 'Unbound Seat'}
                    </h2>
                    {activeSheet && (
                      <span className="shrink-0 rounded-full border border-red-700/70 bg-red-950/80 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                        {formatFormName(activeSheet.activeForm)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.classes}`}
                >
                  {statusMeta.spinning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  {statusMeta.label}
                </span>

                {activeSheet && (
                  <div ref={shareRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShareOpen((v) => !v)}
                      className="rounded-lg border border-stone-700 bg-zinc-900 p-1.5 text-amber-200"
                      aria-label="Sync Code & Share"
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    {renderSharePopover()}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSheetModalOpen(false)}
                  className="rounded-lg border border-stone-700 bg-zinc-900 p-1.5 text-stone-300"
                  aria-label="Close Sheet"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {seats.length >= 2 && (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {seats.map((seat) => {
                  const bound = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                  const active = seat.seatId === activeSeatId;
                  return (
                    <button
                      key={seat.seatId}
                      type="button"
                      onClick={() => setActiveSeat(seat.seatId)}
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                        active
                          ? 'border-amber-400 bg-amber-950/50 text-amber-100'
                          : 'border-stone-800 bg-zinc-900 text-stone-400'
                      }`}
                    >
                      {seat.playerName}: {bound ? bound.name : 'Unbound'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 6 Thumb-Friendly Section Tabs */}
            {activeSheet && (
              <nav className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
                {MOBILE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setMobileTab(tab.key)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      mobileTab === tab.key
                        ? 'bg-red-800 text-amber-50 shadow'
                        : 'border border-stone-800 bg-zinc-900/90 text-stone-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            )}
          </header>
        ) : (
          <header className="shrink-0 border-b border-amber-500/20 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left: Title + Form + Page Tabs */}
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-red-700/70 bg-red-950/80 text-red-300">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-sm font-black tracking-wider uppercase text-amber-100">
                        {activeSheet ? activeSheet.name || 'New Garou' : 'Unbound Seat'}
                      </h2>
                      {activeSheet && (
                        <span className="rounded-full border border-red-700/70 bg-red-950/80 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                          {formatFormName(activeSheet.activeForm)}
                        </span>
                      )}
                    </div>
                    {activeSheet && (
                      <p className="text-[11px] text-stone-400">
                        Rank {activeSheet.rank} • {formatTraitName(activeSheet.breed)} •{' '}
                        {formatTraitName(activeSheet.auspice)} •{' '}
                        {activeSheet.tribe ? formatTraitName(activeSheet.tribe) : 'No Tribe'}
                      </p>
                    )}
                  </div>
                </div>

                {activeSheet && (
                  <div className="flex items-center gap-1 rounded-xl border border-stone-800 bg-zinc-950/90 p-1">
                    <button
                      type="button"
                      onClick={() => setDesktopPage('page1')}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        desktopPage === 'page1'
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Page 1: Core Traits &amp; Vitals
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesktopPage('page2')}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        desktopPage === 'page2'
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Page 2: Forms, Gifts, Fetishes &amp; Combat
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Seat Switcher, Auto-Save Pill, Sync Popover, Roster, Close */}
              <div className="flex items-center gap-2">
                {seats.length >= 2 && (
                  <select
                    value={activeSeatId}
                    onChange={(e) => setActiveSeat(e.target.value)}
                    className="max-w-44 rounded-lg border border-amber-500/35 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-amber-100"
                    aria-label="Switch active seat"
                  >
                    {seats.map((seat) => {
                      const bound = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
                      return (
                        <option key={seat.seatId} value={seat.seatId}>
                          {seat.playerName} ({bound ? bound.name : 'Unbound'})
                        </option>
                      );
                    })}
                  </select>
                )}

                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusMeta.classes}`}
                >
                  {statusMeta.spinning && <Loader2 className="h-3 w-3 animate-spin" />}
                  {statusMeta.label}
                </span>

                {activeSheet && (
                  <div ref={shareRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShareOpen((v) => !v)}
                      className="flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-zinc-950 px-2.5 py-1.5 text-xs font-bold text-amber-200 transition hover:border-amber-400"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Sync Code / Share
                    </button>
                    {renderSharePopover()}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleOpenRoster}
                  className="flex items-center gap-1.5 rounded-xl border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-stone-200 transition hover:border-amber-500/55"
                >
                  <Users className="h-3.5 w-3.5 text-amber-300" />
                  Roster / Seats
                </button>

                <button
                  type="button"
                  onClick={() => setSheetModalOpen(false)}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-zinc-800 hover:text-stone-100"
                  aria-label="Close Sheet"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>
        )}

        {/* Save Error Alert */}
        {errorMessage && (
          <div className="mx-4 mt-2.5 flex items-center gap-2 rounded-xl border border-red-700/70 bg-red-950/40 px-3 py-1.5 text-xs text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4">
          {!activeSheet || !stats ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-700 bg-zinc-950/60 p-8 text-center">
              <p className="font-display text-base font-bold uppercase text-amber-200">
                Seat “{activeSeat?.playerName ?? 'Player'}” Is Unbound
              </p>
              <p className="mt-1.5 max-w-md text-xs text-stone-400">
                This seat is currently rolling unbound as a Storyteller or Guest. Bind a saved, newly forged, or sync-code Garou sheet from the Roster to unlock full W20 interactive traits &amp; 1-click rolls.
              </p>
              <button
                type="button"
                onClick={handleOpenRoster}
                className="w20-crimson-seal font-display mt-4 flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black tracking-widest uppercase text-amber-50"
              >
                <Users className="h-4 w-4" />
                Open Roster &amp; Seats
              </button>
            </div>
          ) : isMobile ? (
            <div className="space-y-4">
              {(mobileTab === 'identity' ||
                mobileTab === 'attributes' ||
                mobileTab === 'abilities' ||
                mobileTab === 'vitals') && (
                <SheetPageOneCore
                  key={activeSheet.id}
                  sheet={activeSheet}
                  stats={stats}
                  isMobile
                  mobileSection={mobileTab}
                  onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                  onRoll={handleRoll}
                  onPinShortcut={pinShortcutToActiveSheet}
                  onRemoveShortcut={removeShortcutFromActiveSheet}
                />
              )}

              {mobileTab === 'forms' && (
                <SheetPageTwoTactical
                  key={activeSheet.id}
                  sheet={activeSheet}
                  stats={stats}
                  isMobile
                  mobileSection="forms"
                  onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                  onSetActiveForm={setActiveSheetForm}
                  onRoll={handleRoll}
                  onPinShortcut={pinShortcutToActiveSheet}
                  onRemoveShortcut={removeShortcutFromActiveSheet}
                />
              )}

              {mobileTab === 'combat_gifts' && (
                <div className="space-y-4">
                  <SheetPageTwoTactical
                    key={`${activeSheet.id}-p2`}
                    sheet={activeSheet}
                    stats={stats}
                    isMobile
                    mobileSection="combat_gifts"
                    onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                    onSetActiveForm={setActiveSheetForm}
                    onRoll={handleRoll}
                    onPinShortcut={pinShortcutToActiveSheet}
                    onRemoveShortcut={removeShortcutFromActiveSheet}
                  />
                  <SheetPageOneCore
                    key={`${activeSheet.id}-p1`}
                    sheet={activeSheet}
                    stats={stats}
                    isMobile
                    mobileSection="combat_gifts"
                    onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                    onRoll={handleRoll}
                    onPinShortcut={pinShortcutToActiveSheet}
                    onRemoveShortcut={removeShortcutFromActiveSheet}
                  />
                </div>
              )}
            </div>
          ) : desktopPage === 'page1' ? (
            <SheetPageOneCore
              key={activeSheet.id}
              sheet={activeSheet}
              stats={stats}
              isMobile={false}
              onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
              onRoll={handleRoll}
              onPinShortcut={pinShortcutToActiveSheet}
              onRemoveShortcut={removeShortcutFromActiveSheet}
            />
          ) : (
            <SheetPageTwoTactical
              key={activeSheet.id}
              sheet={activeSheet}
              stats={stats}
              isMobile={false}
              onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
              onSetActiveForm={setActiveSheetForm}
              onRoll={handleRoll}
              onPinShortcut={pinShortcutToActiveSheet}
              onRemoveShortcut={removeShortcutFromActiveSheet}
            />
          )}
        </div>
      </div>
    </div>
  );
};
