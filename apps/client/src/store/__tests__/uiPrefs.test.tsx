import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_PREFS,
  UI_PREFS_STORAGE_KEY,
  useUiPref,
  useUiPrefsStore,
} from '../useUiPrefsStore';

beforeEach(() => {
  window.localStorage.clear();
  useUiPrefsStore.setState({ ...DEFAULT_UI_PREFS });
});

describe('remembered panel state', () => {
  it('behaves like useState, including updater functions', () => {
    const { result } = renderHook(() => useUiPref('packOpen'));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]((open) => !open));
    expect(result.current[0]).toBe(false);
  });

  it('writes choices to local storage', () => {
    const { result } = renderHook(() => useUiPref('sheetDesktopPage'));
    act(() => result.current[1]('page2'));
    const stored = JSON.parse(window.localStorage.getItem(UI_PREFS_STORAGE_KEY) ?? '{}');
    expect(stored.state.sheetDesktopPage).toBe('page2');
    expect(stored.state.setPref).toBeUndefined();
  });

  it('restores stored choices and ignores values of the wrong type', async () => {
    window.localStorage.setItem(
      UI_PREFS_STORAGE_KEY,
      JSON.stringify({
        state: { packOpen: true, feedOpen: false, modifiersOpen: 'yes', unknownKey: 1 },
        version: 0,
      })
    );
    await useUiPrefsStore.persist.rehydrate();
    const state = useUiPrefsStore.getState();
    expect(state.packOpen).toBe(true);
    expect(state.feedOpen).toBe(false);
    // A wrong type falls back to the default; unknown keys are dropped.
    expect(state.modifiersOpen).toBe(false);
    expect((state as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it('leaves the roll log choice unset until the player makes one', () => {
    expect(useUiPrefsStore.getState().feedOpen).toBeNull();
  });
});
