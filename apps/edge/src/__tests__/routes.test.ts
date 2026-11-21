import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatSyncCode,
  SYNC_CODE_ALPHABET,
  type W20CharacterCreationDraft,
  type W20CharacterState,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import { discordIdToUuidV5, mintAuthTokensForIdentity } from '../discordOAuth';
import type { GameRoomDO } from '../GameRoomDO';
import worker from '../index';
import { SupabaseRestClient, type UserCharacterSheetRow } from '../supabaseRest';
import { createMockEnv } from './shims/cfTestHarness';

const EXECUTION_CTX = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function makeValidCliathDraft(): W20CharacterCreationDraft {
  return {
    name: 'Talia Stormhowl',
    concept: 'Fianna Galliard',
    breed: 'homid',
    auspice: 'galliard',
    tribe: 'fianna',
    attributePriorities: { physical: 'primary', social: 'secondary', mental: 'tertiary' },
    abilityPriorities: { talents: 'primary', skills: 'secondary', knowledges: 'tertiary' },
    priorityAttributeDots: {
      strength: 2,
      dexterity: 3,
      stamina: 2,
      charisma: 3,
      manipulation: 1,
      appearance: 1,
      perception: 2,
      intelligence: 0,
      wits: 1,
    },
    priorityAbilityDots: {
      alertness: 3,
      athletics: 2,
      brawl: 3,
      empathy: 2,
      expression: 3,
      animal_ken: 2,
      etiquette: 2,
      melee: 2,
      performance: 3,
      enigmas: 2,
      occult: 2,
      rituals: 1,
    },
    priorityBackgroundDots: { allies: 2, totem: 3 },
    startingRenown: { glory: 2, honor: 0, wisdom: 1 },
    selectedGifts: [
      { giftId: 'gift-1', level: 1, slotSource: 'breed' },
      { giftId: 'gift-2', level: 1, slotSource: 'auspice' },
      { giftId: 'gift-3', level: 1, slotSource: 'tribe' },
    ],
    freebieAttributeDots: { stamina: 1 },
    freebieAbilityDots: { alertness: 1, brawl: 1 },
    freebieBackgroundDots: {},
    freebieRageDots: 0,
    freebieGnosisDots: 2,
    freebieWillpowerDots: 2,
    meritsAndFlaws: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Worker REST router, character creation validation, XP economy, and R2 media', () => {
  it('routes campaigns, scrubs NPCs for players on GET characters, validates & creates PCs on POST /api/characters', async () => {
    const applyApprovedXp = vi.fn(async () => ({ ok: true, seq: 2 }));
    const upsertCharacterFromApi = vi.fn(async () => ({ ok: true as const, seq: 3 }));

    const env = createMockEnv({
      GAME_ROOM: {
        idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
        get: () =>
          ({
            applyApprovedXp,
            upsertCharacterFromApi,
          }) as unknown as DurableObjectStub<GameRoomDO>,
      } as unknown as DurableObjectNamespace<GameRoomDO>,
    });

    const stJwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('st-1'),
          discordId: 'st-1',
          username: 'Storyteller',
          globalName: 'ST',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const playerJwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-1'),
          discordId: 'pl-1',
          username: 'Player',
          globalName: 'PL',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const captured: {
      inserted: Record<string, unknown> | null;
      patched: Record<string, unknown> | null;
    } = { inserted: null, patched: null };
    const ledgerRows = [{ delta: 10 }];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/campaigns?discord_guild_id=eq.guild-1')) {
        return new Response(
          JSON.stringify([{ id: 'camp-1', discord_guild_id: 'guild-1', storyteller_discord_id: 'st-1', name: 'Sept' }]),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/campaigns?id=eq.camp-1')) {
        return new Response(
          JSON.stringify([{ id: 'camp-1', discord_guild_id: 'guild-1', storyteller_discord_id: 'st-1', name: 'Sept' }]),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/characters?campaign_id=eq.camp-1')) {
        return new Response(
          JSON.stringify([
            {
              id: 'pc-1',
              campaign_id: 'camp-1',
              pack_id: null,
              owner_discord_id: 'pl-1',
              is_npc: false,
              name: 'Ash',
              breed: 'homid',
              auspice: 'ahroun',
              tribe: 'Get of Fenris',
              rank: 1,
              active_form: 'homid',
              active_realm: 'physical',
              caught_in_gauntlet: false,
              in_frenzy: false,
              frenzy_type: null,
              attr_strength: 3,
              attr_dexterity: 3,
              attr_stamina: 3,
              attr_charisma: 2,
              attr_manipulation: 2,
              attr_appearance: 2,
              attr_perception: 2,
              attr_intelligence: 2,
              attr_wits: 2,
              rage_perm: 5,
              rage_temp: 5,
              gnosis_perm: 1,
              gnosis_temp: 1,
              silver_carried_items: 0,
              willpower_perm: 3,
              willpower_temp: 3,
              renown_glory_perm: 2,
              renown_glory_temp: 0,
              renown_honor_perm: 1,
              renown_honor_temp: 0,
              renown_wisdom_perm: 0,
              renown_wisdom_temp: 0,
              bonus_bruised_boxes: 0,
              health_boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
              abilities: { brawl: 2 },
              specialties: [],
              backgrounds: {},
              merits_flaws: [],
              portraits_by_form: {},
              active_buffs: [],
              macros: [],
              state_version: 1,
              character_fetishes: [],
            },
            {
              id: 'npc-secret',
              campaign_id: 'camp-1',
              pack_id: null,
              owner_discord_id: 'st-1',
              is_npc: true,
              name: 'Secret Wyrm Elder',
              breed: 'metis',
              auspice: 'philodox',
              tribe: 'Black Spiral Dancers',
              rank: 5,
              metis_deformity: 'Two Heads',
              active_form: 'homid',
              active_realm: 'physical',
              caught_in_gauntlet: false,
              in_frenzy: false,
              frenzy_type: null,
              attr_strength: 5,
              attr_dexterity: 4,
              attr_stamina: 5,
              attr_charisma: 3,
              attr_manipulation: 4,
              attr_appearance: 1,
              attr_perception: 4,
              attr_intelligence: 4,
              attr_wits: 4,
              rage_perm: 7,
              rage_temp: 7,
              gnosis_perm: 6,
              gnosis_temp: 6,
              silver_carried_items: 0,
              willpower_perm: 8,
              willpower_temp: 8,
              renown_glory_perm: 0,
              renown_glory_temp: 0,
              renown_honor_perm: 0,
              renown_honor_temp: 0,
              renown_wisdom_perm: 0,
              renown_wisdom_temp: 0,
              bonus_bruised_boxes: 0,
              health_boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
              abilities: {},
              specialties: [],
              backgrounds: {},
              merits_flaws: [],
              portraits_by_form: {},
              active_buffs: [],
              macros: [],
              state_version: 1,
              character_fetishes: [],
            },
          ]),
          { status: 200 },
        );
      }
      if (url.endsWith('/rest/v1/characters') && init?.method === 'POST') {
        captured.inserted = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify([{ ...captured.inserted, character_fetishes: [] }]), {
          status: 201,
        });
      }
      if (url.endsWith('/rest/v1/character_gifts') && init?.method === 'POST') {
        return new Response('', { status: 201 });
      }
      if (url.includes('/rest/v1/characters?id=eq.pc-1')) {
        if (init?.method === 'PATCH') {
          captured.patched = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify([
            {
              id: 'pc-1',
              campaign_id: 'camp-1',
              pack_id: null,
              owner_discord_id: 'pl-1',
              is_npc: false,
              name: 'Ash',
              breed: 'homid',
              auspice: 'ahroun',
              tribe: 'Get of Fenris',
              rank: 1,
              active_form: 'homid',
              active_realm: 'physical',
              caught_in_gauntlet: false,
              in_frenzy: false,
              frenzy_type: null,
              attr_strength: 3,
              attr_dexterity: 3,
              attr_stamina: 3,
              attr_charisma: 2,
              attr_manipulation: 2,
              attr_appearance: 2,
              attr_perception: 2,
              attr_intelligence: 2,
              attr_wits: 2,
              rage_perm: 5,
              rage_temp: 5,
              gnosis_perm: 1,
              gnosis_temp: 1,
              silver_carried_items: 0,
              willpower_perm: 3,
              willpower_temp: 3,
              renown_glory_perm: 2,
              renown_glory_temp: 0,
              renown_honor_perm: 1,
              renown_honor_temp: 0,
              renown_wisdom_perm: 0,
              renown_wisdom_temp: 0,
              bonus_bruised_boxes: 0,
              health_boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
              abilities: { brawl: 2 },
              specialties: [],
              backgrounds: {},
              merits_flaws: [],
              portraits_by_form: {},
              active_buffs: [],
              macros: [],
              state_version: 1,
              character_fetishes: [],
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/xp_ledger?character_id=eq.pc-1')) {
        return new Response(JSON.stringify(ledgerRows), { status: 200 });
      }
      if (url.endsWith('/rest/v1/xp_ledger') && init?.method === 'POST') {
        const created = JSON.parse(String(init.body)) as { delta: number; reason: string; approved_by_discord_id: string };
        ledgerRows.push({ delta: created.delta });
        return new Response(
          JSON.stringify([{ id: 'xp-row-new', character_id: 'pc-1', created_at: new Date().toISOString(), ...created }]),
          { status: 201 },
        );
      }
      return new Response('[]', { status: 200 });
    });

    // Player GET characters scrubs NPC sheet
    const getCharsPlayerRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns/camp-1/characters', {
        headers: { Authorization: `Bearer ${playerJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(getCharsPlayerRes.status).toBe(200);
    const playerChars = ((await getCharsPlayerRes.json()) as { characters: W20CharacterState[] }).characters;
    expect(playerChars).toHaveLength(1);
    expect(playerChars[0]?.id).toBe('pc-1');

    // ST GET characters sees both PC and NPC
    const getCharsStRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns/camp-1/characters', {
        headers: { Authorization: `Bearer ${stJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    const stChars = ((await getCharsStRes.json()) as { characters: W20CharacterState[] }).characters;
    expect(stChars).toHaveLength(2);

    // Invalid character draft -> 400 with validation errors
    const badDraft = makeValidCliathDraft();
    badDraft.freebieWillpowerDots = 20; // overspends Freebies!
    const badCharRes = await worker.fetch(
      new Request('https://vtt.example/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerJwt}` },
        body: JSON.stringify({ campaignId: 'camp-1', draft: badDraft }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(badCharRes.status).toBe(400);

    // Valid Cliath draft -> 201 + inserts DB + notifies room RPC
    const validDraft = makeValidCliathDraft();
    const okCharRes = await worker.fetch(
      new Request('https://vtt.example/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerJwt}` },
        body: JSON.stringify({
          campaignId: 'camp-1',
          draft: validDraft,
          deedName: 'Sings-Before-Moonrise',
          selectedGiftIds: ['10000000-0000-0000-0000-000000000001'],
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(okCharRes.status).toBe(201);
    expect(captured.inserted?.name).toBe('Talia Stormhowl');
    expect(upsertCharacterFromApi).toHaveBeenCalledTimes(1);

    // XP Spend (Brawl 2 -> 3 costs 2 * 2 = 4 XP; player has 10 XP -> new balance 6)
    const spendRes = await worker.fetch(
      new Request('https://vtt.example/api/characters/pc-1/xp-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerJwt}` },
        body: JSON.stringify({ category: 'ability', targetKey: 'brawl' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(spendRes.status).toBe(200);
    const spendJson = (await spendRes.json()) as { cost: number; balance: number };
    expect(spendJson.cost).toBe(4);
    expect(spendJson.balance).toBe(6);
    expect((captured.patched?.abilities as Record<string, number>)?.brawl).toBe(3);
    expect(applyApprovedXp).toHaveBeenCalledTimes(1);

    // R2 asset upload (ST authorized for maps) & public stream fetch
    const putAssetRes = await worker.fetch(
      new Request('https://vtt.example/api/assets/maps/crypt.png?campaignId=camp-1', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${stJwt}`,
          'Content-Type': 'image/png',
        },
        body: new Uint8Array([137, 80, 78, 71]),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(putAssetRes.status).toBe(201);
    const putAssetJson = (await putAssetRes.json()) as { url: string };
    expect(putAssetJson.url).toMatch(/^\/r2-assets\/maps\/camp-1\/\d+-crypt\.png$/);

    const getAssetRes = await worker.fetch(
      new Request(`https://vtt.example${putAssetJson.url}`),
      env,
      EXECUTION_CTX,
    );
    expect(getAssetRes.status).toBe(200);
    expect(getAssetRes.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await getAssetRes.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('handles campaigns list/create, ST-only XP award, insufficient XP spend guard, WebSocket routing, and SPA fallback', async () => {
    const doFetch = vi.fn(async () => new Response('upgraded', { status: 200 }));
    const env = createMockEnv({
      GAME_ROOM: {
        idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
        get: () => ({ fetch: doFetch }) as unknown as DurableObjectStub<GameRoomDO>,
      } as unknown as DurableObjectNamespace<GameRoomDO>,
    });

    const stJwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('st-1'),
          discordId: 'st-1',
          username: 'Storyteller',
          globalName: 'ST',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const playerJwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-1'),
          discordId: 'pl-1',
          username: 'Player',
          globalName: 'PL',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const xpLedger = [{ id: 'xp-0', character_id: 'pc-1', delta: 2, reason: 'Start', approved_by_discord_id: 'st-1', created_at: '2026-11-20T00:00:00Z' }];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/campaigns?discord_guild_id=eq.guild-1')) {
        return new Response(
          JSON.stringify([{ id: 'camp-1', discord_guild_id: 'guild-1', storyteller_discord_id: 'st-1', name: 'Sept of Tears' }]),
          { status: 200 },
        );
      }
      if (url.endsWith('/rest/v1/campaigns') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify([{ id: 'camp-created', ...body }]), { status: 201 });
      }
      if (url.endsWith('/rest/v1/packs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(JSON.stringify([{ id: 'pack-created', ...body }]), { status: 201 });
      }
      if (url.includes('/rest/v1/campaigns?id=eq.camp-1')) {
        return new Response(
          JSON.stringify([{ id: 'camp-1', discord_guild_id: 'guild-1', storyteller_discord_id: 'st-1', name: 'Sept of Tears' }]),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/characters?id=eq.pc-1')) {
        return new Response(
          JSON.stringify([
            {
              id: 'pc-1',
              campaign_id: 'camp-1',
              pack_id: null,
              owner_discord_id: 'pl-1',
              is_npc: false,
              name: 'Ash',
              breed: 'homid',
              auspice: 'ahroun',
              tribe: 'get_of_fenris',
              rank: 1,
              active_form: 'homid',
              active_realm: 'physical',
              caught_in_gauntlet: false,
              in_frenzy: false,
              frenzy_type: null,
              attr_strength: 3,
              attr_dexterity: 3,
              attr_stamina: 3,
              attr_charisma: 2,
              attr_manipulation: 2,
              attr_appearance: 2,
              attr_perception: 2,
              attr_intelligence: 2,
              attr_wits: 2,
              rage_perm: 5,
              rage_temp: 5,
              gnosis_perm: 1,
              gnosis_temp: 1,
              silver_carried_items: 0,
              willpower_perm: 3,
              willpower_temp: 3,
              renown_glory_perm: 2,
              renown_glory_temp: 0,
              renown_honor_perm: 1,
              renown_honor_temp: 0,
              renown_wisdom_perm: 0,
              renown_wisdom_temp: 0,
              bonus_bruised_boxes: 0,
              health_boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
              abilities: { brawl: 2 },
              specialties: [],
              backgrounds: {},
              merits_flaws: [],
              portraits_by_form: {},
              active_buffs: [],
              macros: [],
              state_version: 1,
              character_fetishes: [],
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/xp_ledger?character_id=eq.pc-1')) {
        return new Response(JSON.stringify(xpLedger), { status: 200 });
      }
      if (url.endsWith('/rest/v1/xp_ledger') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          character_id: string;
          delta: number;
          reason: string;
          approved_by_discord_id: string;
        };
        const row = { id: `xp-${xpLedger.length}`, created_at: '2026-11-20T01:00:00Z', ...body };
        xpLedger.push(row);
        return new Response(JSON.stringify([row]), { status: 201 });
      }
      return new Response('[]', { status: 200 });
    });

    // Wrong guild forbidden on GET /api/campaigns
    const wrongGuildRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns?guildId=other-guild', {
        headers: { Authorization: `Bearer ${playerJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(wrongGuildRes.status).toBe(403);

    // List campaigns
    const listRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns?guildId=guild-1', {
        headers: { Authorization: `Bearer ${playerJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(listRes.status).toBe(200);

    // Create campaign + pack with caller as Storyteller
    const createCampRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stJwt}` },
        body: JSON.stringify({
          guildId: 'guild-1',
          name: 'Manhattan Under Siege',
          moonPhase: 'full',
          localGauntlet: 7,
          pack: { name: 'Silver Claws', totemName: 'Falcon', willpowerMax: 6 },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(createCampRes.status).toBe(201);
    const createdCampJson = (await createCampRes.json()) as {
      campaign: { storyteller_discord_id: string };
      pack: { totem_name: string };
    };
    expect(createdCampJson.campaign.storyteller_discord_id).toBe('st-1');
    expect(createdCampJson.pack.totem_name).toBe('Falcon');

    // Non-ST cannot award XP
    const playerAwardRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns/camp-1/xp-award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerJwt}` },
        body: JSON.stringify({ characterId: 'pc-1', delta: 5, reason: 'Cheat' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(playerAwardRes.status).toBe(403);

    // Insufficient XP spend rejected (Brawl 2->3 needs 4, current is 2)
    const lowXpSpend = await worker.fetch(
      new Request('https://vtt.example/api/characters/pc-1/xp-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerJwt}` },
        body: JSON.stringify({ category: 'ability', targetKey: 'brawl' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(lowXpSpend.status).toBe(400);

    // ST awards +5 XP -> balance 7
    const stAwardRes = await worker.fetch(
      new Request('https://vtt.example/api/campaigns/camp-1/xp-award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stJwt}` },
        body: JSON.stringify({ characterId: 'pc-1', delta: 5, reason: 'Session 1 survival' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(stAwardRes.status).toBe(201);
    expect(((await stAwardRes.json()) as { balance: number }).balance).toBe(7);

    // XP ledger route
    const ledgerRes = await worker.fetch(
      new Request('https://vtt.example/api/characters/pc-1/xp-ledger', {
        headers: { Authorization: `Bearer ${playerJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(ledgerRes.status).toBe(200);
    expect(((await ledgerRes.json()) as { balance: number }).balance).toBe(7);

    // WebSocket room routing requires Upgrade header
    const noUpgrade = await worker.fetch(
      new Request('https://vtt.example/ws/room/camp-1'),
      env,
      EXECUTION_CTX,
    );
    expect(noUpgrade.status).toBe(426);

    await worker.fetch(
      new Request('https://vtt.example/ws/room/camp-1', { headers: { Upgrade: 'websocket' } }),
      env,
      EXECUTION_CTX,
    );
    expect(doFetch).toHaveBeenCalledTimes(1);

    // SPA asset fallback
    const spaRes = await worker.fetch(
      new Request('https://vtt.example/app/play'),
      env,
      EXECUTION_CTX,
    );
    expect(spaRes.status).toBe(200);
    expect(await spaRes.text()).toContain('spa');
  });

  it('omits Bearer Authorization header for sb_secret_ keys while keeping it for legacy JWT service_role keys', async () => {
    const capturedHeaders: Array<{ apikey: string | null; authorization: string | null }> = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      capturedHeaders.push({
        apikey: headers.get('apikey'),
        authorization: headers.get('Authorization'),
      });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const modernClient = new SupabaseRestClient({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_key_value',
    });
    await modernClient.listCampaignsByGuild('guild-1');

    const legacyClient = new SupabaseRestClient({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy',
    });
    await legacyClient.listCampaignsByGuild('guild-1');

    expect(capturedHeaders[0]).toEqual({
      apikey: 'sb_secret_test_key_value',
      authorization: null,
    });
    expect(capturedHeaders[1]).toEqual({
      apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy',
    });
  });

  it('supports standalone user character sheets CRUD via Supabase, guided/freeform validation, ownership 403, and ISO<->epoch ms conversion', async () => {
    const env = createMockEnv();
    const p1Jwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-1'),
          discordId: 'pl-1',
          username: 'PlayerOne',
          globalName: 'Player One',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const p2Jwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-2'),
          discordId: 'pl-2',
          username: 'PlayerTwo',
          globalName: 'Player Two',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const dbRows = new Map<string, UserCharacterSheetRow>();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const parsedUrl = new URL(url);

      if (parsedUrl.pathname === '/rest/v1/user_character_sheets') {
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          const ownerEq = parsedUrl.searchParams.get('owner_discord_id');
          const idEq = parsedUrl.searchParams.get('id');
          const syncEq = parsedUrl.searchParams.get('sync_code');

          let matches = Array.from(dbRows.values());
          if (ownerEq?.startsWith('eq.')) {
            const owner = ownerEq.slice(3);
            matches = matches.filter((r) => r.owner_discord_id === owner);
          }
          if (idEq?.startsWith('eq.')) {
            const id = idEq.slice(3);
            matches = matches.filter((r) => r.id === id);
          }
          if (syncEq?.startsWith('eq.')) {
            const code = syncEq.slice(3);
            matches = matches.filter((r) => r.sync_code === code);
          }
          matches.sort((a, b) => Date.parse(b.last_used_at) - Date.parse(a.last_used_at));
          return new Response(JSON.stringify(matches), { status: 200 });
        }

        if (method === 'POST') {
          const row = JSON.parse(String(init?.body)) as UserCharacterSheetRow;
          dbRows.set(row.id, row);
          return new Response(JSON.stringify([row]), { status: 201 });
        }

        if (method === 'PATCH') {
          const idEq = parsedUrl.searchParams.get('id');
          const id = idEq?.startsWith('eq.') ? idEq.slice(3) : '';
          const existing = dbRows.get(id);
          if (!existing) {
            return new Response('[]', { status: 200 });
          }
          const patch = JSON.parse(String(init?.body)) as Partial<UserCharacterSheetRow>;
          const updated: UserCharacterSheetRow = { ...existing, ...patch };
          dbRows.set(id, updated);
          return new Response(JSON.stringify([updated]), { status: 200 });
        }

        if (method === 'DELETE') {
          const idEq = parsedUrl.searchParams.get('id');
          const id = idEq?.startsWith('eq.') ? idEq.slice(3) : '';
          dbRows.delete(id);
          return new Response(null, { status: 204 });
        }
      }

      return new Response('[]', { status: 200 });
    });

    // Unauthenticated request rejected with 401
    const unauthRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets'),
      env,
      EXECUTION_CTX,
    );
    expect(unauthRes.status).toBe(401);

    // Invalid guided draft rejected with 400
    const badDraft = makeValidCliathDraft();
    badDraft.freebieWillpowerDots = 25;
    const badGuidedRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({ mode: 'guided', draft: badDraft }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(badGuidedRes.status).toBe(400);

    // Valid guided draft -> 201 + forced ownerDiscordId
    const validDraft = makeValidCliathDraft();
    const guidedRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({
          mode: 'guided',
          draft: validDraft,
          player: 'Alex',
          chronicle: 'Manhattan',
          deedName: 'Moon-Singer',
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(guidedRes.status).toBe(201);
    const guidedBody = (await guidedRes.json()) as { sheet: W20UserCharacterSheet };
    expect(guidedBody.sheet.ownerDiscordId).toBe('pl-1');
    expect(guidedBody.sheet.player).toBe('Alex');
    expect(guidedBody.sheet.deedName).toBe('Moon-Singer');
    expect(typeof guidedBody.sheet.createdAt).toBe('number');
    expect(typeof guidedBody.sheet.lastUsedAt).toBe('number');
    const savedRow = dbRows.get(guidedBody.sheet.id)!;
    expect(typeof savedRow.created_at).toBe('string');
    expect(Number.isFinite(Date.parse(savedRow.created_at))).toBe(true);

    // Invalid freeform sheet rejected with 400
    const badFreeformRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({
          mode: 'freeform',
          sheet: { name: 'Overpowered', baseAttributes: { strength: 99 } },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(badFreeformRes.status).toBe(400);

    // Valid freeform sheet merges onto blank sheet and forces ownerDiscordId
    const freeformRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({
          mode: 'freeform',
          sheet: {
            id: 'spoofed-id',
            ownerDiscordId: 'pl-2',
            syncCode: 'SPOOFED1',
            name: 'Ashclaw',
            breed: 'lupus',
            auspice: 'ahroun',
            tribe: 'red_talons',
          },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(freeformRes.status).toBe(201);
    const freeformBody = (await freeformRes.json()) as { sheet: W20UserCharacterSheet };
    expect(freeformBody.sheet.id).not.toBe('spoofed-id');
    expect(freeformBody.sheet.ownerDiscordId).toBe('pl-1');
    expect(freeformBody.sheet.syncCode).toBeNull();
    expect(freeformBody.sheet.activeForm).toBe('lupus');
    expect(freeformBody.sheet.rage.permanent).toBe(5);
    expect(freeformBody.sheet.gnosis.permanent).toBe(5);

    // GET /api/me/character-sheets returns p1's sheets (and none for p2)
    const p1ListRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(p1ListRes.status).toBe(200);
    const p1List = (await p1ListRes.json()) as { sheets: W20UserCharacterSheet[] };
    expect(p1List.sheets).toHaveLength(2);

    // Player 2 cannot PUT or DELETE Player 1's sheet -> 403
    const p2PutRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${guidedBody.sheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ sheet: guidedBody.sheet }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(p2PutRes.status).toBe(403);

    const p2DeleteRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${guidedBody.sheet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${p2Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(p2DeleteRes.status).toBe(403);

    // Missing sheet -> 404
    const missingPutRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets/00000000-0000-4000-8000-000000000999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({ sheet: guidedBody.sheet }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(missingPutRes.status).toBe(404);

    // Owner PUT preserves id, ownerDiscordId, syncCode and updates name & timestamps
    const putRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${guidedBody.sheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({
          sheet: {
            ...guidedBody.sheet,
            id: 'other-id',
            ownerDiscordId: 'other-owner',
            syncCode: 'BADCODE1',
            name: 'Talia Updated',
            activeForm: 'crinos',
          },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { sheet: W20UserCharacterSheet };
    expect(putBody.sheet.id).toBe(guidedBody.sheet.id);
    expect(putBody.sheet.ownerDiscordId).toBe('pl-1');
    expect(putBody.sheet.syncCode).toBeNull();
    expect(putBody.sheet.name).toBe('Talia Updated');
    expect(putBody.sheet.activeForm).toBe('crinos');

    // Owner DELETE -> 200 { ok: true }
    const delRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${freeformBody.sheet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(delRes.status).toBe(200);
    expect(await delRes.json()).toEqual({ ok: true });
    expect(dbRows.has(freeformBody.sheet.id)).toBe(false);
  });

  it('falls back transparently to private R2 storage on Supabase 404 PGRST205, blocks /r2-assets/private/*, and handles 8-char sync code lifecycle', async () => {
    const env = createMockEnv();
    const p1Jwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-1'),
          discordId: 'pl-1',
          username: 'PlayerOne',
          globalName: 'Player One',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    const p2Jwt = (
      await mintAuthTokensForIdentity(
        {
          sub: await discordIdToUuidV5('pl-2'),
          discordId: 'pl-2',
          username: 'PlayerTwo',
          globalName: 'Player Two',
          avatarUrl: null,
          guildIds: ['guild-1'],
        },
        env.SUPABASE_JWT_SECRET,
      )
    ).sessionJwt;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/user_character_sheets')) {
        return new Response(
          JSON.stringify({
            code: 'PGRST205',
            message: "Could not find the table 'public.user_character_sheets' in the schema cache",
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('[]', { status: 200 });
    });

    // Create sheet via R2 fallback
    const createRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({
          mode: 'freeform',
          sheet: {
            name: 'R2 Fallback Garou',
            breed: 'homid',
            auspice: 'theurge',
            tribe: 'uktena',
          },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(createRes.status).toBe(201);
    const createdSheet = ((await createRes.json()) as { sheet: W20UserCharacterSheet }).sheet;

    // Verify private R2 keys exist and CANNOT be fetched via /r2-assets/private/*
    const rawR2Obj = await env.VTT_MEDIA_BUCKET.get(`private/character-sheets/sheets/${createdSheet.id}.json`);
    expect(rawR2Obj).not.toBeNull();

    const leakedGetRes = await worker.fetch(
      new Request(`https://vtt.example/r2-assets/private/character-sheets/sheets/${createdSheet.id}.json`),
      env,
      EXECUTION_CTX,
    );
    expect(leakedGetRes.status).toBe(404);

    const leakedEncodedRes = await worker.fetch(
      new Request(`https://vtt.example/r2-assets/%70rivate/character-sheets/sheets/${createdSheet.id}.json`),
      env,
      EXECUTION_CTX,
    );
    expect(leakedEncodedRes.status).toBe(404);

    // List sheets from R2
    const listRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { sheets: W20UserCharacterSheet[] };
    expect(listJson.sheets.map((s) => s.id)).toEqual([createdSheet.id]);

    // Seed a second sheet owned by p2 with a known syncCode to test collision retry
    const p2CreateRes = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({
          mode: 'freeform',
          sheet: { name: 'P2 Garou' },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    const p2Sheet = ((await p2CreateRes.json()) as { sheet: W20UserCharacterSheet }).sheet;
    const p2SyncRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${p2Sheet.id}/sync-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p2Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    const p2Code = ((await p2SyncRes.json()) as { syncCode: string }).syncCode;

    // Force first random draw to collide with p2Code, second draw to produce a fresh code
    const origGetRandomValues = crypto.getRandomValues.bind(crypto);
    let drawCount = 0;
    const p2CodeBytes = new Uint8Array(
      p2Code.split('').map((ch) => SYNC_CODE_ALPHABET.indexOf(ch)),
    );
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((arr) => {
      if (arr instanceof Uint8Array && arr.length === 8) {
        drawCount += 1;
        if (drawCount === 1) {
          arr.set(p2CodeBytes);
          return arr;
        }
        arr.fill(1); // 'BBBBBBBB'
        return arr;
      }
      return origGetRandomValues(arr);
    });

    const p1SyncRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${createdSheet.id}/sync-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    vi.restoreAllMocks();
    // Re-mock Supabase 404 after restoreAllMocks
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/user_character_sheets')) {
        return new Response(
          JSON.stringify({ code: 'PGRST205', message: 'Missing user_character_sheets' }),
          { status: 404 },
        );
      }
      return new Response('[]', { status: 200 });
    });

    expect(p1SyncRes.status).toBe(200);
    const p1SyncJson = (await p1SyncRes.json()) as {
      syncCode: string;
      formattedSyncCode: string;
      sheet: W20UserCharacterSheet;
    };
    expect(drawCount).toBe(2);
    expect(p1SyncJson.syncCode).toBe('BBBBBBBB');
    expect(p1SyncJson.syncCode).not.toBe(p2Code);
    expect(p1SyncJson.formattedSyncCode).toBe(formatSyncCode('BBBBBBBB'));
    expect(p1SyncJson.sheet.syncCode).toBe('BBBBBBBB');

    // Invalid sync code format -> 400
    const invalidResolveRes = await worker.fetch(
      new Request('https://vtt.example/api/character-sheets/sync-code/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ syncCode: 'BAD' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(invalidResolveRes.status).toBe(400);

    // Unknown valid-format sync code -> 404
    const missingResolveRes = await worker.fetch(
      new Request('https://vtt.example/api/character-sheets/sync-code/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ syncCode: 'ZZZZ-ZZZZ' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(missingResolveRes.status).toBe(404);

    // Cross-account resolve via lowercase/hyphenated code
    const resolveRes = await worker.fetch(
      new Request('https://vtt.example/api/character-sheets/sync-code/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ syncCode: 'bbbb-bbbb' }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(resolveRes.status).toBe(200);
    const resolvedJson = (await resolveRes.json()) as {
      sheet: W20UserCharacterSheet;
      syncCode: string;
      formattedSyncCode: string;
    };
    expect(resolvedJson.sheet.id).toBe(createdSheet.id);
    expect(resolvedJson.syncCode).toBe('BBBBBBBB');
    expect(resolvedJson.formattedSyncCode).toBe('BBBB-BBBB');

    // Cross-account update via PUT /api/character-sheets/by-sync-code/:code preserves id, ownerDiscordId, syncCode
    const syncPutRes = await worker.fetch(
      new Request('https://vtt.example/api/character-sheets/by-sync-code/bbbb-bbbb', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({
          sheet: {
            ...resolvedJson.sheet,
            id: 'hijack-id',
            ownerDiscordId: 'pl-2',
            syncCode: 'HIJACKED',
            name: 'Synced From Second Screen',
            rage: { permanent: 4, temporary: 2 },
          },
        }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(syncPutRes.status).toBe(200);
    const syncPutJson = (await syncPutRes.json()) as { sheet: W20UserCharacterSheet };
    expect(syncPutJson.sheet.id).toBe(createdSheet.id);
    expect(syncPutJson.sheet.ownerDiscordId).toBe('pl-1');
    expect(syncPutJson.sheet.syncCode).toBe('BBBBBBBB');
    expect(syncPutJson.sheet.name).toBe('Synced From Second Screen');
    expect(syncPutJson.sheet.rage.temporary).toBe(2);

    // Regenerate sync code replaces old R2 sync index entry
    const regenRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${createdSheet.id}/sync-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(regenRes.status).toBe(200);
    const regenJson = (await regenRes.json()) as { syncCode: string; sheet: W20UserCharacterSheet };
    expect(regenJson.syncCode).not.toBe('BBBBBBBB');
    expect(await env.VTT_MEDIA_BUCKET.get('private/character-sheets/sync/BBBBBBBB.json')).toBeNull();
    expect(
      await env.VTT_MEDIA_BUCKET.get(`private/character-sheets/sync/${regenJson.syncCode}.json`),
    ).not.toBeNull();

    // Revoke sync code cleans R2 sync index and returns 404 on subsequent resolve/PUT
    const revokeRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${createdSheet.id}/sync-code`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(revokeRes.status).toBe(200);
    const revokeJson = (await revokeRes.json()) as { ok: boolean; sheet: W20UserCharacterSheet };
    expect(revokeJson.ok).toBe(true);
    expect(revokeJson.sheet.syncCode).toBeNull();
    expect(
      await env.VTT_MEDIA_BUCKET.get(`private/character-sheets/sync/${regenJson.syncCode}.json`),
    ).toBeNull();

    const postRevokeResolve = await worker.fetch(
      new Request('https://vtt.example/api/character-sheets/sync-code/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ syncCode: regenJson.syncCode }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(postRevokeResolve.status).toBe(404);

    const postRevokePut = await worker.fetch(
      new Request(`https://vtt.example/api/character-sheets/by-sync-code/${regenJson.syncCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Jwt}` },
        body: JSON.stringify({ sheet: regenJson.sheet }),
      }),
      env,
      EXECUTION_CTX,
    );
    expect(postRevokePut.status).toBe(404);

    // Delete sheet cleans R2 sheet and owner index entries
    const deleteRes = await worker.fetch(
      new Request(`https://vtt.example/api/me/character-sheets/${createdSheet.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(deleteRes.status).toBe(200);
    expect(
      await env.VTT_MEDIA_BUCKET.get(`private/character-sheets/sheets/${createdSheet.id}.json`),
    ).toBeNull();
    expect(
      await env.VTT_MEDIA_BUCKET.get(
        `private/character-sheets/owners/pl-1/${createdSheet.id}.json`,
      ),
    ).toBeNull();

    // Unconfigured Supabase uses R2 directly without making any network fetch
    vi.restoreAllMocks();
    const unconfiguredFetchSpy = vi.spyOn(globalThis, 'fetch');
    const noSupaEnv = createMockEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
    const noSupaPost = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Jwt}` },
        body: JSON.stringify({ mode: 'freeform', sheet: { name: 'Offline R2 Garou' } }),
      }),
      noSupaEnv,
      EXECUTION_CTX,
    );
    expect(noSupaPost.status).toBe(201);
    const noSupaList = await worker.fetch(
      new Request('https://vtt.example/api/me/character-sheets', {
        headers: { Authorization: `Bearer ${p1Jwt}` },
      }),
      noSupaEnv,
      EXECUTION_CTX,
    );
    expect(noSupaList.status).toBe(200);
    expect(((await noSupaList.json()) as { sheets: W20UserCharacterSheet[] }).sheets).toHaveLength(1);
    expect(unconfiguredFetchSpy).not.toHaveBeenCalled();
  });
});
