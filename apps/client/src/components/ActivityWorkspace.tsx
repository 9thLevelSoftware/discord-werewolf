import React, { useState } from 'react';
import { LogOut, Wifi, WifiOff } from 'lucide-react';
import { DiscordSessionContext } from '../discordBootstrap';
import { useVttRoomStore } from '../store/useVttRoomStore';
import { connectionLabel } from './dice-table/console/consoleShared';
import { TacticalViewport } from '../canvas/TacticalViewport';
import { DiceOverlay3D } from './DiceOverlay3D';
import { GarouCharacterHud } from './GarouCharacterHud';
import { CharacterSheetDrawer } from './CharacterSheetDrawer';
import { ReverseInitiativeTracker } from './ReverseInitiativeTracker';
import { StorytellerControlDeck } from './StorytellerControlDeck';
import { ImmersionOverlays } from './ImmersionOverlays';

interface ActivityWorkspaceProps {
  session?: DiscordSessionContext | null;
  getLatestSupabaseJwt?: () => Promise<string | null>;
  onLeaveRoom?: () => void;
  mapAssetUrl?: string | null;
}

export const ActivityWorkspace: React.FC<ActivityWorkspaceProps> = ({
  session,
  getLatestSupabaseJwt,
  onLeaveRoom,
  mapAssetUrl,
}) => {
  const storeMapAssetUrl = useVttRoomStore((s) => s.mapAssetUrl);
  const storeSessionJwt = useVttRoomStore((s) => s.sessionJwt);
  const connectionStatus = useVttRoomStore((s) => s.connectionStatus);

  const [sheetOpen, setSheetOpen] = useState(false);

  const effectiveSessionJwt = session?.sessionJwt ?? storeSessionJwt ?? undefined;
  const effectiveMapUrl = mapAssetUrl !== undefined ? mapAssetUrl : storeMapAssetUrl;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-zinc-950 text-stone-100">
      {/* Z-0: PixiJS v8 Dual-Realm Battlemap, Fog of War & Voice-Reactive Tokens */}
      <TacticalViewport mapAssetUrl={effectiveMapUrl} />

      {/* Top-Center Connection Status & Lobby Switch Pill */}
      <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full w20-obsidian-panel px-3 py-1 text-xs">
        {connectionStatus === 'authenticated' ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 animate-pulse text-amber-400" />
        )}
        <span className="text-stone-300">{connectionLabel(connectionStatus)}</span>
        {onLeaveRoom && (
          <>
            <span className="h-3 w-px bg-zinc-700" />
            <button
              type="button"
              onClick={onLeaveRoom}
              aria-label="Return to Chronicle Lobby"
              title="Return to Chronicle Lobby"
              className="flex items-center gap-1 text-stone-400 hover:text-stone-100"
            >
              <LogOut className="h-3 w-3" />
              Lobby
            </button>
          </>
        )}
      </div>

      {/* Z-30: Collapsible Storyteller Control Deck (ST only) */}
      <StorytellerControlDeck sessionJwt={effectiveSessionJwt} />

      {/* Z-30: Docked W20 Character Shifter & Resource HUD */}
      <GarouCharacterHud
        sheetOpen={sheetOpen}
        onToggleSheet={() => setSheetOpen((v) => !v)}
      />

      {/* Z-30: Right-Hand W20 Reverse Initiative & Combat Tracker */}
      <ReverseInitiativeTracker />

      {/* Z-40: Collapsible Full W20 Character Sheet Drawer */}
      <CharacterSheetDrawer
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sessionJwt={effectiveSessionJwt}
        getLatestSupabaseJwt={getLatestSupabaseJwt}
      />

      {/* Z-40/50: Pack Totem, Handouts, Whispers, Frenzy Prompt, X-Card & Error Toasts */}
      <ImmersionOverlays />

      {/* Z-40: Fullscreen Transparent 3D Dice Physics & Result Banner */}
      <DiceOverlay3D assetPath="/assets/dice-box/" />
    </main>
  );
};
