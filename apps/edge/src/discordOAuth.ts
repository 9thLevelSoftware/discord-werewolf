import { errorResponse, jsonResponse, type WorkerEnv } from './env';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

// Deterministic RFC 4122 DNS namespace UUID bytes for deriving stable sub UUIDs from Discord snowflakes.
const W20_UUID_NAMESPACE_BYTES = new Uint8Array([
  0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

const JWT_TTL_SECONDS = 3600;

export interface SessionJwtPayload {
  typ: 'w20_session';
  sub: string;
  discordId: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
  guildIds: string[];
  iat: number;
  exp: number;
}

export interface SupabaseJwtPayload {
  role: 'authenticated';
  aud: 'authenticated';
  sub: string;
  discord_id: string;
  guild_ids: string[];
  iat: number;
  exp: number;
}

export interface DiscordTokenExchangeResponse {
  discordAccessToken: string;
  sessionJwt: string;
  supabaseJwt: string;
  expiresAt: number;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
  };
  guildIds: string[];
}

interface DiscordOAuthTokenPayload {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface DiscordUserPayload {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordGuildPayload {
  id: string;
  name?: string;
}

function toExactArrayBufferBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(input.byteLength));
  copy.set(input);
  return copy;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return null;
  }
  const paddedLength = segment.length + ((4 - (segment.length % 4)) % 4);
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(paddedLength, '=');
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacSha256Key(secret: string, usages: Array<'sign' | 'verify'>): Promise<CryptoKey> {
  if (!secret || secret.trim().length === 0) {
    throw new Error('SUPABASE_JWT_SECRET is not configured.');
  }
  return crypto.subtle.importKey(
    'raw',
    toExactArrayBufferBytes(TEXT_ENCODER.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

/**
 * Generates an RFC 4122 UUID v5 deterministically from a Discord snowflake ID
 * so Supabase RLS `auth.uid()` / `sub` remains stable across logins.
 */
export async function discordIdToUuidV5(discordId: string): Promise<string> {
  const nameBytes = TEXT_ENCODER.encode(`discord:user:${discordId}`);
  const combined = new Uint8Array(new ArrayBuffer(W20_UUID_NAMESPACE_BYTES.length + nameBytes.length));
  combined.set(W20_UUID_NAMESPACE_BYTES, 0);
  combined.set(nameBytes, W20_UUID_NAMESPACE_BYTES.length);

  const digest = await crypto.subtle.digest('SHA-1', combined);
  const bytes = new Uint8Array(digest).slice(0, 16);
  // Set RFC 4122 version 5 (0101xxxx) and variant (10xxxxxx)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function signJwtHs256(payload: object, secret: string): Promise<string> {
  const headerB64 = encodeBase64Url(TEXT_ENCODER.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = encodeBase64Url(TEXT_ENCODER.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacSha256Key(secret, ['sign']);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    toExactArrayBufferBytes(TEXT_ENCODER.encode(signingInput)),
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwtHs256<TPayload extends Record<string, unknown>>(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<TPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return null;
  }

  const headerBytes = decodeBase64Url(headerB64);
  const payloadBytes = decodeBase64Url(payloadB64);
  const sigBytes = decodeBase64Url(sigB64);
  if (!headerBytes || !payloadBytes || !sigBytes) {
    return null;
  }

  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(TEXT_DECODER.decode(headerBytes));
    payload = JSON.parse(TEXT_DECODER.decode(payloadBytes));
  } catch {
    return null;
  }

  if (
    !header ||
    typeof header !== 'object' ||
    (header as { alg?: unknown }).alg !== 'HS256' ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return null;
  }

  const key = await importHmacSha256Key(secret, ['verify']);
  const validSignature = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    toExactArrayBufferBytes(TEXT_ENCODER.encode(`${headerB64}.${payloadB64}`)),
  );
  if (!validSignature) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.exp !== 'number' || !Number.isFinite(record.exp) || record.exp <= nowSec) {
    return null;
  }
  if (typeof record.nbf === 'number' && Number.isFinite(record.nbf) && record.nbf > nowSec) {
    return null;
  }

  return record as TPayload;
}

export async function verifySessionJwt(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<SessionJwtPayload | null> {
  const raw = await verifyJwtHs256<Record<string, unknown>>(token, secret, nowSec);
  if (!raw) {
    return null;
  }
  if (
    raw.typ !== 'w20_session' ||
    typeof raw.sub !== 'string' ||
    typeof raw.discordId !== 'string' ||
    raw.discordId.length === 0 ||
    typeof raw.username !== 'string' ||
    !Array.isArray(raw.guildIds) ||
    !raw.guildIds.every((id) => typeof id === 'string')
  ) {
    return null;
  }

  return {
    typ: 'w20_session',
    sub: raw.sub,
    discordId: raw.discordId,
    username: raw.username,
    globalName: typeof raw.globalName === 'string' ? raw.globalName : null,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
    guildIds: raw.guildIds as string[],
    iat: typeof raw.iat === 'number' ? raw.iat : 0,
    exp: raw.exp as number,
  };
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

export async function requireSessionFromRequest(
  request: Request,
  env: WorkerEnv,
): Promise<SessionJwtPayload | null> {
  const token = extractBearerToken(request);
  if (!token) {
    return null;
  }
  return verifySessionJwt(token, env.SUPABASE_JWT_SECRET);
}

export function buildDiscordAvatarUrl(userId: string, avatarHash: string | null | undefined): string | null {
  if (!avatarHash) {
    return null;
  }
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(avatarHash)}.${ext}`;
}

export function isAllowedRedirectUri(
  candidate: string,
  requestUrl: string,
  env: Pick<WorkerEnv, 'DISCORD_APPLICATION_ID' | 'ALLOWED_REDIRECT_URIS'>,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  const normalized = parsed.origin + (parsed.pathname === '/' ? '' : parsed.pathname);
  const exactOrigins = new Set<string>([
    'https://127.0.0.1',
    'http://127.0.0.1',
    'https://localhost',
    'http://localhost',
    new URL(requestUrl).origin,
  ]);

  if (env.DISCORD_APPLICATION_ID) {
    exactOrigins.add(`https://${env.DISCORD_APPLICATION_ID}.discordsays.com`);
  }

  if (exactOrigins.has(parsed.origin) || exactOrigins.has(normalized)) {
    return true;
  }

  if (
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname.endsWith('.discordsays.com'))
  ) {
    return true;
  }

  if (env.ALLOWED_REDIRECT_URIS) {
    const extras = env.ALLOWED_REDIRECT_URIS.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (extras.includes(candidate) || extras.includes(parsed.origin)) {
      return true;
    }
  }

  return false;
}

export async function mintAuthTokensForIdentity(
  identity: {
    sub: string;
    discordId: string;
    username: string;
    globalName: string | null;
    avatarUrl: string | null;
    guildIds: string[];
  },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<{ sessionJwt: string; supabaseJwt: string; expiresAt: number }> {
  const exp = nowSec + JWT_TTL_SECONDS;
  const sessionPayload: SessionJwtPayload = {
    typ: 'w20_session',
    sub: identity.sub,
    discordId: identity.discordId,
    username: identity.username,
    globalName: identity.globalName,
    avatarUrl: identity.avatarUrl,
    guildIds: identity.guildIds,
    iat: nowSec,
    exp,
  };

  const supabasePayload: SupabaseJwtPayload = {
    role: 'authenticated',
    aud: 'authenticated',
    sub: identity.sub,
    discord_id: identity.discordId,
    guild_ids: identity.guildIds,
    iat: nowSec,
    exp,
  };

  const [sessionJwt, supabaseJwt] = await Promise.all([
    signJwtHs256(sessionPayload, secret),
    signJwtHs256(supabasePayload, secret),
  ]);

  return {
    sessionJwt,
    supabaseJwt,
    expiresAt: exp * 1000,
  };
}

export async function handleDiscordTokenExchange(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.DISCORD_APPLICATION_ID || !env.DISCORD_CLIENT_SECRET || !env.SUPABASE_JWT_SECRET) {
    return errorResponse('Discord OAuth server configuration is incomplete.', 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON request body.', 400);
  }

  const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code.trim() : '';
  if (!code) {
    return errorResponse('Missing OAuth authorization code.', 400);
  }

  const requestedRedirect =
    typeof record.redirectUri === 'string'
      ? record.redirectUri.trim()
      : typeof record.redirect_uri === 'string'
        ? record.redirect_uri.trim()
        : 'https://127.0.0.1';

  if (!isAllowedRedirectUri(requestedRedirect, request.url, env)) {
    return errorResponse('Disallowed OAuth redirectUri.', 400);
  }

  const formBody = new URLSearchParams({
    client_id: env.DISCORD_APPLICATION_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: requestedRedirect,
  });

  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    return errorResponse('Discord token exchange failed.', 502, {
      status: tokenRes.status,
      detail: errText.slice(0, 300),
    });
  }

  const tokenPayload = (await tokenRes.json()) as DiscordOAuthTokenPayload;
  const discordAccessToken = tokenPayload.access_token;
  if (!discordAccessToken) {
    return errorResponse('Discord did not return an access token.', 502);
  }

  const [meRes, guildsRes] = await Promise.all([
    fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${discordAccessToken}` },
    }),
    fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${discordAccessToken}` },
    }),
  ]);

  if (!meRes.ok) {
    return errorResponse('Failed to fetch Discord user profile.', 502, { status: meRes.status });
  }
  if (!guildsRes.ok) {
    return errorResponse('Failed to fetch Discord guild memberships.', 502, { status: guildsRes.status });
  }

  const user = (await meRes.json()) as DiscordUserPayload;
  const guilds = (await guildsRes.json()) as DiscordGuildPayload[];
  if (!user?.id || !user?.username) {
    return errorResponse('Incomplete Discord user profile.', 502);
  }

  const guildIds = Array.isArray(guilds)
    ? Array.from(new Set(guilds.map((g) => g.id).filter((id): id is string => typeof id === 'string')))
    : [];
  const avatarUrl = buildDiscordAvatarUrl(user.id, user.avatar);
  const globalName = typeof user.global_name === 'string' ? user.global_name : null;
  const sub = await discordIdToUuidV5(user.id);

  const { sessionJwt, supabaseJwt, expiresAt } = await mintAuthTokensForIdentity(
    {
      sub,
      discordId: user.id,
      username: user.username,
      globalName,
      avatarUrl,
      guildIds,
    },
    env.SUPABASE_JWT_SECRET,
  );

  const responsePayload: DiscordTokenExchangeResponse = {
    discordAccessToken,
    sessionJwt,
    supabaseJwt,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      globalName,
      avatarUrl,
    },
    guildIds,
  };

  return jsonResponse(responsePayload, 200);
}

export async function handleDiscordTokenRefresh(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.SUPABASE_JWT_SECRET) {
    return errorResponse('SUPABASE_JWT_SECRET is not configured.', 500);
  }

  const existingSession = await requireSessionFromRequest(request, env);
  if (!existingSession) {
    return errorResponse('Invalid or expired session JWT.', 401);
  }

  const refreshed = await mintAuthTokensForIdentity(
    {
      sub: existingSession.sub,
      discordId: existingSession.discordId,
      username: existingSession.username,
      globalName: existingSession.globalName,
      avatarUrl: existingSession.avatarUrl,
      guildIds: existingSession.guildIds,
    },
    env.SUPABASE_JWT_SECRET,
  );

  return jsonResponse(refreshed, 200);
}
