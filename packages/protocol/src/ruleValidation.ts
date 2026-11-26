import { z } from 'zod';

const identifier = z.string().min(1).max(160);
const ruleChoices = z
  .record(identifier, z.union([z.string().max(160), z.number().finite().min(-10000).max(10000)]))
  .refine((values) => Object.keys(values).length <= 32);
const tags = z.array(identifier).max(80);
const boundedNumber = z.number().finite().min(-1000).max(1000);
const resourceCost = z.object({
  rage: boundedNumber.int().nonnegative().optional(),
  gnosis: boundedNumber.int().nonnegative().optional(),
  willpower: boundedNumber.int().nonnegative().optional(),
});
const rollTrait = z.enum([
  'strength',
  'dexterity',
  'stamina',
  'charisma',
  'manipulation',
  'appearance',
  'perception',
  'intelligence',
  'wits',
  'rage',
  'gnosis',
  'willpower',
]);
const recipient = z.enum(['self', 'target', 'pack', 'shared']);
const amount = z.union([
  boundedNumber,
  z.literal('dots'),
  z.literal('successes'),
  z.object({
    per: z.enum(['dots', 'successes', 'choice', 'trait']),
    trait: identifier.optional(),
    choiceKey: identifier.optional(),
    factor: boundedNumber.optional(),
    cap: boundedNumber.optional(),
    offset: boundedNumber.optional(),
    rounding: z.enum(['ceil', 'floor', 'round']).optional(),
  }),
]);
const effectsSchema = z
  .array(
    z.object({
      target: identifier,
      operation: z.enum(['add', 'multiply', 'set', 'min', 'max', 'ignore', 'allow', 'deny']),
      value: amount,
      when: tags.optional(),
      unless: tags.optional(),
      stackingKey: identifier.optional(),
      recipient: recipient.optional(),
      duration: identifier.optional(),
    })
  )
  .max(64);
const activationSchema = z.object({
  failureEffects: effectsSchema.optional(),
  botchEffects: effectsSchema.optional(),
  cost: resourceCost.optional(),
  alternativeCost: resourceCost.optional(),
  rollSpec: z
    .object({
      actor: z.enum(['self', 'target']).optional(),
      attribute: rollTrait.optional(),
      ability: identifier.optional(),
      pool: z
        .union([boundedNumber.int().nonnegative(), z.literal('dots'), z.literal('item_gnosis')])
        .optional(),
      difficulty: z.number().int().min(2).max(10).optional(),
      difficultyTrait: identifier.optional(),
      minimumSuccesses: z.number().int().min(0).max(100).optional(),
      poolTrait: identifier.optional(),
      difficultyNote: z.string().max(1000).optional(),
      poolCapTrait: identifier.optional(),
      opposed: z.boolean().optional(),
      outcome: z.enum(['success', 'failure']).optional(),
    })
    .optional(),
  distinctChoices: tags.optional(),
  variableCost: z
    .object({
      choiceKey: identifier,
      resource: z.enum(['rage', 'gnosis', 'willpower', '$choices.resource']),
      factor: boundedNumber.optional(),
      minimum: boundedNumber.optional(),
    })
    .optional(),
  permanentCost: z
    .object({ choiceKey: identifier, resource: z.enum(['gnosis', 'willpower', 'rage']) })
    .optional(),
  durationOverrides: z
    .array(
      z.object({
        choiceKey: identifier,
        equals: z.union([identifier, boundedNumber]),
        duration: identifier,
      })
    )
    .max(32)
    .optional(),
  allowRageGnosis: z.boolean().optional(),
  excludeCaster: z.boolean().optional(),
  requiresTarget: z.boolean().optional(),
  correctsPreviousRoll: z.boolean().optional(),
  grantsGiftChoiceKey: identifier.optional(),
  endsWhenCasterIncapacitated: z.boolean().optional(),
  healthCost: z
    .object({
      levels: boundedNumber.int().positive(),
      type: z.enum(['bashing', 'lethal', 'aggravated']),
      choiceKey: identifier.optional(),
    })
    .optional(),
  frequency: z
    .enum([
      'once-per-scene',
      'once-per-turn',
      'once-per-session',
      'once-per-story',
      'once-per-day',
      'once-per-target-per-scene',
      'once-per-target-ever',
    ])
    .optional(),
  allocation: z
    .object({
      choiceKey: identifier,
      limit: z.union([amount, z.array(amount).min(1).max(10)]),
      evenSplit: z.boolean().optional(),
      consumeOnRoll: z.boolean().optional(),
    })
    .optional(),
  roll: z.boolean().optional(),
  duration: identifier,
  preparation: z.string().max(1000).optional(),
  condition: z.string().max(1000).optional(),
  consumable: z.boolean().optional(),
});
const choiceFieldsSchema = z
  .array(
    z.object({
      key: identifier,
      label: identifier,
      kind: z.enum(['attribute', 'ability', 'number', 'text', 'select']),
      options: tags.optional(),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
      perTarget: z.boolean().optional(),
    })
  )
  .max(32);
export const ModifierRuleSchema = z.object({
  id: identifier,
  name: identifier,
  source: z.object({
    book: z.string().min(1).max(240),
    page: z.number().int().positive().optional(),
  }),
  effects: effectsSchema,
  activation: activationSchema.optional(),
  actions: z
    .array(
      z.object({
        id: identifier,
        name: identifier,
        activation: activationSchema,
        effects: effectsSchema,
        choiceFields: choiceFieldsSchema.optional(),
        requiresActive: z.boolean().optional(),
        requiresActiveTarget: identifier.optional(),
        endsParent: z.boolean().optional(),
      })
    )
    .max(32)
    .optional(),
  choiceFields: choiceFieldsSchema.optional(),
  choices: tags.optional(),
  note: z.string().max(2000).optional(),
});
export const ruleBindingFields = {
  ruleChoices: ruleChoices.optional(),
  ruleId: identifier.optional(),
  ruleChoice: identifier.optional(),
  customRule: ModifierRuleSchema.optional(),
};
export const RuleContextSchema = z.object({
  ruleChoices: ruleChoices.optional(),
  attribute: z
    .enum([
      'strength',
      'dexterity',
      'stamina',
      'charisma',
      'manipulation',
      'appearance',
      'perception',
      'intelligence',
      'wits',
      'rage',
      'gnosis',
      'willpower',
    ])
    .optional(),
  ability: identifier.optional(),
  tags: tags.optional(),
  selectedItemId: identifier.optional(),
  maneuver: identifier.optional(),
  rollKind: identifier.optional(),
  targetIds: z.array(identifier).max(24).optional(),
  specialtyOverride: z.boolean().optional(),
  woundOverride: z.boolean().optional(),
  effectChoices: z.record(z.string().min(1).max(512), ruleChoices).optional(),
  penalties: z
    .array(
      z.object({
        key: identifier,
        pool: boundedNumber.int().nonpositive().optional(),
        difficulty: boundedNumber.int().nonnegative().optional(),
      })
    )
    .max(32)
    .optional(),
});
export const ActiveRuleInstanceSchema = z.object({
  boundTargetIds: z.array(identifier).max(32).optional(),
  id: z.string().min(1).max(512),
  sourceId: z.string().min(1).max(300),
  sourceItemId: identifier.optional(),
  sourceOwnerId: identifier.optional(),
  sourceWorn: z.boolean().optional(),
  sourceCarried: z.boolean().optional(),
  sourceActive: z.boolean().optional(),
  ruleId: identifier,
  ruleChoices: ruleChoices.optional(),
  ruleChoice: identifier.optional(),
  successes: boundedNumber.int().nonnegative().optional(),
  choiceValue: boundedNumber.optional(),
  duration: identifier,
  remainingRounds: boundedNumber.int().nonnegative().optional(),
  recipient: recipient.optional(),
  preparationSeconds: z.number().finite().nonnegative().optional(),
  resourceGrants: resourceCost.optional(),
  preparationRounds: z.number().int().nonnegative().optional(),
  remainingSessions: z.number().int().nonnegative().optional(),
  remainingScenes: z.number().int().nonnegative().optional(),
  remainingStories: z.number().int().nonnegative().optional(),
  remainingSeconds: z.number().finite().nonnegative().optional(),
  clockId: identifier.optional(),
  createdAt: z.number().finite().optional(),
  rule: ModifierRuleSchema.optional(),
  dots: boundedNumber.optional(),
  sourceName: identifier.optional(),
  sourceTraits: z.record(z.string(), boundedNumber).optional(),
  parentGrantId: z.string().min(1).max(512).optional(),
  grantedGift: z
    .object({
      giftId: identifier,
      sourceEntryId: identifier,
      name: identifier,
      level: z.number().int().min(1).max(6),
      rule: ModifierRuleSchema,
    })
    .optional(),
});
