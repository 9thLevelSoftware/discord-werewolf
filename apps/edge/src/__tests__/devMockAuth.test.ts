import { describe, expect, it, vi } from 'vitest';
import { verifySessionJwt } from '../discordOAuth';
import worker from '../index';
import { createMockEnv } from './shims/cfTestHarness';

const EXECUTION_CTX = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function post(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers });
}

describe('dev mock sign-in route', () => {
  it('is not available unless DEV_MOCK_AUTH is enabled', async () => {
    const env = createMockEnv();
    const res = await worker.fetch(post('http://localhost:8787/api/dev/mock-session'), env, EXECUTION_CTX);
    expect(res.status).toBe(404);
  });

  it('is not available on a non-loopback host even when enabled', async () => {
    const env = { ...createMockEnv(), DEV_MOCK_AUTH: '1' };
    const res = await worker.fetch(
      post('https://w20-discord-vtt.example.workers.dev/api/dev/mock-session'),
      env,
      EXECUTION_CTX,
    );
    expect(res.status).toBe(404);
  });

  it('mints a verifiable session for a mock slot and blocks its cloud access', async () => {
    const env = { ...createMockEnv(), DEV_MOCK_AUTH: '1' };
    const res = await worker.fetch(
      post('http://localhost:8787/api/dev/mock-session?slot=2'),
      env,
      EXECUTION_CTX,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionJwt: string; user: { id: string; username: string } };
    const claims = await verifySessionJwt(body.sessionJwt, env.SUPABASE_JWT_SECRET);
    expect(claims?.discordId).toBe(body.user.id);
    expect(body.user.username).toBe('Mock Player Two');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const sheets = await worker.fetch(
      new Request('http://localhost:8787/api/me/character-sheets', {
        headers: { Authorization: `Bearer ${body.sessionJwt}` },
      }),
      env,
      EXECUTION_CTX,
    );
    expect(sheets.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects an unknown slot', async () => {
    const env = { ...createMockEnv(), DEV_MOCK_AUTH: '1' };
    const res = await worker.fetch(
      post('http://localhost:8787/api/dev/mock-session?slot=99'),
      env,
      EXECUTION_CTX,
    );
    expect(res.status).toBe(400);
  });
});
