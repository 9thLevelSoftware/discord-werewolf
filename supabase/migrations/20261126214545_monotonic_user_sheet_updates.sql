-- Each successful compare-and-swap must invalidate the version read by other rooms.
-- A millisecond also survives the round trip through a JavaScript sheet timestamp.
CREATE FUNCTION public.advance_user_sheet_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 millisecond');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_user_character_sheets_updated_at
  BEFORE UPDATE ON public.user_character_sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_user_sheet_updated_at();
