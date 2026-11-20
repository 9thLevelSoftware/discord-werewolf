-- ============================================================================
-- 1. ENUMS & EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE w20_breed AS ENUM ('homid', 'metis', 'lupus');
CREATE TYPE w20_auspice AS ENUM ('ragabash', 'theurge', 'philodox', 'galliard', 'ahroun');
CREATE TYPE w20_form AS ENUM ('homid', 'glabro', 'crinos', 'hispo', 'lupus');
CREATE TYPE w20_realm AS ENUM ('physical', 'penumbra', 'deep_umbra');
CREATE TYPE w20_moon_phase AS ENUM ('new', 'crescent', 'half', 'gibbous', 'full');
CREATE TYPE w20_damage_type AS ENUM ('none', 'bashing', 'lethal', 'aggravated');
CREATE TYPE w20_specialty_mode AS ENUM ('w20_double', 'revised_explode');
CREATE TYPE w20_roll_outcome AS ENUM (
  'botch',
  'failure',
  'marginal',
  'moderate',
  'complete',
  'exceptional',
  'phenomenal'
);

-- ============================================================================
-- 2. CAMPAIGNS & PACKS
-- ============================================================================
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_guild_id TEXT NOT NULL,
  discord_voice_channel_id TEXT,
  dice_log_webhook_url TEXT,
  storyteller_discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_moon_phase w20_moon_phase NOT NULL DEFAULT 'half',
  local_gauntlet SMALLINT NOT NULL DEFAULT 6 CHECK (local_gauntlet BETWEEN 1 AND 10),
  specialty_mode w20_specialty_mode NOT NULL DEFAULT 'w20_double',
  map_asset_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_guild ON campaigns (discord_guild_id);

CREATE TABLE packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  totem_name TEXT,
  -- Shared pack Willpower or Totem point pool per session
  pack_willpower_max SMALLINT NOT NULL DEFAULT 0 CHECK (pack_willpower_max BETWEEN 0 AND 20),
  pack_willpower_temp SMALLINT NOT NULL DEFAULT 0 CHECK (pack_willpower_temp BETWEEN 0 AND 20),
  -- Structured modifiers granted by the Pack Totem (e.g., {"abilities": {"stealth": 2}})
  totem_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  caern_name TEXT,
  caern_level SMALLINT CHECK (caern_level BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_packs_campaign ON packs (campaign_id);

-- ============================================================================
-- 3. CHARACTERS (HYBRID RELATIONAL + VALIDATED JSONB)
-- ============================================================================
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES packs(id) ON DELETE SET NULL,
  owner_discord_id TEXT NOT NULL,
  is_npc BOOLEAN NOT NULL DEFAULT false,

  -- Garou Identity
  name TEXT NOT NULL,
  deed_name TEXT,
  concept TEXT,
  breed w20_breed NOT NULL,
  auspice w20_auspice NOT NULL,
  tribe TEXT NOT NULL,
  rank SMALLINT NOT NULL DEFAULT 1 CHECK (rank BETWEEN 0 AND 6), -- 0=Cub, 1=Cliath .. 5=Elder, 6=Legend
  metis_deformity TEXT,

  -- Active Scene State
  active_form w20_form NOT NULL DEFAULT 'homid',
  active_realm w20_realm NOT NULL DEFAULT 'physical',
  caught_in_gauntlet BOOLEAN NOT NULL DEFAULT false,
  in_frenzy BOOLEAN NOT NULL DEFAULT false,
  frenzy_type TEXT CHECK (frenzy_type IN ('berserk', 'fox') OR frenzy_type IS NULL),

  -- Base Homid Attributes (1-10 supports Elder/Legendary traits)
  attr_strength SMALLINT NOT NULL DEFAULT 1 CHECK (attr_strength BETWEEN 1 AND 10),
  attr_dexterity SMALLINT NOT NULL DEFAULT 1 CHECK (attr_dexterity BETWEEN 1 AND 10),
  attr_stamina SMALLINT NOT NULL DEFAULT 1 CHECK (attr_stamina BETWEEN 1 AND 10),
  attr_charisma SMALLINT NOT NULL DEFAULT 1 CHECK (attr_charisma BETWEEN 1 AND 10),
  attr_manipulation SMALLINT NOT NULL DEFAULT 1 CHECK (attr_manipulation BETWEEN 1 AND 10),
  attr_appearance SMALLINT NOT NULL DEFAULT 1 CHECK (attr_appearance BETWEEN 0 AND 10),
  attr_perception SMALLINT NOT NULL DEFAULT 1 CHECK (attr_perception BETWEEN 1 AND 10),
  attr_intelligence SMALLINT NOT NULL DEFAULT 1 CHECK (attr_intelligence BETWEEN 1 AND 10),
  attr_wits SMALLINT NOT NULL DEFAULT 1 CHECK (attr_wits BETWEEN 1 AND 10),

  -- Core Dual Trackers (0-10; temp may exceed perm up to 10 via Gifts/Totems)
  rage_perm SMALLINT NOT NULL DEFAULT 1 CHECK (rage_perm BETWEEN 0 AND 10),
  rage_temp SMALLINT NOT NULL DEFAULT 1 CHECK (rage_temp BETWEEN 0 AND 10),
  gnosis_perm SMALLINT NOT NULL DEFAULT 1 CHECK (gnosis_perm BETWEEN 0 AND 10),
  gnosis_temp SMALLINT NOT NULL DEFAULT 1 CHECK (gnosis_temp BETWEEN 0 AND 10),
  silver_carried_items SMALLINT NOT NULL DEFAULT 0 CHECK (silver_carried_items >= 0),
  willpower_perm SMALLINT NOT NULL DEFAULT 1 CHECK (willpower_perm BETWEEN 1 AND 10),
  willpower_temp SMALLINT NOT NULL DEFAULT 1 CHECK (willpower_temp BETWEEN 0 AND 10),

  -- Renown (Permanent 0-10 dots, Temporary 0-10 boxes)
  renown_glory_perm SMALLINT NOT NULL DEFAULT 0 CHECK (renown_glory_perm BETWEEN 0 AND 10),
  renown_glory_temp SMALLINT NOT NULL DEFAULT 0 CHECK (renown_glory_temp BETWEEN 0 AND 10),
  renown_honor_perm SMALLINT NOT NULL DEFAULT 0 CHECK (renown_honor_perm BETWEEN 0 AND 10),
  renown_honor_temp SMALLINT NOT NULL DEFAULT 0 CHECK (renown_honor_temp BETWEEN 0 AND 10),
  renown_wisdom_perm SMALLINT NOT NULL DEFAULT 0 CHECK (renown_wisdom_perm BETWEEN 0 AND 10),
  renown_wisdom_temp SMALLINT NOT NULL DEFAULT 0 CHECK (renown_wisdom_temp BETWEEN 0 AND 10),

  -- Health Track: 7 canonical levels + optional bonus Bruised boxes (e.g., Huge Size Merit)
  bonus_bruised_boxes SMALLINT NOT NULL DEFAULT 0 CHECK (bonus_bruised_boxes BETWEEN 0 AND 5),
  health_boxes JSONB NOT NULL DEFAULT '["none","none","none","none","none","none","none"]'::jsonb
    CHECK (jsonb_typeof(health_boxes) = 'array' AND jsonb_array_length(health_boxes) >= 7),

  -- Abilities, Specialties, Backgrounds, Merits/Flaws, Form-Specific Portraits, Active Buffs & Macros
  abilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  backgrounds JSONB NOT NULL DEFAULT '{}'::jsonb,
  merits_flaws JSONB NOT NULL DEFAULT '[]'::jsonb,
  portraits_by_form JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_buffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  macros JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Optimistic Concurrency for Durable Object Sync
  state_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metis must record a deformity
  CONSTRAINT chk_metis_deformity CHECK (
    breed <> 'metis' OR (metis_deformity IS NOT NULL AND length(trim(metis_deformity)) > 0)
  )
);

CREATE INDEX idx_characters_campaign_owner ON characters (campaign_id, owner_discord_id);

-- ============================================================================
-- 4. COMPENDIUM GIFTS, RITES, TOTEMS, CHARACTER GIFTS & FETISHES
-- ============================================================================
CREATE TABLE compendium_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE, -- NULL = global core W20 gift
  name TEXT NOT NULL,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6),
  sources TEXT[] NOT NULL DEFAULT '{}', -- e.g. ARRAY['ahroun', 'get_of_fenris']
  roll_attribute TEXT,                  -- e.g. 'dexterity', 'wits', 'gnosis', 'rage'
  roll_ability TEXT,                    -- e.g. 'primal_urge', 'occult', NULL for pure trait roll
  default_difficulty SMALLINT CHECK (default_difficulty BETWEEN 2 AND 10),
  rage_cost SMALLINT NOT NULL DEFAULT 0,
  gnosis_cost SMALLINT NOT NULL DEFAULT 0,
  willpower_cost SMALLINT NOT NULL DEFAULT 0,
  system_summary TEXT NOT NULL,
  macro_config JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_compendium_gifts_sources ON compendium_gifts USING GIN (sources);

CREATE TABLE compendium_rites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE, -- NULL = global core W20 rite
  name TEXT NOT NULL,
  rite_category TEXT NOT NULL CHECK (
    rite_category IN ('accord', 'caern', 'death', 'mystic', 'punishment', 'renown', 'seasonal', 'minor')
  ),
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
  roll_attribute TEXT,
  roll_ability TEXT,
  default_difficulty SMALLINT CHECK (default_difficulty BETWEEN 2 AND 10),
  gnosis_cost SMALLINT NOT NULL DEFAULT 0,
  system_summary TEXT NOT NULL,
  macro_config JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE compendium_totems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE, -- NULL = global core W20 totem
  name TEXT NOT NULL,
  totem_category TEXT NOT NULL CHECK (totem_category IN ('war', 'cunning', 'wisdom', 'respect')),
  background_cost SMALLINT NOT NULL CHECK (background_cost BETWEEN 1 AND 15),
  totem_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ban TEXT NOT NULL,
  system_summary TEXT NOT NULL,
  macro_config JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE character_gifts (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES compendium_gifts(id) ON DELETE CASCADE,
  is_active_buff BOOLEAN NOT NULL DEFAULT false,
  custom_notes TEXT,
  learned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, gift_id)
);

CREATE TABLE character_fetishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level SMALLINT NOT NULL CHECK (level BETWEEN 0 AND 6), -- 0 = Talen (single-use)
  gnosis_rating SMALLINT NOT NULL CHECK (gnosis_rating BETWEEN 1 AND 10),
  is_silver BOOLEAN NOT NULL DEFAULT false, -- e.g., Klaive reduces effective Gnosis
  weapon_damage_bonus SMALLINT,
  damage_type w20_damage_type DEFAULT 'aggravated',
  is_attuned BOOLEAN NOT NULL DEFAULT true,
  charges_remaining SMALLINT, -- Used for Talens
  system_summary TEXT NOT NULL,
  macro_config JSONB
);

-- ============================================================================
-- 5. IMMUTABLE DICE AUDIT LOG & XP LEDGER
-- ============================================================================
CREATE TABLE roll_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  roller_discord_id TEXT NOT NULL,
  label TEXT NOT NULL,
  pool_size SMALLINT NOT NULL,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 2 AND 10),
  has_specialty BOOLEAN NOT NULL DEFAULT false,
  spent_willpower BOOLEAN NOT NULL DEFAULT false,
  is_secret_st_roll BOOLEAN NOT NULL DEFAULT false,
  raw_dice SMALLINT[] NOT NULL,
  raw_successes SMALLINT NOT NULL,
  ones_rolled SMALLINT NOT NULL,
  net_successes SMALLINT NOT NULL,
  outcome w20_roll_outcome NOT NULL,
  physics_seed TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roll_logs_campaign_time ON roll_audit_logs (campaign_id, created_at DESC);

CREATE TABLE xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  delta SMALLINT NOT NULL, -- Positive = ST award, Negative = trait purchase
  reason TEXT NOT NULL,    -- e.g. "Session 4 Award" or "Brawl 3 -> 4 (Current x 2 = -6 XP)"
  approved_by_discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_xp_ledger_char_time ON xp_ledger (character_id, created_at DESC);
