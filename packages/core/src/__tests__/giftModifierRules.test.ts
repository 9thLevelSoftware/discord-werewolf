import { describe, expect, it } from 'vitest';
import { W20_GIFT_CATALOG } from '../catalog/gifts.data';
import { GIFT_MODIFIER_COVERAGE, GIFT_MODIFIER_RULES } from '../catalog/giftModifierRules';
import { applyRuleValue, evaluateModifierRules } from '../modifierRules';
import type { ActiveRuleInstance, RuleContext, RuleSource } from '../ruleTypes';

function giftSource(slug: string): RuleSource {
  const gift = W20_GIFT_CATALOG.find((candidate) => candidate.slug === slug);
  if (!gift) throw new Error(`Missing catalog Gift ${slug}`);
  return { id: gift.id, name: gift.name, ruleId: gift.id };
}

function activated(
  source: RuleSource,
  successes = 3,
  duration = GIFT_MODIFIER_RULES[source.ruleId!].activation?.duration ?? 'scene'
): ActiveRuleInstance {
  const rule = GIFT_MODIFIER_RULES[source.ruleId!];
  return {
    id: `test-activation:${duration}`,
    sourceId: source.id,
    ruleId: source.ruleId!,
    rule: { ...rule, effects: rule.effects.filter((effect) => effect.duration === duration) },
    duration,
    successes,
    recipient: 'self',
  };
}

function evaluateGift(
  slug: string,
  context: RuleContext,
  active = true,
  form: 'homid' | 'lupus' = 'homid'
) {
  const source = giftSource(slug);
  const durations = new Set(
    GIFT_MODIFIER_RULES[source.ruleId!].effects.flatMap((effect) =>
      effect.duration ? [effect.duration] : []
    )
  );
  return evaluateModifierRules(
    [source],
    {
      activeForm: form,
      activeRuleEffects: active
        ? [...durations].map((duration) => activated(source, 3, duration))
        : [],
    },
    context
  );
}

describe('source-backed Gift modifiers', () => {
  it('records a source-bearing disposition for every catalog Gift and preserves the catalog IDs', () => {
    expect(GIFT_MODIFIER_COVERAGE.map((entry) => entry.id)).toEqual(
      W20_GIFT_CATALOG.map((entry) => entry.id)
    );
    expect(GIFT_MODIFIER_COVERAGE.filter((entry) => entry.disposition === 'unreviewed')).toEqual(
      []
    );
    expect(Object.keys(GIFT_MODIFIER_RULES).length).toBeGreaterThan(150);
    for (const rule of Object.values(GIFT_MODIFIER_RULES)) {
      const catalogEntry = W20_GIFT_CATALOG.find((gift) => gift.id === rule.id);
      expect(catalogEntry).toBeDefined();
      expect(rule.source).toEqual(catalogEntry!.source);
      expect(rule.effects.length).toBeGreaterThan(0);
    }
  });

  it('adds Razor Claws damage and reduces attack difficulty only after activation', () => {
    const inactive = evaluateGift('razor-claws', { rollKind: 'attack', maneuver: 'claw' }, false);
    expect(applyRuleValue(inactive, 'difficulty', 6)).toBe(6);

    const attack = evaluateGift('razor-claws', { rollKind: 'attack', maneuver: 'claw' });
    expect(applyRuleValue(attack, 'difficulty', 6)).toBe(5);
    expect(applyRuleValue(attack, 'pool', 6)).toBe(6);

    const damage = evaluateGift('razor-claws', { rollKind: 'damage', maneuver: 'claw' });
    expect(applyRuleValue(damage, 'pool', 6)).toBe(8);
    const bite = evaluateGift('razor-claws', { rollKind: 'damage', maneuver: 'bite' });
    expect(applyRuleValue(bite, 'pool', 6)).toBe(6);
  });

  it('keeps Spirit of the Fray permanent and optional initiative bonuses separate', () => {
    const permanent = evaluateGift('spirit-of-the-fray', { rollKind: 'initiative' }, false);
    expect(applyRuleValue(permanent, 'initiative', 5)).toBe(15);
    const enhanced = evaluateGift('spirit-of-the-fray', { rollKind: 'initiative' });
    expect(applyRuleValue(enhanced, 'initiative', 5)).toBe(25);
    expect(
      enhanced.modifiers.filter((effect) => effect.target === 'action:rage-extra')
    ).toHaveLength(1);
    expect(
      permanent.modifiers.filter((effect) => effect.target === 'action:rage-extra')
    ).toHaveLength(0);
  });

  it('uses the form-specific Heightened Senses reduction and adds animal Primal-Urge dice', () => {
    const homid = evaluateGift('heightened-senses', {
      attribute: 'perception',
      ability: 'primal_urge',
    });
    expect(applyRuleValue(homid, 'difficulty', 6)).toBe(4);
    expect(applyRuleValue(homid, 'pool', 6)).toBe(6);
    const lupus = evaluateGift(
      'heightened-senses',
      { attribute: 'perception', ability: 'primal_urge' },
      true,
      'lupus'
    );
    expect(applyRuleValue(lupus, 'difficulty', 6)).toBe(3);
    expect(applyRuleValue(lupus, 'pool', 6)).toBe(7);
    expect(GIFT_MODIFIER_RULES[giftSource('heightened-senses').id].effects[0].stackingKey).toBe(
      'perception-form'
    );
  });

  it('applies both benefits and drawbacks of Steel Fur in its allowed forms', () => {
    const source = giftSource('steel-fur');
    const actor = { activeForm: 'lupus' as const, activeRuleEffects: [activated(source, 4)] };
    const soak = evaluateModifierRules([source], actor, { rollKind: 'soak' });
    expect(applyRuleValue(soak, 'pool', 5)).toBe(9);
    const dexterity = evaluateModifierRules([source], actor, {
      attribute: 'dexterity',
      ability: 'athletics',
    });
    expect(applyRuleValue(dexterity, 'difficulty', 6)).toBe(7);
    const otherTribe = evaluateModifierRules([source], actor, {
      attribute: 'charisma',
      ability: 'leadership',
    });
    expect(applyRuleValue(otherTribe, 'difficulty', 6)).toBe(7);
    const glassWalker = evaluateModifierRules([source], actor, {
      attribute: 'charisma',
      tags: ['target:glass-walker'],
    });
    expect(applyRuleValue(glassWalker, 'difficulty', 6)).toBe(6);
    const homid = evaluateGift('steel-fur', { rollKind: 'soak' });
    expect(applyRuleValue(homid, 'pool', 5)).toBe(5);
  });

  it('applies a single defensive attack modifier to a selected protected target', () => {
    const attack = evaluateGift('preternatural-awareness', {
      rollKind: 'attack',
      authoritativeTags: ['target:source'],
    });
    expect(applyRuleValue(attack, 'target:pool', 8)).toBe(5);
    expect(applyRuleValue(attack, 'pool', 8)).toBe(8);
    const unrelatedAttack = evaluateGift('preternatural-awareness', { rollKind: 'attack' });
    expect(applyRuleValue(unrelatedAttack, 'target:pool', 8)).toBe(8);
  });

  it('doubles Strength for Might of Thor while keeping its explicit dual-resource cost', () => {
    const evaluated = evaluateGift('might-of-thor', {});
    expect(applyRuleValue(evaluated, 'attribute:strength', 7)).toBe(14);
    expect(GIFT_MODIFIER_RULES[giftSource('might-of-thor').id].activation?.cost).toEqual({
      gnosis: 1,
      rage: 1,
    });
  });

  it('charges converted Rage through the activation cost without a second Rage deduction', () => {
    const source = giftSource('inner-strength');
    const rule = GIFT_MODIFIER_RULES[source.id];
    expect(rule.activation?.variableCost).toEqual({
      choiceKey: 'points',
      resource: 'rage',
      minimum: 0,
    });
    expect(rule.activation?.allocation?.limit).toBe('successes');
    const evaluated = evaluateModifierRules([source], {
      activeForm: 'homid',
      activeRuleEffects: [{ ...activated(source, 3), ruleChoices: { points: 2 } }],
    });
    expect(applyRuleValue(evaluated, 'resource:willpower', 0)).toBe(2);
    expect(evaluated.modifiers.some((effect) => effect.target === 'resource:rage')).toBe(false);
  });

  it('moves Body Shift dots between the selected attributes while preserving their sum', () => {
    const source = giftSource('body-shift');
    const evaluated = evaluateModifierRules([source], {
      activeForm: 'homid',
      activeRuleEffects: [
        { ...activated(source, 4), ruleChoices: { from: 'stamina', to: 'strength', dots: 2 } },
      ],
    });
    const strength = applyRuleValue(evaluated, 'attribute:strength', 3);
    const stamina = applyRuleValue(evaluated, 'attribute:stamina', 4);
    expect(strength).toBe(5);
    expect(stamina).toBe(2);
    expect(strength + stamina).toBe(7);
  });

  it('uses linear size increases and limits Spriggan growth to three times normal size', () => {
    const source = giftSource('gift-of-the-spriggan');
    const evaluated = evaluateModifierRules(
      [source],
      {
        activeForm: 'homid',
        activeRuleEffects: [{ ...activated(source), ruleChoices: { sizeIncreases: 2 } }],
      },
      { attribute: 'strength', tags: ['situation:grown'] }
    );
    expect(applyRuleValue(evaluated, 'pool', 5)).toBe(11);
    expect(
      GIFT_MODIFIER_RULES[source.id].choiceFields?.find((field) => field.key === 'sizeIncreases')
        ?.max
    ).toBe(2);
  });

  it('grants Halo of the Sun damage dice in wolf forms and aggravated conversion in Homid', () => {
    const wolf = evaluateGift(
      'halo-of-the-sun',
      { rollKind: 'damage', maneuver: 'bite' },
      true,
      'lupus'
    );
    expect(applyRuleValue(wolf, 'pool', 7)).toBe(9);
    expect(applyRuleValue(wolf, 'damage:type:aggravated', 0)).toBe(0);
    const homid = evaluateGift('halo-of-the-sun', { rollKind: 'damage', maneuver: 'punch' });
    expect(applyRuleValue(homid, 'pool', 4)).toBe(6);
    expect(applyRuleValue(homid, 'damage:type:aggravated', 0)).toBe(1);
  });

  it('excludes native Banes from Fangs of Judgment while including corrupted creatures', () => {
    const corrupted = evaluateGift('fangs-of-judgment', {
      rollKind: 'damage',
      maneuver: 'bite',
      tags: ['target:wyrm-corrupted'],
    });
    expect(applyRuleValue(corrupted, 'pool', 5)).toBe(7);
    const bane = evaluateGift('fangs-of-judgment', {
      rollKind: 'damage',
      maneuver: 'bite',
      tags: ['target:wyrm-corrupted', 'target:native-bane'],
    });
    expect(applyRuleValue(bane, 'pool', 5)).toBe(5);
  });

  it('keeps Heart of the Mountain soak separate from automatically successful Stamina tasks', () => {
    const endurance = evaluateGift('heart-of-the-mountain', {
      attribute: 'stamina',
      ability: 'athletics',
    });
    expect(applyRuleValue(endurance, 'outcome:success', 0)).toBe(1);
    const soak = evaluateGift('heart-of-the-mountain', { attribute: 'stamina', rollKind: 'soak' });
    expect(applyRuleValue(soak, 'outcome:success', 0)).toBe(0);
    expect(applyRuleValue(soak, 'soak:minimum-successes', 0)).toBe(1);
  });

  it('binds a studied-opponent bonus to that opponent across later rolls', () => {
    const source = giftSource('fatal-flaw');
    const actor = {
      activeForm: 'homid' as const,
      activeRuleEffects: [{ ...activated(source), boundTargetIds: ['studied-opponent'] }],
    };
    const studied = evaluateModifierRules([source], actor, {
      rollKind: 'damage',
      targetIds: ['studied-opponent'],
      tags: ['target:studied'],
    });
    expect(applyRuleValue(studied, 'pool', 5)).toBe(6);
    const other = evaluateModifierRules([source], actor, {
      rollKind: 'damage',
      targetIds: ['other-opponent'],
      tags: ['target:studied'],
    });
    expect(applyRuleValue(other, 'pool', 5)).toBe(5);
  });

  it('shares verbatim referenced mechanics while retaining the referencing Gift provenance', () => {
    const icyClaws = GIFT_MODIFIER_RULES[giftSource('claws-of-frozen-death').id];
    const northernFangs = GIFT_MODIFIER_RULES[giftSource('fangs-of-the-north').id];
    expect(icyClaws.effects).toEqual(northernFangs.effects);
    expect(icyClaws.id).not.toBe(northernFangs.id);
    expect(icyClaws.source.page).toBe(200);
    expect(northernFangs.source.page).toBe(180);
  });
});
