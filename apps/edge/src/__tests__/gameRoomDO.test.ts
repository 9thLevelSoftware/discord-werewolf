import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientCommand, ClientEnvelope, ServerEnvelope, ServerEvent } from '@w20-vtt/protocol';
import { discordIdToUuidV5, mintAuthTokensForIdentity } from '../discordOAuth';
import { GameRoomDO } from '../GameRoomDO';
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

function mockSupabaseForRoom() {
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
          makeCharacterDbRow({ id: PC1_ID, owner_discord_id: PLAYER1_DISCORD_ID }),
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

describe('GameRoomDO authoritative W20 engine & projection security', () => {
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
});
