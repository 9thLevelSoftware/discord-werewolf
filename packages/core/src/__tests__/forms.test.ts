import { describe, expect, it } from 'vitest';
import {
  computeEffectiveCharacterStats,
  computeWoundState,
  getBreedNaturalForm,
  W20_FORM_MATRIX,
} from '../forms';
import { makeTestCharacter } from './testHelpers';

describe('W20 Five-Form Matrix & Derived Stats', () => {
  it('maps each breed to its canonical natural form', () => {
    expect(getBreedNaturalForm('homid')).toBe('homid');
    expect(getBreedNaturalForm('lupus')).toBe('lupus');
    expect(getBreedNaturalForm('metis')).toBe('crinos');
  });

  it('applies exact 5-form attribute deltas, Crinos Appearance=0, and floors', () => {
    const base = makeTestCharacter({
      activeForm: 'homid',
      baseAttributes: {
        strength: 2,
        dexterity: 2,
        stamina: 2,
        charisma: 3,
        manipulation: 1,
        appearance: 4,
        perception: 3,
        intelligence: 2,
        wits: 3,
      },
    });

    const homid = computeEffectiveCharacterStats(base);
    expect(homid.effectiveAttributes).toEqual(base.baseAttributes);
    expect(homid.naturalAttacks).toEqual([
      { name: 'Unarmed Punch', accuracyDiff: 6, damageDicePool: 2, damageType: 'bashing' },
    ]);

    const glabro = computeEffectiveCharacterStats({ ...base, activeForm: 'glabro' });
    expect(glabro.effectiveAttributes.strength).toBe(4);
    expect(glabro.effectiveAttributes.stamina).toBe(4);
    expect(glabro.effectiveAttributes.manipulation).toBe(0); // 1 - 2 floored at 0
    expect(glabro.effectiveAttributes.appearance).toBe(3);
    expect(W20_FORM_MATRIX.glabro.shiftDifficulty).toBe(7);

    const crinos = computeEffectiveCharacterStats({ ...base, activeForm: 'crinos' });
    expect(crinos.effectiveAttributes.strength).toBe(6);
    expect(crinos.effectiveAttributes.dexterity).toBe(3);
    expect(crinos.effectiveAttributes.stamina).toBe(5);
    expect(crinos.effectiveAttributes.manipulation).toBe(0); // 1 - 3 floored at 0
    expect(crinos.effectiveAttributes.appearance).toBe(0); // Overridden to 0 regardless of base
    expect(W20_FORM_MATRIX.crinos.incitesDelirium).toBe(true);
    expect(crinos.naturalAttacks).toEqual([
      { name: 'Claws', accuracyDiff: 6, damageDicePool: 8, damageType: 'aggravated' },
      { name: 'Bite', accuracyDiff: 5, damageDicePool: 7, damageType: 'aggravated' },
    ]);

    const hispo = computeEffectiveCharacterStats({ ...base, activeForm: 'hispo' });
    expect(hispo.effectiveAttributes.strength).toBe(5);
    expect(hispo.effectiveAttributes.dexterity).toBe(4);
    expect(hispo.effectiveAttributes.stamina).toBe(5);
    expect(hispo.effectiveAttributes.appearance).toBe(4);
    expect(hispo.perceptionDifficultyMod).toBe(-1);
    expect(W20_FORM_MATRIX.hispo.shiftDifficulty).toBe(7);
    expect(W20_FORM_MATRIX.hispo.perceptionDifficultyMod).toBe(-1);
    expect(hispo.naturalAttacks).toEqual([
      { name: 'Bite', accuracyDiff: 5, damageDicePool: 7, damageType: 'aggravated' }, // Str 5 + 1 + 1 Hispo bonus
    ]);

    const lupus = computeEffectiveCharacterStats({ ...base, activeForm: 'lupus' });
    expect(lupus.effectiveAttributes.strength).toBe(3);
    expect(lupus.effectiveAttributes.dexterity).toBe(4);
    expect(lupus.effectiveAttributes.stamina).toBe(4);
    expect(lupus.perceptionDifficultyMod).toBe(-2);
    expect(lupus.naturalAttacks).toEqual([
      { name: 'Bite', accuracyDiff: 5, damageDicePool: 4, damageType: 'aggravated' },
    ]);
  });

  it('enforces W20 Silver rules: Gnosis penalty in all forms, Silver soak only in Homid/Lupus breed form, never Metis', () => {
    const homidWithKlaive = makeTestCharacter({
      breed: 'homid',
      activeForm: 'homid',
      gnosis: { permanent: 4, temporary: 4 },
      silverCarriedItems: 2,
    });
    const hHomid = computeEffectiveCharacterStats(homidWithKlaive);
    expect(hHomid.effectiveGnosisPool).toBe(2);
    expect(hHomid.soakCapabilities).toMatchObject({
      canSoakBashing: true,
      canSoakLethal: false,
      canSoakAggravated: false,
      canSoakSilver: true,
    });

    const hCrinos = computeEffectiveCharacterStats({ ...homidWithKlaive, activeForm: 'crinos' });
    expect(hCrinos.effectiveGnosisPool).toBe(2); // Still reduced by silver
    expect(hCrinos.soakCapabilities).toMatchObject({
      canSoakBashing: true,
      canSoakLethal: true,
      canSoakAggravated: true,
      canSoakSilver: false, // Not breed form
    });

    const lupus = makeTestCharacter({ breed: 'lupus', activeForm: 'lupus', silverCarriedItems: 10 });
    const lLupus = computeEffectiveCharacterStats(lupus);
    expect(lLupus.effectiveGnosisPool).toBe(0); // Clamped to 0
    expect(lLupus.soakCapabilities.canSoakSilver).toBe(true);
    expect(lLupus.soakCapabilities.canSoakAggravated).toBe(true);

    const lHomid = computeEffectiveCharacterStats({ ...lupus, activeForm: 'homid' });
    expect(lHomid.soakCapabilities.canSoakSilver).toBe(false);
    expect(lHomid.soakCapabilities.canSoakLethal).toBe(false);

    // Metis can NEVER soak silver in ANY form (even Crinos)
    for (const form of ['homid', 'glabro', 'crinos', 'hispo', 'lupus'] as const) {
      const m = computeEffectiveCharacterStats(
        makeTestCharacter({ breed: 'metis', activeForm: form })
      );
      expect(m.soakCapabilities.canSoakSilver).toBe(false);
    }
  });

  it('computes wound penalties, bonus Bruised boxes, Incapacitated, and Frenzy/Willpower immunity', () => {
    expect(
      computeWoundState({
        bonusBruisedBoxes: 0,
        boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
      })
    ).toEqual({ penalty: 0, isIncapacitated: false, woundLabel: 'Healthy' });

    expect(
      computeWoundState({
        bonusBruisedBoxes: 1,
        boxes: ['bashing', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
      })
    ).toEqual({ penalty: 0, isIncapacitated: false, woundLabel: 'Bruised (-0)' });

    // With 1 bonus Bruised box, index 1 is standard Bruised (-0), index 2 is Hurt (-1)
    expect(
      computeWoundState({
        bonusBruisedBoxes: 1,
        boxes: ['lethal', 'lethal', 'bashing', 'none', 'none', 'none', 'none', 'none'],
      })
    ).toEqual({ penalty: -1, isIncapacitated: false, woundLabel: 'Hurt (-1)' });

    expect(
      computeWoundState({
        bonusBruisedBoxes: 0,
        boxes: ['aggravated', 'lethal', 'lethal', 'lethal', 'lethal', 'bashing', 'none'],
      })
    ).toEqual({ penalty: -5, isIncapacitated: false, woundLabel: 'Crippled (-5)' });

    expect(
      computeWoundState({
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'bashing'],
      })
    ).toEqual({ penalty: 0, isIncapacitated: true, woundLabel: 'Incapacitated' });

    const crippled = makeTestCharacter({
      activeForm: 'crinos',
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'bashing', 'none'],
      },
    });
    expect(computeEffectiveCharacterStats(crippled).woundPenalty).toBe(-5);
    expect(computeEffectiveCharacterStats({ ...crippled, inFrenzy: true }).woundPenalty).toBe(0);
    expect(
      computeEffectiveCharacterStats({
        ...crippled,
        turnLocks: { ...crippled.turnLocks, ignoringWoundPenaltiesThisTurn: true },
      }).woundPenalty
    ).toBe(0);
  });

  it('applies activeBuffs (claw damage, soak per success with cap, flat initiative)', () => {
    const buffed = makeTestCharacter({
      activeForm: 'crinos',
      baseAttributes: {
        strength: 3,
        dexterity: 3,
        stamina: 3,
        charisma: 2,
        manipulation: 2,
        appearance: 2,
        perception: 3,
        intelligence: 2,
        wits: 3,
      },
      activeBuffs: [
        {
          sourceMacroId: 'razor_claws',
          label: 'Razor Claws',
          effect: { type: 'buff_claw_damage', bonusDice: 2, durationRounds: 10 },
          appliedSuccesses: 1,
          remainingRounds: 10,
        },
        {
          sourceMacroId: 'lunas_armor',
          label: "Luna's Armor",
          effect: { type: 'buff_soak_per_success', maxCap: 5, durationRounds: 10 },
          appliedSuccesses: 7, // Capped at 5
          remainingRounds: 10,
        },
        {
          sourceMacroId: 'spirit_of_the_fray',
          label: 'Spirit of the Fray',
          effect: { type: 'buff_initiative_flat', bonus: 10, durationRounds: 1 },
          appliedSuccesses: 1,
          remainingRounds: 1,
        },
        {
          sourceMacroId: 'expired_buff',
          label: 'Expired',
          effect: { type: 'buff_initiative_flat', bonus: 99, durationRounds: 1 },
          appliedSuccesses: 1,
          remainingRounds: 0, // Ignored
        },
      ],
    });

    const stats = computeEffectiveCharacterStats(buffed);
    // Crinos Str = 3 + 4 = 7; Claws = 7 + 2 + 2 (buff) = 11
    expect(stats.naturalAttacks.find((a) => a.name === 'Claws')?.damageDicePool).toBe(11);
    // Crinos Sta = 3 + 3 = 6; Luna's Armor cap 5 -> 11
    expect(stats.soakCapabilities.soakPool).toBe(11);
    // Crinos Dex = 4 + Wits 3 + 10 flat buff = 17
    expect(stats.initiativeBonus).toBe(17);
  });
});
