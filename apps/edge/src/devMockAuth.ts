import {
  discordIdToUuidV5,
  mintAuthTokensForIdentity,
  requireSessionFromRequest,
} from './discordOAuth';
import { errorResponse, jsonResponse, type WorkerEnv } from './env';

/**
 * Local development only: lets the client run outside Discord by minting a real
 * session JWT for a fixed fake identity. Enabled only when the Worker runs with
 * DEV_MOCK_AUTH=1 (see the `dev:mock` script) AND the request targets a loopback
 * host, so it can never answer on a deployed hostname.
 */

const MOCK_DISCORD_ID_PREFIX = '9000000000000000';

const MOCK_IDENTITIES: Record<string, { discordId: string; username: string }> = {
  '1': { discordId: `${MOCK_DISCORD_ID_PREFIX}01`, username: 'Mock Player One' },
  '2': { discordId: `${MOCK_DISCORD_ID_PREFIX}02`, username: 'Mock Player Two' },
  '3': { discordId: `${MOCK_DISCORD_ID_PREFIX}03`, username: 'Mock Player Three' },
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isDevMockAuthEnabled(request: Request, env: WorkerEnv): boolean {
  if (env.DEV_MOCK_AUTH !== '1') return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

export function isMockDiscordId(discordId: string): boolean {
  return Object.values(MOCK_IDENTITIES).some((identity) => identity.discordId === discordId);
}

export async function handleDevMockSession(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.SUPABASE_JWT_SECRET) {
    return errorResponse('SUPABASE_JWT_SECRET is not configured.', 500);
  }

  const slot = new URL(request.url).searchParams.get('slot') ?? '1';
  const identity = MOCK_IDENTITIES[slot];
  if (!identity) {
    return errorResponse(`Unknown mock slot. Use one of: ${Object.keys(MOCK_IDENTITIES).join(', ')}.`, 400);
  }

  const tokens = await mintAuthTokensForIdentity(
    {
      sub: await discordIdToUuidV5(identity.discordId),
      discordId: identity.discordId,
      username: identity.username,
      globalName: identity.username,
      avatarUrl: null,
      guildIds: [],
    },
    env.SUPABASE_JWT_SECRET,
  );

  return jsonResponse(
    {
      ...tokens,
      user: {
        id: identity.discordId,
        username: identity.username,
        globalName: identity.username,
        avatarUrl: null,
      },
    },
    200,
  );
}

/**
 * Mock identities must never read or write real cloud data. Returns a 503 for any
 * API request carrying a mock session so the client falls back to local-only storage.
 */
export async function rejectMockSessionCloudAccess(
  request: Request,
  env: WorkerEnv,
): Promise<Response | null> {
  const session = await requireSessionFromRequest(request, env);
  if (session && isMockDiscordId(session.discordId)) {
    return errorResponse('Mock session: cloud storage is disabled in local mock mode.', 503);
  }
  return null;
}
