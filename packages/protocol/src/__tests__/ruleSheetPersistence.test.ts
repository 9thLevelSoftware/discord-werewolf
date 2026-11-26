import { describe, expect, it } from 'vitest';
import {
  createBlankUserCharacterSheet,
  GIFT_MODIFIER_RULES,
  ITEM_MODIFIER_RULES,
} from '@w20-vtt/core';
import { ModifierRuleSchema, RuleContextSchema } from '../ruleValidation';
import { parseClientEnvelope, W20UserCharacterSheetSchema } from '../validation';
import type { ClientCommand } from '../messages';

describe('rule data on the wire', () => {
  it('retains every authored rule field across JSON and validation', () => {
    const rules = [...Object.values(ITEM_MODIFIER_RULES), ...Object.values(GIFT_MODIFIER_RULES)];
    for (const rule of rules) {
      const serialized = JSON.parse(JSON.stringify(rule));
      const result = ModifierRuleSchema.safeParse(serialized);
      expect(result.success, rule.id + ': ' + (result.success ? '' : result.error.message)).toBe(
        true
      );
      if (result.success) expect(result.data, rule.id).toEqual(serialized);
    }
  });

  it('round-trips modifier commands and rejects out-of-range activation inputs', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'sheet', ownerDiscordId: 'owner' });
    const commands: ClientCommand[] = [
      { type: 'BIND_TABLE_SHEET', seatId: 'main', sheet },
      {
        type: 'PREVIEW_RULE_ROLL',
        seatId: 'main',
        sheetId: sheet.id,
        shortcut: {
          id: 'track',
          name: 'Tracking',
          source: { kind: 'static', pool: 3 },
          difficulty: 6,
          applyWoundPenalty: true,
          isSecretRoll: false,
          rageDiceCount: 0,
        },
        context: { targetIds: ['opponent'] },
      },
      {
        type: 'ACTIVATE_RULE',
        seatId: 'main',
        sourceEntryId: 'my-fate',
        ruleId: 'fate',
        referenceRollId: 'prior-result',
        targetIds: [],
        confirmedConditions: true,
      },
      { type: 'END_RULE_EFFECT', seatId: 'main', effectId: 'active' },
      { type: 'ADVANCE_RULE_CLOCK', unit: 'seconds', amount: 60 },
      {
        type: 'REROLL_RULE_ROLL',
        seatId: 'main',
        sheetId: sheet.id,
        ruleId: 'merit-lucky',
        rollId: 'last',
      },
      {
        type: 'APPLY_RULE_EVENT',
        seatId: 'main',
        event: 'renown_award',
        trait: 'honor',
        amount: 2,
      },
    ];
    const parse = (command: unknown) =>
      parseClientEnvelope(JSON.stringify({ reqId: 'check', sentAt: 1, expectedSeq: 0, command }));
    for (const command of commands) {
      const parsed = parse(command);
      expect(parsed.success, command.type).toBe(true);
      if (parsed.success) expect(parsed.data.command).toEqual(JSON.parse(JSON.stringify(command)));
    }
    expect(parse({ ...commands[2], activationDifficulty: 11 }).success).toBe(false);
    expect(parse({ ...commands[4], amount: -1 }).success).toBe(false);
  });

  it('keeps legacy sheets readable and retains source choices and effect reserves', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'legacy', ownerDiscordId: 'owner' });
    expect(W20UserCharacterSheetSchema.parse(sheet).baseAttributes).toEqual(sheet.baseAttributes);
    const rule =
      GIFT_MODIFIER_RULES[
        Object.keys(GIFT_MODIFIER_RULES).find(
          (key) => GIFT_MODIFIER_RULES[key].activation?.allocation?.consumeOnRoll
        )!
      ];
    const instance = {
      id: 'instance',
      sourceId: 'source-sheet:entry',
      sourceItemId: 'entry',
      sourceOwnerId: 'source-sheet',
      parentGrantId: 'shared-effect',
      grantedGift: {
        giftId: rule.id,
        sourceEntryId: 'owned-gift',
        name: rule.name,
        level: 1,
        rule,
      },
      sourceWorn: false,
      sourceCarried: true,
      sourceActive: true,
      ruleId: rule.id,
      rule,
      ruleChoices: { dice: 3 },
      duration: 'scene',
      remainingScenes: 1,
    };
    const restored = W20UserCharacterSheetSchema.parse({ ...sheet, activeRuleEffects: [instance] });
    expect(restored.activeRuleEffects?.[0]).toEqual(instance);
    const context = {
      effectChoices: { instance: { dice: 2 } },
      penalties: [{ key: 'off_hand', pool: -1 }],
      woundOverride: false,
    };
    expect(RuleContextSchema.parse({ ...context, authoritativeTags: ['form:crinos'] })).toEqual(
      context
    );
    expect(RuleContextSchema.safeParse({ penalties: [{ key: 'off_hand', pool: 8 }] }).success).toBe(
      false
    );
  });
});
