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

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

export const App: React.FC = () => {
  const [session, setSession] = useState<DiscordSessionContext | null>(null);
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const sessionRef = useRef<DiscordSessionContext | null>(null);
  sessionRef.current = session;

  const runBootstrap = useCallback(async () => {
    setBootState('loading');
    setBootError(null);
    try {
      const ctx = await bootstrapDiscordActivity((isLocal, speakingUserId, active) => {
        useVttRoomStore.getState().setLocalVoiceSpeaking(speakingUserId, isLocal, active);
      });
      setSession(ctx);
      setBootState('ready');
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
        .then((refreshed) => {
          setRefreshWarning(null);
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
          useVttRoomStore.getState().updateSessionJwt(refreshed.sessionJwt);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Session token refresh failed.';
          setRefreshWarning(msg);
        });
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [session?.userId]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#070609] text-stone-100">
      {refreshWarning && (
        <div className="w20-obsidian-panel fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 !border-amber-500/60 rounded-xl px-3 py-1.5 text-xs text-amber-200">
          <span>Session refresh warning: {refreshWarning}</span>
          <button
            type="button"
            onClick={() => setRefreshWarning(null)}
            className="rounded bg-amber-900/70 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-amber-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {bootState === 'loading' ? (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.2)_0%,_#070609_70%)] p-6">
          <div className="w20-obsidian-panel flex max-w-md flex-col items-center rounded-2xl p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-red-500" />
            <h1 className="font-display mt-4 text-lg font-extrabold tracking-widest uppercase text-amber-100">
              Joining W20 Dice Table
            </h1>
            <p className="mt-2 text-xs text-stone-400">
              Completing Discord Activity OAuth2 &amp; voice channel handshake...
            </p>
          </div>
        </div>
      ) : bootState === 'error' || !session ? (
        <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,_rgba(127,29,29,0.2)_0%,_#070609_70%)] p-4">
          <div className="w20-obsidian-panel w-full max-w-lg rounded-2xl !border-red-800/70 p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-red-800/70 bg-red-950/90 p-2.5 text-red-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-base font-extrabold tracking-wider uppercase text-red-200">
                  Discord Activity Connection Required
                </h1>
                <p className="mt-1 text-xs text-stone-300">
                  {bootError ?? 'Unable to establish an authenticated Discord Activity session.'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-zinc-950/90 p-4 text-xs text-stone-400">
              <p className="font-display font-bold uppercase tracking-wider text-amber-200/90">
                Launch Checklist
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4">
                <li>
                  Launch inside a <strong>Discord Voice Channel</strong> via the Activities Rocket
                  button so the Discord Embedded App SDK can authorize your session.
                </li>
                <li>
                  Ensure <code className="text-amber-300">VITE_DISCORD_CLIENT_ID</code> and Discord
                  URL Mappings point <code className="text-stone-200">/</code> to the Worker host.
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void runBootstrap()}
              className="w20-crimson-seal font-display mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest text-amber-50"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Discord Handshake
            </button>
          </div>
        </div>
      ) : (
        <DiceTableWorkspace session={session} />
      )}
    </div>
  );
};

export default App;
