import { describe, expect, it } from 'vitest';
import type { W20CharacterCreationDraft } from '../characterCreation';
import {
  buildDefaultSheetShortcuts,
  CANONICAL_GIFT_CATALOG,
  cleanOtherTraitDisplayName,
  computeUserSheetStats,
  createBlankUserCharacterSheet,
  draftToUserCharacterSheet,
  formatSyncCode,
  generateRandomSyncCode,
  lookupSheetAbilityDots,
  normalizeSyncCode,
  resolveOtherTraitKind,
  resolveSheetShortcut,
  sheetToLightTrackers,
  SYNC_CODE_ALPHABET,
  type SheetShortcut,
  type W20UserCharacterSheet,
} from '../userCharacterSheet';
import { W20_BACKGROUND_CATALOG, W20_MERITS_FLAWS_CATALOG } from '../characterCreation';

function makeValidDraft(
  overrides: Partial<W20CharacterCreationDraft> = {}
): W20CharacterCreationDraft {
  return {
    name: 'Ashara Moonfang',
    concept: 'Shadow-stalker Theurge',
    breed: 'homid',
    auspice: 'theurge',
    tribe: 'uktena',
    attributePriorities: { physical: 'primary', social: 'tertiary', mental: 'secondary' },
    abilityPriorities: { talents: 'primary', skills: 'secondary', knowledges: 'tertiary' },
    priorityAttributeDots: {
      strength: 2,
      dexterity: 3,
      stamina: 2, // 7
      charisma: 1,
      manipulation: 1,
      appearance: 1, // 3
      perception: 2,
      intelligence: 2,
      wits: 1, // 5
    },
    priorityAbilityDots: {
      alertness: 3,
      athletics: 2,
      brawl: 3,
      empathy: 3,
      primal_urge: 2, // 13
      animal_ken: 2,
      melee: 2,
      stealth: 3,
      survival: 2, // 9
      enigmas: 2,
      occult: 2,
      rituals: 1, // 5
    },
    priorityBackgroundDots: {
      fetish: 2,
      totem: 3, // 5
    },
    startingRenown: { glory: 0, honor: 0, wisdom: 3 },
    selectedGifts: [
      {
        giftId: '10000000-0000-4000-8000-000000000102', // Persuasion (homid)
        level: 1,
        slotSource: 'breed',
      },
      {
        giftId: '10000000-0000-4000-8000-000000000106', // Sense Wyrm (theurge)
        level: 1,
        slotSource: 'auspice',
      },
      {
        giftId: '10000000-0000-4000-8000-000000000142', // Shroud (uktena)
        level: 1,
        slotSource: 'tribe',
      },
    ],
    freebieAttributeDots: { perception: 1 }, // 5
    freebieAbilityDots: { brawl: 1 }, // 2 (brings Brawl to 4!)
    freebieBackgroundDots: { ancestors: 2 }, // 2
    freebieRageDots: 0,
    freebieGnosisDots: 1, // 2
    freebieWillpowerDots: 4, // 4 (5+2+2+2+4 = 15)
    meritsAndFlaws: [],
    ...overrides,
  };
}

describe('W20 User Character Sheet (Pages 1 & 2)', () => {
  it('exposes the original 44 W20 Gifts with accurate roll rules', () => {
    const original = CANONICAL_GIFT_CATALOG.filter((g) =>
      g.id.startsWith('10000000-0000-4000-8000-0000000001')
    );
    expect(original).toHaveLength(44);
    const ids = new Set(CANONICAL_GIFT_CATALOG.map((g) => g.id));
    expect(ids.size).toBe(CANONICAL_GIFT_CATALOG.length);

    const byName = new Map(CANONICAL_GIFT_CATALOG.map((g) => [g.name, g]));
    expect(byName.get('Persuasion')).toMatchObject({
      rollAttribute: 'charisma',
      rollAbility: 'subterfuge',
      defaultDifficulty: 7,
    });
    expect(byName.get('Sense Wyrm')).toMatchObject({
      rollAttribute: 'perception',
      rollAbility: 'occult',
      defaultDifficulty: 6,
    });
    expect(byName.get("Hare's Leap")).toMatchObject({
      rollAttribute: 'strength',
      rollAbility: 'athletics',
      defaultDifficulty: 7,
    });
    expect(byName.get('Sense Prey')).toMatchObject({
      rollAttribute: 'perception',
      rollAbility: 'primal_urge',
      defaultDifficulty: 6,
    });
    expect(byName.get('Blur of the Milky Eye')).toMatchObject({
      rollAttribute: 'manipulation',
      rollAbility: 'stealth',
      defaultDifficulty: 8,
    });
    expect(byName.get("Mother's Touch")).toMatchObject({
      rollAttribute: 'intelligence',
      rollAbility: 'empathy',
      defaultDifficulty: 6,
      gnosisCost: 1,
    });
    // Values below follow the rulebook text (W20 pp. 152-201); the earlier hand-entered list differed.
    expect(byName.get('Call of the Wyld')).toMatchObject({
      rollAttribute: 'stamina',
      rollAbility: 'empathy',
      defaultDifficulty: 6,
    });
    expect(byName.get('Mindspeak')).toMatchObject({
      rollAttribute: 'manipulation',
      rollAbility: 'expression',
      defaultDifficulty: 6,
      gnosisCost: 0,
      willpowerCost: 1,
    });
    expect(byName.get('Falling Touch')).toMatchObject({
      rollAttribute: 'willpower',
      rollAbility: null,
      defaultDifficulty: 6,
    });
    expect(byName.get('Visage of Fenris')).toMatchObject({
      rollAttribute: 'charisma',
      rollAbility: 'intimidation',
      defaultDifficulty: 6,
      rageCost: 0,
    });
    expect(byName.get('Diagnostics')).toMatchObject({
      rollAttribute: null,
      rollAbility: null,
      gnosisCost: 1,
    });
    expect(byName.get('Shroud')).toMatchObject({
      rollAttribute: 'gnosis',
      rollAbility: null,
      defaultDifficulty: 6,
      gnosisCost: 1,
    });
    expect(byName.get('Camouflage')).toMatchObject({
      rollAttribute: null,
      rollAbility: null,
      defaultDifficulty: 6,
    });
    expect(byName.get('Resist Pain')).toMatchObject({
      rollAttribute: null,
      rollAbility: null,
      willpowerCost: 1,
    });
  });

  it('converts a W20CharacterCreationDraft into a full sheet with gifts, huge size, shortcuts, and trackers', () => {
    const draft = makeValidDraft({
      breed: 'lupus',
      metisDeformity: undefined,
      selectedGifts: [
        { giftId: '10000000-0000-4000-8000-000000000109', level: 1, slotSource: 'breed' }, // Sense Prey
        { giftId: '10000000-0000-4000-8000-000000000106', level: 1, slotSource: 'auspice' }, // Sense Wyrm
        { giftId: '10000000-0000-4000-8000-000000000142', level: 1, slotSource: 'tribe' }, // Shroud
      ],
      meritsAndFlaws: [
        { id: 'merit-huge-size', name: 'Huge Size', kind: 'merit', pointValue: 4 },
        { id: 'flaw-dark-fate', name: 'Dark Fate', kind: 'flaw', pointValue: 4 },
      ],
    });

    const sheet = draftToUserCharacterSheet(draft, {
      id: 'sheet-1',
      ownerDiscordId: 'discord-42',
      player: 'Alice',
      chronicle: 'Sept of the Silver Oak',
      packName: 'Nightrunners',
      packTotem: 'Owl',
      deedName: 'Wyrm-Finder',
      now: 1_700_000_000_000,
    });

    expect(sheet.id).toBe('sheet-1');
    expect(sheet.ownerDiscordId).toBe('discord-42');
    expect(sheet.name).toBe('Ashara Moonfang');
    expect(sheet.activeForm).toBe('lupus'); // Lupus natural form
    expect(sheet.baseAttributes.dexterity).toBe(4); // 1 + 3
    expect(sheet.baseAttributes.perception).toBe(4); // 1 + 2 + 1
    expect(sheet.abilities.brawl).toBe(4); // 3 + 1
    expect(sheet.rage).toEqual({ permanent: 2, temporary: 2 }); // Theurge 2
    expect(sheet.gnosis).toEqual({ permanent: 6, temporary: 6 }); // Lupus 5 + 1
    expect(sheet.willpower).toEqual({ permanent: 7, temporary: 7 }); // Uktena 3 + 4
    expect(sheet.renown.wisdom).toEqual({ permanent: 3, temporary: 0 });
    expect(sheet.health.bonusBruisedBoxes).toBe(1);
    expect(sheet.health.boxes).toHaveLength(8);
    expect(sheet.otherTraits).toHaveLength(2);
    expect(sheet.backgrounds).toEqual(
      expect.arrayContaining([
        { id: 'fetish', name: 'Fetish', dots: 2 },
        { id: 'totem', name: 'Totem', dots: 3 },
        { id: 'ancestors', name: 'Ancestors', dots: 2 },
      ])
    );

    const shroudGift = sheet.gifts.find((g) => g.name === 'Shroud');
    expect(shroudGift).toMatchObject({
      rollAttribute: 'gnosis',
      rollAbility: null,
      // W20 p. 198: difficulty varies with the light (3 / 6 / 9); the catalog defaults to 6.
      difficulty: 6,
      gnosisCost: 1,
    });

    expect(sheet.shortcuts.some((s) => s.id === 'gift-10000000-0000-4000-8000-000000000109')).toBe(true);
    expect(sheetToLightTrackers(sheet)).toEqual({
      rage: 2,
      gnosis: 6,
      willpower: 7,
      woundPenalty: 0,
    });

    // Metis draft initializes in Crinos
    const metisSheet = draftToUserCharacterSheet(
      makeValidDraft({ breed: 'metis', metisDeformity: 'Silver Fur' }),
      { id: 'sheet-metis', ownerDiscordId: 'discord-42' }
    );
    expect(metisSheet.activeForm).toBe('crinos');
    expect(metisSheet.metisDeformity).toBe('Silver Fur');
  });

  it('computes 5-form stats, silver rules, soak, and brawling chart accurately', () => {
    const baseSheet = createBlankUserCharacterSheet({
      id: 'sheet-combat',
      ownerDiscordId: 'user-1',
      breed: 'homid',
      auspice: 'ahroun',
      tribe: 'Get of Fenris',
      now: 1_700_000_000_000,
    });
    baseSheet.baseAttributes = {
      strength: 3,
      dexterity: 3,
      stamina: 3,
      charisma: 2,
      manipulation: 2,
      appearance: 4,
      perception: 3,
      intelligence: 2,
      wits: 3,
    };
    baseSheet.abilities = { brawl: 3, athletics: 2, alertness: 2 };
    baseSheet.armor = { rating: 2, description: 'Reinforced Kevlar' };
    baseSheet.silverCarriedItems = 1;
    baseSheet.gnosis = { permanent: 4, temporary: 4 };

    // Homid: no claws, no fangs, cannot soak lethal/agg, can soak silver (breed form)
    const homid = computeUserSheetStats(baseSheet);
    expect(homid.effectiveAttributes).toEqual(baseSheet.baseAttributes);
    expect(homid.effectiveGnosisPool).toBe(3);
    expect(homid.soakCapabilities).toEqual({
      naturalSoakPool: 3,
      armorRating: 2,
      soakPool: 5,
      canSoakBashing: true,
      canSoakLethal: false,
      canSoakAggravated: false,
      canSoakSilver: true,
    });
    expect(homid.brawlingChart).toEqual([
      { key: 'bite', name: 'Bite', attackPool: 6, difficulty: 5, damagePool: 4, damageLabel: '4/A', damageType: 'aggravated', availableInCurrentForm: false },
      { key: 'body_tackle', name: 'Body Tackle', attackPool: 6, difficulty: 7, damagePool: null, damageLabel: 'Special/B', damageType: 'bashing', availableInCurrentForm: true },
      { key: 'claw', name: 'Claw', attackPool: 6, difficulty: 6, damagePool: 5, damageLabel: '5/A', damageType: 'aggravated', availableInCurrentForm: false },
      { key: 'grapple', name: 'Grapple', attackPool: 6, difficulty: 6, damagePool: 3, damageLabel: '3/B', damageType: 'bashing', availableInCurrentForm: true },
      { key: 'kick', name: 'Kick', attackPool: 6, difficulty: 7, damagePool: 4, damageLabel: '4/B', damageType: 'bashing', availableInCurrentForm: true },
      { key: 'punch', name: 'Punch', attackPool: 6, difficulty: 6, damagePool: 3, damageLabel: '3/B', damageType: 'bashing', availableInCurrentForm: true },
    ]);

    // Glabro
    const glabro = computeUserSheetStats({ ...baseSheet, activeForm: 'glabro' });
    expect(glabro.effectiveAttributes.strength).toBe(5);
    expect(glabro.effectiveAttributes.stamina).toBe(5);
    expect(glabro.effectiveAttributes.manipulation).toBe(0);
    expect(glabro.effectiveAttributes.appearance).toBe(3);
    expect(glabro.shiftDifficulty).toBe(7);

    // Crinos: Str+4, Dex+1, Sta+3, Manip=0, App=0, Claws & Bite available, Delirium
    const crinos = computeUserSheetStats({ ...baseSheet, activeForm: 'crinos' });
    expect(crinos.effectiveAttributes).toMatchObject({
      strength: 7,
      dexterity: 4,
      stamina: 6,
      manipulation: 0,
      appearance: 0,
    });
    expect(crinos.incitesDelirium).toBe(true);
    expect(crinos.soakCapabilities.canSoakAggravated).toBe(true);
    expect(crinos.soakCapabilities.canSoakSilver).toBe(false);
    expect(crinos.brawlingChart.find((r) => r.key === 'claw')).toMatchObject({
      attackPool: 7,
      damagePool: 9,
      damageLabel: '9/A',
      availableInCurrentForm: true,
    });
    expect(crinos.brawlingChart.find((r) => r.key === 'bite')).toMatchObject({
      attackPool: 7,
      damagePool: 8,
      availableInCurrentForm: true,
    });

    // Hispo: -1 Perception diff, +1 Bite bonus damage, no Claws
    const hispo = computeUserSheetStats({ ...baseSheet, activeForm: 'hispo' });
    expect(hispo.perceptionDifficultyMod).toBe(-1);
    expect(hispo.brawlingChart.find((r) => r.key === 'claw')?.availableInCurrentForm).toBe(false);
    expect(hispo.brawlingChart.find((r) => r.key === 'bite')).toMatchObject({
      damagePool: 8, // Str 6 + 1 + 1 Hispo bonus
      damageLabel: '8/A',
      availableInCurrentForm: true,
    });

    // Lupus: -2 Perception diff, Metis cannot soak silver in any form
    const lupus = computeUserSheetStats({ ...baseSheet, breed: 'metis', activeForm: 'lupus' });
    expect(lupus.perceptionDifficultyMod).toBe(-2);
    expect(lupus.soakCapabilities.canSoakSilver).toBe(false);
  });

  it('resolves custom abilities, form difficulty/stats, wound penalties, claw adaptation, and specialties', () => {
    const sheet: W20UserCharacterSheet = {
      ...createBlankUserCharacterSheet({
        id: 'sheet-resolve',
        ownerDiscordId: 'user-9',
        breed: 'homid',
        auspice: 'galliard',
        tribe: 'fianna',
      }),
      activeForm: 'lupus',
      baseAttributes: {
        strength: 3,
        dexterity: 3,
        stamina: 3,
        charisma: 3,
        manipulation: 2,
        appearance: 3,
        perception: 4,
        intelligence: 3,
        wits: 3,
      },
      abilities: {
        brawl: 4,
        melee: 3,
        primal_urge: 2,
        stealth: 2,
      },
      customAbilities: [
        {
          id: 'ca-spirit-lore',
          category: 'knowledges',
          name: 'Spirit Lore',
          dots: 3,
          specialty: 'Umbral Courts',
        },
      ],
      specialties: {
        brawl: 'Fangs & Claws',
        perception: 'Scent Tracking',
      },
      rage: { permanent: 4, temporary: 4 },
      gnosis: { permanent: 5, temporary: 5 },
      willpower: { permanent: 6, temporary: 6 },
      silverCarriedItems: 2,
      armor: { rating: 3, description: 'Heavy Coat' },
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'lethal', 'lethal', 'none', 'none', 'none'], // Wounded (-2)
      },
      combatWeapons: [
        {
          id: 'w-klaive',
          name: 'Klaive',
          rollAttribute: 'dexterity',
          rollAbility: 'melee',
          difficulty: 6,
          damageMode: 'strength_plus',
          damageDice: 2,
          damageType: 'aggravated',
          range: 'Melee',
          rate: '1',
          clip: '-',
        },
        {
          id: 'w-rifle',
          name: 'Hunting Rifle',
          rollAttribute: 'dexterity',
          rollAbility: 'firearms',
          difficulty: 7,
          damageMode: 'flat',
          damageDice: 8,
          damageType: 'lethal',
          range: '200',
          rate: '1',
          clip: '5',
        },
      ],
      fetishes: [
        {
          id: 'f-feather',
          name: 'Phoebe Feather',
          level: 2,
          gnosisRating: 6,
          power: 'Grants silent glide',
        },
      ],
    };

    // Custom ability lookup by ID and name + normalized canonical key
    expect(lookupSheetAbilityDots(sheet, 'ca-spirit-lore')).toBe(3);
    expect(lookupSheetAbilityDots(sheet, 'spirit lore')).toBe(3);
    expect(lookupSheetAbilityDots(sheet, 'Primal-Urge')).toBe(2);
    expect(lookupSheetAbilityDots(sheet, 'missing_skill')).toBe(0);

    // 1. Perception + Primal-Urge in Lupus applies -2 perception diff AND -2 wound penalty AND auto-detects specialty
    const percShortcut: SheetShortcut = {
      id: 's-track',
      name: 'Track Quarry',
      source: {
        kind: 'trait_combo',
        attribute: 'perception',
        ability: 'primal_urge',
        applyPerceptionFormDiff: true,
      },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    };
    const resolvedPerc = resolveSheetShortcut(sheet, percShortcut);
    expect(resolvedPerc.rawPool).toBe(6); // Per 4 + Primal-Urge 2
    expect(resolvedPerc.basePool).toBe(6);
    expect(resolvedPerc.effectivePool).toBe(4); // 6 - 2 Wounded
    expect(resolvedPerc.difficulty).toBe(4); // 6 - 2 Lupus perception mod
    expect(resolvedPerc.hasSpecialty).toBe(true);
    expect(resolvedPerc.specialtyReason).toContain('Scent Tracking');
    expect(resolvedPerc.applyWoundPenalty).toBe(true);

    // applyPerceptionFormDiff: false skips form diff mod; difficulty still clamped [2..10]
    const noModPerc = resolveSheetShortcut(sheet, {
      ...percShortcut,
      difficulty: 1,
      source: {
        kind: 'trait_combo',
        attribute: 'perception',
        ability: 'primal_urge',
        applyPerceptionFormDiff: false,
      },
    });
    expect(noModPerc.difficulty).toBe(2);

    // 2. useFormStats: false ignores Lupus +2 Dexterity
    const baseDexBrawl = resolveSheetShortcut(sheet, {
      id: 's-base-brawl',
      name: 'Base Brawl',
      source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'brawl', useFormStats: false },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    });
    expect(baseDexBrawl.rawPool).toBe(7); // Base Dex 3 + Brawl 4 (instead of Lupus Dex 5 + 4 = 9)
    expect(baseDexBrawl.effectivePool).toBe(5); // 7 - 2 Wounded
    expect(baseDexBrawl.hasSpecialty).toBe(true);
    expect(baseDexBrawl.specialtyReason).toContain('Fangs & Claws');

    // 3. Custom ability specialty auto-detection + forceSpecialty
    const customSpec = resolveSheetShortcut(sheet, {
      id: 's-lore',
      name: 'Spirit Lore Check',
      source: { kind: 'trait_combo', attribute: 'intelligence', ability: 'ca-spirit-lore' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    });
    expect(customSpec.rawPool).toBe(6); // Int 3 + Spirit Lore 3
    expect(customSpec.hasSpecialty).toBe(true);
    expect(customSpec.specialtyReason).toContain('Umbral Courts');

    const forcedSpec = resolveSheetShortcut(sheet, {
      id: 's-stealth',
      name: 'Forced Stealth',
      source: { kind: 'trait_combo', attribute: 'wits', ability: 'stealth' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      forceSpecialty: true,
      isSecretRoll: false,
    });
    expect(forcedSpec.hasSpecialty).toBe(true);

    // 4. Wound penalty rules: FALSE on Damage, Soak, Gnosis, Willpower (even if shortcut sets true!)
    const soakRes = resolveSheetShortcut(sheet, {
      id: 's-soak',
      name: 'Soak',
      source: { kind: 'soak', includeArmor: true },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // must be forced false
      isSecretRoll: false,
    });
    expect(soakRes.applyWoundPenalty).toBe(false);
    expect(soakRes.rawPool).toBe(8); // Lupus Sta 5 + Armor 3
    expect(soakRes.effectivePool).toBe(8);

    const gnosisRes = resolveSheetShortcut(sheet, {
      id: 's-gnosis',
      name: 'Gnosis',
      source: { kind: 'trait_combo', attribute: 'gnosis' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // must be forced false
      isSecretRoll: false,
    });
    expect(gnosisRes.applyWoundPenalty).toBe(false);
    expect(gnosisRes.rawPool).toBe(3); // 5 perm - 2 silver
    expect(gnosisRes.effectivePool).toBe(3);

    const wpRes = resolveSheetShortcut(sheet, {
      id: 's-wp',
      name: 'Willpower',
      source: { kind: 'trait_combo', attribute: 'willpower' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // must be forced false
      isSecretRoll: false,
    });
    expect(wpRes.applyWoundPenalty).toBe(false);
    expect(wpRes.effectivePool).toBe(6);

    // 5. natural_brawl_damage: Claw adapts to Bite in Lupus/Hispo, Punch in Homid/Glabro, Claw in Crinos
    const clawShortcut: SheetShortcut = {
      id: 's-claw',
      name: 'Claw Damage',
      source: { kind: 'natural_brawl_damage', maneuver: 'claw' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // must be forced false
      isSecretRoll: false,
    };
    const adaptedLupus = resolveSheetShortcut(sheet, clawShortcut);
    expect(adaptedLupus.applyWoundPenalty).toBe(false);
    expect(adaptedLupus.label).toBe('Bite Damage');
    expect(adaptedLupus.rawPool).toBe(5); // Lupus Str 4 + 1
    expect(adaptedLupus.formulaSummary).toContain('Bite');

    const adaptedHomid = resolveSheetShortcut({ ...sheet, activeForm: 'homid' }, clawShortcut);
    expect(adaptedHomid.label).toBe('Unarmed Punch Damage');
    expect(adaptedHomid.rawPool).toBe(3); // Homid Str 3
    expect(adaptedHomid.formulaSummary).toContain('Punch');

    const crinosClaw = resolveSheetShortcut({ ...sheet, activeForm: 'crinos' }, clawShortcut);
    expect(crinosClaw.label).toBe('Claw Damage');
    expect(crinosClaw.rawPool).toBe(9); // Crinos Str 7 + 2

    // 6. Weapon Attack / Damage, Fetish Activate, Static, & Pool Clamping
    const klaiveAtk = resolveSheetShortcut(sheet, {
      id: 's-klaive-atk',
      name: 'Klaive Attack',
      source: { kind: 'weapon_attack', weaponId: 'w-klaive' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    });
    expect(klaiveAtk.rawPool).toBe(8); // Lupus Dex 5 + Melee 3
    expect(klaiveAtk.effectivePool).toBe(6); // -2 Wounded

    const klaiveDmg = resolveSheetShortcut(sheet, {
      id: 's-klaive-dmg',
      name: 'Klaive Damage',
      source: { kind: 'weapon_damage', weaponId: 'w-klaive' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // forced false
      isSecretRoll: false,
    });
    expect(klaiveDmg.applyWoundPenalty).toBe(false);
    expect(klaiveDmg.effectivePool).toBe(6); // Lupus Str 4 + 2

    const rifleDmg = resolveSheetShortcut(sheet, {
      id: 's-rifle-dmg',
      name: 'Rifle Damage',
      source: { kind: 'weapon_damage', weaponId: 'w-rifle' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: false,
    });
    expect(rifleDmg.effectivePool).toBe(8);

    const fetishRes = resolveSheetShortcut(sheet, {
      id: 's-fetish',
      name: 'Activate Feather',
      source: { kind: 'fetish_activate', fetishId: 'f-feather' },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true, // forced false
      isSecretRoll: false,
    });
    expect(fetishRes.applyWoundPenalty).toBe(false);
    expect(fetishRes.effectivePool).toBe(6);

    const hugeStatic = resolveSheetShortcut(sheet, {
      id: 's-static',
      name: 'Huge Pool',
      source: { kind: 'static', pool: 40 },
      difficulty: 12,
      rageDiceCount: 0,
      applyWoundPenalty: false,
      isSecretRoll: true,
    });
    expect(hugeStatic.basePool).toBe(30);
    expect(hugeStatic.difficulty).toBe(10);
    expect(hugeStatic.isSecretRoll).toBe(true);

    // Zero raw pool clamps basePool to 1 and effectivePool to 0
    const zeroPool = resolveSheetShortcut(sheet, {
      id: 's-zero',
      name: 'Zero Pool',
      source: { kind: 'static', pool: 0 },
      difficulty: 6,
      rageDiceCount: 0,
      applyWoundPenalty: true,
      isSecretRoll: false,
    });
    expect(zeroPool.basePool).toBe(1);
    expect(zeroPool.effectivePool).toBe(0);

    // buildDefaultSheetShortcuts includes weapons and fetishes
    const built = buildDefaultSheetShortcuts(sheet);
    expect(built.some((s) => s.id === 'weapon-atk-w-klaive')).toBe(true);
    expect(built.some((s) => s.id === 'weapon-dmg-w-klaive')).toBe(true);
    expect(built.some((s) => s.id === 'fetish-f-feather')).toBe(true);
  });

  it('normalizes, formats, and generates unbiased sync codes', () => {
    expect(SYNC_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    expect(SYNC_CODE_ALPHABET).toHaveLength(32);

    const deterministic = generateRandomSyncCode(new Uint8Array([0, 1, 2, 3, 24, 25, 30, 31]));
    expect(deterministic).toBe('ABCD2389');
    expect(formatSyncCode(deterministic)).toBe('ABCD-2389');
    expect(normalizeSyncCode('  abcd - 2389  ')).toBe('ABCD2389');
    expect(normalizeSyncCode('abcd2389')).toBe('ABCD2389');

    // Rejects ambiguous characters I, O, 0, 1 and invalid lengths
    expect(normalizeSyncCode('ABCD-EFGI')).toBeNull();
    expect(normalizeSyncCode('ABCD-EFGO')).toBeNull();
    expect(normalizeSyncCode('ABCD-EFG0')).toBeNull();
    expect(normalizeSyncCode('ABCD-EFG1')).toBeNull();
    expect(normalizeSyncCode('ABCD-234')).toBeNull();
    expect(normalizeSyncCode('ABCD-2345-6789')).toBeNull();

    const randomCode = generateRandomSyncCode();
    expect(randomCode).toHaveLength(8);
    expect(normalizeSyncCode(randomCode)).toBe(randomCode);
    expect(formatSyncCode(randomCode)).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('includes Fate & expanded W20 Backgrounds, preserves custom labels, and differentiates Merits vs Flaws', () => {
    expect(W20_BACKGROUND_CATALOG.some((b) => b.key === 'fate' && b.label === 'Fate')).toBe(true);
    expect(W20_BACKGROUND_CATALOG.filter((b) => b.tier === 'core')).toHaveLength(12);
    expect(W20_BACKGROUND_CATALOG.filter((b) => b.tier === 'expanded')).toHaveLength(12);
    expect(W20_MERITS_FLAWS_CATALOG.some((m) => m.kind === 'merit')).toBe(true);
    expect(W20_MERITS_FLAWS_CATALOG.some((m) => m.kind === 'flaw')).toBe(true);

    const draft = makeValidDraft({
      priorityBackgroundDots: {
        fate: 2,
        custom_klaive_bond: 3,
      },
      freebieBackgroundDots: {},
      customBackgroundLabels: {
        custom_klaive_bond: 'Klaive Bond',
      },
      meritsAndFlaws: [
        { id: 'merit-1', name: 'Acute Senses', kind: 'merit', pointValue: 1, category: 'physical' },
        { id: 'flaw-1', name: 'Dark Fate', kind: 'flaw', pointValue: 5, category: 'supernatural' },
      ],
    });

    const sheet = draftToUserCharacterSheet(draft, {
      id: 'sheet-bg-merits',
      ownerDiscordId: 'discord-42',
    });

    expect(sheet.backgrounds).toEqual(
      expect.arrayContaining([
        { id: 'fate', name: 'Fate', dots: 2 },
        { id: 'custom_klaive_bond', name: 'Klaive Bond', dots: 3 },
      ])
    );

    expect(sheet.otherTraits).toEqual([
      { id: 'merit-1', name: 'Acute Senses', dots: 1, kind: 'merit', category: 'physical' },
      { id: 'flaw-1', name: 'Dark Fate', dots: 5, kind: 'flaw', category: 'supernatural' },
    ]);

    expect(resolveOtherTraitKind({ name: 'Acute Senses', kind: 'merit' })).toBe('merit');
    expect(resolveOtherTraitKind({ name: 'Acute Senses (Merit)' })).toBe('merit');
    expect(resolveOtherTraitKind({ name: 'Dark Fate (Flaw)' })).toBe('flaw');
    expect(resolveOtherTraitKind({ name: 'Silver Tolerance' })).toBe('other');
    expect(cleanOtherTraitDisplayName('Acute Senses (Merit)')).toBe('Acute Senses');
    expect(cleanOtherTraitDisplayName('Dark Fate (Flaw)')).toBe('Dark Fate');
  });
});
