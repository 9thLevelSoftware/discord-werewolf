import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBlankUserCharacterSheet,
  RULE_RECEIPT_REPLAY_WINDOW,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { ClientCommand, ClientEnvelope, ServerEnvelope, ServerEvent } from '@w20-vtt/protocol';
import { discordIdToUuidV5, mintAuthTokensForIdentity } from '../discordOAuth';
import type { WorkerEnv } from '../env';
import { GameRoomDO } from '../GameRoomDO';
import { SharedActionReplies } from '../sharedActionReplies';
import type { PersistedRoomState } from '../roomProjection';
import worker from '../index';
import { UserSheetRepository } from '../userSheetStore';
import type { UserCharacterSheetRow } from '../supabaseRest';
import {
  createMockEnv,
  installMockWebSocketPairGlobal,
  MockDurableObjectState,
  MockR2Bucket,
  MockWebSocket,
} from './shims/cfTestHarness';

const OWNER = '123456789012345678';
const CONTROLLER = '234567890123456789';
const SHEET_ID = '77777777-7777-4777-8777-777777777777';
const SYNC_CODE = 'SHARED01';
type Envelope = ServerEnvelope<ServerEvent>;

class ConditionalWriteControl {
  conflicts = 0;
  loseNextResponse = false;
  observeCommit?: () => void;
  private gate: { remaining: number; promise: Promise<void>; release: () => void } | null = null;

  raceNextTwoWrites(): void {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.gate = { remaining: 2, promise, release };
  }

  async beforeWrite(): Promise<void> {
    const gate = this.gate;
    if (!gate) return;
    gate.remaining -= 1;
    if (gate.remaining === 0) {
      this.gate = null;
      gate.release();
    }
    await gate.promise;
  }

  afterCommit(): void {
    this.observeCommit?.();
    if (!this.loseNextResponse) return;
    this.loseNextResponse = false;
    throw new Error('Storage committed the write but its response was lost.');
  }
}

class ControlledR2Bucket extends MockR2Bucket {
  readonly control = new ConditionalWriteControl();

  override async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: R2PutOptions
  ): Promise<R2Object | null> {
    const conditionalSheetWrite =
      key.startsWith('private/character-sheets/sheets/') && Boolean(options?.onlyIf);
    if (conditionalSheetWrite) await this.control.beforeWrite();
    const result = await super.put(key, value, options);
    if (conditionalSheetWrite && !result) this.control.conflicts += 1;
    if (conditionalSheetWrite && result) this.control.afterCommit();
    return result;
  }
}

/** Models PostgREST row filters and atomic compare-and-swap without mocking the repository. */
class PostgrestSheetBackend {
  readonly control = new ConditionalWriteControl();
  private row: UserCharacterSheetRow | null = null;

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.pathname !== '/rest/v1/user_character_sheets')
      throw new Error(`Unexpected provider request ${method} ${url.pathname}`);
    const requestedId = url.searchParams.get('id');
    if (method === 'GET') {
      const matches = this.row && (!requestedId || requestedId === `eq.${this.row.id}`);
      return Response.json(matches ? [structuredClone(this.row)] : []);
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Partial<UserCharacterSheetRow>;
    if (method === 'POST') {
      if (this.row)
        return Response.json(
          { code: '23505', message: 'duplicate key violates user_character_sheets_pkey' },
          { status: 409 }
        );
      this.row = body as UserCharacterSheetRow;
      return Response.json([structuredClone(this.row)]);
    }
    if (method === 'PATCH') {
      const expected = url.searchParams.get('updated_at');
      if (!expected) throw new Error('A sheet mutation omitted its version precondition.');
      await this.control.beforeWrite();
      if (
        !this.row ||
        requestedId !== `eq.${this.row.id}` ||
        expected !== `eq.${this.row.updated_at}`
      ) {
        this.control.conflicts += 1;
        return Response.json([]);
      }
      this.row = { ...this.row, ...body };
      const committed = structuredClone(this.row);
      this.control.afterCommit();
      return Response.json([committed]);
    }
    throw new Error(`Unexpected provider method ${method}`);
  }
}

interface Backend {
  env: WorkerEnv;
  repository: UserSheetRepository;
  control: ConditionalWriteControl;
}

function createBackend(kind: 'r2' | 'supabase'): Backend {
  if (kind === 'r2') {
    const bucket = new ControlledR2Bucket();
    const env = createMockEnv({
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      VTT_MEDIA_BUCKET: bucket as unknown as R2Bucket,
    });
    return { env, repository: new UserSheetRepository(env), control: bucket.control };
  }
  const provider = new PostgrestSheetBackend();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => provider.fetch(input, init));
  const env = createMockEnv();
  return { env, repository: new UserSheetRepository(env), control: provider.control };
}

function sheetWithBalances(gnosis = 1, willpower = 1): W20UserCharacterSheet {
  const sheet = createBlankUserCharacterSheet({
    id: SHEET_ID,
    ownerDiscordId: OWNER,
    syncCode: SYNC_CODE,
    name: 'Shared Garou',
    now: 100,
  });
  sheet.gnosis = { permanent: 5, temporary: gnosis };
  sheet.willpower = { permanent: 5, temporary: willpower };
  sheet.otherTraits = [
    {
      id: 'charm',
      name: 'Paid strength charm',
      dots: 1,
      kind: 'other',
      customRule: {
        id: 'paid-strength-charm',
        name: 'Paid strength charm',
        source: { book: 'Test chronicle' },
        activation: { cost: { gnosis: 1 }, duration: 'scene', roll: false },
        effects: [{ target: 'attribute:strength', operation: 'add', value: 2, duration: 'scene' }],
      },
    },
  ];
  return sheet;
}

function consumableToken(
  id: string,
  ruleId: string
): NonNullable<W20UserCharacterSheet['equipment']>[number] {
  return {
    id,
    name: 'Single-use token',
    customRule: {
      id: ruleId,
      name: 'Single-use token',
      source: { book: 'Test chronicle' },
      activation: { cost: { gnosis: 1 }, consumable: true, roll: false, duration: 'scene' },
      effects: [{ target: 'attribute:strength', operation: 'add', value: 1, duration: 'scene' }],
    },
  };
}

async function tokenFor(env: WorkerEnv, discordId: string): Promise<string> {
  return (
    await mintAuthTokensForIdentity(
      {
        sub: await discordIdToUuidV5(discordId),
        discordId,
        username: discordId,
        globalName: discordId,
        avatarUrl: null,
        guildIds: [],
      },
      env.SUPABASE_JWT_SECRET
    )
  ).sessionJwt;
}

interface RoomClient {
  room: GameRoomDO;
  state: MockDurableObjectState;
  ws: MockWebSocket;
  jwt: string;
  roomId: string;
  authEvents: Envelope[];
}

async function command(client: RoomClient, body: ClientCommand, reqId: string): Promise<void> {
  const envelope: ClientEnvelope = { reqId, expectedSeq: 0, sentAt: Date.now(), command: body };
  await client.room.webSocketMessage(client.ws as unknown as WebSocket, JSON.stringify(envelope));
}

async function connect(
  env: WorkerEnv,
  roomId: string,
  discordId: string,
  previousState?: MockDurableObjectState
): Promise<RoomClient> {
  const state = previousState
    ? new MockDurableObjectState(previousState.sql.db)
    : new MockDurableObjectState();
  const room = new GameRoomDO(state as unknown as DurableObjectState, env);
  const jwt = await tokenFor(env, discordId);
  await room.fetch(
    new Request(`https://vtt.example/ws/room/${roomId}`, { headers: { Upgrade: 'websocket' } })
  );
  const client: RoomClient = {
    room,
    state,
    ws: state.acceptedSockets.at(-1)!,
    jwt,
    roomId,
    authEvents: [],
  };
  await command(
    client,
    {
      type: 'HELLO_AUTH',
      sessionJwt: jwt,
      campaignId: roomId,
      characterId: null,
      lastSeenSeq: null,
    },
    'authenticate'
  );
  client.authEvents = client.ws.drainJson<Envelope>();
  expect(client.authEvents.some(({ event }) => event.type === 'SYNC_SNAPSHOT')).toBe(true);
  return client;
}

async function settle(...clients: RoomClient[]): Promise<void> {
  for (const client of clients) {
    for (let index = 0; index < client.state.waitUntilPromises.length; index += 1)
      await client.state.waitUntilPromises[index];
  }
}

async function bind(
  client: RoomClient,
  sheet: W20UserCharacterSheet,
  reqId = 'bind'
): Promise<Envelope[]> {
  await command(
    client,
    { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet, syncCode: SYNC_CODE },
    reqId
  );
  await settle(client);
  const events = client.ws.drainJson<Envelope>();
  expect(events.some(({ event }) => event.type === 'COMMAND_REJECTED')).toBe(false);
  return events;
}

async function twoRooms(
  backend: Backend,
  sheet: W20UserCharacterSheet,
  secondDiscordId = CONTROLLER
) {
  await backend.repository.create(sheet);
  const first = await connect(backend.env, 'dice-room-shared-a', OWNER);
  const second = await connect(backend.env, 'dice-room-shared-b', secondDiscordId);
  await bind(first, structuredClone(sheet));
  await bind(second, structuredClone(sheet));
  return [first, second] as const;
}

const activate: ClientCommand = {
  type: 'ACTIVATE_RULE',
  seatId: 'primary',
  sourceEntryId: 'charm',
  ruleId: 'paid-strength-charm',
  targetIds: [],
};
function paidRoll(rollClientId: string): Extract<ClientCommand, { type: 'ROLL_TABLE_POOL' }> {
  return {
    type: 'ROLL_TABLE_POOL',
    sheetId: SHEET_ID,
    seatId: 'primary',
    rollClientId,
    pool: 1,
    difficulty: 6,
    rageDiceCount: 0,
    hasSpecialty: false,
    spendWillpower: true,
    applyWoundPenalty: false,
    isSecretRoll: false,
    physicalDiceValues: [8],
    shortcut: {
      id: 'roll',
      name: 'Paid roll',
      source: { kind: 'static', pool: 1 },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    },
  };
}

const activations = (events: Envelope[]) =>
  events.flatMap(({ event }) => (event.type === 'RULE_ACTIVATION_RESOLVED' ? [event] : []));
const rolls = (events: Envelope[]) =>
  events.flatMap(({ event }) => (event.type === 'DICE_ROLLED_3D' ? [event] : []));
const rejected = (events: Envelope[]) =>
  events.some(({ event }) => event.type === 'COMMAND_REJECTED');
const views = (events: Envelope[]) =>
  events.flatMap(({ event }) =>
    event.type === 'RULE_STATE_UPDATED'
      ? [event.state]
      : event.type === 'SYNC_SNAPSHOT' && event.snapshot.ruleState
        ? [event.snapshot.ruleState]
        : []
  );

beforeEach(() => {
  installMockWebSocketPairGlobal();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['r2', 'supabase'] as const)('shared-sheet transactions through %s', (kind) => {
  it('authorizes only one activation racing for the last Gnosis and publishes no losing benefit', async () => {
    const backend = createBackend(kind);
    const clients = await twoRooms(backend, sheetWithBalances());
    backend.control.raceNextTwoWrites();
    await Promise.all(
      clients.map((client, index) => command(client, activate, `activation-${index}`))
    );
    await settle(...clients);
    const events = clients.map((client) => client.ws.drainJson<Envelope>());
    expect(events.map(activations).flat()).toHaveLength(1);
    expect(events.filter(rejected)).toHaveLength(1);
    const losingIndex = events.findIndex(rejected);
    expect(
      views(events[losingIndex]!)
        .flatMap((view) => view.effects)
        .some((effect) => effect.instance.id.includes(`activation-${losingIndex}`))
    ).toBe(false);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(0);
    expect(stored?.activeRuleEffects).toHaveLength(1);
    expect(stored?.activeRuleEffects?.[0]?.id).not.toContain(`activation-${losingIndex}`);
    expect(backend.control.conflicts).toBeGreaterThan(0);
  });

  it('authorizes only one ordinary roll racing for the last Willpower', async () => {
    const backend = createBackend(kind);
    const clients = await twoRooms(backend, sheetWithBalances());
    backend.control.raceNextTwoWrites();
    await Promise.all(
      clients.map((client, index) =>
        command(client, paidRoll(`roll-${index}`), `paid-roll-${index}`)
      )
    );
    await settle(...clients);
    const events = clients.map((client) => client.ws.drainJson<Envelope>());
    expect(events.map(rolls).flat()).toHaveLength(1);
    expect(events.filter(rejected)).toHaveLength(1);
    const losingIndex = events.findIndex(rejected);
    expect(rolls(events[losingIndex]!)).toHaveLength(0);
    expect((await backend.repository.getById(SHEET_ID))?.willpower.temporary).toBe(0);
    expect(backend.control.conflicts).toBeGreaterThan(0);
    const loser = clients[losingIndex]!;
    const restartedLoser = await connect(
      backend.env,
      loser.roomId,
      losingIndex === 0 ? OWNER : CONTROLLER,
      loser.state
    );
    const history = restartedLoser.authEvents.flatMap(({ event }) =>
      event.type === 'SYNC_SNAPSHOT' ? (event.snapshot.rollHistory ?? []) : []
    );
    expect(history).toHaveLength(0);
  });

  it('does not reuse one debit to grant two outcomes for the same actor and request ID in different rooms', async () => {
    const backend = createBackend(kind);
    const clients = await twoRooms(backend, sheetWithBalances(), OWNER);
    backend.control.raceNextTwoWrites();
    await Promise.all(clients.map((client) => command(client, activate, 'same-request')));
    await settle(...clients);
    const events = clients.map((client) => client.ws.drainJson<Envelope>());
    expect(events.map(activations).flat()).toHaveLength(1);
    expect(events.filter(rejected)).toHaveLength(1);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(0);
    expect(stored?.activeRuleEffects).toHaveLength(1);
  });

  it('allows legitimate sequential spending from independently bound rooms', async () => {
    const backend = createBackend(kind);
    const [first, second] = await twoRooms(backend, sheetWithBalances(2, 2));
    await command(first, activate, 'first-legitimate-spend');
    await settle(first);
    expect(activations(first.ws.drainJson<Envelope>())).toHaveLength(1);
    await command(second, activate, 'second-legitimate-spend');
    await settle(second);
    expect(activations(second.ws.drainJson<Envelope>())).toHaveLength(1);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(0);
    expect(stored?.willpower.temporary).toBe(2);
  });

  it('consumes one shared item once while both rooms otherwise have enough Gnosis', async () => {
    const backend = createBackend(kind);
    const sheet = sheetWithBalances(2, 1);
    sheet.equipment = [consumableToken('shared-token', 'shared-token-rule')];
    const clients = await twoRooms(backend, sheet);
    const useToken: ClientCommand = {
      type: 'ACTIVATE_RULE',
      seatId: 'primary',
      sourceEntryId: 'shared-token',
      ruleId: 'shared-token-rule',
      targetIds: [],
    };
    backend.control.raceNextTwoWrites();
    await Promise.all(
      clients.map((client, index) => command(client, useToken, `use-token-${index}`))
    );
    await settle(...clients);
    const events = clients.map((client) => client.ws.drainJson<Envelope>());
    expect(events.map(activations).flat()).toHaveLength(1);
    expect(events.filter(rejected)).toHaveLength(1);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(1);
    expect(stored?.equipment).toEqual([]);
    expect(stored?.ruleActivationReceipts).toContain('consumed:shared-token');
    expect(stored?.activeRuleEffects).toHaveLength(1);
  });

  it('authorizes one permanent Gnosis expenditure when only one dot remains', async () => {
    const backend = createBackend(kind);
    const sheet = sheetWithBalances();
    sheet.gnosis = { permanent: 1, temporary: 1 };
    const rule = sheet.otherTraits[0]!.customRule!;
    rule.activation = {
      permanentCost: { choiceKey: 'permanentSpent', resource: 'gnosis' },
      duration: 'scene',
      roll: false,
    };
    rule.choiceFields = [
      { key: 'permanentSpent', label: 'Permanent Gnosis spent', kind: 'number', min: 1, max: 1 },
    ];
    const clients = await twoRooms(backend, sheet);
    backend.control.raceNextTwoWrites();
    await Promise.all(
      clients.map((client, index) =>
        command(
          client,
          { ...activate, ruleChoices: { permanentSpent: 1 } },
          `permanent-spend-${index}`
        )
      )
    );
    await settle(...clients);
    const events = clients.map((client) => client.ws.drainJson<Envelope>());
    expect(events.map(activations).flat()).toHaveLength(1);
    expect(events.filter(rejected)).toHaveLength(1);
    expect((await backend.repository.getById(SHEET_ID))?.gnosis).toEqual({
      permanent: 0,
      temporary: 0,
    });
  });

  it('recovers a committed activation after a lost storage response and restart without charging twice', async () => {
    const backend = createBackend(kind);
    const [first] = await twoRooms(backend, sheetWithBalances());
    backend.control.loseNextResponse = true;
    await command(first, activate, 'lost-response');
    await settle(first);
    first.ws.drainJson(); // The client receives no usable acknowledgment before reconnecting.
    expect((await backend.repository.getById(SHEET_ID))?.gnosis.temporary).toBe(0);
    const restarted = await connect(backend.env, first.roomId, OWNER, first.state);
    restarted.ws.drainJson();
    await command(restarted, activate, 'lost-response');
    await settle(restarted);
    const events = restarted.ws.drainJson<Envelope>();
    expect(activations(events)).toHaveLength(1);
    expect(rejected(events)).toBe(false);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(0);
    expect(stored?.activeRuleEffects).toHaveLength(1);
  });

  it('retains the same paid roll result after a missing acknowledgment and restart', async () => {
    const backend = createBackend(kind);
    const [first] = await twoRooms(backend, sheetWithBalances());
    const intent = paidRoll('stable-roll-intent');
    await command(first, intent, 'stable-roll-request');
    await settle(first);
    const initial = rolls(first.ws.drainJson<Envelope>());
    expect(initial).toHaveLength(1);
    const restarted = await connect(backend.env, first.roomId, OWNER, first.state);
    restarted.ws.drainJson();
    await command(restarted, intent, 'stable-roll-request');
    await settle(restarted);
    const replayed = rolls(restarted.ws.drainJson<Envelope>());
    expect(replayed).toHaveLength(1);
    expect(replayed[0]?.roll).toEqual(initial[0]?.roll);
    expect((await backend.repository.getById(SHEET_ID))?.willpower.temporary).toBe(0);
  });

  it('recovers after the global debit commits but the room publication transaction rolls back', async () => {
    const backend = createBackend(kind);
    const [first] = await twoRooms(backend, sheetWithBalances());
    const storage = first.state.storage;
    const transaction = storage.transactionSync.bind(storage);
    let publicationAttempts = 0;
    let globalCommitted = false;
    backend.control.observeCommit = () => {
      globalCommitted = true;
    };
    const crash = vi.spyOn(storage, 'transactionSync').mockImplementation((callback) =>
      transaction(() => {
        const result = callback();
        if (globalCommitted) {
          publicationAttempts += 1;
          throw new Error('Simulated crash before room publication commit');
        }
        return result;
      })
    );
    await command(first, activate, 'publication-crash').catch((error: unknown) => {
      expect(String(error)).toContain('Simulated crash');
    });
    expect(publicationAttempts).toBeGreaterThan(0);
    expect(activations(first.ws.drainJson<Envelope>())).toHaveLength(0);
    expect((await backend.repository.getById(SHEET_ID))?.gnosis.temporary).toBe(0);
    crash.mockRestore();
    const restarted = await connect(backend.env, first.roomId, OWNER, first.state);
    restarted.ws.drainJson();
    await command(restarted, activate, 'publication-crash');
    await settle(restarted);
    expect(activations(restarted.ws.drainJson<Envelope>())).toHaveLength(1);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(0);
    expect(stored?.activeRuleEffects).toHaveLength(1);
  });

  it('prevents stale bind and HTTP editor updates from restoring spent resources or a consumed item', async () => {
    const backend = createBackend(kind);
    const original = sheetWithBalances(1, 1);
    original.equipment = [consumableToken('one-use-token', 'one-use-rule')];
    const [first, second] = await twoRooms(backend, original);
    await command(
      first,
      {
        type: 'ACTIVATE_RULE',
        seatId: 'primary',
        sourceEntryId: 'one-use-token',
        ruleId: 'one-use-rule',
        targetIds: [],
      },
      'consume-token'
    );
    await command(first, paidRoll('spend-willpower'), 'spend-willpower');
    await settle(first);
    const stale = {
      ...structuredClone(original),
      updatedAt: Date.now() + 10000,
      concept: 'An unrelated editor update',
    };
    const rebound = await bind(second, stale, 'stale-bind');
    expect(
      views(rebound)
        .at(-1)
        ?.sheets.find((sheet) => sheet.id === SHEET_ID)
    ).toMatchObject({ gnosis: { temporary: 0 }, willpower: { temporary: 0 }, equipment: [] });
    const response = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${SHEET_ID}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${first.jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: stale }),
      }),
      backend.env,
      { waitUntil() {} } as unknown as ExecutionContext
    );
    expect(response.status).toBe(200);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored).toMatchObject({
      concept: 'An unrelated editor update',
      gnosis: { temporary: 0 },
      willpower: { temporary: 0 },
      equipment: [],
    });
  });

  it('rejects a paid command after the bound controller’s sync code is revoked', async () => {
    const backend = createBackend(kind);
    const [owner, controller] = await twoRooms(backend, sheetWithBalances());
    const response = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${SHEET_ID}/sync-code`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner.jwt}` },
      }),
      backend.env,
      { waitUntil() {} } as unknown as ExecutionContext
    );
    expect(response.status).toBe(200);
    expect((await backend.repository.getById(SHEET_ID))?.syncCode).toBeNull();
    await command(controller, activate, 'revoked-controller-activation');
    await settle(controller);
    const events = controller.ws.drainJson<Envelope>();
    expect(rejected(events)).toBe(true);
    expect(activations(events)).toHaveLength(0);
    expect(rolls(events)).toHaveLength(0);
    expect(views(events).every((view) => view.effects.length === 0)).toBe(true);
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.gnosis.temporary).toBe(1);
    expect(stored?.activeRuleEffects ?? []).toEqual([]);
  });

  it('requires gross Willpower before applying a Self-Confident refund', async () => {
    const backend = createBackend(kind);
    const sheet = sheetWithBalances(1, 0);
    sheet.otherTraits.push({
      id: 'merit-self-confident',
      name: 'Self-Confident',
      dots: 5,
      kind: 'merit',
    });
    const [first] = await twoRooms(backend, sheet);
    await command(first, paidRoll('unfunded-refund'), 'unfunded-refund');
    const events = first.ws.drainJson<Envelope>();
    expect(rejected(events)).toBe(true);
    expect(rolls(events)).toHaveLength(0);
    expect((await backend.repository.getById(SHEET_ID))?.willpower.temporary).toBe(0);
  });

  it('persists a funded Willpower spend and earned refund with their net balance', async () => {
    const backend = createBackend(kind);
    const sheet = sheetWithBalances();
    sheet.otherTraits.push({
      id: 'merit-self-confident',
      name: 'Self-Confident',
      dots: 5,
      kind: 'merit',
    });
    const [first] = await twoRooms(backend, sheet);
    await command(first, paidRoll('funded-refund'), 'funded-refund');
    await settle(first);
    const results = rolls(first.ws.drainJson<Envelope>());
    expect(results).toHaveLength(1);
    expect(results[0]?.roll.netSuccesses).toBe(2);
    expect((await backend.repository.getById(SHEET_ID))?.willpower.temporary).toBe(1);
  });

  it('keeps the receipt ledger bounded across many paid rolls from two rooms', async () => {
    const backend = createBackend(kind);
    const paidRolls = RULE_RECEIPT_REPLAY_WINDOW + 40;
    const sheet = sheetWithBalances();
    // Each successful roll refunds the point it spent, so the sheet can keep paying.
    sheet.otherTraits.push({
      id: 'merit-self-confident',
      name: 'Self-Confident',
      dots: 5,
      kind: 'merit',
    });
    const clients = await twoRooms(backend, sheet);
    let largestLedger = 0;
    for (let index = 0; index < paidRolls; index += 1) {
      const client = clients[index % 2]!;
      await command(client, paidRoll(`bounded-${index}`), `bounded-${index}`);
      await settle(client);
      const events = client.ws.drainJson<Envelope>();
      expect(rejected(events)).toBe(false);
      expect(rolls(events)).toHaveLength(1);
      const stored = await backend.repository.getById(SHEET_ID);
      largestLedger = Math.max(largestLedger, stored?.ruleActivationReceipts?.length ?? 0);
    }
    const stored = await backend.repository.getById(SHEET_ID);
    expect(stored?.willpower.temporary).toBe(1);
    // The replay window plus the single compaction watermark.
    expect(largestLedger).toBe(RULE_RECEIPT_REPLAY_WINDOW + 1);
    expect(stored?.ruleActivationReceipts).toHaveLength(RULE_RECEIPT_REPLAY_WINDOW + 1);
    // The latest debit is still guarded against a replay.
    const replay = await backend.repository.authorizeRuleSpend({
      sheetId: SHEET_ID,
      operationId: stored!.ruleActivationReceipts!.at(-1)!,
      costs: { willpower: 1 },
    });
    expect(replay.alreadyCommitted).toBe(true);
    expect(replay.sheet.willpower.temporary).toBe(1);
    // The room that did not make the last roll holds receipts the ledger has since dropped;
    // binding there must still adopt the stored sheet instead of its own older copy.
    const rebound = views(await bind(clients[0]!, structuredClone(stored!), 'rebind'));
    expect(rebound.at(-1)?.sheets.find((item) => item.id === SHEET_ID)?.ruleActivationReceipts)
      .toEqual(stored?.ruleActivationReceipts);
  });
});

describe('Supabase remains authoritative on ordinary provider errors', () => {
  it('does not create a second R2 ledger after a duplicate-key response naming the sheet table', async () => {
    const backend = createBackend('supabase');
    const sheet = sheetWithBalances();
    await backend.repository.create(sheet);
    await expect(
      backend.repository.create({ ...sheet, gnosis: { permanent: 5, temporary: 5 } })
    ).rejects.toThrow();
    expect((await backend.repository.getById(SHEET_ID))?.gnosis.temporary).toBe(1);
    expect(
      await backend.env.VTT_MEDIA_BUCKET!.get(`private/character-sheets/sheets/${SHEET_ID}.json`)
    ).toBeNull();
  });

  it.each([404, 503])(
    'does not switch to R2 after an ordinary HTTP %s mentioning the sheet table',
    async (status) => {
      const backend = createBackend('supabase');
      await backend.repository.create(sheetWithBalances());
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        Response.json(
          {
            code: status === 404 ? 'NOT_FOUND' : 'SERVICE_UNAVAILABLE',
            message: 'user_character_sheets request unavailable',
          },
          { status }
        )
      );
      await expect(backend.repository.getById(SHEET_ID)).rejects.toThrow();
      expect(
        await backend.env.VTT_MEDIA_BUCKET!.get(`private/character-sheets/sheets/${SHEET_ID}.json`)
      ).toBeNull();
    }
  );
});

describe('shared reply retention', () => {
  it('replays a retained roll and refuses expired ordinary and paid rolls after restart', async () => {
    const backend = createBackend('r2');
    const sheet = sheetWithBalances(1, 2);
    await backend.repository.create(sheet);
    const player = await connect(backend.env, 'dice-room-reply-retention', OWNER);
    await bind(player, sheet);

    const ordinary = { ...paidRoll('ordinary'), spendWillpower: false };
    const paid = paidRoll('paid');
    const recent = { ...paidRoll('recent'), spendWillpower: false };
    await command(player, ordinary, 'ordinary');
    await command(player, paid, 'paid');
    await command(player, recent, 'recent');
    await settle(player);
    const originals = rolls(player.ws.drainJson<Envelope>());
    expect(originals).toHaveLength(3);

    // Age the commands using the real SQLite reply store without broadcasting 999 filler rolls.
    const replies = new SharedActionReplies(player.state.storage);
    for (let i = 0; i < 999; i++) replies.put(`filler-${i}`, { fingerprint: 'filler' });
    const [row] = player.state.sql
      .exec<{ count: number }>('SELECT COUNT(*) AS count FROM shared_action_replies')
      .toArray();
    expect(row?.count).toBe(1000);

    const restarted = await connect(backend.env, player.roomId, OWNER, player.state);
    await command(restarted, recent, 'retry-recent');
    expect(rolls(restarted.ws.drainJson<Envelope>())).toEqual([originals[2]]);

    for (const retry of [ordinary, paid, { ...paid, difficulty: 7 }]) {
      await command(restarted, retry, `retry-${retry.rollClientId}`);
      const events = restarted.ws.drainJson<Envelope>();
      expect(rolls(events)).toEqual([]);
      expect(events.map(({ event }) => event)).toContainEqual(
        expect.objectContaining({ type: 'COMMAND_REJECTED', message: expect.stringContaining('expired') })
      );
    }
    expect((await backend.repository.getById(SHEET_ID))?.willpower.temporary).toBe(1);
  });

  it('retains the IDs of pruned legacy replies', () => {
    const state = new MockDurableObjectState();
    state.sql.exec(`
      CREATE TABLE shared_action_replies (action_key TEXT PRIMARY KEY, record_json TEXT NOT NULL);
      WITH RECURSIVE sequence(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM sequence WHERE n < 1001
      )
      INSERT INTO shared_action_replies SELECT 'legacy-' || n, '{"fingerprint":"legacy"}' FROM sequence;
    `);
    const replies = new SharedActionReplies(state.storage);
    expect(replies.get('legacy-1')).toBe('expired');
    expect(replies.get('legacy-2')).toEqual({ fingerprint: 'legacy' });
    replies.put('legacy-1', { fingerprint: 'replacement' });
    expect(replies.get('legacy-1')).toBe('expired');
  });
});

describe('several players at one table', () => {
  const GUEST = '345678901234567890';
  const LOCAL_ID = '88888888-8888-4888-8888-888888888888';
  const GUEST_ID = '99999999-9999-4999-8999-999999999999';

  async function join(env: WorkerEnv, host: RoomClient, discordId: string): Promise<RoomClient> {
    const jwt = await tokenFor(env, discordId);
    await host.room.fetch(
      new Request(`https://vtt.example/ws/room/${host.roomId}`, {
        headers: { Upgrade: 'websocket' },
      })
    );
    const client: RoomClient = {
      ...host,
      ws: host.state.acceptedSockets.at(-1)!,
      jwt,
      authEvents: [],
    };
    await command(
      client,
      {
        type: 'HELLO_AUTH',
        sessionJwt: jwt,
        campaignId: host.roomId,
        characterId: null,
        lastSeenSeq: null,
      },
      'authenticate'
    );
    client.authEvents = client.ws.drainJson<Envelope>();
    return client;
  }

  function localSheet(ownerDiscordId: string, name: string): W20UserCharacterSheet {
    return createBlankUserCharacterSheet({ id: LOCAL_ID, ownerDiscordId, name, now: 100 });
  }

  it('refuses to replace another player’s bound local sheet', async () => {
    const backend = createBackend('r2');
    const owner = await connect(backend.env, 'dice-room-local-bind', OWNER);
    await bind(owner, localSheet(OWNER, 'Unsaved Garou'));
    const intruder = await join(backend.env, owner, CONTROLLER);
    owner.ws.drainJson<Envelope>();

    await command(
      intruder,
      { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet: localSheet(CONTROLLER, 'Impostor') },
      'steal'
    );
    await settle(owner);

    expect(rejected(intruder.ws.drainJson<Envelope>())).toBe(true);
    await command(owner, { type: 'ADVANCE_RULE_CLOCK', unit: 'turn', amount: 1 }, 'tick');
    const sheets = views(owner.ws.drainJson<Envelope>()).at(-1)?.sheets ?? [];
    expect(sheets.find((sheet) => sheet.id === LOCAL_ID)?.name).toBe('Unsaved Garou');
  });

  it('keeps saving other characters after an update for an unsaved sheet cannot be stored', async () => {
    const backend = createBackend('r2');
    const caster = sheetWithBalances(2);
    caster.otherTraits[0]!.customRule!.effects = [
      {
        target: 'attribute:strength',
        operation: 'add',
        value: 2,
        duration: 'scene',
        recipient: 'target',
      },
    ];
    const guest = createBlankUserCharacterSheet({
      id: GUEST_ID,
      ownerDiscordId: GUEST,
      name: 'Saved Packmate',
      now: 100,
    });
    await backend.repository.create(caster);
    await backend.repository.create(guest);

    const owner = await connect(backend.env, 'dice-room-outbox', OWNER);
    await bind(owner, structuredClone(caster));
    const unsaved = await join(backend.env, owner, CONTROLLER);
    await bind(unsaved, localSheet(CONTROLLER, 'Unsaved Garou'));
    const saved = await join(backend.env, owner, GUEST);
    await bind(saved, structuredClone(guest));

    await command(owner, { ...activate, targetIds: [LOCAL_ID, GUEST_ID] }, 'bless-both');
    await settle(owner);

    expect(activations(owner.ws.drainJson<Envelope>())).toHaveLength(1);
    expect((await backend.repository.getById(GUEST_ID))?.activeRuleEffects).toHaveLength(1);
  });

  it('keeps dependent updates queued when a previously saved recipient goes missing', async () => {
    const backend = createBackend('r2');
    const caster = sheetWithBalances(2);
    caster.otherTraits[0]!.customRule!.effects = [
      {
        target: 'attribute:strength',
        operation: 'add',
        value: 2,
        duration: 'scene',
        recipient: 'target',
      },
    ];
    const guest = createBlankUserCharacterSheet({
      id: GUEST_ID,
      ownerDiscordId: GUEST,
      name: 'Deleted Packmate',
      now: 100,
    });
    await backend.repository.create(caster);
    await backend.repository.create(guest);

    const owner = await connect(backend.env, 'dice-room-outbox-conflict', OWNER);
    await bind(owner, caster);
    const saved = await join(backend.env, owner, GUEST);
    await bind(saved, guest);

    await backend.repository.delete(GUEST_ID);
    await command(owner, { ...activate, targetIds: [GUEST_ID] }, 'bless-deleted');
    await settle(owner);
    expect(activations(owner.ws.drainJson<Envelope>())).toHaveLength(1);

    await command(owner, { type: 'ADVANCE_RULE_CLOCK', unit: 'scene', amount: 1 }, 'next-scene');
    await settle(owner);

    const [record] = owner.state.sql
      .exec<{ state_json: string }>('SELECT state_json FROM room_state WHERE id = 1')
      .toArray();
    const room = JSON.parse(record!.state_json) as PersistedRoomState;
    const updates = room.ruleState?.persistenceQueue.filter(({ sheetId }) => sheetId === GUEST_ID);
    expect(updates).toHaveLength(2);
    const effectId = updates?.[0]?.effects[0]?.id;
    expect(effectId).toBeTruthy();
    expect(updates?.[1]?.removedEffectIds).toContain(effectId);
    expect(await backend.repository.getById(GUEST_ID)).toBeNull();
  });
});
