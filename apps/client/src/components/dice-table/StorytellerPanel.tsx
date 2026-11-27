import React, { useId, useRef, useState } from 'react';
import type { ClientCommand, StorytellerTableState, TableInitiativeEntry, TableParticipant } from '@w20-vtt/protocol';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import { Button, IconButton, Modal, NumberStepper } from '../ui';
import { InitiativeOrderPanel } from './InitiativeOrderPanel';
import { RollFeedEntries } from './RollFeedDrawer';
import { StorytellerPlayers } from './StorytellerPlayers';

const TABS = ['Roll', 'Initiative', 'Players'] as const;
const INPUT_CLASS = 'min-h-11 min-w-0 rounded-lg border border-stone-700 bg-obsidian-950 px-3 text-base text-parchment';

function stepPool(current: number, delta: number): string {
  return String(Math.max(1, Math.min(30, Math.trunc(current || 0) + delta)));
}

interface StorytellerPanelProps {
  mobile: boolean;
  connected: boolean;
  table: StorytellerTableState;
  participants: TableParticipant[];
  sharedInitiative: TableInitiativeEntry[];
  currentUserId: string;
  sendCommand: (command: ClientCommand) => string;
  onClearInitiative: () => void;
  onClose: () => void;
}

export const StorytellerPanel: React.FC<StorytellerPanelProps> = ({
  mobile, connected, table, participants, sharedInitiative, currentUserId,
  sendCommand, onClearInitiative, onClose,
}) => {
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [poolInput, setPoolInput] = useState('1');
  const [difficulty, setDifficulty] = useState(6);
  const [label, setLabel] = useState('');
  const [modifierInput, setModifierInput] = useState('0');
  const pool = Number(poolInput);
  const canRollPool = Number.isInteger(pool) && pool >= 1 && pool <= 30;
  const modifier = Number(modifierInput);
  const canRollInitiative = label.trim().length > 0 && Number.isInteger(modifier)
    && modifier >= -30 && modifier <= 50;
  const latestPool = table.rollHistory.find((entry) => entry.roll.rollMode !== 'initiative');

  return (
    <Modal open title="Storyteller" variant={mobile ? 'fullscreen' : 'side'} onClose={onClose}
      bodyClassName="px-4 pb-6 [padding-bottom:max(1.5rem,env(safe-area-inset-bottom))]"
      renderHeader={(close) => (
        <header className="shrink-0 border-b border-gold-500/20 px-4 pb-2 [padding-top:max(.75rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-amber-100">Storyteller</h2>
            <Button variant="ghost" size="touch" onClick={close} aria-label="Close Storyteller">Close</Button>
          </div>
          <div role="tablist" aria-label="Storyteller tools" className="grid grid-cols-3 gap-2">
            {TABS.map((tab, index) => (
              <Button key={tab} id={`${id}-tab-${index}`} role="tab" size="touch"
                ref={(element) => { tabs.current[index] = element; }}
                aria-selected={tabIndex === index} aria-controls={`${id}-panel`}
                tabIndex={tabIndex === index ? 0 : -1}
                variant={tabIndex === index ? 'secondary' : 'ghost'}
                onClick={() => setTabIndex(index)}
                onKeyDown={(event) => {
                  const destinations: Record<string, number | undefined> = { ArrowRight: (index + 1) % TABS.length,
                    ArrowLeft: (index + TABS.length - 1) % TABS.length,
                    Home: 0, End: TABS.length - 1 };
                  const next = destinations[event.key];
                  if (next === undefined) return;
                  event.preventDefault();
                  setTabIndex(next);
                  tabs.current[next]?.focus();
                }}
              >{tab}</Button>
            ))}
          </div>
        </header>
      )}
    >
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tabIndex}`} className="space-y-5 py-4">
        {!connected && <p role="status" className="text-sm text-stone-300">Reconnect to the table to roll or reveal.</p>}
        {tabIndex === 0 && (
          <>
            <form className="space-y-4" onSubmit={(event) => {
              event.preventDefault();
              if (connected && canRollPool) sendCommand({ type: 'ST_ROLL_TABLE_POOL', count: pool,
                difficulty, rollClientId: crypto.randomUUID() });
            }}>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div className="grid gap-1">
                  <label htmlFor={`${id}-pool`} className="text-xs font-semibold text-stone-300">Dice pool</label>
                  <div className="flex gap-1">
                    <IconButton size="touch" variant="secondary" label="Decrease dice pool"
                      icon={<Minus aria-hidden="true" className="h-4 w-4" />}
                      disabled={pool <= 1} onClick={() => setPoolInput(stepPool(pool, -1))} />
                    <input id={`${id}-pool`} type="number" inputMode="numeric" min={1} max={30} required
                      value={poolInput} onChange={(event) => setPoolInput(event.target.value)} className={`${INPUT_CLASS} w-16 text-center`} />
                    <IconButton size="touch" variant="secondary" label="Increase dice pool"
                      icon={<Plus aria-hidden="true" className="h-4 w-4" />}
                      disabled={pool >= 30} onClick={() => setPoolInput(stepPool(pool, 1))} />
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs font-semibold text-stone-300">Difficulty</span>
                  <NumberStepper label="Difficulty" value={difficulty} min={2} max={10} onChange={setDifficulty} size="touch" />
                </div>
              </div>
              <Button type="submit" size="touch" variant="primary" className="w-full" disabled={!connected || !canRollPool}>
                <EyeOff className="h-4 w-4" aria-hidden="true" /> {canRollPool ? `Roll ${pool}d10 privately` : 'Roll privately'}
              </Button>
            </form>
            <section aria-labelledby={`${id}-private-log`} className="space-y-2.5">
              <h3 id={`${id}-private-log`} className="font-display text-sm font-bold text-amber-100">Private Roll Log</h3>
              <span role="status" className="sr-only">
                {latestPool && <span key={latestPool.id}>
                  Latest private roll. {latestPool.roll.dice.map((die) => die.value).join(', ')}.
                </span>}
              </span>
              <RollFeedEntries rollHistory={table.rollHistory} privateLog />
            </section>
          </>
        )}
        {tabIndex === 1 && (
          <>
            <form className="space-y-3" onSubmit={(event) => {
              event.preventDefault();
              if (!connected || !canRollInitiative) return;
              sendCommand({ type: 'ST_ROLL_TABLE_INITIATIVE', label: label.trim(), modifier,
                rollClientId: crypto.randomUUID() });
            }}>
              <label className="grid gap-1 text-xs font-semibold text-stone-300">
                Combatant name
                <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required className={INPUT_CLASS} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-stone-300">
                Initiative modifier
                <input type="number" min={-30} max={50} value={modifierInput} onBlur={() => {
                  if (!modifierInput) setModifierInput('0');
                }} onChange={(event) => setModifierInput(event.target.value)} className={`${INPUT_CLASS} w-24`} />
              </label>
              <Button type="submit" variant="primary" size="touch" className="w-full" disabled={!connected || !canRollInitiative}>
                <EyeOff className="h-4 w-4" aria-hidden="true" /> Roll initiative privately
              </Button>
            </form>
            <section aria-label="Storyteller initiative" className="space-y-2">
              <h3 className="font-display text-sm font-bold text-amber-100">Storyteller initiative</h3>
              {table.initiative.length === 0 && <p className="text-sm text-stone-400">No private initiative rolls yet.</p>}
              <ul className="space-y-2">
                {table.initiative.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-stone-800 bg-zinc-950/80 px-3 py-2">
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-amber-50">{entry.label}</span>
                    <span className="shrink-0 font-mono text-sm text-amber-200" aria-label={`Initiative ${entry.total}`}>{entry.total}</span>
                    {entry.revealed ? <span className="shrink-0 text-xs text-stone-400">Revealed</span> : (
                      <Button variant="secondary" size="touch" disabled={!connected} aria-label={`Reveal ${entry.label}`}
                        onClick={() => sendCommand({ type: 'ST_REVEAL_TABLE_INITIATIVE', entryId: entry.id })}>
                        <Eye className="h-4 w-4" aria-hidden="true" /> Reveal
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <InitiativeOrderPanel entries={sharedInitiative} currentUserId={currentUserId} touch={mobile}
              hasPrivateInitiative={table.initiative.length > 0} onClear={onClearInitiative} />
          </>
        )}
        {tabIndex === 2 && <StorytellerPlayers participants={participants} seats={table.seats} />}
      </div>
    </Modal>
  );
};
