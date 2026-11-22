export interface WorkerEnv
  extends Omit<
    Env,
    | 'DISCORD_APPLICATION_ID'
    | 'DISCORD_CLIENT_SECRET'
    | 'DISCORD_PUBLIC_KEY'
    | 'SUPABASE_URL'
    | 'SUPABASE_PUBLISHABLE_KEY'
    | 'SUPABASE_SERVICE_ROLE_KEY'
    | 'SUPABASE_JWT_SECRET'
  > {
  DISCORD_APPLICATION_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_PUBLIC_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  ALLOWED_REDIRECT_URIS?: string;
  /** Local development only. '1' enables the mock sign-in route on loopback hosts. */
  DEV_MOCK_AUTH?: string;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: message, ...details }, status);
}
