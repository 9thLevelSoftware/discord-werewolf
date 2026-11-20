import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discordIdToUuidV5,
  handleDiscordTokenExchange,
  handleDiscordTokenRefresh,
  mintAuthTokensForIdentity,
  signJwtHs256,
  verifyJwtHs256,
  verifySessionJwt,
} from '../discordOAuth';
import { createMockEnv } from './shims/cfTestHarness';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discordOAuth Web Crypto JWTs and Discord OAuth exchange', () => {
  it('derives deterministic RFC 4122 UUID v5 identifiers from Discord IDs', async () => {
    const a = await discordIdToUuidV5('123456789012345678');
    const b = await discordIdToUuidV5('123456789012345678');
    const c = await discordIdToUuidV5('999999999999999999');

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('mints, verifies, and rejects tampered or expired HS256 JWTs', async () => {
    const env = createMockEnv();
    const nowSec = 1_800_000_000;
    const sub = await discordIdToUuidV5('player-42');

    const { sessionJwt, supabaseJwt, expiresAt } = await mintAuthTokensForIdentity(
      {
        sub,
        discordId: 'player-42',
        username: 'silverclaw',
        globalName: 'Silver Claw',
        avatarUrl: 'https://cdn.discordapp.com/avatars/player-42/abc.png',
        guildIds: ['guild-1', 'guild-2'],
      },
      env.SUPABASE_JWT_SECRET,
      nowSec,
    );

    expect(expiresAt).toBe((nowSec + 3600) * 1000);

    const verifiedSession = await verifySessionJwt(sessionJwt, env.SUPABASE_JWT_SECRET, nowSec + 10);
    expect(verifiedSession).not.toBeNull();
    expect(verifiedSession?.discordId).toBe('player-42');
    expect(verifiedSession?.guildIds).toEqual(['guild-1', 'guild-2']);

    const verifiedSupabase = await verifyJwtHs256<Record<string, unknown>>(
      supabaseJwt,
      env.SUPABASE_JWT_SECRET,
      nowSec + 10,
    );
    expect(verifiedSupabase?.role).toBe('authenticated');
    expect(verifiedSupabase?.aud).toBe('authenticated');
    expect(verifiedSupabase?.sub).toBe(sub);
    expect(verifiedSupabase?.discord_id).toBe('player-42');
    expect(verifiedSupabase?.guild_ids).toEqual(['guild-1', 'guild-2']);

    // Expired JWT rejected
    expect(await verifySessionJwt(sessionJwt, env.SUPABASE_JWT_SECRET, nowSec + 3601)).toBeNull();

    // Tampered payload rejected
    const parts = sessionJwt.split('.');
    const tamperedPayload = btoa(
      JSON.stringify({
        typ: 'w20_session',
        sub,
        discordId: 'attacker',
        username: 'attacker',
        guildIds: ['guild-1'],
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(await verifySessionJwt(tampered, env.SUPABASE_JWT_SECRET, nowSec + 10)).toBeNull();

    // Wrong secret rejected
    expect(await verifySessionJwt(sessionJwt, 'wrong-secret', nowSec + 10)).toBeNull();

    // Passing supabaseJwt as a sessionJwt must fail typ check
    expect(await verifySessionJwt(supabaseJwt, env.SUPABASE_JWT_SECRET, nowSec + 10)).toBeNull();

    // alg: none attack rejected
    const algNoneHeader = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=+$/g, '');
    const unsigned = `${algNoneHeader}.${parts[1]}.`;
    expect(await verifyJwtHs256(unsigned, env.SUPABASE_JWT_SECRET, nowSec + 10)).toBeNull();
  });

  it('exchanges Discord OAuth code via /api/discord-token and refreshes via /api/discord-token/refresh', async () => {
    const env = createMockEnv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'https://discord.com/api/v10/oauth2/token') {
        return new Response(
          JSON.stringify({ access_token: 'discord-access-token-1', token_type: 'Bearer', expires_in: 604800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://discord.com/api/v10/users/@me') {
        return new Response(
          JSON.stringify({
            id: '222233334444',
            username: 'luna_theurge',
            global_name: 'Luna Theurge',
            avatar: 'hash_xyz',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://discord.com/api/v10/users/@me/guilds') {
        return new Response(
          JSON.stringify([{ id: 'guild-gaia' }, { id: 'guild-caern' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const badRedirectReq = new Request('https://vtt.example/api/discord-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code-1', redirectUri: 'https://evil.attacker.invalid/cb' }),
    });
    const badRes = await handleDiscordTokenExchange(badRedirectReq, env);
    expect(badRes.status).toBe(400);

    const exchangeReq = new Request('https://vtt.example/api/discord-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'auth-code-1' }),
    });
    const exchangeRes = await handleDiscordTokenExchange(exchangeReq, env);
    expect(exchangeRes.status).toBe(200);

    const payload = (await exchangeRes.json()) as {
      discordAccessToken: string;
      sessionJwt: string;
      supabaseJwt: string;
      expiresAt: number;
      user: { id: string; username: string; globalName: string | null; avatarUrl: string | null };
      guildIds: string[];
    };

    expect(payload.discordAccessToken).toBe('discord-access-token-1');
    expect(payload.user.id).toBe('222233334444');
    expect(payload.user.globalName).toBe('Luna Theurge');
    expect(payload.user.avatarUrl).toContain('hash_xyz.png');
    expect(payload.guildIds).toEqual(['guild-gaia', 'guild-caern']);

    const sessionClaims = await verifySessionJwt(payload.sessionJwt, env.SUPABASE_JWT_SECRET);
    expect(sessionClaims?.discordId).toBe('222233334444');

    const refreshReq = new Request('https://vtt.example/api/discord-token/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${payload.sessionJwt}` },
    });
    const refreshRes = await handleDiscordTokenRefresh(refreshReq, env);
    expect(refreshRes.status).toBe(200);
    const refreshed = (await refreshRes.json()) as {
      sessionJwt: string;
      supabaseJwt: string;
      expiresAt: number;
    };
    const refreshedClaims = await verifySessionJwt(refreshed.sessionJwt, env.SUPABASE_JWT_SECRET);
    expect(refreshedClaims?.discordId).toBe('222233334444');

    // Unsigned / expired token fails refresh
    const expiredJwt = await signJwtHs256(
      {
        typ: 'w20_session',
        sub: await discordIdToUuidV5('x'),
        discordId: 'x',
        username: 'x',
        guildIds: [],
        iat: 100,
        exp: 200,
      },
      env.SUPABASE_JWT_SECRET,
    );
    const expiredRefresh = await handleDiscordTokenRefresh(
      new Request('https://vtt.example/api/discord-token/refresh', {
        method: 'POST',
        headers: { Authorization: `Bearer ${expiredJwt}` },
      }),
      env,
    );
    expect(expiredRefresh.status).toBe(401);
  });
});
