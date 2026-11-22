import { useEffect } from 'react';
import { create } from 'zustand';

export type ViewportLayoutMode = 'auto' | 'mobile' | 'desktop';

const STORAGE_KEY = 'w20-viewport-mode:v1';

/** Viewport thresholds used by layout decisions made in JavaScript. */
export const VIEWPORT_BREAKPOINTS = {
  /** Below this width the mobile layout is used. Matches Tailwind `md`. */
  mobileMaxWidth: 768,
  /** A short, fairly narrow window (a landscape phone) also gets the mobile layout. */
  compactLandscapeMaxWidth: 920,
  compactLandscapeMaxHeight: 540,
  /** From this width the side drawers dock beside the felt. Matches Tailwind `lg`. */
  dockedDrawersMinWidth: 1024,
  /** Below this width the 3D dice are drawn smaller. Matches Tailwind `sm`. */
  smallDiceMaxWidth: 640,
} as const;

export function detectAutoMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth < VIEWPORT_BREAKPOINTS.mobileMaxWidth ||
    (window.innerWidth < VIEWPORT_BREAKPOINTS.compactLandscapeMaxWidth &&
      window.innerHeight < VIEWPORT_BREAKPOINTS.compactLandscapeMaxHeight)
  );
}

function loadStoredMode(): ViewportLayoutMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'auto' || raw === 'mobile' || raw === 'desktop') {
      return raw;
    }
  } catch {
    // Ignore storage access errors in restricted iframe environments
  }
  return 'auto';
}

function persistMode(mode: ViewportLayoutMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage write errors
  }
}

interface ViewportLayoutStore {
  mode: ViewportLayoutMode;
  autoIsMobile: boolean;
  setMode: (mode: ViewportLayoutMode) => void;
  cycleMode: () => void;
  syncAutoMobile: () => void;
}

const useViewportLayoutStore = create<ViewportLayoutStore>()((set, get) => ({
  mode: loadStoredMode(),
  autoIsMobile: detectAutoMobile(),
  setMode: (mode) => {
    persistMode(mode);
    set({ mode });
  },
  cycleMode: () => {
    const cur = get().mode;
    const next: ViewportLayoutMode =
      cur === 'auto' ? 'mobile' : cur === 'mobile' ? 'desktop' : 'auto';
    get().setMode(next);
  },
  syncAutoMobile: () => {
    const next = detectAutoMobile();
    if (next !== get().autoIsMobile) {
      set({ autoIsMobile: next });
    }
  },
}));

let listenerRefCount = 0;
let resizeHandler: (() => void) | null = null;

function retainResizeListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  listenerRefCount += 1;
  if (listenerRefCount === 1) {
    resizeHandler = () => {
      useViewportLayoutStore.getState().syncAutoMobile();
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
  }
  return () => {
    listenerRefCount = Math.max(0, listenerRefCount - 1);
    if (listenerRefCount === 0 && resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('orientationchange', resizeHandler);
      resizeHandler = null;
    }
  };
}

export function useViewportLayout(): {
  isMobile: boolean;
  mode: ViewportLayoutMode;
  setMode: (mode: ViewportLayoutMode) => void;
  cycleMode: () => void;
} {
  const mode = useViewportLayoutStore((s) => s.mode);
  const autoIsMobile = useViewportLayoutStore((s) => s.autoIsMobile);
  const setMode = useViewportLayoutStore((s) => s.setMode);
  const cycleMode = useViewportLayoutStore((s) => s.cycleMode);

  useEffect(() => {
    useViewportLayoutStore.getState().syncAutoMobile();
    return retainResizeListener();
  }, []);

  const isMobile = mode === 'mobile' ? true : mode === 'desktop' ? false : autoIsMobile;
  return { isMobile, mode, setMode, cycleMode };
}
