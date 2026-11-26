import { z } from 'zod';
import type { RuleContext, SheetShortcut, W20UserCharacterSheet } from '@w20-vtt/core';

/** Kept separate so the sheet and modifier schemas can be supplied without circular imports. */
export function createModifierCommandSchemas(
  sheetSchema: z.ZodType<W20UserCharacterSheet>,
  contextSchema: z.ZodType<RuleContext>,
  shortcutSchema: z.ZodType<SheetShortcut>
) {
  const seatId = z.string().min(1).max(80);
  const characterId = z.string().min(1).max(120);
  return [
    z.object({
      type: z.literal('APPLY_RULE_EVENT'),
      seatId: seatId.optional(),
      characterId: characterId.optional(),
      event: z.enum([
        'totem_acceptance',
        'story_start',
        'story_end',
        'session_start',
        'renown_award',
        'experience_award',
      ]),
      sourceEntryId: z.string().min(1).max(160).optional(),
      ruleId: z.string().min(1).max(160).optional(),
      amount: z.number().int().min(0).max(100).optional(),
      trait: z.enum(['honor', 'glory', 'wisdom']).optional(),
      context: contextSchema.optional(),
    }),
    z.object({
      type: z.literal('KEEP_ACTIVATION_RESULT'),
      seatId,
      sheetId: characterId,
      rollId: z.string().min(1).max(160),
    }),
    z.object({
      type: z.literal('REROLL_RULE_ROLL'),
      seatId,
      sheetId: characterId,
      rollId: z.string().min(1).max(160),
      ruleId: z.string().min(1).max(160),
    }),
    z.object({
      type: z.literal('PREVIEW_RULE_ROLL'),
      seatId,
      sheetId: characterId,
      shortcut: shortcutSchema,
      context: contextSchema.optional(),
    }),
    z.object({
      type: z.literal('BIND_TABLE_SHEET'),
      seatId,
      sheet: sheetSchema.nullable(),
      syncCode: z.string().min(8).max(20).optional(),
    }),
    z.object({
      type: z.literal('ACTIVATE_RULE'),
      actionId: z.string().min(1).max(120).optional(),
      referenceRollId: z.string().min(1).max(160).optional(),
      seatId: seatId.optional(),
      characterId: characterId.optional(),
      sourceEntryId: z.string().min(1).max(160),
      ruleId: z.string().min(1).max(160),
      targetIds: z.array(characterId).max(32),
      context: contextSchema.optional(),
      choiceValue: z.number().finite().min(0).max(100).optional(),
      activationDifficulty: z.number().int().min(2).max(10).optional(),
      opposingSuccesses: z.number().int().min(0).max(100).optional(),
      confirmedConditions: z.boolean().optional(),
      variableCosts: z
        .object({
          rage: z.number().int().min(0).max(10).optional(),
          gnosis: z.number().int().min(0).max(10).optional(),
          willpower: z.number().int().min(0).max(10).optional(),
        })
        .optional(),
      ruleChoices: z
        .record(z.union([z.string().max(160), z.number().finite().min(-10000).max(10000)]))
        .optional(),
      targetChoices: z
        .record(z.record(z.union([z.string().max(120), z.number().finite().min(-100).max(100)])))
        .optional(),
      spendGnosis: z.boolean().optional(),
      isSecretRoll: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('END_RULE_EFFECT'),
      effectId: z.string().min(1).max(240),
      seatId: seatId.optional(),
      characterId: characterId.optional(),
    }),
    z.object({
      type: z.literal('ADVANCE_RULE_CLOCK'),
      unit: z.enum(['turn', 'scene', 'story', 'session', 'seconds']),
      amount: z.number().int().min(1).max(31536000),
    }),
  ] as const;
}
