-- ============================================================================
-- STANDALONE USER CHARACTER SHEETS (W20 PAGES 1 & 2, CROSS-ROOM ROSTER & SYNC)
-- ============================================================================

CREATE TABLE public.user_character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_discord_id TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  breed w20_breed NOT NULL DEFAULT 'homid',
  auspice w20_auspice NOT NULL DEFAULT 'ahroun',
  tribe TEXT NOT NULL DEFAULT 'get_of_fenris',
  rank SMALLINT NOT NULL DEFAULT 1 CHECK (rank BETWEEN 0 AND 6),
  active_form w20_form NOT NULL DEFAULT 'homid',
  sync_code TEXT UNIQUE,
  sheet_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_character_sheets_owner
  ON public.user_character_sheets (owner_discord_id, last_used_at DESC);

CREATE INDEX idx_user_character_sheets_sync_code
  ON public.user_character_sheets (sync_code)
  WHERE sync_code IS NOT NULL;

CREATE TRIGGER trg_user_character_sheets_updated_at
  BEFORE UPDATE ON public.user_character_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_character_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_character_sheets_select_owner"
  ON public.user_character_sheets FOR SELECT
  USING (owner_discord_id = public.requesting_discord_id());

CREATE POLICY "user_character_sheets_insert_owner"
  ON public.user_character_sheets FOR INSERT
  WITH CHECK (owner_discord_id = public.requesting_discord_id());

CREATE POLICY "user_character_sheets_update_owner"
  ON public.user_character_sheets FOR UPDATE
  USING (owner_discord_id = public.requesting_discord_id())
  WITH CHECK (owner_discord_id = public.requesting_discord_id());

CREATE POLICY "user_character_sheets_delete_owner"
  ON public.user_character_sheets FOR DELETE
  USING (owner_discord_id = public.requesting_discord_id());
