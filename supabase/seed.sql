-- ============================================================================
-- CANONICAL W20 COMPENDIUM SEED (IDEMPOTENT)
-- Covers Level 1-5 Gifts across all 3 Breeds, 5 Auspices, and 13 Tribes,
-- Starter Rites, and Pack Totems with valid W20MacroDefinition JSON configs.
-- ============================================================================

INSERT INTO public.compendium_gifts (
  id, campaign_id, name, level, sources, roll_attribute, roll_ability,
  default_difficulty, rage_cost, gnosis_cost, willpower_cost, system_summary, macro_config
) VALUES
-- ----------------------------------------------------------------------------
-- LEVEL 1 GIFTS (BREEDS, AUSPICES, AND ALL 13 TRIBES)
-- ----------------------------------------------------------------------------
(
  '10000000-0000-4000-8000-000000000101', NULL, 'Master of Fire', 1,
  ARRAY['homid','get_of_fenris'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis: fire damage heals as Bashing rather than Aggravated for the scene (W20 p. 152).',
  '{"id":"gift-master-of-fire","name":"Master of Fire","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":3,"durationRounds":10}],"summary":"Spend 1 Gnosis: fire damage heals as Bashing rather than Aggravated for the scene."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000102', NULL, 'Persuasion', 1,
  ARRAY['homid','philodox','fianna','glass_walkers'], 'charisma', 'subterfuge', 7, 0, 0, 0,
  'Roll Charisma + Subterfuge (Diff 7) to gain -1 difficulty on Social rolls and sway skeptical listeners.',
  '{"id":"gift-persuasion","name":"Persuasion","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"subterfuge"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Persuasion lowers social resistance by -1 difficulty on success."}],"summary":"Words carry uncanny conviction against humans and spirits alike."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000103', NULL, 'Smell of Man', 1,
  ARRAY['homid'], NULL, NULL, 6, 0, 0, 0,
  'Passive/Willpower: normal animals perceive the Garou as an apex human hunter and flee or hesitate.',
  '{"id":"gift-smell-of-man","name":"Smell of Man","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Mundane beasts recoil from the Garou scent of humanity."}],"summary":"Wild animals react with instinctive caution toward the Garou."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000104', NULL, 'Create Element', 1,
  ARRAY['metis'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 6) to conjure up to one cubic foot of air, earth, fire, or water.',
  '{"id":"gift-create-element","name":"Create Element","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Conjure elemental matter based on Gnosis successes."}],"summary":"Manifest small quantities of a chosen classical element."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000105', NULL, 'Primal Anger', 1,
  ARRAY['metis'], NULL, NULL, 6, 0, 0, 0,
  'Passive/Instant: draw upon inner resentment to store up to two extra Rage points above permanent Rage for one scene.',
  '{"id":"gift-primal-anger","name":"Primal Anger","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":1,"durationRounds":5}],"summary":"Channel Metis fury to temporarily exceed normal Rage limits."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000106', NULL, 'Sense Wyrm', 1,
  ARRAY['metis','theurge','black_furies','silent_striders','silver_fangs','stargazers','uktena'], 'perception', 'occult', 6, 0, 0, 0,
  'Roll Perception + Occult (Diff 6, or higher if masked) to detect nearby Wyrm taint, Banes, or possessed vessels.',
  '{"id":"gift-sense-wyrm","name":"Sense Wyrm","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"occult"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Reveal nearby Wyrm taint intensity and direction."}],"summary":"Smell or sense spiritual corruption of the Wyrm nearby."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000107', NULL, 'Hare''s Leap', 1,
  ARRAY['lupus','fianna'], 'strength', 'athletics', 7, 0, 0, 0,
  'Roll Strength + Athletics (Diff 7) to double normal jumping distances in any form.',
  '{"id":"gift-hares-leap","name":"Hare''s Leap","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"strength","ability":"athletics"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Leap distance doubled on success."}],"summary":"Spring across gaps and obstacles with supernatural agility."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000108', NULL, 'Heightened Senses', 1,
  ARRAY['lupus','galliard','black_furies'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to sharpen sight, hearing, and scent for the scene (-2 Perception difficulty in Homid/Glabro; acute tracking in wolf forms).',
  '{"id":"gift-heightened-senses","name":"Heightened Senses","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Perception difficulty reduced by 2 for the scene."}],"summary":"Gain lupine sensory acuity regardless of current form."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000109', NULL, 'Sense Prey', 1,
  ARRAY['lupus'], 'perception', 'primal_urge', 6, 0, 0, 0,
  'Roll Perception + Primal-Urge (Diff 6) to pinpoint the trail, distance, and condition of hunted quarry (W20 p. 159).',
  '{"id":"gift-sense-prey","name":"Sense Prey","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"primal_urge"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Track quarry direction and distance."}],"summary":"Focus primal instincts to locate a specific target or packmate."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000110', NULL, 'Blur of the Milky Eye', 1,
  ARRAY['ragabash'], 'manipulation', 'stealth', 8, 0, 0, 0,
  'Roll Manipulation + Stealth (Diff 8) to become unremarkable and slip past onlookers unnoticed while motionless or walking casually.',
  '{"id":"gift-blur-milky-eye","name":"Blur of the Milky Eye","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"stealth"},"difficulty":{"kind":"static","value":8},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target overlooks the Garou unless successes exceed Perception + Alertness."}],"summary":"Slip out of sight behind a veil of unnoticeability."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000111', NULL, 'Open Seal', 1,
  ARRAY['ragabash'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to unlock nearly any physical lock, latch, or sealed door.',
  '{"id":"gift-open-seal","name":"Open Seal","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Physical lock or barrier unlatches if successes meet complexity."}],"summary":"Command spirit of lock or door to open."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000112', NULL, 'Scent of Running Water', 1,
  ARRAY['ragabash','red_talons'], NULL, NULL, 6, 0, 0, 0,
  'Passive: completely masks natural scent so tracking dogs and Garou take +2 difficulty to track by smell.',
  '{"id":"gift-scent-running-water","name":"Scent of Running Water","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Scent trail masked (+2 tracking difficulty)."}],"summary":"Erase scent trail as though washed away by clean water."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000113', NULL, 'Mother''s Touch', 1,
  ARRAY['theurge','children_of_gaia'], 'intelligence', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Intelligence + Empathy (Diff 6, or higher for Aggravated) to heal 1 health level per success.',
  '{"id":"gift-mothers-touch","name":"Mother''s Touch","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"empathy"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"heal_wounds","levels":2,"healAggravated":true}],"summary":"Channel Gaia''s mercy to mend Bashing, Lethal, or Aggravated wounds."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000114', NULL, 'Spirit Speech', 1,
  ARRAY['theurge','uktena'], NULL, NULL, 6, 0, 0, 0,
  'Passive: understand and speak the high speech of spirits across the Umbra.',
  '{"id":"gift-spirit-speech","name":"Spirit Speech","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Understand and converse fluently with spirits."}],"summary":"Comprehend the native tongue of Umbrood spirits."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000115', NULL, 'Resist Pain', 1,
  ARRAY['philodox','children_of_gaia','get_of_fenris','wendigo'], NULL, NULL, 6, 0, 0, 1,
  'Spend 1 Willpower to ignore all wound penalties for the remainder of the scene.',
  '{"id":"gift-resist-pain","name":"Resist Pain","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":1},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":1,"durationRounds":10}],"summary":"Shrug off crippling agony and ignore wound dice penalties."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000116', NULL, 'Truth of Gaia', 1,
  ARRAY['philodox'], 'intelligence', 'empathy', 6, 0, 0, 0,
  'Roll Intelligence + Empathy (Diff target Manipulation + Subterfuge or 6) to discern deliberate lies.',
  '{"id":"gift-truth-of-gaia","name":"Truth of Gaia","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"empathy"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Storyteller whispers whether target spoke truth, lie, or half-truth."}],"summary":"Hear the ring of truth or deceit in another''s words."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000117', NULL, 'Beast Speech', 1,
  ARRAY['galliard','red_talons'], NULL, NULL, 6, 0, 0, 0,
  'Passive: communicate effortlessly with mundane animals of any species.',
  '{"id":"gift-beast-speech","name":"Beast Speech","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Speak with animals without an Animal Ken roll."}],"summary":"Converse natively with birds, wolves, and other beasts."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000118', NULL, 'Call of the Wyld', 1,
  ARRAY['galliard'], 'stamina', 'expression', 6, 0, 0, 0,
  'Roll Stamina + Expression (Diff 6) to send a supernatural howl miles across terrain, summoning allies or rallying packmates.',
  '{"id":"gift-call-of-the-wyld","name":"Call of the Wyld","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"expression"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":1,"durationRounds":3}],"summary":"Project a resonant Garou howl far beyond natural range."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000119', NULL, 'Mindspeak', 1,
  ARRAY['galliard'], 'manipulation', 'expression', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Expression (Diff 6) to project thoughts or emotions into a packmate''s mind.',
  '{"id":"gift-mindspeak","name":"Mindspeak","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"expression"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Deliver silent telepathic message to chosen target."}],"summary":"Silently share words, images, or warnings across a scene."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000120', NULL, 'Razor Claws', 1,
  ARRAY['ahroun','get_of_fenris'], NULL, NULL, 6, 1, 0, 0,
  'Spend 1 Rage and rake claws over stone or metal to gain +2 damage dice and -1 claw difficulty for the scene (Crinos/Hispo/Lupus).',
  '{"id":"gift-razor-claws","name":"Razor Claws","category":"gift","rankOrLevel":1,"requiredForms":["crinos","hispo","lupus"],"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_claw_damage","bonusDice":2,"durationRounds":10}],"summary":"Hone claws to razor edges for +2 Aggravated damage dice."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000121', NULL, 'Inspiration', 1,
  ARRAY['ahroun','silver_fangs'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to rally packmates within sight, granting each ally 1 automatic Willpower success on their next action or Courage check.',
  '{"id":"gift-inspiration","name":"Inspiration","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":3}],"summary":"Bolster the pack''s courage and tactical focus in combat."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000122', NULL, 'Falling Touch', 1,
  ARRAY['ahroun','stargazers'], 'dexterity', 'medicine', 6, 0, 0, 0,
  'Roll Dexterity + Medicine (Diff target Stamina + 3) to drop an opponent prone with a single precise strike.',
  '{"id":"gift-falling-touch","name":"Falling Touch","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"dexterity","ability":"medicine"},"difficulty":{"kind":"target_trait","trait":"stamina_plus_3"},"effects":[{"type":"weapon_strike","damageBonus":0,"damageType":"bashing","isSilver":false}],"summary":"Strike a nerve cluster to knock an adversary off their feet."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000123', NULL, 'Breath of the Wyld', 1,
  ARRAY['black_furies'], 'charisma', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Empathy (Diff 6) to revitalize an exhausted or grieving ally.',
  '{"id":"gift-breath-of-the-wyld","name":"Breath of the Wyld","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"empathy"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"heal_wounds","levels":1,"healAggravated":false}],"summary":"Restore stamina and calm emotional shock with Wyld vitality."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000124', NULL, 'Cooking', 1,
  ARRAY['bone_gnawers'], 'intelligence', 'survival', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Intelligence + Survival (Diff 6) to turn scrap into nourishing sustenance for a pack.',
  '{"id":"gift-cooking","name":"Cooking","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"survival"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"heal_wounds","levels":1,"healAggravated":false}],"summary":"Transform inedible refuse into safe, fortifying food."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000125', NULL, 'Resist Toxin', 1,
  ARRAY['bone_gnawers','fianna'], 'stamina', 'survival', 6, 0, 0, 0,
  'Roll Stamina + Survival (Diff 6) to neutralize poisons, drugs, or Wyrm-tainted toxins.',
  '{"id":"gift-resist-toxin","name":"Resist Toxin","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"survival"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":3,"durationRounds":5}],"summary":"Neutralize chemical poisons and Wyrm venom in the bloodstream."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000126', NULL, 'Calm', 1,
  ARRAY['children_of_gaia'], 'charisma', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Empathy (Diff target Rage or Willpower) to soothe Rage and avert Frenzy.',
  '{"id":"gift-calm","name":"Calm","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"empathy"},"difficulty":{"kind":"target_trait","trait":"rage"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Reduces target temporary Rage or ends Frenzy on sufficient successes."}],"summary":"Soothe violent frenzy and cool rising Rage in allies or foes."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000127', NULL, 'Brother''s Scent', 1,
  ARRAY['children_of_gaia'], 'charisma', 'primal_urge', 6, 0, 0, 0,
  'Roll Charisma + Primal-Urge (Diff 6) to radiate peaceful familiarity so hostile packmates hesitate before attacking.',
  '{"id":"gift-brothers-scent","name":"Brother''s Scent","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"primal_urge"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Hostile beasts or Garou view the caster as kin."}],"summary":"Project an aura of kinship that discourages aggression."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000128', NULL, 'Two Tongues', 1,
  ARRAY['fianna'], 'intelligence', 'expression', 6, 0, 0, 0,
  'Roll Intelligence + Expression (Diff 6) to deliver a statement carrying two clear meanings at once.',
  '{"id":"gift-two-tongues","name":"Two Tongues","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"expression"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Secret secondary meaning understood only by intended listeners."}],"summary":"Speak hidden codes within ordinary conversation."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000129', NULL, 'Visage of Fenris', 1,
  ARRAY['get_of_fenris'], 'charisma', 'intimidation', 6, 1, 0, 0,
  'Spend 1 Rage and roll Charisma + Intimidation (Diff 6) to project terrifying battle fury, penalizing weak-willed foes.',
  '{"id":"gift-visage-of-fenris","name":"Visage of Fenris","category":"gift","rankOrLevel":1,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"intimidation"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":4}],"summary":"Exude terrifying martial ferocity on the battlefield."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000130', NULL, 'Control Simple Machine', 1,
  ARRAY['glass_walkers'], 'manipulation', 'technology', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Technology (Diff 6) to operate, jam, or command simple mechanical devices.',
  '{"id":"gift-control-simple-machine","name":"Control Simple Machine","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"technology"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target mechanical lock, firearm, or hinge obeys simple command."}],"summary":"Command Weaver-spirits inside simple gears, firearms, or latches."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000131', NULL, 'Diagnostics', 1,
  ARRAY['glass_walkers'], 'perception', 'science', 6, 0, 0, 0,
  'Roll Perception + Science (Diff 6) to immediately understand how a device functions and identify faults or sabotage.',
  '{"id":"gift-diagnostics","name":"Diagnostics","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"science"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Reveal machine blueprint, fault, or security trigger."}],"summary":"Read mechanical or electronic defects at a glance."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000132', NULL, 'Wolf at the Door', 1,
  ARRAY['red_talons'], 'manipulation', 'intimidation', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Intimidation (Diff 7) to trap a human indoors through primal dread of the wild outside.',
  '{"id":"gift-wolf-at-the-door","name":"Wolf at the Door","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"intimidation"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target human refuses to cross thresholds into the outdoors."}],"summary":"Fill enclosed spaces with paralyzing dread of what prowls outside."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000133', NULL, 'Aura of Confidence', 1,
  ARRAY['shadow_lords'], NULL, NULL, 6, 0, 0, 0,
  'Passive/Instant: hide all emotional uncertainty and resist mind-reading attempts.',
  '{"id":"gift-aura-of-confidence","name":"Aura of Confidence","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Emotions and doubts are masked from telepathy and Empathy."}],"summary":"Project unshakable authority while concealing all vulnerability."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000134', NULL, 'Fatal Flaw', 1,
  ARRAY['shadow_lords'], 'perception', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Perception + Empathy (Diff target Willpower) to expose an adversary''s greatest weakness.',
  '{"id":"gift-fatal-flaw","name":"Fatal Flaw","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"empathy"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Expose target physical, social, or tactical vulnerability."}],"summary":"Identify a foe''s blind spot for decisive exploitation."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000135', NULL, 'Speed of Thought', 1,
  ARRAY['silent_striders'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to double running speed for the scene.',
  '{"id":"gift-speed-of-thought","name":"Speed of Thought","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":10}],"summary":"Sprint at supernatural speed across city or desert."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000136', NULL, 'Heaven''s Guidance', 1,
  ARRAY['silent_striders'], 'perception', 'survival', 6, 0, 0, 0,
  'Roll Perception + Survival (Diff 6) under open sky to gain uncanny bearings and navigate unerringly.',
  '{"id":"gift-heavens-guidance","name":"Heaven''s Guidance","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"survival"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"True direction and shortest safe path revealed."}],"summary":"Read the sky and horizon to never lose your way."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000137', NULL, 'Eye of the Falcon', 1,
  ARRAY['silver_fangs'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to command respect from all Garou of lower Rank for one scene.',
  '{"id":"gift-eye-of-the-falcon","name":"Eye of the Falcon","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Lower-ranked Garou feel compelled to heed your command."}],"summary":"Meet a subordinate''s gaze with undeniable royal authority."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000138', NULL, 'Lambent Flame', 1,
  ARRAY['silver_fangs'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to surround your body in silver moonlight (+1 difficulty on incoming attacks; -1 Social difficulty with Garou).',
  '{"id":"gift-lambent-flame","name":"Lambent Flame","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":2,"durationRounds":10}],"summary":"Aura of cool silver light dazzles attackers and commands awe."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000139', NULL, 'Balance', 1,
  ARRAY['stargazers'], NULL, NULL, 6, 0, 0, 0,
  'Passive: maintain flawless footing on narrow ledges, slick ice, or unstable surfaces; reduce knockdown difficulty.',
  '{"id":"gift-balance","name":"Balance","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":1,"durationRounds":10}],"summary":"Center physical poise against trips, falls, and rough terrain."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000140', NULL, 'Inner Strength', 1,
  ARRAY['stargazers'], 'stamina', 'athletics', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Stamina + Athletics (Diff 6) to focus chi and add temporary Willpower or ignore fatigue.',
  '{"id":"gift-inner-strength","name":"Inner Strength","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"athletics"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":2,"durationRounds":5}],"summary":"Center mind and body to replenish resolve and endurance."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000141', NULL, 'Sense Magic', 1,
  ARRAY['uktena'], 'perception', 'occult', 6, 0, 0, 0,
  'Roll Perception + Occult (Diff 6) to detect active Fetishes, Gifts, Rites, or sorcery nearby.',
  '{"id":"gift-sense-magic","name":"Sense Magic","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"occult"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Detect supernatural enchantments, fetishes, and rites in range."}],"summary":"Perceive spiritual resonance of magic, fetishes, and rituals."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000142', NULL, 'Shroud', 1,
  ARRAY['uktena'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to blanket an area in unnatural shadow, raising Perception/Ranged difficulties.',
  '{"id":"gift-shroud","name":"Shroud","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Area shrouded in twilight gloom (+2 visual perception diff)."}],"summary":"Summon creeping darkness to conceal pack movements."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000143', NULL, 'Call the Breeze', 1,
  ARRAY['wendigo'], 'charisma', 'survival', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Survival (Diff 6) to summon biting wind that chills foes and masks scents.',
  '{"id":"gift-call-the-breeze","name":"Call the Breeze","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"survival"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Biting wind disperses tracks and penalizes ranged fire."}],"summary":"Summon chill northern winds to scatter scents and hinder foes."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000144', NULL, 'Camouflage', 1,
  ARRAY['wendigo'], 'wits', 'stealth', 6, 0, 0, 0,
  'Roll Wits + Stealth (Diff 6) to blend seamlessly into snow, timber, or natural wilderness cover.',
  '{"id":"gift-camouflage","name":"Camouflage","category":"gift","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"stealth"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Wilderness concealment adds successes to detection difficulty."}],"summary":"Melt into forest, frost, and shadow until motionless ambush strikes."}'::jsonb
),

-- ----------------------------------------------------------------------------
-- LEVEL 2 GIFTS (BREEDS, AUSPICES, AND ALL 13 TRIBES)
-- ----------------------------------------------------------------------------
(
  '10000000-0000-4000-8000-000000000201', NULL, 'Jam Technology', 2,
  ARRAY['homid'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to temporarily disable mechanical or electronic devices within 50 feet.',
  '{"id":"gift-jam-technology","name":"Jam Technology","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Firearms, radios, and cameras stall for 1 round per success."}],"summary":"Force local technological spirits into temporary dormancy."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000202', NULL, 'Staredown', 2,
  ARRAY['homid'], 'charisma', 'intimidation', 6, 0, 0, 0,
  'Roll Charisma + Intimidation (Diff target Willpower) to cow an opponent into backing down.',
  '{"id":"gift-staredown","name":"Staredown","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"intimidation"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target freezes or retreats unless Willpower spent."}],"summary":"Dominate a rival''s nerve with predatory eye contact."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000203', NULL, 'Curse of Hatred', 2,
  ARRAY['metis'], 'manipulation', 'expression', 7, 1, 0, 0,
  'Spend 1 Rage and roll Manipulation + Expression (Diff target Willpower) to drain target Willpower and instill despair.',
  '{"id":"gift-curse-of-hatred","name":"Curse of Hatred","category":"gift","rankOrLevel":2,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"expression"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target loses temporary Willpower and suffers self-doubt."}],"summary":"Inflict crushing self-loathing with venomous barbs."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000204', NULL, 'Name the Spirit', 2,
  ARRAY['lupus'], 'perception', 'occult', 8, 0, 0, 0,
  'Roll Perception + Occult (Diff 8) to identify a spirit''s true nature, Brood, and rank across the Gauntlet.',
  '{"id":"gift-name-the-spirit","name":"Name the Spirit","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"occult"},"difficulty":{"kind":"static","value":8},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Reveal spirit court, true name, and vulnerabilities."}],"summary":"Discern the lineage and essence of any Umbrood spirit."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000205', NULL, 'Blissful Ignorance', 2,
  ARRAY['ragabash','bone_gnawers','silent_striders'], 'manipulation', 'stealth', 7, 0, 0, 0,
  'Roll Manipulation + Stealth (Diff 7) to conceal your physical presence completely while remaining quiet.',
  '{"id":"gift-blissful-ignorance","name":"Blissful Ignorance","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"stealth"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Nearly invisible until sudden aggressive action."}],"summary":"Fade from conscious attention even under direct scrutiny."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000206', NULL, 'Command Spirit', 2,
  ARRAY['theurge'], 'charisma', 'leadership', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Leadership (Diff spirit Gnosis) to compel an Umbrood spirit to obey a clear directive.',
  '{"id":"gift-command-spirit","name":"Command Spirit","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"leadership"},"difficulty":{"kind":"target_trait","trait":"gnosis"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Spirit must obey 1 task per net success."}],"summary":"Bind lesser spirits to carry out an immediate task."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000207', NULL, 'King of the Beasts', 2,
  ARRAY['philodox'], 'charisma', 'animal_ken', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Animal Ken (Diff 6) to command all mundane animals in earshot.',
  '{"id":"gift-king-of-the-beasts","name":"King of the Beasts","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"animal_ken"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Nearby beasts obey pack-leader commands for the scene."}],"summary":"Assert undeniable dominance over natural fauna."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000208', NULL, 'Call of the Wyrm', 2,
  ARRAY['galliard'], 'manipulation', 'performance', 7, 0, 0, 0,
  'Roll Manipulation + Performance (Diff 7) to howl a baiting challenge that lures Wyrm creatures toward the pack.',
  '{"id":"gift-call-of-the-wyrm","name":"Call of the Wyrm","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"performance"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Nearby Wyrm servants are drawn to investigate the call."}],"summary":"Mimic Wyrm resonance to draw corrupted predators into ambush."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000209', NULL, 'Spirit of the Fray', 2,
  ARRAY['ahroun'], NULL, NULL, 6, 0, 1, 0,
  'Passive +10 Initiative; spend 1 Gnosis pre-initiative for an additional +10 Initiative this turn (locks Rage for the turn).',
  '{"id":"gift-spirit-of-the-fray","name":"Spirit of the Fray","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":10,"durationRounds":1}],"summary":"Surge ahead with lightning reflexes (+10 passive, +10 extra for 1 Gnosis)."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000210', NULL, 'Sense Silver', 2,
  ARRAY['ahroun'], 'perception', 'alertness', 7, 0, 0, 0,
  'Roll Perception + Alertness (Diff 7) to detect hidden silver weapons, silver bullets, or Klaives nearby.',
  '{"id":"gift-sense-silver","name":"Sense Silver","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"alertness"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Reveal concealed silver weapons within 60 feet."}],"summary":"Catch the metallic tang of lethal silver before the ambush springs."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000211', NULL, 'Curse of Aeolus', 2,
  ARRAY['black_furies'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to cloak the battlefield in dense mist that obscures foes while leaving packmates'' vision clear.',
  '{"id":"gift-curse-of-aeolus","name":"Curse of Aeolus","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Dense fog blinds adversaries (+2 ranged/perception diff)."}],"summary":"Wrap the terrain in choking fog favorable to the pack."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000212', NULL, 'Luna''s Armor', 2,
  ARRAY['children_of_gaia'], 'stamina', 'survival', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Stamina + Survival (Diff 6) to add successes as bonus Soak dice (including Aggravated, excluding Silver).',
  '{"id":"gift-lunas-armor","name":"Luna''s Armor","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"survival"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":5,"durationRounds":10}],"summary":"Coat flesh in protective silver-grey luminescence (+Soak per success)."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000213', NULL, 'Glib Tongue', 2,
  ARRAY['fianna'], 'manipulation', 'subterfuge', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Subterfuge (Diff target Wits + Subterfuge) to speak fast and confuse rivals.',
  '{"id":"gift-glib-tongue","name":"Glib Tongue","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"subterfuge"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target distracted or tricked in negotiation."}],"summary":"Spin irresistible banter that trips up even sharp-witted foes."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000214', NULL, 'Halt the Coward''s Flight', 2,
  ARRAY['get_of_fenris'], 'stamina', 'athletics', 7, 1, 0, 0,
  'Spend 1 Rage and roll Stamina + Athletics (Diff 7) to double pursuit speed and prevent a target from escaping.',
  '{"id":"gift-halt-cowards-flight","name":"Halt the Coward''s Flight","category":"gift","rankOrLevel":2,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"athletics"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_initiative_flat","bonus":3,"durationRounds":3}],"summary":"Burst forward in relentless pursuit of fleeing prey."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000215', NULL, 'Cybernetic Senses', 2,
  ARRAY['glass_walkers'], 'perception', 'technology', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Perception + Technology (Diff 6) to perceive radio transmissions, cameras, or infrared fields.',
  '{"id":"gift-cybernetic-senses","name":"Cybernetic Senses","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"technology"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Detect hidden electronics, cameras, and wireless traffic."}],"summary":"See electromagnetic emissions, laser grids, and surveillance sensors."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000216', NULL, 'Render Down', 2,
  ARRAY['red_talons'], 'strength', 'brawl', 7, 1, 0, 0,
  'Spend 1 Rage and roll Strength + Brawl (Diff 7) to tear apart man-made armor, vehicles, or metal restraints.',
  '{"id":"gift-render-down","name":"Render Down","category":"gift","rankOrLevel":2,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"strength","ability":"brawl"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":3,"damageType":"lethal","isSilver":false}],"summary":"Shred synthetic armor, steel doors, and Weaver machinery."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000217', NULL, 'Clap of Thunder', 2,
  ARRAY['shadow_lords'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to unleash a booming thunderclap that stuns nearby enemies for one round.',
  '{"id":"gift-clap-of-thunder","name":"Clap of Thunder","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Foes within 20 feet lose initiative or suffer -2 dice next turn."}],"summary":"Shatter concentration with an echoing thunderous shockwave."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000218', NULL, 'Awe', 2,
  ARRAY['silver_fangs'], 'charisma', 'leadership', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Leadership (Diff target Willpower) to captivate a crowd in majestic silence.',
  '{"id":"gift-awe","name":"Awe","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"leadership"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Onlookers heed the Silver Fang''s proclamation in awe."}],"summary":"Radiate royal majesty that commands stillness and obedience."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000219', NULL, 'Surface Attunement', 2,
  ARRAY['stargazers'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to glide effortlessly over water, snow, mud, or loose scree without leaving tracks.',
  '{"id":"gift-surface-attunement","name":"Surface Attunement","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Walk on water, bog, or snow without sinking or leaving tracks."}],"summary":"Traverse treacherous terrain without impediment or trail."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000220', NULL, 'Shadows at Dawn', 2,
  ARRAY['uktena'], 'perception', 'stealth', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Perception + Stealth (Diff 7) to vanish into dim twilight or deep shade.',
  '{"id":"gift-shadows-at-dawn","name":"Shadows at Dawn","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"stealth"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Concealed in shadows even from keen predators."}],"summary":"Step into shadow and become unseen by mundane and umbral eyes."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000221', NULL, 'Cutting Wind', 2,
  ARRAY['wendigo'], 'strength', 'survival', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Strength + Survival (Diff 7) to launch razor-cold gusts dealing Lethal damage at range.',
  '{"id":"gift-cutting-wind","name":"Cutting Wind","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"strength","ability":"survival"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"lethal","isSilver":false}],"summary":"Hurl freezing arctic wind that slices foes across distance."}'::jsonb
),

-- ----------------------------------------------------------------------------
-- LEVEL 3 GIFTS (BREEDS, AUSPICES, AND ALL 13 TRIBES)
-- ----------------------------------------------------------------------------
(
  '10000000-0000-4000-8000-000000000301', NULL, 'Disquiet', 3,
  ARRAY['homid'], 'manipulation', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Empathy (Diff target Willpower) to inflict profound unease, preventing Rage or Willpower spends.',
  '{"id":"gift-disquiet","name":"Disquiet","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"empathy"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target suffers +2 difficulty and cannot spend Willpower on next test."}],"summary":"Cloud a target''s mind with dread and hesitation."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000302', NULL, 'Eyes of the Cat', 3,
  ARRAY['metis'], NULL, NULL, 6, 0, 0, 0,
  'Passive: see clearly in total darkness without light sources or penalty.',
  '{"id":"gift-eyes-of-the-cat","name":"Eyes of the Cat","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Perfect darkvision active in pitch blackness."}],"summary":"Piercing emerald vision eliminates darkness penalties."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000303', NULL, 'Catfeet', 3,
  ARRAY['lupus'], NULL, NULL, 6, 0, 0, 0,
  'Passive: gain -2 difficulty on Athletics balance tests and immune to falling damage up to 100 feet.',
  '{"id":"gift-catfeet","name":"Catfeet","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":10}],"summary":"Land gracefully from heights and move across narrow beams effortlessly."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000304', NULL, 'Gremlins', 3,
  ARRAY['ragabash'], 'manipulation', 'larceny', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Larceny (Diff 7) to cause any targeted machine to catastrophically malfunction.',
  '{"id":"gift-gremlins","name":"Gremlins","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"larceny"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Targeted vehicle, terminal, or weapon suffers severe malfunction."}],"summary":"Incite mischievous spirits inside machinery to break devices violently."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000305', NULL, 'Pulse of the Invisible', 3,
  ARRAY['theurge'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to peer through the Gauntlet without Stepping Sideways, perceiving Penumbra spirits clearly.',
  '{"id":"gift-pulse-of-the-invisible","name":"Pulse of the Invisible","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Viewer sees hidden Penumbra spirits while remaining in Physical realm."}],"summary":"See across the Gauntlet into the Penumbra from the material world."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000306', NULL, 'Strength of Purpose', 3,
  ARRAY['philodox'], 'stamina', 'rituals', 6, 0, 0, 0,
  'Roll Stamina + Rituals (Diff 6) to recover spent Willpower points when defending sacred duty.',
  '{"id":"gift-strength-of-purpose","name":"Strength of Purpose","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Recover 1 temporary Willpower per 2 successes."}],"summary":"Draw unyielding resolve from sacred oaths to Gaia."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000307', NULL, 'Song of Rage', 3,
  ARRAY['galliard'], 'manipulation', 'expression', 7, 0, 0, 0,
  'Roll Manipulation + Expression (Diff target Willpower) to howl a war chant that drives targets toward Berserk Frenzy.',
  '{"id":"gift-song-of-rage","name":"Song of Rage","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"expression"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target Garou must roll Frenzy check."}],"summary":"Kindle wild battle-lust in listeners'' blood through primal song."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000308', NULL, 'Combat Healing', 3,
  ARRAY['ahroun'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis to regenerate 1 Bashing or Lethal health level automatically at the end of every turn in combat for the scene.',
  '{"id":"gift-combat-healing","name":"Combat Healing","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"heal_wounds","levels":1,"healAggravated":false}],"summary":"Accelerate Garou regeneration in the heat of battle."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000309', NULL, 'Coup de Grace', 3,
  ARRAY['black_furies'], 'perception', 'brawl', 7, 1, 0, 0,
  'Spend 1 Rage and roll Perception + Brawl (Diff 7) to locate an enemy''s weak point and double damage successes on the next blow.',
  '{"id":"gift-coup-de-grace","name":"Coup de Grace","category":"gift","rankOrLevel":3,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"brawl"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_claw_damage","bonusDice":3,"durationRounds":1}],"summary":"Strike a lethal anatomical weak spot for devastating damage."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000310', NULL, 'Call the Rust', 3,
  ARRAY['bone_gnawers'], 'wits', 'crafts', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Wits + Crafts (Diff 7) to corrode metal firearms, locks, or armor into brittle rust.',
  '{"id":"gift-call-the-rust","name":"Call the Rust","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"crafts"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Metal object corrodes and shatters based on successes."}],"summary":"Summon oxidation spirits to crumble iron and steel."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000311', NULL, 'Dazzle', 3,
  ARRAY['children_of_gaia'], 'charisma', 'empathy', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Empathy (Diff target Willpower) to overwhelm a foe with blinding radiance.',
  '{"id":"gift-dazzle","name":"Dazzle","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"empathy"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Dazzled target cannot take offensive actions this turn."}],"summary":"Disarm hostile intent with sudden blinding lunar splendor."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000312', NULL, 'Howl of the Banshee', 3,
  ARRAY['fianna'], 'charisma', 'intimidation', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Intimidation (Diff 7) to unleash a keening wail that causes enemies to flee in terror.',
  '{"id":"gift-howl-of-the-banshee","name":"Howl of the Banshee","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"intimidation"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Enemies failing Willpower flee in dread for 1 turn per success."}],"summary":"Keening wail drives mortals and weak spirits from the field."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000313', NULL, 'Might of Thor', 3,
  ARRAY['get_of_fenris'], NULL, NULL, 8, 1, 0, 0,
  'Spend 1 Rage and roll Rage (Diff 8) to double Strength for one scene.',
  '{"id":"gift-might-of-thor","name":"Might of Thor","category":"gift","rankOrLevel":3,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"permanent_trait","trait":"rage"},"difficulty":{"kind":"static","value":8},"effects":[{"type":"buff_claw_damage","bonusDice":4,"durationRounds":10}],"summary":"Channel mythic thunder-god might into shattering blows."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000314', NULL, 'Control Complex Machine', 3,
  ARRAY['glass_walkers'], 'manipulation', 'technology', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Technology (Diff 7) to command computers, vehicles, or automated security systems.',
  '{"id":"gift-control-complex-machine","name":"Control Complex Machine","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"technology"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Complex electronic or motorized system obeys operator."}],"summary":"Hijack the spirits of modern networks, elevators, and vehicles."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000315', NULL, 'Trackless Step', 3,
  ARRAY['red_talons'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to render the entire pack untraceable across mud, snow, or sensors for one scene.',
  '{"id":"gift-trackless-step","name":"Trackless Step","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Pack leaves zero footprints, scent, or trail."}],"summary":"Leave no trace of the pack''s passage through wild terrain."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000316', NULL, 'Paralyzing Stare', 3,
  ARRAY['shadow_lords'], 'charisma', 'intimidation', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Intimidation (Diff target Willpower) to freeze a foe in place.',
  '{"id":"gift-paralyzing-stare","name":"Paralyzing Stare","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"intimidation"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target immobilized for 1 turn per net success."}],"summary":"Lock an adversary in place with an imperious glare."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000317', NULL, 'Adaptation', 3,
  ARRAY['silent_striders'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to survive extreme cold, desert heat, vacuum, or suffocation for one day.',
  '{"id":"gift-adaptation","name":"Adaptation","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":3,"durationRounds":10}],"summary":"Adapt body instantly to survive lethal environments."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000318', NULL, 'Wrath of Gaia', 3,
  ARRAY['silver_fangs'], 'charisma', 'leadership', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Leadership (Diff 7) to turn local wildlife and weather against Wyrm foes.',
  '{"id":"gift-wrath-of-gaia","name":"Wrath of Gaia","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"leadership"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"aggravated","isSilver":false}],"summary":"Call down living nature and storms upon despoilers."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000319', NULL, 'Merciful Blow', 3,
  ARRAY['stargazers'], 'dexterity', 'brawl', 7, 0, 0, 1,
  'Spend 1 Willpower and roll Dexterity + Brawl (Diff 7) to knock an adversary unconscious cleanly with a precision strike.',
  '{"id":"gift-merciful-blow","name":"Merciful Blow","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":0,"willpower":1},"pool":{"kind":"attribute_ability","attribute":"dexterity","ability":"brawl"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":3,"damageType":"bashing","isSilver":false}],"summary":"Deliver a non-lethal nerve strike that subdues without maiming."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000320', NULL, 'Invisibility', 3,
  ARRAY['uktena'], 'intelligence', 'occult', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Intelligence + Occult (Diff 7) to bend light and vanish completely from sight.',
  '{"id":"gift-invisibility","name":"Invisibility","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"occult"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Caster completely invisible for 1 minute per success."}],"summary":"Bend spirit-light around yourself to become truly unseen."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000321', NULL, 'Bloody Feast', 3,
  ARRAY['wendigo'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis after tasting a foe''s blood to gain bonus Rage and Strength dice during battle.',
  '{"id":"gift-bloody-feast","name":"Bloody Feast","category":"gift","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_claw_damage","bonusDice":2,"durationRounds":5}],"summary":"Draw savage vigor from spilled blood in combat."}'::jsonb
),

-- ----------------------------------------------------------------------------
-- LEVEL 4 GIFTS (BREEDS, AUSPICES, AND ALL 13 TRIBES)
-- ----------------------------------------------------------------------------
(
  '10000000-0000-4000-8000-000000000401', NULL, 'Spirit Ward', 4,
  ARRAY['homid'], 'manipulation', 'rituals', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Rituals (Diff 7) to erect a spiritual barrier repelling Umbrood spirits.',
  '{"id":"gift-spirit-ward","name":"Spirit Ward","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"rituals"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_soak_per_success","maxCap":4,"durationRounds":10}],"summary":"Draw an invisible ward that bars hostile spirits from crossing."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000402', NULL, 'Wither Limb', 4,
  ARRAY['metis'], 'willpower', NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Willpower (Diff target Stamina + 3) to cripple an enemy''s limb for the scene.',
  '{"id":"gift-wither-limb","name":"Wither Limb","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"willpower"},"difficulty":{"kind":"target_trait","trait":"stamina_plus_3"},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"aggravated","isSilver":false}],"summary":"Atrophy a foe''s limb with a searing touch of Metis curse."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000403', NULL, 'Gnaw', 4,
  ARRAY['lupus'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to bite through stone, steel, or prison bars with supernatural jaws (Crinos/Hispo/Lupus).',
  '{"id":"gift-gnaw","name":"Gnaw","category":"gift","rankOrLevel":4,"requiredForms":["crinos","hispo","lupus"],"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"weapon_strike","damageBonus":4,"damageType":"aggravated","isSilver":false}],"summary":"Crush through steel chains, locks, and reinforced concrete by tooth."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000404', NULL, 'Luna''s Blessing', 4,
  ARRAY['ragabash'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis under moonlight to become untargetable by direct attacks until acting aggressively.',
  '{"id":"gift-lunas-blessing","name":"Luna''s Blessing","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":3,"durationRounds":5}],"summary":"Shroud yourself in silver moonlight illusions that misdirect attacks."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000405', NULL, 'Grasp the Beyond', 4,
  ARRAY['theurge'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to pull physical or spiritual objects back and forth across the Gauntlet without a Rite.',
  '{"id":"gift-grasp-the-beyond","name":"Grasp the Beyond","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"local_gauntlet"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Object retrieved or tucked across the Gauntlet."}],"summary":"Reach directly through the Gauntlet to carry gear between worlds."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000406', NULL, 'Take the True Form', 4,
  ARRAY['philodox'], 'manipulation', 'primal_urge', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Primal-Urge (Diff target Willpower) to force a shapeshifter into their breed form.',
  '{"id":"gift-take-true-form","name":"Take the True Form","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"primal_urge"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target forced back into natural breed form."}],"summary":"Strip away war-form transformations and compel natural form."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000407', NULL, 'Shadows by the Firelight', 4,
  ARRAY['galliard'], 'manipulation', 'performance', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Performance (Diff 7) to weave solid, living illusions from tale-telling.',
  '{"id":"gift-shadows-firelight","name":"Shadows by the Firelight","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"performance"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Illusory figures act out the Galliard''s narrative."}],"summary":"Conjure vivid phantoms from legend and song."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000408', NULL, 'Stoking Fury''s Furnace', 4,
  ARRAY['ahroun'], NULL, NULL, 6, 0, 0, 0,
  'Passive: regain 1 Rage automatically every time you take damage in combat, even beyond permanent rating.',
  '{"id":"gift-stoking-furys-furnace","name":"Stoking Fury''s Furnace","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_claw_damage","bonusDice":1,"durationRounds":10}],"summary":"Convert incoming battle wounds directly into fresh Rage."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000409', NULL, 'Wasp Talons', 4,
  ARRAY['black_furies'], NULL, NULL, 7, 1, 0, 0,
  'Spend 1 Rage to fire razor-sharp talons as ranged Aggravated projectiles.',
  '{"id":"gift-wasp-talons","name":"Wasp Talons","category":"gift","rankOrLevel":4,"requiredForms":["glabro","crinos","hispo"],"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"aggravated","isSilver":false}],"summary":"Hurl deadly claw shards across the battlefield."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000410', NULL, 'Attunement', 4,
  ARRAY['bone_gnawers'], 'perception', 'streetwise', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Perception + Streetwise (Diff 6) to commune with the spirit of a city neighborhood.',
  '{"id":"gift-attunement","name":"Attunement","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"streetwise"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"City spirits reveal inhabitants, tunnels, and ambushes."}],"summary":"Read an urban territory''s secrets from concrete and alley spirits."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000411', NULL, 'Serenity', 4,
  ARRAY['children_of_gaia'], 'charisma', 'performance', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Performance (Diff 7) to strip away all combatant Rage in an entire room.',
  '{"id":"gift-serenity","name":"Serenity","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"performance"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"All combatants lose Rage and halt violence unless Willpower spent."}],"summary":"Blanket an entire conflict in calming lunar peace."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000412', NULL, 'Balor''s Gaze', 4,
  ARRAY['fianna'], NULL, NULL, 7, 1, 0, 0,
  'Spend 1 Rage and roll Rage (Diff target Stamina + 3) to sear a target with a baleful red eye-beam.',
  '{"id":"gift-balors-gaze","name":"Balor''s Gaze","category":"gift","rankOrLevel":4,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"permanent_trait","trait":"rage"},"difficulty":{"kind":"target_trait","trait":"stamina_plus_3"},"effects":[{"type":"weapon_strike","damageBonus":3,"damageType":"aggravated","isSilver":false}],"summary":"Unleash a scorching mythic gaze dealing Aggravated damage at range."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000413', NULL, 'Hero''s Stand', 4,
  ARRAY['get_of_fenris'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to root yourself in place, gaining extra Soak and immunity to knockdown and knockback.',
  '{"id":"gift-heros-stand","name":"Hero''s Stand","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":4,"durationRounds":10}],"summary":"Hold the line against overwhelming odds with immovable resolve."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000414', NULL, 'Doppelganger', 4,
  ARRAY['glass_walkers'], 'charisma', 'performance', 8, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Performance (Diff 8) to assume the exact likeness, voice, and biometrics of another creature.',
  '{"id":"gift-doppelganger","name":"Doppelganger","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"performance"},"difficulty":{"kind":"static","value":8},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Perfect visual and biometric mimicry active."}],"summary":"Infiltrate secure facilities by mirroring a target''s exact form."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000415', NULL, 'Quicksand', 4,
  ARRAY['red_talons'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to liquefy earth or asphalt into a clinging mire trapping foes.',
  '{"id":"gift-quicksand","name":"Quicksand","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Ground within 30 feet turns to clinging mire."}],"summary":"Command earth spirits to swallow pursuing enemies."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000416', NULL, 'Open Wound', 4,
  ARRAY['shadow_lords'], NULL, NULL, 7, 1, 0, 0,
  'Spend 1 Rage and roll Rage (Diff target Stamina + 3) to reopen healed scars and deny regeneration.',
  '{"id":"gift-open-wound","name":"Open Wound","category":"gift","rankOrLevel":4,"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"permanent_trait","trait":"rage"},"difficulty":{"kind":"target_trait","trait":"stamina_plus_3"},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"aggravated","isSilver":false}],"summary":"Inflict festering wounds that resist supernatural regeneration."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000417', NULL, 'Speed Beyond Thought', 4,
  ARRAY['silent_striders'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to sprint up to ten times normal speed across vast distances for hours.',
  '{"id":"gift-speed-beyond-thought","name":"Speed Beyond Thought","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":5,"durationRounds":10}],"summary":"Outrun vehicles and wind spirits across the horizon."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000418', NULL, 'Mindblock', 4,
  ARRAY['silver_fangs'], NULL, NULL, 6, 0, 0, 0,
  'Passive: gain complete immunity to telepathy, emotional manipulation, and mind-controlling Gifts or Disciplines.',
  '{"id":"gift-mindblock","name":"Mindblock","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Psychic intrusion automatically repelled."}],"summary":"Shield your sovereign mind against mental domination."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000419', NULL, 'Preternatural Awareness', 4,
  ARRAY['stargazers'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to anticipate incoming blows from any direction (+4 Initiative and cannot be surprised or flanked).',
  '{"id":"gift-preternatural-awareness","name":"Preternatural Awareness","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":4,"durationRounds":10}],"summary":"Perceive every strike before it is launched."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000420', NULL, 'Hand of the Earth Lords', 4,
  ARRAY['uktena'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to hurl boulders, trees, or steel beams using telekinetic earth-magic.',
  '{"id":"gift-hand-earth-lords","name":"Hand of the Earth Lords","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":4,"damageType":"lethal","isSilver":false}],"summary":"Lift and hurl massive terrain objects without touching them."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000421', NULL, 'Chill of Early Frost', 4,
  ARRAY['wendigo'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to plunge a wide area into deadly sub-zero blizzard conditions.',
  '{"id":"gift-chill-early-frost","name":"Chill of Early Frost","category":"gift","rankOrLevel":4,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":2,"damageType":"bashing","isSilver":false}],"summary":"Blanket the battlefield in numbing snow and ice."}'::jsonb
),

-- ----------------------------------------------------------------------------
-- LEVEL 5 GIFTS (BREEDS, AUSPICES, AND ALL 13 TRIBES)
-- ----------------------------------------------------------------------------
(
  '10000000-0000-4000-8000-000000000501', NULL, 'Part the Veil', 5,
  ARRAY['homid'], 'manipulation', 'subterfuge', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Subterfuge (Diff 6) to render mortal bystanders completely immune to Delirium.',
  '{"id":"gift-part-the-veil","name":"Part the Veil","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"subterfuge"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Witnessing mortals remain lucid instead of suffering Delirium."}],"summary":"Shield human allies from the terror of the Delirium."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000502', NULL, 'Madness', 5,
  ARRAY['metis'], 'manipulation', 'intimidation', 6, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Intimidation (Diff target Willpower) to inflict shattering hallucinations.',
  '{"id":"gift-madness","name":"Madness","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"intimidation"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target suffers overwhelming psychosis for scene or story."}],"summary":"Unleash Metis inner torment directly into an enemy''s psyche."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000503', NULL, 'Song of the Great Beast', 5,
  ARRAY['lupus'], 'charisma', 'primal_urge', 8, 0, 1, 0,
  'Spend 1 Gnosis and roll Charisma + Primal-Urge (Diff 8) to summon an ancient preternatural beast-spirit to aid the pack.',
  '{"id":"gift-song-great-beast","name":"Song of the Great Beast","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"primal_urge"},"difficulty":{"kind":"static","value":8},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Primordial beast ally manifests to defend the Garou."}],"summary":"Call upon primordial megafauna spirits from Gaia''s deep memory."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000504', NULL, 'Thieving Talons of the Magpie', 5,
  ARRAY['ragabash'], 'wits', 'stealth', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Wits + Stealth (Diff target Willpower) to steal a rival''s active supernatural power temporarily.',
  '{"id":"gift-thieving-talons","name":"Thieving Talons of the Magpie","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"stealth"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Hijack target Gift or supernatural ability for the scene."}],"summary":"Pluck another creature''s power right out of their spiritual aura."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000505', NULL, 'Feral Lobotomy', 5,
  ARRAY['theurge'], 'wits', 'enigmas', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Wits + Enigmas (Diff target Willpower) to permanently sever a foe''s higher intellect.',
  '{"id":"gift-feral-lobotomy","name":"Feral Lobotomy","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"enigmas"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target Intelligence reduced by successes."}],"summary":"Strip a target down to primal instinct by unbinding intellect."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000506', NULL, 'Wall of Granite', 5,
  ARRAY['philodox'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to grow stone-hard hide (+6 Soak dice and +2 Health boxes for the scene).',
  '{"id":"gift-wall-of-granite","name":"Wall of Granite","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":6,"durationRounds":10}],"summary":"Harden flesh into living granite against devastating blows."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000507', NULL, 'Dream-Speak', 5,
  ARRAY['galliard'], 'wits', 'expression', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Wits + Expression (Diff 7) to enter and reshape a sleeper''s dreams across any distance.',
  '{"id":"gift-dream-speak","name":"Dream-Speak","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"expression"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Communicate prophetic visions directly inside target''s dream."}],"summary":"Walk through the Dreaming to deliver visions or nightmares."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000508', NULL, 'Kiss of Helios', 5,
  ARRAY['ahroun'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis to ignite body in solar fire: immunity to fire and +4 Aggravated fire damage on melee attacks.',
  '{"id":"gift-kiss-of-helios","name":"Kiss of Helios","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_claw_damage","bonusDice":4,"durationRounds":10}],"summary":"Blaze with golden solar fire, charring Wyrm-spawn on contact."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000509', NULL, 'Gorgon''s Gaze', 5,
  ARRAY['black_furies'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff target Willpower) to petrify a creature in living stone.',
  '{"id":"gift-gorgons-gaze","name":"Gorgon''s Gaze","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target turns to stone for 1 scene or permanently on 5+ successes."}],"summary":"Turn enemies into motionless statues with a merciless stare."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000510', NULL, 'Riot', 5,
  ARRAY['bone_gnawers'], 'manipulation', 'streetwise', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Streetwise (Diff 7) to incite an entire urban crowd into unstoppable fury.',
  '{"id":"gift-riot","name":"Riot","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"streetwise"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Local populace erupts in chaotic upheaval against designated target."}],"summary":"Unleash collective urban resentment into a street-wide storm."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000511', NULL, 'Halo of the Sun', 5,
  ARRAY['children_of_gaia'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis to radiate blinding solar fire that burns vampires and Wyrm-creatures while healing allies.',
  '{"id":"gift-halo-of-the-sun","name":"Halo of the Sun","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_soak_per_success","maxCap":4,"durationRounds":10}],"summary":"Shine like noon sunlight in the darkest Wyrm pit."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000512', NULL, 'Gift of the Spriggan', 5,
  ARRAY['fianna'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis to swell to towering giant stature (Strength +3, Stamina +3, extra Health boxes).',
  '{"id":"gift-spriggan","name":"Gift of the Spriggan","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"buff_claw_damage","bonusDice":3,"durationRounds":10}],"summary":"Grow to colossal fae-touched proportions in battle."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000513', NULL, 'Fenris'' Bite', 5,
  ARRAY['get_of_fenris'], 'strength', 'brawl', 7, 1, 0, 0,
  'Spend 1 Rage and roll Strength + Brawl (Diff 7) to sever a limb cleanly with a monstrous jaw strike.',
  '{"id":"gift-fenris-bite","name":"Fenris'' Bite","category":"gift","rankOrLevel":5,"requiredForms":["crinos","hispo"],"costs":{"rage":1,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"strength","ability":"brawl"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":5,"damageType":"aggravated","isSilver":false}],"summary":"Maim or sever limbs with devastating legendary bite force."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000514', NULL, 'Chaos Mechanics', 5,
  ARRAY['glass_walkers'], 'wits', 'technology', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Wits + Technology (Diff 7) to rewrite the function of every machine within blocks.',
  '{"id":"gift-chaos-mechanics","name":"Chaos Mechanics","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"technology"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Every device in radius obeys inverted or chaotic commands."}],"summary":"Bend an entire facility''s electronics and machinery to your will."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000515', NULL, 'Gaia''s Vengeance', 5,
  ARRAY['red_talons'], NULL, NULL, 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Gnosis (Diff 7) to awaken earth, roots, and beasts to annihilate intruders.',
  '{"id":"gift-gaias-vengeance","name":"Gaia''s Vengeance","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"permanent_trait","trait":"gnosis"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":5,"damageType":"aggravated","isSilver":false}],"summary":"Turn the entire wilderness into a lethal, coordinated weapon."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000516', NULL, 'Obedient Slave', 5,
  ARRAY['shadow_lords'], 'manipulation', 'leadership', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Manipulation + Leadership (Diff target Willpower) to bind a defeated rival to total obedience.',
  '{"id":"gift-obedient-slave","name":"Obedient Slave","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"leadership"},"difficulty":{"kind":"target_trait","trait":"willpower"},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Target bound to obey commands."}],"summary":"Break a rival''s autonomy and compel ironclad servitude."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000517', NULL, 'Reach the Umbra', 5,
  ARRAY['silent_striders'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to Step Sideways instantaneously regardless of the local Gauntlet rating.',
  '{"id":"gift-reach-the-umbra","name":"Reach the Umbra","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Instantaneous Gauntlet crossing without risk of being caught."}],"summary":"Slip effortlessly across even a Gauntlet 9 barrier."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000518', NULL, 'Luna''s Avenger', 5,
  ARRAY['silver_fangs'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to cloak yourself in living silver (immunity to silver damage; +2 all Physical Attributes).',
  '{"id":"gift-lunas-avenger","name":"Luna''s Avenger","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":5,"durationRounds":10}],"summary":"Coat body in liquid silver light, turning silver weapons harmless."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000519', NULL, 'Circular Attack', 5,
  ARRAY['stargazers'], NULL, NULL, 6, 0, 1, 0,
  'Spend 1 Gnosis to strike every adjacent opponent simultaneously without splitting your dice pool.',
  '{"id":"gift-circular-attack","name":"Circular Attack","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_claw_damage","bonusDice":2,"durationRounds":5}],"summary":"Spin through a melee striking all foes at full dice pool."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000520', NULL, 'Fetish Doll', 5,
  ARRAY['uktena'], 'intelligence', 'occult', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Intelligence + Occult (Diff 7) to craft an effigy dealing Aggravated harm to a distant target.',
  '{"id":"gift-fetish-doll","name":"Fetish Doll","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"intelligence","ability":"occult"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"weapon_strike","damageBonus":4,"damageType":"aggravated","isSilver":false}],"summary":"Channel sympathetic harm through a spirit-bound effigy."}'::jsonb
),
(
  '10000000-0000-4000-8000-000000000521', NULL, 'Heart of Ice', 5,
  ARRAY['wendigo'], 'stamina', 'occult', 7, 0, 1, 0,
  'Spend 1 Gnosis and roll Stamina + Occult (Diff target Stamina + 3) to freeze a foe''s blood solid.',
  '{"id":"gift-heart-of-ice","name":"Heart of Ice","category":"gift","rankOrLevel":5,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"stamina","ability":"occult"},"difficulty":{"kind":"target_trait","trait":"stamina_plus_3"},"effects":[{"type":"weapon_strike","damageBonus":5,"damageType":"aggravated","isSilver":false}],"summary":"Freeze a victim''s heart solid with ancient Wendigo cold."}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STARTER W20 RITES (Levels 1-3 across Mystic, Accord, Caern, Death, Renown, Seasonal)
-- ============================================================================
INSERT INTO public.compendium_rites (
  id, campaign_id, name, rite_category, level, roll_attribute, roll_ability,
  default_difficulty, gnosis_cost, system_summary, macro_config
) VALUES
(
  '20000000-0000-4000-8000-000000000001', NULL, 'Rite of Talisman Dedication', 'mystic', 1,
  'wits', 'rituals', 6, 1,
  'Spend 1 Gnosis and roll Wits + Rituals (Diff 6) to attune mundane items so they Step Sideways with the Garou.',
  '{"id":"rite-talisman-dedication","name":"Rite of Talisman Dedication","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Up to 1 item per success is spiritually bound to Step Sideways."}],"summary":"Bind personal gear to follow your spirit across the Gauntlet."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000002', NULL, 'Rite of Cleansing', 'mystic', 1,
  'wits', 'rituals', 6, 1,
  'Spend 1 Gnosis and roll Wits + Rituals (Diff 6 or Wyrm rating) to purify Wyrm taint from a person, relic, or chamber.',
  '{"id":"rite-cleansing","name":"Rite of Cleansing","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Purifies spiritual corruption from target subject or site."}],"summary":"Wash away spiritual corruption with smoke, pure water, and prayer."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000003', NULL, 'Rite of Binding', 'mystic', 1,
  'manipulation', 'rituals', 7, 1,
  'Spend 1 Gnosis and roll Manipulation + Rituals (Diff spirit Willpower) to bind a spirit into a Fetish vessel.',
  '{"id":"rite-binding","name":"Rite of Binding","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"manipulation","ability":"rituals"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Spirit bound into consecrated Fetish object."}],"summary":"Seal a consenting or defeated spirit inside a prepared vessel."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000004', NULL, 'Rite of the Questing Stone', 'mystic', 1,
  'perception', 'rituals', 6, 0,
  'Roll Perception + Rituals (Diff 6) while suspending a stone to point unerringly toward a named person or object.',
  '{"id":"rite-questing-stone","name":"Rite of the Questing Stone","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Stone swings toward target direction and approximate distance."}],"summary":"Divine the direction of a lost packmate or hidden relic."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000005', NULL, 'Rite of Contrition', 'accord', 1,
  'charisma', 'rituals', 6, 0,
  'Roll Charisma + Rituals (Diff 6) to make formal atonement before spirits or elders after breaching the Litany.',
  '{"id":"rite-contrition","name":"Rite of Contrition","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Earn pardon from offended spirits or sept elders."}],"summary":"Atone for offenses against spirits, totem bans, or packmates."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000006', NULL, 'Gathering for the Departed', 'death', 1,
  'charisma', 'rituals', 6, 0,
  'Roll Charisma + Rituals (Diff 6) to honor a fallen Garou and guide their spirit cleanly into the Ancestor realms.',
  '{"id":"rite-gathering-departed","name":"Gathering for the Departed","category":"rite","rankOrLevel":1,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"rituals"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Fallen warrior''s spirit honored; pack gains resolve."}],"summary":"Celebrate a fallen packmate''s deeds and honor their passing."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000007', NULL, 'Rite of Accomplishment', 'renown', 2,
  'charisma', 'rituals', 7, 0,
  'Roll Charisma + Rituals (Diff 7) during a moot to formally recognize temporary Renown into permanent Rank advancement.',
  '{"id":"rite-accomplishment","name":"Rite of Accomplishment","category":"rite","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"charisma","ability":"rituals"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Formal Rank challenge and Renown promotion adjudicated."}],"summary":"Sanctify a Garou''s advancement in Rank before sept and spirits."}'::jsonb
),
(
  '20000000-0000-4000-8000-000000000008', NULL, 'Rite of the Opened Caern', 'caern', 3,
  'wits', 'rituals', 7, 1,
  'Spend 1 Gnosis and roll Wits + Rituals (Diff 7) to unlock a Caern''s bawn and draw upon its spiritual reservoir.',
  '{"id":"rite-opened-caern","name":"Rite of the Opened Caern","category":"rite","rankOrLevel":3,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"wits","ability":"rituals"},"difficulty":{"kind":"static","value":7},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Caern energy channeled to replenish pack Gnosis or seal bawn."}],"summary":"Commune with the heart of a Caern to awaken its spiritual power."}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- CANONICAL PACK TOTEMS (War, Cunning, Wisdom, Respect)
-- ============================================================================
INSERT INTO public.compendium_totems (
  id, campaign_id, name, totem_category, background_cost, totem_modifiers, ban, system_summary, macro_config
) VALUES
(
  '30000000-0000-4000-8000-000000000001', NULL, 'Fenris', 'war', 5,
  '{"attributes":{"strength":1},"abilities":{"brawl":1},"pack_willpower":2}'::jsonb,
  'Never turn down a challenge to honorable combat or show mercy to agents of the Wyrm.',
  'Grants packmates +1 Strength (or +1 Brawl), extra ferocious resolve, and 2 Pack Willpower per story.',
  '{"id":"totem-fenris","name":"Totem Blessing: Fenris","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_claw_damage","bonusDice":1,"durationRounds":10}],"summary":"Invoke Fenris''s war-blessing for ferocious melee prowess."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000002', NULL, 'Griffin', 'war', 4,
  '{"attributes":{"perception":1},"abilities":{"alertness":2},"pack_willpower":3}'::jsonb,
  'Never associate knowingly with humans except as enemies or necessary prey.',
  'Grants packmates keen predator vision (+2 Alertness) and fierce pack coordination.',
  '{"id":"totem-griffin","name":"Totem Blessing: Griffin","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":10}],"summary":"Channel Griffin''s predatory vigilance and swift aerial strike."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000003', NULL, 'Coyote', 'cunning', 4,
  '{"abilities":{"stealth":2,"subterfuge":2},"pack_willpower":3}'::jsonb,
  'Never miss a chance to humble the pompous or follow rigid rules without mocking them.',
  'Grants +2 Stealth and +2 Subterfuge to packmates alongside trickster luck.',
  '{"id":"totem-coyote","name":"Totem Blessing: Coyote","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Coyote grants packmates +2 Stealth/Subterfuge on current ambush."}],"summary":"Invoke Coyote''s cunning to slip past guards and baffle foes."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000004', NULL, 'Raven', 'cunning', 5,
  '{"abilities":{"enigmas":2,"survival":1},"pack_willpower":3}'::jsonb,
  'Carry no wealth beyond what is immediately needed and share secrets among the pack.',
  'Grants +2 Enigmas, keen foresight, and silent scouting coordination.',
  '{"id":"totem-raven","name":"Totem Blessing: Raven","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"attribute_ability","attribute":"perception","ability":"enigmas"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Raven whispers omens and hidden clues around the scene."}],"summary":"See hidden patterns and omens through Raven''s sharp eyes."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000005', NULL, 'Owl', 'wisdom', 6,
  '{"abilities":{"stealth":2,"occult":2},"pack_willpower":4}'::jsonb,
  'Leave small offerings of nocturnal rodents in silent wilderness glades.',
  'Grants -2 difficulty to Step Sideways at night, +2 Stealth, and +2 Occult.',
  '{"id":"totem-owl","name":"Totem Blessing: Owl","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"storyteller_secret_whisper","promptTemplate":"Owl lowers nocturnal Gauntlet difficulty by 2."}],"summary":"Glide silently through night and Umbra with Owl''s counsel."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000006', NULL, 'Unicorn', 'wisdom', 7,
  '{"abilities":{"empathy":3,"medicine":2},"pack_willpower":5}'::jsonb,
  'Always offer aid and healing to non-Wyrm creatures in distress.',
  'Grants +3 Empathy, +2 Medicine, and 5 Pack Willpower for protective endurance.',
  '{"id":"totem-unicorn","name":"Totem Blessing: Unicorn","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":1,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"heal_wounds","levels":1,"healAggravated":false}],"summary":"Share Unicorn''s compassion to soothe pain and mend wounds."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000007', NULL, 'Falcon', 'respect', 5,
  '{"abilities":{"leadership":2},"renown":{"honor":1},"pack_willpower":4}'::jsonb,
  'Never act dishonorably, break an oath, or flee while innocents remain in peril.',
  'Grants +2 Leadership, temporary Honor support, and noble pack bearing.',
  '{"id":"totem-falcon","name":"Totem Blessing: Falcon","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_initiative_flat","bonus":2,"durationRounds":10}],"summary":"Embody Falcon''s noble clarity and decisive command."}'::jsonb
),
(
  '30000000-0000-4000-8000-000000000008', NULL, 'Stag', 'respect', 5,
  '{"attributes":{"stamina":1},"abilities":{"survival":2},"pack_willpower":4}'::jsonb,
  'Never hunt for sport; respect and protect natural sanctuaries and deer.',
  'Grants +1 Stamina or +2 Survival, tireless endurance, and 4 Pack Willpower.',
  '{"id":"totem-stag","name":"Totem Blessing: Stag","category":"gift","rankOrLevel":2,"costs":{"rage":0,"gnosis":0,"willpower":0},"pool":{"kind":"no_roll_instant"},"difficulty":{"kind":"static","value":6},"effects":[{"type":"buff_soak_per_success","maxCap":2,"durationRounds":10}],"summary":"Draw Stag''s untamed vigor and resilience across long hunts."}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
