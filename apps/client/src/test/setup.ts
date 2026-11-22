import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom does not implement the modal dialog API. Provide the minimum the Modal
// component relies on: the `open` state and a `close` event.
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

// Newer Node versions define their own `localStorage` global, which is unusable
// without a backing file and hides jsdom's. Provide a small in-memory one so code
// that remembers things on the device can be tested.
if (typeof window !== 'undefined') {
  let usable = false;
  try {
    usable = typeof window.localStorage?.setItem === 'function';
  } catch {
    usable = false;
  }
  if (!usable) {
    const data = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => (data.has(key) ? data.get(key)! : null),
      key: (index) => Array.from(data.keys())[index] ?? null,
      removeItem: (key) => {
        data.delete(key);
      },
      setItem: (key, value) => {
        data.set(key, String(value));
      },
    };
    Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
  }
}
