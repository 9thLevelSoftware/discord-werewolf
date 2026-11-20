import { describe, expect, it } from 'vitest';
import {
  createPhysicsSeed,
  resolveW20DicePool,
  rollCsprngD10,
  validateResourceSpend,
} from '../diceResolver';
import { seqRng } from './testHelpers';

describe('W20 d10 Dice Pool Resolver & Golden Rule', () => {
  it('generates valid CSPRNG d10 values (1..10) and 16-char hex physics seeds', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollCsprngD10();
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
    const seed = createPhysicsSeed();
    expect(seed).toMatch(/^[0-9a-f]{16}$/);
  });

  it('clamps difficulty to [2, 10] and adds +1 difficulty for untrained skills', () => {
    const lowDiff = resolveW20DicePool(
      {
        label: 'Lupus Scent',
        basePool: 3,
        baseDifficulty: 3,
        difficultyModifier: -3,
      },
      seqRng([2, 1, 5])
    );
    expect(lowDiff.clampedDifficulty).toBe(2);
    // 2 and 5 succeed (2 raw), minus one 1 = 1 net
    expect(lowDiff.netSuccesses).toBe(1);

    const highDiff = resolveW20DicePool(
      {
        label: 'Untrained Computer',
        basePool: 2,
        baseDifficulty: 10,
        isUntrainedSkill: true,
      },
      seqRng([10, 9])
    );
    expect(highDiff.clampedDifficulty).toBe(10);
    expect(highDiff.netSuccesses).toBe(1);

    const untrainedMod = resolveW20DicePool(
      {
        label: 'Untrained Drive',
        basePool: 2,
        baseDifficulty: 6,
        isUntrainedSkill: true,
      },
      seqRng([6, 7])
    );
    expect(untrainedMod.clampedDifficulty).toBe(7);
    expect(untrainedMod.netSuccesses).toBe(1);
  });

  it('distinguishes True Botch from Failure when raw successes are canceled by 1s', () => {
    // True Botch: 0 raw successes and >= 1 ones and 0 automatic successes
    const botch = resolveW20DicePool(
      { label: 'Botch Test', basePool: 4, baseDifficulty: 6 },
      seqRng([5, 4, 2, 1])
    );
    expect(botch.rawSuccesses).toBe(0);
    expect(botch.onesRolled).toBe(1);
    expect(botch.isBotch).toBe(true);
    expect(botch.outcome).toBe('botch');

    // Canceled-to-0 Failure (NOT a Botch): 1 raw success canceled by 1s
    const canceledFailure = resolveW20DicePool(
      { label: 'Canceled Failure', basePool: 4, baseDifficulty: 6 },
      seqRng([8, 1, 1, 4])
    );
    expect(canceledFailure.rawSuccesses).toBe(1);
    expect(canceledFailure.onesRolled).toBe(2);
    expect(canceledFailure.netSuccesses).toBe(0);
    expect(canceledFailure.isBotch).toBe(false);
    expect(canceledFailure.outcome).toBe('failure');
  });

  it('prevents Botch and adds +1 uncancelable success when Willpower is spent', () => {
    const wpSave = resolveW20DicePool(
      {
        label: 'Willpower Save',
        basePool: 3,
        baseDifficulty: 8,
        spendWillpower: true,
      },
      seqRng([1, 1, 4])
    );
    expect(wpSave.rawSuccesses).toBe(0);
    expect(wpSave.onesRolled).toBe(2);
    expect(wpSave.automaticSuccesses).toBe(1);
    expect(wpSave.isBotch).toBe(false);
    expect(wpSave.netSuccesses).toBe(1);
    expect(wpSave.outcome).toBe('marginal');

    // Zero effective pool after wound penalties still yields Willpower automatic success
    const zeroPoolWp = resolveW20DicePool({
      label: 'Wounded Willpower',
      basePool: 3,
      woundPenalty: -5,
      spendWillpower: true,
    });
    expect(zeroPoolWp.effectivePool).toBe(0);
    expect(zeroPoolWp.netSuccesses).toBe(1);
    expect(zeroPoolWp.isBotch).toBe(false);
  });

  it('supports W20 specialty (10 = 2 successes) vs Revised exploding 10s (reroll 1s never cancel)', () => {
    const w20Spec = resolveW20DicePool(
      {
        label: 'W20 Specialty',
        basePool: 3,
        baseDifficulty: 6,
        hasApplicableSpecialty: true,
        specialtyMode: 'w20_double',
      },
      seqRng([10, 6, 1])
    );
    // raw: 2 (from 10) + 1 (from 6) = 3; minus 1 = 2 net
    expect(w20Spec.dice).toHaveLength(3);
    expect(w20Spec.rawSuccesses).toBe(3);
    expect(w20Spec.netSuccesses).toBe(2);
    expect(w20Spec.outcome).toBe('moderate');

    // Revised explode: 10 -> explodes 10 -> explodes 1 (1 on bonus die NEVER cancels!)
    const revisedSpec = resolveW20DicePool(
      {
        label: 'Revised Specialty',
        basePool: 2,
        baseDifficulty: 6,
        hasApplicableSpecialty: true,
        specialtyMode: 'revised_explode',
      },
      seqRng([10, 10, 1, 7])
    );
    // Base dice: 10 (1), 7 (1). Bonus dice: 10 (1), 1 (0, isOne: false). Total raw = 3, onesRolled = 0.
    expect(revisedSpec.dice).toHaveLength(4);
    expect(revisedSpec.dice[1].isBonusExplosionDie).toBe(true);
    expect(revisedSpec.dice[2].isBonusExplosionDie).toBe(true);
    expect(revisedSpec.dice[2].isOne).toBe(false);
    expect(revisedSpec.onesRolled).toBe(0);
    expect(revisedSpec.netSuccesses).toBe(3);
    expect(revisedSpec.outcome).toBe('complete');
  });

  it('classifies exceptional (4) and phenomenal (5+) outcomes and ignores wound penalties when requested', () => {
    const soak = resolveW20DicePool(
      {
        label: 'Soak',
        basePool: 5,
        woundPenalty: -5,
        applyWoundPenalty: false,
        baseDifficulty: 6,
      },
      seqRng([6, 7, 8, 9, 10])
    );
    expect(soak.effectivePool).toBe(5);
    expect(soak.netSuccesses).toBe(5);
    expect(soak.outcome).toBe('phenomenal');

    const four = resolveW20DicePool(
      { label: 'Exceptional', basePool: 4, baseDifficulty: 6 },
      seqRng([6, 7, 8, 9])
    );
    expect(four.outcome).toBe('exceptional');
  });

  it('enforces the W20 Golden Rule between Rage and Gnosis', () => {
    expect(
      validateResourceSpend({ hasSpentRageThisTurn: false, hasSpentGnosisThisTurn: false }, 'rage')
        .allowed
    ).toBe(true);

    const rageAfterGnosis = validateResourceSpend(
      { hasSpentRageThisTurn: false, hasSpentGnosisThisTurn: true },
      'rage'
    );
    expect(rageAfterGnosis.allowed).toBe(false);

    const gnosisAfterRage = validateResourceSpend(
      { hasSpentRageThisTurn: true, hasSpentGnosisThisTurn: false },
      'gnosis'
    );
    expect(gnosisAfterRage.allowed).toBe(false);
  });
});
