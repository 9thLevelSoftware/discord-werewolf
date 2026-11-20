import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedKey = '';
let cachedClient: SupabaseClient | null = null;
let latestJwtGetter: () => Promise<string | null> = async () => null;

function resolveSupabaseUrl(): string {
  const isDiscordProxy =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.discordsays.com') ||
      window.location.hostname.endsWith('.discordsez.com'));

  if (isDiscordProxy) {
    return new URL('/supabase', window.location.origin).toString();
  }

  const explicitUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const supabaseHost = import.meta.env.VITE_SUPABASE_HOST?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (supabaseHost) {
    return `https://${supabaseHost}`;
  }

  return '';
}

export function getVttSupabaseClient(
  getLatestSupabaseJwt: () => Promise<string | null>
): SupabaseClient {
  latestJwtGetter = getLatestSupabaseJwt;

  const supabaseUrl = resolveSupabaseUrl();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!supabaseUrl) {
    throw new Error(
      'Missing Supabase URL. Set VITE_SUPABASE_URL (or VITE_SUPABASE_HOST) in your Vite environment.'
    );
  }
  if (!publishableKey) {
    throw new Error(
      'Missing VITE_SUPABASE_PUBLISHABLE_KEY in your Vite environment.'
    );
  }

  const cacheIdentity = `${supabaseUrl}::${publishableKey}`;
  if (cachedClient && cachedKey === cacheIdentity) {
    return cachedClient;
  }

  cachedKey = cacheIdentity;
  cachedClient = createClient(supabaseUrl, publishableKey, {
    accessToken: async () => latestJwtGetter(),
  });

  return cachedClient;
}
