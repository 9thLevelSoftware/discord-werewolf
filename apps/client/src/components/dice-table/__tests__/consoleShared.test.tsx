import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  connectionLabel,
  getRollBlockReason,
  getRollCtaText,
  getRollGate,
  RageDiceStepper,
  RollModifierToggles,
  SavePinButton,
} from '../console/consoleShared';
import { MAX_LOCAL_QUEUED_ROLLS } from '../rollQueueController';
import { TableSettingsMenu } from '../console/TableSettingsMenu';

describe('getRollGate', () => {
  const base = {
    connectionStatus: 'authenticated' as const,
    localPendingCount: 0,
    isSheetTraitsMode: false,
    hasTraitSelection: false,
    pool: 5,
  };

  it('allows rolling when connected or reconnecting', () => {
    expect(getRollGate(base).isDisabled).toBe(false);
    expect(getRollGate({ ...base, connectionStatus: 'reconnecting' }).isDisabled).toBe(false);
  });

  it('blocks rolling when offline or when the local queue is full', () => {
    expect(getRollGate({ ...base, connectionStatus: 'disconnected' }).isDisabled).toBe(true);
    expect(getRollGate({ ...base, localPendingCount: MAX_LOCAL_QUEUED_ROLLS }).isDisabled).toBe(
      true
    );
  });

  it('blocks sheet-trait rolls with no selection or an empty pool', () => {
    expect(getRollGate({ ...base, isSheetTraitsMode: true }).rollBlockedByEmptyTraits).toBe(true);
    expect(
      getRollGate({ ...base, isSheetTraitsMode: true, hasTraitSelection: true, pool: 0 })
        .rollBlockedByEmptyTraits
    ).toBe(true);
    expect(
      getRollGate({ ...base, isSheetTraitsMode: true, hasTraitSelection: true })
        .rollBlockedByEmptyTraits
    ).toBe(false);
  });
});

describe('getRollCtaText', () => {
  const base = {
    isSheetTraitsMode: true,
    hasTraitSelection: true,
    pool: 7,
    effectivePreviewPool: 7,
    difficulty: 6,
    clampedPreviewRage: 0,
  };

  it('describes the roll, adding difficulty and Rage only when they matter', () => {
    expect(getRollCtaText(base)).toBe('Roll 7d10');
    expect(getRollCtaText({ ...base, difficulty: 8, clampedPreviewRage: 2 })).toBe(
      'Roll 7d10 • Diff 8 • 2 Rage'
    );
  });

  it('shows the block reason in place of the roll text', () => {
    expect(getRollCtaText({ ...base, blockReason: 'Session expired' })).toBe('Session expired');
  });

  it('explains why a sheet-trait roll is not ready', () => {
    expect(getRollCtaText({ ...base, hasTraitSelection: false })).toBe('Pick a trait');
    expect(getRollCtaText({ ...base, pool: 0 })).toBe('0 Dice');
  });
});

describe('getRollBlockReason', () => {
  it('is null when rolling is possible, including while reconnecting', () => {
    expect(getRollBlockReason({ connectionStatus: 'authenticated', localPendingCount: 0 })).toBeNull();
    expect(getRollBlockReason({ connectionStatus: 'reconnecting', localPendingCount: 3 })).toBeNull();
  });

  it('names the reason when rolling is blocked', () => {
    expect(getRollBlockReason({ connectionStatus: 'session_expired', localPendingCount: 0 })).toBe(
      'Session expired'
    );
    expect(getRollBlockReason({ connectionStatus: 'disconnected', localPendingCount: 0 })).toBe(
      'Offline'
    );
    expect(
      getRollBlockReason({
        connectionStatus: 'authenticated',
        localPendingCount: MAX_LOCAL_QUEUED_ROLLS,
      })
    ).toBe(`Queue full (${MAX_LOCAL_QUEUED_ROLLS})`);
  });
});

describe('connectionLabel', () => {
  it('uses player-facing words', () => {
    expect(connectionLabel('authenticated')).toBe('Connected');
    expect(connectionLabel('reconnecting')).toBe('Reconnecting');
    expect(connectionLabel('disconnected')).toBe('Offline');
    expect(connectionLabel('session_expired')).toBe('Session expired');
  });
});

describe('RollModifierToggles', () => {
  const handlers = {
    onToggleSpecialty: vi.fn(),
    onToggleSpendWillpower: vi.fn(),
    onToggleApplyWoundPenalty: vi.fn(),
    onToggleSecretRoll: vi.fn(),
  };

  it('exposes each toggle state and disables Willpower when none is left', async () => {
    const user = userEvent.setup();
    render(
      <RollModifierToggles
        layout="row"
        specialtyDeclared
        specialtyReason="Firearms: Rifles"
        spendWillpower={false}
        applyWoundPenalty
        isSecretRoll={false}
        willpowerRemaining={0}
        woundPenalty={-2}
        {...handlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Apply specialty (Firearms: Rifles)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Wounds \(-2\)/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: '+1 Willpower' })).toBeDisabled();

    const secret = screen.getByRole('button', { name: 'Secret' });
    expect(secret).toHaveAttribute('aria-pressed', 'false');
    await user.click(secret);
    expect(handlers.onToggleSecretRoll).toHaveBeenCalledTimes(1);
  });
});

describe('TableSettingsMenu', () => {
  it('shows the shared mode and dispatches a selection without changing the confirmed value', async () => {
    const user = userEvent.setup();
    const onSetSpecialtyMode = vi.fn();
    const props = {
      muted: false,
      volume: 0.5,
      layoutMode: 'mobile' as const,
      canChangeSpecialtyMode: true,
      onSetSpecialtyMode,
      onToggleMute: vi.fn(),
      onVolumeChange: vi.fn(),
      onCycleLayoutMode: vi.fn(),
    };
    const { rerender } = render(<TableSettingsMenu {...props} specialtyMode="w20_double" />);
    await user.click(screen.getByRole('button', { name: 'Table settings' }));
    const mode = screen.getByRole('combobox', { name: 'Shared specialty mode' });
    await user.selectOptions(mode, 'revised_explode');
    expect(onSetSpecialtyMode).toHaveBeenCalledWith('revised_explode');
    expect(mode).toHaveValue('w20_double');

    rerender(<TableSettingsMenu {...props} specialtyMode="revised_explode" />);
    expect(mode).toHaveValue('revised_explode');
    rerender(<TableSettingsMenu {...props} specialtyMode="revised_explode" canChangeSpecialtyMode={false} />);
    expect(mode).toBeDisabled();
  });
});

describe('RageDiceStepper', () => {
  it('never lets Rage dice exceed the pool, including on Sync', async () => {
    const user = userEvent.setup();
    const onSet = vi.fn();
    render(
      <RageDiceStepper
        layout="inline"
        rageDiceCount={3}
        pool={3}
        trackerRage={7}
        onSetRageDiceCount={onSet}
      />
    );

    expect(screen.getByRole('button', { name: 'Increase Rage dice' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onSet).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Decrease Rage dice' }));
    expect(onSet).toHaveBeenLastCalledWith(2);
  });
});

describe('SavePinButton', () => {
  it('names the action for a bound sheet or an unbound preset', () => {
    const { rerender } = render(<SavePinButton pinsToSheet saved={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Pin to Sheet' })).toBeInTheDocument();
    rerender(<SavePinButton pinsToSheet={false} saved={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save Preset' })).toBeInTheDocument();
    rerender(<SavePinButton pinsToSheet saved onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Pinned!' })).toBeInTheDocument();
  });
});
