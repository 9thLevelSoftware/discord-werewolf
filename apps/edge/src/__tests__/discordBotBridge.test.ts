import { afterEach, describe, expect, it, vi } from 'vitest';
import type { W20RollResult } from '@w20-vtt/core';
import { handleDiscordInteraction } from '../discordBotBridge';
import type { GameRoomDO } from '../GameRoomDO';
import { createMockEnv } from './shims/cfTestHarness';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateEd25519TestPair(): Promise<{
  publicKeyHex: string;
  privateKey: CryptoKey;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(
    (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer,
  );
  return {
    publicKeyHex: bytesToHex(rawPub),
    privateKey: keyPair.privateKey,
  };
}

async function createSignedInteractionRequest(
  privateKey: CryptoKey,
  bodyObj: unknown,
  timestamp = '1732140000',
): Promise<Request> {
  const rawBody = JSON.stringify(bodyObj);
  const message = new TextEncoder().encode(`${timestamp}${rawBody}`);
  const sig = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, message));
  return new Request('https://vtt.example/api/discord-interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature-Ed25519': bytesToHex(sig),
      'X-Signature-Timestamp': timestamp,
    },
    body: rawBody,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discordBotBridge Ed25519 verification & /w20 commands', () => {
  it('rejects invalid Ed25519 signatures and responds to PING type 1', async () => {
    const { publicKeyHex, privateKey } = await generateEd25519TestPair();
    const env = createMockEnv({ DISCORD_PUBLIC_KEY: publicKeyHex });

    const invalidReq = new Request('https://vtt.example/api/discord-interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature-Ed25519': 'ff'.repeat(64),
        'X-Signature-Timestamp': '1732140000',
      },
      body: JSON.stringify({ id: '1', type: 1 }),
    });
    const invalidRes = await handleDiscordInteraction(invalidReq, env);
    expect(invalidRes.status).toBe(401);

    const validPingReq = await createSignedInteractionRequest(privateKey, { id: '2', type: 1 });
    const pingRes = await handleDiscordInteraction(validPingReq, env);
    expect(pingRes.status).toBe(200);
    expect(await pingRes.json()).toEqual({ type: 1 });
  });

  it('handles /w20 roll, verifies Ed25519 signature, and forwards broadcastSlashRoll RPC to GameRoomDO', async () => {
    const { publicKeyHex, privateKey } = await generateEd25519TestPair();
    const broadcastSlashRoll = vi.fn(
      async (_payload: {
        campaignId: string;
        rollerDiscordId: string;
        label: string;
        roll: W20RollResult;
      }) => ({ ok: true as const, seq: 1 }),
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/campaigns?discord_guild_id=eq.guild-umbra')) {
        return new Response(
          JSON.stringify([{ id: 'camp-123', discord_guild_id: 'guild-umbra' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('[]', { status: 200 });
    });

    const env = createMockEnv({
      DISCORD_PUBLIC_KEY: publicKeyHex,
      GAME_ROOM: {
        idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
        get: () => ({ broadcastSlashRoll } as unknown as DurableObjectStub<GameRoomDO>),
      } as unknown as DurableObjectNamespace<GameRoomDO>,
    });

    const rollReq = await createSignedInteractionRequest(privateKey, {
      id: 'int-roll-1',
      type: 2,
      guild_id: 'guild-umbra',
      member: { user: { id: 'player-99', username: 'garou' } },
      data: {
        name: 'w20',
        options: [
          {
            type: 1,
            name: 'roll',
            options: [
              { type: 4, name: 'pool', value: 6 },
              { type: 4, name: 'difficulty', value: 6 },
              { type: 3, name: 'label', value: 'Perception + Primal-Urge' },
              { type: 5, name: 'specialty', value: true },
              { type: 5, name: 'willpower', value: true },
            ],
          },
        ],
      },
    });

    const res = await handleDiscordInteraction(rollReq, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: number;
      data: { embeds: Array<{ title: string; description: string }> };
    };
    expect(body.type).toBe(4);
    expect(body.data.embeds[0]?.title).toContain('Perception + Primal-Urge');

    expect(broadcastSlashRoll).toHaveBeenCalledTimes(1);
    const rpcArg = broadcastSlashRoll.mock.calls[0]![0];
    expect(rpcArg.campaignId).toBe('camp-123');
    expect(rpcArg.rollerDiscordId).toBe('player-99');
    expect(rpcArg.roll.effectivePool).toBe(6);
    expect(rpcArg.roll.automaticSuccesses).toBe(1);
    expect(rpcArg.roll.dice).toHaveLength(6);
  });

  it('computes W20 XP costs accurately on /w20 xp-calc', async () => {
    const { publicKeyHex, privateKey } = await generateEd25519TestPair();
    const env = createMockEnv({ DISCORD_PUBLIC_KEY: publicKeyHex });

    const req = await createSignedInteractionRequest(privateKey, {
      id: 'int-xp-1',
      type: 2,
      member: { user: { id: 'player-1' } },
      data: {
        name: 'w20',
        options: [
          {
            type: 1,
            name: 'xp-calc',
            options: [
              { type: 3, name: 'category', value: 'attribute' },
              { type: 4, name: 'current_or_level', value: 3 },
            ],
          },
        ],
      },
    });

    const res = await handleDiscordInteraction(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: number;
      data: { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    };
    expect(body.type).toBe(4);
    expect(body.data.embeds[0]?.fields.find((f) => f.name === 'XP Cost')?.value).toContain('12 XP');
  });

  it('rejects SSRF webhook URLs and allows Storyteller /w20 npc-say webhook delivery', async () => {
    const { publicKeyHex, privateKey } = await generateEd25519TestPair();
    const env = createMockEnv({ DISCORD_PUBLIC_KEY: publicKeyHex });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/rest/v1/campaigns')) {
        return new Response(
          JSON.stringify([{ id: 'camp-1', storyteller_discord_id: 'st-user-1' }]),
          { status: 200 },
        );
      }
      if (url === 'https://discord.com/api/webhooks/111/secret') {
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected', { status: 500 });
    });

    const ssrfReq = await createSignedInteractionRequest(privateKey, {
      id: 'int-npc-bad',
      type: 2,
      guild_id: 'guild-1',
      member: { user: { id: 'st-user-1' } },
      data: {
        name: 'w20',
        options: [
          {
            type: 1,
            name: 'npc-say',
            options: [
              { type: 3, name: 'name', value: 'Bane' },
              { type: 3, name: 'dialogue', value: 'Hiss' },
              { type: 3, name: 'webhook_url', value: 'http://169.254.169.254/latest/meta-data' },
            ],
          },
        ],
      },
    });
    const ssrfRes = await handleDiscordInteraction(ssrfReq, env);
    const ssrfJson = (await ssrfRes.json()) as { data: { flags: number; content: string } };
    expect(ssrfJson.data.flags).toBe(64);
    expect(ssrfJson.data.content).toContain('valid HTTPS Discord webhook');

    const okReq = await createSignedInteractionRequest(privateKey, {
      id: 'int-npc-ok',
      type: 2,
      guild_id: 'guild-1',
      member: { user: { id: 'st-user-1' } },
      data: {
        name: 'w20',
        options: [
          {
            type: 1,
            name: 'npc-say',
            options: [
              { type: 3, name: 'name', value: 'Grandfather Thunder' },
              { type: 3, name: 'dialogue', value: 'Hold the bawn.' },
              { type: 3, name: 'webhook_url', value: 'https://discord.com/api/webhooks/111/secret' },
            ],
          },
        ],
      },
    });
    const okRes = await handleDiscordInteraction(okReq, env);
    const okJson = (await okRes.json()) as { data: { content: string } };
    expect(okJson.data.content).toContain('Grandfather Thunder');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/111/secret',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
