import { calculateW20XpCost, resolveW20DicePool, type XpSpendCategory } from '@w20-vtt/core';
import { errorResponse, jsonResponse, type WorkerEnv } from './env';
import { SupabaseRestClient } from './supabaseRest';

const TEXT_ENCODER = new TextEncoder();

interface DiscordOptionNode {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordOptionNode[];
}

interface DiscordInteractionPayload {
  id: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: { id: string; username?: string };
    permissions?: string;
  };
  user?: { id: string; username?: string };
  data?: {
    name?: string;
    options?: DiscordOptionNode[];
  };
}

function toExactArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(input.byteLength));
  copy.set(input);
  return copy;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return null;
  }
  const out = new Uint8Array(new ArrayBuffer(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function verifyDiscordEd25519Signature(params: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  rawBody: string;
}): Promise<boolean> {
  const publicKeyBytes = hexToBytes(params.publicKeyHex);
  const signatureBytes = hexToBytes(params.signatureHex);
  if (!publicKeyBytes || publicKeyBytes.length !== 32 || !signatureBytes || signatureBytes.length !== 64) {
    return false;
  }
  if (!params.timestamp) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const message = toExactArrayBufferBytes(TEXT_ENCODER.encode(`${params.timestamp}${params.rawBody}`));
    return await crypto.subtle.verify('Ed25519', key, signatureBytes, message);
  } catch {
    return false;
  }
}

function extractSubcommand(
  data: DiscordInteractionPayload['data'],
): { subcommand: string; options: Map<string, string | number | boolean> } {
  const optionMap = new Map<string, string | number | boolean>();
  const topOptions = data?.options ?? [];
  const subNode = topOptions.find((opt) => opt.type === 1);
  if (subNode) {
    for (const child of subNode.options ?? []) {
      if (child.value !== undefined) {
        optionMap.set(child.name, child.value);
      }
    }
    return { subcommand: subNode.name, options: optionMap };
  }

  for (const child of topOptions) {
    if (child.value !== undefined) {
      optionMap.set(child.name, child.value);
    }
  }
  return { subcommand: data?.name ?? '', options: optionMap };
}

function ephemeralMessage(content: string): Response {
  return jsonResponse({
    type: 4,
    data: { content, flags: 64 },
  });
}

function isAllowedDiscordWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const allowedHosts = new Set([
      'discord.com',
      'discordapp.com',
      'canary.discord.com',
      'ptb.discord.com',
    ]);
    return allowedHosts.has(parsed.hostname) && parsed.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

const VALID_XP_CATEGORIES = new Set<XpSpendCategory>([
  'attribute',
  'ability',
  'in_tribe_gift',
  'out_of_tribe_gift',
  'rage',
  'gnosis',
  'willpower',
]);

export async function handleDiscordInteraction(request: Request, env: WorkerEnv): Promise<Response> {
  const signatureHex = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  if (!signatureHex || !timestamp || !env.DISCORD_PUBLIC_KEY) {
    return errorResponse('Missing Discord interaction signature headers.', 401);
  }

  const rawBody = await request.text();
  const valid = await verifyDiscordEd25519Signature({
    publicKeyHex: env.DISCORD_PUBLIC_KEY,
    signatureHex,
    timestamp,
    rawBody,
  });

  if (!valid) {
    return errorResponse('Invalid Discord Ed25519 signature.', 401);
  }

  let interaction: DiscordInteractionPayload;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteractionPayload;
  } catch {
    return errorResponse('Invalid interaction JSON payload.', 400);
  }

  // Discord PING verification handshake
  if (interaction.type === 1) {
    return jsonResponse({ type: 1 });
  }

  if (interaction.type !== 2) {
    return ephemeralMessage('Unsupported Discord interaction type.');
  }

  const callerId = interaction.member?.user?.id ?? interaction.user?.id ?? 'unknown';
  const guildId = interaction.guild_id ?? '';
  const { subcommand, options } = extractSubcommand(interaction.data);

  if (subcommand === 'roll') {
    const rawPool = Number(options.get('pool') ?? 1);
    const rawDifficulty = Number(options.get('difficulty') ?? 6);
    const label = String(options.get('label') ?? 'W20 Pool Roll').slice(0, 120);
    const specialty = Boolean(options.get('specialty') ?? false);
    const willpower = Boolean(options.get('willpower') ?? false);

    const pool = Math.max(1, Math.min(50, Math.trunc(rawPool)));
    const difficulty = Math.max(2, Math.min(10, Math.trunc(rawDifficulty)));
    const roll = resolveW20DicePool({
      label,
      basePool: pool,
      baseDifficulty: difficulty,
      hasApplicableSpecialty: specialty,
      spendWillpower: willpower,
      specialtyMode: 'w20_double',
    });

    const supa = new SupabaseRestClient(env);
    let targetRoomIds: string[] = [];
    if (guildId && supa.isConfigured()) {
      try {
        const campaigns = await supa.listCampaignsByGuild(guildId);
        targetRoomIds = campaigns.map((c) => c.id);
      } catch {
        targetRoomIds = [];
      }
    }
    if (targetRoomIds.length === 0 && guildId && env.GAME_ROOM) {
      targetRoomIds = [guildId];
    }

    if (env.GAME_ROOM) {
      await Promise.allSettled(
        targetRoomIds.map(async (campaignId) => {
          const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(campaignId));
          await stub.broadcastSlashRoll({
            campaignId,
            rollerDiscordId: callerId,
            label,
            roll,
          });
        }),
      );
    }

    const diceFormatted = roll.dice
      .map((die) => (die.value === 10 || die.value >= difficulty ? `**${die.value}**` : `${die.value}`))
      .join(', ');
    const embedColor = roll.isBotch ? 0x991b1b : roll.netSuccesses > 0 ? 0x10b981 : 0x71717a;

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: `🎲 ${label}`,
            color: embedColor,
            description: `Outcome: **${roll.outcome.toUpperCase()}** (**${roll.netSuccesses}** net successes vs diff **${roll.clampedDifficulty}**)`,
            fields: [
              { name: 'Dice', value: `[${diceFormatted}]`, inline: false },
              { name: 'Pool', value: `${roll.effectivePool}d10`, inline: true },
              { name: '1s Rolled', value: `${roll.onesRolled}`, inline: true },
              {
                name: 'Modifiers',
                value: [specialty ? 'Specialty' : null, willpower ? 'Willpower (+1)' : null]
                  .filter(Boolean)
                  .join(', ') || 'None',
                inline: true,
              },
            ],
            footer: { text: `Seed: ${roll.physicsSeed}` },
          },
        ],
      },
    });
  }

  if (subcommand === 'xp-calc') {
    const categoryRaw = String(options.get('category') ?? '');
    const currentOrLevel = Number(options.get('current_or_level') ?? NaN);
    if (!VALID_XP_CATEGORIES.has(categoryRaw as XpSpendCategory) || !Number.isInteger(currentOrLevel)) {
      return ephemeralMessage('Provide a valid W20 XP category and integer rating/level.');
    }

    try {
      const cost = calculateW20XpCost(categoryRaw as XpSpendCategory, currentOrLevel);
      return jsonResponse({
        type: 4,
        data: {
          embeds: [
            {
              title: 'W20 Experience Cost Calculator',
              color: 0xd97706,
              fields: [
                { name: 'Category', value: categoryRaw, inline: true },
                { name: 'Current / Gift Level', value: String(currentOrLevel), inline: true },
                { name: 'XP Cost', value: `**${cost} XP**`, inline: true },
              ],
            },
          ],
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid XP calculation parameters.';
      return ephemeralMessage(msg);
    }
  }

  if (subcommand === 'xp-award') {
    if (!guildId) {
      return ephemeralMessage('/w20 xp-award can only be run inside a Discord server.');
    }
    const playerId = String(options.get('player') ?? '').trim();
    const amount = Number(options.get('amount') ?? 0);
    const reason = String(options.get('reason') ?? '').trim();
    const characterName = options.get('character_name')
      ? String(options.get('character_name'))
      : undefined;

    if (!playerId || !Number.isInteger(amount) || amount === 0 || !reason) {
      return ephemeralMessage('Provide valid player, non-zero integer XP amount, and reason.');
    }

    const supa = new SupabaseRestClient(env);
    if (!supa.isConfigured()) {
      return ephemeralMessage('Supabase is not configured for chronicle XP ledger.');
    }

    const match = await supa.findPlayerCharacterInGuild(guildId, playerId, characterName);
    if (!match) {
      return ephemeralMessage('No matching character found for that player in this guild.');
    }
    if (match.campaign.storyteller_discord_id !== callerId) {
      return ephemeralMessage('Only the Chronicle Storyteller may award XP via /w20 xp-award.');
    }

    await supa.appendXpLedgerEntry({
      character_id: match.character.id,
      delta: amount,
      reason,
      approved_by_discord_id: callerId,
    });
    const updatedBalance = await supa.getXpBalance(match.character.id);

    return jsonResponse({
      type: 4,
      data: {
        embeds: [
          {
            title: 'Chronicle XP Ledger Updated',
            color: amount > 0 ? 0x10b981 : 0xf59e0b,
            description: `**${match.character.name}** (${amount > 0 ? `+${amount}` : amount} XP): ${reason}`,
            fields: [
              { name: 'Player', value: `<@${playerId}>`, inline: true },
              { name: 'Current Unspent XP', value: `${updatedBalance} XP`, inline: true },
            ],
          },
        ],
      },
    });
  }

  if (subcommand === 'npc-say') {
    const npcName = String(options.get('name') ?? '').trim();
    const dialogue = String(options.get('dialogue') ?? '').trim();
    const webhookUrl = String(options.get('webhook_url') ?? '').trim();
    const avatarUrl = options.get('avatar_url') ? String(options.get('avatar_url')).trim() : undefined;

    if (!npcName || !dialogue || !isAllowedDiscordWebhookUrl(webhookUrl)) {
      return ephemeralMessage('Provide NPC name, dialogue, and a valid HTTPS Discord webhook URL.');
    }

    const supa = new SupabaseRestClient(env);
    let authorized = false;
    if (guildId && supa.isConfigured()) {
      const campaigns = await supa.listCampaignsByGuild(guildId);
      if (campaigns.some((c) => c.storyteller_discord_id === callerId)) {
        authorized = true;
      }
    }
    if (!authorized && interaction.member?.permissions) {
      try {
        const perms = BigInt(interaction.member.permissions);
        if ((perms & 0x8n) !== 0n || (perms & 0x10n) !== 0n) {
          authorized = true;
        }
      } catch {
        authorized = false;
      }
    }
    if (!authorized) {
      return ephemeralMessage('Only the Storyteller or server administrator may speak as an NPC.');
    }

    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: npcName.slice(0, 80),
        content: dialogue.slice(0, 2000),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      }),
    });

    if (!webhookRes.ok) {
      return ephemeralMessage(`Discord webhook returned HTTP ${webhookRes.status}.`);
    }

    return ephemeralMessage(`Spoke as **${npcName}** in channel.`);
  }

  return ephemeralMessage(`Unknown /w20 subcommand "${subcommand}".`);
}
