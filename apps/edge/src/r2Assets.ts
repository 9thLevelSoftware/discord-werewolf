import { requireSessionFromRequest } from './discordOAuth';
import { errorResponse, jsonResponse, type WorkerEnv } from './env';
import { SupabaseRestClient } from './supabaseRest';

const ALLOWED_CATEGORIES = new Set(['maps', 'tokens', 'audio', 'handouts', 'portraits']);
const STORYTELLER_CATEGORIES = new Set(['maps', 'audio', 'handouts']);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function sanitizePathSegment(raw: string): string | null {
  const decoded = decodeURIComponent(raw).trim();
  if (!decoded || decoded === '.' || decoded === '..') {
    return null;
  }
  if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..') || /\0/.test(decoded)) {
    return null;
  }
  const safe = decoded.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.length > 0 && safe.length <= 160 ? safe : null;
}

export function normalizeR2AssetKey(pathname: string): string | null {
  const rawKey = pathname.replace(/^\/r2-assets\/+/, '');
  if (!rawKey) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawKey);
  } catch {
    return null;
  }
  if (!decoded || decoded.startsWith('/') || decoded.includes('\\') || /\0/.test(decoded)) {
    return null;
  }
  const parts = decoded.split('/');
  if (parts.some((part) => part.length === 0 || part === '.' || part === '..')) {
    return null;
  }
  return parts.join('/');
}

export async function handleGetR2Asset(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const key = normalizeR2AssetKey(url.pathname);
  if (!key) {
    return errorResponse('Invalid R2 asset path.', 400);
  }

  const object = await env.VTT_MEDIA_BUCKET.get(key);
  if (!object) {
    return errorResponse('Asset not found.', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'public, max-age=86400');
  }
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

export async function handlePutR2Asset(
  request: Request,
  env: WorkerEnv,
  rawCategory: string,
  rawFilename: string,
): Promise<Response> {
  const session = await requireSessionFromRequest(request, env);
  if (!session) {
    return errorResponse('Authentication required.', 401);
  }

  const category = rawCategory.trim().toLowerCase();
  if (!ALLOWED_CATEGORIES.has(category)) {
    return errorResponse('Unsupported asset category.', 400);
  }

  const safeFilename = sanitizePathSegment(rawFilename);
  if (!safeFilename) {
    return errorResponse('Invalid filename.', 400);
  }

  const url = new URL(request.url);
  const campaignId =
    url.searchParams.get('campaignId')?.trim() || request.headers.get('X-Campaign-Id')?.trim() || null;

  if (campaignId) {
    const supa = new SupabaseRestClient(env);
    const campaign = await supa.getCampaignById(campaignId);
    if (!campaign) {
      return errorResponse('Campaign not found.', 404);
    }
    if (STORYTELLER_CATEGORIES.has(category)) {
      if (campaign.storyteller_discord_id !== session.discordId) {
        return errorResponse('Only the Storyteller may upload scene assets.', 403);
      }
    } else if (
      campaign.storyteller_discord_id !== session.discordId &&
      !session.guildIds.includes(campaign.discord_guild_id)
    ) {
      return errorResponse('You are not a member of this campaign Discord server.', 403);
    }
  }

  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength && Number(declaredLength) > MAX_UPLOAD_BYTES) {
    return errorResponse('Asset exceeds maximum allowed 25 MiB size.', 413);
  }

  const bodyBytes = await request.arrayBuffer();
  if (bodyBytes.byteLength === 0) {
    return errorResponse('Empty asset upload body.', 400);
  }
  if (bodyBytes.byteLength > MAX_UPLOAD_BYTES) {
    return errorResponse('Asset exceeds maximum allowed 25 MiB size.', 413);
  }

  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  const scopePrefix = campaignId ? campaignId : session.discordId;
  const key = `${category}/${scopePrefix}/${Date.now()}-${safeFilename}`;

  await env.VTT_MEDIA_BUCKET.put(key, bodyBytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      uploadedByDiscordId: session.discordId,
      ...(campaignId ? { campaignId } : {}),
    },
  });

  return jsonResponse(
    {
      key,
      url: `/r2-assets/${key}`,
      contentType,
      sizeBytes: bodyBytes.byteLength,
    },
    201,
  );
}
