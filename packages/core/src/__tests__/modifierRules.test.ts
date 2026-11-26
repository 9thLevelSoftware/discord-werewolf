import { describe, expect, it } from 'vitest';
import { computeEffectiveCharacterStats, resolveCharacterRuleRoll } from '../forms';
import { applyRuleValue, evaluateModifierRules } from '../modifierRules';
import {
  computeUserSheetStats,
  createBlankUserCharacterSheet,
  reconcileSheetRuleHealth,
  resolveSheetShortcut,
} from '../userCharacterSheet';
import type { ModifierRule, RuleSource } from '../ruleTypes';
import { resolveW20DicePool } from '../diceResolver';
import {
  computeActorMovement,
  getRuleResultTriggers,
  resolveRuleShift,
  resolveRuleDamageType,
  resolveIncomingRuleDamage,
} from '../ruleActions';
import { makeTestCharacter } from './testHelpers';

const rule: ModifierRule = {
  id: 'custom-test',
  name: 'Documented test rule',
  source: { book: 'Chronicle', page: 2 },
  effects: [{ target: 'attribute:strength', operation: 'add', value: 2 }],
};
const sheet = () =>
  createBlankUserCharacterSheet({ id: 'sheet-test', ownerDiscordId: 'user-test', now: 1 });
const shortcut = {
  id: 'test-roll',
  name: 'Strength test',
  source: { kind: 'trait_combo' as const, attribute: 'strength' as const },
  difficulty: 6,
  rageDiceCount: 0,
  applyWoundPenalty: true,
  isSecretRoll: false,
};

describe('documented source modifiers', () => {
  it('combines form and source changes without changing purchased dots', () => {
    const original = sheet();
    original.activeForm = 'crinos';
    original.otherTraits = [{ id: 'custom', name: rule.name, dots: 1, customRule: rule }];
    const stats = computeUserSheetStats(original);
    expect(stats.effectiveAttributes.strength).toBe(original.baseAttributes.strength + 6);
    expect(stats.effectiveAttributes.appearance).toBe(0);
    expect(original.baseAttributes.strength).toBe(1);
    expect(resolveSheetShortcut(original, shortcut).rawPool).toBe(
      stats.effectiveAttributes.strength
    );
  });

  it('applies contextual effects and retains unresolved circumstances', () => {
    const original = sheet();
    original.otherTraits = [
      {
        id: 'custom',
        name: rule.name,
        dots: 1,
        customRule: {
          ...rule,
          effects: [
            {
              target: 'difficulty',
              operation: 'add',
              value: -2,
              when: ['attribute:strength', 'action:lifting'],
            },
          ],
        },
      },
    ];
    expect(resolveSheetShortcut(original, shortcut).difficulty).toBe(6);
    expect(resolveSheetShortcut(original, shortcut).pending[0].reasons).toContain('action:lifting');
    expect(resolveSheetShortcut(original, shortcut, { tags: ['action:lifting'] }).difficulty).toBe(
      4
    );
    expect(
      resolveSheetShortcut(original, {
        ...shortcut,
        source: { kind: 'trait_combo', attribute: 'wits' },
      }).pending
    ).toEqual([]);
  });

  it('uses dot ratings as quantities and deduplicates repeated nonstacking rules', () => {
    const sources: RuleSource[] = [1, 2].map((dots) => ({
      id: `source-${dots}`,
      name: rule.name,
      dots,
      customRule: {
        ...rule,
        effects: [{ target: 'pool', operation: 'add', value: 'dots', stackingKey: 'same-bonus' }],
      },
    }));
    expect(applyRuleValue(evaluateModifierRules(sources, { activeForm: 'homid' }), 'pool', 3)).toBe(
      5
    );
  });

  it('requires activated instances and expires bounded effects', () => {
    const source: RuleSource = {
      id: 'gift',
      name: rule.name,
      customRule: {
        ...rule,
        effects: [{ target: 'pool', operation: 'add', value: 'successes', duration: 'scene' }],
      },
    };
    const actor = {
      activeForm: 'homid' as const,
      activeRuleEffects: [
        {
          id: 'effect',
          sourceId: 'gift',
          ruleId: rule.id,
          successes: 3,
          duration: 'scene',
          remainingRounds: 1,
        },
      ],
    };
    expect(
      applyRuleValue(evaluateModifierRules([source], { activeForm: 'homid' }), 'pool', 3)
    ).toBe(3);
    expect(applyRuleValue(evaluateModifierRules([source], actor), 'pool', 3)).toBe(6);
    actor.activeRuleEffects[0].remainingRounds = 0;
    expect(applyRuleValue(evaluateModifierRules([source], actor), 'pool', 3)).toBe(3);
  });

  it('keeps old Huge Size boxes single and preserves damage on removal', () => {
    const original = sheet();
    original.otherTraits = [{ id: 'legacy', name: 'Huge Size (Merit)', dots: 4, kind: 'merit' }];
    original.health = { bonusBruisedBoxes: 1, boxes: Array(8).fill('none') };
    const reconciled = reconcileSheetRuleHealth(original);
    expect(reconciled.health.boxes).toHaveLength(8);
    expect(reconciled.ruleHealthBonus).toBe(1);
    const removed = reconcileSheetRuleHealth({ ...reconciled, otherTraits: [] }, reconciled);
    expect(removed.health.boxes).toHaveLength(7);
    const wounded = reconcileSheetRuleHealth(
      {
        ...reconciled,
        otherTraits: [],
        health: { bonusBruisedBoxes: 1, boxes: Array(8).fill('lethal') },
      },
      reconciled
    );
    expect(wounded.health.boxes.filter((box) => box === 'lethal')).toHaveLength(8);
    const healed = reconcileSheetRuleHealth({
      ...wounded,
      health: {
        ...wounded.health,
        boxes: ['lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'none', 'none'],
      },
    });
    expect(healed.health.boxes).toHaveLength(7);
  });

  it('uses the same passive and contextual rules on campaign characters', () => {
    const char = makeTestCharacter({
      meritsFlaws: [
        {
          id: 'trait',
          name: rule.name,
          kind: 'merit',
          pointValue: 1,
          customRule: {
            ...rule,
            effects: [
              ...rule.effects,
              { target: 'pool', operation: 'add', value: 2, when: ['attribute:strength'] },
            ],
          },
        },
      ],
    });
    expect(computeEffectiveCharacterStats(char).effectiveAttributes.strength).toBe(5);
    expect(
      resolveCharacterRuleRoll(char, { attribute: 'strength', pool: 5, difficulty: 6 }).pool
    ).toBe(7);
  });

  it('applies received shared effects from their recorded source snapshot', () => {
    const receivedRule: ModifierRule = {
      ...rule,
      effects: [
        {
          target: 'ability:medicine',
          operation: 'add',
          value: 3,
          duration: 'assigned pack trait',
          recipient: 'shared',
        },
      ],
    };
    const char = makeTestCharacter({
      activeRuleEffects: [
        {
          id: 'received',
          sourceId: 'other-character-totem',
          ruleId: rule.id,
          rule: receivedRule,
          duration: 'assigned pack trait',
          recipient: 'shared',
        },
      ],
    });
    expect(computeEffectiveCharacterStats(char).effectiveAbilities.medicine).toBe(3);
  });
  it('applies automatic outcomes and botch cancellation through the normal dice resolver', () => {
    const modifiers = evaluateModifierRules(
      [
        {
          id: 'result',
          name: 'Result rule',
          customRule: {
            ...rule,
            effects: [
              { target: 'roll:automatic_successes', operation: 'add', value: 2 },
              { target: 'botch:negate_dice', operation: 'add', value: 1 },
            ],
          },
        },
      ],
      { activeForm: 'homid' }
    ).modifiers;
    const result = resolveW20DicePool(
      { label: 'Modified roll', basePool: 1, ruleModifiers: modifiers },
      () => 1
    );
    expect(result.netSuccesses).toBe(2);
    expect(result.onesRolled).toBe(0);
    expect(result.isBotch).toBe(false);
  });

  it('retains passive and activated parts of the same rule together', () => {
    const source: RuleSource = {
      id: 'hybrid',
      name: 'Hybrid',
      customRule: {
        ...rule,
        effects: [
          { target: 'initiative', operation: 'add', value: 10 },
          { target: 'initiative', operation: 'add', value: 10, duration: 'next-roll' },
        ],
      },
    };
    const evaluated = evaluateModifierRules([source], {
      activeForm: 'homid',
      activeRuleEffects: [
        {
          id: 'active',
          sourceId: 'hybrid',
          ruleId: rule.id,
          duration: 'next-roll',
        },
      ],
    });
    expect(applyRuleValue(evaluated, 'initiative', 6)).toBe(26);
  });

  it('applies Monstrous after Fair Glabro removes form penalties', () => {
    const original = sheet();
    original.activeForm = 'glabro';
    original.otherTraits = [
      { id: 'legacy-fair', name: 'Fair Glabro', dots: 2, kind: 'merit' },
      { id: 'legacy-monstrous', name: 'Monstrous', dots: 3, kind: 'flaw' },
    ];
    expect(computeUserSheetStats(original).effectiveAttributes.appearance).toBe(0);
    expect(computeUserSheetStats(original).effectiveAttributes.manipulation).toBe(
      original.baseAttributes.manipulation
    );
  });

  it('resolves legacy rule names within the original source category', () => {
    const original = sheet();
    original.backgrounds = [{ id: 'custom-background', name: 'Huge Size', dots: 4 }];
    expect(computeUserSheetStats(original).health.boxes).toHaveLength(7);
  });

  it('applies wound multipliers once while resolving shortcuts', () => {
    const original = sheet();
    original.health.boxes = ['lethal', 'lethal', 'none', 'none', 'none', 'none', 'none'];
    original.otherTraits = [
      {
        id: 'pain',
        name: 'Pain',
        dots: 1,
        customRule: {
          ...rule,
          effects: [{ target: 'wound:penalty', operation: 'multiply', value: 2 }],
        },
      },
    ];
    expect(resolveSheetShortcut(original, shortcut).woundPenalty).toBe(-2);
  });

  it('removes only the named penalty covered by a trait', () => {
    const original = sheet();
    original.otherTraits = [{ id: 'focus', name: 'Concentration', kind: 'merit', dots: 1 }];
    const resolved = resolveSheetShortcut(original, shortcut, {
      penalties: [
        { key: 'distraction', pool: -2, difficulty: 1 },
        { key: 'off_hand', pool: -1, difficulty: 1 },
      ],
    });
    expect(resolved.rawPool).toBe(0);
    expect(resolved.difficulty).toBe(7);
  });

  it('calculates form movement and applies movement flaws and wound caps', () => {
    const original = sheet();
    original.activeForm = 'lupus';
    original.otherTraits = [{ id: 'short', name: 'Short', kind: 'flaw', dots: 1 }];
    const movement = computeActorMovement(original);
    expect(movement.walk).toBe(14);
    expect(movement.run).toBe(
      20 + 3 * computeUserSheetStats(original).effectiveAttributes.dexterity
    );
    original.health.boxes = ['lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'none', 'none'];
    expect(computeActorMovement(original).run).toBe(3);
  });

  it('applies Metamorph successes and gates partial transformation', () => {
    const original = sheet();
    original.otherTraits = [{ id: 'metamorph', name: 'Metamorph', kind: 'merit', dots: 7 }];
    const shift = resolveRuleShift(original, {
      targetForm: 'crinos',
      method: 'instant_rage_spend',
    });
    expect(shift.rageCost).toBe(0);
    expect(shift.automaticSuccesses).toBe(5);
    original.otherTraits.push({
      id: 'no-partial',
      name: 'No Partial Transformation',
      kind: 'flaw',
      dots: 1,
    });
    expect(
      resolveRuleShift(original, {
        targetForm: 'crinos',
        method: 'roll_primal_urge',
        partial: true,
      }).allowed
    ).toBe(false);
  });

  it('requires named input choices and supports multi-input stat transfers', () => {
    const original = sheet();
    original.otherTraits = [
      {
        id: 'transfer',
        name: 'Transfer',
        dots: 1,
        customRule: {
          ...rule,
          choiceFields: [
            { key: 'from', label: 'From', kind: 'attribute' },
            { key: 'to', label: 'To', kind: 'attribute' },
            { key: 'dots', label: 'Dots', kind: 'number', min: 1, max: 2 },
          ],
          effects: [
            {
              target: 'attribute:$choices.from',
              operation: 'add',
              value: { per: 'choice', choiceKey: 'dots', factor: -1 },
            },
            {
              target: 'attribute:$choices.to',
              operation: 'add',
              value: { per: 'choice', choiceKey: 'dots' },
            },
          ],
        },
        ruleChoices: { from: 'strength', to: 'dexterity', dots: 1 },
      },
    ];
    expect(computeUserSheetStats(original).effectiveAttributes.dexterity).toBe(2);
  });

  it('reports limited Lucky rerolls and qualifying Self-Confident refunds', () => {
    const original = sheet();
    original.otherTraits = [
      { id: 'lucky', name: 'Lucky', kind: 'merit', dots: 3 },
      { id: 'confident', name: 'Self-Confident', kind: 'merit', dots: 5 },
    ];
    const resolved = resolveSheetShortcut(original, shortcut);
    const result = resolveW20DicePool(
      { label: 'Test', basePool: 1, spendWillpower: true, ruleModifiers: resolved.modifiers },
      () => 8
    );
    expect(
      getRuleResultTriggers(result, resolved.modifiers, { spentWillpower: true }).refundWillpower
    ).toBe(true);
    const failed = resolveW20DicePool(
      { label: 'Failed test', basePool: 1, ruleModifiers: resolved.modifiers },
      () => 3
    );
    expect(getRuleResultTriggers(failed, resolved.modifiers).rerollsAvailable).toBe(3);
    expect(getRuleResultTriggers(failed, resolved.modifiers).canReroll).toBe(true);
  });

  it('combines received snapshots with different effect durations', () => {
    const original = sheet();
    const first: ModifierRule = {
      ...rule,
      effects: [{ target: 'attribute:strength', operation: 'add', value: 2, duration: 'scene' }],
    };
    const second: ModifierRule = {
      ...rule,
      effects: [{ target: 'initiative', operation: 'add', value: 10, duration: 'turn' }],
    };
    original.activeRuleEffects = [
      { id: 'scene', sourceId: 'other:gift', ruleId: rule.id, rule: first, duration: 'scene' },
      { id: 'turn', sourceId: 'other:gift', ruleId: rule.id, rule: second, duration: 'turn' },
    ];
    const stats = computeUserSheetStats(original);
    expect(stats.effectiveAttributes.strength).toBe(3);
    expect(stats.ruleInitiativeBonus).toBe(10);
  });

  it('keeps separate targets from named choices and stacks distinct silver items', () => {
    const original = sheet();
    original.gnosis = { permanent: 8, temporary: 8 };
    original.fetishes = [
      {
        id: 'grand-one',
        name: 'Grand Klaive',
        level: 5,
        gnosisRating: 7,
        power: '',
        isSilver: true,
      },
      {
        id: 'grand-two',
        name: 'Grand Klaive',
        level: 5,
        gnosisRating: 7,
        power: '',
        isSilver: true,
      },
    ];
    expect(computeUserSheetStats(original).effectiveGnosisPool).toBe(4);
  });

  it('temporarily suppresses totem and supernatural benefits without changing ownership', () => {
    const original = sheet();
    original.packTotem = 'Bear';
    original.otherTraits = [{ id: 'leader', name: 'Natural Leader', kind: 'merit', dots: 1 }];
    const suppression: ModifierRule = {
      ...rule,
      id: 'suppression',
      effects: [{ target: 'source:supernatural', operation: 'deny', value: 1, duration: 'turn' }],
    };
    original.activeRuleEffects = [
      {
        id: 'suppress',
        sourceId: 'enemy:gift',
        ruleId: suppression.id,
        rule: suppression,
        duration: 'turn',
      },
    ];
    const suppressed = computeUserSheetStats(original);
    expect(suppressed.effectiveAttributes.strength).toBe(original.baseAttributes.strength);
    expect(
      resolveRuleShift(original, { targetForm: 'crinos', method: 'roll_primal_urge' }).allowed
    ).toBe(false);
    expect(original.packTotem).toBe('Bear');
    original.activeRuleEffects = [];
    expect(computeUserSheetStats(original).effectiveAttributes.strength).toBe(
      original.baseAttributes.strength + 1
    );
  });

  it('reports special movement with explicit units and derives Hispo swimming speed', () => {
    const original = sheet();
    original.otherTraits = [
      {
        id: 'movement',
        name: 'Movement',
        dots: 1,
        customRule: {
          ...rule,
          effects: [
            {
              target: 'movement:swim',
              operation: 'set',
              value: { per: 'trait', trait: 'movement:hispo-run' },
            },
            { target: 'movement:flight-mph', operation: 'set', value: 50 },
          ],
        },
      },
    ];
    const movement = computeActorMovement(original);
    expect(movement.special).toContainEqual({ label: 'Flight', value: 50, unit: 'mph' });
    expect(movement.special).toContainEqual({
      label: 'Swimming',
      value: (20 + 3 * 3) * 1.5,
      unit: 'yards/turn',
    });
  });

  it('converts outgoing damage to bashing and applies incoming fire immunity', () => {
    const original = sheet();
    original.otherTraits = [
      {
        id: 'damage-rule',
        name: 'Damage rule',
        dots: 1,
        customRule: {
          ...rule,
          effects: [
            { target: 'damage:type:bashing', operation: 'set', value: 1, when: ['roll:damage'] },
            { target: 'damage:natural-fire', operation: 'ignore', value: 1 },
            { target: 'damage:type:bashing', operation: 'set', value: 1, when: ['damage:fire'] },
          ],
        },
      },
    ];
    const outgoing = resolveSheetShortcut(original, {
      ...shortcut,
      source: { kind: 'natural_brawl_damage', maneuver: 'punch' },
    });
    expect(resolveRuleDamageType('aggravated', outgoing.modifiers)).toBe('bashing');
    expect(
      resolveIncomingRuleDamage(original, 3, 'aggravated', { tags: ['damage:natural-fire'] })
    ).toMatchObject({ levels: 0, type: 'bashing' });
    expect(resolveIncomingRuleDamage(original, 3, 'lethal')).toMatchObject({
      levels: 3,
      type: 'lethal',
    });
  });
});
