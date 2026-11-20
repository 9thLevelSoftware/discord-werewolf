-- ============================================================================
-- HELPER FUNCTIONS FOR CLEAN, INDEX-FRIENDLY RLS CHECKS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.requesting_discord_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'discord_id',
    auth.jwt() -> 'user_metadata' ->> 'provider_id'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_campaign_storyteller(target_campaign_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = target_campaign_id
      AND c.storyteller_discord_id = public.requesting_discord_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_campaign_member(target_campaign_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_campaign_storyteller(target_campaign_id)
    OR EXISTS (
      SELECT 1
      FROM public.characters ch
      WHERE ch.campaign_id = target_campaign_id
        AND ch.owner_discord_id = public.requesting_discord_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = target_campaign_id
        AND jsonb_typeof(auth.jwt() -> 'guild_ids') = 'array'
        AND (auth.jwt() -> 'guild_ids') ? c.discord_guild_id
    ),
    false
  );
$$;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ACROSS ALL TABLES
-- ============================================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compendium_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compendium_rites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compendium_totems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_fetishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;

-- 1. CAMPAIGNS
CREATE POLICY "campaign_select_members"
  ON public.campaigns FOR SELECT
  USING (public.is_campaign_member(id));

CREATE POLICY "campaign_manage_storyteller"
  ON public.campaigns FOR ALL
  USING (storyteller_discord_id = public.requesting_discord_id())
  WITH CHECK (storyteller_discord_id = public.requesting_discord_id());

-- 2. PACKS
CREATE POLICY "packs_select_members"
  ON public.packs FOR SELECT
  USING (public.is_campaign_member(campaign_id));

CREATE POLICY "packs_manage_storyteller"
  ON public.packs FOR ALL
  USING (public.is_campaign_storyteller(campaign_id))
  WITH CHECK (public.is_campaign_storyteller(campaign_id));

-- 3. CHARACTERS (Players see own characters + non-NPC packmates; ST sees all NPCs)
CREATE POLICY "characters_select_policy"
  ON public.characters FOR SELECT
  USING (
    owner_discord_id = public.requesting_discord_id()
    OR public.is_campaign_storyteller(campaign_id)
    OR (is_npc = false AND public.is_campaign_member(campaign_id))
  );

CREATE POLICY "characters_insert_owner_or_st"
  ON public.characters FOR INSERT
  WITH CHECK (
    (owner_discord_id = public.requesting_discord_id() AND is_npc = false)
    OR public.is_campaign_storyteller(campaign_id)
  );

CREATE POLICY "characters_update_owner_or_st"
  ON public.characters FOR UPDATE
  USING (
    owner_discord_id = public.requesting_discord_id()
    OR public.is_campaign_storyteller(campaign_id)
  )
  WITH CHECK (
    owner_discord_id = public.requesting_discord_id()
    OR public.is_campaign_storyteller(campaign_id)
  );

CREATE POLICY "characters_delete_st_only"
  ON public.characters FOR DELETE
  USING (public.is_campaign_storyteller(campaign_id));

-- 4. COMPENDIUM GIFTS, RITES & TOTEMS (Global core + campaign-specific homebrew)
CREATE POLICY "compendium_gifts_select"
  ON public.compendium_gifts FOR SELECT
  USING (campaign_id IS NULL OR public.is_campaign_member(campaign_id));

CREATE POLICY "compendium_gifts_write_st"
  ON public.compendium_gifts FOR ALL
  USING (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id))
  WITH CHECK (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id));

CREATE POLICY "compendium_rites_select"
  ON public.compendium_rites FOR SELECT
  USING (campaign_id IS NULL OR public.is_campaign_member(campaign_id));

CREATE POLICY "compendium_rites_write_st"
  ON public.compendium_rites FOR ALL
  USING (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id))
  WITH CHECK (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id));

CREATE POLICY "compendium_totems_select"
  ON public.compendium_totems FOR SELECT
  USING (campaign_id IS NULL OR public.is_campaign_member(campaign_id));

CREATE POLICY "compendium_totems_write_st"
  ON public.compendium_totems FOR ALL
  USING (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id))
  WITH CHECK (campaign_id IS NOT NULL AND public.is_campaign_storyteller(campaign_id));

-- 5. CHARACTER GIFTS & FETISHES
CREATE POLICY "char_gifts_access"
  ON public.character_gifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND (ch.owner_discord_id = public.requesting_discord_id() OR public.is_campaign_storyteller(ch.campaign_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND (ch.owner_discord_id = public.requesting_discord_id() OR public.is_campaign_storyteller(ch.campaign_id))
    )
  );

CREATE POLICY "char_fetishes_access"
  ON public.character_fetishes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND (ch.owner_discord_id = public.requesting_discord_id() OR public.is_campaign_storyteller(ch.campaign_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND (ch.owner_discord_id = public.requesting_discord_id() OR public.is_campaign_storyteller(ch.campaign_id))
    )
  );

-- 6. ROLL AUDIT LOGS (Immutable; secret ST rolls hidden from players)
CREATE POLICY "roll_logs_select_scrubbed"
  ON public.roll_audit_logs FOR SELECT
  USING (
    public.is_campaign_storyteller(campaign_id)
    OR (public.is_campaign_member(campaign_id) AND is_secret_st_roll = false)
  );

-- 7. XP LEDGER (Players can read; ONLY Storyteller can award/deduct XP)
CREATE POLICY "xp_ledger_select"
  ON public.xp_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND (ch.owner_discord_id = public.requesting_discord_id() OR public.is_campaign_storyteller(ch.campaign_id))
    )
  );

CREATE POLICY "xp_ledger_write_st_only"
  ON public.xp_ledger FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.characters ch
      WHERE ch.id = character_id
        AND public.is_campaign_storyteller(ch.campaign_id)
    )
  );

-- ============================================================================
-- TRIGGERS: UPDATED_AT & PERMANENT TRAIT GUARD ON CHARACTERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_characters_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_character_permanent_trait_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role BOOLEAN;
  is_storyteller BOOLEAN;
BEGIN
  is_service_role := (
    current_user IN ('service_role', 'postgres', 'supabase_admin')
    OR COALESCE(auth.role(), '') = 'service_role'
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
  );

  IF is_service_role THEN
    RETURN NEW;
  END IF;

  is_storyteller := public.is_campaign_storyteller(OLD.campaign_id);
  IF is_storyteller THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
    OR NEW.owner_discord_id IS DISTINCT FROM OLD.owner_discord_id
    OR NEW.is_npc IS DISTINCT FROM OLD.is_npc
    OR NEW.rank IS DISTINCT FROM OLD.rank
    OR NEW.attr_strength IS DISTINCT FROM OLD.attr_strength
    OR NEW.attr_dexterity IS DISTINCT FROM OLD.attr_dexterity
    OR NEW.attr_stamina IS DISTINCT FROM OLD.attr_stamina
    OR NEW.attr_charisma IS DISTINCT FROM OLD.attr_charisma
    OR NEW.attr_manipulation IS DISTINCT FROM OLD.attr_manipulation
    OR NEW.attr_appearance IS DISTINCT FROM OLD.attr_appearance
    OR NEW.attr_perception IS DISTINCT FROM OLD.attr_perception
    OR NEW.attr_intelligence IS DISTINCT FROM OLD.attr_intelligence
    OR NEW.attr_wits IS DISTINCT FROM OLD.attr_wits
    OR NEW.abilities IS DISTINCT FROM OLD.abilities
    OR NEW.rage_perm IS DISTINCT FROM OLD.rage_perm
    OR NEW.gnosis_perm IS DISTINCT FROM OLD.gnosis_perm
    OR NEW.willpower_perm IS DISTINCT FROM OLD.willpower_perm
    OR NEW.renown_glory_perm IS DISTINCT FROM OLD.renown_glory_perm
    OR NEW.renown_honor_perm IS DISTINCT FROM OLD.renown_honor_perm
    OR NEW.renown_wisdom_perm IS DISTINCT FROM OLD.renown_wisdom_perm
  ) THEN
    RAISE EXCEPTION 'Only the Storyteller or service_role may modify permanent character traits.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_characters_permanent_trait_guard
  BEFORE UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_character_permanent_trait_guard();
