import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';

export interface DiscordSessionContext {
  /** Null only for the local development mock session. */
  sdk: DiscordSDK | null;
  discordAccessToken: string;
  sessionJwt: string;
  supabaseJwt: string;
  expiresAt: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  guildId: string | null;
  channelId: string | null;
}

interface TokenExchangeResponse {
  discordAccessToken: string;
  sessionJwt: string;
  supabaseJwt: string;
  expiresAt: number;
  user?: {
    id: string;
    username: string;
    globalName?: string | null;
    avatarUrl?: string | null;
  };
}

let urlMappingsPatched = false;

const BOOT_STEP_TIMEOUT_MS = 15_000;

/** Rejects if a handshake step never settles, so the loading screen cannot hang forever. */
function withTimeout<T>(step: string, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Discord did not respond in time (${step}).`));
    }, BOOT_STEP_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isDiscordProxyHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.discordsays.com') || host.endsWith('.discordsez.com');
}

function buildDiscordAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined
): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
}

export async function bootstrapDiscordActivity(
  onSpeakingChange: (
    isLocalUserSpeaking: boolean,
    speakingUserId: string,
    active: boolean
  ) => void
): Promise<DiscordSessionContext> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      'Missing VITE_DISCORD_CLIENT_ID. Set VITE_DISCORD_CLIENT_ID before launching the Discord Activity.'
    );
  }

  if (typeof window === 'undefined') {
    throw new Error('Discord Activity bootstrap must run inside a browser iframe.');
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (!searchParams.get('frame_id') || !searchParams.get('instance_id')) {
    throw new Error(
      'This application must be launched as a Discord Activity inside a Discord voice channel (missing frame_id / instance_id).'
    );
  }

  const supabaseHost = import.meta.env.VITE_SUPABASE_HOST?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  if ((import.meta.env.PROD || isDiscordProxyHost()) && supabaseHost && !urlMappingsPatched) {
    patchUrlMappings([{ prefix: '/supabase', target: supabaseHost }]);
    urlMappingsPatched = true;
  }

  const sdk = new DiscordSDK(clientId);
  await withTimeout('starting the activity', sdk.ready());

  const { code } = await withTimeout(
    'authorizing',
    sdk.commands.authorize({
      client_id: clientId,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds', 'rpc.voice.read'],
    })
  );

  const tokenRes = await withTimeout(
    'signing in',
    fetch('/api/discord-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  );

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => '');
    throw new Error(
      `Discord OAuth token exchange failed (${tokenRes.status}): ${errBody || tokenRes.statusText}`
    );
  }

  const tokenData = (await tokenRes.json()) as TokenExchangeResponse;
  if (!tokenData.discordAccessToken || !tokenData.sessionJwt || !tokenData.supabaseJwt) {
    throw new Error('Worker returned an incomplete Discord/Supabase session payload.');
  }

  const auth = await withTimeout(
    'confirming your account',
    sdk.commands.authenticate({
      access_token: tokenData.discordAccessToken,
    })
  );

  if (!auth?.user) {
    throw new Error('Discord Activity authentication failed.');
  }

  if (sdk.channelId) {
    await sdk.subscribe(
      'SPEAKING_START',
      ({ user_id }) => {
        onSpeakingChange(user_id === auth.user.id, user_id, true);
      },
      { channel_id: sdk.channelId }
    );

    await sdk.subscribe(
      'SPEAKING_STOP',
      ({ user_id }) => {
        onSpeakingChange(user_id === auth.user.id, user_id, false);
      },
      { channel_id: sdk.channelId }
    );
  }

  const avatarUrl =
    tokenData.user?.avatarUrl ?? buildDiscordAvatarUrl(auth.user.id, auth.user.avatar);

  return {
    sdk,
    discordAccessToken: tokenData.discordAccessToken,
    sessionJwt: tokenData.sessionJwt,
    supabaseJwt: tokenData.supabaseJwt,
    expiresAt: tokenData.expiresAt,
    userId: auth.user.id,
    username:
      tokenData.user?.globalName ??
      auth.user.global_name ??
      tokenData.user?.username ??
      auth.user.username,
    avatarUrl,
    guildId: sdk.guildId,
    channelId: sdk.channelId,
  };
}

export async function refreshWorkerTokens(
  sessionJwt: string
): Promise<{ sessionJwt: string; supabaseJwt: string; expiresAt: number }> {
  if (!sessionJwt) {
    throw new Error('Cannot refresh tokens without an active sessionJwt.');
  }

  const res = await fetch('/api/discord-token/refresh', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionJwt}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Session token refresh failed (${res.status}): ${errBody || res.statusText}`);
  }

  const data = (await res.json()) as {
    sessionJwt: string;
    supabaseJwt: string;
    expiresAt: number;
  };

  if (!data.sessionJwt || !data.supabaseJwt) {
    throw new Error('Worker refresh endpoint returned an incomplete token payload.');
  }

  return data;
}
