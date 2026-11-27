import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveW20InitiativeRoll } from '@w20-vtt/core';
import type { RollHistoryEntry, ServerEvent, StorytellerTableState } from '@w20-vtt/protocol';
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

function receive(socket: FakeSocket, event: ServerEvent, replyToReqId?: string): void {
  socket.onmessage?.({ data: JSON.stringify({ seq: 5, serverTime: Date.now(), replyToReqId, event }) });
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

describe('private Storyteller room state', () => {
  const label = 'Gatekeeper';
  const roll = resolveW20InitiativeRoll({ label, initiativeModifier: 4 }, () => 7);
  const entry: RollHistoryEntry = {
    id: 'private-roll', timestamp: 100, rollerDiscordId: PARAMS.localDiscordId,
    rollerName: 'Storyteller', rollerAvatarUrl: null, label, rageDiceCount: 0,
    isSecretRoll: true, roll,
  };
  const initiative = { id: 'private-initiative', label, total: 11, revealed: false };
  const emptyTable: StorytellerTableState = { rollHistory: [], initiative: [], seats: [] };

  it('deduplicates private receipts, clears initiative without losing history, and keeps rolls out of the shared animation', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    const socket = FakeSocket.instances[0]!;
    receive(socket, { type: 'STORYTELLER_TABLE_SYNC', state: emptyTable });
    receive(socket, { type: 'STORYTELLER_ROLL_RECORDED', entry, initiative }, 'roll-1');
    receive(socket, { type: 'STORYTELLER_ROLL_RECORDED', entry, initiative }, 'retry-1');

    expect(useVttRoomStore.getState()).toMatchObject({
      storytellerTable: { rollHistory: [entry], initiative: [initiative] },
      rollHistory: [],
      diceQueue: [],
    });

    receive(socket, { type: 'STORYTELLER_INITIATIVE_UPDATED', entries: [] });
    expect(useVttRoomStore.getState().storytellerTable).toEqual({ ...emptyTable, rollHistory: [entry] });
  });

  it('requires fresh private authorization after reconnect and drops old state on account changes', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    const first = FakeSocket.instances[0]!;
    const state = { ...emptyTable, rollHistory: [entry], initiative: [initiative] };
    receive(first, { type: 'STORYTELLER_TABLE_SYNC', state });
    first.onclose?.();
    expect(useVttRoomStore.getState().storytellerTable).toBeNull();

    vi.advanceTimersByTime(500);
    const second = FakeSocket.instances[1]!;
    receive(second, { type: 'STORYTELLER_ROLL_RECORDED', entry });
    expect(useVttRoomStore.getState().storytellerTable).toBeNull();
    receive(second, { type: 'STORYTELLER_TABLE_SYNC', state });
    expect(useVttRoomStore.getState().storytellerTable).toEqual(state);

    useVttRoomStore.getState().connectRoom({ ...PARAMS, localDiscordId: 'other-user', sessionJwt: 'other-token' });
    expect(useVttRoomStore.getState()).toMatchObject({ storytellerTable: null, lastSeq: 0 });
    receive(second, { type: 'STORYTELLER_TABLE_SYNC', state });
    expect(useVttRoomStore.getState().storytellerTable).toBeNull();
  });

  it('marks a Storyteller command refusal as an action error and keeps the session live', () => {
    useVttRoomStore.getState().connectRoom(PARAMS);
    const socket = FakeSocket.instances[0]!;
    receive(socket, { type: 'PARTICIPANTS_UPDATED', participants: [] });
    const reqId = useVttRoomStore.getState().sendCommand({
      type: 'ST_REVEAL_TABLE_INITIATIVE', entryId: 'expired-initiative',
    });
    const event = { type: 'COMMAND_REJECTED', code: 'FORBIDDEN', message: 'Access ended.', currentSeq: 5 } as const;
    receive(socket, event, reqId);

    expect(useVttRoomStore.getState()).toMatchObject({
      connectionStatus: 'authenticated',
      lastError: { code: 'FORBIDDEN', storyteller: true, reqId },
    });
  });
});
