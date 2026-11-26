import { describe, expect, it } from 'vitest';
import { createBlankUserCharacterSheet, resolveSheetShortcut } from '../userCharacterSheet';
import type { ModifierRule } from '../ruleTypes';
import { ITEM_MODIFIER_RULES } from '../catalog/itemModifierRules';
import { resolveRuleDamageType } from '../ruleActions';

const weaponRule: ModifierRule = {
  id: 'documented-weapon',
  name: 'Documented weapon',
  source: { book: 'Chronicle', page: 1 },
  effects: [
    {
      target: 'weapon:strength_damage_bonus',
      operation: 'set',
      value: 2,
      when: ['item:selected', 'roll:damage'],
    },
    {
      target: 'pool',
      operation: 'add',
      value: 3,
      when: ['item:selected', 'roll:damage'],
      duration: 'scene',
    },
  ],
};
function makeSheet() {
  const sheet = createBlankUserCharacterSheet({ id: 'owner', ownerDiscordId: 'user', now: 1 });
  sheet.fetishes = ['first', 'second'].map((id) => ({
    id,
    name: 'Documented weapon',
    level: 1,
    gnosisRating: 5,
    power: '',
    customRule: weaponRule,
    carried: true,
  }));
  sheet.activeRuleEffects = [
    {
      id: 'activated',
      sourceId: 'owner:first',
      sourceItemId: 'first',
      sourceOwnerId: 'owner',
      sourceCarried: true,
      ruleId: weaponRule.id,
      rule: { ...weaponRule, effects: [weaponRule.effects[1]] },
      duration: 'scene',
    },
  ];
  return sheet;
}
const damageShortcut = {
  id: 'damage',
  name: 'Weapon Damage',
  source: { kind: 'static' as const, pool: 0 },
  ruleContext: {
    attribute: 'strength' as const,
    ability: 'melee',
    rollKind: 'damage',
    selectedItemId: 'first',
  },
  difficulty: 6,
  rageDiceCount: 0,
  applyWoundPenalty: false,
  isSecretRoll: false,
};

describe('activated equipment source identity', () => {
  it('applies a scoped activation to its owned physical weapon', () => {
    const sheet = makeSheet();
    expect(resolveSheetShortcut(sheet, damageShortcut).rawPool).toBe(6);
    expect(
      resolveSheetShortcut(sheet, {
        ...damageShortcut,
        ruleContext: { ...damageShortcut.ruleContext, selectedItemId: 'second' },
      }).rawPool
    ).toBe(3);
  });

  it('uses a Fang Dagger as a knife and applies activated aggravated damage without the attack skill penalty', () => {
    const sheet = makeSheet();
    const dagger = ITEM_MODIFIER_RULES['fetish-fang-dagger'];
    sheet.fetishes = [
      {
        id: 'first',
        name: 'Fang Dagger',
        ruleId: dagger.id,
        level: 3,
        gnosisRating: 6,
        power: '',
        carried: true,
      },
    ];
    sheet.activeRuleEffects = [];
    const dormant = resolveSheetShortcut(sheet, damageShortcut);
    expect(dormant.rawPool).toBe(2);
    expect(dormant.difficulty).toBe(6);
    expect(resolveRuleDamageType('lethal', dormant.modifiers)).toBe('lethal');
    sheet.activeRuleEffects = [
      {
        id: 'activation',
        sourceId: 'owner:first',
        sourceOwnerId: 'owner',
        sourceItemId: 'first',
        ruleId: dagger.id,
        duration: 'one damage roll',
        rule: { ...dagger, effects: dagger.effects.filter((e) => e.duration) },
      },
    ];
    const active = resolveSheetShortcut(sheet, damageShortcut);
    expect(
      active.modifiers.some((m) => m.target === 'damage:success_multiplier' && m.value === 2)
    ).toBe(true);
    expect(resolveRuleDamageType('lethal', active.modifiers)).toBe('aggravated');
  });

  it('prevents another owner sharing the same row ID from inheriting the item bonus', () => {
    const sheet = makeSheet();
    sheet.activeRuleEffects![0].sourceOwnerId = 'other-owner';
    expect(resolveSheetShortcut(sheet, damageShortcut).rawPool).toBe(3);
    expect(
      resolveSheetShortcut(sheet, {
        ...damageShortcut,
        ruleContext: { ...damageShortcut.ruleContext, selectedItemId: 'owner:first' },
      }).rawPool
    ).toBe(0);
  });

  it('uses current owned carry state ahead of a stale activation snapshot', () => {
    const sheet = makeSheet();
    sheet.fetishes[0].carried = false;
    expect(resolveSheetShortcut(sheet, damageShortcut).rawPool).toBe(0);
    sheet.fetishes[0].carried = true;
    expect(resolveSheetShortcut(sheet, damageShortcut).rawPool).toBe(6);
  });
});
