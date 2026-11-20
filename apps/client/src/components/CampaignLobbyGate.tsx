import React, { useCallback, useEffect, useState } from 'react';
import { MoonPhase, W20CharacterState } from '@w20-vtt/core';
import {
  AlertTriangle,
  Crown,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { bootstrapDiscordActivity, DiscordSessionContext } from '../discordBootstrap';
import { useVttRoomStore } from '../store/useVttRoomStore';
import { CharacterCreationWizard } from './CharacterCreationWizard';

interface CampaignSummary {
  id: string;
  name: string;
  discordGuildId: string;
  storytellerDiscordId: string;
  moonPhase: MoonPhase;
  localGauntlet: number;
  mapAssetUrl: string | null;
}

interface CampaignLobbyGateProps {
  session: DiscordSessionContext | null;
  onSessionReady: (session: DiscordSessionContext) => void;
  onEnterRoom: () => void;
  getLatestSupabaseJwt: () => Promise<string | null>;
}

let inflightBootstrapPromise: Promise<DiscordSessionContext> | null = null;

function normalizeCampaignRow(raw: Record<string, unknown>): CampaignSummary {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? 'Unnamed Chronicle'),
    discordGuildId: String(raw.discordGuildId ?? raw.discord_guild_id ?? ''),
    storytellerDiscordId: String(raw.storytellerDiscordId ?? raw.storyteller_discord_id ?? ''),
    moonPhase: (raw.moonPhase ?? raw.current_moon_phase ?? 'half') as MoonPhase,
    localGauntlet: Number(raw.localGauntlet ?? raw.local_gauntlet ?? 6),
    mapAssetUrl: (raw.mapAssetUrl ?? raw.map_asset_url ?? null) as string | null,
  };
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const obj = body as Record<string, unknown>;
  if (typeof obj.error === 'string') return obj.error;
  if (typeof obj.message === 'string') return obj.message;
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    return obj.errors
      .map((e) => (typeof e === 'string' ? e : (e as { message?: string }).message ?? JSON.stringify(e)))
      .join('; ');
  }
  return fallback;
}

export const CampaignLobbyGate: React.FC<CampaignLobbyGateProps> = ({
  session,
  onSessionReady,
  onEnterRoom,
  getLatestSupabaseJwt,
}) => {
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>(
    session ? 'ready' : 'loading'
  );
  const [bootError, setBootError] = useState<string | null>(null);

  const [guildIdInput, setGuildIdInput] = useState<string>('');
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<W20CharacterState[]>([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Create Chronicle form
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newPackName, setNewPackName] = useState('');
  const [newTotemName, setNewTotemName] = useState('');
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  // Character Creation Wizard modal
  const [showWizard, setShowWizard] = useState(false);

  const runBootstrap = useCallback(
    async (forceFresh: boolean) => {
      setBootState('loading');
      setBootError(null);
      try {
        if (forceFresh || !inflightBootstrapPromise) {
          inflightBootstrapPromise = bootstrapDiscordActivity(
            (isLocalUserSpeaking, speakingUserId, active) => {
              useVttRoomStore
                .getState()
                .setLocalVoiceSpeaking(speakingUserId, isLocalUserSpeaking, active);
            }
          );
        }
        const ctx = await inflightBootstrapPromise;
        setGuildIdInput(ctx.guildId ?? ctx.channelId ?? '');
        onSessionReady(ctx);
        setBootState('ready');
      } catch (err: unknown) {
        inflightBootstrapPromise = null;
        const msg = err instanceof Error ? err.message : 'Failed to initialize Discord Activity.';
        setBootError(msg);
        setBootState('error');
      }
    },
    [onSessionReady]
  );

  useEffect(() => {
    if (session) {
      setBootState('ready');
      setGuildIdInput((prev) => prev || session.guildId || session.channelId || '');
      return;
    }
    void runBootstrap(false);
  }, [session, runBootstrap]);

  const effectiveGuildId = (session?.guildId ?? guildIdInput).trim();

  const fetchCampaigns = useCallback(async () => {
    if (!session || !effectiveGuildId) return;
    setLoadingCampaigns(true);
    setCampaignError(null);
    try {
      const res = await fetch(
        `/api/campaigns?guildId=${encodeURIComponent(effectiveGuildId)}`,
        {
          headers: { Authorization: `Bearer ${session.sessionJwt}` },
        }
      );
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, `Failed to load chronicles (${res.status}).`));
      }
      const rawList = Array.isArray(data)
        ? data
        : Array.isArray((data as { campaigns?: unknown[] }).campaigns)
          ? (data as { campaigns: unknown[] }).campaigns
          : [];
      const normalized = rawList
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .map(normalizeCampaignRow);
      setCampaigns(normalized);
      if (normalized.length > 0) {
        setSelectedCampaignId((prev) =>
          prev && normalized.some((c) => c.id === prev) ? prev : normalized[0].id
        );
      } else {
        setSelectedCampaignId(null);
      }
    } catch (err: unknown) {
      setCampaignError(err instanceof Error ? err.message : 'Unable to fetch chronicles.');
    } finally {
      setLoadingCampaigns(false);
    }
  }, [session, effectiveGuildId]);

  useEffect(() => {
    if (bootState === 'ready' && session && effectiveGuildId) {
      void fetchCampaigns();
    }
  }, [bootState, session, effectiveGuildId, fetchCampaigns]);

  const fetchCharacters = useCallback(
    async (campaignId: string) => {
      if (!session) return;
      setLoadingChars(true);
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`, {
          headers: { Authorization: `Bearer ${session.sessionJwt}` },
        });
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(extractErrorMessage(data, `Failed to load Garou roster (${res.status}).`));
        }
        const list = Array.isArray(data)
          ? (data as W20CharacterState[])
          : Array.isArray((data as { characters?: W20CharacterState[] }).characters)
            ? (data as { characters: W20CharacterState[] }).characters
            : [];
        setCharacters(list);
        const owned = list.find((c) => c.ownerDiscordId === session.userId && !c.isNpc);
        setSelectedCharacterId(owned?.id ?? null);
      } catch (err: unknown) {
        setCampaignError(err instanceof Error ? err.message : 'Unable to load characters.');
      } finally {
        setLoadingChars(false);
      }
    },
    [session]
  );

  useEffect(() => {
    if (selectedCampaignId) {
      void fetchCharacters(selectedCampaignId);
    } else {
      setCharacters([]);
      setSelectedCharacterId(null);
    }
  }, [selectedCampaignId, fetchCharacters]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !effectiveGuildId || !newCampaignName.trim()) return;
    setCreatingCampaign(true);
    setCampaignError(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionJwt}`,
        },
        body: JSON.stringify({
          guildId: effectiveGuildId,
          discordGuildId: effectiveGuildId,
          discordVoiceChannelId: session.channelId ?? undefined,
          name: newCampaignName.trim(),
          diceLogWebhookUrl: newWebhookUrl.trim() || undefined,
          packName: newPackName.trim() || undefined,
          totemName: newTotemName.trim() || undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(extractErrorMessage(data, `Failed to create chronicle (${res.status}).`));
      }
      const rawCampaign =
        data && typeof data === 'object' && 'campaign' in data
          ? (data as { campaign: Record<string, unknown> }).campaign
          : (data as Record<string, unknown>);
      const created = normalizeCampaignRow(rawCampaign);
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaignId(created.id);
      setShowCreateCampaign(false);
      setNewCampaignName('');
      setNewWebhookUrl('');
      setNewPackName('');
      setNewTotemName('');
    } catch (err: unknown) {
      setCampaignError(err instanceof Error ? err.message : 'Chronicle creation failed.');
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleEnterRoom = (characterIdOverride?: string | null) => {
    if (!session || !selectedCampaignId) return;
    const finalCharId =
      characterIdOverride !== undefined ? characterIdOverride : selectedCharacterId;
    const wsProtocol = window.location.protocol === 'http:' ? 'ws:' : 'wss:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/room/${encodeURIComponent(selectedCampaignId)}`;
    useVttRoomStore.getState().connectRoom({
      wsUrl,
      sessionJwt: session.sessionJwt,
      localDiscordId: session.userId,
      campaignId: selectedCampaignId,
      characterId: finalCharId,
    });
    onEnterRoom();
  };

  if (bootState === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-6">
        <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center shadow-2xl">
          <Loader2 className="h-10 w-10 animate-spin text-red-500" />
          <h1 className="mt-4 text-lg font-extrabold tracking-wider uppercase text-zinc-100">
            Attuning to the Umbra
          </h1>
          <p className="mt-2 text-xs text-zinc-400">
            Completing Discord Activity OAuth2 &amp; voice channel handshake...
          </p>
        </div>
      </div>
    );
  }

  if (bootState === 'error' || !session) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-zinc-950 p-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-900/70 bg-zinc-900/90 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-red-950/90 p-2.5 text-red-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-wide uppercase text-red-200">
                Discord Activity Connection Required
              </h1>
              <p className="mt-1 text-xs text-zinc-300">
                {bootError ?? 'Unable to establish an authenticated Discord Activity session.'}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 text-xs text-zinc-400">
            <p className="font-bold uppercase tracking-wider text-zinc-300">
              Setup &amp; Launch Checklist
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>
                Ensure <code className="text-amber-300">VITE_DISCORD_CLIENT_ID</code> is set in your
                environment before building or running Vite.
              </li>
              <li>
                Launch this VTT inside a <strong>Discord Voice Channel</strong> via the Activities
                Rocket button (direct browser tabs lack the Discord Embedded RPC bridge).
              </li>
              <li>
                Verify Discord Developer Portal <strong>URL Mappings</strong> map{' '}
                <code className="text-zinc-200">/</code> to your Worker/tunnel and{' '}
                <code className="text-zinc-200">/supabase</code> to your Supabase project host.
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => void runBootstrap(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-600"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Discord Handshake
          </button>
        </div>
      </div>
    );
  }

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const isStoryteller = selectedCampaign?.storytellerDiscordId === session.userId;
  const myCharacters = characters.filter(
    (c) => c.ownerDiscordId === session.userId && !c.isNpc
  );
  const packmateCharacters = characters.filter(
    (c) => c.ownerDiscordId !== session.userId && !c.isNpc
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Top Identity Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 bg-zinc-900/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-800/70 bg-red-950/60 text-red-400">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-zinc-100">
              W20 Chronicle Gate
            </h1>
            <p className="text-[11px] text-zinc-400">
              Werewolf: The Apocalypse 20th Anniversary • Authoritative VTT
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-1.5">
          {session.avatarUrl ? (
            <img
              src={session.avatarUrl}
              alt={session.username}
              className="h-6 w-6 rounded-full border border-zinc-700 object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold">
              {session.username.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="text-xs">
            <div className="font-bold text-zinc-200">{session.username}</div>
            <div className="text-[10px] text-zinc-500">
              {session.guildId ? `Guild ${session.guildId}` : 'Voice Call Session'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Split-Screen Friendly Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Column: Chronicles */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-extrabold tracking-wider uppercase text-zinc-200">
                <Shield className="h-4 w-4 text-red-400" />
                Server Chronicles
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void fetchCampaigns()}
                  title="Refresh chronicles"
                  className="rounded border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCampaigns ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCampaign((v) => !v)}
                  className="flex items-center gap-1 rounded bg-red-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Chronicle
                </button>
              </div>
            </div>

            {!session.guildId && (
              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-zinc-400">
                  Guild / Channel Chronicle Scope ID
                </label>
                <div className="mt-1 flex gap-1.5">
                  <input
                    type="text"
                    value={guildIdInput}
                    onChange={(e) => setGuildIdInput(e.target.value)}
                    placeholder="Discord Guild or Channel ID"
                    className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void fetchCampaigns()}
                    className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-700"
                  >
                    Load
                  </button>
                </div>
              </div>
            )}

            {campaignError && (
              <div className="mt-3 rounded-lg border border-red-800/80 bg-red-950/60 p-2.5 text-xs text-red-200">
                {campaignError}
              </div>
            )}

            {showCreateCampaign && (
              <form
                onSubmit={(e) => void handleCreateCampaign(e)}
                className="mt-3 space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs"
              >
                <p className="font-bold uppercase tracking-wide text-red-300">
                  Found New Chronicle (You = Storyteller)
                </p>
                <input
                  type="text"
                  required
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Chronicle Name (e.g. Rage Across Seattle)"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5"
                />
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="Optional #dice-log Discord Webhook URL"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newPackName}
                    onChange={(e) => setNewPackName(e.target.value)}
                    placeholder="Optional Pack Name"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5"
                  />
                  <input
                    type="text"
                    value={newTotemName}
                    onChange={(e) => setNewTotemName(e.target.value)}
                    placeholder="Optional Totem (e.g. Stag)"
                    className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creatingCampaign || !effectiveGuildId}
                    className="flex-1 rounded bg-red-700 py-1.5 font-bold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {creatingCampaign ? 'Founding...' : 'Create Chronicle'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateCampaign(false)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="mt-3 space-y-2">
              {loadingCampaigns && campaigns.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">Loading chronicles...</p>
              ) : campaigns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-400">
                  No chronicles found for this server yet. Click{' '}
                  <strong className="text-zinc-200">New Chronicle</strong> to start one as
                  Storyteller.
                </div>
              ) : (
                campaigns.map((camp) => {
                  const isSelected = camp.id === selectedCampaignId;
                  const isSt = camp.storytellerDiscordId === session.userId;
                  return (
                    <button
                      key={camp.id}
                      type="button"
                      onClick={() => setSelectedCampaignId(camp.id)}
                      className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? 'border-red-500/80 bg-red-950/35'
                          : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-100">{camp.name}</span>
                          {isSt && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                              <Crown className="h-3 w-3" /> ST
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] capitalize text-zinc-400">
                          {camp.moonPhase} Moon • Gauntlet {camp.localGauntlet}
                        </p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase text-zinc-500">
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Column: Garou Roster & Entry */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:col-span-7">
            {!selectedCampaign ? (
              <div className="flex h-full min-h-48 items-center justify-center text-xs text-zinc-500">
                Select or create a Chronicle on the left to choose your Garou or join as
                Storyteller.
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                    <div>
                      <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-zinc-100">
                        <Users className="h-4 w-4 text-emerald-400" />
                        {selectedCampaign.name} — Pack Roster
                      </h2>
                      <p className="text-[11px] text-zinc-400">
                        Choose your Garou character or create a Rank 1 Cliath.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowWizard(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-600/70 bg-emerald-950/70 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-900/80"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Create Rank 1 Garou
                    </button>
                  </div>

                  {loadingChars ? (
                    <p className="py-8 text-center text-xs text-zinc-500">
                      Summoning pack records...
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {isStoryteller && (
                        <div className="flex items-center justify-between rounded-lg border border-amber-500/50 bg-amber-950/30 p-3">
                          <div>
                            <p className="text-xs font-bold text-amber-200">
                              Storyteller Control Seat
                            </p>
                            <p className="text-[11px] text-amber-300/80">
                              Enter as GM with full Fog of War, NPC Spawner, Gauntlet &amp; Combat
                              override authority.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEnterRoom(null)}
                            className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-extrabold text-zinc-950 hover:bg-amber-500"
                          >
                            Enter as Storyteller
                          </button>
                        </div>
                      )}

                      <div>
                        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Your Garou ({myCharacters.length})
                        </h3>
                        {myCharacters.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-zinc-800 p-3 text-xs text-zinc-500">
                            You have no Garou in this chronicle yet. Click{' '}
                            <strong className="text-zinc-300">Create Rank 1 Garou</strong> to forge
                            one.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {myCharacters.map((char) => {
                              const chosen = selectedCharacterId === char.id;
                              return (
                                <button
                                  key={char.id}
                                  type="button"
                                  onClick={() => setSelectedCharacterId(char.id)}
                                  className={`rounded-lg border p-3 text-left transition ${
                                    chosen
                                      ? 'border-emerald-500 bg-emerald-950/35'
                                      : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-extrabold text-zinc-100">
                                      {char.name}
                                    </span>
                                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-300">
                                      Rank {char.rank}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] capitalize text-zinc-400">
                                    {char.breed} • {char.auspice} • {char.tribe.replace(/_/g, ' ')}
                                  </p>
                                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                                    Rage {char.rage.permanent} • Gnosis {char.gnosis.permanent} • WP{' '}
                                    {char.willpower.permanent}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {packmateCharacters.length > 0 && (
                        <div>
                          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                            Packmates in Chronicle ({packmateCharacters.length})
                          </h3>
                          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {packmateCharacters.map((pm) => (
                              <div
                                key={pm.id}
                                className="rounded border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2 text-[11px] text-zinc-400"
                              >
                                <span className="font-semibold text-zinc-200">{pm.name}</span>{' '}
                                <span className="capitalize">
                                  ({pm.breed} {pm.auspice}, {pm.tribe.replace(/_/g, ' ')})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
                  <button
                    type="button"
                    disabled={!selectedCharacterId}
                    onClick={() => handleEnterRoom()}
                    className="rounded-lg bg-red-700 px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Enter Chronicle with Selected Garou
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {showWizard && selectedCampaign && (
        <CharacterCreationWizard
          campaignId={selectedCampaign.id}
          sessionJwt={session.sessionJwt}
          getLatestSupabaseJwt={getLatestSupabaseJwt}
          onClose={() => setShowWizard(false)}
          onCreated={(char) => {
            setCharacters((prev) => [...prev, char]);
            setSelectedCharacterId(char.id);
            setShowWizard(false);
          }}
        />
      )}
    </div>
  );
};
