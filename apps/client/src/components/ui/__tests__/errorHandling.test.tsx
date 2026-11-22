import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeBootError } from '../../../App';
import { ErrorBoundary } from '../ErrorBoundary';

afterEach(() => {
  vi.restoreAllMocks();
});

const Boom: React.FC = () => {
  throw new Error('pip track exploded');
};

describe('ErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page when a component crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The dice table hit a problem');
    expect(screen.getByRole('button', { name: 'Reload table' })).toBeInTheDocument();
    expect(screen.getByText('pip track exploded')).toBeInTheDocument();
  });

  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>Dice table</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Dice table')).toBeInTheDocument();
  });
});

describe('describeBootError', () => {
  it('tells players to launch from a voice channel when not opened as an activity', () => {
    expect(
      describeBootError('This application must be launched as a Discord Activity (missing frame_id)')
    ).toMatch(/voice channel/);
  });

  it('explains a timeout and a failed sign-in in plain words', () => {
    expect(describeBootError('Discord did not respond in time (authorizing).')).toMatch(/too long/);
    expect(describeBootError('Discord OAuth token exchange failed (500): boom')).toMatch(
      /could not sign you in/
    );
  });

  it('never shows the raw error text', () => {
    const raw = 'Missing VITE_DISCORD_CLIENT_ID. Set VITE_DISCORD_CLIENT_ID before launching.';
    expect(describeBootError(raw)).not.toContain('VITE_');
    expect(describeBootError(null)).toMatch(/could not connect/);
  });
});
