import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resolveW20DicePool } from '@w20-vtt/core';
import type { RollHistoryEntry, RollReplacementOption } from '@w20-vtt/protocol';
import { RollFeedDrawer } from '../RollFeedDrawer';

describe('roll log replacement controls', () => {
  it('distinguishes a fresh attempt from the available power and preserves a declaration with no 10', () => {
    const entry: RollHistoryEntry = {
      id: 'original', rollerDiscordId: 'roller', rollerName: 'Player', rollerAvatarUrl: null,
      label: 'Track by scent', rageDiceCount: 0, isSecretRoll: false, timestamp: 0,
      roll: resolveW20DicePool({ label: 'Track by scent', basePool: 1, hasApplicableSpecialty: true }, () => 3),
    };
    const option: RollReplacementOption = {
      rollId: entry.id, sheetId: 'tracker', ruleId: 'gift', name: 'Fair Fortune', remaining: 1, gnosisCost: 1,
    };
    const repeat = vi.fn();
    const replace = vi.fn();
    render(<RollFeedDrawer open rollHistory={[entry]} disabled={false}
      onClose={vi.fn()} onReroll={repeat} onReplace={replace} replacementOptions={[option]}
      pendingActivations={[]} onReviewActivation={vi.fn()} />);

    expect(screen.getByText('Specialty · double 10s')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Use Fair Fortune.*1 Gnosis.*1 left/ }));
    expect(replace).toHaveBeenCalledWith(option);
    expect(repeat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Roll Track by scent again' }));
    expect(repeat).toHaveBeenCalledWith(entry);
  });
});
