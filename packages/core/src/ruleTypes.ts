import type { AttributeKey, GarouForm, HealthState } from './types';

export type RuleMagnitude =
  | number
  | 'dots'
  | 'successes'
  | {
      per: 'dots' | 'successes' | 'choice' | 'trait';
      trait?: string;
      choiceKey?: string;
      factor?: number;
      cap?: number;
      offset?: number;
      rounding?: 'floor' | 'ceil' | 'round';
    };
export interface RuleEffect {
  target: string;
  operation: 'add' | 'multiply' | 'set' | 'min' | 'max' | 'ignore' | 'allow' | 'deny';
  value: RuleMagnitude;
  when?: string[];
  unless?: string[];
  stackingKey?: string;
  recipient?: 'self' | 'target' | 'pack' | 'shared';
  duration?: string;
}
export interface ModifierRule {
  id: string;
  name: string;
  source: { book: string; page?: number };
  effects: RuleEffect[];
  activation?: {
    cost?: { rage?: number; gnosis?: number; willpower?: number };
    roll?: boolean;
    correctsPreviousRoll?: boolean;
    rollSpec?: {
      actor?: 'self' | 'target';
      attribute?: AttributeKey | 'rage' | 'gnosis' | 'willpower';
      ability?: string;
      pool?: number | 'dots' | 'item_gnosis';
      poolTrait?: string;
      difficulty?: number;
      difficultyTrait?: string;
      difficultyNote?: string;
      poolCapTrait?: string;
      opposed?: boolean;
      outcome?: 'success' | 'failure';
      minimumSuccesses?: number;
    };
    alternativeCost?: { rage?: number; gnosis?: number; willpower?: number };
    duration: string;
    preparation?: string;
    condition?: string;
    consumable?: boolean;
    allocation?: {
      choiceKey: string;
      /** Multiple bounds mean the smallest bound applies. */
      limit: RuleMagnitude | RuleMagnitude[];
      evenSplit?: boolean;
      consumeOnRoll?: boolean;
    };
    distinctChoices?: string[];
    variableCost?: {
      choiceKey: string;
      resource: 'rage' | 'gnosis' | 'willpower' | '$choices.resource';
      factor?: number;
      minimum?: number;
    };
    permanentCost?: { choiceKey: string; resource: 'rage' | 'gnosis' | 'willpower' };
    failureEffects?: RuleEffect[];
    botchEffects?: RuleEffect[];
    durationOverrides?: Array<{ choiceKey: string; equals: string | number; duration: string }>;
    allowRageGnosis?: boolean;
    healthCost?: {
      levels: number;
      type: 'bashing' | 'lethal' | 'aggravated';
      choiceKey?: string;
    };
    frequency?:
      | 'once-per-scene'
      | 'once-per-turn'
      | 'once-per-session'
      | 'once-per-story'
      | 'once-per-day'
      | 'once-per-target-per-scene'
      | 'once-per-target-ever';
    excludeCaster?: boolean;
    grantsGiftChoiceKey?: string;
    requiresTarget?: boolean;
    endsWhenCasterIncapacitated?: boolean;
  };
  choiceFields?: Array<{
    key: string;
    label: string;
    kind: 'attribute' | 'ability' | 'number' | 'text' | 'select';
    options?: string[];
    min?: number;
    max?: number;
    perTarget?: boolean;
  }>;
  actions?: Array<{
    id: string;
    name: string;
    activation: NonNullable<ModifierRule['activation']>;
    choiceFields?: ModifierRule['choiceFields'];
    effects: RuleEffect[];
    requiresActive?: boolean;
    requiresActiveTarget?: string;
    endsParent?: boolean;
  }>;
  choices?: string[];
  note?: string;
}
export interface RuleBinding {
  ruleId?: string;
  ruleChoice?: string;
  ruleChoices?: Record<string, string | number>;
  customRule?: ModifierRule;
}
export interface SharedGiftGrant {
  giftId: string;
  sourceEntryId: string;
  name: string;
  level: number;
  rule: ModifierRule;
}
export interface ActiveRuleInstance {
  grantedGift?: SharedGiftGrant;
  parentGrantId?: string;
  sourceItemId?: string;
  sourceOwnerId?: string;
  sourceWorn?: boolean;
  sourceCarried?: boolean;
  sourceActive?: boolean;
  id: string;
  sourceId: string;
  ruleId: string;
  rule?: ModifierRule;
  dots?: number;
  sourceName?: string;
  ruleChoice?: string;
  ruleChoices?: Record<string, string | number>;
  boundTargetIds?: string[];
  sourceTraits?: Record<string, number>;
  successes?: number;
  choiceValue?: number;
  duration: string;
  remainingRounds?: number;
  preparationRounds?: number;
  preparationSeconds?: number;
  resourceGrants?: { rage?: number; gnosis?: number; willpower?: number };
  remainingScenes?: number;
  remainingStories?: number;
  remainingSessions?: number;
  remainingSeconds?: number;
  /** Fictional time counters are advanced explicitly by the table. */
  clockId?: string;
  createdAt?: number;
  recipient?: 'self' | 'target' | 'pack' | 'shared';
}
export interface RuleContext {
  /** Internal derived facts, excluded from wire validation. */
  authoritativeTags?: string[];
  woundOverride?: boolean;
  effectChoices?: Record<string, Record<string, string | number>>;
  penalties?: Array<{ key: string; pool?: number; difficulty?: number }>;
  ruleChoices?: Record<string, string | number>;
  targetIds?: string[];
  specialtyOverride?: boolean;
  attribute?: AttributeKey | 'rage' | 'gnosis' | 'willpower';
  ability?: string;
  tags?: string[];
  selectedItemId?: string;
  maneuver?: string;
  rollKind?: string;
}
export interface RuleSource extends RuleBinding {
  grantInstanceId?: string;
  itemId?: string;
  ownerId?: string;
  damageDice?: number;
  damageMode?: 'strength_plus' | 'flat';
  rating?: number;
  dexterityDifficultyPenalty?: number;
  rollAbility?: string;
  id: string;
  name: string;
  dots?: number;
  kind?: string;
  worn?: boolean;
  carried?: boolean;
  active?: boolean;
}
export interface AppliedRuleModifier {
  duration?: string;
  stackingKey?: string;
  sourceId: string;
  ruleId: string;
  name: string;
  source: ModifierRule['source'];
  target: string;
  operation: RuleEffect['operation'];
  value: number;
}
export interface EvaluatedRules {
  modifiers: AppliedRuleModifier[];
  pending: { sourceId: string; rule: ModifierRule; reasons: string[] }[];
  values: Record<string, number>;
}
export interface RuleCharacterInput {
  id?: string;
  activeForm: GarouForm;
  ruleTraits?: Record<string, number>;
  ruleContextTags?: string[];
  activeRuleEffects?: ActiveRuleInstance[];
}
export interface ResolvedCharacterRuleRoll {
  pool: number;
  difficulty: number;
  woundPenalty: number;
  modifiers: AppliedRuleModifier[];
}
