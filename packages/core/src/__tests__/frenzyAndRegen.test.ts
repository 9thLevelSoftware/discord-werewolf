import { describe, expect, it } from 'vitest';
import {
  applyHealthDamage,
  healHealthDamage,
  MOON_BASE_FRENZY_DIFF,
  resolveCombatRegeneration,
  resolveFrenzyCheck,
} from '../frenzyAndRegen';
import { makeTestCharacter, seqRng } from './testHelpers';

describe('W20 Health Cascading, Regeneration & Frenzy', () => {
  it('applies health damage sorted heaviest-first and overflows Bashing into Lethal', () => {
    let char = makeTestCharacter();
    char = applyHealthDamage(char, 3, 'bashing');
    char = applyHealthDamage(char, 2, 'lethal');
    char = applyHealthDamage(char, 1, 'aggravated');
    expect(char.health.boxes).toEqual([
      'aggravated',
      'lethal',
      'lethal',
      'bashing',
      'bashing',
      'bashing',
      'none',
    ]);

    // 2 more bashing: 1st fills last 'none', 2nd overflows and upgrades a 'bashing' to 'lethal'
    char = applyHealthDamage(char, 2, 'bashing');
    expect(char.health.boxes).toEqual([
      'aggravated',
      'lethal',
      'lethal',
      'lethal',
      'bashing',
      'bashing',
      'bashing',
    ]);

    // Overflow Lethal upgrades Bashing to Lethal
    char = applyHealthDamage(char, 2, 'lethal');
    expect(char.health.boxes).toEqual([
      'aggravated',
      'lethal',
      'lethal',
      'lethal',
      'lethal',
      'lethal',
      'bashing',
    ]);
  });

  it('heals Bashing before Lethal and only heals Aggravated when healAggravated is true', () => {
    const char = makeTestCharacter({
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['aggravated', 'lethal', 'bashing', 'none', 'none', 'none', 'none'],
      },
    });

    const heal1 = healHealthDamage(char, 1);
    expect(heal1.health.boxes).toEqual([
      'aggravated',
      'lethal',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);

    // Trying to heal 2 more without healAggravated stops after Lethal
    const heal2 = healHealthDamage(heal1, 2);
    expect(heal2.health.boxes).toEqual([
      'aggravated',
      'none',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);

    // With healAggravated, clears Aggravated
    const healAgg = healHealthDamage(char, 1, { healAggravated: true });
    expect(healAgg.health.boxes).toEqual([
      'lethal',
      'bashing',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
  });

  it('resolves regeneration by breed form, combat Stamina Diff 8, and Metis all-form exception', () => {
    // Homid in Homid form cannot regenerate
    const homidInBreed = makeTestCharacter({
      breed: 'homid',
      activeForm: 'homid',
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'none', 'none', 'none', 'none', 'none', 'none'],
      },
    });
    const noRegen = resolveCombatRegeneration(homidInBreed, false);
    expect(noRegen.canRegenerate).toBe(false);
    expect(noRegen.healedLevels).toBe(0);

    // Homid in Glabro out of combat auto-heals 1 box
    const glabroOut = resolveCombatRegeneration(
      { ...homidInBreed, activeForm: 'glabro' },
      false
    );
    expect(glabroOut.canRegenerate).toBe(true);
    expect(glabroOut.rollResult).toBeNull();
    expect(glabroOut.healedLevels).toBe(1);
    expect(glabroOut.updatedChar.health.boxes[0]).toBe('none');

    // Metis in Crinos (their breed form!) DOES regenerate
    const metisCrinos = makeTestCharacter({
      breed: 'metis',
      activeForm: 'crinos',
      metisDeformity: 'Hairless albino hide',
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'none', 'none', 'none', 'none', 'none', 'none'],
      },
    });
    const metisInCombatSuccess = resolveCombatRegeneration(
      metisCrinos,
      true,
      seqRng([8, 2, 3, 4, 5, 6]) // Stamina 3 + 3 = 6 dice, diff 8 -> one 8 succeeds
    );
    expect(metisInCombatSuccess.canRegenerate).toBe(true);
    expect(metisInCombatSuccess.rollResult?.clampedDifficulty).toBe(8);
    expect(metisInCombatSuccess.healedLevels).toBe(1);
    expect(metisInCombatSuccess.updatedChar.health.boxes[0]).toBe('none');

    const metisInCombatFail = resolveCombatRegeneration(
      metisCrinos,
      true,
      seqRng([7, 7, 7, 7, 7, 7])
    );
    expect(metisInCombatFail.healedLevels).toBe(0);
    expect(metisInCombatFail.updatedChar.health.boxes[0]).toBe('lethal');
  });

  it('resolves Frenzy checks against canonical Moon Phase difficulties (4+ successes triggers)', () => {
    expect(MOON_BASE_FRENZY_DIFF).toEqual({
      new: 8,
      crescent: 7,
      half: 6,
      gibbous: 5,
      full: 4,
    });

    const garou = makeTestCharacter({
      auspice: 'philodox',
      rage: { permanent: 5, temporary: 5 },
    });

    const calm = resolveFrenzyCheck(garou, 'new', {}, seqRng([8, 8, 8, 5, 4]));
    expect(calm.rollResult.clampedDifficulty).toBe(8);
    expect(calm.rollResult.netSuccesses).toBe(3);
    expect(calm.triggered).toBe(false);
    expect(calm.thrallOfTheWyrm).toBe(false);
    expect(calm.updatedChar.inFrenzy).toBe(false);

    const berserk = resolveFrenzyCheck(garou, 'full', {}, seqRng([4, 5, 6, 9, 2]));
    expect(berserk.rollResult.clampedDifficulty).toBe(4);
    expect(berserk.rollResult.netSuccesses).toBe(4);
    expect(berserk.triggered).toBe(true);
    expect(berserk.thrallOfTheWyrm).toBe(false);
    expect(berserk.frenzyType).toBe('berserk');
    expect(berserk.updatedChar.inFrenzy).toBe(true);

    const fox = resolveFrenzyCheck(
      garou,
      'gibbous',
      { preferredType: 'fox' },
      seqRng([5, 6, 7, 8, 9])
    );
    expect(fox.triggered).toBe(true);
    expect(fox.thrallOfTheWyrm).toBe(false);
    expect(fox.frenzyType).toBe('fox');
    expect(fox.updatedChar.frenzyType).toBe('fox');

    // Auspice moon match (-1 diff) and Crinos form (-1 diff) are non-cumulative
    const ahrounHomid = makeTestCharacter({
      auspice: 'ahroun',
      activeForm: 'homid',
      rage: { permanent: 5, temporary: 5 },
    });
    const ahrounFull = resolveFrenzyCheck(ahrounHomid, 'full', {}, seqRng([3, 3, 3, 3, 2]));
    expect(ahrounFull.rollResult.clampedDifficulty).toBe(3);
    expect(ahrounFull.triggered).toBe(true);

    const ahrounCrinos = { ...ahrounHomid, activeForm: 'crinos' as const };
    const bothMatch = resolveFrenzyCheck(ahrounCrinos, 'full', {}, seqRng([3, 3, 3, 3, 2]));
    expect(bothMatch.rollResult.clampedDifficulty).toBe(3); // NOT 2 (non-cumulative)

    const philodoxCrinos = { ...garou, activeForm: 'crinos' as const };
    const crinosHalf = resolveFrenzyCheck(philodoxCrinos, 'full', {}, seqRng([3, 3, 3, 3, 2]));
    expect(crinosHalf.rollResult.clampedDifficulty).toBe(3);

    // Higher of permanent or temporary Rage is rolled
    const enraged = makeTestCharacter({
      auspice: 'philodox',
      rage: { permanent: 3, temporary: 6 },
    });
    const tempHigher = resolveFrenzyCheck(
      enraged,
      'gibbous',
      { preferredType: 'fox' },
      seqRng([8, 8, 8, 8, 2, 2])
    );
    expect(tempHigher.rollResult.effectivePool).toBe(6);
    expect(tempHigher.triggered).toBe(true);
    expect(tempHigher.frenzyType).toBe('fox');

    // 6+ net successes triggers Thrall of the Wyrm and forces 'berserk' even if 'fox' preferred
    const thrall = resolveFrenzyCheck(
      enraged,
      'gibbous',
      { preferredType: 'fox' },
      seqRng([8, 8, 8, 8, 8, 8])
    );
    expect(thrall.rollResult.netSuccesses).toBe(6);
    expect(thrall.triggered).toBe(true);
    expect(thrall.thrallOfTheWyrm).toBe(true);
    expect(thrall.frenzyType).toBe('berserk');
    expect(thrall.updatedChar.frenzyType).toBe('berserk');
  });
});
