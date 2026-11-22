export type Breed = 'homid' | 'metis' | 'lupus';
export type Auspice = 'ragabash' | 'theurge' | 'philodox' | 'galliard' | 'ahroun';
export type GarouForm = 'homid' | 'glabro' | 'crinos' | 'hispo' | 'lupus';

export type GarouTribe =
  | 'black_furies'
  | 'bone_gnawers'
  | 'children_of_gaia'
  | 'fianna'
  | 'get_of_fenris'
  | 'glass_walkers'
  | 'red_talons'
  | 'shadow_lords'
  | 'silent_striders'
  | 'silver_fangs'
  | 'stargazers'
  | 'uktena'
  | 'wendigo';

export type RealmLayer = 'physical' | 'penumbra' | 'deep_umbra';
export type MoonPhase = 'new' | 'crescent' | 'half' | 'gibbous' | 'full';
export type DamageType = 'none' | 'bashing' | 'lethal' | 'aggravated';
export type SpecialtyMode = 'w20_double' | 'revised_explode';

export type AttributeKey =
  | 'strength'
  | 'dexterity'
  | 'stamina'
  | 'charisma'
  | 'manipulation'
  | 'appearance'
  | 'perception'
  | 'intelligence'
  | 'wits';

export type TalentKey =
  | 'alertness'
  | 'athletics'
  | 'brawl'
  | 'empathy'
  | 'expression'
  | 'intimidation'
  | 'leadership'
  | 'primal_urge'
  | 'streetwise'
  | 'subterfuge';

export type SkillKey =
  | 'animal_ken'
  | 'crafts'
  | 'drive'
  | 'etiquette'
  | 'firearms'
  | 'larceny'
  | 'melee'
  | 'performance'
  | 'stealth'
  | 'survival';

export type KnowledgeKey =
  | 'academics'
  | 'computer'
  | 'enigmas'
  | 'investigation'
  | 'law'
  | 'medicine'
  | 'occult'
  | 'rituals'
  | 'science'
  | 'technology';

export type CanonicalAbilityKey = TalentKey | SkillKey | KnowledgeKey;

export interface BaseAttributes {
  strength: number;
  dexterity: number;
  stamina: number;
  charisma: number;
  manipulation: number;
  appearance: number;
  perception: number;
  intelligence: number;
  wits: number;
}

export interface DualTracker {
  permanent: number; // 0-10 dots (used for trait rolls)
  temporary: number; // 0-10 boxes (spent for fuel)
}

export interface SpecialtyEntry {
  id: string;
  traitKey: AttributeKey | CanonicalAbilityKey | string;
  name: string; // e.g., "Claws", "Umbral Spirits", "Ambush"
}

/**
 * Canonical 7 W20 health levels in descending order:
 * [0] Bruised (-0), [1] Hurt (-1), [2] Injured (-1), [3] Wounded (-2),
 * [4] Mauled (-2), [5] Crippled (-5), [6] Incapacitated
 */
export interface HealthState {
  bonusBruisedBoxes: number; // Prepended at -0 penalty (e.g., Huge Size Merit)
  boxes: DamageType[]; // Length = 7 + bonusBruisedBoxes, sorted heaviest-first
}

/**
 * Ephemeral per-turn flags held in the Durable Object combat state machine
 */
export interface TurnCombatLocks {
  hasSpentRageThisTurn: boolean;
  hasSpentGnosisThisTurn: boolean;
  hasSpentWillpowerThisTurn: boolean;
  ignoringWoundPenaltiesThisTurn: boolean;
  declaredExtraRageActions: number;
}

export type MacroPoolSource =
  | { kind: 'attribute_ability'; attribute: AttributeKey; ability?: CanonicalAbilityKey | string }
  | { kind: 'permanent_trait'; trait: 'rage' | 'gnosis' | 'willpower' }
  | { kind: 'fetish_gnosis_rating'; rating: number }
  | { kind: 'no_roll_instant' };

export type MacroDifficultySource =
  | { kind: 'static'; value: number }
  | { kind: 'local_gauntlet'; modifier?: number }
  | { kind: 'target_trait'; trait: 'willpower' | 'rage' | 'gnosis' | 'stamina_plus_3' };

export type MacroEffectPayload =
  | { type: 'buff_claw_damage'; bonusDice: number; durationRounds: number }
  | { type: 'buff_soak_per_success'; maxCap?: number; durationRounds: number }
  | { type: 'buff_initiative_flat'; bonus: number; durationRounds: number }
  | { type: 'heal_wounds'; levels: number; healAggravated: boolean }
  | {
      type: 'weapon_strike';
      damageBonus: number;
      damageType: Exclude<DamageType, 'none'>;
      isSilver: boolean;
    }
  | { type: 'storyteller_secret_whisper'; promptTemplate: string };

export interface W20MacroDefinition {
  id: string;
  name: string;
  category: 'gift' | 'rite' | 'fetish' | 'talen';
  rankOrLevel: number;
  requiredForms?: GarouForm[];
  costs: {
    rage: number;
    gnosis: number;
    willpower: number;
  };
  pool: MacroPoolSource;
  difficulty: MacroDifficultySource;
  effects: MacroEffectPayload[];
  summary: string;
}

export interface ActiveCharacterBuff {
  sourceMacroId: string;
  label: string;
  effect: MacroEffectPayload;
  appliedSuccesses: number;
  remainingRounds: number;
}

export interface CharacterFetishEntry {
  id: string;
  name: string;
  level: number; // 0 = Talen (single-use), 1..6 = Fetish
  gnosisRating: number;
  isSilver: boolean;
  weaponDamageBonus?: number;
  damageType?: Exclude<DamageType, 'none'>;
  isAttuned: boolean;
  chargesRemaining?: number | null;
  systemSummary: string;
}

export type MeritFlawCategory = 'physical' | 'mental' | 'social' | 'supernatural';

export interface MeritOrFlawChoice {
  id: string;
  name: string;
  kind: 'merit' | 'flaw';
  pointValue: number; // Positive integer 1..7
  category?: MeritFlawCategory;
  summary?: string;
}

export interface W20CharacterState {
  id: string;
  campaignId: string;
  packId: string | null;
  ownerDiscordId: string;
  isNpc: boolean;
  name: string;
  deedName?: string;
  concept?: string;
  breed: Breed;
  auspice: Auspice;
  tribe: string;
  rank: number;
  metisDeformity?: string;

  activeForm: GarouForm;
  activeRealm: RealmLayer;
  caughtInGauntlet: boolean;
  inFrenzy: boolean;
  frenzyType: 'berserk' | 'fox' | null;

  baseAttributes: BaseAttributes;
  abilities: Partial<Record<CanonicalAbilityKey, number>> & Record<string, number>;
  specialties: SpecialtyEntry[];
  backgrounds: Record<string, number>;
  meritsFlaws: MeritOrFlawChoice[];

  rage: DualTracker;
  gnosis: DualTracker;
  willpower: DualTracker;
  silverCarriedItems: number; // Each silver item (e.g., Klaive) reduces effective Gnosis

  renown: {
    glory: DualTracker;
    honor: DualTracker;
    wisdom: DualTracker;
  };

  health: HealthState;
  activeBuffs: ActiveCharacterBuff[];
  macros: W20MacroDefinition[];
  fetishes: CharacterFetishEntry[];
  portraitsByForm: Partial<Record<GarouForm, string>>;
  turnLocks: TurnCombatLocks;
  stateVersion: number;
}
