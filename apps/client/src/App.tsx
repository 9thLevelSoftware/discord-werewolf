import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import {
  bootstrapDiscordActivity,
  type DiscordSessionContext,
  refreshWorkerTokens,
} from './discordBootstrap';
import { soundscapeEngine } from './audio/SyncedSoundscapeEngine';
import { diceSoundEngine } from './audio/DiceSoundEngine';
import { useVttRoomStore } from './store/useVttRoomStore';
import { DiceTableWorkspace } from './components/DiceTableWorkspace';
import { Button, ToastViewport, useToasts } from './components/ui';

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

/** Turns a raw bootstrap error into a sentence a player can act on. */
export function describeBootError(raw: string | null): string {
  const text = (raw ?? '').toLowerCase();
  if (text.includes('frame_id') || text.includes('instance_id')) {
    return 'Open this from a Discord voice channel: join the channel, press the Activities (rocket) button and pick the dice table.';
  }
  if (text.includes('did not respond in time')) {
    return 'Discord took too long to respond. Check your connection and try again.';
  }
  if (text.includes('token exchange') || text.includes('authentication failed')) {
    return 'Discord could not sign you in. Try again, or close and reopen the activity.';
  }
  return 'The dice table could not connect to Discord. Try again in a moment.';
}

export const App: React.FC = () => {
  const [session, setSession] = useState<DiscordSessionContext | null>(null);
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const sessionRef = useRef<DiscordSessionContext | null>(null);
  sessionRef.current = session;
  const triedSilentRefreshRef = useRef(false);

  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);

  const applyRefreshedTokens = useCallback(
    (refreshed: { sessionJwt: string; supabaseJwt: string; expiresAt: number }) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sessionJwt: refreshed.sessionJwt,
              supabaseJwt: refreshed.supabaseJwt,
              expiresAt: refreshed.expiresAt,
            }
          : prev
      );
      // Also reconnects the room if it was stopped by an expired session.
      useVttRoomStore.getState().updateSessionJwt(refreshed.sessionJwt);
    },
    []
  );

  const runBootstrap = useCallback(async () => {
    setBootState('loading');
    setBootError(null);
    try {
      // Development only: `?mock=1` signs in as a fake player without Discord.
      const mockSlot = import.meta.env.DEV
        ? new URLSearchParams(window.location.search).get('mock')
        : null;
      const ctx =
        import.meta.env.DEV && mockSlot !== null
          ? await (await import('./devMockSession')).bootstrapMockSession(mockSlot)
          : await bootstrapDiscordActivity((isLocal, speakingUserId, active) => {
              useVttRoomStore.getState().setLocalVoiceSpeaking(speakingUserId, isLocal, active);
            });
      setSession(ctx);
      setBootState('ready');
      setSessionExpired(false);
      triedSilentRefreshRef.current = false;
      useVttRoomStore.getState().updateSessionJwt(ctx.sessionJwt);
    } catch (err: unknown) {
      setBootError(err instanceof Error ? err.message : 'Unable to connect to Discord Activity.');
      setBootState('error');
    }
  }, []);

  // Unlock Web Audio API on first gesture and automatically run Discord Activity handshake on mount
  useEffect(() => {
    let unlocked = false;
    const handleFirstGesture = () => {
      if (unlocked) return;
      unlocked = true;
      soundscapeEngine.unlockOnFirstGesture();
      diceSoundEngine.unlock();
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    };

    window.addEventListener('pointerdown', handleFirstGesture, { capture: true, passive: true });
    window.addEventListener('keydown', handleFirstGesture, { capture: true, passive: true });

    void runBootstrap();

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    };
  }, [runBootstrap]);

  // Connect straight to the voice-channel's shared 3D dice room once Discord session is ready
  useEffect(() => {
    if (!session) return;
    const wsProtocol = window.location.protocol === 'http:' ? 'ws:' : 'wss:';
    const roomSlug = `dice-room-${encodeURIComponent(session.channelId ?? session.guildId ?? 'lobby')}`;
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/room/${roomSlug}`;

    useVttRoomStore.getState().connectRoom({
      wsUrl,
      sessionJwt: session.sessionJwt,
      localDiscordId: session.userId,
      campaignId: roomSlug,
      characterId: null,
    });

    return () => {
      useVttRoomStore.getState().disconnectRoom();
    };
  }, [session?.userId, session?.channelId, session?.guildId]);

  // Proactive 45-minute token refresh for Worker sessionJwt
  useEffect(() => {
    if (!session?.sessionJwt) return;

    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current?.sessionJwt) return;

      void refreshWorkerTokens(current.sessionJwt)
        .then(applyRefreshedTokens)
        .catch(warnSessionRefreshFailed);
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [session?.userId, applyRefreshedTokens]);

  // The server refused our session. Try one silent refresh; if that fails (or the
  // refreshed session is refused too), stop and ask the player to rejoin.
  useEffect(() => {
    if (connectionStatus === 'authenticated') {
      triedSilentRefreshRef.current = false;
      setSessionExpired(false);
      return;
    }
    if (connectionStatus !== 'session_expired') return;

    const current = sessionRef.current;
    if (triedSilentRefreshRef.current || !current?.sessionJwt) {
      setSessionExpired(true);
      return;
    }
    triedSilentRefreshRef.current = true;
    void refreshWorkerTokens(current.sessionJwt)
      .then(applyRefreshedTokens)
      .catch(() => setSessionExpired(true));
  }, [connectionStatus, applyRefreshedTokens]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-obsidian-950 text-stone-100">
      <ToastViewport />

      {sessionExpired && bootState === 'ready' && (
        <div
          role="alert"
          className="w20-obsidian-panel pt-safe fixed top-2 left-1/2 z-toast flex w-[min(92vw,30rem)] -translate-x-1/2 flex-wrap items-center justify-between gap-2 !border-red-600/80 rounded-xl px-3 py-2 text-xs text-red-100"
        >
          <span className="min-w-0 flex-1">
            Your session has expired, so rolls are paused. Rejoin to carry on.
          </span>
          <Button size="sm" variant="secondary" onClick={() => void runBootstrap()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Rejoin
          </Button>
        </div>
      )}

      {bootState === 'loading' ? (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.2)_0%,_var(--color-obsidian-950)_70%)] p-6">
          <div
            role="status"
            className="w20-obsidian-panel flex max-w-md flex-col items-center rounded-2xl p-8 text-center"
          >
            <Loader2 className="h-10 w-10 animate-spin text-red-500" />
            <h1 className="font-display mt-4 text-lg font-extrabold tracking-widest uppercase text-amber-100">
              Joining the dice table
            </h1>
            <p className="mt-2 text-sm text-stone-300">Signing you in with Discord…</p>
          </div>
        </div>
      ) : bootState === 'error' || !session ? (
        <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.2)_0%,_var(--color-obsidian-950)_70%)] p-4">
          <div
            role="alert"
            className="w20-obsidian-panel w-full max-w-lg rounded-2xl !border-red-800/70 p-6"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-red-800/70 bg-red-950/90 p-2.5 text-red-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-base font-extrabold tracking-wider uppercase text-red-200">
                  Couldn&rsquo;t join the table
                </h1>
                <p className="mt-1 text-sm text-stone-300">{describeBootError(bootError)}</p>
              </div>
            </div>

            <Button
              variant="primary"
              size="touch"
              fullWidth
              className="mt-4"
              onClick={() => void runBootstrap()}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>

            <details className="mt-4 rounded-xl border border-amber-500/20 bg-zinc-950/90 p-3 text-xs text-stone-400">
              <summary className="cursor-pointer font-semibold text-stone-300">
                Technical details
              </summary>
              <p className="mt-2 break-words font-mono text-stone-300">
                {bootError ?? 'No authenticated Discord Activity session.'}
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4">
                <li>
                  The activity must be launched inside a Discord voice channel so the Embedded App
                  SDK can authorize the session.
                </li>
                <li>
                  <code className="text-amber-300">VITE_DISCORD_CLIENT_ID</code> must be set, and
                  the Discord URL Mapping for <code className="text-stone-200">/</code> must point
                  to the Worker host.
                </li>
              </ul>
            </details>
          </div>
        </div>
      ) : (
        <DiceTableWorkspace session={session} />
      )}
    </div>
  );
};

/** Shown when a background session refresh fails; the next refresh may still succeed. */
function warnSessionRefreshFailed(): void {
  useToasts.getState().push({
    id: 'session-refresh',
    tone: 'error',
    durationMs: 0,
    message:
      'Could not refresh your session in the background. If rolls stop working, rejoin the activity.',
  });
}

export default App;
