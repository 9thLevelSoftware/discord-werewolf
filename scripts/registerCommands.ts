import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface DiscordCommandOptionChoice {
  name: string;
  value: string | number;
}

export interface DiscordCommandOption {
  type: number;
  name: string;
  description: string;
  required?: boolean;
  choices?: DiscordCommandOptionChoice[];
  options?: DiscordCommandOption[];
}

export interface DiscordSlashCommandDefinition {
  name: string;
  description: string;
  options: DiscordCommandOption[];
}

/**
 * Discord Application Command option types (REST v10):
 * 1 = SUB_COMMAND, 3 = STRING, 4 = INTEGER, 5 = BOOLEAN, 6 = USER
 */
export const W20_SLASH_COMMANDS: DiscordSlashCommandDefinition[] = [
  {
    name: 'w20',
    description: 'Werewolf 20th Anniversary Edition VTT & Chronicle Commands',
    options: [
      {
        type: 1,
        name: 'roll',
        description: 'Roll an authoritative W20 d10 pool and sync with any live Activity call',
        options: [
          { type: 4, name: 'pool', description: 'Number of d10s to roll', required: true },
          {
            type: 4,
            name: 'difficulty',
            description: 'Target number (2-10, default 6)',
            required: false,
          },
          {
            type: 3,
            name: 'label',
            description: 'Action description (e.g. Perception + Primal-Urge)',
            required: false,
          },
          {
            type: 5,
            name: 'specialty',
            description: 'Apply W20 Specialty (10s count as 2 successes)',
            required: false,
          },
          {
            type: 5,
            name: 'willpower',
            description: 'Spend 1 Willpower for +1 uncancelable success',
            required: false,
          },
        ],
      },
      {
        type: 1,
        name: 'xp-calc',
        description: 'Calculate exact W20 XP cost for raising an Attribute, Ability, Gift, or Trait',
        options: [
          {
            type: 3,
            name: 'category',
            description: 'W20 trait category',
            required: true,
            choices: [
              { name: 'Attribute (Current x 4)', value: 'attribute' },
              { name: 'Ability (New=3, Current x 2)', value: 'ability' },
              { name: 'Breed / Auspice / Tribe Gift (Level x 3)', value: 'in_tribe_gift' },
              { name: 'Outside Gift (Level x 5)', value: 'out_of_tribe_gift' },
              { name: 'Gnosis (Current x 2)', value: 'gnosis' },
              { name: 'Rage (Current x 1)', value: 'rage' },
              { name: 'Willpower (Current x 1)', value: 'willpower' },
            ],
          },
          {
            type: 4,
            name: 'current_or_level',
            description: 'Current rating (0-9) or target Gift level (1-6)',
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: 'xp-award',
        description: 'Storyteller: Award or deduct Experience Points for a character',
        options: [
          {
            type: 6,
            name: 'player',
            description: 'Discord user whose character receives the XP ledger entry',
            required: true,
          },
          {
            type: 4,
            name: 'amount',
            description: 'XP delta (positive to award, negative to record trait spend)',
            required: true,
          },
          {
            type: 3,
            name: 'reason',
            description: 'Session reward or trait upgrade reason (e.g. Session 4 Award)',
            required: true,
          },
          {
            type: 3,
            name: 'character_name',
            description: 'Optional character name if player owns multiple characters',
            required: false,
          },
        ],
      },
      {
        type: 1,
        name: 'npc-say',
        description: 'Storyteller: Speak in-character as an NPC, Bane, or Pack Totem via webhook',
        options: [
          { type: 3, name: 'name', description: 'NPC or Spirit display name', required: true },
          { type: 3, name: 'dialogue', description: 'In-character message', required: true },
          { type: 3, name: 'webhook_url', description: 'Channel webhook URL', required: true },
          { type: 3, name: 'avatar_url', description: 'Optional portrait URL', required: false },
        ],
      },
    ],
  },
];

function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export async function registerDiscordCommands(): Promise<void> {
  loadDotEnvIfPresent();

  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (!applicationId) {
    throw new Error('Missing DISCORD_APPLICATION_ID environment variable.');
  }
  if (!botToken) {
    throw new Error('Missing DISCORD_BOT_TOKEN environment variable.');
  }

  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(W20_SLASH_COMMANDS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord command registration failed (${response.status}): ${body}`);
  }

  const registered = (await response.json()) as Array<{ id: string; name: string }>;
  const scopeLabel = guildId ? `guild ${guildId}` : 'global application scope';
  console.log(
    `Registered ${registered.length} command(s) in ${scopeLabel}: ${registered.map((c) => `/${c.name}`).join(', ')}`
  );
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  registerDiscordCommands().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
