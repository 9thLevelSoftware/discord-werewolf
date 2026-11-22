import React, { useMemo, useRef, useState } from 'react';
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
import { ConfirmButton, IconButton, Modal, toast } from '../ui';
import { usePopoverDismiss } from '../ui/usePopoverDismiss';
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
  | 'bg_merits'
  | 'vitals'
  | 'forms'
  | 'combat_gifts';

const MOBILE_TABS: readonly { key: MobileSectionTab; label: string }[] = [
  { key: 'identity', label: 'Identity' },
  { key: 'attributes', label: 'Attributes' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'bg_merits', label: 'Bg & Merits' },
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
    label: 'Saving…',
    classes: 'border-amber-500/60 bg-amber-950/50 text-amber-200',
    spinning: true,
  },
  saved: {
    label: 'Saved',
    classes: 'border-emerald-600/60 bg-emerald-950/50 text-emerald-200',
  },
  local_only: {
    label: 'Saved on this device',
    classes: 'border-cyan-600/60 bg-cyan-950/50 text-cyan-200',
  },
  error: {
    label: 'Could not save',
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

  usePopoverDismiss({
    open: shareOpen,
    onClose: () => setShareOpen(false),
    containerRef: shareRef,
  });

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
      // The clipboard can be blocked inside the Discord frame.
      toast.error(`Could not copy automatically. Your sync code is ${formatted}.`, 0);
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
      <div
        role="dialog"
        aria-label="Sync code and backup"
        className="w20-obsidian-panel absolute right-0 top-full z-modal mt-2 w-72 rounded-xl p-3 text-xs shadow-2xl"
      >
        <div className="flex items-center justify-between pb-2">
          <span className="flex items-center gap-1.5 font-display text-xs font-bold uppercase text-amber-200">
            <KeyRound className="h-3.5 w-3.5 text-amber-300" />
            Sync Code &amp; Backup
          </span>
          <IconButton
            label="Close sync code panel"
            icon={<X className="h-3.5 w-3.5" />}
            size="sm"
            className="h-7 w-7"
            onClick={() => setShareOpen(false)}
          />
        </div>
        <div className="w20-gold-divider mb-2.5" />

        {activeSyncCode ? (
          <div className="space-y-2 rounded-lg border border-amber-500/35 bg-zinc-950/90 p-2.5">
            <div className="text-caption uppercase text-stone-400">
              Cross-Account Sync Code
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-base font-black tracking-widest text-amber-200">
                {formatSyncCode(activeSyncCode)}
              </span>
              <button
                type="button"
                onClick={() => void handleCopySyncCode(activeSyncCode)}
                className="flex items-center gap-1 rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-caption font-bold text-stone-200 hover:border-amber-400/60"
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
              <ConfirmButton
                variant="danger"
                disabled={busySync}
                prompt="Revoke this code? Other accounts will lose access to this character."
                confirmLabel="Revoke"
                className="w-full"
                onConfirm={() => void handleRevokeCode()}
              >
                {busySync ? 'Revoking…' : 'Revoke Sync Code'}
              </ConfirmButton>
            ) : (
              <p className="text-caption text-cyan-300">
                Synced from owner — edits save back to this code.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-stone-800 bg-zinc-950/90 p-2.5">
            <p className="text-caption text-stone-400">
              Generate an 8-char sync code to access and edit this Garou sheet from another Discord account.
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={busySync}
                onClick={() => void handleGenerateCode()}
                className="w20-crimson-seal w-full rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-50 disabled:opacity-45"
              >
                {busySync ? 'Generating...' : 'Generate Sync Code'}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => exportSheetJson(activeSheet.id)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-stone-200 hover:border-amber-500/50"
        >
          <Download className="h-3.5 w-3.5 text-amber-300" />
          Export backup file
        </button>

        {isMobile && (
          <button
            type="button"
            onClick={handleOpenRoster}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-stone-200 hover:border-amber-500/50"
          >
            <Users className="h-3.5 w-3.5 text-amber-300" />
            Roster &amp; Table Seats
          </button>
        )}
      </div>
    );
  };

  const closeSheet = () => setSheetModalOpen(false);

  return (
    <Modal
      open
      onClose={closeSheet}
      title={activeSheet ? `${activeSheet.name || 'New Garou'} character sheet` : 'Character sheet'}
      variant={isMobile ? 'fullscreen' : 'center'}
      size="xl"
      bodyClassName="p-4"
      renderHeader={() => (
        <>
        {isMobile ? (
          <header className="sticky top-0 z-20 shrink-0 border-b border-amber-500/20 bg-zinc-950/95 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Flame className="h-4 w-4 shrink-0 text-red-400" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-display truncate text-sm font-black uppercase text-amber-100">
                      {activeSheet ? activeSheet.name || 'New Garou' : 'No character'}
                    </h2>
                    {activeSheet && (
                      <span className="shrink-0 rounded-full border border-red-700/70 bg-red-950/80 px-2 py-0.5 text-caption font-bold uppercase text-red-200">
                        {formatFormName(activeSheet.activeForm)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-bold ${statusMeta.classes}`}
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
                      aria-haspopup="dialog"
                      aria-expanded={shareOpen}
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                    {renderSharePopover()}
                  </div>
                )}

                <IconButton
                  label="Close sheet"
                  icon={<X className="h-4 w-4" />}
                  variant="secondary"
                  size="touch"
                  onClick={closeSheet}
                />
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
                      aria-pressed={active}
                      onClick={() => setActiveSeat(seat.seatId)}
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-caption font-bold ${
                        active
                          ? 'border-amber-400 bg-amber-950/50 text-amber-100'
                          : 'border-stone-800 bg-zinc-900 text-stone-400'
                      }`}
                    >
                      {seat.playerName}: {bound ? bound.name : 'no character'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Thumb-Friendly Wrapping Section Tabs */}
            {activeSheet && (
              <nav className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Sheet sections">
                {MOBILE_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={mobileTab === tab.key}
                    onClick={() => setMobileTab(tab.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
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
                        {activeSheet ? activeSheet.name || 'New Garou' : 'No character'}
                      </h2>
                      {activeSheet && (
                        <span className="rounded-full border border-red-700/70 bg-red-950/80 px-2 py-0.5 text-caption font-bold uppercase text-red-200">
                          {formatFormName(activeSheet.activeForm)}
                        </span>
                      )}
                    </div>
                    {activeSheet && (
                      <p className="text-xs text-stone-400">
                        Rank {activeSheet.rank} • {formatTraitName(activeSheet.breed)} •{' '}
                        {formatTraitName(activeSheet.auspice)} •{' '}
                        {activeSheet.tribe ? formatTraitName(activeSheet.tribe) : 'No Tribe'}
                      </p>
                    )}
                  </div>
                </div>

                {activeSheet && (
                  <div
                    role="tablist"
                    aria-label="Sheet pages"
                    className="flex items-center gap-1 rounded-xl border border-stone-800 bg-zinc-950/90 p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={desktopPage === 'page1'}
                      onClick={() => setDesktopPage('page1')}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        desktopPage === 'page1'
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Core Traits
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={desktopPage === 'page2'}
                      onClick={() => setDesktopPage('page2')}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        desktopPage === 'page2'
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Forms &amp; Combat
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
                          {seat.playerName} ({bound ? bound.name : 'no character'})
                        </option>
                      );
                    })}
                  </select>
                )}

                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption font-bold ${statusMeta.classes}`}
                >
                  {statusMeta.spinning && <Loader2 className="h-3 w-3 animate-spin" />}
                  {statusMeta.label}
                </span>

                {activeSheet && (
                  <div ref={shareRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShareOpen((v) => !v)}
                      aria-haspopup="dialog"
                      aria-expanded={shareOpen}
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

                <IconButton
                  label="Close sheet"
                  icon={<X className="h-4 w-4" />}
                  onClick={closeSheet}
                />
              </div>
            </div>
          </header>
        )}

        {/* Save Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mx-4 mt-2.5 flex items-center gap-2 rounded-xl border border-red-700/70 bg-red-950/40 px-3 py-1.5 text-xs text-red-200"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        </>
      )}
    >
          {!activeSheet || !stats ? (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-700 bg-zinc-950/60 p-8 text-center">
              <p className="font-display text-base font-bold uppercase text-amber-200">
                {activeSeat?.playerName ?? 'This seat'} has no character yet
              </p>
              <p className="mt-1.5 max-w-md text-xs text-stone-400">
                This seat can still roll dice. Choose or create a character in the Roster to roll from its traits with one click.
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

              {mobileTab === 'bg_merits' && (
                <div className="space-y-4">
                  <SheetPageOneCore
                    key={`${activeSheet.id}-bg`}
                    sheet={activeSheet}
                    stats={stats}
                    isMobile
                    mobileSection="bg_merits"
                    onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                    onRoll={handleRoll}
                    onPinShortcut={pinShortcutToActiveSheet}
                    onRemoveShortcut={removeShortcutFromActiveSheet}
                  />
                  <SheetPageTwoTactical
                    key={`${activeSheet.id}-merits`}
                    sheet={activeSheet}
                    stats={stats}
                    isMobile
                    mobileSection="bg_merits"
                    onUpdateSheet={(updater) => updateSheet(activeSheet.id, updater)}
                    onSetActiveForm={setActiveSheetForm}
                    onRoll={handleRoll}
                    onPinShortcut={pinShortcutToActiveSheet}
                    onRemoveShortcut={removeShortcutFromActiveSheet}
                  />
                </div>
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
    </Modal>
  );
};
