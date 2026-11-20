import type {
  ActiveCharacterBuff,
  Auspice,
  Breed,
  CharacterFetishEntry,
  DamageType,
  GarouForm,
  MeritOrFlawChoice,
  MoonPhase,
  RealmLayer,
  SpecialtyEntry,
  SpecialtyMode,
  W20CharacterState,
  W20MacroDefinition,
  W20RollResult,
} from '@w20-vtt/core';
import type { PackTotemState } from '@w20-vtt/protocol';
import type { WorkerEnv } from './env';

export interface CampaignRow {
  id: string;
  discord_guild_id: string;
  discord_voice_channel_id: string | null;
  dice_log_webhook_url: string | null;
  storyteller_discord_id: string;
  name: string;
  current_moon_phase: MoonPhase;
  local_gauntlet: number;
  specialty_mode: SpecialtyMode;
  map_asset_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PackRow {
  id: string;
  campaign_id: string;
  name: string;
  totem_name: string | null;
  pack_willpower_max: number;
  pack_willpower_temp: number;
  totem_modifiers: Record<string, unknown>;
  caern_name: string | null;
  caern_level: number | null;
}

export interface CharacterFetishRow {
  id: string;
  character_id: string;
  name: string;
  level: number;
  gnosis_rating: number;
  is_silver: boolean;
  weapon_damage_bonus: number | null;
  damage_type: DamageType | null;
  is_attuned: boolean;
  charges_remaining: number | null;
  system_summary: string;
  macro_config?: Record<string, unknown> | null;
}

export interface CharacterRow {
  id: string;
  campaign_id: string;
  pack_id: string | null;
  owner_discord_id: string;
  is_npc: boolean;
  name: string;
  deed_name: string | null;
  concept: string | null;
  breed: Breed;
  auspice: Auspice;
  tribe: string;
  rank: number;
  metis_deformity: string | null;
  active_form: GarouForm;
  active_realm: RealmLayer;
  caught_in_gauntlet: boolean;
  in_frenzy: boolean;
  frenzy_type: 'berserk' | 'fox' | null;
  attr_strength: number;
  attr_dexterity: number;
  attr_stamina: number;
  attr_charisma: number;
  attr_manipulation: number;
  attr_appearance: number;
  attr_perception: number;
  attr_intelligence: number;
  attr_wits: number;
  rage_perm: number;
  rage_temp: number;
  gnosis_perm: number;
  gnosis_temp: number;
  silver_carried_items: number;
  willpower_perm: number;
  willpower_temp: number;
  renown_glory_perm: number;
  renown_glory_temp: number;
  renown_honor_perm: number;
  renown_honor_temp: number;
  renown_wisdom_perm: number;
  renown_wisdom_temp: number;
  bonus_bruised_boxes: number;
  health_boxes: DamageType[];
  abilities: Record<string, number>;
  specialties: SpecialtyEntry[];
  backgrounds: Record<string, number>;
  merits_flaws: MeritOrFlawChoice[];
  portraits_by_form: Partial<Record<GarouForm, string>>;
  active_buffs: ActiveCharacterBuff[];
  macros: W20MacroDefinition[];
  state_version: number;
  character_fetishes?: CharacterFetishRow[];
}

export interface XpLedgerRow {
  id: string;
  character_id: string;
  delta: number;
  reason: string;
  approved_by_discord_id: string;
  created_at: string;
}

export interface RoomHydrationPayload {
  campaign: CampaignRow;
  packTotem: PackTotemState | null;
  characters: W20CharacterState[];
}

export function mapCharacterRowToState(row: CharacterRow): W20CharacterState {
  const fetishes: CharacterFetishEntry[] = Array.isArray(row.character_fetishes)
    ? row.character_fetishes.map((fetish) => ({
        id: fetish.id,
        name: fetish.name,
        level: Number(fetish.level),
        gnosisRating: Number(fetish.gnosis_rating),
        isSilver: Boolean(fetish.is_silver),
        weaponDamageBonus:
          typeof fetish.weapon_damage_bonus === 'number' ? fetish.weapon_damage_bonus : undefined,
        damageType:
          fetish.damage_type && fetish.damage_type !== 'none' ? fetish.damage_type : undefined,
        isAttuned: Boolean(fetish.is_attuned),
        chargesRemaining: fetish.charges_remaining,
        systemSummary: fetish.system_summary,
      }))
    : [];

  return {
    id: row.id,
    campaignId: row.campaign_id,
    packId: row.pack_id,
    ownerDiscordId: row.owner_discord_id,
    isNpc: Boolean(row.is_npc),
    name: row.name,
    deedName: row.deed_name ?? undefined,
    concept: row.concept ?? undefined,
    breed: row.breed,
    auspice: row.auspice,
    tribe: row.tribe,
    rank: Number(row.rank),
    metisDeformity: row.metis_deformity ?? undefined,
    activeForm: row.active_form,
    activeRealm: row.active_realm,
    caughtInGauntlet: Boolean(row.caught_in_gauntlet),
    inFrenzy: Boolean(row.in_frenzy),
    frenzyType: row.frenzy_type ?? null,
    baseAttributes: {
      strength: Number(row.attr_strength),
      dexterity: Number(row.attr_dexterity),
      stamina: Number(row.attr_stamina),
      charisma: Number(row.attr_charisma),
      manipulation: Number(row.attr_manipulation),
      appearance: Number(row.attr_appearance),
      perception: Number(row.attr_perception),
      intelligence: Number(row.attr_intelligence),
      wits: Number(row.attr_wits),
    },
    abilities: (row.abilities && typeof row.abilities === 'object' ? row.abilities : {}) as Record<
      string,
      number
    >,
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    backgrounds:
      row.backgrounds && typeof row.backgrounds === 'object' ? row.backgrounds : {},
    meritsFlaws: Array.isArray(row.merits_flaws) ? row.merits_flaws : [],
    rage: {
      permanent: Number(row.rage_perm),
      temporary: Number(row.rage_temp),
    },
    gnosis: {
      permanent: Number(row.gnosis_perm),
      temporary: Number(row.gnosis_temp),
    },
    willpower: {
      permanent: Number(row.willpower_perm),
      temporary: Number(row.willpower_temp),
    },
    silverCarriedItems: Number(row.silver_carried_items ?? 0),
    renown: {
      glory: {
        permanent: Number(row.renown_glory_perm ?? 0),
        temporary: Number(row.renown_glory_temp ?? 0),
      },
      honor: {
        permanent: Number(row.renown_honor_perm ?? 0),
        temporary: Number(row.renown_honor_temp ?? 0),
      },
      wisdom: {
        permanent: Number(row.renown_wisdom_perm ?? 0),
        temporary: Number(row.renown_wisdom_temp ?? 0),
      },
    },
    health: {
      bonusBruisedBoxes: Number(row.bonus_bruised_boxes ?? 0),
      boxes: Array.isArray(row.health_boxes)
        ? row.health_boxes
        : ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
    },
    activeBuffs: Array.isArray(row.active_buffs) ? row.active_buffs : [],
    macros: Array.isArray(row.macros) ? row.macros : [],
    fetishes,
    portraitsByForm:
      row.portraits_by_form && typeof row.portraits_by_form === 'object' ? row.portraits_by_form : {},
    turnLocks: {
      hasSpentRageThisTurn: false,
      hasSpentGnosisThisTurn: false,
      hasSpentWillpowerThisTurn: false,
      ignoringWoundPenaltiesThisTurn: false,
      declaredExtraRageActions: 0,
    },
    stateVersion: Number(row.state_version ?? 1),
  };
}

export function mapStateToCharacterInsertRow(
  char: W20CharacterState,
): Omit<CharacterRow, 'character_fetishes'> {
  return {
    id: char.id,
    campaign_id: char.campaignId,
    pack_id: char.packId,
    owner_discord_id: char.ownerDiscordId,
    is_npc: char.isNpc,
    name: char.name,
    deed_name: char.deedName ?? null,
    concept: char.concept ?? null,
    breed: char.breed,
    auspice: char.auspice,
    tribe: char.tribe,
    rank: char.rank,
    metis_deformity: char.metisDeformity ?? null,
    active_form: char.activeForm,
    active_realm: char.activeRealm,
    caught_in_gauntlet: char.caughtInGauntlet,
    in_frenzy: char.inFrenzy,
    frenzy_type: char.frenzyType,
    attr_strength: char.baseAttributes.strength,
    attr_dexterity: char.baseAttributes.dexterity,
    attr_stamina: char.baseAttributes.stamina,
    attr_charisma: char.baseAttributes.charisma,
    attr_manipulation: char.baseAttributes.manipulation,
    attr_appearance: char.baseAttributes.appearance,
    attr_perception: char.baseAttributes.perception,
    attr_intelligence: char.baseAttributes.intelligence,
    attr_wits: char.baseAttributes.wits,
    rage_perm: char.rage.permanent,
    rage_temp: char.rage.temporary,
    gnosis_perm: char.gnosis.permanent,
    gnosis_temp: char.gnosis.temporary,
    silver_carried_items: char.silverCarriedItems,
    willpower_perm: char.willpower.permanent,
    willpower_temp: char.willpower.temporary,
    renown_glory_perm: char.renown.glory.permanent,
    renown_glory_temp: char.renown.glory.temporary,
    renown_honor_perm: char.renown.honor.permanent,
    renown_honor_temp: char.renown.honor.temporary,
    renown_wisdom_perm: char.renown.wisdom.permanent,
    renown_wisdom_temp: char.renown.wisdom.temporary,
    bonus_bruised_boxes: char.health.bonusBruisedBoxes,
    health_boxes: char.health.boxes,
    abilities: char.abilities,
    specialties: char.specialties,
    backgrounds: char.backgrounds,
    merits_flaws: char.meritsFlaws,
    portraits_by_form: char.portraitsByForm,
    active_buffs: char.activeBuffs,
    macros: char.macros,
    state_version: char.stateVersion,
  };
}

export function mapStateToMutablePatch(char: W20CharacterState): Record<string, unknown> {
  return {
    active_form: char.activeForm,
    active_realm: char.activeRealm,
    caught_in_gauntlet: char.caughtInGauntlet,
    in_frenzy: char.inFrenzy,
    frenzy_type: char.frenzyType,
    rage_temp: char.rage.temporary,
    gnosis_temp: char.gnosis.temporary,
    silver_carried_items: char.silverCarriedItems,
    willpower_temp: char.willpower.temporary,
    renown_glory_temp: char.renown.glory.temporary,
    renown_honor_temp: char.renown.honor.temporary,
    renown_wisdom_temp: char.renown.wisdom.temporary,
    health_boxes: char.health.boxes,
    active_buffs: char.activeBuffs,
    macros: char.macros,
    portraits_by_form: char.portraitsByForm,
    state_version: char.stateVersion,
  };
}

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodyText: string,
  ) {
    super(message);
  }
}

export class SupabaseRestClient {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(env: Pick<WorkerEnv, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>) {
    this.baseUrl = (env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0 && this.serviceRoleKey.length > 0;
  }

  private async request<T>(
    pathWithQuery: string,
    init: RequestInit & { prefer?: string } = {},
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new SupabaseRestError('Supabase REST client is not configured.', 500, '');
    }

    const headers = new Headers(init.headers);
    headers.set('apikey', this.serviceRoleKey);
    if (!this.serviceRoleKey.startsWith('sb_secret_')) {
      headers.set('Authorization', `Bearer ${this.serviceRoleKey}`);
    }
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (init.prefer) {
      headers.set('Prefer', init.prefer);
    }

    const res = await fetch(`${this.baseUrl}/rest/v1${pathWithQuery}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SupabaseRestError(
        `Supabase REST ${init.method ?? 'GET'} ${pathWithQuery} failed (${res.status})`,
        res.status,
        text,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  async listCampaignsByGuild(guildId: string): Promise<CampaignRow[]> {
    const query = `/campaigns?discord_guild_id=eq.${encodeURIComponent(guildId)}&select=*&order=created_at.desc`;
    return this.request<CampaignRow[]>(query);
  }

  async getCampaignById(campaignId: string): Promise<CampaignRow | null> {
    const query = `/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=*&limit=1`;
    const rows = await this.request<CampaignRow[]>(query);
    return rows[0] ?? null;
  }

  async createCampaign(input: {
    discord_guild_id: string;
    storyteller_discord_id: string;
    name: string;
    current_moon_phase?: MoonPhase;
    local_gauntlet?: number;
    specialty_mode?: SpecialtyMode;
    dice_log_webhook_url?: string | null;
    discord_voice_channel_id?: string | null;
    map_asset_url?: string | null;
  }): Promise<CampaignRow> {
    const rows = await this.request<CampaignRow[]>('/campaigns', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify(input),
    });
    if (!rows[0]) {
      throw new SupabaseRestError('Campaign creation returned no row.', 500, '');
    }
    return rows[0];
  }

  async updateCampaignWorldEnv(
    campaignId: string,
    patch: {
      local_gauntlet?: number;
      current_moon_phase?: MoonPhase;
      specialty_mode?: SpecialtyMode;
      map_asset_url?: string | null;
    },
  ): Promise<void> {
    await this.request<unknown>(`/campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(patch),
    });
  }

  async createPack(input: {
    campaign_id: string;
    name: string;
    totem_name?: string | null;
    pack_willpower_max?: number;
    pack_willpower_temp?: number;
    totem_modifiers?: Record<string, unknown>;
    caern_name?: string | null;
    caern_level?: number | null;
  }): Promise<PackRow> {
    const rows = await this.request<PackRow[]>('/packs', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify(input),
    });
    if (!rows[0]) {
      throw new SupabaseRestError('Pack creation returned no row.', 500, '');
    }
    return rows[0];
  }

  async getPrimaryPackForCampaign(campaignId: string): Promise<PackRow | null> {
    const rows = await this.request<PackRow[]>(
      `/packs?campaign_id=eq.${encodeURIComponent(campaignId)}&select=*&order=created_at.asc&limit=1`,
    );
    return rows[0] ?? null;
  }

  async updatePackWillpower(packId: string, willpowerTemp: number): Promise<void> {
    await this.request<unknown>(`/packs?id=eq.${encodeURIComponent(packId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ pack_willpower_temp: willpowerTemp }),
    });
  }

  async listCampaignCharacters(campaignId: string): Promise<W20CharacterState[]> {
    const rows = await this.request<CharacterRow[]>(
      `/characters?campaign_id=eq.${encodeURIComponent(campaignId)}&select=*,character_fetishes(*)&order=created_at.asc`,
    );
    return rows.map(mapCharacterRowToState);
  }

  async getCharacterById(characterId: string): Promise<W20CharacterState | null> {
    const rows = await this.request<CharacterRow[]>(
      `/characters?id=eq.${encodeURIComponent(characterId)}&select=*,character_fetishes(*)&limit=1`,
    );
    return rows[0] ? mapCharacterRowToState(rows[0]) : null;
  }

  async findPlayerCharacterInGuild(
    guildId: string,
    ownerDiscordId: string,
    characterName?: string,
  ): Promise<{ campaign: CampaignRow; character: W20CharacterState } | null> {
    const campaigns = await this.listCampaignsByGuild(guildId);
    for (const campaign of campaigns) {
      const characters = await this.listCampaignCharacters(campaign.id);
      const owned = characters.filter((c) => !c.isNpc && c.ownerDiscordId === ownerDiscordId);
      if (owned.length === 0) continue;
      if (characterName) {
        const needle = characterName.trim().toLowerCase();
        const match = owned.find(
          (c) => c.name.toLowerCase() === needle || c.deedName?.toLowerCase() === needle,
        );
        if (match) {
          return { campaign, character: match };
        }
      } else {
        return { campaign, character: owned[0]! };
      }
    }
    return null;
  }

  async insertCharacter(
    char: W20CharacterState,
    selectedGiftIds: string[] = [],
  ): Promise<W20CharacterState> {
    const insertRow = mapStateToCharacterInsertRow(char);
    const rows = await this.request<CharacterRow[]>('/characters', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify(insertRow),
    });
    const created = rows[0];
    if (!created) {
      throw new SupabaseRestError('Character insert returned no row.', 500, '');
    }

    if (selectedGiftIds.length > 0) {
      const uniqueGifts = Array.from(new Set(selectedGiftIds.filter(Boolean)));
      if (uniqueGifts.length > 0) {
        await this.insertCharacterGifts(created.id, uniqueGifts);
      }
    }

    return mapCharacterRowToState(created);
  }

  async insertCharacterGifts(characterId: string, giftIds: string[]): Promise<void> {
    const rows = giftIds.map((giftId) => ({
      character_id: characterId,
      gift_id: giftId,
      is_active_buff: false,
    }));
    await this.request<unknown>('/character_gifts', {
      method: 'POST',
      prefer: 'return=minimal,resolution=ignore-duplicates',
      body: JSON.stringify(rows),
    });
  }

  async flushCharacterState(char: W20CharacterState): Promise<void> {
    const patch = mapStateToMutablePatch(char);
    await this.request<unknown>(`/characters?id=eq.${encodeURIComponent(char.id)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(patch),
    });
  }

  async patchCharacterFields(characterId: string, fields: Record<string, unknown>): Promise<void> {
    await this.request<unknown>(`/characters?id=eq.${encodeURIComponent(characterId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify(fields),
    });
  }

  async listXpLedger(characterId: string): Promise<XpLedgerRow[]> {
    return this.request<XpLedgerRow[]>(
      `/xp_ledger?character_id=eq.${encodeURIComponent(characterId)}&select=*&order=created_at.desc`,
    );
  }

  async getXpBalance(characterId: string): Promise<number> {
    const rows = await this.request<Array<{ delta: number }>>(
      `/xp_ledger?character_id=eq.${encodeURIComponent(characterId)}&select=delta`,
    );
    return rows.reduce((sum, row) => sum + Number(row.delta ?? 0), 0);
  }

  async appendXpLedgerEntry(entry: {
    character_id: string;
    delta: number;
    reason: string;
    approved_by_discord_id: string;
  }): Promise<XpLedgerRow> {
    const rows = await this.request<XpLedgerRow[]>('/xp_ledger', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify(entry),
    });
    if (!rows[0]) {
      throw new SupabaseRestError('XP ledger append returned no row.', 500, '');
    }
    return rows[0];
  }

  async insertRollAuditLog(entry: {
    campaign_id: string;
    character_id?: string | null;
    roller_discord_id: string;
    label: string;
    roll: W20RollResult;
    has_specialty?: boolean;
    spent_willpower?: boolean;
    is_secret_st_roll?: boolean;
  }): Promise<void> {
    await this.request<unknown>('/roll_audit_logs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        campaign_id: entry.campaign_id,
        character_id: entry.character_id ?? null,
        roller_discord_id: entry.roller_discord_id,
        label: entry.label,
        pool_size: entry.roll.effectivePool,
        difficulty: entry.roll.clampedDifficulty,
        has_specialty: Boolean(entry.has_specialty),
        spent_willpower: Boolean(entry.spent_willpower),
        is_secret_st_roll: Boolean(entry.is_secret_st_roll),
        raw_dice: entry.roll.dice.map((d) => d.value),
        raw_successes: entry.roll.rawSuccesses,
        ones_rolled: entry.roll.onesRolled,
        net_successes: entry.roll.netSuccesses,
        outcome: entry.roll.outcome,
        physics_seed: entry.roll.physicsSeed,
      }),
    });
  }

  async loadRoomHydrationData(campaignId: string): Promise<RoomHydrationPayload | null> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) {
      return null;
    }
    const [pack, characters] = await Promise.all([
      this.getPrimaryPackForCampaign(campaignId),
      this.listCampaignCharacters(campaignId),
    ]);

    const packTotem: PackTotemState | null = pack
      ? {
          packId: pack.id,
          name: pack.name,
          totemName: pack.totem_name ?? 'Pack Totem',
          willpowerMax: Number(pack.pack_willpower_max ?? 0),
          willpowerTemp: Number(pack.pack_willpower_temp ?? 0),
        }
      : null;

    return { campaign, packTotem, characters };
  }
}
