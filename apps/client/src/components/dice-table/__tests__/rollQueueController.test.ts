import { afterEach, describe, expect, it, vi } from 'vitest';
import type { W20RollResult } from '@w20-vtt/core';
import type { ClientEnvelope, ServerEnvelope, ServerEvent } from '@w20-vtt/protocol';

vi.mock('../../../audio/SyncedSoundscapeEngine', () => ({
  soundscapeEngine: {
    syncState: vi.fn(),
    crossfadeToRealm: vi.fn(),
    playSting: vi.fn(),
    unlockOnFirstGesture: vi.fn(),
  },
}));

import { type Queued3DRoll, useVttRoomStore } from '../../../store/useVttRoomStore';
import {
  type DiceBoxGroup,
  type DiceBoxLike,
  type LocalQueuedRollSpec,
  MAX_LOCAL_QUEUED_ROLLS,
  RollStageCoordinator,
  type RollStageStatus,
  SafeDiceBoxController,
  DICE_FORCE_FREEZE_MS,
  PHYSICS_SETTLE_TIMEOUT_MS,
  physicalDiceMatchRoll,
} from '../rollQueueController';

function makeRollResult(values: number[], seed = 'seed-1'): W20RollResult {
  const netSuccesses = values.filter((v) => v >= 6).length;
  return {
    effectivePool: values.length,
    clampedDifficulty: 6,
    dice: values.map((value) => ({
      value,
      isBonusExplosionDie: false,
      contributedSuccesses: value >= 6 ? 1 : 0,
      isOne: value === 1,
    })),
    rawSuccesses: netSuccesses,
    onesRolled: values.filter((v) => v === 1).length,
    automaticSuccesses: 0,
    netSuccesses,
    isBotch: false,
    outcome: netSuccesses > 0 ? 'marginal' : 'failure',
    physicsSeed: seed,
    rollMode: 'pool',
  };
}

function makeLocalSpec(rollClientId: string, label: string, pool = 3): LocalQueuedRollSpec {
  return {
    rollClientId,
    pool,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: false,
    spendWillpower: false,
    applyWoundPenalty: false,
    rollMode: 'pool',
    label,
    isSecretRoll: false,
    seatId: 'primary',
    rollerDisplayName: 'Maya',
    effectivePool: pool,
    effectiveRage: 0,
  };
}

function makeRemoteRoll(
  id: string,
  rollerName: string,
  label: string,
  values: number[],
  rollClientId?: string
): Queued3DRoll {
  return {
    id,
    rollerDiscordId: `user-${rollerName.toLowerCase()}`,
    label,
    roll: makeRollResult(values, id),
    rollerName,
    rageDiceCount: 0,
    rollClientId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for roll queue condition.');
    }
    await sleep(5);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SafeDiceBoxController & RollStageCoordinator', () => {
  it('completes all 4 rolls without concurrent DiceBox overwrites during a 4-player simultaneous burst', async () => {
    let activeRolls = 0;
    let maxConcurrentRolls = 0;
    let rollCallIndex = 0;

    const mockBox: DiceBoxLike = {
      roll: vi.fn(async (groups: DiceBoxGroup[]) => {
        activeRolls += 1;
        maxConcurrentRolls = Math.max(maxConcurrentRolls, activeRolls);
        const callIdx = rollCallIndex;
        rollCallIndex += 1;
        await sleep(callIdx === 0 ? 60 : 12);
        activeRolls -= 1;
        const count = groups.reduce((acc, g) => acc + g.qty, 0);
        return callIdx === 0
          ? [{ value: 9 }, { value: 6 }, { value: 2 }].slice(0, count)
          : Array.from({ length: count }, (_, idx) => ({ value: ((idx + 6) % 10) + 1 }));
      }),
      clear: vi.fn(),
    };

    const safeBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    safeBox.setBox(mockBox, true);

    const remoteQueue: Queued3DRoll[] = [];
    const sentCommands: Array<{
      spec: LocalQueuedRollSpec;
      physicalDiceValues: number[] | undefined;
    }> = [];
    const shownBanners: Queued3DRoll[] = [];

    const coordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => remoteQueue,
      dequeueRemoteRoll: (id) => {
        const idx = remoteQueue.findIndex((item) => item.id === id);
        if (idx >= 0) remoteQueue.splice(idx, 1);
      },
      consumeRemoteRollByClientId: (clientId) => {
        const idx = remoteQueue.findIndex((item) => item.rollClientId === clientId);
        if (idx < 0) return null;
        return remoteQueue.splice(idx, 1)[0] ?? null;
      },
      onSendRollCommand: (spec, physicalDiceValues) => {
        sentCommands.push({ spec, physicalDiceValues });
        setTimeout(() => {
          remoteQueue.push(
            makeRemoteRoll(
              'seq-4-local-echo',
              spec.rollerDisplayName,
              spec.label,
              physicalDiceValues ?? [9, 6, 2],
              spec.rollClientId
            )
          );
          coordinator.notifyInboundQueueChanged();
        }, 8);
      },
      onSetBanner: (banner) => {
        if (banner) shownBanners.push(banner);
      },
      onSetHasDiceOnTable: vi.fn(),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: vi.fn(),
      timing: {
        echoWaitTimeoutMs: 500,
        holdSingleNextMs: 25,
        holdBurstNextMs: 15,
      },
    });

    // Local player throws first
    expect(coordinator.enqueueLocalRoll(makeLocalSpec('local-1', 'Local Claw Strike', 3))).toBe(true);

    // 3 remote players' server broadcasts arrive WHILE local DiceBox is still mid-throw (10ms, 20ms, 30ms)
    setTimeout(() => {
      remoteQueue.push(makeRemoteRoll('seq-1', 'Kaelen', 'Brawl', [8, 7]));
      coordinator.notifyInboundQueueChanged();
    }, 10);
    setTimeout(() => {
      remoteQueue.push(makeRemoteRoll('seq-2', 'Ash', 'Alertness', [10, 4]));
      coordinator.notifyInboundQueueChanged();
    }, 20);
    setTimeout(() => {
      remoteQueue.push(makeRemoteRoll('seq-3', 'Shadowfang', 'Initiative', [7]));
      coordinator.notifyInboundQueueChanged();
    }, 30);

    await waitForCondition(
      () =>
        shownBanners.length === 4 &&
        remoteQueue.length === 0 &&
        !coordinator.getStatus().isRolling &&
        coordinator.getStatus().localPendingCount === 0
    );

    expect(maxConcurrentRolls).toBe(1);
    expect(sentCommands).toHaveLength(1);
    expect(sentCommands[0]?.spec.rollClientId).toBe('local-1');
    expect(sentCommands[0]?.physicalDiceValues).toEqual([9, 6, 2]);
    // Local roll shown first from its echo (no double animation), followed by all 3 remote rolls in exact seq order
    expect(shownBanners.map((b) => b.id)).toEqual([
      'seq-4-local-echo',
      'seq-1',
      'seq-2',
      'seq-3',
    ]);
    expect(remoteQueue).toEqual([]);
    coordinator.dispose();
  });

  it('queues rapid consecutive local clicks in strict FIFO order and enforces cap', async () => {
    let maxConcurrentRolls = 0;
    let activeRolls = 0;

    const mockBox: DiceBoxLike = {
      roll: vi.fn(async (groups: DiceBoxGroup[]) => {
        activeRolls += 1;
        maxConcurrentRolls = Math.max(maxConcurrentRolls, activeRolls);
        await sleep(15);
        activeRolls -= 1;
        const count = groups.reduce((acc, g) => acc + g.qty, 0);
        return Array.from({ length: count }, () => ({ value: 7 }));
      }),
      clear: vi.fn(),
    };

    const safeBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    safeBox.setBox(mockBox, true);

    const remoteQueue: Queued3DRoll[] = [];
    const sentOrder: string[] = [];
    const statusHistory: RollStageStatus[] = [];

    const coordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => remoteQueue,
      dequeueRemoteRoll: (id) => {
        const idx = remoteQueue.findIndex((item) => item.id === id);
        if (idx >= 0) remoteQueue.splice(idx, 1);
      },
      consumeRemoteRollByClientId: (clientId) => {
        const idx = remoteQueue.findIndex((item) => item.rollClientId === clientId);
        if (idx < 0) return null;
        return remoteQueue.splice(idx, 1)[0] ?? null;
      },
      onSendRollCommand: (spec, physicalDiceValues) => {
        sentOrder.push(spec.rollClientId);
        remoteQueue.push(
          makeRemoteRoll(
            `echo-${spec.rollClientId}`,
            spec.rollerDisplayName,
            spec.label,
            physicalDiceValues ?? [7, 7],
            spec.rollClientId
          )
        );
        coordinator.notifyInboundQueueChanged();
      },
      onSetBanner: vi.fn(),
      onSetHasDiceOnTable: vi.fn(),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: (status) => {
        statusHistory.push(status);
      },
      timing: {
        echoWaitTimeoutMs: 300,
        holdSingleNextMs: 10,
        holdBurstNextMs: 5,
      },
    });

    expect(coordinator.enqueueLocalRoll(makeLocalSpec('local-a', 'Init', 1))).toBe(true);
    expect(coordinator.enqueueLocalRoll(makeLocalSpec('local-b', 'Attack', 4))).toBe(true);
    expect(coordinator.enqueueLocalRoll(makeLocalSpec('local-c', 'Damage', 5))).toBe(true);

    expect(coordinator.getLocalPendingCount()).toBe(3);

    await waitForCondition(
      () =>
        sentOrder.length === 3 &&
        coordinator.getLocalPendingCount() === 0 &&
        !coordinator.getStatus().isRolling
    );

    expect(maxConcurrentRolls).toBe(1);
    expect(sentOrder).toEqual(['local-a', 'local-b', 'local-c']);
    expect(statusHistory.some((s) => s.localPendingCount === 3)).toBe(true);
    expect(statusHistory[statusHistory.length - 1]?.localPendingCount).toBe(0);

    // Enqueue up to MAX_LOCAL_QUEUED_ROLLS and verify (N+1)th is rejected without throwing
    const stalledBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    stalledBox.setBox(
      {
        roll: () => new Promise(() => {}),
        clear: vi.fn(),
      },
      true
    );
    const cappedCoordinator = new RollStageCoordinator({
      diceBox: stalledBox,
      getRemoteQueue: () => [],
      dequeueRemoteRoll: vi.fn(),
      consumeRemoteRollByClientId: () => null,
      onSendRollCommand: vi.fn(),
      onSetBanner: vi.fn(),
      onSetHasDiceOnTable: vi.fn(),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: vi.fn(),
    });

    for (let i = 0; i < MAX_LOCAL_QUEUED_ROLLS; i += 1) {
      expect(cappedCoordinator.enqueueLocalRoll(makeLocalSpec(`cap-${i}`, `Roll ${i}`))).toBe(true);
    }
    expect(cappedCoordinator.enqueueLocalRoll(makeLocalSpec('cap-overflow', 'Overflow'))).toBe(
      false
    );
    cappedCoordinator.dispose();
    coordinator.dispose();
  });

  it('recovers without losing rolls when DiceBox leaves orphaned unresolved Promises, on clearFelt, timeout, or hidden tab', async () => {
    let callCount = 0;
    const clearMock = vi.fn();
    const flakyBox: DiceBoxLike = {
      roll: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          // Simulate @3d-dice/dice-box never resolving promise when cleared/overwritten
          return new Promise(() => {});
        }
        return Promise.resolve([{ value: 10 }, { value: 8 }]);
      }),
      clear: clearMock,
    };

    const safeBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    safeBox.setBox(flakyBox, true);

    const remoteQueue: Queued3DRoll[] = [];
    const sent: Array<{
      id: string;
      physicalDiceValues: number[] | undefined;
    }> = [];

    const coordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => remoteQueue,
      dequeueRemoteRoll: (id) => {
        const idx = remoteQueue.findIndex((item) => item.id === id);
        if (idx >= 0) remoteQueue.splice(idx, 1);
      },
      consumeRemoteRollByClientId: (clientId) => {
        const idx = remoteQueue.findIndex((item) => item.rollClientId === clientId);
        if (idx < 0) return null;
        return remoteQueue.splice(idx, 1)[0] ?? null;
      },
      onSendRollCommand: (spec, physicalDiceValues) => {
        sent.push({ id: spec.rollClientId, physicalDiceValues });
        remoteQueue.push(
          makeRemoteRoll(
            `echo-${spec.rollClientId}`,
            spec.rollerDisplayName,
            spec.label,
            physicalDiceValues ?? [6, 5],
            spec.rollClientId
          )
        );
        coordinator.notifyInboundQueueChanged();
      },
      onSetBanner: vi.fn(),
      onSetHasDiceOnTable: vi.fn(),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: vi.fn(),
      timing: {
        echoWaitTimeoutMs: 300,
        holdSingleNextMs: 10,
        holdBurstNextMs: 10,
      },
    });

    coordinator.enqueueLocalRoll(makeLocalSpec('orphan-1', 'Orphaned Throw', 2));
    await waitForCondition(() => callCount === 1);

    // Interrupt via clearFelt mid-throw -> orphan-1 must STILL send with CSPRNG fallback
    coordinator.clearFelt();
    coordinator.enqueueLocalRoll(makeLocalSpec('recover-2', 'Recovery Throw', 2));

    await waitForCondition(
      () => sent.length === 2 && !coordinator.getStatus().isRolling && coordinator.getLocalPendingCount() === 0
    );

    expect(clearMock).toHaveBeenCalled();
    expect(sent[0]).toEqual({ id: 'orphan-1', physicalDiceValues: undefined });
    expect(sent[1]).toEqual({ id: 'recover-2', physicalDiceValues: [10, 8] });
    coordinator.dispose();

    // Timeout resilience directly on SafeDiceBoxController
    const hangClear = vi.fn();
    const timedBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    timedBox.setBox(
      {
        roll: () => new Promise(() => {}),
        clear: hangClear,
      },
      true
    );
    const timedResult = await timedBox.throwDice([{ qty: 2, sides: 10, themeColor: '#18181b' }], {
      timeoutMs: 25,
    });
    expect(timedResult).toEqual({ settled: undefined, interrupted: true });
    expect(hangClear).toHaveBeenCalledTimes(1);

    // Background tab short-circuits immediately instead of stalling rAF
    const hiddenRollSpy = vi.fn(() => Promise.resolve([{ value: 5 }]));
    const hiddenBox = new SafeDiceBoxController({ isDocumentHidden: () => true });
    hiddenBox.setBox({ roll: hiddenRollSpy, clear: vi.fn() }, true);
    const hiddenResult = await hiddenBox.throwDice([
      { qty: 1, sides: 10, themeColor: '#18181b' },
    ]);
    expect(hiddenResult).toEqual({ settled: undefined, interrupted: true });
    expect(hiddenRollSpy).not.toHaveBeenCalled();
  });

  it('paces back-to-back banners and wakes immediately when user dismisses banner', async () => {
    const mockBox: DiceBoxLike = {
      roll: vi.fn(async () => [{ value: 8 }]),
      clear: vi.fn(),
    };
    const safeBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    safeBox.setBox(mockBox, true);

    const remoteQueue: Queued3DRoll[] = [];
    const bannerTimestamps: Array<{ id: string; at: number }> = [];

    const coordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => remoteQueue,
      dequeueRemoteRoll: (id) => {
        const idx = remoteQueue.findIndex((item) => item.id === id);
        if (idx >= 0) remoteQueue.splice(idx, 1);
      },
      consumeRemoteRollByClientId: () => null,
      onSendRollCommand: vi.fn(),
      onSetBanner: (banner) => {
        if (banner) {
          bannerTimestamps.push({ id: banner.id, at: Date.now() });
        }
      },
      onSetHasDiceOnTable: vi.fn(),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: vi.fn(),
      timing: {
        holdSingleNextMs: 120,
        holdBurstNextMs: 90,
      },
    });

    // Two remote rolls: r2 must wait ~120ms while r1 banner displays
    remoteQueue.push(makeRemoteRoll('r1', 'Alpha', 'First', [8]));
    remoteQueue.push(makeRemoteRoll('r2', 'Beta', 'Second', [7]));
    coordinator.notifyInboundQueueChanged();

    await waitForCondition(() => bannerTimestamps.length === 2);
    const naturalGapMs = bannerTimestamps[1]!.at - bannerTimestamps[0]!.at;
    expect(naturalGapMs).toBeGreaterThanOrEqual(80);

    // Click-to-dismiss skips hold immediately (< 45ms)
    bannerTimestamps.length = 0;
    remoteQueue.push(makeRemoteRoll('r3', 'Alpha', 'Third', [9]));
    remoteQueue.push(makeRemoteRoll('r4', 'Beta', 'Fourth', [6]));
    coordinator.notifyInboundQueueChanged();

    await waitForCondition(() => bannerTimestamps.length === 1);
    const dismissedAt = Date.now();
    coordinator.dismissBanner();
    await waitForCondition(() => bannerTimestamps.length === 2);
    const skipGapMs = bannerTimestamps[1]!.at - dismissedAt;
    expect(skipGapMs).toBeLessThan(50);

    coordinator.dispose();
  });
});

describe('useVttRoomStore reconnect buffering & roll deduplication', () => {
  it('buffers ROLL_TABLE_POOL while reconnecting, sends HELLO_AUTH first, flushes after SYNC_SNAPSHOT, and deduplicates DICE_ROLLED_3D', async () => {
    vi.useFakeTimers();

    class MockBrowserWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      static instances: MockBrowserWebSocket[] = [];

      readonly url: string;
      readyState = MockBrowserWebSocket.CONNECTING;
      sent: string[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        MockBrowserWebSocket.instances.push(this);
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(): void {
        this.readyState = MockBrowserWebSocket.CLOSED;
      }

      triggerOpen(): void {
        this.readyState = MockBrowserWebSocket.OPEN;
        this.onopen?.();
      }

      triggerMessage(envelope: ServerEnvelope<ServerEvent>): void {
        this.onmessage?.({ data: JSON.stringify(envelope) });
      }

      triggerClose(): void {
        this.readyState = MockBrowserWebSocket.CLOSED;
        this.onclose?.();
      }
    }

    vi.stubGlobal('WebSocket', MockBrowserWebSocket);

    const store = useVttRoomStore.getState();
    store.disconnectRoom();
    store.connectRoom({
      wsUrl: 'wss://vtt.example/ws/room/dice-room-queue-test',
      sessionJwt: 'jwt-1',
      localDiscordId: 'user-1',
      campaignId: 'dice-room-queue-test',
      characterId: null,
    });

    const ws1 = MockBrowserWebSocket.instances[0]!;
    ws1.triggerOpen();
    expect(ws1.sent).toHaveLength(1);
    expect((JSON.parse(ws1.sent[0]!) as ClientEnvelope).command.type).toBe('HELLO_AUTH');

    ws1.triggerMessage({
      seq: 1,
      serverTime: Date.now(),
      event: {
        type: 'SYNC_SNAPSHOT',
        snapshot: {
          campaignId: 'dice-room-queue-test',
          localGauntlet: 6,
          moonPhase: 'half',
          specialtyMode: 'w20_double',
          mapAssetUrl: null,
          fogStrokes: [],
          audioState: null,
          activeHandout: null,
          packTotem: null,
          safetyPaused: false,
          viewerRole: 'player',
          viewerRealm: 'physical',
          speakingDiscordIds: [],
          characters: {},
          tokens: [],
          combat: null,
          participants: [],
          rollHistory: [],
        },
      },
    });
    expect(useVttRoomStore.getState().connectionStatus).toBe('authenticated');

    // Simulate transient disconnect and player rolling during reconnect
    ws1.triggerClose();
    expect(useVttRoomStore.getState().connectionStatus).toBe('reconnecting');

    useVttRoomStore.getState().sendCommand({
      type: 'ROLL_TABLE_POOL',
      pool: 4,
      rageDiceCount: 1,
      difficulty: 6,
      hasSpecialty: false,
      spendWillpower: false,
      applyWoundPenalty: true,
      label: 'Buffered Bite',
      rollClientId: 'buffered-client-1',
    });

    // Advance 500ms backoff to open ws2
    vi.advanceTimersByTime(550);
    const ws2 = MockBrowserWebSocket.instances[1]!;
    expect(ws2).toBeDefined();

    ws2.triggerOpen();
    // On open, ONLY HELLO_AUTH goes out first (buffered roll waits for SYNC_SNAPSHOT!)
    expect(ws2.sent).toHaveLength(1);
    expect((JSON.parse(ws2.sent[0]!) as ClientEnvelope).command.type).toBe('HELLO_AUTH');

    const missedSnapshotEntry = {
      id: 'roll-5-missed',
      timestamp: Date.now(),
      rollerDiscordId: 'user-2',
      rollerName: 'Ally',
      rollerAvatarUrl: null,
      label: 'Missed While Reconnecting',
      rageDiceCount: 0,
      isSecretRoll: false,
      roll: makeRollResult([8, 7], 'seed-5'),
    };

    ws2.triggerMessage({
      seq: 5,
      serverTime: Date.now(),
      event: {
        type: 'SYNC_SNAPSHOT',
        snapshot: {
          campaignId: 'dice-room-queue-test',
          localGauntlet: 6,
          moonPhase: 'half',
          specialtyMode: 'w20_double',
          mapAssetUrl: null,
          fogStrokes: [],
          audioState: null,
          activeHandout: null,
          packTotem: null,
          safetyPaused: false,
          viewerRole: 'player',
          viewerRealm: 'physical',
          speakingDiscordIds: [],
          characters: {},
          tokens: [],
          combat: null,
          participants: [],
          rollHistory: [missedSnapshotEntry],
        },
      },
    });

    // After SYNC_SNAPSHOT authenticates ws2, buffered ROLL_TABLE_POOL flushes with fresh seq=5
    expect(ws2.sent).toHaveLength(2);
    const flushedEnv = JSON.parse(ws2.sent[1]!) as ClientEnvelope;
    expect(flushedEnv.expectedSeq).toBe(5);
    expect(flushedEnv.command).toMatchObject({
      type: 'ROLL_TABLE_POOL',
      label: 'Buffered Bite',
      rollClientId: 'buffered-client-1',
    });

    // Already-seen snapshot roll is NOT double-added to diceQueue if re-delivered
    const dupSnapshotRoll = makeRollResult([8, 7], 'seed-5');
    ws2.triggerMessage({
      seq: 5,
      serverTime: Date.now(),
      event: {
        type: 'DICE_ROLLED_3D',
        rollerDiscordId: 'user-2',
        label: 'Missed While Reconnecting',
        roll: dupSnapshotRoll,
        historyEntry: missedSnapshotEntry,
      },
    });
    expect(useVttRoomStore.getState().diceQueue).toHaveLength(0);

    // Duplicate DICE_ROLLED_3D with same historyEntry.id is deduplicated in diceQueue
    const liveEntry = {
      id: 'roll-6-live',
      timestamp: Date.now(),
      rollerDiscordId: 'user-1',
      rollerName: 'Maya',
      rollerAvatarUrl: null,
      label: 'Buffered Bite',
      rageDiceCount: 1,
      isSecretRoll: false,
      roll: makeRollResult([9, 8, 4, 2], 'seed-6'),
    };
    const dupEnvelope: ServerEnvelope<ServerEvent> = {
      seq: 6,
      serverTime: Date.now(),
      event: {
        type: 'DICE_ROLLED_3D',
        rollerDiscordId: 'user-1',
        label: 'Buffered Bite',
        roll: liveEntry.roll,
        rollClientId: 'buffered-client-1',
        historyEntry: liveEntry,
      },
    };
    ws2.triggerMessage(dupEnvelope);
    ws2.triggerMessage(dupEnvelope);

    expect(useVttRoomStore.getState().diceQueue).toHaveLength(1);
    expect(useVttRoomStore.getState().diceQueue[0]?.id).toBe('roll-6-live');

    useVttRoomStore.getState().disconnectRoom();
    vi.unstubAllGlobals();
  });

  /** Coordinator wired to an in-memory queue; `echoFor` decides what the server confirms. */
  function makeHarness(opts: {
    box: DiceBoxLike;
    echoFor: (
      spec: LocalQueuedRollSpec,
      physicalDiceValues: number[] | undefined
    ) => { values: number[]; delayMs: number };
    echoWaitTimeoutMs?: number;
  }) {
    const safeBox = new SafeDiceBoxController({ isDocumentHidden: () => false });
    safeBox.setBox(opts.box, true);
    const remoteQueue: Queued3DRoll[] = [];
    const shownBanners: Queued3DRoll[] = [];
    const hasDiceCalls: boolean[] = [];
    const unconfirmed: string[] = [];
    const coordinator: RollStageCoordinator = new RollStageCoordinator({
      diceBox: safeBox,
      getRemoteQueue: () => remoteQueue,
      dequeueRemoteRoll: (id) => {
        const idx = remoteQueue.findIndex((item) => item.id === id);
        if (idx >= 0) remoteQueue.splice(idx, 1);
      },
      consumeRemoteRollByClientId: (clientId) => {
        const idx = remoteQueue.findIndex((item) => item.rollClientId === clientId);
        if (idx < 0) return null;
        return remoteQueue.splice(idx, 1)[0] ?? null;
      },
      onSendRollCommand: (spec, physicalDiceValues) => {
        const echo = opts.echoFor(spec, physicalDiceValues);
        setTimeout(() => {
          remoteQueue.push(
            makeRemoteRoll(`echo-${spec.rollClientId}`, 'Maya', spec.label, echo.values, spec.rollClientId)
          );
          coordinator.notifyInboundQueueChanged();
        }, echo.delayMs);
      },
      onSetBanner: (banner) => {
        if (banner) shownBanners.push(banner);
      },
      onSetHasDiceOnTable: (hasDice) => hasDiceCalls.push(hasDice),
      onPlayThrowSound: vi.fn(),
      onStopThrowSound: vi.fn(),
      onPlayOutcomeSound: vi.fn(),
      onStatusChange: vi.fn(),
      onLocalRollUnconfirmed: (spec, reason) => unconfirmed.push(`${spec.rollClientId}:${reason}`),
      timing: {
        echoWaitTimeoutMs: opts.echoWaitTimeoutMs ?? 500,
        holdSingleNextMs: 10,
        holdBurstNextMs: 10,
      },
    });
    return { coordinator, remoteQueue, shownBanners, hasDiceCalls, unconfirmed };
  }

  it('gives throws time to rest and never accepts a forced mid-air reading', () => {
    // Dice routinely need 3-4 seconds to come to rest; a shorter limit wipes throws the
    // player watched land and records different numbers.
    expect(PHYSICS_SETTLE_TIMEOUT_MS).toBeGreaterThanOrEqual(6000);
    // The renderer's forced freeze must come after we have already given up.
    expect(DICE_FORCE_FREEZE_MS).toBeGreaterThan(PHYSICS_SETTLE_TIMEOUT_MS);
  });

  it('compares felt dice to the recorded roll, ignoring server-only bonus dice', () => {
    const roll = makeRollResult([9, 10, 2]);
    expect(physicalDiceMatchRoll([9, 10, 2], roll)).toBe(true);
    expect(physicalDiceMatchRoll([10, 9, 2], roll)).toBe(false);
    expect(physicalDiceMatchRoll([9, 10], roll)).toBe(false);
    expect(physicalDiceMatchRoll(undefined, roll)).toBe(false);

    const withBonus: W20RollResult = {
      ...roll,
      dice: [
        ...roll.dice,
        { value: 4, isBonusExplosionDie: true, contributedSuccesses: 0, isOne: false },
      ],
    };
    expect(physicalDiceMatchRoll([9, 10, 2], withBonus)).toBe(true);
  });

  it('keeps the dice on the felt when the ledger records exactly those faces', async () => {
    const box: DiceBoxLike = {
      roll: vi.fn(async () => [{ value: 9 }, { value: 6 }, { value: 2 }]),
      clear: vi.fn(),
    };
    const h = makeHarness({
      box,
      echoFor: (_spec, physical) => ({ values: physical ?? [1, 1, 1], delayMs: 5 }),
    });

    h.coordinator.enqueueLocalRoll(makeLocalSpec('local-match', 'Brawl', 3));
    await waitForCondition(() => h.shownBanners.length === 1);

    expect(h.shownBanners[0]?.roll.dice.map((d) => d.value)).toEqual([9, 6, 2]);
    expect(box.clear).not.toHaveBeenCalled();
    expect(h.hasDiceCalls).toEqual([true]);
    h.coordinator.dispose();
  });

  it('takes the dice off the felt when the ledger records different faces', async () => {
    const box: DiceBoxLike = {
      roll: vi.fn(async () => [{ value: 9 }, { value: 6 }, { value: 2 }]),
      clear: vi.fn(),
    };
    // The server sized the pool differently and rolled a fourth die of its own.
    const h = makeHarness({ box, echoFor: () => ({ values: [9, 6, 2, 7], delayMs: 5 }) });

    h.coordinator.enqueueLocalRoll(makeLocalSpec('local-mismatch', 'Brawl', 3));
    await waitForCondition(() => h.shownBanners.length === 1);

    expect(box.clear).toHaveBeenCalled();
    expect(h.hasDiceCalls).toEqual([true, false]);
    h.coordinator.dispose();
  });

  it('does not throw fresh random dice when our own roll is confirmed late', async () => {
    const box: DiceBoxLike = {
      roll: vi.fn(async () => [{ value: 9 }, { value: 6 }, { value: 2 }]),
      clear: vi.fn(),
    };
    const h = makeHarness({
      box,
      echoWaitTimeoutMs: 20,
      echoFor: (_spec, physical) => ({ values: physical ?? [1, 1, 1], delayMs: 80 }),
    });

    h.coordinator.enqueueLocalRoll(makeLocalSpec('local-late', 'Brawl', 3));
    await waitForCondition(() => h.shownBanners.length === 1 && h.remoteQueue.length === 0);

    expect(h.unconfirmed).toEqual(['local-late:timeout']);
    expect(h.shownBanners[0]?.id).toBe('echo-local-late');
    // Thrown once for the original roll; the late confirmation is shown without a re-throw.
    expect(box.roll).toHaveBeenCalledTimes(1);
    expect(h.hasDiceCalls.at(-1)).toBe(false);
    h.coordinator.dispose();
  });

  it("removes the replay dice of another player's roll when the recorded result appears", async () => {
    const box: DiceBoxLike = {
      // The replay lands on faces unrelated to the recorded [8, 7].
      roll: vi.fn(async () => [{ value: 1 }, { value: 2 }]),
      clear: vi.fn(),
    };
    const h = makeHarness({ box, echoFor: () => ({ values: [], delayMs: 5 }) });

    h.remoteQueue.push(makeRemoteRoll('seq-remote', 'Kaelen', 'Brawl', [8, 7]));
    h.coordinator.notifyInboundQueueChanged();
    await waitForCondition(() => h.shownBanners.length === 1 && h.remoteQueue.length === 0);

    expect(box.roll).toHaveBeenCalledTimes(1);
    expect(h.shownBanners[0]?.roll.dice.map((d) => d.value)).toEqual([8, 7]);
    expect(box.clear).toHaveBeenCalled();
    expect(h.hasDiceCalls).toEqual([false]);
    h.coordinator.dispose();
  });
});
