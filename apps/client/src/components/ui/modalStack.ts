import { create } from 'zustand';

/** Host id of the toast viewport mounted at the app root. */
export const ROOT_TOAST_HOST = 'root';

interface ModalStackState {
  /** Ids of open modals, oldest first. The last one is on top. */
  stack: string[];
  push: (id: string) => void;
  remove: (id: string) => void;
}

/** Tracks which modal is on top, so toasts can be drawn inside it. */
export const useModalStack = create<ModalStackState>((set) => ({
  stack: [],
  push: (id) => set((state) => ({ stack: [...state.stack.filter((x) => x !== id), id] })),
  remove: (id) => set((state) => ({ stack: state.stack.filter((x) => x !== id) })),
}));
