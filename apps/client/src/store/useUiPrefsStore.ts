import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Where panels and tabs were left, remembered on this device between sessions.
 * Only layout choices live here; nothing about characters or rolls.
 */
export interface UiPrefs {
  /** Desktop Pack drawer. */
  packOpen: boolean;
  /** Desktop Roll Log drawer. null means "not chosen yet": open on wide windows. */
  feedOpen: boolean | null;
  /** Modifiers tray in the desktop console. */
  modifiersOpen: boolean;
  sheetDesktopPage: 'page1' | 'page2';
  sheetMobileTab: string;
  rosterMobileTab: string;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  packOpen: false,
  feedOpen: null,
  modifiersOpen: false,
  sheetDesktopPage: 'page1',
  sheetMobileTab: 'identity',
  rosterMobileTab: 'saved',
};

interface UiPrefsState extends UiPrefs {
  setPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;
}

export const UI_PREFS_STORAGE_KEY = 'w20-ui-prefs:v1';

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_UI_PREFS,
      setPref: (key, value) => set({ [key]: value } as Pick<UiPrefs, typeof key>),
    }),
    {
      name: UI_PREFS_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      // Keep only known keys, so a stored value from another version cannot leak in.
      partialize: (state) => {
        const { setPref: _setPref, ...prefs } = state;
        return prefs;
      },
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<UiPrefs>;
        const next = { ...current };
        for (const key of Object.keys(DEFAULT_UI_PREFS) as Array<keyof UiPrefs>) {
          const value = stored[key];
          const fallback = DEFAULT_UI_PREFS[key];
          // feedOpen starts as null ("not chosen"), so it accepts a boolean or null.
          const sameType =
            key === 'feedOpen'
              ? typeof value === 'boolean' || value === null
              : value !== undefined && typeof value === typeof fallback;
          if (sameType) {
            (next as Record<string, unknown>)[key] = value;
          }
        }
        return next;
      },
    }
  )
);

/** useState-shaped access to one remembered preference. */
export function useUiPref<K extends keyof UiPrefs>(
  key: K
): [UiPrefs[K], Dispatch<SetStateAction<UiPrefs[K]>>] {
  const value = useUiPrefsStore((s) => s[key]);
  const setValue = useCallback<Dispatch<SetStateAction<UiPrefs[K]>>>(
    (next) => {
      const state = useUiPrefsStore.getState();
      const resolved =
        typeof next === 'function'
          ? (next as (prev: UiPrefs[K]) => UiPrefs[K])(state[key])
          : next;
      state.setPref(key, resolved);
    },
    [key]
  );
  return [value, setValue];
}
