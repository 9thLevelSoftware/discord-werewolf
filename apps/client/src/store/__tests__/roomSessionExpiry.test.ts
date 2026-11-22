import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVttRoomStore } from '../useVttRoomStore';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

const PARAMS = {
  wsUrl: 'ws://localhost/ws/room/dice-room-test',
  sessionJwt: 'old-token',
  localDiscordId: 'user-1',
  campaignId: 'dice-room-test',
  characterId: null,
};

function reject(socket: FakeSocket, code: string, message: string): void {
  socket.onmessage?.({
    data: JSON.stringify({
      seq: 0,
      serverTime: Date.now(),
      event: { type: 'COMMAND_REJECTED', code, message, currentSeq: 0 },
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  useVttRoomStore.getState().disconnectRoom();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('room connection when the session is refused', () => {
  it('stops reconnecting on UNAUTHORIZED and resumes when a new session arrives', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    expect(FakeSocket.instances).toHaveLength(1);
    const first = FakeSocket.instances[0]!;

    reject(first, 'UNAUTHORIZED', 'Invalid or expired session token.');
    first.onclose?.();

    expect(useVttRoomStore.getState().connectionStatus).toBe('session_expired');
    // The refusal is a state, not a toast-able error.
    expect(useVttRoomStore.getState().lastError).toBeNull();

    // No reconnect loop with the same dead token.
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);

    useVttRoomStore.getState().updateSessionJwt('new-token');
    expect(FakeSocket.instances).toHaveLength(2);
    expect(useVttRoomStore.getState().connectionStatus).not.toBe('session_expired');
    expect(useVttRoomStore.getState().sessionJwt).toBe('new-token');
  });

  it('still reconnects after an ordinary disconnect', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    FakeSocket.instances[0]!.onclose?.();
    expect(useVttRoomStore.getState().connectionStatus).toBe('reconnecting');
    vi.advanceTimersByTime(11_000);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  it('keeps other rejections as a dismissible error', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    reject(FakeSocket.instances[0]!, 'VALIDATION_ERROR', 'Pool is too large.');
    expect(useVttRoomStore.getState().lastError?.message).toBe('Pool is too large.');
    useVttRoomStore.getState().clearLastError();
    expect(useVttRoomStore.getState().lastError).toBeNull();
  });
});
