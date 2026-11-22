import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { usePopoverDismiss } from '../usePopoverDismiss';

const Harness: React.FC = () => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  usePopoverDismiss({ open, onClose: () => setOpen(false), containerRef, triggerRef });
  return (
    <div>
      <div ref={containerRef}>
        <button ref={triggerRef} type="button" onClick={() => setOpen((v) => !v)}>
          Difficulty
        </button>
        {open && (
          <div role="dialog" aria-label="Difficulty presets">
            <button type="button">Seven</button>
          </div>
        )}
      </div>
      <button type="button">Elsewhere</button>
    </div>
  );
};

describe('usePopoverDismiss', () => {
  it('closes on Escape, returns focus to the trigger and cancels the key press', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Difficulty' }));
    await user.click(screen.getByRole('button', { name: 'Seven' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // A cancelled Escape does not reach an enclosing modal dialog.
    const notCancelled = fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(notCancelled).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Difficulty' })).toHaveFocus();
  });

  it('closes on a press outside but not inside', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Difficulty' }));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Seven' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves Escape alone while closed', () => {
    render(<Harness />);
    expect(fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true);
  });
});
