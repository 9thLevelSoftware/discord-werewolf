import type { DiscordSessionContext } from './discordBootstrap';

/**
 * Local development only (loaded behind `import.meta.env.DEV`). Signs in as a fixed
 * fake player through the Worker's mock route so the table can run in a normal
 * browser tab: open http://localhost:5173/?mock=1 (or 2, 3 for more players) with
 * the Worker started via `pnpm dev:edge:mock`.
 */

interface MockSessionResponse {
  sessionJwt: string;
  supabaseJwt: string;
  expiresAt: number;
  user: { id: string; username: string };
}

export async function bootstrapMockSession(slot: string): Promise<DiscordSessionContext> {
  const res = await fetch(`/api/dev/mock-session?slot=${encodeURIComponent(slot || '1')}`, {
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Mock sign-in failed (${res.status}). Start the Worker with "pnpm dev:edge:mock". ${body}`
    );
  }

  const data = (await res.json()) as MockSessionResponse;

  return {
    sdk: null,
    discordAccessToken: '',
    sessionJwt: data.sessionJwt,
    supabaseJwt: data.supabaseJwt,
    expiresAt: data.expiresAt,
    userId: data.user.id,
    username: data.user.username,
    avatarUrl: null,
    guildId: null,
    channelId: 'mock-channel',
  };
}
