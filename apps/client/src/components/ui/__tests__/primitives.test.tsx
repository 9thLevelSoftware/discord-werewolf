import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  ConfirmButton,
  IconButton,
  Modal,
  NumberStepper,
  PipTrack,
  Select,
  TextInput,
  toast,
  ToastViewport,
  useToasts,
} from '../index';
import { useModalStack } from '../modalStack';

beforeEach(() => {
  useToasts.getState().clear();
  useModalStack.setState({ stack: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Button and IconButton', () => {
  it('defaults to type="button" and disables while loading', () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('gives an icon-only button an accessible name', () => {
    render(<IconButton label="Pin this roll" icon={<svg />} />);
    expect(screen.getByRole('button', { name: 'Pin this roll' })).toBeInTheDocument();
  });
});

describe('TextInput and Select', () => {
  it('links the label, hint and error to the control', () => {
    const { rerender } = render(<TextInput label="Name" hint="Shown to the table." />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAccessibleDescription('Shown to the table.');

    rerender(<TextInput label="Name" hint="Shown to the table." error="Name is required." />);
    expect(screen.getByLabelText('Name')).toBeInvalid();
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required.');
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
  });

  it('keeps a hidden label available to assistive technology', () => {
    render(
      <Select label="Breed" hideLabel defaultValue="homid">
        <option value="homid">Homid</option>
      </Select>
    );
    expect(screen.getByRole('combobox', { name: 'Breed' })).toBeInTheDocument();
  });
});

describe('NumberStepper', () => {
  it('steps within the range and disables at the limits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <NumberStepper label="Difficulty" value={9} min={2} max={10} onChange={onChange} />
    );

    await user.click(screen.getByRole('button', { name: 'Increase Difficulty' }));
    expect(onChange).toHaveBeenLastCalledWith(10);

    rerender(<NumberStepper label="Difficulty" value={10} min={2} max={10} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Increase Difficulty' })).toBeDisabled();

    rerender(<NumberStepper label="Difficulty" value={2} min={2} max={10} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Decrease Difficulty' })).toBeDisabled();
  });

  it('clamps an out-of-range value for display', () => {
    render(<NumberStepper label="Pool" value={99} min={1} max={30} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Pool' })).toHaveTextContent('30');
  });
});

const PipHarness: React.FC<{ initial: number; max?: number }> = ({ initial, max = 5 }) => {
  const [value, setValue] = useState(initial);
  return <PipTrack label="Rage" value={value} max={max} onChange={setValue} />;
};

describe('PipTrack', () => {
  const pip = (n: number) => document.querySelector(`[data-pip="${n}"]`) as HTMLElement;

  it('sets the rating on click and lowers it by one when the current pip is clicked', async () => {
    const user = userEvent.setup();
    render(<PipHarness initial={2} />);
    const slider = screen.getByRole('slider', { name: 'Rage' });

    await user.click(pip(4));
    expect(slider).toHaveAttribute('aria-valuenow', '4');

    await user.click(pip(4));
    expect(slider).toHaveAttribute('aria-valuenow', '3');

    await user.click(pip(1));
    expect(slider).toHaveAttribute('aria-valuenow', '1');

    await user.click(pip(1));
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('works as a keyboard slider', async () => {
    const user = userEvent.setup();
    render(<PipHarness initial={2} />);
    const slider = screen.getByRole('slider', { name: 'Rage' });

    await user.tab();
    expect(slider).toHaveFocus();

    await user.keyboard('{ArrowRight}{ArrowUp}');
    expect(slider).toHaveAttribute('aria-valuenow', '4');
    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveAttribute('aria-valuenow', '3');
    await user.keyboard('{End}');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    await user.keyboard('{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    await user.keyboard('{Home}');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('ignores input when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PipTrack label="Rage" value={2} onChange={onChange} disabled />);
    await user.click(pip(4));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('slider', { name: 'Rage' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('ConfirmButton', () => {
  it('only runs the action after an explicit second press', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton prompt="Delete Walks-the-Ash for good?" confirmLabel="Delete" onConfirm={onConfirm}>
        Delete sheet
      </ConfirmButton>
    );

    await user.click(screen.getByRole('button', { name: 'Delete sheet' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Delete Walks-the-Ash for good?')).toBeInTheDocument();
    // Focus lands on Cancel so a double Enter cannot confirm.
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('backs out on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmButton prompt="Remove this seat?" onConfirm={onConfirm}>
        Remove
      </ConfirmButton>
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
  });
});

describe('Toast', () => {
  it('closes itself after its duration and can be dismissed by hand', () => {
    vi.useFakeTimers();
    render(<ToastViewport />);

    act(() => {
      toast.info('Sync code copied.', 1000);
      toast.error('Roll rejected.', 0);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sync code copied.');
    expect(screen.getByRole('alert')).toHaveTextContent('Roll rejected.');

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // A duration of 0 stays until dismissed.
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a toast pushed again with the same id', () => {
    render(<ToastViewport />);
    act(() => {
      useToasts.getState().push({ id: 'room-error', message: 'First', tone: 'error' });
      useToasts.getState().push({ id: 'room-error', message: 'Second', tone: 'error' });
    });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Second');
  });
});

const ModalHarness: React.FC<{ dirty?: boolean; onClosed?: () => void }> = ({
  dirty = false,
  onClosed,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ToastViewport />
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Modal
        open={open}
        title="Character sheet"
        dirty={dirty}
        onClose={() => {
          setOpen(false);
          onClosed?.();
        }}
      >
        <button type="button">Inside</button>
      </Modal>
    </>
  );
};

describe('Modal', () => {
  it('opens as a named dialog and returns focus to the opener on close', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole('button', { name: 'Open sheet' });

    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Character sheet' });
    expect(dialog).toHaveAttribute('open');

    await user.click(screen.getByRole('button', { name: 'Close Character sheet' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape (the dialog cancel event)', async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<ModalHarness onClosed={onClosed} />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before discarding unsaved changes', async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<ModalHarness dirty onClosed={onClosed} />);
    await user.click(screen.getByRole('button', { name: 'Open sheet' }));

    await user.click(screen.getByRole('button', { name: 'Close Character sheet' }));
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close Character sheet' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('draws toasts inside the open modal so they stay reachable', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    act(() => {
      toast.error('Before the modal.', 0);
    });
    expect(screen.getByRole('alert').closest('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open sheet' }));
    const dialog = screen.getByRole('dialog');
    // Exactly one copy, and it now lives inside the dialog.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').closest('dialog')).toBe(dialog);

    await user.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      toast.error('After closing.', 0);
    });
    await user.click(screen.getByRole('button', { name: 'Close Character sheet' }));
    expect(screen.getByRole('alert').closest('dialog')).toBeNull();
  });
});
