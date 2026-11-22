import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TableInitiativeEntry } from '@w20-vtt/protocol';
import { describe, expect, it, vi } from 'vitest';
import { InitiativeOrderPanel, rankInitiative } from '../InitiativeOrderPanel';

const entry = (key: string, total: number, rolledAt: number, name = key): TableInitiativeEntry => ({
  participantKey: key,
  discordUserId: key.split('::')[0]!,
  seatId: key.includes('::') ? key.split('::')[1]! : 'primary',
  displayName: name,
  total,
  rolledAt,
});

describe('rankInitiative', () => {
  it('orders highest total first', () => {
    const ranked = rankInitiative([entry('a', 7, 1), entry('b', 12, 2), entry('c', 9, 3)]);
    expect(ranked.map((e) => [e.participantKey, e.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
    expect(ranked.every((e) => !e.tied)).toBe(true);
  });

  it('gives equal totals the same rank and flags them as tied', () => {
    const ranked = rankInitiative([entry('a', 9, 5), entry('b', 12, 2), entry('c', 9, 3)]);
    expect(ranked.map((e) => [e.participantKey, e.rank, e.tied])).toEqual([
      ['b', 1, false],
      // The earlier roll is listed first, but both share second place.
      ['c', 2, true],
      ['a', 2, true],
    ]);
  });

  it('does not change the list it is given', () => {
    const input = [entry('a', 1, 1), entry('b', 2, 2)];
    rankInitiative(input);
    expect(input.map((e) => e.participantKey)).toEqual(['a', 'b']);
  });
});

describe('InitiativeOrderPanel', () => {
  it('invites players to roll when the order is empty', () => {
    render(<InitiativeOrderPanel entries={[]} currentUserId="me" onClear={() => {}} />);
    expect(screen.getByText(/No one has rolled initiative yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('lists the order, marks your seats and flags ties', () => {
    render(
      <InitiativeOrderPanel
        entries={[
          entry('me', 9, 1, 'Walks-the-Ash'),
          entry('them', 12, 2, 'Storm-Singer'),
          entry('me::seat-b', 9, 3, 'Quiet-Paw'),
        ]}
        currentUserId="me"
        onClear={() => {}}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByLabelText(/Initiative \d+/).textContent)).toEqual([
      '12',
      '9',
      '9',
    ]);
    expect(rows[0]).toHaveTextContent('Storm-Singer');
    expect(rows[0]).not.toHaveTextContent('(you)');
    expect(rows[1]).toHaveTextContent('Walks-the-Ash (you)');
    expect(within(rows[1]!).getByText('Tie')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Tie')).not.toBeInTheDocument();
  });

  it('asks before clearing the order for everyone', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <InitiativeOrderPanel entries={[entry('me', 9, 1)]} currentUserId="me" onClear={onClear} />
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByText('Clear initiative for everyone?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
