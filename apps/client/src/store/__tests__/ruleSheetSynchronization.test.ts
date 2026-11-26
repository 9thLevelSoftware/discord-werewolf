import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankUserCharacterSheet, type W20UserCharacterSheet } from '@w20-vtt/core';
import { useCharacterSheetStore } from '../useCharacterSheetStore';

let sessionNumber = 0;

function remoteSheet(id = 'sheet'): W20UserCharacterSheet {
  const sheet = createBlankUserCharacterSheet({
    id,
    ownerDiscordId: useCharacterSheetStore.getState().initializedUserId!,
    now: 100,
  });
  sheet.abilities.leadership = 2;
  return sheet;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sheets: [] }) })
  );
  await useCharacterSheetStore.getState().initializeForSession({
    userId: `sync-test-${++sessionNumber}`,
    username: 'Player',
    sessionJwt: 'test-jwt',
  });
  useCharacterSheetStore.setState({ sessionJwt: null });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('bound sheet synchronization', () => {
  it('loads an authorized sheet that is absent locally', () => {
    const received = remoteSheet();
    received.rank = 3;
    useCharacterSheetStore.getState().receiveRuleSheets([received]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      rank: 3,
      abilities: { leadership: 2 },
    });
  });

  it('receives ordinary edits without a receipt or effect change', () => {
    const before = remoteSheet();
    useCharacterSheetStore.getState().receiveRuleSheets([before]);
    const after = structuredClone(before);
    after.updatedAt = 200;
    after.name = 'Updated name';
    after.abilities.leadership = 4;
    useCharacterSheetStore.getState().receiveRuleSheets([after]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      name: 'Updated name',
      abilities: { leadership: 4 },
    });
  });

  it('merges remote fields and nested attributes around concurrent local edits', () => {
    const before = remoteSheet();
    useCharacterSheetStore.getState().receiveRuleSheets([before]);
    useCharacterSheetStore.getState().updateSheet(before.id, (sheet) => ({
      ...sheet,
      concept: 'Local notes',
      baseAttributes: { ...sheet.baseAttributes, strength: 4 },
    }));
    const after = structuredClone(before);
    after.updatedAt = 200;
    after.baseAttributes.dexterity = 5;
    after.abilities.leadership = 3;
    useCharacterSheetStore.getState().receiveRuleSheets([after]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      concept: 'Local notes',
      baseAttributes: { strength: 4, dexterity: 5 },
      abilities: { leadership: 3 },
    });
  });

  it('applies received rank, form and consumed equipment while retaining local inventory edits', () => {
    const before = remoteSheet();
    before.rank = 3;
    before.equipment = [
      { id: 'consumed', name: 'Talen' },
      { id: 'kept', name: 'Knife' },
    ];
    useCharacterSheetStore.getState().receiveRuleSheets([before]);
    useCharacterSheetStore.getState().updateSheet(before.id, (sheet) => ({
      ...sheet,
      equipment: [
        { id: 'consumed', name: 'Renamed talen' },
        { id: 'kept', name: 'Named knife' },
        { id: 'local', name: 'Local addition' },
      ],
    }));
    const after = structuredClone(before);
    after.updatedAt = 200;
    after.ruleActivationReceipts = ['operation-1'];
    after.rank = 2;
    after.activeForm = 'lupus';
    after.equipment = [
      { id: 'kept', name: 'Knife' },
      { id: 'remote', name: 'Remote addition' },
    ];
    useCharacterSheetStore.getState().receiveRuleSheets([after]);
    const current = useCharacterSheetStore.getState().sheetsById.sheet!;
    expect(current).toMatchObject({
      rank: 2,
      activeForm: 'lupus',
      ruleActivationReceipts: ['operation-1'],
    });
    expect(current.equipment).toEqual([
      { id: 'kept', name: 'Named knife' },
      { id: 'local', name: 'Local addition' },
      { id: 'remote', name: 'Remote addition' },
    ]);
  });

  it('rebases a conflicting save onto a committed spend without restoring the spent point', async () => {
    const before = remoteSheet();
    before.gnosis = { temporary: 1, permanent: 3 };
    useCharacterSheetStore.getState().receiveRuleSheets([before]);
    useCharacterSheetStore.setState({ sessionJwt: 'test-jwt' });
    const spent = {
      ...before, updatedAt: 1100, gnosis: { ...before.gnosis, temporary: 0 },
      ruleActivationReceipts: ['room-a:spend'],
    };
    const write = vi.fn()
      .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ sheet: spent }) })
      .mockImplementation(async (_url, request: RequestInit) => ({
        status: 200, ok: true, json: async () => JSON.parse(request.body as string),
      }));
    vi.stubGlobal('fetch', write);
    useCharacterSheetStore.getState().updateSheet(before.id, (sheet) => ({
      ...sheet, concept: 'Local note', gnosis: { ...sheet.gnosis, temporary: 2 },
    }));
    await vi.advanceTimersByTimeAsync(600);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      concept: 'Local note', gnosis: { temporary: 0 }, ruleActivationReceipts: ['room-a:spend'],
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(write.mock.calls[1]![1].body).sheet.gnosis.temporary).toBe(0);
    expect(useCharacterSheetStore.getState().saveStatus).toBe('saved');
  });

  it('preserves an edit made before the first room snapshot', () => {
    const before = remoteSheet();
    useCharacterSheetStore.setState({ sheetsById: { sheet: before } });
    useCharacterSheetStore
      .getState()
      .updateSheet(before.id, (sheet) => ({ ...sheet, concept: 'Unsaved local concept' }));
    const after = structuredClone(before);
    after.updatedAt = 200;
    after.abilities.leadership = 4;
    useCharacterSheetStore.getState().receiveRuleSheets([after]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      concept: 'Unsaved local concept',
      abilities: { leadership: 4 },
    });
  });

  it('keeps repeated and stale snapshots idempotent', () => {
    const received = remoteSheet();
    received.updatedAt = 200;
    useCharacterSheetStore.getState().receiveRuleSheets([received]);
    const current = useCharacterSheetStore.getState().sheetsById.sheet;
    useCharacterSheetStore.getState().receiveRuleSheets([structuredClone(received)]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toBe(current);
    const stale = structuredClone(received);
    stale.updatedAt = 100;
    stale.abilities.leadership = 1;
    useCharacterSheetStore.getState().receiveRuleSheets([stale]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toBe(current);
  });

  it('versions and saves a local edit after a newer server timestamp', async () => {
    const received = remoteSheet();
    received.updatedAt = 2000;
    useCharacterSheetStore.getState().receiveRuleSheets([received]);
    useCharacterSheetStore.setState({ sessionJwt: 'test-jwt' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url, options: RequestInit) => ({
        ok: true,
        json: async () => ({ sheet: JSON.parse(options.body as string).sheet }),
      }))
    );
    useCharacterSheetStore
      .getState()
      .updateSheet(received.id, (sheet) => ({ ...sheet, name: 'Local change' }));
    expect(useCharacterSheetStore.getState().sheetsById.sheet?.updatedAt).toBe(2001);
    await vi.advanceTimersByTimeAsync(600);
    expect(useCharacterSheetStore.getState().saveStatus).toBe('saved');
    expect(useCharacterSheetStore.getState().sheetsById.sheet?.name).toBe('Local change');
  });

  it('remembers separate baselines across partial updates for different sheets', () => {
    const first = remoteSheet('first');
    const second = remoteSheet('second');
    useCharacterSheetStore.getState().receiveRuleSheets([first, second]);
    useCharacterSheetStore
      .getState()
      .updateSheet(first.id, (sheet) => ({ ...sheet, concept: 'Local first' }));
    useCharacterSheetStore
      .getState()
      .receiveRuleSheets([{ ...second, name: 'Remote second', updatedAt: 200 }]);
    useCharacterSheetStore
      .getState()
      .receiveRuleSheets([{ ...first, name: 'Remote first', updatedAt: 200 }]);
    expect(useCharacterSheetStore.getState().sheetsById.first).toMatchObject({
      name: 'Remote first',
      concept: 'Local first',
    });
    expect(useCharacterSheetStore.getState().sheetsById.second?.name).toBe('Remote second');
  });

  it('clears remembered snapshots when switching users', async () => {
    const previous = remoteSheet();
    previous.updatedAt = 10000;
    previous.ruleActivationReceipts = ['old-user-operation'];
    useCharacterSheetStore.getState().receiveRuleSheets([previous]);
    window.localStorage.clear();
    await useCharacterSheetStore
      .getState()
      .initializeForSession({ userId: 'next-user', username: 'Next', sessionJwt: 'test-jwt' });
    const received = remoteSheet();
    received.updatedAt = 1;
    received.abilities.leadership = 5;
    useCharacterSheetStore.getState().receiveRuleSheets([received], [previous]);
    expect(useCharacterSheetStore.getState().sheetsById.sheet).toMatchObject({
      ownerDiscordId: 'next-user',
      abilities: { leadership: 5 },
    });
    expect(
      useCharacterSheetStore.getState().sheetsById.sheet?.ruleActivationReceipts ?? []
    ).toEqual([]);
  });

  it('retains a room update received while the initial cloud roster request is pending', async () => {
    const before = remoteSheet();
    useCharacterSheetStore.getState().receiveRuleSheets([before]);
    let resolveFetch!: (response: {
      ok: boolean;
      json: () => Promise<{ sheets: W20UserCharacterSheet[] }>;
    }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const initialization = useCharacterSheetStore.getState().initializeForSession({
      userId: useCharacterSheetStore.getState().initializedUserId!,
      username: 'Player',
      sessionJwt: 'test-jwt',
    });
    useCharacterSheetStore.getState().receiveRuleSheets([{ ...before, rank: 4, updatedAt: 200 }]);
    resolveFetch({ ok: true, json: async () => ({ sheets: [before] }) });
    await initialization;
    expect(useCharacterSheetStore.getState().sheetsById.sheet?.rank).toBe(4);
  });
});
