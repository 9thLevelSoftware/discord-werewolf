import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { computeUserSheetStats, createBlankUserCharacterSheet, resolveW20DicePool } from '@w20-vtt/core';
import type { StorytellerTableState, TableParticipant } from '@w20-vtt/protocol';
import { describe, expect, it, vi } from 'vitest';
import { StorytellerPanel } from '../StorytellerPanel';

const emptyTable: StorytellerTableState = { rollHistory: [], initiative: [], seats: [] };

const makeProps = () => ({
  mobile: true, connected: true, table: emptyTable, currentUserId: 'storyteller',
  participants: [], sharedInitiative: [], sendCommand: vi.fn(() => 'request'),
  onClearInitiative: vi.fn(), onClose: vi.fn(),
});

describe('StorytellerPanel', () => {
  it('submits exact pool and difficulty privately and renders server dice without Roll again', () => {
    const props = makeProps();
    const { rerender } = render(<StorytellerPanel {...props} />);
    expect(screen.getByRole('tab', { name: 'Roll' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Increase dice pool' }));
    expect(screen.getByRole('spinbutton', { name: 'Dice pool' })).toHaveValue(2);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Dice pool' }), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Increase Difficulty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll 30d10 privately' }));
    expect(props.sendCommand).toHaveBeenCalledOnce();
    expect(props.sendCommand).toHaveBeenCalledWith({
      type: 'ST_ROLL_TABLE_POOL', count: 30, difficulty: 7, rollClientId: expect.any(String),
    });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    const roll = resolveW20DicePool({ label: '30d10', basePool: 30, baseDifficulty: 7 }, () => 8);
    rerender(<StorytellerPanel {...props} table={{ ...emptyTable, rollHistory: [{
      id: 'result', timestamp: 0, rollerDiscordId: 'storyteller', rollerName: 'Storyteller',
      rollerAvatarUrl: null, label: '30d10', rageDiceCount: 0, isSecretRoll: true, roll,
    }] }} />);
    const privateLog = within(screen.getByRole('region', { name: 'Private Roll Log' }));
    expect(privateLog.getByRole('status')).toHaveTextContent('8, 8, 8');
    expect(privateLog.getByRole('article')).toHaveTextContent('30d10');
    expect(privateLog.queryByRole('button', { name: /again/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Dice pool' }), { target: { value: '31' } });
    expect(screen.getByRole('button', { name: 'Roll privately' })).toBeDisabled();
  });

  it('rolls a named combatant privately, keeps it out of the shared order, then explicitly reveals it', () => {
    const props = makeProps();
    render(<StorytellerPanel {...props} table={{ ...emptyTable, initiative: [
      { id: 'wolf', label: 'Wolf', total: 13, revealed: false },
      { id: 'crow', label: 'Crow', total: 9, revealed: false },
    ] }} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Roll' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Initiative' })).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Combatant name'), { target: { value: '  Ash  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative privately' }));
    expect(props.sendCommand).toHaveBeenNthCalledWith(1, {
      type: 'ST_ROLL_TABLE_INITIATIVE', label: 'Ash', modifier: 0, rollClientId: expect.any(String),
    });
    const shared = within(screen.getByRole('region', { name: 'Initiative order' }));
    expect(shared.queryByText('Wolf')).not.toBeInTheDocument();
    expect(shared.getByRole('button', { name: 'Clear' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Wolf' }));
    expect(props.sendCommand).toHaveBeenNthCalledWith(2, { type: 'ST_REVEAL_TABLE_INITIATIVE', entryId: 'wolf' });
    expect(screen.getByRole('button', { name: 'Reveal Crow' })).toBeVisible();
  });

  it('lists live seats with read-only sheet stats or light trackers', () => {
    const props = makeProps();
    const makeSeat = (name: string, isConnected: boolean): TableParticipant => ({
      displayName: name, discordUserId: name, avatarUrl: null, isConnected,
      trackers: { gnosis: 2, rage: 1, willpower: 3, woundPenalty: 0 },
    });
    const sheet = createBlankUserCharacterSheet({ id: 'sheet', ownerDiscordId: 'Kai', name: 'Rook', syncCode: 'SECRET42' });
    render(<StorytellerPanel {...props} participants={[makeSeat('Kai', true), makeSeat('Lee', true), makeSeat('Gone', false)]}
      table={{ ...emptyTable, seats: [{ participantKey: 'Kai', sheet: { sheet, computed: computeUserSheetStats(sheet) } }] }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }));
    const seats = within(screen.getByRole('list', { name: 'Present seats' }));
    fireEvent.click(seats.getByText('Rook · Kai'));
    fireEvent.click(seats.getByText('Attributes'));
    expect(seats.getByText('Strength')).toBeVisible();
    fireEvent.click(seats.getByText('No sheet bound'));
    expect(seats.getByText('Wound penalty')).toBeVisible();
    expect(seats.queryByText('Gone')).not.toBeInTheDocument();
    expect(seats.queryByText('SECRET42')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
