import React from 'react';
import type { W20UserCharacterSheet } from '@w20-vtt/core';
import type { TableParticipant } from '@w20-vtt/protocol';
import { Button, IconButton } from '../ui';
import { ChevronLeft, FileText, Flame, Plus, Users, Volume2 } from 'lucide-react';
import type { LocalTableSeat } from '../../store/useCharacterSheetStore';
import { formatFormName } from '../character-sheet/sheetShared';
import { ParticipantAvatar } from './DieFaceTiles';

interface PackPresenceDrawerProps {
  open: boolean;
  currentUserId: string;
  sortedParticipants: TableParticipant[];
  speakingDiscordIds: Set<string>;
  seats: LocalTableSeat[];
  activeSeatId: string;
  sheetsById: Record<string, W20UserCharacterSheet>;
  onClose: () => void;
  onSelectSeat: (seatId: string) => void;
  onOpenSheet: () => void;
  onOpenRoster: () => void;
  onAddSeatAndOpenRoster: () => void;
}

export const PackPresenceDrawer: React.FC<PackPresenceDrawerProps> = ({
  open,
  currentUserId,
  sortedParticipants,
  speakingDiscordIds,
  seats,
  activeSeatId,
  sheetsById,
  onClose,
  onSelectSeat,
  onOpenSheet,
  onOpenRoster,
  onAddSeatAndOpenRoster,
}) => {
  if (!open) return null;

  const onlineCount = sortedParticipants.filter((p) => p.isConnected).length;

  return (
    <aside
      aria-label="Pack and table seats"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="w20-obsidian-panel absolute inset-y-0 left-0 z-drawer flex w-[310px] shrink-0 flex-col border-y-0 border-l-0 lg:static lg:z-20"
    >
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-300" />
          <h2 className="font-display text-xs font-bold tracking-wider uppercase text-amber-100">
            Pack ({onlineCount}/{sortedParticipants.length})
          </h2>
        </div>
        <IconButton
          label="Collapse Pack"
          icon={<ChevronLeft className="h-4 w-4" />}
          size="sm"
          onClick={onClose}
        />
      </div>

      <div className="w20-gold-divider" />

      <div className="w20-thin-scrollbar flex-1 space-y-4 overflow-y-auto p-3">
        {/* Voice Table Participants */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-bold tracking-wider uppercase text-stone-300">
              In this voice channel ({sortedParticipants.length})
            </span>
          </div>

          {sortedParticipants.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-700/60 bg-zinc-950/50 p-4 text-center text-xs text-stone-400">
              No players connected yet.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedParticipants.map((p) => {
                const isSpeaking = speakingDiscordIds.has(p.discordUserId);
                const label = p.characterName
                  ? `${p.characterName} (${p.displayName})`
                  : p.displayName;
                const isLocalSeat =
                  p.discordUserId === currentUserId && Boolean(p.seatId);
                const isCurrentActiveSeat =
                  isLocalSeat && p.seatId === activeSeatId;

                return (
                  <div
                    key={p.participantKey ?? p.discordUserId}
                    {...(isLocalSeat && p.seatId
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': `Switch to ${label}`,
                          'aria-pressed': isCurrentActiveSeat,
                          onClick: () => onSelectSeat(p.seatId!),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectSeat(p.seatId!);
                            }
                          },
                        }
                      : {})}
                    className={`rounded-xl border p-2.5 shadow-inner transition ${
                      isSpeaking
                        ? 'border-emerald-400/80 bg-emerald-950/35 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                        : isCurrentActiveSeat
                          ? 'border-amber-500/60 bg-red-950/25'
                          : 'border-stone-800/90 bg-zinc-950/80'
                    } ${p.isConnected ? '' : 'opacity-50'} ${
                      isLocalSeat ? 'cursor-pointer hover:border-amber-400/75' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative shrink-0">
                          <ParticipantAvatar
                            name={label}
                            avatarUrl={p.avatarUrl}
                            isSpeaking={isSpeaking}
                            isConnected={p.isConnected}
                            sizeClass="h-8 w-8"
                          />
                          {isSpeaking && (
                            <Volume2 className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-emerald-400 p-0.5 text-zinc-950" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-amber-50">
                            {label}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.activeForm && (
                              <span className="font-display rounded border border-red-800/50 bg-red-950/80 px-1.5 py-0.5 text-xs font-bold uppercase text-amber-200">
                                {formatFormName(p.activeForm)}
                              </span>
                            )}
                            {isCurrentActiveSeat && (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-bold text-amber-200">
                                Active Seat
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-bold uppercase ${
                          p.isConnected ? 'text-emerald-400' : 'text-stone-400'
                        }`}
                      >
                        {p.isConnected ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
                      <span className="rounded border border-red-900/50 bg-red-950/35 px-1.5 py-0.5 text-red-300">
                        Rage {p.trackers.rage}
                      </span>
                      <span className="rounded border border-cyan-700/40 bg-cyan-950/30 px-1.5 py-0.5 text-cyan-200">
                        Gnosis {p.trackers.gnosis}
                      </span>
                      <span className="rounded border border-indigo-700/40 bg-indigo-950/30 px-1.5 py-0.5 text-indigo-200">
                        WP {p.trackers.willpower}
                      </span>
                      {p.trackers.woundPenalty !== 0 && (
                        <span className="rounded bg-red-950 px-1.5 py-0.5 font-bold text-red-300">
                          {p.trackers.woundPenalty} Wnd
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="w20-gold-divider" />

        {/* Local Hot-Seats Management */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display text-xs font-bold tracking-wider uppercase text-amber-200/90">
              Your Seats ({seats.length})
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={onOpenRoster}>
                Roster
              </Button>
              <Button size="sm" onClick={onAddSeatAndOpenRoster}>
                <Plus className="h-3 w-3" />
                Seat
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {seats.map((seat, idx) => {
              const seatSheet = seat.sheetId ? sheetsById[seat.sheetId] : undefined;
              const isActive = seat.seatId === activeSeatId;
              return (
                <div
                  key={seat.seatId}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-2 transition ${
                    isActive
                      ? 'border-amber-400/75 bg-red-950/35'
                      : 'border-stone-800 bg-zinc-950/80 hover:border-stone-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSeat(seat.seatId)}
                    title={`Switch to Seat ${idx + 1} (Alt+${idx + 1})`}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs font-bold text-amber-300">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-amber-50">
                        {seatSheet ? seatSheet.name : seat.playerName || 'Unassigned seat'}
                      </p>
                      <p className="truncate text-xs text-stone-400">
                        {seatSheet
                          ? `${formatFormName(seatSheet.activeForm)} • ${seat.playerName}`
                          : 'No character yet'}
                      </p>
                    </div>
                  </button>
                  {seatSheet ? (
                    <Button
                      size="sm"
                      aria-label={`Open ${seatSheet.name}'s sheet`}
                      onClick={() => {
                        onSelectSeat(seat.seatId);
                        onOpenSheet();
                      }}
                    >
                      <FileText className="h-3 w-3" />
                      Sheet
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      aria-label={`Choose a character for seat ${idx + 1}`}
                      onClick={() => {
                        onSelectSeat(seat.seatId);
                        onOpenRoster();
                      }}
                    >
                      <Flame className="h-3 w-3 text-red-400" />
                      Bind
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
};
