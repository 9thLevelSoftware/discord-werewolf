import React, { useEffect, useRef } from 'react';
import { DualRealmCanvasController } from './DualRealmCanvasController';
import { useVttRoomStore } from '../store/useVttRoomStore';

export const TacticalViewport: React.FC<{ mapAssetUrl?: string | null }> = ({
  mapAssetUrl,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<DualRealmCanvasController | null>(null);

  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const viewerRealm = useVttRoomStore((s) => s.viewerRealm);
  const stPreview = useVttRoomStore((s) => s.storytellerPreviewRealm);
  const localGauntlet = useVttRoomStore((s) => s.localGauntlet);
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const storeMapAssetUrl = useVttRoomStore((s) => s.mapAssetUrl);
  const activeFogTool = useVttRoomStore((s) => s.activeFogTool);
  const stepSideways = useVttRoomStore((s) => s.stepSideways);
  const setStPreview = useVttRoomStore((s) => s.setStorytellerPreviewRealm);

  const effectiveMapUrl =
    mapAssetUrl !== undefined ? mapAssetUrl : storeMapAssetUrl;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const controller = new DualRealmCanvasController();
    controllerRef.current = controller;
    void controller.mount(el, effectiveMapUrl);

    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, []);

  useEffect(() => {
    void controllerRef.current?.setMapUrl(effectiveMapUrl ?? null);
  }, [effectiveMapUrl]);

  const nextRealm = viewerRealm === 'physical' ? 'penumbra' : 'physical';

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-zinc-950 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* PixiJS v8 WebGL Canvas Mount */}
      <div
        ref={hostRef}
        className={`h-full w-full ${
          viewerRole === 'storyteller' && activeFogTool.active
            ? 'cursor-crosshair'
            : ''
        }`}
      />

      {/* Top-Right Realm & Gauntlet HUD Pill */}
      <div className="pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-2 rounded-lg border border-stone-800 bg-zinc-950/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
        <span className="font-semibold tracking-wide uppercase text-stone-400">
          Gauntlet {localGauntlet}
        </span>
        <span className="h-3 w-px bg-zinc-700" />
        {viewerRole === 'storyteller' ? (
          <div className="flex gap-1">
            {(['both', 'physical', 'penumbra'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setStPreview(mode)}
                className={`rounded px-2 py-1 capitalize transition ${
                  stPreview === mode
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : (
          activeCharacterId && (
            <button
              type="button"
              onClick={() => stepSideways(activeCharacterId, nextRealm)}
              className={`rounded px-2.5 py-1 font-medium transition ${
                viewerRealm === 'penumbra'
                  ? 'bg-cyan-700/80 text-cyan-100 hover:bg-cyan-600'
                  : 'bg-indigo-700/80 text-indigo-100 hover:bg-indigo-600'
              }`}
            >
              {viewerRealm === 'physical'
                ? `Step Sideways (Diff ${localGauntlet})`
                : 'Return to Physical'}
            </button>
          )
        )}
      </div>
    </div>
  );
};
