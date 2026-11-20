import {
  AttributeKey,
  Auspice,
  BaseAttributes,
  Breed,
  CanonicalAbilityKey,
  DamageType,
  GarouForm,
  GarouTribe,
  KnowledgeKey,
  MeritOrFlawChoice,
  SkillKey,
  TalentKey,
  W20CharacterState,
} from './types';
import { getBreedNaturalForm } from './forms';

export type AttributeCategory = 'physical' | 'social' | 'mental';
export type AbilityCategory = 'talents' | 'skills' | 'knowledges';

export const ATTRIBUTE_GROUPS: Record<AttributeCategory, AttributeKey[]> = {
  physical: ['strength', 'dexterity', 'stamina'],
  social: ['charisma', 'manipulation', 'appearance'],
  mental: ['perception', 'intelligence', 'wits'],
};

export const ABILITY_GROUPS: Record<AbilityCategory, CanonicalAbilityKey[]> = {
  talents: [
    'alertness',
    'athletics',
    'brawl',
    'empathy',
    'expression',
    'intimidation',
    'leadership',
    'primal_urge',
    'streetwise',
    'subterfuge',
  ] satisfies TalentKey[],
  skills: [
    'animal_ken',
    'crafts',
    'drive',
    'etiquette',
    'firearms',
    'larceny',
    'melee',
    'performance',
    'stealth',
    'survival',
  ] satisfies SkillKey[],
  knowledges: [
    'academics',
    'computer',
    'enigmas',
    'investigation',
    'law',
    'medicine',
    'occult',
    'rituals',
    'science',
    'technology',
  ] satisfies KnowledgeKey[],
};

/**
 * Human-society Skills & Knowledges restricted for wolf-born (Lupus) Garou during base priority allocation.
 */
export const LUPUS_RESTRICTED_BASE_ABILITIES = new Set<CanonicalAbilityKey>([
  'drive',
  'etiquette',
  'firearms',
  'crafts',
  'academics',
  'computer',
  'law',
  'science',
  'technology',
  'streetwise',
]);

export const STARTING_GNOSIS_BY_BREED: Record<Breed, number> = {
  homid: 1,
  metis: 3,
  lupus: 5,
};

export const STARTING_RAGE_BY_AUSPICE: Record<Auspice, number> = {
  ragabash: 1,
  theurge: 2,
  philodox: 3,
  galliard: 4,
  ahroun: 5,
};

export const STARTING_WILLPOWER_BY_TRIBE: Record<GarouTribe, number> = {
  black_furies: 3,
  bone_gnawers: 4,
  children_of_gaia: 4,
  fianna: 3,
  get_of_fenris: 3,
  glass_walkers: 3,
  red_talons: 3,
  shadow_lords: 3,
  silent_striders: 3,
  silver_fangs: 3,
  stargazers: 4,
  uktena: 3,
  wendigo: 4,
};

export const STARTING_RENOWN_BY_AUSPICE: Record<
  Exclude<Auspice, 'ragabash'>,
  { glory: number; honor: number; wisdom: number }
> = {
  theurge: { glory: 0, honor: 0, wisdom: 3 },
  philodox: { glory: 0, honor: 3, wisdom: 0 },
  galliard: { glory: 2, honor: 0, wisdom: 1 },
  ahroun: { glory: 2, honor: 1, wisdom: 0 },
};

export const W20_FREEBIE_COSTS = {
  attribute: 5,
  ability: 2,
  background: 1,
  levelOneGift: 7,
  rage: 1,
  gnosis: 2,
  willpower: 1,
  basePool: 15,
  maxFlawBonus: 7, // Hard maximum of 22 total Freebie points
} as const;

export interface SelectedGiftChoice {
  giftId: string;
  level: number;
  slotSource: 'breed' | 'auspice' | 'tribe' | 'freebie';
}

export interface W20CharacterCreationDraft {
  name: string;
  concept: string;
  breed: Breed;
  auspice: Auspice;
  tribe: GarouTribe;
  metisDeformity?: string;

  // Priority rankings (must be a permutation of primary / secondary / tertiary)
  attributePriorities: Record<AttributeCategory, 'primary' | 'secondary' | 'tertiary'>;
  abilityPriorities: Record<AbilityCategory, 'primary' | 'secondary' | 'tertiary'>;

  // Phase 1: Base Priority Dots ADDED on top of automatic base dots
  // (Attributes get +1 automatic dot; Abilities & Backgrounds start at 0)
  priorityAttributeDots: BaseAttributes;
  priorityAbilityDots: Partial<Record<CanonicalAbilityKey, number>>;
  priorityBackgroundDots: Record<string, number>;

  // Starting Renown (Fixed for 4 Auspices; any 3 for Ragabash)
  startingRenown: { glory: number; honor: number; wisdom: number };

  // Gifts (3 mandatory Level-1 + optional Freebie Level-1 Gifts)
  selectedGifts: SelectedGiftChoice[];

  // Phase 2: Explicit Freebie Point Purchases & Merits/Flaws
  freebieAttributeDots: Partial<BaseAttributes>;
  freebieAbilityDots: Partial<Record<CanonicalAbilityKey, number>>;
  freebieBackgroundDots: Record<string, number>;
  freebieRageDots: number;
  freebieGnosisDots: number;
  freebieWillpowerDots: number;
  meritsAndFlaws: MeritOrFlawChoice[];
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface W20CreationValidationSummary {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  freebieLedger: {
    baseFreebies: number;
    rawFlawPoints: number;
    creditedFlawBonus: number;
    totalAvailableFreebies: number;
    spentBreakdown: {
      attributes: number;
      abilities: number;
      backgrounds: number;
      gifts: number;
      rage: number;
      gnosis: number;
      willpower: number;
      merits: number;
    };
    totalSpentFreebies: number;
    remainingFreebies: number;
  };
  finalComputedSheetPreview: {
    attributes: BaseAttributes;
    abilities: Partial<Record<CanonicalAbilityKey, number>>;
    backgrounds: Record<string, number>;
    rage: number;
    gnosis: number;
    willpower: number;
    renown: { glory: number; honor: number; wisdom: number };
  };
}

const ATTR_BUDGET = { primary: 7, secondary: 5, tertiary: 3 } as const;
const ABIL_BUDGET = { primary: 13, secondary: 9, tertiary: 5 } as const;

function hasUniquePriorities(
  map: Record<string, 'primary' | 'secondary' | 'tertiary'>
): boolean {
  const vals = Object.values(map);
  return (
    vals.length === 3 &&
    vals.includes('primary') &&
    vals.includes('secondary') &&
    vals.includes('tertiary')
  );
}

export function validateW20CharacterCreation(
  draft: W20CharacterCreationDraft
): W20CreationValidationSummary {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Identity & Breed/Tribe Lore Constraints
  if (!draft.name.trim()) {
    errors.push({ field: 'name', message: 'Character name is required.' });
  }
  if (draft.breed === 'metis' && !draft.metisDeformity?.trim()) {
    errors.push({
      field: 'metisDeformity',
      message: 'Metis characters must specify an innate physical or mental deformity.',
    });
  }
  if (draft.tribe === 'red_talons' && draft.breed === 'homid') {
    errors.push({
      field: 'tribe',
      message: 'Red Talons do not accept Homid-born Garou.',
    });
  }

  // 2. Validate Attribute Priorities (7 / 5 / 3) + Final Ceiling (1..5)
  if (!hasUniquePriorities(draft.attributePriorities)) {
    errors.push({
      field: 'attributePriorities',
      message: 'Physical, Social, and Mental must each be assigned a unique priority (7/5/3).',
    });
  } else {
    for (const [category, keys] of Object.entries(ATTRIBUTE_GROUPS) as Array<
      [AttributeCategory, AttributeKey[]]
    >) {
      const tier = draft.attributePriorities[category];
      const budget = ATTR_BUDGET[tier];
      const spent = keys.reduce((sum, k) => sum + (draft.priorityAttributeDots[k] ?? 0), 0);

      if (spent !== budget) {
        errors.push({
          field: `attributes.${category}`,
          message: `${category.toUpperCase()} (${tier}) must allocate exactly ${budget} priority dots (currently ${spent}).`,
        });
      }
    }
  }

  const finalAttributes = {} as BaseAttributes;
  let totalFreebieAttrDots = 0;

  for (const key of [
    ...ATTRIBUTE_GROUPS.physical,
    ...ATTRIBUTE_GROUPS.social,
    ...ATTRIBUTE_GROUPS.mental,
  ]) {
    const prio = draft.priorityAttributeDots[key] ?? 0;
    const free = draft.freebieAttributeDots[key] ?? 0;
    if (!Number.isInteger(prio) || !Number.isInteger(free) || prio < 0 || free < 0) {
      errors.push({
        field: `attributes.${key}`,
        message: `${key} must use non-negative integer dots.`,
      });
    }
    const total = 1 + prio + free; // +1 automatic base dot
    if (total > 5) {
      errors.push({
        field: `attributes.${key}`,
        message: `${key} exceeds Rank 1 starting maximum of 5 (${total}).`,
      });
    }
    finalAttributes[key] = total;
    totalFreebieAttrDots += free;
  }

  // 3. Validate Ability Priorities (13 / 9 / 5, cap 3 before Freebies, Lupus restrictions)
  if (!hasUniquePriorities(draft.abilityPriorities)) {
    errors.push({
      field: 'abilityPriorities',
      message: 'Talents, Skills, and Knowledges must each be assigned a unique priority (13/9/5).',
    });
  } else {
    for (const [category, keys] of Object.entries(ABILITY_GROUPS) as Array<
      [AbilityCategory, CanonicalAbilityKey[]]
    >) {
      const tier = draft.abilityPriorities[category];
      const budget = ABIL_BUDGET[tier];
      const spent = keys.reduce((sum, k) => sum + (draft.priorityAbilityDots[k] ?? 0), 0);

      if (spent !== budget) {
        errors.push({
          field: `abilities.${category}`,
          message: `${category.toUpperCase()} (${tier}) must allocate exactly ${budget} priority dots (currently ${spent}).`,
        });
      }
    }
  }

  const finalAbilities: Partial<Record<CanonicalAbilityKey, number>> = {};
  let totalFreebieAbilDots = 0;

  for (const key of [
    ...ABILITY_GROUPS.talents,
    ...ABILITY_GROUPS.skills,
    ...ABILITY_GROUPS.knowledges,
  ]) {
    const prio = draft.priorityAbilityDots[key] ?? 0;
    const free = draft.freebieAbilityDots[key] ?? 0;

    if (!Number.isInteger(prio) || !Number.isInteger(free) || prio < 0 || free < 0) {
      errors.push({
        field: `abilities.${key}`,
        message: `${key} must use non-negative integer dots.`,
      });
    }
    if (prio > 3) {
      errors.push({
        field: `abilities.${key}`,
        message: `${key} cannot exceed 3 dots during priority allocation (${prio}); use Freebie points for dots 4 and 5.`,
      });
    }
    if (draft.breed === 'lupus' && prio > 0 && LUPUS_RESTRICTED_BASE_ABILITIES.has(key)) {
      errors.push({
        field: `abilities.${key}`,
        message: `Lupus characters cannot assign base priority dots to ${key}; purchase only via Freebies with Storyteller approval.`,
      });
    }

    const total = prio + free;
    if (total > 5) {
      errors.push({
        field: `abilities.${key}`,
        message: `${key} cannot exceed 5 dots at character creation (${total}).`,
      });
    }
    if (total > 0) finalAbilities[key] = total;
    totalFreebieAbilDots += free;
  }

  // 4. Validate Backgrounds (5 base dots + Tribal Restrictions)
  const prioBgTotal = Object.values(draft.priorityBackgroundDots).reduce((a, b) => a + b, 0);
  if (prioBgTotal !== 5) {
    errors.push({
      field: 'backgrounds',
      message: `Must allocate exactly 5 base Background dots (currently ${prioBgTotal}).`,
    });
  }

  const allBgKeys = new Set([
    ...Object.keys(draft.priorityBackgroundDots),
    ...Object.keys(draft.freebieBackgroundDots),
  ]);
  const finalBackgrounds: Record<string, number> = {};
  let totalFreebieBgDots = 0;

  for (const bgKey of allBgKeys) {
    const prio = draft.priorityBackgroundDots[bgKey] ?? 0;
    const free = draft.freebieBackgroundDots[bgKey] ?? 0;
    if (prio < 0 || free < 0) {
      errors.push({
        field: `backgrounds.${bgKey}`,
        message: `${bgKey} cannot have negative dots.`,
      });
    }
    const total = prio + free;
    if (total > 5) {
      errors.push({
        field: `backgrounds.${bgKey}`,
        message: `${bgKey} cannot exceed 5 dots at character creation (${total}).`,
      });
    }
    if (total > 0) finalBackgrounds[bgKey] = total;
    totalFreebieBgDots += free;
  }

  const pureBreed = finalBackgrounds['pure_breed'] ?? 0;
  if (
    (draft.tribe === 'bone_gnawers' || draft.tribe === 'glass_walkers') &&
    pureBreed > 0
  ) {
    errors.push({
      field: 'backgrounds.pure_breed',
      message: `${draft.tribe.replace('_', ' ')} cannot purchase the Pure Breed Background.`,
    });
  }
  if (draft.tribe === 'children_of_gaia' && pureBreed > 3) {
    warnings.push({
      field: 'backgrounds.pure_breed',
      message: 'Some chronicles cap Children of Gaia Pure Breed at 3; confirm with Storyteller.',
    });
  }
  if (draft.tribe === 'silver_fangs' && pureBreed < 3) {
    errors.push({
      field: 'backgrounds.pure_breed',
      message: 'Silver Fangs must take at least 3 dots in Pure Breed.',
    });
  }
  if (draft.tribe === 'red_talons') {
    for (const forbidden of ['resources', 'allies', 'contacts']) {
      if ((finalBackgrounds[forbidden] ?? 0) > 0) {
        errors.push({
          field: `backgrounds.${forbidden}`,
          message: `Red Talons cannot purchase human ${forbidden} at character creation.`,
        });
      }
    }
  }
  if (draft.tribe === 'silent_striders' && (finalBackgrounds['ancestors'] ?? 0) > 0) {
    errors.push({
      field: 'backgrounds.ancestors',
      message: 'Silent Striders are severed from their ancestor-spirits and cannot take Ancestors.',
    });
  }

  // 5. Validate Starting Gifts (1 Breed + 1 Auspice + 1 Tribe, all Level 1)
  const breedGifts = draft.selectedGifts.filter((g) => g.slotSource === 'breed');
  const auspiceGifts = draft.selectedGifts.filter((g) => g.slotSource === 'auspice');
  const tribeGifts = draft.selectedGifts.filter((g) => g.slotSource === 'tribe');
  const freebieGifts = draft.selectedGifts.filter((g) => g.slotSource === 'freebie');

  if (breedGifts.length !== 1 || auspiceGifts.length !== 1 || tribeGifts.length !== 1) {
    errors.push({
      field: 'selectedGifts',
      message: 'Must choose exactly 1 Breed Gift, 1 Auspice Gift, and 1 Tribe Gift.',
    });
  }
  if (draft.selectedGifts.some((g) => g.level !== 1)) {
    errors.push({
      field: 'selectedGifts',
      message: 'Rank 1 Cliath characters may only purchase Level 1 Gifts at character creation.',
    });
  }
  const uniqueGiftIds = new Set(draft.selectedGifts.map((g) => g.giftId));
  if (uniqueGiftIds.size !== draft.selectedGifts.length) {
    errors.push({
      field: 'selectedGifts',
      message: 'Cannot select duplicate starting Gifts.',
    });
  }

  // 6. Validate Auspice Renown (Total = 3; fixed except Ragabash; no Freebies allowed)
  const renownSum =
    draft.startingRenown.glory + draft.startingRenown.honor + draft.startingRenown.wisdom;
  if (
    draft.startingRenown.glory < 0 ||
    draft.startingRenown.honor < 0 ||
    draft.startingRenown.wisdom < 0
  ) {
    errors.push({
      field: 'startingRenown',
      message: 'Starting Renown dots cannot be negative.',
    });
  } else if (draft.auspice === 'ragabash') {
    if (renownSum !== 3) {
      errors.push({
        field: 'startingRenown',
        message: `Ragabash must distribute exactly 3 starting Renown dots across any combination (currently ${renownSum}).`,
      });
    }
  } else {
    const expected = STARTING_RENOWN_BY_AUSPICE[draft.auspice];
    if (
      draft.startingRenown.glory !== expected.glory ||
      draft.startingRenown.honor !== expected.honor ||
      draft.startingRenown.wisdom !== expected.wisdom
    ) {
      errors.push({
        field: 'startingRenown',
        message: `${draft.auspice.toUpperCase()} starting Renown must be Glory ${expected.glory}, Honor ${expected.honor}, Wisdom ${expected.wisdom}.`,
      });
    }
  }

  // 7. Compute Rage, Gnosis, Willpower & Freebie Point Ledger (15 + up to 7 Flaws = max 22)
  if (draft.freebieRageDots < 0 || draft.freebieGnosisDots < 0 || draft.freebieWillpowerDots < 0) {
    errors.push({
      field: 'freebies',
      message: 'Freebie dots for Rage, Gnosis, and Willpower cannot be negative.',
    });
  }

  const finalRage = STARTING_RAGE_BY_AUSPICE[draft.auspice] + draft.freebieRageDots;
  const finalGnosis = STARTING_GNOSIS_BY_BREED[draft.breed] + draft.freebieGnosisDots;
  const finalWillpower = STARTING_WILLPOWER_BY_TRIBE[draft.tribe] + draft.freebieWillpowerDots;

  for (const [label, val] of [
    ['Rage', finalRage],
    ['Gnosis', finalGnosis],
    ['Willpower', finalWillpower],
  ] as const) {
    if (val > 10) {
      errors.push({ field: label.toLowerCase(), message: `${label} cannot exceed 10 (${val}).` });
    }
  }

  for (const mf of draft.meritsAndFlaws) {
    if (!Number.isInteger(mf.pointValue) || mf.pointValue < 1 || mf.pointValue > 7) {
      errors.push({
        field: 'meritsAndFlaws',
        message: `Merit/Flaw "${mf.name}" must have an integer pointValue between 1 and 7.`,
      });
    }
  }

  const rawFlawPoints = draft.meritsAndFlaws
    .filter((m) => m.kind === 'flaw')
    .reduce((sum, f) => sum + f.pointValue, 0);
  const creditedFlawBonus = Math.min(W20_FREEBIE_COSTS.maxFlawBonus, rawFlawPoints);

  if (rawFlawPoints > W20_FREEBIE_COSTS.maxFlawBonus) {
    warnings.push({
      field: 'meritsAndFlaws',
      message: `Selected ${rawFlawPoints} points of Flaws; W20 caps bonus Freebie points from Flaws at +7 (22 total Freebies).`,
    });
  }

  const meritCost = draft.meritsAndFlaws
    .filter((m) => m.kind === 'merit')
    .reduce((sum, m) => sum + m.pointValue, 0);

  const spentBreakdown = {
    attributes: totalFreebieAttrDots * W20_FREEBIE_COSTS.attribute,
    abilities: totalFreebieAbilDots * W20_FREEBIE_COSTS.ability,
    backgrounds: totalFreebieBgDots * W20_FREEBIE_COSTS.background,
    gifts: freebieGifts.length * W20_FREEBIE_COSTS.levelOneGift,
    rage: draft.freebieRageDots * W20_FREEBIE_COSTS.rage,
    gnosis: draft.freebieGnosisDots * W20_FREEBIE_COSTS.gnosis,
    willpower: draft.freebieWillpowerDots * W20_FREEBIE_COSTS.willpower,
    merits: meritCost,
  };

  const totalAvailableFreebies = W20_FREEBIE_COSTS.basePool + creditedFlawBonus;
  const totalSpentFreebies = Object.values(spentBreakdown).reduce((a, b) => a + b, 0);
  const remainingFreebies = totalAvailableFreebies - totalSpentFreebies;

  if (remainingFreebies < 0) {
    errors.push({
      field: 'freebies',
      message: `Overspent Freebie points by ${Math.abs(remainingFreebies)} (${totalSpentFreebies} spent of ${totalAvailableFreebies} available).`,
    });
  } else if (remainingFreebies > 0) {
    warnings.push({
      field: 'freebies',
      message: `You still have ${remainingFreebies} unspent Freebie point(s).`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    freebieLedger: {
      baseFreebies: W20_FREEBIE_COSTS.basePool,
      rawFlawPoints,
      creditedFlawBonus,
      totalAvailableFreebies,
      spentBreakdown,
      totalSpentFreebies,
      remainingFreebies,
    },
    finalComputedSheetPreview: {
      attributes: finalAttributes,
      abilities: finalAbilities,
      backgrounds: finalBackgrounds,
      rage: finalRage,
      gnosis: finalGnosis,
      willpower: finalWillpower,
      renown: { ...draft.startingRenown },
    },
  };
}

/**
 * Validates and materializes a full canonical W20CharacterState from a creation draft.
 */
export function materializeCharacterFromDraft(
  draft: W20CharacterCreationDraft,
  meta: {
    id: string;
    campaignId: string;
    ownerDiscordId: string;
    packId?: string | null;
    isNpc?: boolean;
    deedName?: string;
    portraitsByForm?: Partial<Record<GarouForm, string>>;
  }
): W20CharacterState {
  const summary = validateW20CharacterCreation(draft);
  if (!summary.isValid) {
    const reasons = summary.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Invalid W20 character creation draft: ${reasons}`);
  }

  const sheet = summary.finalComputedSheetPreview;
  const hasHugeSize = draft.meritsAndFlaws.some(
    (m) => m.kind === 'merit' && /huge\s*size/i.test(m.name)
  );
  const bonusBruisedBoxes = hasHugeSize ? 1 : 0;
  const boxes = Array<DamageType>(7 + bonusBruisedBoxes).fill('none');

  return {
    id: meta.id,
    campaignId: meta.campaignId,
    packId: meta.packId ?? null,
    ownerDiscordId: meta.ownerDiscordId,
    isNpc: meta.isNpc ?? false,
    name: draft.name.trim(),
    ...(meta.deedName ? { deedName: meta.deedName } : {}),
    concept: draft.concept,
    breed: draft.breed,
    auspice: draft.auspice,
    tribe: draft.tribe,
    rank: 1,
    ...(draft.metisDeformity ? { metisDeformity: draft.metisDeformity.trim() } : {}),
    activeForm: getBreedNaturalForm(draft.breed),
    activeRealm: 'physical',
    caughtInGauntlet: false,
    inFrenzy: false,
    frenzyType: null,
    baseAttributes: { ...sheet.attributes },
    abilities: { ...sheet.abilities },
    specialties: [],
    backgrounds: { ...sheet.backgrounds },
    meritsFlaws: draft.meritsAndFlaws.map((mf) => ({ ...mf })),
    rage: { permanent: sheet.rage, temporary: sheet.rage },
    gnosis: { permanent: sheet.gnosis, temporary: sheet.gnosis },
    willpower: { permanent: sheet.willpower, temporary: sheet.willpower },
    silverCarriedItems: 0,
    renown: {
      glory: { permanent: sheet.renown.glory, temporary: 0 },
      honor: { permanent: sheet.renown.honor, temporary: 0 },
      wisdom: { permanent: sheet.renown.wisdom, temporary: 0 },
    },
    health: {
      bonusBruisedBoxes,
      boxes,
    },
    activeBuffs: [],
    macros: [],
    fetishes: [],
    portraitsByForm: meta.portraitsByForm ? { ...meta.portraitsByForm } : {},
    turnLocks: {
      hasSpentRageThisTurn: false,
      hasSpentGnosisThisTurn: false,
      hasSpentWillpowerThisTurn: false,
      ignoringWoundPenaltiesThisTurn: false,
      declaredExtraRageActions: 0,
    },
    stateVersion: 1,
  };
}
