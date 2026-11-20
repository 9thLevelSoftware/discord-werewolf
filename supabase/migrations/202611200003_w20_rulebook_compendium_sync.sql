-- ============================================================================
-- W20 CORE RULEBOOK FIDELITY SYNC (W20 pp. 112-114, 152, 159)
-- Idempotent update for canonical beginning Gift sources, roll pools, & costs.
-- ============================================================================

UPDATE public.compendium_gifts
SET
  sources = ARRAY['homid','get_of_fenris'],
  roll_attribute = NULL,
  roll_ability = NULL,
  default_difficulty = 6,
  rage_cost = 0,
  gnosis_cost = 1,
  willpower_cost = 0,
  system_summary = 'Spend 1 Gnosis: fire damage heals as Bashing rather than Aggravated for the scene (W20 p. 152).',
  macro_config = '{"id":"gift-master-of-fire","name":"Master of Fire","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":3,"durationRounds":10}],"summary":"Spend 1 Gnosis: fire damage heals as Bashing rather than Aggravated for the scene."}'::jsonb
WHERE id = '10000000-0000-4000-8000-000000000101';

UPDATE public.compendium_gifts
SET sources = ARRAY['homid','philodox','fianna','glass_walkers']
WHERE id = '10000000-0000-4000-8000-000000000102';

UPDATE public.compendium_gifts
SET sources = ARRAY['metis','theurge','black_furies','silent_striders','silver_fangs','stargazers','uktena']
WHERE id = '10000000-0000-4000-8000-000000000106';

UPDATE public.compendium_gifts
SET sources = ARRAY['lupus','fianna']
WHERE id = '10000000-0000-4000-8000-000000000107';

UPDATE public.compendium_gifts
SET sources = ARRAY['lupus','galliard','black_furies']
WHERE id = '10000000-0000-4000-8000-000000000108';

UPDATE public.compendium_gifts
SET
  sources = ARRAY['lupus'],
  roll_attribute = 'perception',
  roll_ability = 'primal_urge',
  default_difficulty = 6,
  system_summary = 'Roll Perception + Primal-Urge (Diff 6) to pinpoint the trail, distance, and condition of hunted quarry (W20 p. 159).',
  macro_config = '{"id":"gift-sense-prey","name":"Sense Prey","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"primal_urge"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Track quarry direction and distance."}],"summary":"Focus primal instincts to locate a specific target or packmate."}'::jsonb
WHERE id = '10000000-0000-4000-8000-000000000109';

UPDATE public.compendium_gifts
SET sources = ARRAY['theurge','children_of_gaia']
WHERE id = '10000000-0000-4000-8000-000000000113';

UPDATE public.compendium_gifts
SET sources = ARRAY['theurge','uktena']
WHERE id = '10000000-0000-4000-8000-000000000114';

UPDATE public.compendium_gifts
SET sources = ARRAY['philodox','children_of_gaia','get_of_fenris','wendigo']
WHERE id = '10000000-0000-4000-8000-000000000115';

UPDATE public.compendium_gifts
SET sources = ARRAY['ahroun','silver_fangs']
WHERE id = '10000000-0000-4000-8000-000000000121';

UPDATE public.compendium_gifts
SET sources = ARRAY['ahroun','stargazers']
WHERE id = '10000000-0000-4000-8000-000000000122';
