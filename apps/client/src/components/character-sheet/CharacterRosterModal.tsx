import React, { useMemo, useRef, useState } from 'react';
import {
  Auspice,
  Breed,
  formatSyncCode,
  W20UserCharacterSheet,
} from '@w20-vtt/core';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  Flame,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { DiscordSessionContext } from '../../discordBootstrap';
import { useViewportLayout } from '../../hooks/useViewportLayout';
import {
  type LocalTableSeat,
  useCharacterSheetStore,
} from '../../store/useCharacterSheetStore';
import { CharacterCreationWizard } from '../CharacterCreationWizard';
import {
  formatFormName,
  formatTraitName,
  W20_AUSPICES,
  W20_BREEDS,
  W20_TRIBES,
} from './sheetShared';

type MobileRosterTab = 'saved' | 'create' | 'sync';

interface CharacterRosterModalProps {
  session: DiscordSessionContext;
}

export const CharacterRosterModal: React.FC<CharacterRosterModalProps> = ({ session }) => {
  const { isMobile } = useViewportLayout();

  const rosterModalOpen = useCharacterSheetStore((s) => s.rosterModalOpen);
  const wizardSeatId = useCharacterSheetStore((s) => s.wizardSeatId);
  const loadingRoster = useCharacterSheetStore((s) => s.loadingRoster);
  const saveStatus = useCharacterSheetStore((s) => s.saveStatus);
  const errorMessage = useCharacterSheetStore((s) => s.errorMessage);
  const sheetsById = useCharacterSheetStore((s) => s.sheetsById);
  const seats = useCharacterSheetStore((s) => s.seats);
  const activeSeatId = useCharacterSheetStore((s) => s.activeSeatId);

  const setRosterModalOpen = useCharacterSheetStore((s) => s.setRosterModalOpen);
  const setSheetModalOpen = useCharacterSheetStore((s) => s.setSheetModalOpen);
  const openWizardForSeat = useCharacterSheetStore((s) => s.openWizardForSeat);
  const setActiveSeat = useCharacterSheetStore((s) => s.setActiveSeat);
  const addSeat = useCharacterSheetStore((s) => s.addSeat);
  const removeSeat = useCharacterSheetStore((s) => s.removeSeat);
  const updateSeatPlayerName = useCharacterSheetStore((s) => s.updateSeatPlayerName);
  const assignSheetToSeat = useCharacterSheetStore((s) => s.assignSheetToSeat);
  const createBlankSheetForSeat = useCharacterSheetStore((s) => s.createBlankSheetForSeat);
  const createGuidedSheetForSeat = useCharacterSheetStore((s) => s.createGuidedSheetForSeat);
  const deleteSheet = useCharacterSheetStore((s) => s.deleteSheet);
  const loadSheetBySyncCode = useCharacterSheetStore((s) => s.loadSheetBySyncCode);
  const exportSheetJson = useCharacterSheetStore((s) => s.exportSheetJson);
  const importSheetJson = useCharacterSheetStore((s) => s.importSheetJson);

  const [mobileTab, setMobileTab] = useState<MobileRosterTab>('saved');

  // Inline Blank Fillable Sheet form
  const [blankName, setBlankName] = useState('');
  const [blankBreed, setBlankBreed] = useState<Breed>('homid');
  const [blankAuspice, setBlankAuspice] = useState<Auspice>('ahroun');
  const [blankTribe, setBlankTribe] = useState<string>('get_of_fenris');
  const [autoFillStartingTraits, setAutoFillStartingTraits] = useState(true);
  const [creatingBlank, setCreatingBlank] = useState(false);

  // Sync code & JSON import state
  const [syncCodeInput, setSyncCodeInput] = useState('');
  const [syncingCode, setSyncingCode] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeSeat: LocalTableSeat =
    seats.find((s) => s.seatId === activeSeatId) ?? seats[0]!;

  const sortedSheets = useMemo(
    () =>
      Object.values(sheetsById).sort(
        (a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
      ),
    [sheetsById]
  );

  if (!rosterModalOpen && wizardSeatId === null) {
    return null;
  }

  const handleCreateBlank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSeat) return;
    setCreatingBlank(true);
    setStatusNote(null);
    try {
      const created = await createBlankSheetForSeat(activeSeat.seatId, {
        name: blankName.trim() || 'New Garou',
        player: activeSeat.playerName,
        breed: blankBreed,
        auspice: blankAuspice,
        tribe: blankTribe,
        autoFillStartingTraits,
      });
      setBlankName('');
      setStatusNote(`Created "${created.name}" for ${activeSeat.playerName}.`);
      setRosterModalOpen(false);
      setSheetModalOpen(true);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Unable to create sheet.');
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleLoadSyncCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSeat || !syncCodeInput.trim()) return;
    setSyncingCode(true);
    setStatusNote(null);
    try {
      const loaded = await loadSheetBySyncCode(
        activeSeat.seatId,
        syncCodeInput,
        activeSeat.playerName
      );
      if (loaded) {
        setSyncCodeInput('');
        setStatusNote(
          `Synced "${loaded.name}" to ${activeSeat.playerName}.`
        );
        if (isMobile) setMobileTab('saved');
      }
    } finally {
      setSyncingCode(false);
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeSeat) return;
    setStatusNote(null);
    try {
      const text = await file.text();
      const imported = await importSheetJson(activeSeat.seatId, text);
      setStatusNote(`Imported "${imported.name}" to ${activeSeat.playerName}.`);
      if (isMobile) setMobileTab('saved');
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'JSON import failed.');
    }
  };

  const handleEditSheet = (sheet: W20UserCharacterSheet) => {
    assignSheetToSeat(
      activeSeat.seatId,
      sheet.id,
      sheet.ownerDiscordId !== session.userId ? sheet.syncCode ?? null : null
    );
    setRosterModalOpen(false);
    setSheetModalOpen(true);
  };

  const seatsPanel = (
    <section className="rounded-xl border border-amber-500/25 bg-zinc-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-300" />
          <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
            Table Seats ({seats.length}/8)
          </h3>
          <span className="text-[10px] text-stone-400">
            Same-screen co-op or solo table
          </span>
        </div>
        <button
          type="button"
          disabled={seats.length >= 8}
          onClick={() => {
            const newId = addSeat();
            if (newId) setActiveSeat(newId);
          }}
          className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-950/35 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:bg-amber-900/45 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Same-Screen Player
        </button>
      </div>

      <div
        className={
          isMobile
            ? 'mt-2.5 flex gap-2 overflow-x-auto pb-1'
            : 'mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'
        }
      >
        {seats.map((seat, idx) => {
          const boundSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
          const isSelected = seat.seatId === activeSeat.seatId;
          return (
            <div
              key={seat.seatId}
              onClick={() => setActiveSeat(seat.seatId)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setActiveSeat(seat.seatId);
                }
              }}
              className={`flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                isMobile ? 'min-w-[210px] shrink-0' : ''
              } ${
                isSelected
                  ? 'border-amber-400/75 bg-amber-950/25 shadow-[0_0_12px_rgba(245,158,11,0.18)]'
                  : 'border-stone-800 bg-zinc-900/60 hover:border-stone-600'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] font-bold uppercase text-amber-300/80">
                  {seat.seatId === 'primary' ? 'Primary Seat' : `Seat ${idx + 1}`}
                </span>
                {seat.seatId !== 'primary' && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeSeat(seat.seatId);
                    }}
                    aria-label={`Remove ${seat.playerName}`}
                    className="rounded p-0.5 text-stone-500 hover:bg-red-950/60 hover:text-red-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <input
                type="text"
                value={seat.playerName}
                maxLength={80}
                onClick={(ev) => ev.stopPropagation()}
                onChange={(ev) => updateSeatPlayerName(seat.seatId, ev.target.value)}
                placeholder="Player Name"
                aria-label={`Player name for ${seat.seatId}`}
                className="w-full rounded border border-stone-700/80 bg-zinc-950 px-2 py-1 text-xs font-semibold text-stone-100 focus:border-amber-400/75 focus:outline-none"
              />

              <div className="flex items-center justify-between gap-1 text-[10px]">
                {boundSheet ? (
                  <span className="truncate font-semibold text-emerald-300">
                    {boundSheet.name} ({formatFormName(boundSheet.activeForm)})
                  </span>
                ) : (
                  <span className="truncate italic text-stone-400">
                    Unbound (Storyteller / Guest)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 pt-0.5">
                {boundSheet ? (
                  <>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActiveSeat(seat.seatId);
                        setRosterModalOpen(false);
                        setSheetModalOpen(true);
                      }}
                      className="flex-1 rounded border border-amber-500/40 bg-amber-950/35 px-2 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-900/50"
                    >
                      Sheet
                    </button>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        assignSheetToSeat(seat.seatId, null);
                      }}
                      className="rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-[10px] text-stone-300 hover:border-stone-500"
                      title="Roll Unbound (Storyteller / Guest)"
                    >
                      Roll Unbound
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setActiveSeat(seat.seatId);
                      assignSheetToSeat(seat.seatId, null);
                    }}
                    className="w-full rounded border border-stone-700/70 bg-zinc-900/90 px-2 py-1 text-[10px] font-semibold text-stone-300 hover:border-amber-500/40"
                  >
                    Roll Unbound (Storyteller / Guest)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const savedSheetsSection = (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
          Saved Garou ({sortedSheets.length})
        </h3>
        <span className="text-[11px] text-stone-400">
          Assigning to: <strong className="text-amber-200">{activeSeat.playerName}</strong>
        </span>
      </div>

      {loadingRoster && sortedSheets.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-stone-800 bg-zinc-950/70 p-8 text-xs text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
          Summoning saved Garou sheets...
        </div>
      ) : sortedSheets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-700/70 bg-zinc-950/50 p-6 text-center text-xs text-stone-400">
          <p className="font-display text-amber-200/85 uppercase tracking-wider">
            No Saved Garou Yet
          </p>
          <p className="mt-1 text-[11px] text-stone-500">
            Use the Guided W20 Creation Wizard, create a Blank Fillable Sheet, load an 8-char Sync Code, or roll Unbound.
          </p>
        </div>
      ) : (
        <div className={isMobile ? 'space-y-2.5' : 'grid grid-cols-1 gap-2.5 md:grid-cols-2'}>
          {sortedSheets.map((sheet) => {
            const assignedSeats = seats.filter((s) => s.sheetId === sheet.id);
            const isAssignedToActive = activeSeat.sheetId === sheet.id;
            const isForeign = sheet.ownerDiscordId !== session.userId;

            return (
              <article
                key={sheet.id}
                className={`flex flex-col justify-between gap-2.5 rounded-xl border p-3 transition ${
                  isAssignedToActive
                    ? 'border-emerald-500/65 bg-emerald-950/20'
                    : 'border-stone-800 bg-zinc-950/85 hover:border-stone-600'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="font-display truncate text-sm font-black text-amber-50">
                          {sheet.name || 'New Garou'}
                        </h4>
                        {sheet.deedName && (
                          <span className="truncate text-[10px] italic text-amber-300/85">
                            “{sheet.deedName}”
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-stone-400">
                        Rank {sheet.rank} • {formatTraitName(sheet.breed)} •{' '}
                        {formatTraitName(sheet.auspice)} •{' '}
                        {sheet.tribe ? formatTraitName(sheet.tribe) : 'No Tribe'}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-red-700/65 bg-red-950/75 px-2 py-0.5 text-[10px] font-bold uppercase text-red-200">
                      {formatFormName(sheet.activeForm)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {sheet.player.trim() && (
                      <span className="rounded bg-zinc-800/90 px-2 py-0.5 font-semibold text-stone-300">
                        Player: {sheet.player}
                      </span>
                    )}
                    {isForeign && (
                      <span className="rounded border border-cyan-700/60 bg-cyan-950/50 px-2 py-0.5 font-semibold text-cyan-200">
                        Synced Sheet
                      </span>
                    )}
                    {sheet.syncCode && (
                      <span className="rounded border border-amber-500/35 bg-amber-950/30 px-2 py-0.5 font-mono text-amber-200">
                        {formatSyncCode(sheet.syncCode)}
                      </span>
                    )}
                    {assignedSeats.map((as) => (
                      <span
                        key={as.seatId}
                        className="inline-flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-950/50 px-2 py-0.5 font-bold text-emerald-200"
                      >
                        <UserCheck className="h-3 w-3" />
                        {as.playerName}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-800/80 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      assignSheetToSeat(
                        activeSeat.seatId,
                        sheet.id,
                        isForeign ? sheet.syncCode ?? null : null
                      )
                    }
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                      isAssignedToActive
                        ? 'border border-emerald-500/60 bg-emerald-950/60 text-emerald-200'
                        : 'w20-crimson-seal text-amber-50'
                    }`}
                  >
                    {isAssignedToActive && <Check className="h-3 w-3" />}
                    {isAssignedToActive ? 'At Seat' : 'Take to Table'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEditSheet(sheet)}
                    className="flex items-center gap-1 rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-stone-200 hover:border-amber-500/55 hover:text-amber-100"
                  >
                    <FileText className="h-3 w-3 text-amber-300" />
                    Edit Sheet
                  </button>

                  <button
                    type="button"
                    onClick={() => exportSheetJson(sheet.id)}
                    className="flex items-center gap-1 rounded-lg border border-stone-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-stone-300 hover:border-stone-500"
                    title="Export .w20sheet.json"
                  >
                    <Download className="h-3 w-3" />
                    {!isMobile && <span>Export JSON</span>}
                  </button>

                  {confirmDeleteId === sheet.id ? (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void deleteSheet(sheet.id);
                          setConfirmDeleteId(null);
                        }}
                        className="rounded-lg bg-red-700 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-red-600"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[10px] text-stone-300 hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(sheet.id)}
                      className="ml-auto rounded-lg border border-stone-800 bg-zinc-900/90 p-1.5 text-stone-400 hover:border-red-700/70 hover:text-red-300"
                      aria-label={`Delete ${sheet.name}`}
                      title="Delete sheet"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  const createGarouSection = (
    <section className="space-y-3 rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
            Create New Garou for {activeSeat.playerName}
          </h3>
          <p className="text-[11px] text-stone-400">
            Follow canonical W20 step-by-step rules or start with a blank fillable sheet.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openWizardForSeat(activeSeat.seatId)}
          className="w20-crimson-seal flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-amber-50"
        >
          <Sparkles className="h-4 w-4 text-amber-300" />
          Guided W20 Creation Wizard
        </button>
      </div>

      <div className="w20-gold-divider" />

      <form onSubmit={(e) => void handleCreateBlank(e)} className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-300">
          New Blank Fillable Sheet
        </div>

        <div className={isMobile ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-4 gap-2'}>
          <label className="block">
            <span className="text-[10px] uppercase text-stone-400">Name</span>
            <input
              type="text"
              value={blankName}
              maxLength={120}
              onChange={(e) => setBlankName(e.target.value)}
              placeholder="e.g. Walks-the-Ash"
              className="mt-1 w-full rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100 focus:border-amber-400/75 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase text-stone-400">Breed</span>
            <select
              value={blankBreed}
              onChange={(e) => setBlankBreed(e.target.value as Breed)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
            >
              {W20_BREEDS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] uppercase text-stone-400">Auspice</span>
            <select
              value={blankAuspice}
              onChange={(e) => setBlankAuspice(e.target.value as Auspice)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
            >
              {W20_AUSPICES.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] uppercase text-stone-400">Tribe</span>
            <select
              value={blankTribe}
              onChange={(e) => setBlankTribe(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-stone-100"
            >
              {W20_TRIBES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={autoFillStartingTraits}
              onChange={(e) => setAutoFillStartingTraits(e.target.checked)}
              className="accent-amber-500"
            />
            Auto-fill starting Rage / Gnosis / Willpower
          </label>

          <button
            type="submit"
            disabled={creatingBlank}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/45 bg-amber-950/45 px-3.5 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-900/55 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {creatingBlank ? 'Creating...' : 'Create Blank Sheet'}
          </button>
        </div>
      </form>
    </section>
  );

  const syncAndBackupSection = (
    <section className="space-y-3 rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5">
      <h3 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
        Cross-Account Sync &amp; JSON Backup
      </h3>

      <div className={isMobile ? 'space-y-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}>
        <form onSubmit={(e) => void handleLoadSyncCode(e)} className="space-y-2 rounded-lg border border-stone-800 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-200">
            <KeyRound className="h-3.5 w-3.5 text-amber-300" />
            8-Char Sync Code
          </div>
          <p className="text-[10px] text-stone-400">
            Load &amp; sync a character sheet shared from another Discord account onto{' '}
            <strong className="text-amber-200">{activeSeat.playerName}</strong>.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={syncCodeInput}
              maxLength={12}
              onChange={(e) => setSyncCodeInput(e.target.value.toUpperCase())}
              placeholder="ABCD-2345"
              className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs uppercase tracking-widest text-amber-100 placeholder-stone-500 focus:border-amber-400/75 focus:outline-none"
            />
            <button
              type="submit"
              disabled={syncingCode || !syncCodeInput.trim()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-extrabold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-45"
            >
              {syncingCode ? 'Loading...' : 'Load & Sync'}
            </button>
          </div>
        </form>

        <div className="flex flex-col justify-between space-y-2 rounded-lg border border-stone-800 bg-zinc-900/50 p-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-200">
              <Upload className="h-3.5 w-3.5 text-cyan-300" />
              Import .w20sheet.json Backup
            </div>
            <p className="mt-1 text-[10px] text-stone-400">
              Import an exported JSON sheet into your library and bind it to{' '}
              <strong className="text-amber-200">{activeSeat.playerName}</strong>.
            </p>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleImportJsonFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-950 px-3 py-2 text-xs font-bold text-stone-200 transition hover:border-cyan-500/60 hover:text-cyan-100"
            >
              <Upload className="h-3.5 w-3.5 text-cyan-300" />
              Choose .json Sheet File
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <>
      {rosterModalOpen && (
        <div
          className={
            isMobile
              ? 'fixed inset-0 z-40 flex flex-col bg-[#070609]'
              : 'fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm'
          }
        >
          <div
            className={
              isMobile
                ? 'flex h-[100dvh] w-full flex-col overflow-hidden bg-[#070609] text-stone-100'
                : 'w20-obsidian-panel flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl text-stone-100'
            }
          >
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between border-b border-amber-500/20 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-red-700/70 bg-red-950/80 text-red-300">
                  <Flame className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display truncate text-sm font-black tracking-wider uppercase text-amber-100">
                    Garou Roster &amp; Table Seats
                  </h2>
                  <p className="truncate text-[11px] text-stone-400">
                    Signed in as {session.username} • Status: {saveStatus.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRosterModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-zinc-800 hover:text-stone-100"
                aria-label="Close Roster"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Feedback Banner */}
            {(errorMessage || statusNote) && (
              <div
                className={`mx-4 mt-2.5 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  errorMessage
                    ? 'border-red-700/70 bg-red-950/40 text-red-200'
                    : 'border-emerald-700/60 bg-emerald-950/35 text-emerald-200'
                }`}
              >
                {errorMessage ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                ) : (
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <span className="flex-1">{errorMessage || statusNote}</span>
              </div>
            )}

            {/* Mobile Segmented Tabs */}
            {isMobile && (
              <div className="shrink-0 border-b border-stone-800 px-4 pt-2.5 pb-2">
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-stone-800 bg-zinc-950 p-1">
                  {(
                    [
                      ['saved', `Saved (${sortedSheets.length})`],
                      ['create', 'Create'],
                      ['sync', 'Sync Code'],
                    ] as const
                  ).map(([tabKey, label]) => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setMobileTab(tabKey)}
                      className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                        mobileTab === tabKey
                          ? 'bg-red-800/90 text-amber-50 shadow'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {seatsPanel}

              {isMobile ? (
                <>
                  {mobileTab === 'saved' && savedSheetsSection}
                  {mobileTab === 'create' && createGarouSection}
                  {mobileTab === 'sync' && syncAndBackupSection}
                </>
              ) : (
                <>
                  {savedSheetsSection}
                  {createGarouSection}
                  {syncAndBackupSection}
                </>
              )}
            </div>

            {/* Footer / Sticky Bottom CTA */}
            <footer
              className={
                isMobile
                  ? 'sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-amber-500/20 bg-zinc-950/95 px-4 py-3'
                  : 'flex shrink-0 items-center justify-between border-t border-amber-500/20 bg-zinc-950/85 px-4 py-3'
              }
            >
              <div className="text-xs text-stone-400">
                {seats.length === 1 ? (
                  <span>
                    Table:{' '}
                    <strong className="text-amber-100">
                      {activeSeat.sheetId && sheetsById[activeSeat.sheetId]
                        ? sheetsById[activeSeat.sheetId]!.name
                        : `${activeSeat.playerName} (Unbound)`}
                    </strong>
                  </span>
                ) : (
                  <span>
                    <strong className="text-amber-100">{seats.length}</strong> same-screen seats ready
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setRosterModalOpen(false)}
                className="w20-crimson-seal font-display flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black tracking-widest uppercase text-amber-50"
              >
                Enter Dice Table
              </button>
            </footer>
          </div>
        </div>
      )}

      {wizardSeatId !== null && (
        <CharacterCreationWizard
          sessionJwt={session.sessionJwt}
          defaultPlayerName={
            seats.find((s) => s.seatId === wizardSeatId)?.playerName ?? session.username
          }
          onClose={() => openWizardForSeat(null)}
          customSubmit={async ({ draft, deedName }) => {
            const targetSeat = seats.find((s) => s.seatId === wizardSeatId);
            await createGuidedSheetForSeat(wizardSeatId, {
              draft,
              player: targetSeat?.playerName ?? session.username,
              deedName,
            });
            openWizardForSeat(null);
            setStatusNote(`Forged "${draft.name}" via Guided W20 Wizard.`);
          }}
        />
      )}
    </>
  );
};
