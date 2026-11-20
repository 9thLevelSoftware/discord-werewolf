import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DiscordSessionContext, refreshWorkerTokens } from './discordBootstrap';
import { soundscapeEngine } from './audio/SyncedSoundscapeEngine';
import { useVttRoomStore } from './store/useVttRoomStore';
import { CampaignLobbyGate } from './components/CampaignLobbyGate';
import { ActivityWorkspace } from './components/ActivityWorkspace';

const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

export const App: React.FC = () => {
  const [session, setSession] = useState<DiscordSessionContext | null>(null);
  const [inRoom, setInRoom] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const sessionRef = useRef<DiscordSessionContext | null>(null);
  sessionRef.current = session;

  // Unlock Web Audio API on the user's very first interaction anywhere in the Activity iframe
  useEffect(() => {
    let unlocked = false;
    const handleFirstGesture = () => {
      if (unlocked) return;
      unlocked = true;
      soundscapeEngine.unlockOnFirstGesture();
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    };

    window.addEventListener('pointerdown', handleFirstGesture, { capture: true, passive: true });
    window.addEventListener('keydown', handleFirstGesture, { capture: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
    };
  }, []);

  // Proactive 45-minute token refresh for both Worker sessionJwt and Supabase JWT
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

  const getLatestSupabaseJwt = useCallback(async (): Promise<string | null> => {
    return sessionRef.current?.supabaseJwt ?? null;
  }, []);

  const handleLeaveRoom = useCallback(() => {
    useVttRoomStore.getState().disconnectRoom();
    setInRoom(false);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {refreshWarning && (
        <div className="fixed top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-950/95 px-3 py-1.5 text-xs text-amber-200 shadow-lg">
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

      {!inRoom || !session ? (
        <CampaignLobbyGate
          session={session}
          onSessionReady={setSession}
          onEnterRoom={() => setInRoom(true)}
          getLatestSupabaseJwt={getLatestSupabaseJwt}
        />
      ) : (
        <ActivityWorkspace
          session={session}
          getLatestSupabaseJwt={getLatestSupabaseJwt}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </div>
  );
};

export default App;
