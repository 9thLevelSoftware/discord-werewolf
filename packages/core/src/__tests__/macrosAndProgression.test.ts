import { describe, expect, it } from 'vitest';
import { CANONICAL_W20_PRESETS, executeW20Macro } from '../macros';
import {
  ATTRIBUTE_GROUPS,
  ABILITY_GROUPS,
  LUPUS_RESTRICTED_BASE_ABILITIES,
  materializeCharacterFromDraft,
  STARTING_GNOSIS_BY_BREED,
  STARTING_RAGE_BY_AUSPICE,
  STARTING_RENOWN_BY_AUSPICE,
  STARTING_WILLPOWER_BY_TRIBE,
  validateW20CharacterCreation,
  W20_FREEBIE_COSTS,
  W20CharacterCreationDraft,
} from '../characterCreation';
import { calculateW20XpCost } from '../xpCalculator';
import { computeEffectiveCharacterStats } from '../forms';
import { makeTestCharacter, seqRng } from './testHelpers';

function makeValidCreationDraft(
  overrides: Partial<W20CharacterCreationDraft> = {}
): W20CharacterCreationDraft {
  return {
    name: 'Torin Stormmane',
    concept: 'Fianna Galliard Skald',
    breed: 'homid',
    auspice: 'galliard',
    tribe: 'fianna',
    attributePriorities: { physical: 'primary', social: 'secondary', mental: 'tertiary' },
    abilityPriorities: { talents: 'primary', skills: 'secondary', knowledges: 'tertiary' },
    priorityAttributeDots: {
      strength: 3,
      dexterity: 2,
      stamina: 2, // 7
      charisma: 2,
      manipulation: 1,
      appearance: 2, // 5
      perception: 1,
      intelligence: 1,
      wits: 1, // 3
    },
    priorityAbilityDots: {
      // Talents: 13
      alertness: 3,
      athletics: 2,
      brawl: 3,
      expression: 3,
      primal_urge: 2,
      // Skills: 9
      animal_ken: 2,
      melee: 3,
      performance: 2,
      survival: 2,
      // Knowledges: 5
      enigmas: 2,
      occult: 2,
      rituals: 1,
    },
    priorityBackgroundDots: {
      ancestors: 2,
      totem: 3, // 5
    },
    startingRenown: { glory: 2, honor: 0, wisdom: 1 },
    selectedGifts: [
      { giftId: 'gift-breed-1', level: 1, slotSource: 'breed' },
      { giftId: 'gift-auspice-1', level: 1, slotSource: 'auspice' },
      { giftId: 'gift-tribe-1', level: 1, slotSource: 'tribe' },
    ],
    freebieAttributeDots: { wits: 1 }, // 5
    freebieAbilityDots: { melee: 1 }, // 2 (brings Melee to 4!)
    freebieBackgroundDots: { resources: 1 }, // 1
    freebieRageDots: 1, // 1
    freebieGnosisDots: 1, // 2
    freebieWillpowerDots: 4, // 4 (Total spent: 5+2+1+1+2+4 = 15)
    meritsAndFlaws: [],
    ...overrides,
  };
}

describe('W20 Gift/Fetish Macros, Character Creation & XP Calculator', () => {
  it('executes all 6 canonical W20 preset macros with form/resource/target validation', () => {
    const homid = makeTestCharacter({ activeForm: 'homid' });

    // Razor Claws blocked in Homid
    expect(() =>
      executeW20Macro(homid, CANONICAL_W20_PRESETS.razor_claws, { localGauntlet: 6 })
    ).toThrow(/requires one of: crinos, hispo, lupus/);

    // Razor Claws succeeds in Crinos, deducts 1 Rage, locks Gnosis, adds +2 claw buff
    const crinos = makeTestCharacter({ activeForm: 'crinos' });
    const razorRes = executeW20Macro(crinos, CANONICAL_W20_PRESETS.razor_claws, {
      localGauntlet: 6,
    });
    expect(razorRes.updatedCaster.rage.temporary).toBe(4);
    expect(razorRes.updatedCaster.turnLocks.hasSpentRageThisTurn).toBe(true);
    expect(razorRes.updatedCaster.activeBuffs).toHaveLength(1);
    expect(computeEffectiveCharacterStats(razorRes.updatedCaster).naturalAttacks[0].damageDicePool).toBe(11);

    // Golden Rule blocks Luna's Armor (1 Gnosis) right after Razor Claws (1 Rage)
    expect(() =>
      executeW20Macro(razorRes.updatedCaster, CANONICAL_W20_PRESETS.lunas_armor, {
        localGauntlet: 6,
      })
    ).toThrow(/Cannot spend Gnosis/);

    // Luna's Armor succeeds fresh & adds soak buff capped at 5
    const lunaRes = executeW20Macro(
      crinos,
      CANONICAL_W20_PRESETS.lunas_armor,
      { localGauntlet: 6 },
      seqRng([9, 9, 9, 9, 9, 9, 9, 9]) // 8 successes -> capped at 5
    );
    expect(lunaRes.updatedCaster.gnosis.temporary).toBe(2);
    expect(computeEffectiveCharacterStats(lunaRes.updatedCaster).soakCapabilities.soakPool).toBe(11);

    // Sense Wyrm rolls Perception + Occult
    const senseRes = executeW20Macro(
      homid,
      CANONICAL_W20_PRESETS.sense_wyrm,
      { localGauntlet: 6 },
      seqRng([8, 7, 2, 3, 4])
    );
    expect(senseRes.rollResult?.netSuccesses).toBe(2);

    // Custom local_gauntlet & stamina_plus_3 difficulty lookups + silver Gnosis reduction
    const customUmbral = executeW20Macro(
      makeTestCharacter({ gnosis: { permanent: 5, temporary: 5 }, silverCarriedItems: 2 }),
      {
        id: 'umbral-step',
        name: 'Umbral Sight',
        category: 'gift',
        rankOrLevel: 1,
        costs: { rage: 0, gnosis: 0, willpower: 0 },
        pool: { kind: 'permanent_trait', trait: 'gnosis' },
        difficulty: { kind: 'local_gauntlet', modifier: -1 },
        effects: [{ type: 'storyteller_secret_whisper', promptTemplate: 'Peek across Gauntlet' }],
        summary: 'Roll effective Gnosis vs Gauntlet - 1',
      },
      { localGauntlet: 8 },
      seqRng([7, 8, 9])
    );
    expect(customUmbral.rollResult?.effectivePool).toBe(3); // 5 - 2 silver
    expect(customUmbral.rollResult?.clampedDifficulty).toBe(7); // 8 - 1

    const targetStam3 = executeW20Macro(
      homid,
      {
        id: 'venom-strike',
        name: 'Venom Strike',
        category: 'gift',
        rankOrLevel: 2,
        costs: { rage: 1, gnosis: 0, willpower: 0 },
        pool: { kind: 'attribute_ability', attribute: 'dexterity', ability: 'brawl' },
        difficulty: { kind: 'target_trait', trait: 'stamina_plus_3' },
        effects: [{ type: 'weapon_strike', damageBonus: 1, damageType: 'aggravated', isSilver: false }],
        summary: 'Attack vs target Stamina + 3',
      },
      {
        localGauntlet: 6,
        targetCharacter: makeTestCharacter({ activeForm: 'crinos' }), // Sta 3 + 3 = 6 -> diff 9
      },
      seqRng([9, 8, 2, 2, 2, 2])
    );
    expect(targetStam3.rollResult?.clampedDifficulty).toBe(9);
    expect(targetStam3.rollResult?.netSuccesses).toBe(1);

    // Grand Klaive rolls Fetish Gnosis 7
    const klaiveRes = executeW20Macro(
      crinos,
      CANONICAL_W20_PRESETS.grand_klaive,
      { localGauntlet: 6 },
      seqRng([7, 8, 9, 2, 2, 2, 2])
    );
    expect(klaiveRes.rollResult?.effectivePool).toBe(7);
    expect(klaiveRes.grantedBuffs[0].effect.type).toBe('weapon_strike');

    // Spirit of the Fray grants +10 initiative buff and locks Rage
    const frayRes = executeW20Macro(homid, CANONICAL_W20_PRESETS.spirit_of_the_fray, {
      localGauntlet: 6,
    });
    expect(frayRes.updatedCaster.turnLocks.hasSpentGnosisThisTurn).toBe(true);
    expect(computeEffectiveCharacterStats(frayRes.updatedCaster).initiativeBonus).toBe(16);

    // Mother's Touch uses target's Rage as diff and heals Aggravated wounds
    const woundedAlly = makeTestCharacter({
      id: 'ally',
      rage: { permanent: 5, temporary: 5 },
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['aggravated', 'aggravated', 'lethal', 'none', 'none', 'none', 'none'],
      },
    });
    const healRes = executeW20Macro(
      homid,
      CANONICAL_W20_PRESETS.mothers_touch,
      { localGauntlet: 6, targetCharacter: woundedAlly },
      seqRng([5, 6, 2, 2]) // Int 2 + Empathy 2 = 4 dice vs target Rage diff 5 -> 2 successes
    );
    expect(healRes.rollResult?.clampedDifficulty).toBe(5);
    expect(healRes.updatedTarget?.health.boxes).toEqual([
      'lethal',
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
  });

  it('validates canonical W20 character creation rules, tribal restrictions, freebies, and materializes characters', () => {
    expect(Object.keys(STARTING_WILLPOWER_BY_TRIBE)).toHaveLength(13);
    expect(STARTING_GNOSIS_BY_BREED).toEqual({ homid: 1, metis: 3, lupus: 5 });
    expect(STARTING_RAGE_BY_AUSPICE).toEqual({
      ragabash: 1,
      theurge: 2,
      philodox: 3,
      galliard: 4,
      ahroun: 5,
    });
    expect(STARTING_RENOWN_BY_AUSPICE.philodox).toEqual({ glory: 0, honor: 3, wisdom: 0 });
    expect(W20_FREEBIE_COSTS.basePool).toBe(15);
    expect(ATTRIBUTE_GROUPS.physical).toHaveLength(3);
    expect(ABILITY_GROUPS.talents).toHaveLength(10);
    expect(LUPUS_RESTRICTED_BASE_ABILITIES.has('computer')).toBe(true);

    const draft = makeValidCreationDraft({
      meritsAndFlaws: [
        { id: 'mf-1', name: 'Huge Size', kind: 'merit', pointValue: 4 },
        { id: 'mf-2', name: 'Dark Secret', kind: 'flaw', pointValue: 4 },
      ],
    });
    const valid = validateW20CharacterCreation(draft);
    expect(valid.isValid).toBe(true);
    expect(valid.freebieLedger.totalAvailableFreebies).toBe(19);
    expect(valid.freebieLedger.totalSpentFreebies).toBe(19);
    expect(valid.freebieLedger.remainingFreebies).toBe(0);

    const char = materializeCharacterFromDraft(draft, {
      id: 'new-char',
      campaignId: 'camp-1',
      ownerDiscordId: 'discord-1',
    });
    expect(char.activeForm).toBe('homid');
    expect(char.abilities.melee).toBe(4);
    expect(char.rage.permanent).toBe(5); // Galliard 4 + 1 freebie
    expect(char.gnosis.permanent).toBe(2); // Homid 1 + 1 freebie
    expect(char.willpower.permanent).toBe(7); // Fianna 3 + 4 freebie
    expect(char.renown.glory.permanent).toBe(2);
    expect(char.health.bonusBruisedBoxes).toBe(1); // Huge Size merit!
    expect(char.health.boxes).toHaveLength(8);

    // Metis materializes in Crinos and requires deformity
    const metisDraft = makeValidCreationDraft({
      breed: 'metis',
      auspice: 'ragabash',
      tribe: 'children_of_gaia',
      metisDeformity: 'Two-headed shadow',
      startingRenown: { glory: 1, honor: 1, wisdom: 1 },
      freebieWillpowerDots: 3, // Children of Gaia start at 4 WP
      meritsAndFlaws: [{ id: 'f1', name: 'Overconfident', kind: 'flaw', pointValue: 1 }], // 16 avail
    });
    // Spent: 5 + 2 + 1 + 1 + 2 + 3 = 14 (2 unspent warning, still valid)
    const metisSummary = validateW20CharacterCreation(metisDraft);
    expect(metisSummary.isValid).toBe(true);
    expect(metisSummary.warnings.some((w) => w.field === 'freebies')).toBe(true);
    const metisChar = materializeCharacterFromDraft(metisDraft, {
      id: 'm1',
      campaignId: 'camp-1',
      ownerDiscordId: 'u2',
    });
    expect(metisChar.activeForm).toBe('crinos');

    // Invalid checks: Red Talon Homid, Lupus restricted ability, Silver Fang <3 Pure Breed, Flaw cap warning
    const invalidDraft = makeValidCreationDraft({
      breed: 'homid',
      tribe: 'red_talons',
      priorityAbilityDots: {
        ...makeValidCreationDraft().priorityAbilityDots,
        brawl: 4, // Exceeds 3 priority cap
      },
      priorityBackgroundDots: { resources: 3, allies: 2 },
      meritsAndFlaws: [
        { id: 'f1', name: 'Bad Flaw 1', kind: 'flaw', pointValue: 5 },
        { id: 'f2', name: 'Bad Flaw 2', kind: 'flaw', pointValue: 5 }, // 10 > 7 cap
      ],
    });
    const badRes = validateW20CharacterCreation(invalidDraft);
    expect(badRes.isValid).toBe(false);
    expect(badRes.errors.some((e) => e.field === 'tribe')).toBe(true);
    expect(badRes.errors.some((e) => e.field === 'abilities.brawl')).toBe(true);
    expect(badRes.errors.some((e) => e.field === 'backgrounds.resources')).toBe(true);
    expect(badRes.freebieLedger.creditedFlawBonus).toBe(7);
    expect(badRes.warnings.some((w) => w.field === 'meritsAndFlaws')).toBe(true);

    // Lupus restricted ability check + Silver Fang Pure Breed check
    const lupusSilverFang = makeValidCreationDraft({
      breed: 'lupus',
      tribe: 'silver_fangs',
      priorityAbilityDots: {
        alertness: 3,
        athletics: 2,
        brawl: 3,
        expression: 2,
        primal_urge: 3,
        animal_ken: 3,
        melee: 2,
        stealth: 2,
        survival: 2,
        computer: 3, // Forbidden for Lupus base priority!
        enigmas: 2,
      },
      priorityBackgroundDots: { pure_breed: 2, ancestors: 3 }, // Silver Fang needs >= 3 Pure Breed!
    });
    const lsfRes = validateW20CharacterCreation(lupusSilverFang);
    expect(lsfRes.isValid).toBe(false);
    expect(lsfRes.errors.some((e) => e.field === 'abilities.computer')).toBe(true);
    expect(lsfRes.errors.some((e) => e.field === 'backgrounds.pure_breed')).toBe(true);

    // Bone Gnawers & Glass Walkers cannot take Ancestors; discouraged tribe backgrounds emit warnings
    const boneGnawer = makeValidCreationDraft({
      tribe: 'bone_gnawers',
      priorityBackgroundDots: { ancestors: 2, resources: 3 },
    });
    const bgRes = validateW20CharacterCreation(boneGnawer);
    expect(bgRes.isValid).toBe(false);
    expect(bgRes.errors.some((e) => e.field === 'backgrounds.ancestors')).toBe(true);
    expect(bgRes.warnings.some((w) => w.field === 'backgrounds.resources')).toBe(true);

    const glassWalker = makeValidCreationDraft({
      tribe: 'glass_walkers',
      priorityBackgroundDots: { ancestors: 1, mentor: 4 },
    });
    const gwRes = validateW20CharacterCreation(glassWalker);
    expect(gwRes.isValid).toBe(false);
    expect(gwRes.errors.some((e) => e.field === 'backgrounds.ancestors')).toBe(true);
    expect(gwRes.warnings.some((w) => w.field === 'backgrounds.mentor')).toBe(true);

    const stargazer = makeValidCreationDraft({
      tribe: 'stargazers',
      priorityBackgroundDots: { allies: 1, fetish: 2, resources: 2 },
    });
    const sgRes = validateW20CharacterCreation(stargazer);
    expect(sgRes.isValid).toBe(true);
    expect(sgRes.warnings.some((w) => w.field === 'backgrounds.allies')).toBe(true);
    expect(sgRes.warnings.some((w) => w.field === 'backgrounds.fetish')).toBe(true);
    expect(sgRes.warnings.some((w) => w.field === 'backgrounds.resources')).toBe(true);
  });

  it('calculates canonical W20 XP costs across all categories', () => {
    expect(calculateW20XpCost('attribute', 3)).toBe(12);
    expect(calculateW20XpCost('ability', 0)).toBe(3);
    expect(calculateW20XpCost('ability', 3)).toBe(6);
    expect(calculateW20XpCost('in_tribe_gift', 2)).toBe(6);
    expect(calculateW20XpCost('out_of_tribe_gift', 2)).toBe(10);
    expect(calculateW20XpCost('rage', 4)).toBe(4);
    expect(calculateW20XpCost('gnosis', 3)).toBe(6);
    expect(calculateW20XpCost('willpower', 5)).toBe(5);
    expect(() => calculateW20XpCost('in_tribe_gift', 0)).toThrow();
    expect(() => calculateW20XpCost('attribute', -1)).toThrow();
  });
});
