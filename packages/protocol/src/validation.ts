import { z } from 'zod';
import type { W20UserCharacterSheet } from '@w20-vtt/core';
import type { ClientEnvelope } from './messages';

export const AttributeKeySchema = z.enum([
  'strength',
  'dexterity',
  'stamina',
  'charisma',
  'manipulation',
  'appearance',
  'perception',
  'intelligence',
  'wits',
]);

export const GarouFormSchema = z.enum(['homid', 'glabro', 'crinos', 'hispo', 'lupus']);
export const BreedSchema = z.enum(['homid', 'metis', 'lupus']);
export const AuspiceSchema = z.enum(['ragabash', 'theurge', 'philodox', 'galliard', 'ahroun']);
export const AbilityCategorySchema = z.enum(['talents', 'skills', 'knowledges']);
export const RealmLayerSchema = z.enum(['physical', 'penumbra', 'deep_umbra']);
export const MoonPhaseSchema = z.enum(['new', 'crescent', 'half', 'gibbous', 'full']);
export const SpecialtyModeSchema = z.enum(['w20_double', 'revised_explode']);
export const NonEmptyDamageTypeSchema = z.enum(['bashing', 'lethal', 'aggravated']);
export const DamageTypeSchema = z.enum(['none', 'bashing', 'lethal', 'aggravated']);

export const ActionCategorySchema = z.enum([
  'melee_attack',
  'brawl_attack',
  'ranged_attack',
  'gift_or_rite',
  'shift_form',
  'defend_dodge',
  'defend_parry',
  'defend_block',
  'full_defense',
  'hold',
  'move_or_other',
]);

export const MacroPoolSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('attribute_ability'),
    attribute: AttributeKeySchema,
    ability: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('permanent_trait'),
    trait: z.enum(['rage', 'gnosis', 'willpower']),
  }),
  z.object({
    kind: z.literal('fetish_gnosis_rating'),
    rating: z.number().int().min(1).max(10),
  }),
  z.object({
    kind: z.literal('no_roll_instant'),
  }),
]);

export const MacroDifficultySourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('static'),
    value: z.number().int().min(2).max(10),
  }),
  z.object({
    kind: z.literal('local_gauntlet'),
    modifier: z.number().int().min(-5).max(5).optional(),
  }),
  z.object({
    kind: z.literal('target_trait'),
    trait: z.enum(['willpower', 'rage', 'gnosis', 'stamina_plus_3']),
  }),
]);

export const MacroEffectPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('buff_claw_damage'),
    bonusDice: z.number().int().min(1).max(10),
    durationRounds: z.number().int().min(1).max(100),
  }),
  z.object({
    type: z.literal('buff_soak_per_success'),
    maxCap: z.number().int().min(1).max(20).optional(),
    durationRounds: z.number().int().min(1).max(100),
  }),
  z.object({
    type: z.literal('buff_initiative_flat'),
    bonus: z.number().int().min(1).max(30),
    durationRounds: z.number().int().min(1).max(100),
  }),
  z.object({
    type: z.literal('heal_wounds'),
    levels: z.number().int().min(1).max(15),
    healAggravated: z.boolean(),
  }),
  z.object({
    type: z.literal('weapon_strike'),
    damageBonus: z.number().int().min(0).max(20),
    damageType: NonEmptyDamageTypeSchema,
    isSilver: z.boolean(),
  }),
  z.object({
    type: z.literal('storyteller_secret_whisper'),
    promptTemplate: z.string().min(1).max(500),
  }),
]);

export const W20MacroDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  category: z.enum(['gift', 'rite', 'fetish', 'talen']),
  rankOrLevel: z.number().int().min(0).max(6),
  requiredForms: z.array(GarouFormSchema).optional(),
  costs: z.object({
    rage: z.number().int().min(0).max(10),
    gnosis: z.number().int().min(0).max(10),
    willpower: z.number().int().min(0).max(10),
  }),
  pool: MacroPoolSourceSchema,
  difficulty: MacroDifficultySourceSchema,
  effects: z.array(MacroEffectPayloadSchema),
  summary: z.string().max(1000),
});

export const SubActionSlotInputSchema = z.object({
  category: ActionCategorySchema,
  label: z.string().min(1).max(160),
  targetCombatantId: z.string().min(1).optional(),
  attributeKey: AttributeKeySchema.optional(),
  abilityKey: z.string().min(1).optional(),
  allocatedDice: z.number().int().min(1).max(30).optional(),
  baseDifficulty: z.number().int().min(2).max(10),
  weaponDamageBonus: z.number().int().min(-5).max(20).optional(),
  damageType: NonEmptyDamageTypeSchema.optional(),
  isSilverAttack: z.boolean().optional(),
  targetForm: GarouFormSchema.optional(),
  macro: W20MacroDefinitionSchema.optional(),
});

export const DeclaredActionInputSchema = z.object({
  mode: z.enum(['single', 'split_pool', 'full_defense', 'hold']),
  slots: z.array(SubActionSlotInputSchema).min(1).max(10),
});

export const DefenseTypeSchema = z.enum(['defend_dodge', 'defend_parry', 'defend_block']);

export const ReactionChoiceSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('take_hit_soak_only') }),
  z.object({
    strategy: z.literal('use_queued_defense'),
    defenseType: DefenseTypeSchema,
  }),
  z.object({
    strategy: z.literal('willpower_abort_to_defense'),
    defenseType: DefenseTypeSchema,
  }),
  z.object({
    strategy: z.literal('burn_rage_action_to_defend'),
    defenseType: DefenseTypeSchema,
  }),
]);

export const FogBrushStrokeSchema = z.object({
  mode: z.enum(['reveal', 'shroud', 'reset_shroud_all', 'reset_reveal_all']),
  shape: z.enum(['circle', 'rect']),
  x: z.number().finite(),
  y: z.number().finite(),
  radiusOrWidth: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative().optional(),
});

export const AudioSyncPayloadSchema = z.object({
  physicalTrackUrl: z.string().min(1).nullable(),
  penumbraTrackUrl: z.string().min(1).nullable(),
  startedAtServerMs: z.number().finite().nonnegative(),
  masterVolume: z.number().finite().min(0).max(1),
  stingUrl: z.string().min(1).optional(),
});

export const NpcSpawnTemplateIdSchema = z.enum([
  'pentex_first_team',
  'fomor_berserker',
  'bsd_crinos',
  'scrag_bane',
  'nexus_crawler',
]);

export const LightWoundPenaltySchema = z.union([
  z.literal(0),
  z.literal(-1),
  z.literal(-2),
  z.literal(-5),
]);

export const LightGarouTrackersSchema = z.object({
  rage: z.number().int().min(0).max(10),
  gnosis: z.number().int().min(0).max(10),
  willpower: z.number().int().min(0).max(10),
  woundPenalty: LightWoundPenaltySchema,
});

export const ClientSeatSyncItemSchema = z.object({
  seatId: z.string().min(1).max(80),
  displayName: z.string().min(1).max(80),
  characterName: z.string().max(120).nullable().optional(),
  activeForm: GarouFormSchema.nullable().optional(),
  trackers: LightGarouTrackersSchema,
});

const DotRatingSchema = z.number().int().min(0).max(10);

export const DualTrackerSchema = z.object({
  permanent: DotRatingSchema,
  temporary: DotRatingSchema,
});

export const BaseAttributesSchema = z.object({
  strength: DotRatingSchema,
  dexterity: DotRatingSchema,
  stamina: DotRatingSchema,
  charisma: DotRatingSchema,
  manipulation: DotRatingSchema,
  appearance: DotRatingSchema,
  perception: DotRatingSchema,
  intelligence: DotRatingSchema,
  wits: DotRatingSchema,
});

export const HealthStateSchema = z.object({
  bonusBruisedBoxes: z.number().int().min(0).max(10),
  boxes: z.array(DamageTypeSchema).min(7).max(20),
});

export const CustomAbilityEntrySchema = z.object({
  id: z.string().min(1).max(120),
  category: AbilityCategorySchema,
  name: z.string().min(1).max(120),
  dots: DotRatingSchema,
  specialty: z.string().max(120).optional(),
});

export const SheetBackgroundEntrySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  dots: DotRatingSchema,
});

export const SheetRollTraitSchema = z.union([
  AttributeKeySchema,
  z.enum(['rage', 'gnosis', 'willpower']),
]);

export const SheetGiftEntrySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  level: z.number().int().min(1).max(6),
  rollAttribute: SheetRollTraitSchema.nullable().optional(),
  rollAbility: z.string().max(120).nullable().optional(),
  difficulty: z.number().int().min(2).max(10).optional(),
  rageCost: DotRatingSchema.optional(),
  gnosisCost: DotRatingSchema.optional(),
  willpowerCost: DotRatingSchema.optional(),
  summary: z.string().max(2000),
});

export const SheetFetishItemSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  level: z.number().int().min(0).max(6),
  gnosisRating: z.number().int().min(1).max(10),
  power: z.string().max(2000),
  isSilver: z.boolean().optional(),
});

export const SheetRiteEntrySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  level: z.number().int().min(0).max(6).optional(),
  summary: z.string().max(2000),
});

export const OtherTraitKindSchema = z.enum(['merit', 'flaw', 'other']);
export const MeritFlawCategorySchema = z.enum(['physical', 'mental', 'social', 'supernatural']);

export const SheetOtherTraitEntrySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  dots: DotRatingSchema,
  kind: OtherTraitKindSchema.optional(),
  category: MeritFlawCategorySchema.optional(),
});

export const SheetWeaponEntrySchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  rollAttribute: AttributeKeySchema,
  rollAbility: z.string().min(1).max(120),
  difficulty: z.number().int().min(2).max(10),
  damageMode: z.enum(['strength_plus', 'flat']),
  damageDice: z.number().int().min(0).max(30),
  damageType: NonEmptyDamageTypeSchema,
  range: z.string().max(60),
  rate: z.string().max(60),
  clip: z.string().max(60),
});

export const ShortcutPoolSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('trait_combo'),
    attribute: SheetRollTraitSchema.nullable().optional(),
    ability: z.string().max(120).nullable().optional(),
    flatModifier: z.number().int().min(-20).max(20).optional(),
    useFormStats: z.boolean().optional(),
    applyPerceptionFormDiff: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('soak'),
    includeArmor: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('natural_brawl_damage'),
    maneuver: z.enum(['claw', 'bite', 'punch', 'kick']),
  }),
  z.object({
    kind: z.literal('weapon_attack'),
    weaponId: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal('weapon_damage'),
    weaponId: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal('fetish_activate'),
    fetishId: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal('static'),
    pool: z.number().int().min(0).max(30),
  }),
]);

export const SheetShortcutSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  source: ShortcutPoolSourceSchema,
  difficulty: z.number().int().min(2).max(10),
  rageDiceCount: z.number().int().min(0).max(30),
  applyWoundPenalty: z.boolean(),
  forceSpecialty: z.boolean().optional(),
  isSecretRoll: z.boolean(),
});

export const W20UserCharacterSheetSchema: z.ZodType<W20UserCharacterSheet> = z.object({
  id: z.string().min(1).max(120),
  ownerDiscordId: z.string().min(1).max(120),
  syncCode: z.string().max(32).nullable().optional(),
  name: z.string().max(120),
  player: z.string().max(120),
  chronicle: z.string().max(120),
  breed: BreedSchema,
  auspice: AuspiceSchema,
  tribe: z.string().max(120),
  packName: z.string().max(120),
  packTotem: z.string().max(120),
  concept: z.string().max(240),
  deedName: z.string().max(120).optional(),
  metisDeformity: z.string().max(240).optional(),
  baseAttributes: BaseAttributesSchema,
  abilities: z.record(z.string(), DotRatingSchema),
  customAbilities: z.array(CustomAbilityEntrySchema).max(50),
  specialties: z.record(z.string(), z.string().max(160)),
  backgrounds: z.array(SheetBackgroundEntrySchema).max(50),
  gifts: z.array(SheetGiftEntrySchema).max(100),
  renown: z.object({
    glory: DualTrackerSchema,
    honor: DualTrackerSchema,
    wisdom: DualTrackerSchema,
  }),
  rank: z.number().int().min(0).max(6),
  rage: DualTrackerSchema,
  gnosis: DualTrackerSchema,
  willpower: DualTrackerSchema,
  silverCarriedItems: z.number().int().min(0).max(20),
  health: HealthStateSchema,
  experience: z.object({
    total: z.number().int().min(0).max(10000),
    spent: z.number().int().min(0).max(10000),
  }),
  activeForm: GarouFormSchema,
  otherTraits: z.array(SheetOtherTraitEntrySchema).max(50),
  fetishes: z.array(SheetFetishItemSchema).max(50),
  rites: z.array(SheetRiteEntrySchema).max(100),
  combatWeapons: z.array(SheetWeaponEntrySchema).max(50),
  armor: z.object({
    rating: z.number().int().min(0).max(15),
    description: z.string().max(500),
  }),
  shortcuts: z.array(SheetShortcutSchema).max(100),
  lastUsedAt: z.number().finite().nonnegative(),
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
});

export const ClientCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HELLO_AUTH'),
    sessionJwt: z.string().min(1),
    campaignId: z.string().min(1),
    characterId: z.string().min(1).nullable(),
    lastSeenSeq: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    type: z.literal('PING'),
  }),
  z.object({
    type: z.literal('VOICE_SPEAKING_STATE'),
    isSpeaking: z.boolean(),
  }),
  z.object({
    type: z.literal('TOKEN_MOVE'),
    tokenId: z.string().min(1),
    x: z.number().finite(),
    y: z.number().finite(),
    waypoints: z
      .array(
        z.object({
          x: z.number().finite(),
          y: z.number().finite(),
        })
      )
      .optional(),
  }),
  z.object({
    type: z.literal('CHARACTER_SHIFT_FORM'),
    characterId: z.string().min(1),
    targetForm: GarouFormSchema,
    method: z.enum(['roll_primal_urge', 'instant_rage_spend']),
  }),
  z.object({
    type: z.literal('STEP_SIDEWAYS'),
    characterId: z.string().min(1),
    targetRealm: RealmLayerSchema,
  }),
  z.object({
    type: z.literal('ROLL_FREEFORM_POOL'),
    characterId: z.string().min(1),
    label: z.string().min(1).max(200),
    attributeKey: AttributeKeySchema,
    abilityKey: z.string().min(1).optional(),
    difficulty: z.number().int().min(2).max(10),
    specialtyId: z.string().min(1).optional(),
    spendWillpower: z.boolean().optional(),
    isSecretStRoll: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('ROLL_TABLE_POOL'),
    pool: z.number().int().min(1).max(30),
    rageDiceCount: z.number().int().min(0).max(30),
    difficulty: z.number().int().min(2).max(10),
    hasSpecialty: z.boolean(),
    spendWillpower: z.boolean(),
    applyWoundPenalty: z.boolean(),
    rollMode: z.enum(['pool', 'initiative']).optional(),
    initiativeModifier: z.number().int().min(-30).max(50).optional(),
    label: z.string().max(120).optional(),
    isSecretRoll: z.boolean().optional(),
    physicalDiceValues: z.array(z.number().int().min(1).max(10)).max(30).optional(),
    rollClientId: z.string().max(80).optional(),
    seatId: z.string().min(1).max(80).optional(),
    rollerDisplayName: z.string().min(1).max(80).optional(),
  }),
  z.object({
    type: z.literal('UPDATE_LIGHT_TRACKERS'),
    trackers: z.object({
      rage: z.number().int().min(0).max(10).optional(),
      gnosis: z.number().int().min(0).max(10).optional(),
      willpower: z.number().int().min(0).max(10).optional(),
      woundPenalty: LightWoundPenaltySchema.optional(),
    }),
    seatId: z.string().min(1).max(80).optional(),
    displayName: z.string().min(1).max(80).optional(),
    characterName: z.string().max(120).nullable().optional(),
    activeForm: GarouFormSchema.nullable().optional(),
  }),
  z.object({
    type: z.literal('SYNC_CLIENT_SEATS'),
    seats: z.array(ClientSeatSyncItemSchema).min(1).max(8),
  }),
  z.object({
    type: z.literal('CHARACTER_UPDATE_TRACKER'),
    characterId: z.string().min(1),
    tracker: z.enum(['rage', 'gnosis', 'willpower', 'silver']),
    delta: z.number().int().min(-10).max(10),
  }),
  z.object({
    type: z.literal('CHARACTER_APPLY_HEALTH'),
    characterId: z.string().min(1),
    mode: z.enum(['damage', 'heal', 'soak']),
    levels: z.number().int().min(0).max(50),
    damageType: NonEmptyDamageTypeSchema,
    isSilver: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('CHARACTER_SAVE_MACRO'),
    characterId: z.string().min(1),
    macro: W20MacroDefinitionSchema,
  }),
  z.object({
    type: z.literal('EXECUTE_MACRO'),
    characterId: z.string().min(1),
    macro: W20MacroDefinitionSchema,
    targetCharacterId: z.string().min(1).optional(),
    spendWillpowerOnRoll: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('FRENZY_ROLL_CHECK'),
    characterId: z.string().min(1),
    difficultyMod: z.number().int().min(-5).max(5).optional(),
    preferredType: z.enum(['berserk', 'fox']).optional(),
  }),
  z.object({
    type: z.literal('CHARACTER_CLEAR_FRENZY'),
    characterId: z.string().min(1),
  }),
  z.object({
    type: z.literal('COMBAT_START'),
    participantCharacterIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    type: z.literal('COMBAT_DECLARE_PRE_INIT'),
    combatantId: z.string().min(1),
    rageExtraActions: z.number().int().min(0).max(10),
    spendGnosisSpiritOfFray: z.boolean(),
    spendWillpowerIgnoreWounds: z.boolean(),
  }),
  z.object({
    type: z.literal('COMBAT_ROLL_ALL_INITIATIVE'),
  }),
  z.object({
    type: z.literal('COMBAT_SUBMIT_DECLARATION'),
    combatantId: z.string().min(1),
    declaration: DeclaredActionInputSchema,
  }),
  z.object({
    type: z.literal('COMBAT_TRIGGER_HOLD_INTERRUPT'),
    combatantId: z.string().min(1),
    newDeclaration: DeclaredActionInputSchema,
  }),
  z.object({
    type: z.literal('COMBAT_EXECUTE_ACTIVE_TURN'),
    combatantId: z.string().min(1),
    spendWillpowerOnRoll: z.boolean().optional(),
    specialtyId: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('COMBAT_SUBMIT_REACTION'),
    defenderCombatantId: z.string().min(1),
    reaction: ReactionChoiceSchema,
  }),
  z.object({
    type: z.literal('COMBAT_ADVANCE_PHASE_ST_OVERRIDE'),
    reason: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal('COMBAT_NEXT_ROUND'),
  }),
  z.object({
    type: z.literal('COMBAT_END'),
  }),
  z.object({
    type: z.literal('ST_SET_WORLD_ENV'),
    localGauntlet: z.number().int().min(1).max(10),
    moonPhase: MoonPhaseSchema,
    specialtyMode: SpecialtyModeSchema.optional(),
    mapAssetUrl: z.string().min(1).nullable().optional(),
  }),
  z.object({
    type: z.literal('ST_FOG_STROKE'),
    stroke: FogBrushStrokeSchema,
  }),
  z.object({
    type: z.literal('ST_SPAWN_NPC_TEMPLATE'),
    templateId: NpcSpawnTemplateIdSchema,
    quantity: z.number().int().min(1).max(20),
    realm: RealmLayerSchema,
    isHidden: z.boolean(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }),
  z.object({
    type: z.literal('ST_REMOVE_TOKEN'),
    tokenId: z.string().min(1),
  }),
  z.object({
    type: z.literal('ST_TOGGLE_TOKEN_HIDDEN'),
    tokenId: z.string().min(1),
    isHidden: z.boolean(),
  }),
  z.object({
    type: z.literal('ST_SYNC_AUDIO'),
    payload: AudioSyncPayloadSchema,
  }),
  z.object({
    type: z.literal('ST_TRIGGER_AUDIO_STING'),
    stingUrl: z.string().min(1),
  }),
  z.object({
    type: z.literal('ST_PUSH_HANDOUT'),
    imageUrl: z.string().min(1),
    caption: z.string().max(500),
  }),
  z.object({
    type: z.literal('ST_DISMISS_HANDOUT'),
  }),
  z.object({
    type: z.literal('ST_SEND_WHISPER'),
    targetDiscordId: z.string().min(1),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal('PACK_UPDATE_POOL'),
    delta: z.number().int().min(-20).max(20),
  }),
  z.object({
    type: z.literal('SAFETY_X_CARD_PAUSE'),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('SAFETY_RESUME'),
  }),
]);

export const ClientEnvelopeSchema: z.ZodType<ClientEnvelope> = z.object({
  reqId: z.string().min(1),
  expectedSeq: z.number().int().nonnegative(),
  sentAt: z.number().finite().nonnegative(),
  command: ClientCommandSchema,
});

export type ParseClientEnvelopeResult =
  | { success: true; data: ClientEnvelope }
  | { success: false; error: string; reqId?: string };

/**
 * Parses and validates a raw WebSocket JSON frame into a typed ClientEnvelope.
 */
export function parseClientEnvelope(raw: string): ParseClientEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Malformed JSON payload.' };
  }

  const fallbackReqId =
    typeof parsed === 'object' &&
    parsed !== null &&
    'reqId' in parsed &&
    typeof (parsed as { reqId?: unknown }).reqId === 'string'
      ? (parsed as { reqId: string }).reqId
      : undefined;

  const result = ClientEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    const issueSummary = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    return {
      success: false,
      error: issueSummary,
      reqId: fallbackReqId,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
