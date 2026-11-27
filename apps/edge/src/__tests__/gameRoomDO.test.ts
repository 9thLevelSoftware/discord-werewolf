import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientCommand, ClientEnvelope, ServerEnvelope, ServerEvent } from '@w20-vtt/protocol';
import { discordIdToUuidV5, mintAuthTokensForIdentity } from '../discordOAuth';
import { GameRoomDO } from '../GameRoomDO';
import { FAIR_FORTUNE_RULE_ID } from '../ruleRerolls';
import { createBlankUserCharacterSheet, type W20UserCharacterSheet } from '@w20-vtt/core';
import { UserSheetRepository } from '../userSheetStore';
import {
  createMockEnv,
  installMockWebSocketPairGlobal,
  MockDurableObjectState,
  MockWebSocket,
} from './shims/cfTestHarness';

const CAMPAIGN_ID = '00000000-0000-4000-8000-000000000001';
const GUILD_ID = 'guild-sept-of-stone';
const ST_DISCORD_ID = 'st-discord-1';
const PLAYER1_DISCORD_ID = 'player-discord-1';
const PLAYER2_DISCORD_ID = 'player-discord-2';
const PC1_ID = '11111111-1111-4111-8111-111111111111';
const PC2_ID = '22222222-2222-4222-8222-222222222222';
const DB_NPC_ID = '99999999-9999-4999-8999-999999999999';

function makeCharacterDbRow(overrides: Record<string, unknown>) {
  return {
    id: PC1_ID,
    campaign_id: CAMPAIGN_ID,
    pack_id: null,
    owner_discord_id: PLAYER1_DISCORD_ID,
    is_npc: false,
    name: 'Kaelen Redfang',
    deed_name: 'Steps-Through-Glass',
    concept: 'Shadow Lord Ahroun',
    breed: 'homid',
    auspice: 'ahroun',
    tribe: 'Shadow Lords',
    rank: 1,
    metis_deformity: null,
    active_form: 'homid',
    active_realm: 'physical',
    caught_in_gauntlet: false,
    in_frenzy: false,
    frenzy_type: null,
    attr_strength: 3,
    attr_dexterity: 4,
    attr_stamina: 3,
    attr_charisma: 2,
    attr_manipulation: 3,
    attr_appearance: 2,
    attr_perception: 3,
    attr_intelligence: 2,
    attr_wits: 3,
    rage_perm: 5,
    rage_temp: 5,
    gnosis_perm: 4,
    gnosis_temp: 4,
    silver_carried_items: 0,
    willpower_perm: 6,
    willpower_temp: 6,
    renown_glory_perm: 2,
    renown_glory_temp: 0,
    renown_honor_perm: 1,
    renown_honor_temp: 0,
    renown_wisdom_perm: 0,
    renown_wisdom_temp: 0,
    bonus_bruised_boxes: 0,
    health_boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
    abilities: { alertness: 3, athletics: 2, brawl: 4, dodge: 3, primal_urge: 3 },
    specialties: [{ id: 'spec-1', traitKey: 'brawl', name: 'Claws' }],
    backgrounds: { totem: 3 },
    merits_flaws: [],
    portraits_by_form: { homid: '/r2-assets/portraits/kaelen-homid.png', crinos: '/r2-assets/portraits/kaelen-crinos.png' },
    active_buffs: [],
    macros: [],
    state_version: 1,
    character_fetishes: [],
    ...overrides,
  };
}

function mockSupabaseForRoom(characterOverrides: Record<string, unknown> = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes(`/rest/v1/campaigns?id=eq.${CAMPAIGN_ID}`)) {
      return new Response(
        JSON.stringify([
          {
            id: CAMPAIGN_ID,
            discord_guild_id: GUILD_ID,
            discord_voice_channel_id: null,
            dice_log_webhook_url: null,
            storyteller_discord_id: ST_DISCORD_ID,
            name: 'Rage Over Manhattan',
            current_moon_phase: 'full',
            local_gauntlet: 6,
            specialty_mode: 'w20_double',
            map_asset_url: '/r2-assets/maps/manhattan.webp',
          },
        ]),
        { status: 200 },
      );
    }
    if (url.includes(`/rest/v1/packs?campaign_id=eq.${CAMPAIGN_ID}`)) {
      return new Response(
        JSON.stringify([
          {
            id: 'pack-1',
            campaign_id: CAMPAIGN_ID,
            name: 'Iron Fang Pack',
            totem_name: 'Grandfather Thunder',
            pack_willpower_max: 5,
            pack_willpower_temp: 5,
            totem_modifiers: {},
            caern_name: 'Sept of the Broken Blade',
            caern_level: 3,
          },
        ]),
        { status: 200 },
      );
    }
    if (url.includes(`/rest/v1/characters?campaign_id=eq.${CAMPAIGN_ID}`)) {
      return new Response(
        JSON.stringify([
          makeCharacterDbRow({ id: PC1_ID, owner_discord_id: PLAYER1_DISCORD_ID, ...characterOverrides }),
          makeCharacterDbRow({
            id: PC2_ID,
            owner_discord_id: PLAYER2_DISCORD_ID,
            name: 'Whisper-in-Ashes',
            deed_name: 'Whisper-in-Ashes',
            auspice: 'theurge',
            tribe: 'Silent Striders',
            attr_dexterity: 2,
            attr_wits: 2,
          }),
          makeCharacterDbRow({
            id: DB_NPC_ID,
            owner_discord_id: ST_DISCORD_ID,
            is_npc: true,
            name: 'Hidden Spy Dancer',
            deed_name: 'Secret Wyrm Infiltrator',
            tribe: 'Black Spiral Dancers',
          }),
        ]),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  });
}

async function mintJwtForUser(
  discordId: string,
  username: string,
  guildIds: string[],
  secret: string,
): Promise<string> {
  const sub = await discordIdToUuidV5(discordId);
  const { sessionJwt } = await mintAuthTokensForIdentity(
    {
      sub,
      discordId,
      username,
      globalName: username,
      avatarUrl: null,
      guildIds,
    },
    secret,
  );
  return sessionJwt;
}

async function openAndAuthSocket(
  room: GameRoomDO,
  state: MockDurableObjectState,
  sessionJwt: string,
  characterId: string | null,
  lastSeenSeq: number | null = null,
): Promise<{ ws: MockWebSocket; events: ServerEnvelope<ServerEvent>[] }> {
  const res = await room.fetch(
    new Request(`https://vtt.example/ws/room/${CAMPAIGN_ID}`, {
      headers: { Upgrade: 'websocket' },
    }),
  );
  expect(res.status).toBe(101);
  const ws = state.acceptedSockets[state.acceptedSockets.length - 1]!;
  await sendCommand(room, ws, 0, {
    type: 'HELLO_AUTH',
    sessionJwt,
    campaignId: CAMPAIGN_ID,
    characterId,
    lastSeenSeq,
  });
  return { ws, events: ws.drainJson<ServerEnvelope<ServerEvent>>() };
}

async function sendCommand(
  room: GameRoomDO,
  ws: MockWebSocket,
  expectedSeq: number,
  command: ClientCommand,
  reqId = `req-${crypto.randomUUID().slice(0, 8)}`,
): Promise<void> {
  const envelope: ClientEnvelope = {
    reqId,
    expectedSeq,
    sentAt: Date.now(),
    command,
  };
  await room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(envelope));
}

beforeEach(() => {
  installMockWebSocketPairGlobal();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sourced room modifier transactions', () => {
  const casterId = '123456789012345678';
  const recipientId = '234567890123456789';

  function canonicalEnv() {
    return createMockEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
  }

  async function saveCanonicalSheets(env: ReturnType<typeof canonicalEnv>, ...sheets: W20UserCharacterSheet[]) {
    const repository = new UserSheetRepository(env);
    for (const sheet of sheets) await repository.create(sheet);
  }

  async function connect(room: GameRoomDO, state: MockDurableObjectState, id: string) {
    const env = canonicalEnv();
    const jwt = await mintJwtForUser(id, id, [], env.SUPABASE_JWT_SECRET);
    await room.fetch(
      new Request('https://vtt.example/ws/room/dice-room-modifier-tests', {
        headers: { Upgrade: 'websocket' },
      })
    );
    const ws = state.acceptedSockets.at(-1)!;
    await sendCommand(room, ws, 0, {
      type: 'HELLO_AUTH',
      sessionJwt: jwt,
      campaignId: 'dice-room-modifier-tests',
      characterId: null,
      lastSeenSeq: null,
    });
    return ws;
  }

  function blank(id: string, owner: string) {
    const sheet = createBlankUserCharacterSheet({ id, ownerDiscordId: owner, name: id });
    sheet.gnosis = { permanent: 5, temporary: 5 };
    sheet.baseAttributes.strength = 3;
    return sheet;
  }

  it('uses the seated player’s shared mode for physical waves and restores it on reconnect', async () => {
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, canonicalEnv());
    const roller = await connect(room, state, casterId);
    const watcher = await connect(room, state, recipientId);
    const currentSeq = roller.drainJson<ServerEnvelope>().at(-1)!.seq;
    watcher.drainJson();
    await sendCommand(room, roller, currentSeq, { type: 'SET_TABLE_SPECIALTY_MODE', specialtyMode: 'revised_explode' });
    expect(watcher.drainJson<ServerEnvelope<ServerEvent>>().map(({ event }) => event))
      .toContainEqual(expect.objectContaining({ type: 'WORLD_ENV_UPDATED', specialtyMode: 'revised_explode' }));
    await sendCommand(room, roller, 0, {
      type: 'ROLL_TABLE_POOL', pool: 3, rageDiceCount: 0, difficulty: 6, hasSpecialty: true,
      spendWillpower: false, applyWoundPenalty: false, physicalDiceValues: [10, 10, 1],
      physicalBonusWaves: [[10, 1], [6]],
    });
    const dice = watcher.drainJson<ServerEnvelope<ServerEvent>>().find(({ event }) => event.type === 'DICE_ROLLED_3D')?.event;
    expect(dice).toMatchObject({ roll: {
      effectivePool: 3, netSuccesses: 3, rawSuccesses: 4, onesRolled: 1,
      hasApplicableSpecialty: true, specialtyMode: 'revised_explode',
    } });
    if (dice?.type === 'DICE_ROLLED_3D') {
      expect(dice.roll.dice.map((die) => [die.value, die.parentIndex])).toEqual([
        [10, undefined], [10, undefined], [1, undefined], [10, 0], [1, 1], [6, 3],
      ]);
    }
    const reconnect = await connect(new GameRoomDO(state as unknown as DurableObjectState, canonicalEnv()), state, recipientId);
    expect(reconnect.drainJson<ServerEnvelope<ServerEvent>>().map(({ event }) => event))
      .toContainEqual(expect.objectContaining({ type: 'SYNC_SNAPSHOT', snapshot: expect.objectContaining({ specialtyMode: 'revised_explode' }) }));
  });

  function lastRuleSheet(ws: MockWebSocket, id: string): W20UserCharacterSheet | undefined {
    const events = ws.drainJson<ServerEnvelope<ServerEvent>>();
    const states = events.flatMap((envelope) =>
      envelope.event.type === 'RULE_STATE_UPDATED'
        ? [envelope.event.state]
        : envelope.event.type === 'SYNC_SNAPSHOT' && envelope.event.snapshot.ruleState
          ? [envelope.event.snapshot.ruleState]
          : []
    );
    return states.at(-1)?.sheets.find((sheet) => sheet.id === id);
  }

  it('applies specialty modifiers once and validates typed declarations against the sheet', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const targetWs = await connect(room, state, recipientId);
    const sheet = blank('specialty-sheet', casterId);
    sheet.baseAttributes.strength = 4;
    sheet.specialties.strength = 'Crushing Grip';
    sheet.equipment = [{
      id: 'specialty-rulings',
      name: 'Specialty rulings',
      carried: true,
      customRule: {
        id: 'specialty-rulings',
        name: 'Specialty rulings',
        source: { book: 'Chronicle' },
        effects: [
          { target: 'specialty', operation: 'add', value: -1, when: ['attribute:strength'] },
          { target: 'specialty', operation: 'add', value: 1, when: ['attribute:stamina'] },
        ],
      },
    }];
    const shortcut = {
      id: 'check',
      name: 'Check',
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    };
    const legacyShortcut = {
      ...shortcut,
      id: 'legacy-specialty',
      source: { kind: 'trait_combo', attribute: 'wits' } as const,
      forceSpecialty: true,
    };
    sheet.shortcuts.push(legacyShortcut);
    const target = blank('specialty-defense-sheet', recipientId);
    target.equipment = [{
      id: 'specialty-defense',
      name: 'Specialty defense',
      carried: true,
      customRule: {
        id: 'specialty-defense',
        name: 'Specialty defense',
        source: { book: 'Chronicle' },
        effects: [{ target: 'target:specialty', operation: 'add', value: -1 }],
      },
    }];
    await saveCanonicalSheets(env, sheet, target);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    await sendCommand(room, targetWs, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet: target });
    ws.drainJson();

    async function check(
      configured: NonNullable<Extract<ClientCommand, {type: 'ROLL_TABLE_POOL'}>['shortcut']>,
      specialtyOverride: boolean | undefined,
      declared: boolean,
      applied: boolean,
      targetIds?: string[],
    ) {
      const context = { specialtyOverride, targetIds };
      await sendCommand(room, ws, 0, {
        type: 'PREVIEW_RULE_ROLL',
        seatId: 'primary',
        sheetId: sheet.id,
        shortcut: configured,
        context,
      });
      const preview = ws.drainJson<ServerEnvelope<ServerEvent>>()
        .find(({ event }) => event.type === 'RULE_ROLL_PREVIEW');
      expect(preview?.event).toMatchObject({ hasSpecialty: applied });
      await sendCommand(room, ws, 0, {
        type: 'ROLL_TABLE_POOL',
        seatId: 'primary',
        sheetId: sheet.id,
        shortcut: configured,
        ruleContext: context,
        pool: 1,
        difficulty: 6,
        rageDiceCount: 0,
        hasSpecialty: true,
        spendWillpower: false,
        applyWoundPenalty: false,
        physicalDiceValues: [10, 2, 2, 2],
      });
      const dice = ws.drainJson<ServerEnvelope<ServerEvent>>()
        .find(({ event }) => event.type === 'DICE_ROLLED_3D');
      expect(dice?.event).toMatchObject({ roll: {
        declaredSpecialty: declared,
        hasApplicableSpecialty: applied,
        rawSuccesses: applied ? 2 : 1,
      } });
    }

    await check({...shortcut, source: {kind: 'trait_combo', attribute: 'strength'}}, true, true, false);
    await check({...shortcut, source: {kind: 'trait_combo', attribute: 'stamina'}}, undefined, false, true);
    await check({...shortcut, source: {kind: 'trait_combo', attribute: 'stamina'}}, undefined, false, false, [target.id]);
    await check({...shortcut, source: {kind: 'trait_combo', attribute: 'wits'}, forceSpecialty: true}, true, false, false);
    await check(legacyShortcut, undefined, true, true);
  });

  it('charges a targeted activation once, preserves it across restart, and keeps other sheets private', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const caster = await connect(room, state, casterId);
    const recipient = await connect(room, state, recipientId);
    const casterSheet = blank('caster-sheet', casterId);
    casterSheet.otherTraits.push({
      id: 'source',
      name: 'Documented Strength Charm',
      kind: 'other',
      dots: 1,
      customRule: {
        id: 'strength-charm',
        name: 'Strength Charm',
        source: { book: 'Chronicle rules', page: 1 },
        activation: { cost: { gnosis: 1 }, duration: 'scene', roll: false },
        effects: [
          {
            target: 'attribute:strength',
            operation: 'add',
            value: 2,
            recipient: 'target',
            duration: 'scene',
          },
        ],
      },
    });
    const recipientSheet = blank('recipient-sheet', recipientId);
    await saveCanonicalSheets(env, casterSheet, recipientSheet);
    await sendCommand(room, caster, 0, {
      type: 'BIND_TABLE_SHEET',
      seatId: 'primary',
      sheet: casterSheet,
    });
    await sendCommand(room, recipient, 0, {
      type: 'BIND_TABLE_SHEET',
      seatId: 'primary',
      sheet: recipientSheet,
    });
    caster.drainJson();
    recipient.drainJson();
    const command: ClientCommand = {
      type: 'ACTIVATE_RULE',
      seatId: 'primary',
      sourceEntryId: 'source',
      ruleId: 'strength-charm',
      targetIds: ['recipient-sheet'],
    };
    await sendCommand(room, caster, 0, command, 'activate-once');
    await sendCommand(room, caster, 0, command, 'activate-once');
    expect(lastRuleSheet(caster, 'caster-sheet')?.gnosis.temporary).toBe(4);
    expect((await new UserSheetRepository(env).getById(casterSheet.id))?.gnosis.temporary).toBe(4);
    const recipientEvents = recipient.drainJson<ServerEnvelope<ServerEvent>>();
    const recipientStates = recipientEvents.flatMap((envelope) =>
      envelope.event.type === 'RULE_STATE_UPDATED' ? [envelope.event.state] : []
    );
    expect(
      recipientStates.every((view) =>
        view.sheets.every((sheet) => sheet.ownerDiscordId === recipientId)
      )
    ).toBe(true);
    expect(recipientStates.at(-1)?.effects).toHaveLength(1);

    const restartedState = new MockDurableObjectState(state.sql.db);
    const restarted = new GameRoomDO(restartedState as unknown as DurableObjectState, env);
    const reconnected = await connect(restarted, restartedState, recipientId);
    expect(lastRuleSheet(reconnected, 'recipient-sheet')?.activeRuleEffects).toHaveLength(1);
    await sendCommand(restarted, reconnected, 0, {
      type: 'PREVIEW_RULE_ROLL',
      seatId: 'primary',
      sheetId: 'recipient-sheet',
      shortcut: {
        id: 'strength',
        name: 'Strength',
        source: { kind: 'trait_combo', attribute: 'strength' },
        difficulty: 6,
        rageDiceCount: 0,
        applyWoundPenalty: true,
        isSecretRoll: false,
      },
    });
    const preview = reconnected
      .drainJson<ServerEnvelope<ServerEvent>>()
      .find((envelope) => envelope.event.type === 'RULE_ROLL_PREVIEW');
    expect(preview?.event.type === 'RULE_ROLL_PREVIEW' && preview.event.pool).toBe(5);
    await sendCommand(restarted, reconnected, 0, {
      type: 'ADVANCE_RULE_CLOCK',
      unit: 'scene',
      amount: 1,
    });
    expect(lastRuleSheet(reconnected, 'recipient-sheet')?.activeRuleEffects).toHaveLength(0);
  });

  it('spends the activation cost after a failed roll and grants no bonus', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('failed-caster', casterId);
    sheet.otherTraits.push({
      id: 'failed-source',
      name: 'Fallible Charm',
      kind: 'other',
      dots: 1,
      customRule: {
        id: 'fallible-charm',
        name: 'Fallible Charm',
        source: { book: 'Chronicle rules' },
        activation: {
          cost: { gnosis: 1 },
          duration: 'scene',
          roll: true,
          rollSpec: { pool: 1, difficulty: 10 },
        },
        effects: [{ target: 'attribute:strength', operation: 'add', value: 2, duration: 'scene' }],
      },
    });
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();
    await sendCommand(room, ws, 0, {
      type: 'ACTIVATE_RULE',
      sourceEntryId: 'failed-source',
      ruleId: 'fallible-charm',
      targetIds: [],
    });
    const events = ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(
      events.some(
        (envelope) =>
          envelope.event.type === 'RULE_ACTIVATION_RESOLVED' && !envelope.event.succeeded
      )
    ).toBe(true);
    const view = events.filter((envelope) => envelope.event.type === 'RULE_STATE_UPDATED').at(-1);
    expect(
      view?.event.type === 'RULE_STATE_UPDATED' && view.event.state.sheets[0]?.gnosis.temporary
    ).toBe(4);
    expect(view?.event.type === 'RULE_STATE_UPDATED' && view.event.state.effects).toEqual([]);
    expect((await new UserSheetRepository(env).getById(sheet.id))?.gnosis.temporary).toBe(4);
  });

  it('uses Fair Fortune once per scene, charges one Gnosis, and locks the original across both powers', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(9);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('fortunate-sheet', casterId);
    sheet.otherTraits.push({ id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' });
    sheet.gifts.push({ id: 'fair-fortune', name: 'Fair Fortune', level: 3, summary: '', ruleId: FAIR_FORTUNE_RULE_ID });
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();

    async function botchedRoll() {
      await sendCommand(room, ws, 0, {
        type: 'ROLL_TABLE_POOL', seatId: 'primary', sheetId: sheet.id, pool: 1, difficulty: 6,
        rageDiceCount: 0, hasSpecialty: false, spendWillpower: false, applyWoundPenalty: false,
        physicalDiceValues: [1], label: 'Original',
      });
      const rolled = ws.drainJson<ServerEnvelope<ServerEvent>>().find(({ event }) => event.type === 'DICE_ROLLED_3D');
      if (rolled?.event.type !== 'DICE_ROLLED_3D' || !rolled.event.historyEntry) throw new Error('Expected a roll');
      return rolled.event.historyEntry.id;
    }
    const rollId = await botchedRoll();
    const command = { type: 'REROLL_RULE_ROLL', seatId: 'primary', sheetId: sheet.id, rollId, ruleId: FAIR_FORTUNE_RULE_ID } as const;
    await sendCommand(room, ws, 0, command, 'fortune-once');
    const replacement = ws.drainJson<ServerEnvelope<ServerEvent>>().find(({ event }) => event.type === 'DICE_ROLLED_3D');
    expect(replacement?.event.type === 'DICE_ROLLED_3D' && replacement.event.historyEntry?.rerollOf).toBe(rollId);
    expect(replacement?.event.type === 'DICE_ROLLED_3D' && replacement.event.roll.netSuccesses).toBe(1);
    await sendCommand(room, ws, 0, command, 'fortune-once');
    expect((await new UserSheetRepository(env).getById(sheet.id))?.gnosis.temporary).toBe(4);
    ws.drainJson();

    await sendCommand(room, ws, 0, { ...command, ruleId: 'merit-lucky' });
    expect(ws.drainJson<ServerEnvelope<ServerEvent>>().some(({ event }) => event.type === 'COMMAND_REJECTED')).toBe(true);
    const secondRoll = await botchedRoll();
    await sendCommand(room, ws, 0, { ...command, rollId: secondRoll });
    expect(ws.drainJson<ServerEnvelope<ServerEvent>>().some(({ event }) => event.type === 'COMMAND_REJECTED')).toBe(true);
    await sendCommand(room, ws, 0, { type: 'ADVANCE_RULE_CLOCK', unit: 'scene', amount: 1 });
    await sendCommand(room, ws, 0, { ...command, rollId: secondRoll });
    expect((await new UserSheetRepository(env).getById(sheet.id))?.gnosis.temporary).toBe(3);
  });

  async function rollBotchForReplacement(room: GameRoomDO, ws: MockWebSocket, sheetId: string, hasSpecialty = false) {
    await sendCommand(room, ws, 0, {
      type: 'ROLL_TABLE_POOL', seatId: 'primary', sheetId, pool: 1, difficulty: 6,
      rageDiceCount: 0, hasSpecialty, spendWillpower: false, applyWoundPenalty: false,
      physicalDiceValues: [1], label: 'Botched roll',
    });
    const envelopes = ws.drainJson<ServerEnvelope<ServerEvent>>();
    const event = envelopes.find(({ event }) => event.type === 'DICE_ROLLED_3D')?.event;
    if (event?.type !== 'DICE_ROLLED_3D' || !event.historyEntry) throw new Error('Expected a roll');
    expect(event.roll.isBotch).toBe(true);
    return { rollId: event.historyEntry.id, roll: event.roll, seq: envelopes.at(-1)!.seq, envelopes };
  }

  it('allows three Lucky replacements per story and restores the budget in the next story', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('lucky-budget', casterId);
    sheet.otherTraits.push({ id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' });
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();

    async function useLucky(rollId: string) {
      await sendCommand(room, ws, 0, {
        type: 'REROLL_RULE_ROLL', seatId: 'primary', sheetId: sheet.id, rollId, ruleId: 'merit-lucky',
      });
      return ws.drainJson<ServerEnvelope<ServerEvent>>().map(({ event }) => event);
    }

    for (let use = 1; use <= 3; use++) {
      const { rollId } = await rollBotchForReplacement(room, ws, sheet.id);
      expect(await useLucky(rollId)).toContainEqual(expect.objectContaining({
        type: 'DICE_ROLLED_3D', historyEntry: expect.objectContaining({ rerollOf: rollId }),
      }));
    }
    const fourth = await rollBotchForReplacement(room, ws, sheet.id);
    const rejected = await useLucky(fourth.rollId);
    expect(rejected.some(({ type }) => type === 'COMMAND_REJECTED')).toBe(true);
    expect(rejected.some(({ type }) => type === 'DICE_ROLLED_3D')).toBe(false);
    await sendCommand(room, ws, 0, { type: 'ADVANCE_RULE_CLOCK', unit: 'story', amount: 1 });
    ws.drainJson();
    expect(await useLucky(fourth.rollId)).toContainEqual(expect.objectContaining({
      type: 'DICE_ROLLED_3D', historyEntry: expect.objectContaining({ rerollOf: fourth.rollId }),
    }));
  });

  it('honors a legacy prepaid Fair Fortune without spending Gnosis again', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const savedRoom = state.sql.exec<{ state_json: string }>('SELECT state_json FROM room_state WHERE id = 1').toArray()[0]!;
    const { ruleCommitNamespace, ruleState } = JSON.parse(savedRoom.state_json);
    const scene = ruleState?.clock.scene ?? 0;
    const sheet = blank('prepaid-fortune', casterId);
    const sourceId = 'fair-fortune';
    const effectId = 'legacy-prepaid-fortune';
    sheet.gnosis.temporary = 4;
    sheet.gifts.push({ id: sourceId, name: 'Fair Fortune', level: 3, summary: '', ruleId: FAIR_FORTUNE_RULE_ID });
    sheet.ruleActivationReceipts = [
      ['rule-use', sheet.id, FAIR_FORTUNE_RULE_ID, 'self', ruleCommitNamespace, 'scene', scene].join(':'),
    ];
    sheet.activeRuleEffects = [{
      id: effectId, sourceId: sheet.id + ':' + sourceId, sourceItemId: sourceId, sourceOwnerId: sheet.id,
      ruleId: FAIR_FORTUNE_RULE_ID, duration: 'next-roll', clockId: 'dice-room-modifier-tests',
    }];
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();

    const { rollId, envelopes } = await rollBotchForReplacement(room, ws, sheet.id);
    const projected = envelopes.flatMap(({ event }) => event.type === 'RULE_STATE_UPDATED' ? event.state.rerollOptions ?? [] : []);
    expect(projected).toContainEqual(expect.objectContaining({ rollId, ruleId: FAIR_FORTUNE_RULE_ID, gnosisCost: 0 }));
    await sendCommand(room, ws, 0, {
      type: 'REROLL_RULE_ROLL', seatId: 'primary', sheetId: sheet.id, rollId, ruleId: FAIR_FORTUNE_RULE_ID,
    });
    expect(ws.drainJson<ServerEnvelope<ServerEvent>>().map(({ event }) => event)).toContainEqual(expect.objectContaining({
      type: 'DICE_ROLLED_3D', historyEntry: expect.objectContaining({ rerollOf: rollId }),
    }));
    const saved = await new UserSheetRepository(env).getById(sheet.id);
    expect(saved?.gnosis.temporary).toBe(4);
    expect(saved?.activeRuleEffects?.some(({ id }) => id === effectId)).toBe(false);
  });

  it('uses the original specialty mode for a Lucky replacement after the room switches modes', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('lucky-specialty', casterId);
    sheet.otherTraits.push({ id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' });
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    const seq = ws.drainJson<ServerEnvelope<ServerEvent>>().at(-1)!.seq;
    await sendCommand(room, ws, seq, { type: 'SET_TABLE_SPECIALTY_MODE', specialtyMode: 'revised_explode' });
    ws.drainJson();
    const original = await rollBotchForReplacement(room, ws, sheet.id, true);
    expect(original.roll).toMatchObject({ specialtyMode: 'revised_explode', hasApplicableSpecialty: true });
    await sendCommand(room, ws, original.seq, { type: 'SET_TABLE_SPECIALTY_MODE', specialtyMode: 'w20_double' });
    expect(ws.drainJson<ServerEnvelope<ServerEvent>>().map(({ event }) => event)).toContainEqual(expect.objectContaining({
      type: 'WORLD_ENV_UPDATED', specialtyMode: 'w20_double',
    }));

    const replacementFaces = [10, 6];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const isDie = array instanceof Uint8Array && array.length === 1;
      (array as Uint8Array).fill(isDie ? (replacementFaces.shift() ?? 6) - 1 : 0);
      return array;
    });
    await sendCommand(room, ws, 0, {
      type: 'REROLL_RULE_ROLL', seatId: 'primary', sheetId: sheet.id, rollId: original.rollId, ruleId: 'merit-lucky',
    });
    const replacement = ws.drainJson<ServerEnvelope<ServerEvent>>().find(({ event }) => event.type === 'DICE_ROLLED_3D')?.event;
    expect(replacement).toMatchObject({
      historyEntry: { rerollOf: original.rollId },
      roll: { specialtyMode: 'revised_explode', dice: [
        { value: 10, isBonusExplosionDie: false }, { value: 6, isBonusExplosionDie: true, parentIndex: 0 },
      ] },
    });
  });

  it('defers a private failed activation at its opposed threshold and uses the original request after restart', async () => {
    let generatedFaces = [10, 6];
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const face = array instanceof Uint8Array && array.length === 1 ? generatedFaces.shift() ?? 10 : 10;
      (array as Uint8Array).fill(face - 1);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const observer = await connect(room, state, recipientId);
    const sheet = blank('fortunate-caster', casterId);
    sheet.otherTraits.push(
      { id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' },
      { id: 'charm', name: 'Opposed Charm', kind: 'other', dots: 1, customRule: {
        id: 'opposed-charm', name: 'Opposed Charm', source: { book: 'Chronicle rules' },
        activation: {
          cost: { gnosis: 1 }, roll: true, duration: 'scene',
          rollSpec: { pool: 2, difficulty: 10, opposed: true },
          failureEffects: [{ target: 'attribute:strength', operation: 'add', value: -1, duration: 'scene' }],
        },
        effects: [{ target: 'attribute:strength', operation: 'add', value: 2, duration: 'scene' }],
      } },
    );
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();
    observer.drainJson();
    const activate = { type: 'ACTIVATE_RULE', sourceEntryId: 'charm', ruleId: 'opposed-charm', targetIds: [], opposingSuccesses: 1 } as const;
    await sendCommand(room, ws, 0, { ...activate, targetIds: [] }, 'pending-cast');
    const events = ws.drainJson<ServerEnvelope<ServerEvent>>();
    const latest = events.filter(({ event }) => event.type === 'RULE_STATE_UPDATED').at(-1)?.event;
    expect(latest?.type === 'RULE_STATE_UPDATED' && latest.state.effects).toHaveLength(0);
    expect(events.some(({ event }) => event.type === 'RULE_ACTIVATION_RESOLVED')).toBe(false);
    const pending = latest?.type === 'RULE_STATE_UPDATED' ? latest.state.pendingActivations?.[0] : undefined;
    if (!pending) throw new Error('Expected a deferred result');
    expect(pending.roll.netSuccesses).toBe(1);
    expect(observer.drainJson<ServerEnvelope<ServerEvent>>().every(({ event }) =>
      event.type !== 'RULE_STATE_UPDATED' || !event.state.pendingActivations?.length)).toBe(true);
    expect((await new UserSheetRepository(env).getById(sheet.id))?.gnosis.temporary).toBe(4);

    const restartedState = new MockDurableObjectState(state.sql.db);
    const restarted = new GameRoomDO(restartedState as unknown as DurableObjectState, env);
    const reconnected = await connect(restarted, restartedState, casterId);
    await sendCommand(restarted, reconnected, 0, { ...activate, targetIds: [] }, 'pending-cast');
    expect(reconnected.drainJson<ServerEnvelope<ServerEvent>>().some(({ event }) =>
      event.type === 'RULE_STATE_UPDATED' && event.state.pendingActivations?.[0]?.rollId === pending.rollId)).toBe(true);
    await sendCommand(restarted, reconnected, 0, { type: 'REROLL_RULE_ROLL', seatId: 'primary', sheetId: sheet.id, rollId: pending.rollId, ruleId: 'merit-lucky' }, 'lucky-activation');
    const result = reconnected.drainJson<ServerEnvelope<ServerEvent>>();
    expect(result.some(({ event }) => event.type === 'RULE_ACTIVATION_RESOLVED' && event.succeeded)).toBe(true);
    expect(result.some(({ event }) => event.type === 'DICE_ROLLED_3D' && event.historyEntry?.rerollOf === pending.rollId && event.roll.dice.length === 2)).toBe(true);
    const saved = await new UserSheetRepository(env).getById(sheet.id);
    expect(saved?.gnosis.temporary).toBe(4);
    expect(saved?.activeRuleEffects?.map((effect) => effect.ruleId)).toContain('opposed-charm');
  });

  it('keeps a pending botch once before the clock advances and expires its failure effect in the old scene', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('clock-caster', casterId);
    sheet.otherTraits.push(
      { id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' },
      { id: 'charm', name: 'Short Charm', kind: 'other', dots: 1, customRule: {
        id: 'short-charm', name: 'Short Charm', source: { book: 'Chronicle rules' },
        activation: {
          cost: { gnosis: 1 }, roll: true, duration: 'scene', rollSpec: { pool: 1, difficulty: 6 },
          botchEffects: [{ target: 'attribute:strength', operation: 'add', value: -1, duration: 'scene' }],
        },
        effects: [],
      } },
    );
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();
    const activate: ClientCommand = { type: 'ACTIVATE_RULE', sourceEntryId: 'charm', ruleId: 'short-charm', targetIds: [] };
    await sendCommand(room, ws, 0, activate, 'auto-keep-original');
    const pending = ws.drainJson<ServerEnvelope<ServerEvent>>().flatMap(({ event }) =>
      event.type === 'RULE_STATE_UPDATED' ? event.state.pendingActivations ?? [] : []
    ).at(-1);
    if (!pending) throw new Error('Expected a deferred result');
    await sendCommand(room, ws, 0, { type: 'ADVANCE_RULE_CLOCK', unit: 'scene', amount: 1 }, 'advance-once');
    await sendCommand(room, ws, 0, { type: 'ADVANCE_RULE_CLOCK', unit: 'scene', amount: 1 }, 'advance-once');
    const events = ws.drainJson<ServerEnvelope<ServerEvent>>();
    const outcomes = events.flatMap(({ event }) => event.type === 'RULE_ACTIVATION_RESOLVED' ? [event] : []);
    expect(outcomes.map((event) => event.roll?.isBotch)).toEqual([true]);
    const stateUpdates = events.flatMap(({ event }) => event.type === 'RULE_STATE_UPDATED' ? [event.state] : []);
    expect(stateUpdates.at(-1)?.clock.scene).toBe(1);
    expect(stateUpdates.at(-1)?.pendingActivations).toEqual([]);
    expect(stateUpdates.at(-1)?.effects).toHaveLength(0);
    await sendCommand(room, ws, 0, { type: 'KEEP_ACTIVATION_RESULT', seatId: 'primary', sheetId: sheet.id, rollId: pending.rollId }, 'keep-again');
    expect(ws.drainJson<ServerEnvelope<ServerEvent>>().some(({ event }) => event.type === 'RULE_ACTIVATION_RESOLVED')).toBe(false);
    expect((await new UserSheetRepository(env).getById(sheet.id))?.gnosis.temporary).toBe(4);
  });

  it('reserves the exact active parent while the target decides whether to retry its resistance roll', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const caster = await connect(room, state, casterId);
    const target = await connect(room, state, recipientId);
    const casterSheet = blank('sign-caster', casterId);
    const targetSheet = blank('sign-target', recipientId);
    targetSheet.otherTraits.push({ id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3, ruleId: 'merit-lucky' });
    casterSheet.otherTraits.push({
      id: 'sign', name: 'Sign', kind: 'other', dots: 1, customRule: {
        id: 'resistance-sign', name: 'Sign', source: { book: 'Chronicle rules' },
        activation: { roll: false, duration: 'scene' },
        effects: [{ target: 'item:sign', operation: 'allow', value: 1, duration: 'scene' }],
        actions: [{
          id: 'resist', name: 'Resist', requiresActive: true, endsParent: true,
          activation: { roll: true, duration: 'instant', rollSpec: { actor: 'target', pool: 1, difficulty: 6, outcome: 'failure' } },
          effects: [{ target: 'form:lupus', operation: 'allow', value: 1, recipient: 'target', duration: 'instant' }],
        }],
      },
    });
    await saveCanonicalSheets(env, casterSheet, targetSheet);
    await sendCommand(room, caster, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet: casterSheet });
    await sendCommand(room, target, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet: targetSheet });
    const activate: ClientCommand = { type: 'ACTIVATE_RULE', sourceEntryId: 'sign', ruleId: 'resistance-sign', targetIds: [] };
    await sendCommand(room, caster, 0, activate);
    const parent = lastRuleSheet(caster, casterSheet.id)?.activeRuleEffects?.[0];
    if (!parent) throw new Error('Expected a parent effect');
    target.drainJson();
    const resist = { ...activate, actionId: 'resist', targetIds: [targetSheet.id] };
    await sendCommand(room, caster, 0, resist);
    const pending = target.drainJson<ServerEnvelope<ServerEvent>>().flatMap(({ event }) =>
      event.type === 'RULE_STATE_UPDATED' ? event.state.pendingActivations ?? [] : []
    ).at(-1);
    if (!pending) throw new Error('Expected the target to receive a private decision');
    expect(caster.drainJson<ServerEnvelope<ServerEvent>>().every(({ event }) =>
      event.type !== 'RULE_STATE_UPDATED' || !event.state.pendingActivations?.length)).toBe(true);
    await sendCommand(room, caster, 0, resist);
    await sendCommand(room, caster, 0, { type: 'END_RULE_EFFECT', effectId: parent.id });
    expect(caster.drainJson<ServerEnvelope<ServerEvent>>().filter(({ event }) => event.type === 'COMMAND_REJECTED')).toHaveLength(2);

    await sendCommand(room, target, 0, { type: 'KEEP_ACTIVATION_RESULT', seatId: 'primary', sheetId: targetSheet.id, rollId: pending.rollId });
    expect(lastRuleSheet(caster, casterSheet.id)?.activeRuleEffects).toEqual([]);
  });

  it('corrects a selected original roll with Fate while preserving every original die', async () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(9);
      return array;
    });
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('fated-character', casterId);
    sheet.backgrounds = [{ id: 'fate', name: 'Fate', dots: 1, ruleId: 'fate' }];
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();
    await sendCommand(room, ws, 0, {
      type: 'ROLL_TABLE_POOL',
      sheetId: sheet.id,
      pool: 1,
      difficulty: 6,
      rageDiceCount: 0,
      hasSpecialty: false,
      spendWillpower: false,
      applyWoundPenalty: false,
      label: 'Original task',
      physicalDiceValues: [1],
    });
    const originalEnvelope = ws
      .drainJson<ServerEnvelope<ServerEvent>>()
      .find((envelope) => envelope.event.type === 'DICE_ROLLED_3D');
    if (originalEnvelope?.event.type !== 'DICE_ROLLED_3D' || !originalEnvelope.event.historyEntry)
      throw new Error('Expected the original result.');
    const original = originalEnvelope.event.historyEntry;
    expect(original.roll.isBotch).toBe(true);
    const activation: ClientCommand = {
      type: 'ACTIVATE_RULE',
      seatId: 'primary',
      sourceEntryId: 'fate',
      ruleId: 'fate',
      referenceRollId: original.id,
      targetIds: [],
      confirmedConditions: true,
    };
    await sendCommand(room, ws, 0, activation, 'fate-once');
    const correction = ws
      .drainJson<ServerEnvelope<ServerEvent>>()
      .find(
        (envelope) =>
          envelope.event.type === 'DICE_ROLLED_3D' &&
          envelope.event.historyEntry?.correctionOf === original.id
      );
    if (correction?.event.type !== 'DICE_ROLLED_3D')
      throw new Error('Expected the corrected result.');
    expect(correction.event.roll.dice).toEqual(original.roll.dice);
    expect(correction.event.roll.physicsSeed).toBe(original.roll.physicsSeed);
    expect(correction.event.roll.automaticSuccesses).toBe(1);
    expect(correction.event.roll.netSuccesses).toBe(1);
    expect(correction.event.roll.isBotch).toBe(false);
    await sendCommand(room, ws, 0, activation, 'fate-once');
    expect(
      ws
        .drainJson<ServerEnvelope<ServerEvent>>()
        .some((envelope) => envelope.event.type === 'DICE_ROLLED_3D')
    ).toBe(false);
  });

  it('protects rank, forced form and consumed equipment on a stale bind while keeping an unrelated addition', async () => {
    const env = canonicalEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ws = await connect(room, state, casterId);
    const sheet = blank('transformed-character', casterId);
    sheet.equipment = [
      {
        id: 'consumed-token',
        name: 'Transformation Token',
        customRule: {
          id: 'transformation-token',
          name: 'Transformation Token',
          source: { book: 'Chronicle rules' },
          activation: { duration: 'instant', roll: false, consumable: true },
          effects: [
            { target: 'rank', operation: 'set', value: 2, duration: 'instant' },
            { target: 'form:lupus', operation: 'allow', value: 1, duration: 'instant' },
          ],
        },
      },
    ];
    await saveCanonicalSheets(env, sheet);
    await sendCommand(room, ws, 0, { type: 'BIND_TABLE_SHEET', seatId: 'primary', sheet });
    ws.drainJson();
    await sendCommand(room, ws, 0, {
      type: 'ACTIVATE_RULE',
      sourceEntryId: 'consumed-token',
      ruleId: 'transformation-token',
      targetIds: [],
    });
    const accepted = lastRuleSheet(ws, sheet.id)!;
    expect(accepted.rank).toBe(2);
    expect(accepted.activeForm).toBe('lupus');
    expect(accepted.equipment).toHaveLength(0);
    expect(await new UserSheetRepository(env).getById(sheet.id)).toMatchObject({
      rank: 2,
      activeForm: 'lupus',
      equipment: [],
    });
    await sendCommand(room, ws, 0, {
      type: 'BIND_TABLE_SHEET',
      seatId: 'primary',
      sheet: {
        ...sheet,
        name: 'Edited while activating',
        equipment: [...sheet.equipment, { id: 'unrelated-rope', name: 'Rope' }],
        updatedAt: accepted.updatedAt + 1,
      },
    });
    const rebound = lastRuleSheet(ws, sheet.id)!;
    expect(rebound.rank).toBe(2);
    expect(rebound.activeForm).toBe('lupus');
    expect(rebound.equipment?.map((item) => item.id)).toEqual(['unrelated-rope']);
    expect(rebound.name).toBe('Edited while activating');
  });

  it('merges an editor save without replaying or losing a persisted resource transaction', async () => {
    const env = canonicalEnv();
    const repository = new UserSheetRepository(env);
    const stale = blank('cas-sheet', casterId);
    await repository.create(stale);
    const apply = (sheet: W20UserCharacterSheet) =>
      sheet.ruleActivationReceipts?.includes('cost-once')
        ? sheet
        : {
            ...sheet,
            gnosis: { ...sheet.gnosis, temporary: sheet.gnosis.temporary - 1 },
            ruleActivationReceipts: ['cost-once'],
            updatedAt: sheet.updatedAt + 1,
          };
    await repository.mutateRuleState(stale.id, apply);
    await repository.mutateRuleState(stale.id, apply);
    const saved = await repository.update({
      ...stale,
      name: 'Edited name',
      updatedAt: stale.updatedAt + 2,
    });
    expect(saved?.name).toBe('Edited name');
    expect(saved?.gnosis.temporary).toBe(4);
    expect(saved?.ruleActivationReceipts).toEqual(['cost-once']);
  });
});

describe('GameRoomDO authoritative W20 engine & projection security', () => {
  it('persists campaign mystical experience separately and directs general awards to the approved ledger path', async () => {
    const fetchSpy = mockSupabaseForRoom({ rule_state: { packTotem: 'Uktena', mysticalExperience: 4 } });
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const { ws, events } = await openAndAuthSocket(room, state, jwt, PC1_ID);
    const initial = events.find((envelope) => envelope.event.type === 'SYNC_SNAPSHOT');
    expect(initial?.event.type === 'SYNC_SNAPSHOT' && initial.event.snapshot.characters[PC1_ID]?.mysticalExperience).toBe(4);

    const award: ClientCommand = { type: 'APPLY_RULE_EVENT', characterId: PC1_ID, event: 'story_end' };
    await sendCommand(room, ws, 0, award, 'mystical-story-once');
    const updates = ws.drainJson<ServerEnvelope<ServerEvent>>();
    const changed = updates.filter((envelope) => envelope.event.type === 'CHARACTER_PATCHED' && envelope.event.characterId === PC1_ID).at(-1);
    expect(changed?.event.type === 'CHARACTER_PATCHED' && changed.event.character.mysticalExperience).toBe(6);
    await Promise.allSettled(state.waitUntilPromises);
    const persisted = fetchSpy.mock.calls.filter(([url, init]) => String(url).includes(`/characters?id=eq.${PC1_ID}`) && init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init?.body)) as { rule_state?: { mysticalExperience?: number } });
    expect(persisted.some((patch) => patch.rule_state?.mysticalExperience === 6)).toBe(true);
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/xp_ledger'))).toBe(false);

    const restoredState = new MockDurableObjectState(state.sql.db);
    const restoredRoom = new GameRoomDO(restoredState as unknown as DurableObjectState, env);
    const reconnected = await openAndAuthSocket(restoredRoom, restoredState, jwt, PC1_ID);
    const restoredSnapshot = reconnected.events.find((envelope) => envelope.event.type === 'SYNC_SNAPSHOT');
    expect(restoredSnapshot?.event.type === 'SYNC_SNAPSHOT' && restoredSnapshot.event.snapshot.characters[PC1_ID]?.mysticalExperience).toBe(6);
    await sendCommand(restoredRoom, reconnected.ws, 0, award, 'mystical-story-once');
    expect(reconnected.ws.drainJson<ServerEnvelope<ServerEvent>>().some((envelope) => envelope.event.type === 'CHARACTER_PATCHED')).toBe(false);

    await sendCommand(restoredRoom, reconnected.ws, 0, { type: 'APPLY_RULE_EVENT', characterId: PC1_ID, event: 'experience_award', amount: 3 });
    const rejected = reconnected.ws.drainJson<ServerEnvelope<ServerEvent>>().find((envelope) => envelope.event.type === 'COMMAND_REJECTED');
    expect(rejected?.event.type === 'COMMAND_REJECTED' && rejected.event.message).toContain(`/api/campaigns/${CAMPAIGN_ID}/xp-award`);
    await Promise.allSettled(restoredState.waitUntilPromises);
  });

  it('strictly scrubs isNpc sheets, isHidden tokens, Penumbra tokens, secret ST rolls, and whispers from player views', async () => {
    mockSupabaseForRoom();
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const stJwt = await mintJwtForUser(ST_DISCORD_ID, 'Storyteller', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p2Jwt = await mintJwtForUser(PLAYER2_DISCORD_ID, 'PlayerTwo', [GUILD_ID], env.SUPABASE_JWT_SECRET);

    const stConn = await openAndAuthSocket(room, state, stJwt, null);
    const p1Conn = await openAndAuthSocket(room, state, p1Jwt, PC1_ID);
    const p2Conn = await openAndAuthSocket(room, state, p2Jwt, PC2_ID);

    const stSnapEnv = stConn.events[0]!;
    expect(stSnapEnv.event.type).toBe('SYNC_SNAPSHOT');
    if (stSnapEnv.event.type === 'SYNC_SNAPSHOT') {
      expect(Object.keys(stSnapEnv.event.snapshot.characters)).toContain(DB_NPC_ID);
      expect(stSnapEnv.event.snapshot.tokens.some((t) => t.isHidden)).toBe(true);
    }

    const p1SnapEnv = p1Conn.events[0]!;
    expect(p1SnapEnv.event.type).toBe('SYNC_SNAPSHOT');
    if (p1SnapEnv.event.type === 'SYNC_SNAPSHOT') {
      expect(p1SnapEnv.event.snapshot.viewerRole).toBe('player');
      expect(Object.keys(p1SnapEnv.event.snapshot.characters)).not.toContain(DB_NPC_ID);
      expect(Object.values(p1SnapEnv.event.snapshot.characters).every((c) => !c.isNpc)).toBe(true);
      expect(p1SnapEnv.event.snapshot.tokens.some((t) => t.characterId === DB_NPC_ID)).toBe(false);
      const pc1Tok = p1SnapEnv.event.snapshot.tokens.find((t) => t.characterId === PC1_ID);
      expect(pc1Tok).toMatchObject({ x: 175, y: 175 });
    }

    // ST spawns hidden Physical NPC + visible Penumbra Bane
    await sendCommand(room, stConn.ws, 0, {
      type: 'ST_SPAWN_NPC_TEMPLATE',
      templateId: 'pentex_first_team',
      quantity: 1,
      realm: 'physical',
      isHidden: true,
    });
    let stUpdates = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    let p1Updates = p1Conn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const afterSpawnSeq = stUpdates[stUpdates.length - 1]!.seq;

    // Player NEVER receives NPC CHARACTER_PATCHED and NEVER sees hidden token
    expect(p1Updates.some((e) => e.event.type === 'CHARACTER_PATCHED')).toBe(false);
    const p1TokUpdate1 = p1Updates.find((e) => e.event.type === 'TOKENS_UPDATED');
    expect(p1TokUpdate1).toBeDefined();
    if (p1TokUpdate1?.event.type === 'TOKENS_UPDATED') {
      expect(p1TokUpdate1.event.tokens.some((t) => t.name.includes('Pentex'))).toBe(false);
    }

    // ST spawns visible Penumbra Scrag Bane
    await sendCommand(room, stConn.ws, afterSpawnSeq, {
      type: 'ST_SPAWN_NPC_TEMPLATE',
      templateId: 'scrag_bane',
      quantity: 1,
      realm: 'penumbra',
      isHidden: false,
    });
    stUpdates = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    p1Updates = p1Conn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const afterBaneSeq = stUpdates[stUpdates.length - 1]!.seq;

    // ST sees Scrag Bane token at pixel-space default (525, 385), Physical Player DOES NOT see Penumbra Scrag Bane
    const stBaneTokens = stUpdates.find((e) => e.event.type === 'TOKENS_UPDATED');
    expect(
      stBaneTokens?.event.type === 'TOKENS_UPDATED' &&
        stBaneTokens.event.tokens.some(
          (t) => t.realm === 'penumbra' && t.name.includes('Scrag') && t.x === 525 && t.y === 385,
        ),
    ).toBe(true);

    const p1BaneTokens = p1Updates.find((e) => e.event.type === 'TOKENS_UPDATED');
    expect(
      p1BaneTokens?.event.type === 'TOKENS_UPDATED' &&
        p1BaneTokens.event.tokens.some((t) => t.realm === 'penumbra'),
    ).toBe(false);

    // ST sends secret roll & whisper to Player 2 -> Player 1 receives NEITHER
    p2Conn.ws.drainJson();
    await sendCommand(room, stConn.ws, afterBaneSeq, {
      type: 'ROLL_FREEFORM_POOL',
      characterId: PC1_ID,
      label: 'Secret ST Perception',
      attributeKey: 'perception',
      difficulty: 6,
      isSecretStRoll: true,
    });
    stUpdates = stConn.ws.drainJson();
    const afterSecretSeq = stUpdates[stUpdates.length - 1]!.seq;
    expect(p1Conn.ws.drainJson()).toHaveLength(0);

    await sendCommand(room, stConn.ws, afterSecretSeq, {
      type: 'ST_SEND_WHISPER',
      targetDiscordId: PLAYER2_DISCORD_ID,
      title: 'Umbral Omen',
      body: 'The owls watch the alley.',
    });
    stUpdates = stConn.ws.drainJson();
    const afterWhisperSeq = stUpdates[stUpdates.length - 1]!.seq;
    expect(p1Conn.ws.drainJson()).toHaveLength(0);
    const p2Whispers = p2Conn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(p2Whispers.some((e) => e.event.type === 'WHISPER_RECEIVED')).toBe(true);

    // Reconnect delta replay for Player 1 from seq 1 skips all secret rolls, NPC sheets, and Player 2's whispers!
    const p1Reconnect = await openAndAuthSocket(room, state, p1Jwt, PC1_ID, 1);
    expect(p1Reconnect.events.length).toBeGreaterThan(0);
    expect(p1Reconnect.events.some((e) => e.event.type === 'WHISPER_RECEIVED')).toBe(false);
    expect(p1Reconnect.events.some((e) => e.event.type === 'DICE_ROLLED_3D')).toBe(false);
    expect(p1Reconnect.events.some((e) => e.event.type === 'CHARACTER_PATCHED')).toBe(false);
    expect(afterWhisperSeq).toBeGreaterThan(afterSecretSeq);

    // Reconnect when 0 visible deltas occurred since lastSeenSeq falls back to SYNC_SNAPSHOT so client never hangs in reconnecting
    const p1NoVisibleDeltaReconnect = await openAndAuthSocket(
      room,
      state,
      p1Jwt,
      PC1_ID,
      afterBaneSeq,
    );
    expect(p1NoVisibleDeltaReconnect.events).toHaveLength(1);
    expect(p1NoVisibleDeltaReconnect.events[0]?.event.type).toBe('SYNC_SNAPSHOT');
    expect(p1NoVisibleDeltaReconnect.events[0]?.seq).toBe(afterWhisperSeq);

    const p1UpToDateReconnect = await openAndAuthSocket(
      room,
      state,
      p1Jwt,
      PC1_ID,
      afterWhisperSeq,
    );
    expect(p1UpToDateReconnect.events).toHaveLength(1);
    expect(p1UpToDateReconnect.events[0]?.event.type).toBe('SYNC_SNAPSHOT');
    expect(p1UpToDateReconnect.events[0]?.seq).toBe(afterWhisperSeq);
  });

  it('enforces W20 Rage/Gnosis conflict, Step Sideways Botch -> caughtInGauntlet, and SQLite hibernation survival', async () => {
    mockSupabaseForRoom();
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const { ws, events } = await openAndAuthSocket(room, state, p1Jwt, PC1_ID);
    let currentSeq = events[0]!.seq;

    // 1. Spend 1 Rage via instant_rage_spend to shift to Crinos
    await sendCommand(room, ws, currentSeq, {
      type: 'CHARACTER_SHIFT_FORM',
      characterId: PC1_ID,
      targetForm: 'crinos',
      method: 'instant_rage_spend',
    });
    let batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    currentSeq = batch[batch.length - 1]!.seq;
    expect(
      batch.some((e) => e.event.type === 'CHARACTER_PATCHED' && e.event.character.activeForm === 'crinos'),
    ).toBe(true);

    // 2. Attempting to spend Gnosis on the same turn MUST fail with RAGE_GNOSIS_CONFLICT
    await sendCommand(room, ws, currentSeq, {
      type: 'CHARACTER_UPDATE_TRACKER',
      characterId: PC1_ID,
      tracker: 'gnosis',
      delta: -1,
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(batch[0]?.event.type).toBe('COMMAND_REJECTED');
    if (batch[0]?.event.type === 'COMMAND_REJECTED') {
      expect(batch[0].event.code).toBe('RAGE_GNOSIS_CONFLICT');
    }

    // 3. Stale expectedSeq MUST reject with SEQ_MISMATCH
    await sendCommand(room, ws, currentSeq - 1, {
      type: 'TOKEN_MOVE',
      tokenId: `tok-${PC1_ID}`,
      x: 10,
      y: 12,
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(batch[0]?.event.type).toBe('COMMAND_REJECTED');
    if (batch[0]?.event.type === 'COMMAND_REJECTED') {
      expect(batch[0].event.code).toBe('SEQ_MISMATCH');
      expect(batch[0].event.currentSeq).toBe(currentSeq);
    }

    // 4. Deterministic Botch on STEP_SIDEWAYS -> caughtInGauntlet = true persisted to SQLite
    // Byte 0 -> (0 % 10) + 1 = 1 on every d10 roll -> zero successes + 1s => guaranteed Botch!
    const getRandomSpy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
      if (arr instanceof Uint8Array) {
        arr.fill(0);
      }
      return arr;
    });

    await sendCommand(room, ws, currentSeq, {
      type: 'STEP_SIDEWAYS',
      characterId: PC1_ID,
      targetRealm: 'penumbra',
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    currentSeq = batch[batch.length - 1]!.seq;
    getRandomSpy.mockRestore();

    const patchedAfterBotch = batch.find(
      (e): e is ServerEnvelope<Extract<ServerEvent, { type: 'CHARACTER_PATCHED' }>> =>
        e.event.type === 'CHARACTER_PATCHED',
    );
    expect(patchedAfterBotch?.event.character.caughtInGauntlet).toBe(true);
    expect(patchedAfterBotch?.event.character.activeRealm).toBe('physical');

    // Second STEP_SIDEWAYS while trapped in Gauntlet MUST reject
    await sendCommand(room, ws, currentSeq, {
      type: 'STEP_SIDEWAYS',
      characterId: PC1_ID,
      targetRealm: 'penumbra',
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(batch[0]?.event.type).toBe('COMMAND_REJECTED');

    // Simulate Durable Object hibernation wake with a brand new GameRoomDO instance sharing the same SQLite DB
    const wokeState = new MockDurableObjectState(state.sql.db);
    const wokeRoom = new GameRoomDO(wokeState as unknown as DurableObjectState, env);
    const reAuth = await openAndAuthSocket(wokeRoom, wokeState, p1Jwt, PC1_ID);
    const snap = reAuth.events[0]!;
    expect(snap.seq).toBe(currentSeq);
    if (snap.event.type === 'SYNC_SNAPSHOT') {
      expect(snap.event.snapshot.characters[PC1_ID]?.activeForm).toBe('crinos');
      expect(snap.event.snapshot.characters[PC1_ID]?.caughtInGauntlet).toBe(true);
    }
  });

  it('executes full W20 Reverse-Initiative Combat lifecycle end-to-end and hides NPC pre-init Rage from players', async () => {
    mockSupabaseForRoom();
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const stJwt = await mintJwtForUser(ST_DISCORD_ID, 'Storyteller', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p2Jwt = await mintJwtForUser(PLAYER2_DISCORD_ID, 'PlayerTwo', [GUILD_ID], env.SUPABASE_JWT_SECRET);

    const stConn = await openAndAuthSocket(room, state, stJwt, null);
    const p1Conn = await openAndAuthSocket(room, state, p1Jwt, PC1_ID);
    const p2Conn = await openAndAuthSocket(room, state, p2Jwt, PC2_ID);

    // ST starts encounter with PC1, PC2, and DB_NPC_ID
    await sendCommand(room, stConn.ws, 0, {
      type: 'COMBAT_START',
      participantCharacterIds: [PC1_ID, PC2_ID, DB_NPC_ID],
    });
    let stBatch = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    let p1Batch = p1Conn.ws.drainJson<ServerEnvelope<ServerEvent>>();
    p2Conn.ws.drainJson();
    let seq = stBatch[stBatch.length - 1]!.seq;

    const stCombatStart = stBatch.find((e) => e.event.type === 'COMBAT_STATE_UPDATED');
    expect(stCombatStart?.event.type).toBe('COMBAT_STATE_UPDATED');
    const p1CombatStart = p1Batch.find((e) => e.event.type === 'COMBAT_STATE_UPDATED');
    if (p1CombatStart?.event.type === 'COMBAT_STATE_UPDATED' && p1CombatStart.event.combat) {
      const npcCombatant = Object.values(p1CombatStart.event.combat.combatants).find(
        (c) => c.characterId === DB_NPC_ID,
      );
      expect(npcCombatant?.declaredRageActions).toBe('hidden');
    }

    const getCombatantId = (charId: string): string => {
      if (stCombatStart?.event.type === 'COMBAT_STATE_UPDATED' && stCombatStart.event.combat) {
        const entry = Object.values(stCombatStart.event.combat.combatants).find(
          (c) => c.characterId === charId,
        );
        return entry!.combatantId;
      }
      throw new Error('Missing combat start');
    };

    const pc1Cmb = getCombatantId(PC1_ID);
    const pc2Cmb = getCombatantId(PC2_ID);
    const npcCmb = getCombatantId(DB_NPC_ID);

    // Pre-init conflict check: both Rage & Gnosis MUST reject with RAGE_GNOSIS_CONFLICT
    await sendCommand(room, p1Conn.ws, seq, {
      type: 'COMBAT_DECLARE_PRE_INIT',
      combatantId: pc1Cmb,
      rageExtraActions: 1,
      spendGnosisSpiritOfFray: true,
      spendWillpowerIgnoreWounds: false,
    });
    p1Batch = p1Conn.ws.drainJson();
    expect(p1Batch[0]?.event.type).toBe('COMMAND_REJECTED');
    if (p1Batch[0]?.event.type === 'COMMAND_REJECTED') {
      expect(p1Batch[0].event.code).toBe('RAGE_GNOSIS_CONFLICT');
    }

    // Valid pre-init declarations
    await sendCommand(room, p1Conn.ws, seq, {
      type: 'COMBAT_DECLARE_PRE_INIT',
      combatantId: pc1Cmb,
      rageExtraActions: 1,
      spendGnosisSpiritOfFray: false,
      spendWillpowerIgnoreWounds: false,
    });
    seq = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>().pop()!.seq;
    p1Conn.ws.drainJson();
    p2Conn.ws.drainJson();

    await sendCommand(room, stConn.ws, seq, {
      type: 'COMBAT_DECLARE_PRE_INIT',
      combatantId: npcCmb,
      rageExtraActions: 1,
      spendGnosisSpiritOfFray: false,
      spendWillpowerIgnoreWounds: false,
    });
    seq = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>().pop()!.seq;
    p1Conn.ws.drainJson();
    p2Conn.ws.drainJson();

    await sendCommand(room, p2Conn.ws, seq, {
      type: 'COMBAT_DECLARE_PRE_INIT',
      combatantId: pc2Cmb,
      rageExtraActions: 0,
      spendGnosisSpiritOfFray: false,
      spendWillpowerIgnoreWounds: false,
    });
    seq = stConn.ws.drainJson<ServerEnvelope<ServerEvent>>().pop()!.seq;
    p1Conn.ws.drainJson();
    p2Conn.ws.drainJson();

    // ST rolls initiative -> moves to DECLARE_REVERSE
    await sendCommand(room, stConn.ws, seq, { type: 'COMBAT_ROLL_ALL_INITIATIVE' });
    stBatch = stConn.ws.drainJson();
    p1Conn.ws.drainJson();
    p2Conn.ws.drainJson();
    const afterInit = stBatch[stBatch.length - 1]!;
    seq = afterInit.seq;

    let combat =
      afterInit.event.type === 'COMBAT_STATE_UPDATED' ? afterInit.event.combat! : null;
    expect(combat?.phase).toBe('DECLARE_REVERSE');

    // Submit reverse declarations strictly in cursor order (ST submits cleanly on behalf of active cursor or owner)
    while (combat && combat.phase === 'DECLARE_REVERSE' && combat.activeCursorCombatantId) {
      const activeId = combat.activeCursorCombatantId;
      const targetId = activeId === npcCmb ? pc1Cmb : npcCmb;
      await sendCommand(room, stConn.ws, seq, {
        type: 'COMBAT_SUBMIT_DECLARATION',
        combatantId: activeId,
        declaration: {
          mode: 'single',
          slots: [
            {
              category: 'brawl_attack',
              label: 'Strike',
              targetCombatantId: targetId,
              attributeKey: 'strength',
              abilityKey: 'brawl',
              baseDifficulty: 6,
              damageType: 'lethal',
            },
          ],
        },
      });
      stBatch = stConn.ws.drainJson();
      p1Conn.ws.drainJson();
      p2Conn.ws.drainJson();
      const latest = stBatch[stBatch.length - 1]!;
      seq = latest.seq;
      if (latest.event.type === 'COMBAT_STATE_UPDATED') {
        combat = latest.event.combat;
      }
    }

    expect(combat?.phase).toBe('RESOLVE_NORMAL_PASS');

    // Execute turns and reactions until END_OF_ROUND
    let guard = 0;
    while (combat && combat.phase !== 'END_OF_ROUND' && guard < 20) {
      guard += 1;
      if (combat.phase === 'AWAITING_REACTION' && combat.pendingAttack) {
        await sendCommand(room, stConn.ws, seq, {
          type: 'COMBAT_SUBMIT_REACTION',
          defenderCombatantId: combat.pendingAttack.defenderCombatantId,
          reaction: { strategy: 'take_hit_soak_only' },
        });
      } else if (combat.activeCursorCombatantId) {
        await sendCommand(room, stConn.ws, seq, {
          type: 'COMBAT_EXECUTE_ACTIVE_TURN',
          combatantId: combat.activeCursorCombatantId,
        });
      }
      stBatch = stConn.ws.drainJson();
      p1Conn.ws.drainJson();
      p2Conn.ws.drainJson();
      const latest = stBatch[stBatch.length - 1]!;
      seq = latest.seq;
      if (latest.event.type === 'COMBAT_STATE_UPDATED') {
        combat = latest.event.combat;
      }
    }

    expect(combat?.phase).toBe('END_OF_ROUND');

    // Advance to Round 2 via COMBAT_NEXT_ROUND
    await sendCommand(room, stConn.ws, seq, { type: 'COMBAT_NEXT_ROUND' });
    stBatch = stConn.ws.drainJson();
    p1Conn.ws.drainJson();
    p2Conn.ws.drainJson();
    const round2Ev = stBatch[stBatch.length - 1]!;
    seq = round2Ev.seq;
    if (round2Ev.event.type === 'COMBAT_STATE_UPDATED') {
      expect(round2Ev.event.combat?.roundNumber).toBe(2);
      expect(round2Ev.event.combat?.phase).toBe('PRE_ROUND_RAGE');
    }

    // End combat cleanly
    await sendCommand(room, stConn.ws, seq, { type: 'COMBAT_END' });
    stBatch = stConn.ws.drainJson();
    const endEv = stBatch[stBatch.length - 1]!;
    expect(
      endEv.event.type === 'COMBAT_STATE_UPDATED' && endEv.event.combat === null,
    ).toBe(true);
  });

  it('shifts back to natural breed form instantaneously without roll or Rage spend even at 0 Rage', async () => {
    mockSupabaseForRoom();
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const { ws, events } = await openAndAuthSocket(room, state, p1Jwt, PC1_ID);
    let currentSeq = events[0]!.seq;

    // Shift to Crinos via roll_primal_urge (byte 7 -> d10 = 8 -> guaranteed success at diff 6)
    const getRandomSpy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
      if (arr instanceof Uint8Array) {
        arr.fill(7);
      }
      return arr;
    });
    await sendCommand(room, ws, currentSeq, {
      type: 'CHARACTER_SHIFT_FORM',
      characterId: PC1_ID,
      targetForm: 'crinos',
      method: 'roll_primal_urge',
    });
    getRandomSpy.mockRestore();

    let batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    currentSeq = batch[batch.length - 1]!.seq;
    expect(
      batch.some((e) => e.event.type === 'CHARACTER_PATCHED' && e.event.character.activeForm === 'crinos'),
    ).toBe(true);

    // Drain temporary Rage to 0 (also sets hasSpentRageThisTurn = true)
    await sendCommand(room, ws, currentSeq, {
      type: 'CHARACTER_UPDATE_TRACKER',
      characterId: PC1_ID,
      tracker: 'rage',
      delta: -5,
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    currentSeq = batch[batch.length - 1]!.seq;

    // Revert to natural breed form (Homid) — must succeed free with 0 Rage, even if instant_rage_spend requested
    await sendCommand(room, ws, currentSeq, {
      type: 'CHARACTER_SHIFT_FORM',
      characterId: PC1_ID,
      targetForm: 'homid',
      method: 'instant_rage_spend',
    });
    batch = ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(batch.some((e) => e.event.type === 'COMMAND_REJECTED')).toBe(false);
    expect(batch.some((e) => e.event.type === 'DICE_ROLLED_3D')).toBe(false);
    const patched = batch.find(
      (e): e is ServerEnvelope<Extract<ServerEvent, { type: 'CHARACTER_PATCHED' }>> =>
        e.event.type === 'CHARACTER_PATCHED',
    );
    expect(patched?.event.character.activeForm).toBe('homid');
    expect(patched?.event.character.rage.temporary).toBe(0);
  });

  it('supports zero-Supabase ad-hoc dice-room-* voice tables, physicalDiceValues, light trackers, and secret rolls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p2Jwt = await mintJwtForUser(PLAYER2_DISCORD_ID, 'PlayerTwo', [GUILD_ID], env.SUPABASE_JWT_SECRET);

    const connectVoice = async (jwt: string) => {
      const res = await room.fetch(
        new Request('https://vtt.example/ws/room/dice-room-voice-1', {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(res.status).toBe(101);
      const ws = state.acceptedSockets[state.acceptedSockets.length - 1]!;
      await sendCommand(room, ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: jwt,
        campaignId: 'dice-room-voice-1',
        characterId: null,
        lastSeenSeq: null,
      });
      return { ws, events: ws.drainJson<ServerEnvelope<ServerEvent>>() };
    };

    const p1 = await connectVoice(p1Jwt);
    const p2 = await connectVoice(p2Jwt);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(p1.events[0]?.event.type).toBe('SYNC_SNAPSHOT');
    const p1PartUpdate = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const joinEv = p1PartUpdate.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(joinEv?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (joinEv?.event.type === 'PARTICIPANTS_UPDATED') {
      expect(joinEv.event.participants).toHaveLength(2);
      expect(joinEv.event.participants.every((p) => p.isConnected)).toBe(true);
    }

    // Update P1 light trackers (concurrent/seq-independent)
    await sendCommand(room, p1.ws, 0, {
      type: 'UPDATE_LIGHT_TRACKERS',
      trackers: { rage: 6, woundPenalty: -1 },
    });
    const p1AfterTracker = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2AfterTracker = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const trEv = p2AfterTracker.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(p1AfterTracker.some((e) => e.event.type === 'PARTICIPANTS_UPDATED')).toBe(true);
    expect(trEv?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (trEv?.event.type === 'PARTICIPANTS_UPDATED') {
      const p1Info = trEv.event.participants.find((p) => p.discordUserId === PLAYER1_DISCORD_ID);
      expect(p1Info?.trackers).toEqual({ rage: 6, gnosis: 3, willpower: 5, woundPenalty: -1 });
    }

    // Public ROLL_TABLE_POOL with woundPenalty (-1 -> 4 dice), physicalDiceValues, Specialty 10, Willpower spend
    await sendCommand(room, p1.ws, 0, {
      type: 'ROLL_TABLE_POOL',
      pool: 5,
      rageDiceCount: 2,
      difficulty: 6,
      hasSpecialty: true,
      spendWillpower: true,
      applyWoundPenalty: true,
      label: 'Crinos Claws',
      isSecretRoll: false,
      physicalDiceValues: [10, 7, 5, 1],
      rollClientId: 'roll-client-1',
    });

    const p1RollEvents = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2RollEvents = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();

    const p2DiceEv = p2RollEvents.find((e) => e.event.type === 'DICE_ROLLED_3D');
    expect(p2DiceEv?.event.type).toBe('DICE_ROLLED_3D');
    if (p2DiceEv?.event.type === 'DICE_ROLLED_3D') {
      expect(p2DiceEv.event.roll.effectivePool).toBe(4);
      expect(p2DiceEv.event.roll.dice.map((d) => d.value)).toEqual([10, 7, 5, 1]);
      // 10(x2) + 7(x1) - 1(cancel) + 1(WP) = 3 net successes
      expect(p2DiceEv.event.roll.netSuccesses).toBe(3);
      expect(p2DiceEv.event.rageDiceCount).toBe(2);
      expect(p2DiceEv.event.rollClientId).toBe('roll-client-1');
      expect(p2DiceEv.event.historyEntry?.label).toBe('Crinos Claws');
    }

    // Willpower auto-decremented from 5 to 4
    const p1TrackersAfterWp = p1RollEvents.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(p1TrackersAfterWp?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (p1TrackersAfterWp?.event.type === 'PARTICIPANTS_UPDATED') {
      const p1Info = p1TrackersAfterWp.event.participants.find(
        (p) => p.discordUserId === PLAYER1_DISCORD_ID,
      );
      expect(p1Info?.trackers.willpower).toBe(4);
    }

    // Secret roll: ONLY P1 receives it; P2 gets zero events and secret is scrubbed on P2 reconnect
    await sendCommand(room, p1.ws, 0, {
      type: 'ROLL_TABLE_POOL',
      pool: 3,
      rageDiceCount: 0,
      difficulty: 6,
      hasSpecialty: false,
      spendWillpower: false,
      applyWoundPenalty: false,
      label: 'Hidden Wits',
      isSecretRoll: true,
      physicalDiceValues: [9, 8, 2],
      rollClientId: 'roll-secret-1',
    });

    const p1SecretEvents = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2SecretEvents = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(p1SecretEvents.some((e) => e.event.type === 'DICE_ROLLED_3D')).toBe(true);
    expect(p2SecretEvents).toHaveLength(0);

    const p2Reconnect = await connectVoice(p2Jwt);
    const p2Snap = p2Reconnect.events[0]!;
    expect(p2Snap.event.type).toBe('SYNC_SNAPSHOT');
    if (p2Snap.event.type === 'SYNC_SNAPSHOT') {
      expect(p2Snap.event.snapshot.rollHistory?.map((h) => h.label)).toEqual(['Crinos Claws']);
    }

    // Closing both P2 sockets marks P2 disconnected
    p1.ws.drainJson();
    await room.webSocketClose(p2.ws as unknown as WebSocket);
    await room.webSocketClose(p2Reconnect.ws as unknown as WebSocket);
    const p1AfterClose = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const dcEv = [...p1AfterClose].reverse().find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(dcEv?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (dcEv?.event.type === 'PARTICIPANTS_UPDATED') {
      const p2Info = dcEv.event.participants.find((p) => p.discordUserId === PLAYER2_DISCORD_ID);
      expect(p2Info?.isConnected).toBe(false);
    }
  });

  it('supports multi-seat same-screen presence via SYNC_CLIENT_SEATS, independent seat rolls/trackers, avatarUrl preservation, and multi-seat disconnect cleanup', async () => {
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const p1Avatar = 'https://cdn.discordapp.com/avatars/player-discord-1/avatar.png';
    const p1Jwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5(PLAYER1_DISCORD_ID),
          discordId: PLAYER1_DISCORD_ID,
          username: 'PlayerOne',
          globalName: 'PlayerOne',
          avatarUrl: p1Avatar,
          guildIds: [GUILD_ID],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;
    const p2Jwt = await mintJwtForUser(PLAYER2_DISCORD_ID, 'PlayerTwo', [GUILD_ID], env.SUPABASE_JWT_SECRET);

    const connectVoice = async (jwt: string) => {
      const res = await room.fetch(
        new Request('https://vtt.example/ws/room/dice-room-multiseat-1', {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(res.status).toBe(101);
      const ws = state.acceptedSockets[state.acceptedSockets.length - 1]!;
      await sendCommand(room, ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: jwt,
        campaignId: 'dice-room-multiseat-1',
        characterId: null,
        lastSeenSeq: null,
      });
      return { ws, events: ws.drainJson<ServerEnvelope<ServerEvent>>() };
    };

    const p1 = await connectVoice(p1Jwt);
    const p2 = await connectVoice(p2Jwt);
    p1.ws.drainJson();
    p2.ws.drainJson();

    // P1 registers 2 same-screen seats via SYNC_CLIENT_SEATS
    await sendCommand(room, p1.ws, 0, {
      type: 'SYNC_CLIENT_SEATS',
      seats: [
        {
          seatId: 'primary',
          displayName: 'Alex',
          characterName: 'Ash',
          activeForm: 'crinos',
          trackers: { rage: 5, gnosis: 2, willpower: 4, woundPenalty: -1 },
        },
        {
          seatId: 'seat-2',
          displayName: 'Jordan',
          characterName: 'Shadowfang',
          activeForm: 'lupus',
          trackers: { rage: 3, gnosis: 5, willpower: 6, woundPenalty: -2 },
        },
      ],
    });

    const p1SyncEvents = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2SyncEvents = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const syncPartEv = p2SyncEvents.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(p1SyncEvents.some((e) => e.event.type === 'PARTICIPANTS_UPDATED')).toBe(true);
    expect(syncPartEv?.event.type).toBe('PARTICIPANTS_UPDATED');

    if (syncPartEv?.event.type === 'PARTICIPANTS_UPDATED') {
      expect(syncPartEv.event.participants).toHaveLength(3);
      const primarySeat = syncPartEv.event.participants.find(
        (p) => p.participantKey === PLAYER1_DISCORD_ID,
      );
      const secondSeat = syncPartEv.event.participants.find(
        (p) => p.participantKey === `${PLAYER1_DISCORD_ID}::seat-2`,
      );
      expect(primarySeat).toMatchObject({
        participantKey: PLAYER1_DISCORD_ID,
        seatId: 'primary',
        discordUserId: PLAYER1_DISCORD_ID,
        displayName: 'Alex',
        characterName: 'Ash',
        activeForm: 'crinos',
        avatarUrl: p1Avatar,
        isConnected: true,
        trackers: { rage: 5, gnosis: 2, willpower: 4, woundPenalty: -1 },
      });
      expect(secondSeat).toMatchObject({
        participantKey: `${PLAYER1_DISCORD_ID}::seat-2`,
        seatId: 'seat-2',
        discordUserId: PLAYER1_DISCORD_ID,
        displayName: 'Jordan',
        characterName: 'Shadowfang',
        activeForm: 'lupus',
        isConnected: true,
        trackers: { rage: 3, gnosis: 5, willpower: 6, woundPenalty: -2 },
      });
    }

    // Update seat-2 light trackers independently without affecting primary
    await sendCommand(room, p1.ws, 0, {
      type: 'UPDATE_LIGHT_TRACKERS',
      seatId: 'seat-2',
      activeForm: 'hispo',
      trackers: { rage: 7 },
    });
    p1.ws.drainJson();
    const afterSeat2Tracker = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const trEv = afterSeat2Tracker.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    if (trEv?.event.type === 'PARTICIPANTS_UPDATED') {
      const seat1 = trEv.event.participants.find((p) => p.participantKey === PLAYER1_DISCORD_ID);
      const seat2 = trEv.event.participants.find(
        (p) => p.participantKey === `${PLAYER1_DISCORD_ID}::seat-2`,
      );
      expect(seat1?.trackers.rage).toBe(5);
      expect(seat1?.activeForm).toBe('crinos');
      expect(seat2?.trackers.rage).toBe(7);
      expect(seat2?.activeForm).toBe('hispo');
    }

    // Roll from seat-2 with applyWoundPenalty: true (-2) & spendWillpower: true -> decrements ONLY seat-2's willpower (6->5)
    await sendCommand(room, p1.ws, 0, {
      type: 'ROLL_TABLE_POOL',
      seatId: 'seat-2',
      pool: 6,
      rageDiceCount: 1,
      difficulty: 6,
      hasSpecialty: false,
      spendWillpower: true,
      applyWoundPenalty: true,
      label: 'Primal Bite',
      physicalDiceValues: [9, 8, 5, 4],
    });

    const p1Seat2Roll = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2Seat2Roll = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const diceEv = p2Seat2Roll.find((e) => e.event.type === 'DICE_ROLLED_3D');
    expect(diceEv?.event.type).toBe('DICE_ROLLED_3D');
    if (diceEv?.event.type === 'DICE_ROLLED_3D') {
      expect(diceEv.event.roll.effectivePool).toBe(4);
      expect(diceEv.event.rollerName).toBe('Shadowfang (Jordan)');
      expect(diceEv.event.historyEntry?.rollerName).toBe('Shadowfang (Jordan)');
    }

    const wpEv = p1Seat2Roll.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(wpEv?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (wpEv?.event.type === 'PARTICIPANTS_UPDATED') {
      const seat1 = wpEv.event.participants.find((p) => p.participantKey === PLAYER1_DISCORD_ID);
      const seat2 = wpEv.event.participants.find(
        (p) => p.participantKey === `${PLAYER1_DISCORD_ID}::seat-2`,
      );
      expect(seat1?.trackers.willpower).toBe(4);
      expect(seat2?.trackers.willpower).toBe(5);
    }

    // Explicit rollerDisplayName overrides formatted character/display name
    await sendCommand(room, p1.ws, 0, {
      type: 'ROLL_TABLE_POOL',
      seatId: 'primary',
      rollerDisplayName: 'Pack Leader Alex',
      pool: 3,
      rageDiceCount: 0,
      difficulty: 6,
      hasSpecialty: false,
      spendWillpower: false,
      applyWoundPenalty: false,
      label: 'Alertness',
      physicalDiceValues: [8, 7, 3],
    });
    const p2PrimaryRoll = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    p1.ws.drainJson();
    const primaryDiceEv = p2PrimaryRoll.find((e) => e.event.type === 'DICE_ROLLED_3D');
    if (primaryDiceEv?.event.type === 'DICE_ROLLED_3D') {
      expect(primaryDiceEv.event.rollerName).toBe('Pack Leader Alex');
    }

    // Initiative roll (1d10 + modifier): rolling a 1 never botches and Willpower is never spent
    await sendCommand(room, p1.ws, 0, {
      type: 'ROLL_TABLE_POOL',
      seatId: 'seat-2',
      pool: 1,
      rageDiceCount: 0,
      difficulty: 6,
      hasSpecialty: false,
      spendWillpower: true,
      applyWoundPenalty: true,
      rollMode: 'initiative',
      initiativeModifier: 7,
      label: 'Initiative',
      physicalDiceValues: [1],
    });
    const p1InitEvents = p1.ws.drainJson<ServerEnvelope<ServerEvent>>();
    p2.ws.drainJson();
    const initEv = p1InitEvents.find((e) => e.event.type === 'DICE_ROLLED_3D');
    expect(initEv?.event.type).toBe('DICE_ROLLED_3D');
    if (initEv?.event.type === 'DICE_ROLLED_3D') {
      expect(initEv.event.roll.rollMode).toBe('initiative');
      expect(initEv.event.roll.initiativeModifier).toBe(7);
      expect(initEv.event.roll.initiativeTotal).toBe(8);
      expect(initEv.event.roll.isBotch).toBe(false);
      expect(initEv.event.rageDiceCount).toBe(0);
    }
    expect(p1InitEvents.some((e) => e.event.type === 'PARTICIPANTS_UPDATED')).toBe(false);

    // Syncing again without seat-2 removes stale seat-2 while preserving primary avatarUrl and P2
    await sendCommand(room, p1.ws, 0, {
      type: 'SYNC_CLIENT_SEATS',
      seats: [
        {
          seatId: 'primary',
          displayName: 'Alex',
          characterName: 'Ash',
          activeForm: 'homid',
          trackers: { rage: 5, gnosis: 2, willpower: 4, woundPenalty: 0 },
        },
      ],
    });
    p1.ws.drainJson();
    const afterPrune = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const pruneEv = afterPrune.find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    if (pruneEv?.event.type === 'PARTICIPANTS_UPDATED') {
      expect(pruneEv.event.participants).toHaveLength(2);
      expect(
        pruneEv.event.participants.some((p) => p.participantKey === `${PLAYER1_DISCORD_ID}::seat-2`),
      ).toBe(false);
      const primarySeat = pruneEv.event.participants.find(
        (p) => p.participantKey === PLAYER1_DISCORD_ID,
      );
      expect(primarySeat?.avatarUrl).toBe(p1Avatar);
    }

    // Re-add seat-2, then disconnect P1 -> ALL P1 seats marked isConnected: false
    await sendCommand(room, p1.ws, 0, {
      type: 'SYNC_CLIENT_SEATS',
      seats: [
        {
          seatId: 'primary',
          displayName: 'Alex',
          characterName: 'Ash',
          activeForm: 'homid',
          trackers: { rage: 5, gnosis: 2, willpower: 4, woundPenalty: 0 },
        },
        {
          seatId: 'seat-2',
          displayName: 'Jordan',
          characterName: 'Shadowfang',
          activeForm: 'lupus',
          trackers: { rage: 3, gnosis: 5, willpower: 5, woundPenalty: 0 },
        },
      ],
    });
    p1.ws.drainJson();
    p2.ws.drainJson();

    await room.webSocketClose(p1.ws as unknown as WebSocket);
    const p2AfterDc = p2.ws.drainJson<ServerEnvelope<ServerEvent>>();
    const dcEv = [...p2AfterDc].reverse().find((e) => e.event.type === 'PARTICIPANTS_UPDATED');
    expect(dcEv?.event.type).toBe('PARTICIPANTS_UPDATED');
    if (dcEv?.event.type === 'PARTICIPANTS_UPDATED') {
      const p1Seats = dcEv.event.participants.filter((p) => p.discordUserId === PLAYER1_DISCORD_ID);
      expect(p1Seats).toHaveLength(2);
      expect(p1Seats.every((p) => p.isConnected === false)).toBe(true);
      const p2Seat = dcEv.event.participants.find((p) => p.discordUserId === PLAYER2_DISCORD_ID);
      expect(p2Seat?.isConnected).toBe(true);
    }
  });

  it('delivers all 4 simultaneous voice-table ROLL_TABLE_POOL bursts without drops or SEQ_MISMATCH', async () => {
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const playerIds = [
      'concurrent-p1',
      'concurrent-p2',
      'concurrent-p3',
      'concurrent-p4',
    ] as const;

    const conns: Array<{ discordId: string; jwt: string; ws: MockWebSocket }> = [];
    for (let idx = 0; idx < playerIds.length; idx += 1) {
      const discordId = playerIds[idx]!;
      const jwt = await mintJwtForUser(
        discordId,
        `Player${idx + 1}`,
        [GUILD_ID],
        env.SUPABASE_JWT_SECRET,
      );
      const res = await room.fetch(
        new Request('https://vtt.example/ws/room/dice-room-burst-4', {
          headers: { Upgrade: 'websocket' },
        }),
      );
      expect(res.status).toBe(101);
      const ws = state.acceptedSockets[state.acceptedSockets.length - 1]!;
      await sendCommand(room, ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: jwt,
        campaignId: 'dice-room-burst-4',
        characterId: null,
        lastSeenSeq: null,
      });
      conns.push({ discordId, jwt, ws });
    }
    expect(new Set(conns.map((c) => c.ws)).size).toBe(4);

    for (const c of conns) {
      c.ws.drainJson();
    }

    await Promise.all([
      sendCommand(room, conns[0]!.ws, 0, {
        type: 'ROLL_TABLE_POOL',
        pool: 5,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: false,
        label: 'P1 Perception',
        rollClientId: 'burst-1',
        physicalDiceValues: [9, 8, 5, 3, 2],
      }),
      sendCommand(room, conns[1]!.ws, 0, {
        type: 'ROLL_TABLE_POOL',
        pool: 4,
        rageDiceCount: 2,
        difficulty: 7,
        hasSpecialty: true,
        spendWillpower: false,
        applyWoundPenalty: false,
        label: 'P2 Rage Claw',
        rollClientId: 'burst-2',
        physicalDiceValues: [10, 7, 4, 2],
      }),
      sendCommand(room, conns[2]!.ws, 0, {
        type: 'ROLL_TABLE_POOL',
        pool: 3,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: true,
        applyWoundPenalty: false,
        label: 'P3 Willpower Resist',
        rollClientId: 'burst-3',
        physicalDiceValues: [8, 6, 3],
      }),
      sendCommand(room, conns[3]!.ws, 0, {
        type: 'ROLL_TABLE_POOL',
        pool: 1,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: false,
        rollMode: 'initiative',
        initiativeModifier: 6,
        label: 'P4 Initiative',
        rollClientId: 'burst-4',
        physicalDiceValues: [8],
      }),
    ]);

    const perSocketRolls = conns.map((c) => {
      const drained = c.ws.drainJson<ServerEnvelope<ServerEvent>>();
      expect(drained.some((e) => e.event.type === 'COMMAND_REJECTED')).toBe(false);
      return drained
        .filter((e) => e.event.type === 'DICE_ROLLED_3D')
        .map((e) => ({
          seq: e.seq,
          label: e.event.type === 'DICE_ROLLED_3D' ? e.event.label : '',
          rollClientId: e.event.type === 'DICE_ROLLED_3D' ? e.event.rollClientId : '',
        }));
    });

    const baselineOrder = perSocketRolls[0]!;
    expect(baselineOrder).toHaveLength(4);
    expect(baselineOrder.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    expect(new Set(baselineOrder.map((r) => r.rollClientId))).toEqual(
      new Set(['burst-1', 'burst-2', 'burst-3', 'burst-4']),
    );
    for (const rolls of perSocketRolls) {
      expect(rolls).toEqual(baselineOrder);
    }

    // Reconnecting viewer receives all 4 rolls in rollHistory
    const reRes = await room.fetch(
      new Request('https://vtt.example/ws/room/dice-room-burst-4', {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(reRes.status).toBe(101);
    const reWs = state.acceptedSockets[state.acceptedSockets.length - 1]!;
    await sendCommand(room, reWs, 0, {
      type: 'HELLO_AUTH',
      sessionJwt: conns[0]!.jwt,
      campaignId: 'dice-room-burst-4',
      characterId: null,
      lastSeenSeq: null,
    });
    const reSnap = reWs.drainJson<ServerEnvelope<ServerEvent>>()[0]!;
    expect(reSnap.event.type).toBe('SYNC_SNAPSHOT');
    if (reSnap.event.type === 'SYNC_SNAPSHOT') {
      expect(reSnap.event.snapshot.rollHistory).toHaveLength(4);
      expect(new Set(reSnap.event.snapshot.rollHistory?.map((h) => h.label))).toEqual(
        new Set(['P1 Perception', 'P2 Rage Claw', 'P3 Willpower Resist', 'P4 Initiative']),
      );
    }
  });

  it('allows simultaneous ROLL_FREEFORM_POOL commands from two campaign players with identical expectedSeq', async () => {
    const fetchSpy = mockSupabaseForRoom();
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);

    const p1Jwt = await mintJwtForUser(PLAYER1_DISCORD_ID, 'PlayerOne', [GUILD_ID], env.SUPABASE_JWT_SECRET);
    const p2Jwt = await mintJwtForUser(PLAYER2_DISCORD_ID, 'PlayerTwo', [GUILD_ID], env.SUPABASE_JWT_SECRET);

    const r1 = await room.fetch(
      new Request(`https://vtt.example/ws/room/${CAMPAIGN_ID}`, {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(r1.status).toBe(101);
    const p1Ws = state.acceptedSockets[0]!;

    const r2 = await room.fetch(
      new Request(`https://vtt.example/ws/room/${CAMPAIGN_ID}`, {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(r2.status).toBe(101);
    const p2Ws = state.acceptedSockets[1]!;

    await Promise.all([
      sendCommand(room, p1Ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: p1Jwt,
        campaignId: CAMPAIGN_ID,
        characterId: PC1_ID,
        lastSeenSeq: null,
      }),
      sendCommand(room, p2Ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: p2Jwt,
        campaignId: CAMPAIGN_ID,
        characterId: PC2_ID,
        lastSeenSeq: null,
      }),
    ]);
    // Concurrent cold HELLO_AUTH coalesced onto one Supabase hydration pass (campaigns + packs + characters = 3 fetches)
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const p1Hello = p1Ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2Hello = p2Ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(p1Hello[0]?.event.type).toBe('SYNC_SNAPSHOT');
    expect(p2Hello[0]?.event.type).toBe('SYNC_SNAPSHOT');

    const sharedSeq = p1Hello[0]!.seq;
    await Promise.all([
      sendCommand(room, p1Ws, sharedSeq, {
        type: 'ROLL_FREEFORM_POOL',
        characterId: PC1_ID,
        label: 'Kaelen Brawl',
        attributeKey: 'dexterity',
        abilityKey: 'brawl',
        difficulty: 6,
      }),
      sendCommand(room, p2Ws, sharedSeq, {
        type: 'ROLL_FREEFORM_POOL',
        characterId: PC2_ID,
        label: 'Whisper Alertness',
        attributeKey: 'perception',
        abilityKey: 'alertness',
        difficulty: 6,
      }),
    ]);

    const p1Drained = p1Ws.drainJson<ServerEnvelope<ServerEvent>>();
    const p2Drained = p2Ws.drainJson<ServerEnvelope<ServerEvent>>();
    expect(p1Drained.some((e) => e.event.type === 'COMMAND_REJECTED')).toBe(false);
    expect(p2Drained.some((e) => e.event.type === 'COMMAND_REJECTED')).toBe(false);

    const p1RollLabels = p1Drained
      .filter((e) => e.event.type === 'DICE_ROLLED_3D')
      .map((e) => (e.event.type === 'DICE_ROLLED_3D' ? e.event.label : ''));
    const p2RollLabels = p2Drained
      .filter((e) => e.event.type === 'DICE_ROLLED_3D')
      .map((e) => (e.event.type === 'DICE_ROLLED_3D' ? e.event.label : ''));

    expect(new Set(p1RollLabels)).toEqual(new Set(['Kaelen Brawl', 'Whisper Alertness']));
    expect(p2RollLabels).toEqual(p1RollLabels);
  });

  it('keeps a shared initiative order per seat: re-rolls replace, secret rolls stay out, anyone can clear', async () => {
    const env = createMockEnv();
    const state = new MockDurableObjectState();
    const room = new GameRoomDO(state as unknown as DurableObjectState, env);
    const ROOM = 'dice-room-initiative';

    const connect = async (discordId: string, name: string) => {
      const jwt = await mintJwtForUser(discordId, name, [GUILD_ID], env.SUPABASE_JWT_SECRET);
      const res = await room.fetch(
        new Request(`https://vtt.example/ws/room/${ROOM}`, { headers: { Upgrade: 'websocket' } }),
      );
      expect(res.status).toBe(101);
      const ws = state.acceptedSockets[state.acceptedSockets.length - 1]!;
      await sendCommand(room, ws, 0, {
        type: 'HELLO_AUTH',
        sessionJwt: jwt,
        campaignId: ROOM,
        characterId: null,
        lastSeenSeq: null,
      });
      return { ws, jwt };
    };

    const rollInit = (
      ws: MockWebSocket,
      die: number,
      modifier: number,
      extra: { seatId?: string; isSecretRoll?: boolean } = {},
    ) =>
      sendCommand(room, ws, 0, {
        type: 'ROLL_TABLE_POOL',
        pool: 1,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: false,
        rollMode: 'initiative',
        initiativeModifier: modifier,
        label: 'Initiative',
        physicalDiceValues: [die],
        ...extra,
      });

    const lastOrder = (ws: MockWebSocket) => {
      const updates = ws
        .drainJson<ServerEnvelope<ServerEvent>>()
        .filter((e) => e.event.type === 'TABLE_INITIATIVE_UPDATED');
      const last = updates[updates.length - 1];
      return last && last.event.type === 'TABLE_INITIATIVE_UPDATED' ? last.event.entries : null;
    };

    const p1 = await connect('init-p1', 'PlayerOne');
    const p2 = await connect('init-p2', 'PlayerTwo');
    p1.ws.drainJson();
    p2.ws.drainJson();

    // Two seats for player one, one for player two.
    await rollInit(p1.ws, 4, 5);
    await rollInit(p1.ws, 9, 2, { seatId: 'seat-b' });
    await rollInit(p2.ws, 6, 6);

    const afterThree = lastOrder(p2.ws);
    expect(afterThree?.map((e) => `${e.participantKey}=${e.total}`).sort()).toEqual(
      ['init-p1=9', 'init-p1::seat-b=11', 'init-p2=12'].sort(),
    );
    p1.ws.drainJson();

    // A re-roll replaces that seat's entry instead of adding another.
    await rollInit(p1.ws, 10, 5);
    const afterReroll = lastOrder(p2.ws);
    expect(afterReroll).toHaveLength(3);
    expect(afterReroll?.find((e) => e.participantKey === 'init-p1')?.total).toBe(15);
    p1.ws.drainJson();

    // A secret initiative roll changes nothing for anyone.
    await rollInit(p2.ws, 1, 0, { isSecretRoll: true });
    expect(lastOrder(p1.ws)).toBeNull();
    p2.ws.drainJson();

    // Someone joining later gets the order in their snapshot.
    const late = await connect('init-p3', 'PlayerThree');
    const snapshot = late.ws.drainJson<ServerEnvelope<ServerEvent>>()[0]!;
    expect(snapshot.event.type).toBe('SYNC_SNAPSHOT');
    if (snapshot.event.type === 'SYNC_SNAPSHOT') {
      expect(snapshot.event.snapshot.tableInitiative).toHaveLength(3);
    }
    p1.ws.drainJson();
    p2.ws.drainJson();

    // Any player can clear it, and everyone is told.
    await sendCommand(room, p2.ws, 0, { type: 'CLEAR_TABLE_INITIATIVE' });
    expect(lastOrder(p1.ws)).toEqual([]);
    expect(lastOrder(late.ws)).toEqual([]);
  });
});
