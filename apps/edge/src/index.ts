import {
  calculateW20XpCost,
  materializeCharacterFromDraft,
  validateW20CharacterCreation,
  type AttributeKey,
  type MoonPhase,
  type SpecialtyMode,
  type W20CharacterCreationDraft,
  type W20CharacterState,
  type XpSpendCategory,
} from '@w20-vtt/core';
import { handleDiscordInteraction } from './discordBotBridge';
import {
  handleDiscordTokenExchange,
  handleDiscordTokenRefresh,
  requireSessionFromRequest,
} from './discordOAuth';
import { errorResponse, jsonResponse, type WorkerEnv } from './env';
import { GameRoomDO } from './GameRoomDO';
import { handleGetR2Asset, handlePutR2Asset } from './r2Assets';
import { SupabaseRestClient, SupabaseRestError } from './supabaseRest';

export { GameRoomDO };

const ATTRIBUTE_KEYS = new Set<AttributeKey>([
  'strength',
  'dexterity',
  'stamina',
  'charisma',
  'manipulation',
  'appearance',
  'perception',
  'intelligence',
  'wits',
]);

const VALID_MOON_PHASES = new Set<MoonPhase>(['new', 'crescent', 'half', 'gibbous', 'full']);
const VALID_SPECIALTY_MODES = new Set<SpecialtyMode>(['w20_double', 'revised_explode']);

function decodeSegment(raw: string): string | null {
  try {
    const val = decodeURIComponent(raw).trim();
    return val.length > 0 ? val : null;
  } catch {
    return null;
  }
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleListCampaigns(request: Request, env: WorkerEnv): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const url = new URL(request.url);
  const guildId = url.searchParams.get('guildId')?.trim() || '';
  if (!guildId) {
    return errorResponse('guildId query parameter is required.', 400);
  }
  if (!session.guildIds.includes(guildId)) {
    return errorResponse('Forbidden: you are not a member of this Discord guild.', 403);
  }

  const supa = new SupabaseRestClient(env);
  const campaigns = await supa.listCampaignsByGuild(guildId);
  return jsonResponse({ campaigns }, 200);
}

async function handleCreateCampaign(request: Request, env: WorkerEnv): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse('Invalid JSON request body.', 400);
  }

  const guildId = String(body.guildId ?? body.discord_guild_id ?? '').trim();
  const name = String(body.name ?? '').trim();
  if (!guildId || !name) {
    return errorResponse('guildId and campaign name are required.', 400);
  }
  if (!session.guildIds.includes(guildId)) {
    return errorResponse('Forbidden: you are not a member of this Discord guild.', 403);
  }

  const rawMoon = String(body.moonPhase ?? body.current_moon_phase ?? 'half') as MoonPhase;
  const moonPhase: MoonPhase = VALID_MOON_PHASES.has(rawMoon) ? rawMoon : 'half';
  const rawGauntlet = Number(body.localGauntlet ?? body.local_gauntlet ?? 6);
  const localGauntlet = Number.isInteger(rawGauntlet)
    ? Math.max(1, Math.min(10, rawGauntlet))
    : 6;
  const rawSpecialtyMode = String(
    body.specialtyMode ?? body.specialty_mode ?? 'w20_double',
  ) as SpecialtyMode;
  const specialtyMode: SpecialtyMode = VALID_SPECIALTY_MODES.has(rawSpecialtyMode)
    ? rawSpecialtyMode
    : 'w20_double';

  const diceLogWebhookUrl =
    typeof (body.diceLogWebhookUrl ?? body.dice_log_webhook_url) === 'string'
      ? String(body.diceLogWebhookUrl ?? body.dice_log_webhook_url).trim() || null
      : null;
  const voiceChannelId =
    typeof (body.discordVoiceChannelId ?? body.discord_voice_channel_id) === 'string'
      ? String(body.discordVoiceChannelId ?? body.discord_voice_channel_id).trim() || null
      : null;
  const mapAssetUrl =
    typeof (body.mapAssetUrl ?? body.map_asset_url) === 'string'
      ? String(body.mapAssetUrl ?? body.map_asset_url).trim() || null
      : null;

  const supa = new SupabaseRestClient(env);
  const campaign = await supa.createCampaign({
    discord_guild_id: guildId,
    storyteller_discord_id: session.discordId,
    name: name.slice(0, 120),
    current_moon_phase: moonPhase,
    local_gauntlet: localGauntlet,
    specialty_mode: specialtyMode,
    dice_log_webhook_url: diceLogWebhookUrl,
    discord_voice_channel_id: voiceChannelId,
    map_asset_url: mapAssetUrl,
  });

  const packInput =
    body.pack && typeof body.pack === 'object' ? (body.pack as Record<string, unknown>) : null;
  const packName = String(packInput?.name ?? body.packName ?? '').trim();
  const totemName = String(packInput?.totemName ?? body.totemName ?? '').trim() || null;

  let pack = null;
  if (packName || totemName) {
    const wpMaxRaw = Number(packInput?.willpowerMax ?? body.packWillpowerMax ?? 5);
    const wpMax = Number.isInteger(wpMaxRaw) ? Math.max(0, Math.min(20, wpMaxRaw)) : 5;
    const caernName = String(packInput?.caernName ?? body.caernName ?? '').trim() || null;
    const caernLevelRaw = Number(packInput?.caernLevel ?? body.caernLevel ?? NaN);
    const caernLevel =
      Number.isInteger(caernLevelRaw) && caernLevelRaw >= 1 && caernLevelRaw <= 5
        ? caernLevelRaw
        : null;

    pack = await supa.createPack({
      campaign_id: campaign.id,
      name: packName || `${campaign.name} Pack`,
      totem_name: totemName,
      pack_willpower_max: wpMax,
      pack_willpower_temp: wpMax,
      caern_name: caernName,
      caern_level: caernLevel,
    });
  }

  return jsonResponse({ campaign, pack }, 201);
}

async function handleGetCampaignCharacters(
  request: Request,
  env: WorkerEnv,
  campaignId: string,
): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const supa = new SupabaseRestClient(env);
  const campaign = await supa.getCampaignById(campaignId);
  if (!campaign) {
    return errorResponse('Campaign not found.', 404);
  }

  const isStoryteller = campaign.storyteller_discord_id === session.discordId;
  if (!isStoryteller && !session.guildIds.includes(campaign.discord_guild_id)) {
    return errorResponse('Forbidden: you do not belong to this campaign server.', 403);
  }

  const allChars = await supa.listCampaignCharacters(campaignId);
  const characters = isStoryteller ? allChars : allChars.filter((c) => !c.isNpc);

  return jsonResponse({ characters }, 200);
}

async function handleCreateCharacter(request: Request, env: WorkerEnv): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse('Invalid JSON request body.', 400);
  }

  const campaignId = String(body.campaignId ?? '').trim();
  const draft = body.draft as W20CharacterCreationDraft | undefined;
  if (!campaignId || !draft || typeof draft !== 'object') {
    return errorResponse('campaignId and draft are required.', 400);
  }

  const supa = new SupabaseRestClient(env);
  const campaign = await supa.getCampaignById(campaignId);
  if (!campaign) {
    return errorResponse('Campaign not found.', 404);
  }

  const isStoryteller = campaign.storyteller_discord_id === session.discordId;
  if (!isStoryteller && !session.guildIds.includes(campaign.discord_guild_id)) {
    return errorResponse('Forbidden: you are not a member of this campaign Discord guild.', 403);
  }

  const validation = validateW20CharacterCreation(draft);
  if (!validation.isValid) {
    return jsonResponse(
      {
        error: 'Character creation draft failed W20 rules validation.',
        errors: validation.errors,
        validation,
      },
      400,
    );
  }

  const isNpc = Boolean(body.isNpc) && isStoryteller;
  const deedName = typeof body.deedName === 'string' ? body.deedName.trim() || undefined : undefined;
  const packId = typeof body.packId === 'string' ? body.packId.trim() || null : null;
  const selectedGiftIds = Array.isArray(body.selectedGiftIds)
    ? body.selectedGiftIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const portraitsByForm =
    body.portraitsByForm && typeof body.portraitsByForm === 'object'
      ? (body.portraitsByForm as W20CharacterState['portraitsByForm'])
      : undefined;

  const materialized = materializeCharacterFromDraft(draft, {
    id: crypto.randomUUID(),
    campaignId,
    ownerDiscordId: session.discordId,
    packId,
    isNpc,
    deedName,
    portraitsByForm,
  });

  const inserted = await supa.insertCharacter(materialized, selectedGiftIds);

  if (env.GAME_ROOM) {
    try {
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(campaignId));
      await stub.upsertCharacterFromApi(inserted);
    } catch {
      // Room may not be active yet; it will hydrate from Supabase on HELLO_AUTH.
    }
  }

  return jsonResponse({ character: inserted }, 201);
}

async function handleAwardXp(
  request: Request,
  env: WorkerEnv,
  campaignId: string,
): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse('Invalid JSON request body.', 400);
  }

  const characterId = String(body.characterId ?? '').trim();
  const delta = Number(body.delta ?? NaN);
  const reason = String(body.reason ?? '').trim();
  if (!characterId || !Number.isInteger(delta) || delta === 0 || !reason) {
    return errorResponse('characterId, non-zero integer delta, and reason are required.', 400);
  }

  const supa = new SupabaseRestClient(env);
  const campaign = await supa.getCampaignById(campaignId);
  if (!campaign) {
    return errorResponse('Campaign not found.', 404);
  }
  if (campaign.storyteller_discord_id !== session.discordId) {
    return errorResponse('Only the Storyteller may award XP.', 403);
  }

  const char = await supa.getCharacterById(characterId);
  if (!char || char.campaignId !== campaignId) {
    return errorResponse('Character not found in this campaign.', 404);
  }

  const entry = await supa.appendXpLedgerEntry({
    character_id: characterId,
    delta,
    reason,
    approved_by_discord_id: session.discordId,
  });
  const balance = await supa.getXpBalance(characterId);

  return jsonResponse({ entry, balance }, 201);
}

async function handleGetXpLedger(
  request: Request,
  env: WorkerEnv,
  characterId: string,
): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const supa = new SupabaseRestClient(env);
  const char = await supa.getCharacterById(characterId);
  if (!char) {
    return errorResponse('Character not found.', 404);
  }
  const campaign = await supa.getCampaignById(char.campaignId);
  if (!campaign) {
    return errorResponse('Campaign not found.', 404);
  }

  const isStoryteller = campaign.storyteller_discord_id === session.discordId;
  if (!isStoryteller && char.isNpc) {
    return errorResponse('Forbidden.', 403);
  }
  if (!isStoryteller && !session.guildIds.includes(campaign.discord_guild_id)) {
    return errorResponse('Forbidden.', 403);
  }

  const entries = await supa.listXpLedger(characterId);
  const balance = entries.reduce((sum, item) => sum + Number(item.delta ?? 0), 0);
  return jsonResponse({ entries, balance }, 200);
}

async function handleSpendXp(
  request: Request,
  env: WorkerEnv,
  characterId: string,
): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return errorResponse('Invalid JSON request body.', 400);
  }

  const category = String(body.category ?? '') as XpSpendCategory;
  const targetKey = String(
    body.targetKey ?? body.traitKey ?? body.abilityKey ?? body.attributeKey ?? '',
  ).trim();
  const giftId = typeof body.giftId === 'string' ? body.giftId.trim() : undefined;
  const giftLevel = Number(body.currentRatingOrGiftLevel ?? body.giftLevel ?? NaN);
  const customReason = typeof body.reason === 'string' ? body.reason.trim() : '';

  const supa = new SupabaseRestClient(env);
  const char = await supa.getCharacterById(characterId);
  if (!char) {
    return errorResponse('Character not found.', 404);
  }
  const campaign = await supa.getCampaignById(char.campaignId);
  if (!campaign) {
    return errorResponse('Campaign not found.', 404);
  }

  const isStoryteller = campaign.storyteller_discord_id === session.discordId;
  if (!isStoryteller && char.ownerDiscordId !== session.discordId) {
    return errorResponse('Only the character owner or Storyteller may spend XP.', 403);
  }

  let cost: number;
  let dbPatch: Record<string, unknown>;
  let roomPatch: Partial<W20CharacterState>;
  let defaultReason: string;
  const nextVersion = char.stateVersion + 1;

  try {
    if (category === 'attribute') {
      if (!ATTRIBUTE_KEYS.has(targetKey as AttributeKey)) {
        return errorResponse('Invalid Attribute key for XP spend.', 400);
      }
      const attrKey = targetKey as AttributeKey;
      const current = char.baseAttributes[attrKey];
      if (current >= 10) {
        return errorResponse('Attribute is already at maximum rating (10).', 400);
      }
      cost = calculateW20XpCost('attribute', current);
      const nextAttrs = { ...char.baseAttributes, [attrKey]: current + 1 };
      dbPatch = { [`attr_${attrKey}`]: current + 1, state_version: nextVersion };
      roomPatch = { baseAttributes: nextAttrs, stateVersion: nextVersion };
      defaultReason = `${attrKey} ${current} -> ${current + 1} (-${cost} XP)`;
    } else if (category === 'ability') {
      if (!targetKey || !/^[a-z][a-z0-9_]{1,40}$/.test(targetKey)) {
        return errorResponse('Invalid Ability key for XP spend.', 400);
      }
      const current = Number(char.abilities[targetKey] ?? 0);
      if (current >= 10) {
        return errorResponse('Ability is already at maximum rating (10).', 400);
      }
      cost = calculateW20XpCost('ability', current);
      const nextAbilities = { ...char.abilities, [targetKey]: current + 1 };
      dbPatch = { abilities: nextAbilities, state_version: nextVersion };
      roomPatch = { abilities: nextAbilities, stateVersion: nextVersion };
      defaultReason = `${targetKey} ${current} -> ${current + 1} (-${cost} XP)`;
    } else if (category === 'rage') {
      const current = char.rage.permanent;
      if (current >= 10) {
        return errorResponse('Permanent Rage is already at maximum rating (10).', 400);
      }
      cost = calculateW20XpCost('rage', current);
      const nextRage = { ...char.rage, permanent: current + 1 };
      dbPatch = { rage_perm: current + 1, state_version: nextVersion };
      roomPatch = { rage: nextRage, stateVersion: nextVersion };
      defaultReason = `Permanent Rage ${current} -> ${current + 1} (-${cost} XP)`;
    } else if (category === 'gnosis') {
      const current = char.gnosis.permanent;
      if (current >= 10) {
        return errorResponse('Permanent Gnosis is already at maximum rating (10).', 400);
      }
      cost = calculateW20XpCost('gnosis', current);
      const nextGnosis = { ...char.gnosis, permanent: current + 1 };
      dbPatch = { gnosis_perm: current + 1, state_version: nextVersion };
      roomPatch = { gnosis: nextGnosis, stateVersion: nextVersion };
      defaultReason = `Permanent Gnosis ${current} -> ${current + 1} (-${cost} XP)`;
    } else if (category === 'willpower') {
      const current = char.willpower.permanent;
      if (current >= 10) {
        return errorResponse('Permanent Willpower is already at maximum rating (10).', 400);
      }
      cost = calculateW20XpCost('willpower', current);
      const nextWp = { ...char.willpower, permanent: current + 1 };
      dbPatch = { willpower_perm: current + 1, state_version: nextVersion };
      roomPatch = { willpower: nextWp, stateVersion: nextVersion };
      defaultReason = `Permanent Willpower ${current} -> ${current + 1} (-${cost} XP)`;
    } else if (category === 'in_tribe_gift' || category === 'out_of_tribe_gift') {
      if (!Number.isInteger(giftLevel) || giftLevel < 1 || giftLevel > 6) {
        return errorResponse('Gift level must be an integer between 1 and 6.', 400);
      }
      cost = calculateW20XpCost(category, giftLevel);
      dbPatch = { state_version: nextVersion };
      roomPatch = { stateVersion: nextVersion };
      defaultReason = `${category === 'in_tribe_gift' ? 'In-Tribe' : 'Outside'} Level ${giftLevel} Gift (-${cost} XP)`;
    } else {
      return errorResponse('Unsupported XP spend category.', 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid XP spend calculation.';
    return errorResponse(msg, 400);
  }

  const currentBalance = await supa.getXpBalance(characterId);
  if (currentBalance < cost) {
    return errorResponse(`Insufficient unspent XP: need ${cost}, have ${currentBalance}.`, 400, {
      cost,
      balance: currentBalance,
    });
  }

  const entry = await supa.appendXpLedgerEntry({
    character_id: characterId,
    delta: -cost,
    reason: customReason || defaultReason,
    approved_by_discord_id: session.discordId,
  });

  await supa.patchCharacterFields(characterId, dbPatch);
  if ((category === 'in_tribe_gift' || category === 'out_of_tribe_gift') && giftId) {
    await supa.insertCharacterGifts(characterId, [giftId]);
  }

  if (env.GAME_ROOM) {
    try {
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(char.campaignId));
      await stub.applyApprovedXp(characterId, roomPatch);
    } catch {
      // Room may not be booted; Supabase holds authoritative upgraded sheet.
    }
  }

  const updatedCharacter: W20CharacterState = {
    ...char,
    ...roomPatch,
  };

  return jsonResponse(
    {
      cost,
      balance: currentBalance - cost,
      entry,
      character: updatedCharacter,
    },
    200,
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === '/api/discord-token' && request.method === 'POST') {
        return await handleDiscordTokenExchange(request, env);
      }
      if (pathname === '/api/discord-token/refresh' && request.method === 'POST') {
        return await handleDiscordTokenRefresh(request, env);
      }
      if (pathname === '/api/discord-interactions' && request.method === 'POST') {
        return await handleDiscordInteraction(request, env);
      }

      if (pathname === '/api/campaigns' && request.method === 'GET') {
        return await handleListCampaigns(request, env);
      }
      if (pathname === '/api/campaigns' && request.method === 'POST') {
        return await handleCreateCampaign(request, env);
      }

      const campaignCharsMatch = /^\/api\/campaigns\/([^/]+)\/characters$/.exec(pathname);
      if (campaignCharsMatch && request.method === 'GET') {
        const campaignId = decodeSegment(campaignCharsMatch[1]!);
        if (!campaignId) return errorResponse('Invalid campaignId.', 400);
        return await handleGetCampaignCharacters(request, env, campaignId);
      }

      const xpAwardMatch = /^\/api\/campaigns\/([^/]+)\/xp-award$/.exec(pathname);
      if (xpAwardMatch && request.method === 'POST') {
        const campaignId = decodeSegment(xpAwardMatch[1]!);
        if (!campaignId) return errorResponse('Invalid campaignId.', 400);
        return await handleAwardXp(request, env, campaignId);
      }

      if (pathname === '/api/characters' && request.method === 'POST') {
        return await handleCreateCharacter(request, env);
      }

      const xpSpendMatch = /^\/api\/characters\/([^/]+)\/xp-spend$/.exec(pathname);
      if (xpSpendMatch && request.method === 'POST') {
        const characterId = decodeSegment(xpSpendMatch[1]!);
        if (!characterId) return errorResponse('Invalid characterId.', 400);
        return await handleSpendXp(request, env, characterId);
      }

      const xpLedgerMatch = /^\/api\/characters\/([^/]+)\/xp-ledger$/.exec(pathname);
      if (xpLedgerMatch && request.method === 'GET') {
        const characterId = decodeSegment(xpLedgerMatch[1]!);
        if (!characterId) return errorResponse('Invalid characterId.', 400);
        return await handleGetXpLedger(request, env, characterId);
      }

      const assetUploadMatch = /^\/api\/assets\/([^/]+)\/([^/]+)$/.exec(pathname);
      if (assetUploadMatch && request.method === 'PUT') {
        return await handlePutR2Asset(
          request,
          env,
          assetUploadMatch[1]!,
          assetUploadMatch[2]!,
        );
      }

      if (pathname.startsWith('/r2-assets/') && (request.method === 'GET' || request.method === 'HEAD')) {
        return await handleGetR2Asset(request, env);
      }

      const wsRoomMatch = /^\/ws\/room\/([^/]+)$/.exec(pathname);
      if (wsRoomMatch) {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          return errorResponse('WebSocket upgrade required.', 426);
        }
        const campaignId = decodeSegment(wsRoomMatch[1]!);
        if (!campaignId) {
          return errorResponse('Invalid room campaignId.', 400);
        }
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(campaignId));
        return await stub.fetch(request);
      }

      if (pathname.startsWith('/api/') || pathname.startsWith('/ws/')) {
        return errorResponse('API endpoint not found.', 404);
      }

      return await env.ASSETS.fetch(request);
    } catch (err) {
      if (err instanceof SupabaseRestError) {
        return errorResponse(err.message, err.status >= 400 && err.status < 600 ? err.status : 502);
      }
      const message = err instanceof Error ? err.message : 'Unexpected edge server error.';
      return errorResponse(message, 500);
    }
  },
};
