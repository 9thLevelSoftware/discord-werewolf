import React, { useState } from 'react';
import {
  MOON_BASE_FRENZY_DIFF,
  MoonPhase,
  RealmLayer,
  SpecialtyMode,
} from '@w20-vtt/core';
import { NpcSpawnTemplateId } from '@w20-vtt/protocol';
import {
  Eye,
  EyeOff,
  Music,
  Send,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';

type DeckTab = 'world' | 'fog' | 'spawner' | 'audio';

const MOON_LABELS: Record<MoonPhase, string> = {
  new: 'New Moon (Ragabash)',
  crescent: 'Crescent Moon (Theurge)',
  half: 'Half Moon (Philodox)',
  gibbous: 'Gibbous Moon (Galliard)',
  full: 'Full Moon (Ahroun)',
};

const GAUNTLET_PRESETS = [
  { label: 'Active Caern', rating: 3 },
  { label: 'Deep Wilderness', rating: 5 },
  { label: 'Rural / Suburb', rating: 6 },
  { label: 'Downtown City', rating: 7 },
  { label: 'Pentex / Weaver Lab', rating: 9 },
] as const;

const ANTAGONIST_TEMPLATES: Array<{
  id: NpcSpawnTemplateId;
  name: string;
  initMod: number;
  healthBoxes: number;
  defaultRealm: RealmLayer;
}> = [
  {
    id: 'pentex_first_team',
    name: 'Pentex First Team Trooper',
    initMod: 6,
    healthBoxes: 7,
    defaultRealm: 'physical',
  },
  {
    id: 'fomor_berserker',
    name: 'Bane-Possessed Fomor',
    initMod: 5,
    healthBoxes: 9,
    defaultRealm: 'physical',
  },
  {
    id: 'bsd_crinos',
    name: 'Black Spiral Dancer (Crinos)',
    initMod: 8,
    healthBoxes: 7,
    defaultRealm: 'physical',
  },
  {
    id: 'scrag_bane',
    name: 'Scrag Hunter-Bane',
    initMod: 7,
    healthBoxes: 8,
    defaultRealm: 'penumbra',
  },
  {
    id: 'nexus_crawler',
    name: 'Nexus Crawler',
    initMod: 9,
    healthBoxes: 10,
    defaultRealm: 'penumbra',
  },
];

interface StorytellerControlDeckProps {
  sessionJwt?: string;
}

export const StorytellerControlDeck: React.FC<StorytellerControlDeckProps> = ({
  sessionJwt,
}) => {
  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const campaignId = useVttRoomStore((s) => s.campaignId);
  const localGauntlet = useVttRoomStore((s) => s.localGauntlet);
  const moonPhase = useVttRoomStore((s) => s.moonPhase);
  const specialtyMode = useVttRoomStore((s) => s.specialtyMode);
  const mapAssetUrl = useVttRoomStore((s) => s.mapAssetUrl);
  const activeFogTool = useVttRoomStore((s) => s.activeFogTool);
  const setActiveFogTool = useVttRoomStore((s) => s.setActiveFogTool);
  const audioState = useVttRoomStore((s) => s.audioState);
  const activeHandout = useVttRoomStore((s) => s.activeHandout);
  const tokens = useVttRoomStore((s) => s.tokens);
  const characters = useVttRoomStore((s) => s.characters);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<DeckTab>('world');

  // World Map & Upload state
  const [mapUrlDraft, setMapUrlDraft] = useState(mapAssetUrl ?? '');
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // NPC Spawner state
  const [spawnRealm, setSpawnRealm] = useState<RealmLayer>('physical');
  const [spawnHidden, setSpawnHidden] = useState(true);
  const [spawnQty, setSpawnQty] = useState(1);

  // Audio, Handout & Whisper state
  const [physicalTrackUrl, setPhysicalTrackUrl] = useState(audioState?.physicalTrackUrl ?? '');
  const [penumbraTrackUrl, setPenumbraTrackUrl] = useState(audioState?.penumbraTrackUrl ?? '');
  const [masterVolume, setMasterVolume] = useState(audioState?.masterVolume ?? 0.65);
  const [customStingUrl, setCustomStingUrl] = useState('');

  const [handoutImageUrl, setHandoutImageUrl] = useState('');
  const [handoutCaption, setHandoutCaption] = useState('');

  const [whisperTargetId, setWhisperTargetId] = useState('');
  const [whisperTitle, setWhisperTitle] = useState('');
  const [whisperBody, setWhisperBody] = useState('');

  if (viewerRole !== 'storyteller') return null;

  const updateWorldEnv = (
    nextGauntlet: number,
    nextMoon: MoonPhase,
    nextSpecialty: SpecialtyMode = specialtyMode,
    nextMapUrl?: string | null
  ) => {
    const cleanMap =
      nextMapUrl !== undefined
        ? nextMapUrl?.trim() || null
        : mapAssetUrl ?? null;

    sendCommand({
      type: 'ST_SET_WORLD_ENV',
      localGauntlet: nextGauntlet,
      moonPhase: nextMoon,
      specialtyMode: nextSpecialty,
      ...(cleanMap !== undefined ? { mapAssetUrl: cleanMap } : {}),
    });
  };

  const uploadR2Asset = async (
    category: 'maps' | 'handouts' | 'audio',
    file: File
  ): Promise<string | null> => {
    if (!sessionJwt) {
      setUploadError('Missing session JWT for R2 upload.');
      return null;
    }
    setUploadingAsset(true);
    setUploadError(null);
    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const query = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
      const res = await fetch(
        `/api/assets/${encodeURIComponent(category)}/${encodeURIComponent(safeName)}${query}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${sessionJwt}`,
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        }
      );
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `Asset upload failed (${res.status}).`;
        throw new Error(msg);
      }
      const obj = data as { url?: string; assetUrl?: string };
      return obj.url ?? obj.assetUrl ?? `/r2-assets/${category}/${safeName}`;
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Asset upload failed.');
      return null;
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadedUrl = await uploadR2Asset('maps', file);
    if (uploadedUrl) {
      setMapUrlDraft(uploadedUrl);
      updateWorldEnv(localGauntlet, moonPhase, specialtyMode, uploadedUrl);
    }
    e.target.value = '';
  };

  const handleHandoutUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadedUrl = await uploadR2Asset('handouts', file);
    if (uploadedUrl) {
      setHandoutImageUrl(uploadedUrl);
    }
    e.target.value = '';
  };

  const playerRecipients = Array.from(
    new Map(
      Object.values(characters)
        .filter((c) => !c.isNpc)
        .map((c) => [c.ownerDiscordId, c.name])
    ).entries()
  );

  const effectiveWhisperTarget = whisperTargetId.trim() || playerRecipients[0]?.[0] || '';

  return (
    <section className="pointer-events-auto absolute top-3 left-3 z-30 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-zinc-800 bg-zinc-950/92 text-xs text-zinc-100 shadow-2xl backdrop-blur">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-extrabold tracking-wider uppercase text-zinc-200">
            Storyteller Deck
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700"
        >
          {collapsed ? 'Expand' : 'Minimize'}
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-3">
          {/* Navigation Tabs */}
          <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-zinc-900 p-1">
            {(['world', 'fog', 'spawner', 'audio'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded py-1 font-bold capitalize transition ${
                  activeTab === tab
                    ? 'bg-red-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {uploadError && (
            <div className="mb-2 rounded border border-red-800 bg-red-950/60 p-2 text-[11px] text-red-200">
              {uploadError}
            </div>
          )}

          {/* TAB 1: WORLD ENV (GAUNTLET, MOON, SPECIALTY MODE, BATTLEMAP) */}
          {activeTab === 'world' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between font-semibold">
                  <span>Local Gauntlet Rating</span>
                  <span className="font-mono text-cyan-400">Diff {localGauntlet}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={localGauntlet}
                  onChange={(e) =>
                    updateWorldEnv(Number(e.target.value), moonPhase, specialtyMode)
                  }
                  className="mt-1 w-full accent-cyan-500"
                />
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {GAUNTLET_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => updateWorldEnv(p.rating, moonPhase, specialtyMode)}
                      className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-cyan-600"
                    >
                      {p.label} ({p.rating})
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-2.5">
                <span className="block font-semibold">Luna’s Phase &amp; Frenzy Difficulty</span>
                <select
                  value={moonPhase}
                  onChange={(e) =>
                    updateWorldEnv(
                      localGauntlet,
                      e.target.value as MoonPhase,
                      specialtyMode
                    )
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-zinc-100"
                >
                  {(Object.keys(MOON_LABELS) as MoonPhase[]).map((phase) => (
                    <option key={phase} value={phase}>
                      {MOON_LABELS[phase]} — Frenzy Diff {MOON_BASE_FRENZY_DIFF[phase]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t border-zinc-800 pt-2.5">
                <span className="block font-semibold">Specialty Rule Mode</span>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['w20_double', 'W20 (10 = 2 Succ)'],
                      ['revised_explode', 'Revised (Explode 10s)'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateWorldEnv(localGauntlet, moonPhase, mode)}
                      className={`rounded border py-1 text-[10px] font-semibold ${
                        specialtyMode === mode
                          ? 'border-red-500 bg-red-950/60 text-red-200'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-2.5">
                <span className="block font-semibold">Tactical Map Asset (R2 / URL)</span>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="text"
                    value={mapUrlDraft}
                    onChange={(e) => setMapUrlDraft(e.target.value)}
                    placeholder="/r2-assets/maps/caern-glade.webp"
                    className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateWorldEnv(
                        localGauntlet,
                        moonPhase,
                        specialtyMode,
                        mapUrlDraft.trim() || null
                      )
                    }
                    className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-bold hover:bg-zinc-700"
                  >
                    Set
                  </button>
                </div>
                <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-800">
                  <Upload className="h-3 w-3" />
                  {uploadingAsset ? 'Uploading to R2...' : 'Upload Map Image to R2'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingAsset}
                    onChange={(e) => void handleMapUpload(e)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: GPU FOG OF WAR */}
          {activeTab === 'fog' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Interactive Map Brush</span>
                <button
                  type="button"
                  onClick={() =>
                    setActiveFogTool({
                      ...activeFogTool,
                      active: !activeFogTool.active,
                    })
                  }
                  className={`rounded px-2.5 py-1 font-bold ${
                    activeFogTool.active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {activeFogTool.active ? 'Brush Active' : 'Enable Brush'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setActiveFogTool({
                      active: true,
                      mode: 'reveal',
                      radius: activeFogTool.radius,
                    })
                  }
                  className={`rounded border py-1.5 font-semibold ${
                    activeFogTool.mode === 'reveal'
                      ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Reveal Vision
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setActiveFogTool({
                      active: true,
                      mode: 'shroud',
                      radius: activeFogTool.radius,
                    })
                  }
                  className={`rounded border py-1.5 font-semibold ${
                    activeFogTool.mode === 'shroud'
                      ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}
                >
                  Re-Shroud Area
                </button>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-zinc-400">
                  <span>Brush Radius</span>
                  <span>{activeFogTool.radius}px</span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={300}
                  value={activeFogTool.radius}
                  onChange={(e) =>
                    setActiveFogTool({
                      ...activeFogTool,
                      radius: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex gap-1.5 border-t border-zinc-800 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    sendCommand({
                      type: 'ST_FOG_STROKE',
                      stroke: {
                        mode: 'reset_shroud_all',
                        shape: 'rect',
                        x: 0,
                        y: 0,
                        radiusOrWidth: 0,
                      },
                    })
                  }
                  className="flex-1 rounded bg-zinc-800 py-1 font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  Shroud All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    sendCommand({
                      type: 'ST_FOG_STROKE',
                      stroke: {
                        mode: 'reset_reveal_all',
                        shape: 'rect',
                        x: 0,
                        y: 0,
                        radiusOrWidth: 0,
                      },
                    })
                  }
                  className="flex-1 rounded bg-zinc-800 py-1 font-semibold text-zinc-300 hover:bg-zinc-700"
                >
                  Reveal All
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ANTAGONIST & BANE SPAWNER + TOKEN ROSTER */}
          {activeTab === 'spawner' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <select
                  value={spawnRealm}
                  onChange={(e) => setSpawnRealm(e.target.value as RealmLayer)}
                  className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                >
                  <option value="physical">Physical Realm</option>
                  <option value="penumbra">Penumbra (Spirit)</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={spawnQty}
                  onChange={(e) =>
                    setSpawnQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                  }
                  className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-center font-mono"
                  title="Pack Quantity"
                />
              </div>

              <label className="flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={spawnHidden}
                  onChange={(e) => setSpawnHidden(e.target.checked)}
                />
                Spawn Hidden (Invisible on Player Sockets)
              </label>

              <div className="space-y-1">
                {ANTAGONIST_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() =>
                      sendCommand({
                        type: 'ST_SPAWN_NPC_TEMPLATE',
                        templateId: tpl.id,
                        quantity: spawnQty,
                        realm: spawnRealm,
                        isHidden: spawnHidden,
                      })
                    }
                    className="flex w-full items-center justify-between rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left hover:border-red-500/70"
                  >
                    <span className="font-semibold text-zinc-200">{tpl.name}</span>
                    <span className="text-[10px] uppercase text-zinc-400">
                      +{tpl.initMod} Init • {tpl.healthBoxes} HP
                    </span>
                  </button>
                ))}
              </div>

              {/* Active Scene Tokens */}
              <div className="border-t border-zinc-800 pt-2">
                <p className="mb-1 text-[10px] font-bold uppercase text-zinc-400">
                  Scene Tokens ({tokens.length})
                </p>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {tokens.map((tok) => (
                    <div
                      key={tok.id}
                      className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-zinc-200">{tok.name}</div>
                        <div className="text-[10px] capitalize text-zinc-500">
                          {tok.realm} • {tok.form} {tok.isHidden ? '• Hidden' : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            sendCommand({
                              type: 'ST_TOGGLE_TOKEN_HIDDEN',
                              tokenId: tok.id,
                              isHidden: !tok.isHidden,
                            })
                          }
                          title={tok.isHidden ? 'Reveal to players' : 'Hide from players'}
                          className="rounded border border-zinc-700 bg-zinc-950 p-1 text-zinc-300 hover:border-amber-500"
                        >
                          {tok.isHidden ? (
                            <EyeOff className="h-3 w-3 text-amber-400" />
                          ) : (
                            <Eye className="h-3 w-3 text-emerald-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            sendCommand({
                              type: 'ST_REMOVE_TOKEN',
                              tokenId: tok.id,
                            })
                          }
                          title="Remove token from scene"
                          className="rounded border border-zinc-700 bg-zinc-950 p-1 text-zinc-400 hover:border-red-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SYNCHRONIZED AUDIO, HANDOUT & WHISPERS */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              {/* Synced Realm Loops */}
              <div className="space-y-1.5">
                <span className="flex items-center gap-1 font-semibold text-zinc-300">
                  <Music className="h-3.5 w-3.5 text-cyan-400" />
                  Synced Dual-Realm Soundscape Loops
                </span>
                <input
                  type="text"
                  placeholder="Physical Track URL (/r2-assets/audio/city.ogg)"
                  value={physicalTrackUrl}
                  onChange={(e) => setPhysicalTrackUrl(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Penumbra Track URL (/r2-assets/audio/umbra.ogg)"
                  value={penumbraTrackUrl}
                  onChange={(e) => setPenumbraTrackUrl(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                />
                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                  <span>Volume: {Math.round(masterVolume * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={masterVolume}
                    onChange={(e) => setMasterVolume(Number(e.target.value))}
                    className="flex-1 accent-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({
                        type: 'ST_SYNC_AUDIO',
                        payload: {
                          physicalTrackUrl: physicalTrackUrl.trim() || null,
                          penumbraTrackUrl: penumbraTrackUrl.trim() || null,
                          startedAtServerMs: Date.now(),
                          masterVolume,
                        },
                      })
                    }
                    className="rounded bg-cyan-700 px-2.5 py-1 font-bold text-white hover:bg-cyan-600"
                  >
                    Sync
                  </button>
                </div>
              </div>

              {/* One-Shot Dramatic Stings */}
              <div className="border-t border-zinc-800 pt-2">
                <span className="flex items-center gap-1 font-semibold text-zinc-300">
                  <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                  One-Shot Dramatic Stings
                </span>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Crinos Howl', url: '/r2-assets/sfx/crinos-howl.ogg' },
                    { label: 'Gauntlet Tear', url: '/r2-assets/sfx/gauntlet-rip.ogg' },
                    { label: 'Klaive Draw', url: '/r2-assets/sfx/klaive-ring.ogg' },
                    { label: 'Wyrm Taint', url: '/r2-assets/sfx/wyrm-drone.ogg' },
                  ].map((sfx) => (
                    <button
                      key={sfx.label}
                      type="button"
                      onClick={() =>
                        sendCommand({
                          type: 'ST_TRIGGER_AUDIO_STING',
                          stingUrl: sfx.url,
                        })
                      }
                      className="rounded border border-zinc-800 bg-zinc-900 py-1 text-[11px] font-semibold text-zinc-200 hover:border-amber-500/70"
                    >
                      {sfx.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Custom sting URL"
                    value={customStingUrl}
                    onChange={(e) => setCustomStingUrl(e.target.value)}
                    className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                  />
                  <button
                    type="button"
                    disabled={!customStingUrl.trim()}
                    onClick={() =>
                      sendCommand({
                        type: 'ST_TRIGGER_AUDIO_STING',
                        stingUrl: customStingUrl.trim(),
                      })
                    }
                    className="rounded bg-zinc-800 px-2.5 py-1 text-[11px] font-bold hover:bg-zinc-700 disabled:opacity-40"
                  >
                    Play
                  </button>
                </div>
              </div>

              {/* Handout Reveal */}
              <div className="space-y-1.5 border-t border-zinc-800 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-300">Push Fullscreen Handout</span>
                  <label className="cursor-pointer text-[10px] text-indigo-300 underline">
                    Upload R2
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingAsset}
                      onChange={(e) => void handleHandoutUpload(e)}
                      className="hidden"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="/r2-assets/handouts/pentex-memo.webp"
                  value={handoutImageUrl}
                  onChange={(e) => setHandoutImageUrl(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Caption (e.g. Pentex Wyrm-Toxin Manifest)"
                  value={handoutCaption}
                  onChange={(e) => setHandoutCaption(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={!handoutImageUrl.trim()}
                    onClick={() =>
                      sendCommand({
                        type: 'ST_PUSH_HANDOUT',
                        imageUrl: handoutImageUrl.trim(),
                        caption: handoutCaption.trim(),
                      })
                    }
                    className="flex-1 rounded bg-indigo-600 py-1.5 font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Reveal Handout
                  </button>
                  {activeHandout && (
                    <button
                      type="button"
                      onClick={() => sendCommand({ type: 'ST_DISMISS_HANDOUT' })}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-bold text-zinc-300 hover:border-red-500"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              {/* Private Whisper Sender */}
              <div className="space-y-1.5 border-t border-zinc-800 pt-2">
                <span className="flex items-center gap-1 font-semibold text-zinc-300">
                  <Send className="h-3 w-3 text-purple-400" />
                  Send Private Storyteller Whisper
                </span>
                {playerRecipients.length > 0 ? (
                  <select
                    value={effectiveWhisperTarget}
                    onChange={(e) => setWhisperTargetId(e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                  >
                    {playerRecipients.map(([discordId, name]) => (
                      <option key={discordId} value={discordId}>
                        {name} ({discordId})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={whisperTargetId}
                    onChange={(e) => setWhisperTargetId(e.target.value)}
                    placeholder="Target Discord User ID"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                  />
                )}
                <input
                  type="text"
                  placeholder="Whisper Title (e.g. Sense Wyrm Vision)"
                  value={whisperTitle}
                  onChange={(e) => setWhisperTitle(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                />
                <textarea
                  rows={2}
                  placeholder="Private omen or secret perception result..."
                  value={whisperBody}
                  onChange={(e) => setWhisperBody(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 p-2 text-[11px]"
                />
                <button
                  type="button"
                  disabled={!effectiveWhisperTarget || !whisperTitle.trim() || !whisperBody.trim()}
                  onClick={() => {
                    sendCommand({
                      type: 'ST_SEND_WHISPER',
                      targetDiscordId: effectiveWhisperTarget,
                      title: whisperTitle.trim(),
                      body: whisperBody.trim(),
                    });
                    setWhisperTitle('');
                    setWhisperBody('');
                  }}
                  className="w-full rounded bg-purple-700 py-1.5 font-bold text-white hover:bg-purple-600 disabled:opacity-40"
                >
                  Send Private Whisper
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
