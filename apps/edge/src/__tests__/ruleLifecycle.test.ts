import { describe, expect, it } from 'vitest';
import { createBlankUserCharacterSheet, getSheetModifierSources, ITEM_MODIFIER_RULES } from '@w20-vtt/core';
import { activationCosts, rollRuleActivation } from '../ruleLifecycle';

describe('fetish and talen activation', () => {
  it('requires a Gnosis roll for a talen and allows it without attunement', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'sheet', ownerDiscordId: 'owner' });
    sheet.fetishes = [{ id: 'arrow', name: 'Bane Arrows', ruleId: 'talen-bane-arrows',
      level: 0, gnosisRating: 4, isAttuned: false, power: '' }];
    const source = getSheetModifierSources(sheet).find((entry) => entry.id === 'arrow')!;
    const rule = ITEM_MODIFIER_RULES['talen-bane-arrows'];
    expect(() => activationCosts(sheet, source, rule, true)).toThrow('requires a Gnosis roll');
    expect(activationCosts(sheet, source, rule)).toEqual({ gnosis: 0, rage: 0, willpower: 0 });
    expect(rollRuleActivation(sheet, source, rule, {}, false, () => 9)?.clampedDifficulty).toBe(4);
  });
});
