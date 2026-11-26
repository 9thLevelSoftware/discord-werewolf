import React from 'react';
import { render, screen } from '@testing-library/react';
import { resolveW20DicePool, resolveW20InitiativeRoll } from '@w20-vtt/core';
import { describe, expect, it } from 'vitest';
import { AuthoritativeDieChips, buildDecoratedFaces } from '../DieFaceTiles';

describe('authoritative die chips', () => {
  it.each([false, true])('shows each recorded specialty chain together (compact: %s)', (compact) => {
    const faces = [10, 10, 7, 10, 1, 8];
    const roll = resolveW20DicePool({
      label: 'Brawl',
      basePool: 3,
      hasApplicableSpecialty: true,
      specialtyMode: 'revised_explode',
    }, () => faces.shift()!);

    render(<AuthoritativeDieChips roll={roll} rageDiceCount={2} compact={compact} />);

    expect(screen.getAllByRole('img').map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Obsidian die, 10, 1 success',
      'Specialty bonus die, 10, Continues previous die, 1 success',
      'Specialty bonus die, 8, Continues previous die, 1 success',
      'Rage die, 10, 1 success',
      'Specialty bonus die, 1, Continues previous die, No cancellation',
      'Rage die, 7, 1 success',
    ]);
  });

  it('tracks cancellation per success on a doubled ten', () => {
    const faces = [10, 7, 1];
    const roll = resolveW20DicePool({
      label: 'Brawl',
      basePool: 3,
      specialtyMode: 'w20_double',
      hasApplicableSpecialty: true,
    }, () => faces.shift()!);
    const [ten, seven] = buildDecoratedFaces(roll, 0);
    expect(ten?.canceledSuccesses).toBe(1);
    expect(seven?.canceledSuccesses).toBe(0);

    render(<AuthoritativeDieChips roll={roll} rageDiceCount={0} />);

    expect(screen.getByRole('img', { name: 'Obsidian die, 10, 2 successes, 1 canceled' }))
      .not.toHaveClass('line-through');
    expect(screen.getByText('x2')).toBeVisible();
    expect(screen.getByText('−1')).toBeVisible();
  });

  it('shows a zero pool explicitly and describes initiative without cancellation', () => {
    const empty = resolveW20DicePool({ label: 'Brawl', basePool: 0 });
    const initiative = resolveW20InitiativeRoll({ initiativeModifier: 6 }, () => 1);
    const view = render(<AuthoritativeDieChips roll={empty} rageDiceCount={0} />);

    expect(screen.getByText('No dice rolled')).toBeVisible();
    view.rerender(<AuthoritativeDieChips roll={initiative} rageDiceCount={1} />);
    expect(screen.getByRole('img', { name: 'Initiative die, 1' })).toBeVisible();
  });
});
