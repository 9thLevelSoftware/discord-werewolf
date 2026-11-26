import type { ModifierRule, RuleEffect } from '../ruleTypes';
import { W20_GIFT_CATALOG } from './gifts.data';

type GiftRuleDefinition = Omit<ModifierRule, 'id' | 'name' | 'source'>;
type Magnitude = RuleEffect['value'];

/** These are authored mechanical facts, keyed by the catalog's stable slug. */
function add(
  target: string,
  value: Magnitude,
  when: string[] = [],
  duration?: string,
  extra: Partial<RuleEffect> = {},
): RuleEffect {
  return { target, operation: 'add', value, when, ...(duration ? { duration } : {}), ...extra };
}

function set(
  target: string,
  value: Magnitude,
  when: string[] = [],
  duration?: string,
  extra: Partial<RuleEffect> = {},
): RuleEffect {
  return { target, operation: 'set', value, when, ...(duration ? { duration } : {}), ...extra };
}

function flag(
  target: string,
  operation: 'allow' | 'deny' | 'ignore',
  when: string[] = [],
  duration?: string,
  extra: Partial<RuleEffect> = {},
): RuleEffect {
  return { target, operation, value: 1, when, ...(duration ? { duration } : {}), ...extra };
}

function multiply(
  target: string,
  value: number,
  when: string[],
  duration?: string,
  extra: Partial<RuleEffect> = {},
): RuleEffect {
  return { target, operation: 'multiply', value, when, ...(duration ? { duration } : {}), ...extra };
}

function forAttributes(
  attributes: string[],
  target: string,
  value: Magnitude,
  when: string[],
  duration?: string,
  extra: Partial<RuleEffect> = {},
): RuleEffect[] {
  return attributes.map((attribute) => add(target, value, [...when, `attribute:${attribute}`], duration, extra));
}

const physicalAttributes = ['strength', 'dexterity', 'stamina'];
const mentalAttributes = ['perception', 'intelligence', 'wits'];
const socialAttributes = ['charisma', 'manipulation', 'appearance'];
const successes = { per: 'successes' as const };
const negativeSuccesses = { per: 'successes' as const, factor: -1 };
const halfSuccesses = { per: 'successes' as const, factor: 0.5, rounding: 'floor' as const };
const negativeHalfSuccesses = { per: 'successes' as const, factor: -0.5, rounding: 'ceil' as const };
const recipient = { recipient: 'target' as const };
const defensive = ['target:source'];

const definitions: Record<string, GiftRuleDefinition> = {
  'aura-of-confidence': {
    effects: [flag('aura:read', 'deny', [...defensive]), flag('task:find-source-flaws', 'deny', [...defensive])],
    note: 'Thought-reading is unaffected.',
  },
  'apecrafts-blessings': {
    effects: [add('difficulty', negativeSuccesses, ['tool:manufactured'], 'next-roll')],
    activation: { roll: true, duration: 'next-roll', preparation: 'Concentrate for one turn.' },
  },
  balance: {
    effects: [add('difficulty', -3, ['task:climbing']), flag('outcome:success', 'allow', ['task:balance'])],
  },
  'blur-of-the-milky-eye': {
    effects: [add('difficulty', successes, [...defensive, 'attribute:perception', 'task:detect-source'], 'scene')],
    activation: { roll: true, duration: 'scene', condition: 'Ends when the character is noticed.' },
  },
  'breath-of-the-wyld': {
    effects: [
      ...forAttributes(mentalAttributes, 'pool', 1, [], 'scene', recipient),
      add('difficulty', 1, ['roll:rage'], 'scene', recipient),
    ],
    activation: { roll: true, duration: 'scene', preparation: 'Touch the recipient.' },
  },
  'call-the-breeze': {
    effects: [
      add('pool', -1, ['attribute:perception', 'situation:in-cold-wind'], 'until:dismissed', recipient),
      add('pool', -1, ['situation:in-cold-wind', 'situation:underdressed-for-one-minute'], 'until:dismissed', recipient),
    ],
    activation: { roll: false, duration: 'until:dismissed' },
  },
  'call-of-the-wyld': {
    effects: [
      add('pool', { per: 'choice', choiceKey: 'amount' }, ['choice:benefit:dice'], 'next-roll', recipient),
      add('resource:rage', { per: 'choice', choiceKey: 'amount' }, ['choice:benefit:rage'], 'instant', recipient),
    ],
    choiceFields: [{ key: 'benefit', label: 'Storyteller-awarded benefit', kind: 'select', options: ['dice', 'rage'] }, { key: 'amount', label: 'Awarded amount', kind: 'number', min: 0, perTarget: true }],
    activation: { roll: true, duration: 'next-roll', condition: 'The Storyteller sets the howl’s benefit; the examples in the book do not establish an automatic award.' },
  },
  'battle-mandala': {
    effects: [add('resource:essence-per-turn', -1, ['recipient:spirit', 'situation:within-mandala'], 'until:mandala-ends', { ...recipient, unless: ['recipient:pack-totem'] })],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:mandala-ends', condition: 'Radius is fifty feet per success. Excludes the caster’s pack totem.' },
  },
  camouflage: {
    effects: [add('difficulty', 3, [...defensive, 'task:spot-source', 'situation:wilderness'], undefined, { stackingKey: 'camouflage' })],
  },
  channeling: {
    effects: [add('pool', { per: 'choice', choiceKey: 'rageSpent', cap: 3 }, [], 'next-roll')],
    choiceFields: [{ key: 'rageSpent', label: 'Rage spent', kind: 'number', min: 1, max: 3 }],
    activation: { duration: 'next-roll', variableCost: { choiceKey: 'rageSpent', resource: 'rage', minimum: 1 }, condition: 'Spend the selected one to three Rage. Gain one die per point on one action.' },
  },
  'city-running': {
    effects: [add('difficulty', -2, ['ability:athletics', 'situation:urban-navigation'], 'scene')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene' },
  },
  'desperate-strength': {
    effects: [add('pool', { per: 'choice', choiceKey: 'healthLevels' }, ['task:feat-of-strength'], 'next-roll')],
    choiceFields: [{ key: 'healthLevels', label: 'Bashing health levels willingly suffered', kind: 'number', min: 1 }],
    activation: { roll: false, duration: 'next-roll', healthCost: { levels: 1, type: 'bashing', choiceKey: 'healthLevels' }, condition: 'Suffer the selected bashing damage before the feat.' },
  },
  diagnostics: {
    effects: [multiply('extended:required-successes', 0.5, ['task:repair'], 'until:repair-complete')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'until:repair-complete' },
    note: 'Repair time is also halved. Diagnosing the fault itself is automatic.',
  },
  'dream-of-a-thousand-cranes': {
    effects: [add('pool', { per: 'choice', choiceKey: 'dice' }, ['action:spend-crane-dice'], 'scene')],
    choiceFields: [{ key: 'dice', label: 'Bonus dice allocated to this roll', kind: 'number', min: 0 }],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', preparation: 'Fold origami for one turn.', allocation: { choiceKey: 'dice', limit: 'successes', consumeOnRoll: true } },
    note: 'Successes form a shared reserve. Each bonus die is consumed once, and the reserve expires with the scene.',
  },
  'eye-of-the-falcon': {
    effects: [
      add('difficulty', -1, ['roll:attack', 'range:long'], 'scene', { stackingKey: 'eye-of-the-falcon' }),
      add('difficulty', -1, ['attribute:perception', 'sense:sight'], 'scene', { stackingKey: 'eye-of-the-falcon' }),
    ],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  'eye-of-the-hunter': {
    effects: [add('pool', 1, ['roll:attack', 'target:identified-weakest'], 'scene')],
    activation: { requiresTarget: true, roll: true, duration: 'scene' },
  },
  'eye-of-the-eagle': {
    effects: [add('sense:clear-sight-miles', successes, [], 'until:vision-use-ends')],
    activation: { roll: true, duration: 'until:vision-use-ends' },
    note: 'The printed system gives no fixed duration; end the effect when the enhanced viewing ends.',
  },
  'fair-path': {
    effects: [add('pool', 1, ['attribute:appearance'], 'scene')],
    activation: { roll: true, duration: 'scene', preparation: 'Place a hand in clean water.' },
  },
  'falcons-grasp': {
    effects: [
      add('attribute:strength', 3, ['move:grapple'], 'scene', { stackingKey: 'falcons-grasp', unless: ['roll:damage'] }),
      add('attribute:strength', 3, ['move:jaw-lock'], 'scene', { stackingKey: 'falcons-grasp', unless: ['roll:damage'] }),
    ],
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene' },
  },
  'fangs-of-judgment': {
    effects: [add('pool', 2, ['roll:damage', 'weapon:natural', 'target:wyrm-corrupted'], 'days:1', { unless: ['target:native-bane'] })],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'days:1' },
  },
  'fatal-flaw': {
    effects: [add('pool', 1, ['roll:damage', 'target:studied'], 'until:target-changes')],
    activation: { requiresTarget: true, roll: true, duration: 'until:target-changes', preparation: 'Study the target for one turn.' },
  },
  'hares-leap': {
    effects: [multiply('movement:jump', 2, ['choice:willpowerSpent:0'], 'scene'), multiply('movement:jump', 3, ['choice:willpowerSpent:1'], 'turn')],
    choiceFields: [{ key: 'willpowerSpent', label: 'Willpower spent to triple one jump', kind: 'number', min: 0, max: 1 }],
    activation: { roll: true, duration: 'scene', variableCost: { choiceKey: 'willpowerSpent', resource: 'willpower', minimum: 0 }, durationOverrides: [{ choiceKey: 'willpowerSpent', equals: 1, duration: 'turn' }] },
  },
  'heightened-senses': {
    effects: [
      ...['homid', 'glabro'].map((form) => add('difficulty', -2, ['attribute:perception', `form:${form}`], 'scene', { stackingKey: 'perception-form' })),
      ...['crinos', 'hispo', 'lupus'].map((form) => add('difficulty', -3, ['attribute:perception', `form:${form}`], 'scene', { stackingKey: 'perception-form' })),
      ...['crinos', 'hispo', 'lupus'].map((form) => add('pool', 1, ['ability:primal_urge', `form:${form}`], 'scene')),
    ],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
    note: 'Its Perception reduction replaces the ordinary animal-form reduction. Sudden sensory overload can disorient the user.',
  },
  inspiration: {
    effects: [add('resource:willpower', 1, [], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene', excludeCaster: true, condition: 'All allies except the caster. Unspent temporary Willpower expires.' },
  },
  'iron-resolve': {
    effects: [set('successes:automatic', 2, ['action:willpower-success'], 'next-roll')],
    activation: { frequency: 'once-per-scene', cost: { willpower: 1 }, roll: false, duration: 'next-roll', condition: 'Once per scene; replaces the usual one Willpower success.' },
  },
  'ice-echo': {
    effects: [set('difficulty', { per: 'trait', trait: 'gnosis' }, [...defensive, 'attribute:perception', 'ability:enigmas', 'task:distinguish-echo'], 'until:echo-ends')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'until:echo-ends', condition: 'Create the image within one hundred feet. It has neither heat nor scent.' },
  },
  'lightning-reflexes': {
    effects: [flag('cost:abort-defense-willpower', 'ignore', [], 'days:1'), flag('roll:abort-defense-willpower', 'ignore', [], 'days:1')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'days:1' },
  },
  'lambent-flame': {
    effects: [add('difficulty', 1, [...defensive, 'roll:attack'], 'scene')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'scene' },
  },
  'master-of-fire': {
    effects: [set('damage:type:bashing', 1, ['damage:fire'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  mercy: {
    effects: [set('damage:type:bashing', 1, ['roll:damage', 'weapon:natural'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  mindspeak: {
    effects: [add('pool', -2, ['situation:physical-body-action'], 'until:dismissed', recipient)],
    activation: { duration: 'until:dismissed', condition: 'One Willpower per participant, or one for the entire pack. Roll against unwilling participants.' },
  },
  'pack-tactics': {
    effects: [add('pool', { per: 'choice', choiceKey: 'dice' }, ['task:pack-tactics'], 'next-roll', { recipient: 'pack' })],
    choiceFields: [{ key: 'dice', label: 'Leadership dice allocated to this participant', kind: 'number', min: 0, perTarget: true }],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'next-roll', allocation: { choiceKey: 'dice', limit: { per: 'trait', trait: 'leadership' }, evenSplit: true, consumeOnRoll: true }, condition: 'Divide Leadership dice as evenly as possible across maneuver participants.' },
  },
  persuasion: {
    effects: [add('difficulty', -1, ['roll:social'], 'scene')],
    activation: { roll: true, duration: 'scene' },
  },
  'predators-arsenal': {
    effects: [
      flag('attack:claws', 'allow', ['form:homid'], 'scene'),
      flag('attack:fangs', 'allow', ['form:homid'], 'scene'),
      set('damage:type:lethal', 1, ['form:homid', 'weapon:natural', 'roll:damage'], 'scene'),
    ],
    activation: { roll: false, duration: 'scene', preparation: 'Concentrate for one turn.' },
  },
  'prey-mind': {
    effects: ['evasion', 'flight', 'hiding'].map((task) => add('pool', successes, [`task:${task}`], 'scene', { stackingKey: 'prey-mind' })),
    activation: { roll: true, duration: 'scene' },
  },
  'primal-anger': {
    effects: [add('resource:rage', 3, [], 'instant')],
    activation: { frequency: 'once-per-scene', roll: false, duration: 'instant', healthCost: { levels: 1, type: 'aggravated' }, condition: 'Once per scene, suffer one aggravated health level. Rage can exceed permanent rating.' },
  },
  'razor-claws': {
    effects: [add('pool', 2, ['roll:damage', 'move:claw'], 'scene'), add('difficulty', -1, ['roll:attack', 'move:claw'], 'scene')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene', preparation: 'Spend a full turn sharpening claws on a hard surface.' },
  },
  'resist-pain': {
    effects: [flag('wound:penalty', 'ignore', [], 'scene')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'scene' },
  },
  'scent-of-the-true-form': {
    effects: [flag('outcome:success', 'allow', ['task:identify-true-form', 'target:garou'], undefined, { stackingKey: 'scent-of-the-true-form' }), flag('outcome:success', 'allow', ['task:identify-true-form', 'target:kinfolk'], undefined, { stackingKey: 'scent-of-the-true-form' })],
  },
  'resist-toxin': {
    effects: [flag('toxin:mundane', 'ignore'), add('pool', 3, ['task:resist-toxin', 'toxin:wyrm-enhanced'])],
    note: 'The user can suppress the immunity voluntarily.',
  },
  'scent-of-running-water': {
    effects: [add('difficulty', 2, [...defensive, 'task:track-source'])],
    note: 'The user can suppress the Gift voluntarily.',
  },
  'scent-of-sweet-honey': {
    effects: [add('pool', -1, [], 'hours:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:successes', condition: 'The target was touched within the previous hour.' },
  },
  'seizing-the-edge': {
    effects: [flag('opposed:win-ties', 'allow')],
    note: 'The first tie per scene is free. Each further use costs one Gnosis.',
  },
  'shadow-weaving': {
    effects: ['stealth', 'intimidation'].map((ability) => add('difficulty', -1, [`ability:${ability}`], 'scene', { stackingKey: 'shadow-weaving' })),
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
  },
  'sheng-nongs-eyes': {
    effects: [flag('penalty:visibility', 'ignore', [], 'scene'), flag('penalty:off-hand', 'ignore', [], 'scene'), add('action:bonus', 1, [], 'instant')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  silence: { effects: [add('pool', 2, ['attribute:dexterity', 'ability:stealth'])] },
  'smell-of-man': {
    effects: [add('pool', -2, [...defensive, 'actor:mundane-wild-animal'], undefined, { unless: ['task:defend', 'task:flee'] })],
  },
  'speed-of-thought': {
    effects: [multiply('movement:run', 2, [], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  'spirit-snare': {
    effects: [add('resource:willpower', -2, ['situation:combat'], 'scene', { ...recipient, stackingKey: 'spirit-snare' })],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', condition: 'Target a spirit within thirty feet.' },
  },
  'spur-claws': {
    effects: [add('difficulty', 2, [], 'until:spurs-removed', recipient)],
    activation: { cost: { rage: 1 }, roll: false, duration: 'until:spurs-removed', condition: 'Apply after the next successful claw hit; removing spurs takes a turn.' },
  },
  'trick-shot': {
    effects: [add('pool', { per: 'trait', trait: 'glory' }, ['task:outlandish-firearm-trick'], undefined, { unless: ['task:directly-injure-target'] })],
  },
  'two-tongues': {
    effects: [set('difficulty', 9, [...defensive, 'attribute:perception', 'ability:alertness', 'task:detect-second-conversation'], 'scene')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'scene' },
  },
  'visage-of-fenris': {
    effects: [
      add('difficulty', -1, ['roll:social', 'recipient:ally-or-peer'], 'scene'),
      add('initiative', -1, ['recipient:foe'], 'scene', recipient),
    ],
    activation: { roll: true, duration: 'scene', condition: 'A higher-ranked Garou requires successes equal to twice the rank difference.' },
    note: 'The social benefit belongs to the caster when impressing affected allies and peers.',
  },
  'wolf-at-the-door': {
    effects: [...forAttributes([...mentalAttributes, ...socialAttributes], 'pool', -3, ['situation:away-from-home'], 'days:successes', recipient)],
    activation: { roll: true, duration: 'days:successes', condition: 'Humans only. Group howl affects up to Rage targets; supernatural humans add two activation difficulty.' },
  },
  'blissful-ignorance': {
    effects: [add('successes:opposed', negativeSuccesses, [...defensive, 'attribute:perception', 'ability:alertness'], 'until:moving')],
    activation: { roll: true, duration: 'until:moving', condition: 'Remain absolutely still. One success hides the user from those who are not searching.' },
  },
  burrow: {
    effects: [set('movement:tunnel-yards-per-turn', successes, ['body:claws'], 'until:tunneling-ends')],
    activation: { roll: true, duration: 'until:tunneling-ends', condition: 'Requires claws; difficulty depends on the material.' },
  },
  calm: {
    effects: [add('resource:rage', negativeSuccesses, [], 'instant', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'instant', condition: 'A Rage-less frenzy ends on three successes.' },
  },
  'cornered-rats-ferocity': {
    effects: [add('pool', successes, ['ability:brawl'], 'combat'), flag('frenzy:berserk', 'allow', [], 'combat')],
    activation: { cost: { rage: 1 }, roll: true, duration: 'combat', condition: 'Activation triggers unavoidable berserk frenzy.' },
  },
  'curse-of-aeolus': {
    effects: [
      multiply('pool', 0.5, ['attribute:perception', 'situation:in-mist'], 'until:mist-disperses', recipient),
      add('pool', -1, ['roll:willpower', 'situation:in-mist'], 'until:mist-disperses', recipient),
    ],
    activation: { roll: true, duration: 'until:mist-disperses', condition: 'The caster is unaffected by the mist.' },
  },
  'curse-of-hatred': {
    effects: [add('resource:willpower', -2, [], 'instant', recipient), add('resource:rage', -2, [], 'instant', recipient)],
    activation: { frequency: 'once-per-target-per-scene', cost: { gnosis: 1 }, roll: true, duration: 'instant', condition: 'Once per target per scene.' },
  },
  'cutting-wind': {
    effects: [add('pool', -2, [], 'turns:2', recipient)],
    activation: { cost: { willpower: 1 }, roll: true, duration: 'turns:successes', condition: 'A struck victim suffers the penalty for two turns. The wind lasts successes turns.' },
  },
  distractions: {
    effects: [add('pool', negativeSuccesses, [], 'turns:3', recipient)],
    activation: { roll: true, duration: 'turns:3' },
  },
  'fangs-of-the-north': {
    effects: [
      add('pool', -1, ['situation:wounded-by-source-claws-or-fangs'], 'scene', recipient),
      flag('healing:supernatural', 'deny', ['situation:wounded-by-source-claws-or-fangs'], 'days:successes', recipient),
    ],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', condition: 'Unavailable in Homid. Apply the victim effects only after a damaging claw or bite hit.' },
  },
  'flame-dance': {
    effects: [add('pool', 3, ['task:dodge'], 'next-roll')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'next-roll' },
    note: 'Alternatively dodge one attack at the full pool despite other actions, without the +3 enhancement.',
  },
  'form-mastery': {
    effects: [add('difficulty', -1, ['task:shapeshift']), set('difficulty', 7, ['task:partial-transformation']), flag('cost:partial-shift-willpower', 'ignore')],
  },
  'fu-xis-honor': {
    effects: physicalAttributes.map((attribute) => add(`attribute:${attribute}`, { per: 'trait', trait: 'honor' }, [], 'scene')),
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene', condition: 'A helpless packmate or family member is threatened; Storyteller confirms helplessness.' },
  },
  'halt-the-cowards-flight': {
    effects: [multiply('movement:run', 0.5, ['task:flee'], 'scene', recipient)],
    activation: { roll: true, duration: 'scene', preparation: 'Concentrate for a turn.', condition: 'A fleeing target, rather than a charging foe.' },
  },
  'hand-blade': {
    effects: [
      set('damage:base-strength-bonus', 2, ['weapon:hand-blade'], 'scene'),
      set('damage:type:aggravated', 1, ['weapon:hand-blade'], 'scene'),
      set('difficulty', 6, ['roll:attack', 'weapon:hand-blade'], 'scene'),
    ],
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene' },
    note: 'The blade attacks using Dexterity + Melee.',
  },
  'inner-light': { effects: [flag('situation:using-mirror-to-step-sideways', 'allow', ['task:step-sideways'])] },
  'inner-strength': {
    effects: [add('resource:willpower', { per: 'choice', choiceKey: 'points' }, [], 'instant')],
    choiceFields: [{ key: 'points', label: 'Rage points converted', kind: 'number', min: 0 }],
    activation: { roll: true, duration: 'instant', preparation: 'Meditate for five minutes.', variableCost: { choiceKey: 'points', resource: 'rage', minimum: 0 }, allocation: { choiceKey: 'points', limit: 'successes' } },
  },
  'messengers-fortitude': {
    effects: [flag('penalty:fatigue', 'ignore', ['task:run'], 'days:3'), flag('penalty:no-food-or-water', 'ignore', ['task:run'], 'days:3')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'days:3', condition: 'One additional Gnosis per additional runner. Sleep for a day afterwards.' },
  },
  'kalis-tongue': {
    effects: [flag('healing:all', 'deny', [], 'turns:successes', recipient)],
    activation: { cost: { rage: 1 }, roll: true, duration: 'turns:successes' },
  },
  'lunas-armor': {
    effects: [add('pool', successes, ['roll:soak'], 'scene'), flag('soak:silver', 'allow', [], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', preparation: 'Concentrate for a turn.' },
    note: 'Successes add armor dice, including against silver. The book specifies no five-die cap.',
  },
  'odious-aroma': {
    effects: [add('pool', -2, ['situation:within-twenty-feet', 'sense:smell'], 'scene', { ...recipient, unless: ['recipient:packmate', 'recipient:caster'] })],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  'para-bellum': {
    effects: ['strength', 'dexterity'].flatMap((attribute) => [
      add(`attribute:${attribute}`, 1, ['target:first-attacker'], 'scene', { stackingKey: `para-bellum-${attribute}` }),
      add(`attribute:${attribute}`, 1, ['target:injured-packmate'], 'scene', { stackingKey: `para-bellum-${attribute}` }),
    ]),
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene', condition: 'At the start of a fight initiated by someone other than the caster, pack, or allies.' },
  },
  'pulse-of-the-prey': {
    effects: [flag('outcome:success', 'allow', ['task:track-known-quarry'], undefined, { unless: ['target:actively-hiding'] })],
  },
  'salmon-swim': {
    effects: [flag('penalty:fresh-water-movement', 'ignore', [], 'scenes:successes'), multiply('movement:jump', 2, ['situation:between-water-surfaces'], 'scenes:successes')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scenes:successes' },
  },
  'scent-of-sight': {
    effects: [flag('penalty:vision', 'ignore', ['sense:smell'])],
    note: 'Smell substitutes for sight, but conveys neither colors nor printed words. Scent masking can require the printed Perception + Primal-Urge check.',
  },
  'resist-temptation': {
    effects: [
      add('difficulty', successes, [...defensive, 'task:supernatural-coercion'], 'scene'),
      flag('coercion:mundane', 'ignore', [], 'scene'),
    ],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
  },
  'shadows-of-the-impergium': {
    effects: [
      flag('delirium:enabled', 'allow', ['form:hispo']),
      add('delirium:viewer-willpower', 2, ['form:hispo']),
      add('delirium:viewer-willpower', -5, ['form:crinos']),
    ],
    note: 'A viewer’s effective Willpower on the Delirium chart has a minimum of one.',
  },
  'shield-of-rage': {
    effects: [add('pool', -2, [...defensive, 'roll:damage', 'actor:spirit'], 'scene')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'scene' },
  },
  'snarl-of-the-predator': {
    effects: [add('pool', negativeSuccesses, [], 'turns:3', recipient)],
    activation: { roll: true, duration: 'turns:3', preparation: 'Invoke for one full turn.' },
  },
  'spirit-of-the-bird': {
    effects: [add('difficulty', 1, ['task:combat-maneuver'], 'hours:1')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'hours:1' },
  },
  'spirit-of-the-fish': {
    effects: [set('movement:swim', { per: 'trait', trait: 'movement:hispo-run' }, [], 'hours:successes'), flag('damage:drowning', 'ignore', [], 'hours:successes')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:successes' },
  },
  'strength-of-purpose': {
    effects: [add('resource:willpower', halfSuccesses, [], 'instant')],
    activation: { frequency: 'once-per-scene', roll: true, duration: 'instant', condition: 'Once per scene, up to permanent Willpower.' },
  },
  'surface-attunement': {
    effects: [flag('penalty:soft-ground', 'ignore', [], 'scene'), flag('task:leave-tracks', 'deny', [], 'scene')],
    activation: { roll: true, duration: 'scene', preparation: 'Concentrate for one turn.' },
  },
  'tread-sebeks-back': {
    effects: [flag('movement:walk-on-liquid', 'allow', [], 'hours:successes')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:successes' },
    note: 'The power provides no protection to the feet from dangerous liquids.',
  },
  'spirit-of-the-fray': {
    effects: [add('initiative', 10, [], undefined, { stackingKey: 'spirit-of-the-fray' }), add('initiative', 10, [], 'next-roll', { stackingKey: 'spirit-of-the-fray-enhancement' }), flag('action:rage-extra', 'deny', [], 'turn')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'next-roll', condition: 'Optional enhancement to one initiative roll. Learning the Gift permanently grants its first +10.' },
  },
  'steel-fur': {
    effects: [
      ...['crinos', 'hispo', 'lupus'].flatMap((form) => [
        add('pool', successes, ['roll:soak', `form:${form}`], 'scene'),
        add('difficulty', 1, ['attribute:dexterity', `form:${form}`], 'scene', { stackingKey: 'steel-fur-penalty' }),
        add('difficulty', 1, ['roll:social', `form:${form}`], 'scene', { unless: ['target:glass-walker'], stackingKey: 'steel-fur-penalty' }),
      ]),
    ],
    activation: { cost: { willpower: 1 }, roll: true, duration: 'scene' },
  },
  'troll-skin': {
    effects: [
      add('pool', successes, ['roll:soak'], 'scene', { unless: ['damage:silver'] }),
      add('difficulty', 1, ['roll:social'], 'scene', { unless: ['ability:intimidation'] }),
    ],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
  },
  'unicorns-arsenal': {
    effects: [add('pool', -2, ['roll:attack', 'situation:wounded-by-source-claws-or-fangs'], 'until:wounds-heal', recipient)],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'until:wounds-heal' },
  },
  'unity-of-the-pack': {
    effects: [add('pool', 1, ['task:pack-tactics', 'situation:caster-present', 'situation:with-pack'], undefined, { recipient: 'pack', stackingKey: 'unity-of-the-pack' })],
  },
  'banish-totem': {
    effects: [flag('source:totem', 'deny', [], 'scene', recipient), flag('task:pack-tactics', 'deny', [], 'scene', recipient)],
    activation: { requiresTarget: true, endsWhenCasterIncapacitated: true, cost: { gnosis: 1, willpower: 1 }, roll: true, rollSpec: { attribute: 'gnosis', difficultyNote: 'Combined Totem rating of the targeted pack, maximum ten.' }, duration: 'scene', preparation: 'Concentrate for one full turn.', condition: 'Know the victims’ totem and select members of that pack. Ends if the caster becomes unconscious or dies.' },
  },
  'blood-of-the-north': {
    effects: [flag('penalty:cold', 'ignore'), add('pool', 5, ['roll:soak', 'damage:cold']), add('difficulty', -2, ['ability:survival', 'situation:cold'])],
  },
  'bloody-feast': {
    effects: [add('attribute:strength', { per: 'choice', choiceKey: 'damageLevels', factor: 0.5, rounding: 'floor', cap: 5 }, [], 'turns:successes*2')],
    choiceFields: [{ key: 'damageLevels', label: 'Health levels inflicted by the bite', kind: 'number', min: 1 }],
    activation: { roll: true, duration: 'turns:successes*2', condition: 'Activate after a damaging bite. Make a frenzy roll when the effect ends.' },
  },
  'burning-blade': {
    effects: [add('pool', 2, ['roll:damage', 'item-id:$choices.weaponId'], 'turns:successes'), set('damage:type:aggravated', 1, ['roll:damage', 'item-id:$choices.weaponId'], 'turns:successes')],
    choiceFields: [{ key: 'weaponId', label: 'Weapon receiving the blessing', kind: 'text' }],
    activation: { roll: true, duration: 'turns:successes', preparation: 'Concentrate for one turn.' },
  },
  catfeet: {
    effects: [
      add('difficulty', -2, ['move:body-slam'], undefined, { stackingKey: 'catfeet' }),
      add('difficulty', -2, ['move:grapple'], undefined, { stackingKey: 'catfeet' }),
      flag('outcome:success', 'allow', ['task:balance']),
      flag('damage:fall', 'ignore', ['situation:fall-under-one-hundred-feet']),
    ],
  },
  'chains-of-mist': {
    effects: ['rage', 'gnosis', 'willpower'].map((trait) => add(`resource:${trait}`, -1, ['recipient:spirit'], 'scene', recipient)),
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', preparation: 'Concentrate for one turn.', condition: 'One spirit per success within two hundred feet.' },
  },
  clarity: {
    effects: [flag('penalty:darkness', 'ignore', [], 'until:vision-use-ends'), flag('penalty:fog', 'ignore', [], 'until:vision-use-ends'), flag('penalty:invisibility', 'ignore', [], 'until:vision-use-ends'), flag('penalty:illusion', 'ignore', ['situation:activation-matched-illusion-successes'], 'until:vision-use-ends')],
    activation: { roll: true, duration: 'until:vision-use-ends' },
  },
  'combat-healing': { effects: [flag('healing:combat-regeneration', 'allow')], note: 'Regenerate one non-aggravated level each combat round without pausing or making a Stamina roll.' },
  adaptation: {
    effects: [flag('damage:hostile-environment', 'ignore', [], 'hours:successes'), flag('toxin:all', 'ignore', [], 'hours:successes'), flag('disease:all', 'ignore', [], 'hours:successes')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:successes' },
  },
  'coup-de-grace': {
    effects: [multiply('pool', 2, ['roll:damage', 'situation:next-successful-attack'], 'next-roll')],
    activation: { requiresTarget: true, cost: { willpower: 1 }, roll: true, duration: 'next-roll' },
  },
  'cowing-the-bullet': {
    effects: [add('pool', 2, ['roll:soak', 'weapon:manufactured'], 'scene', { unless: ['damage:silver'] })],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  disquiet: {
    effects: [add('difficulty', 1, ['task:extended-action'], 'scene', recipient), flag('resource:rage-regain', 'deny', [], 'scene', recipient)],
    activation: { roll: true, duration: 'scene' },
  },
  'eyes-of-the-cat': { effects: [flag('penalty:darkness', 'ignore')] },
  'fair-fortune': {
    effects: [flag('roll:reroll', 'allow', ['situation:failed-or-botched'], 'next-roll')],
    activation: { frequency: 'once-per-scene', cost: { gnosis: 1 }, roll: false, duration: 'next-roll', condition: 'Once per scene. Keep the reroll’s result.' },
  },
  'gift-of-the-skunk': {
    effects: [add('pool', negativeHalfSuccesses, ['sense:smell'], 'scene', recipient)],
    activation: { roll: true, duration: 'scene', condition: 'Target within ten feet. Immersion in water ends it; target first retches for a turn unless spending Willpower.' },
  },
  'great-leap': {
    effects: [set('movement:jump-feet', { per: 'successes', factor: 100 }, [], 'next-roll')],
    activation: { cost: { willpower: 1 }, roll: true, duration: 'next-roll' },
  },
  'heart-of-fury': {
    effects: [add('difficulty', halfSuccesses, ['roll:frenzy'], 'scene')],
    activation: { roll: true, duration: 'scene', condition: 'At scene end, spend one Willpower or immediately test frenzy at ordinary difficulty.' },
  },
  'laugh-of-the-hyena': { effects: [add('difficulty', 2, [...defensive, 'task:mental-compulsion', 'situation:laughing-aloud'])] },
  intrusion: {
    effects: [add('successes:automatic', successes, ['task:open-mystic-seal'], 'minutes:1'), flag('outcome:success', 'allow', ['task:pass-mundane-lock-or-barrier'], 'minutes:1')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'minutes:1' },
  },
  invisibility: {
    effects: [set('difficulty', 8, [...defensive, 'attribute:perception', 'ability:alertness', 'task:spot-source'], 'until:concentration-ends'), multiply('movement:walk', 0.5, [], 'until:concentration-ends')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:concentration-ends', condition: 'A searcher must also beat activation successes. Move no faster than half walking speed and avoid drawing attention.' },
  },
  'ley-lines': {
    effects: [flag('outcome:botch', 'allow', [...defensive, 'task:track-source', 'situation:failed-pursuit-resistance'], 'until:journey-ends')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:journey-ends', condition: 'Pursuers must win Perception + Occult, difficulty eight, to avoid the pursuit botch.' },
  },
  'might-of-thor': {
    effects: [multiply('attribute:strength', 2, [], 'turns:successes')],
    activation: { frequency: 'once-per-scene', cost: { gnosis: 1, rage: 1 }, roll: true, duration: 'turns:successes', allowRageGnosis: true, condition: 'Once per scene. The Gift explicitly requires both resources.' },
  },
  'merciful-blow': {
    effects: [flag('damage:temporary-unconsciousness', 'allow', ['roll:damage'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  pathfinder: {
    effects: [add('difficulty', 2, [...defensive, 'task:track-source'], 'until:journey-ends')],
    activation: { roll: true, duration: 'until:journey-ends' },
    note: 'The journey takes roughly ten percent less time per success, to a maximum reduction of one half.',
  },
  'redirect-pain': {
    effects: [add('pool', { per: 'trait', trait: 'sourceWoundPenalty' }, ['roll:wound-sensitive'], 'scene', recipient)],
    activation: { cost: { rage: 1 }, roll: true, duration: 'scene' },
    note: 'Uses the caster’s current wounds even when the caster ignores pain. Refresh when source wounds change.',
  },
  'scent-of-the-oathbreaker': {
    effects: [set('difficulty', 4, ['task:track', 'sense:smell', 'target:oathbreaker'], 'until:oathbreaker-met')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'until:oathbreaker-met', condition: 'The witnessed bound oath has been broken.' },
  },
  'shadow-cutting': {
    effects: [add('pool', -2, ['task:dodge', 'situation:shadow-attacked-by-source'], 'scene', recipient), flag('task:parry', 'deny', ['situation:shadow-attacked-by-source'], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  'reshape-object': {
    effects: [set('damage:type:aggravated', 1, ['item:reshaped-weapon'], 'scenes:successes')],
    activation: { cost: { gnosis: 2 }, roll: true, duration: 'scenes:successes', condition: 'The aggravated-weapon option costs a second Gnosis. Five or more successes make the object permanent.' },
  },
  'rending-the-craft': {
    effects: [flag('source:temporary-magic', 'deny', [], 'instant', recipient)],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'instant', condition: 'After a successful claw attack. Cancel temporary enhancements while preserving permanent and innate powers.' },
  },
  shell: {
    effects: [
      flag('mental:magic', 'ignore', [], 'scene'),
      flag('resource:rage-spend', 'deny', [], 'scene'),
      ...['empathy', 'primal_urge'].map((ability) => flag('outcome:failure', 'allow', [`ability:${ability}`], 'scene')),
      flag('outcome:failure', 'allow', ['roll:rage'], 'scene'),
    ],
    activation: { roll: true, duration: 'scene' },
  },
  'silver-claws': {
    effects: [
      set('damage:type:aggravated', 1, ['roll:damage', 'move:claw'], 'scene'),
      flag('damage:silver', 'allow', ['roll:damage', 'move:claw'], 'scene'),
      add('difficulty', 1, ['situation:non-combat'], 'scene'),
      add('resource:rage-per-turn', 1, [], 'scene'),
    ],
    activation: { roll: true, duration: 'scene', condition: 'Check frenzy each turn that Rage exceeds Willpower. Takes one turn to dismiss.' },
  },
  'sky-running': {
    effects: [set('movement:air-mph', 50, [], 'hours:4')],
    activation: { cost: { willpower: 1 }, roll: false, duration: 'hours:4', preparation: 'Concentrate for one turn.' },
  },
  'song-of-heroes': {
    effects: [add('ability:$choices.ability', halfSuccesses, [], 'until:sunrise', recipient)],
    choiceFields: [{ key: 'ability', label: 'Ability enhanced by the tale', kind: 'ability' }],
    activation: { cost: { gnosis: 2 }, roll: true, duration: 'until:sunrise', preparation: 'Tell a lengthy heroic tale to the listeners.' },
  },
  'song-of-rage': {
    effects: [flag('frenzy:berserk', 'allow', [], 'turns:successes', recipient)],
    activation: { roll: true, duration: 'turns:successes' },
  },
  'spirit-friend': {
    effects: [add('pool', successes, ['target:non-bane-spirit'], 'scene')],
    activation: { roll: true, duration: 'scene' },
  },
  'talons-of-the-falcon': {
    effects: [add('damage:levels', 3, ['roll:damage', 'situation:talons-attack-hit'], 'next-roll'), flag('healing:regeneration', 'deny', ['situation:talons-wounds'], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'next-roll', condition: 'The activation is a Dexterity + Brawl attack. The additional damage levels resist regeneration for the scene.' },
  },
  'strength-of-gaia': {
    effects: [add('attribute:strength', 3, ['form:lupus'], 'scene')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'scene' },
    note: 'Raises the ordinary Lupus form Strength bonus from +1 to +4.',
  },
  'under-the-gun': {
    effects: [add('difficulty', -2, [...defensive, 'roll:attack', 'weapon:ranged'], 'days:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'days:successes', preparation: 'Touch the victim.' },
  },
  'visceral-agony': {
    effects: [multiply('wound:penalty', 2, ['situation:wounded-by-source-this-turn'], 'scene', { ...recipient, unless: ['situation:pain-resistant'] })],
    activation: { cost: { rage: 1 }, roll: false, duration: 'turn', condition: 'Only wound penalties inflicted during this turn are doubled for the scene.' },
  },
  'weak-arm': {
    effects: [add('pool', { per: 'choice', choiceKey: 'dice' }, ['target:studied', 'roll:attack'], 'scene', { stackingKey: 'weak-arm' }), add('pool', { per: 'choice', choiceKey: 'dice' }, ['target:studied', 'roll:damage'], 'scene', { stackingKey: 'weak-arm' })],
    choiceFields: [{ key: 'dice', label: 'Reserve dice allocated to this attack or damage roll', kind: 'number', min: 0 }],
    activation: { requiresTarget: true, frequency: 'once-per-target-per-scene', roll: true, duration: 'scene', preparation: 'Study the target for one full turn.', allocation: { choiceKey: 'dice', limit: 'successes', consumeOnRoll: true }, condition: 'Once per target per scene. Allocate a total reserve equal to successes.' },
  },
  'wind-claws': {
    effects: [flag('soak:armor', 'ignore', ['weapon:natural', 'roll:damage'], 'turn')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'turn' },
  },
  'wings-of-pegasus': {
    effects: [set('movement:flight-mph', 50, ['form:hispo'], 'until:dismissed')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'until:dismissed', condition: 'Hispo only. Fine maneuvers require the printed Dexterity + Athletics roll.' },
  },
  'wisdom-of-the-ancient-ways': {
    effects: [add('difficulty', { per: 'trait', trait: 'background:ancestors', factor: -1 }, ['action:wisdom-of-the-ancient-ways'])],
  },
  'balors-gaze': {
    effects: [set('wound:penalty', -5, ['situation:failed-resistance'], 'until:dismissed', recipient)],
    activation: { cost: { rage: 1, gnosis: 1 }, roll: true, rollSpec: { attribute: 'perception', ability: 'occult', difficulty: 8, opposed: true }, duration: 'until:dismissed', allowRageGnosis: true, condition: 'Victim must fail to exceed activation successes on Willpower, difficulty eight.' },
  },
  'blurring-the-mirror': {
    effects: [add('gauntlet', 5, [], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene', condition: 'One Gnosis per target, up to five targets.' },
  },
  'body-shift': {
    effects: [
      add('attribute:$choices.to', { per: 'choice', choiceKey: 'dots' }, [], 'scene'),
      add('attribute:$choices.from', { per: 'choice', choiceKey: 'dots', factor: -1 }, [], 'scene'),
    ],
    choiceFields: [
      { key: 'from', label: 'Source Physical Attribute', kind: 'select', options: physicalAttributes },
      { key: 'to', label: 'Destination Physical Attribute', kind: 'select', options: physicalAttributes },
      { key: 'dots', label: 'Dots moved', kind: 'number', min: 1 },
    ],
    activation: { roll: true, duration: 'scene', distinctChoices: ['from', 'to'], allocation: { choiceKey: 'dots', limit: [{ per: 'successes', factor: 0.5, rounding: 'floor' }, { per: 'trait', trait: 'attribute:$choices.from', offset: -1 }] }, condition: 'Move one existing Physical Attribute dot per two successes, preserving the total and at least one dot in the source Attribute.' },
  },
  'body-wrack': {
    effects: [add('pool', -1, [], 'scene', recipient), flag('action:stunned', 'allow', [], 'turns:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
  },
  'dam-the-heartflood': {
    effects: [flag('resource:blood-spend', 'deny', [], 'turns:successes', recipient), flag('power:blood-magic', 'deny', [], 'turns:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'turns:successes' },
  },
  'bury-the-wolf': {
    effects: [flag('resource:rage-spend', 'deny', [], 'until:gift-expires'), flag('task:shapeshift', 'deny', [], 'until:gift-expires'), flag('curse:enabled', 'deny', [], 'until:gift-expires')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:gift-expires', condition: 'Must be in Homid. Printed success-based duration must be recorded on activation.' },
  },
  'chill-of-early-frost': {
    effects: [add('pool', -2, ['situation:no-natural-fur', 'situation:within-five-miles'], 'days:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'days:successes' },
  },
  'clenched-jaw': {
    effects: [
      set('difficulty', 3, ['roll:attack', 'move:bite', 'situation:maintaining-jaw-lock'], 'until:grip-released'),
      add('pool', { per: 'trait', trait: 'willpower', factor: 0.5, rounding: 'ceil' }, ['task:resist-breaking-jaw-lock'], 'until:grip-released'),
    ],
    activation: { requiresTarget: true, cost: { rage: 1 }, roll: false, duration: 'until:grip-released', condition: 'Activate after a successful bite.' },
  },
  gnaw: {
    effects: [add('pool', 2, ['roll:damage', 'move:bite'], 'scene')],
    activation: { cost: { willpower: 1 }, roll: true, rollSpec: { poolTrait: 'stamina+4', difficultyNote: '3 for wood, 6 for steel handcuffs, 9 for a train coupling.' }, duration: 'scene' },
  },
  gorge: {
    effects: ['rage', 'gnosis', 'willpower'].map((trait) => add(`resource:${trait}:capacity`, 3, [`choice:${trait}`])),
    choices: ['rage', 'gnosis', 'willpower'],
    note: 'Choose a resource at purchase; repeat purchases may select another resource. Extra capacity grants no extra roll dice.',
  },
  'full-moons-light': {
    effects: [flag('source:invisibility', 'deny', [], 'scene', recipient), flag('task:hide', 'deny', [], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene', condition: 'Affects enemies of the caster or pack within one mile.' },
  },
  'heart-of-the-mountain': {
    effects: [flag('outcome:success', 'allow', ['attribute:stamina'], 'scene', { unless: ['roll:soak'] }), set('soak:minimum-successes', 1, ['roll:soak'], 'scene'), flag('damage:drowning', 'ignore', [], 'scene')],
    activation: { cost: { rage: 1, willpower: 1 }, roll: false, duration: 'scene' },
  },
  'gift-of-the-porcupine': {
    effects: [set('damage:type:aggravated', 1, ['move:quill-grapple'], 'scene'), set('damage:base-strength-bonus', 1, ['move:quill-grapple'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene', condition: 'Crinos, Hispo or Lupus only. Weak bare-flesh hits against the user also trigger the printed quill damage.' },
  },
  'heros-stand': {
    effects: [...forAttributes(physicalAttributes, 'pool', successes, [], 'until:foes-defeated'), flag('situation:surprised', 'deny', [], 'until:foes-defeated'), flag('movement:leave-position', 'deny', [], 'until:foes-defeated')],
    activation: { roll: true, duration: 'until:foes-defeated', condition: 'Cannot move from the chosen position until all foes are defeated or flee.' },
  },
  'lunas-blessing': {
    effects: [
      flag('damage:silver-aggravated', 'ignore', ['situation:moon-visible']),
      add('dice:automatic-ones', 1, [...defensive, 'damage:silver', 'situation:moon-visible'], undefined, { unless: ['situation:full-moon'] }),
      add('dice:automatic-ones', 2, [...defensive, 'damage:silver', 'situation:moon-visible', 'situation:full-moon']),
    ],
    note: 'Silver takes its ordinary lethal or bashing type while the moon is visible; the added automatic ones count in the attacker’s roll.',
  },
  mindblock: {
    effects: ['mental-control', 'mind-reading', 'illusion', 'possession'].map((task) => set('difficulty', 10, [...defensive, `task:${task}`], undefined, { stackingKey: 'mindblock' })),
    note: 'Emotional manipulation is unaffected.',
  },
  'preternatural-awareness': {
    effects: [add('pool', negativeSuccesses, [...defensive, 'roll:attack'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
  },
  quicksand: {
    effects: [add('difficulty', 1, ['task:combat-maneuver', 'situation:in-bog'], 'until:bog-ends', { ...recipient, unless: ['recipient:packmate', 'recipient:caster'] }), multiply('movement:walk', 0.5, ['situation:in-bog'], 'until:bog-ends', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:bog-ends' },
  },
  'rattlers-bite': {
    effects: [multiply('damage:after-soak', 2, ['move:bite'], 'next-roll')],
    activation: { cost: { rage: 1 }, roll: false, duration: 'next-roll', condition: 'Spend before the bite attempt. Double only damage remaining after soak.' },
  },
  'scent-of-beyond': {
    effects: [add('pool', -3, ['task:react-to-local-surroundings'], 'until:dismissed')],
    activation: { roll: true, duration: 'until:dismissed' },
  },
  'speed-beyond-thought': {
    effects: [multiply('movement:run', 10, [], 'hours:8'), flag('action:non-running', 'deny', [], 'hours:8')],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:8', condition: 'Eat afterwards or face the printed hunger-frenzy risk.' },
  },
  'spirit-drain': {
    effects: [add('resource:willpower', halfSuccesses, [], 'scene'), add('resource:essence', negativeSuccesses, [], 'instant', recipient)],
    activation: { roll: true, duration: 'scene', condition: 'A resisted Gnosis roll against a spirit. Only excess Willpower expires at scene end.' },
  },
  'stoking-furys-furnace': {
    effects: [add('resource:rage-per-turn', 1, ['situation:damaged-this-turn']), flag('cost:rage-one-point-per-turn', 'ignore', ['situation:exactly-one-rage-spent-this-turn'])],
    note: 'The damage-triggered Rage does not provoke a frenzy check. Spending multiple Rage in the turn charges all points.',
  },
  'strength-of-the-dominator': {
    effects: [add('resource:rage-per-turn', -1, [], 'turns:successes', recipient), add('resource:rage-per-turn', 1, [], 'turns:successes')],
    activation: { frequency: 'once-per-target-per-scene', roll: true, duration: 'turns:successes', condition: 'Once per target per scene. Transfer only Rage actually lost by the victim.' },
  },
  'strike-the-air': {
    effects: [flag('outcome:failure', 'allow', [...defensive, 'roll:attack', 'actor:chosen-foe'], 'scene')],
    activation: { cost: { willpower: 1 }, roll: true, duration: 'scene', condition: 'Pay and roll separately for each foe; ends if the caster or an ally attacks that foe.' },
  },
  'terror-of-the-dire-wolf': {
    effects: [
      flag('delirium:enabled', 'allow', [], 'scene'),
      add('difficulty', 1, ['action:terror-of-the-dire-wolf', 'form:homid']),
      add('difficulty', 1, ['action:terror-of-the-dire-wolf', 'form:glabro']),
    ],
    activation: { cost: { rage: 1 }, roll: true, duration: 'scene' },
  },
  serenity: {
    effects: [flag('outcome:failure', 'allow', ['roll:rage'], 'turns:successes', recipient), flag('resource:rage-spend', 'deny', [], 'turns:successes', recipient), flag('frenzy:enabled', 'deny', [], 'turns:successes', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'turns:successes' },
  },
  'spirit-ward': {
    effects: [add('pool', negativeSuccesses, ['recipient:spirit', 'situation:within-one-hundred-feet'], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene' },
    note: 'Spirits within fifty feet also lose one Essence per turn per success, except caern spirits and the pack totem.',
  },
  'whelp-body': {
    effects: [add('attribute:$choices.attribute', { per: 'choice', choiceKey: 'dots', factor: -1 }, [], 'permanent', recipient)],
    choiceFields: [{ key: 'attribute', label: 'Physical Attribute reduced', kind: 'select', options: physicalAttributes, perTarget: true }, { key: 'dots', label: 'Dots removed', kind: 'number', min: 1, perTarget: true }],
    activation: { frequency: 'once-per-target-ever', cost: { gnosis: 1 }, roll: true, rollSpec: { attribute: 'gnosis', difficultyTrait: 'willpower', opposed: true }, duration: 'permanent', allocation: { choiceKey: 'dots', limit: 'successes' }, condition: 'Once ever per victim. Victim rolls the higher of Gnosis and Stamina, at caster Gnosis difficulty. Lost dots can subsequently be restored with experience.' },
  },
  'wither-limb': {
    effects: [add('difficulty', 2, ['attribute:dexterity'], 'until:limb-recovers', recipient), multiply('movement:run', 0.5, ['situation:withered-leg'], 'until:limb-recovers', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'until:limb-recovers', condition: 'Regenerating creatures recover at scene end.' },
  },
  'umbral-dodge': {
    effects: [add('difficulty', 1, ['task:dodge', 'situation:close-range'], 'next-roll'), { target: 'difficulty', operation: 'max', value: { per: 'trait', trait: 'gauntlet' }, when: ['task:dodge', 'situation:close-range'], duration: 'next-roll' }],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'next-roll', condition: 'A full dodge sends the attacker through the Gauntlet.' },
  },
  'beyond-human': {
    effects: [add('attribute:$choices.attribute', { per: 'choice', choiceKey: 'points' }, [], 'scene')],
    choiceFields: [{ key: 'attribute', label: 'Social Attribute enhanced', kind: 'select', options: socialAttributes }, { key: 'points', label: 'Rage or Gnosis points spent', kind: 'number', min: 1 }, { key: 'resource', label: 'Resource spent', kind: 'select', options: ['rage', 'gnosis'] }],
    activation: { roll: false, duration: 'scene', variableCost: { choiceKey: 'points', resource: '$choices.resource', minimum: 1 }, condition: 'Spend Rage or Gnosis, raising one Social Attribute by one per point. Can exceed five.' },
  },
  'chaos-mechanics': { effects: [flag('spend:rage-and-gnosis-same-turn', 'allow')] },
  'circular-attack': {
    effects: [flag('resource:rage-spend', 'deny', [], 'turn')],
    activation: { frequency: 'once-per-turn', cost: { willpower: 1 }, roll: true, duration: 'turn', condition: 'Once per turn. Each success dodges or redirects one attack.' },
  },
  'endurance-of-heimdall': {
    effects: [multiply('attribute:stamina', 2, [], 'scene')],
    activation: { cost: { gnosis: 2 }, roll: true, duration: 'scene' },
  },
  'feral-lobotomy': {
    effects: [add('attribute:intelligence', { per: 'choice', choiceKey: 'dots', factor: -1 }, [], 'permanent', recipient)],
    choiceFields: [{ key: 'gnosisSpent', label: 'Gnosis spent', kind: 'number', min: 1 }, { key: 'dots', label: 'Intelligence dots lost', kind: 'number', min: 0, perTarget: true }],
    activation: { roll: true, duration: 'permanent', variableCost: { choiceKey: 'gnosisSpent', resource: 'gnosis', minimum: 1 }, allocation: { choiceKey: 'dots', limit: ['successes', { per: 'trait', trait: 'gnosisSpent', factor: 0.5, rounding: 'floor' }] }, condition: 'Spend at least one Gnosis. Remove one Intelligence dot per two Gnosis, capped by successes.' },
  },
  assimilation: {
    effects: [flag('penalty:social-cultural', 'ignore', ['target:chosen-culture'], 'until:assimilation-ends')],
    choiceFields: [{ key: 'culture', label: 'Culture being assimilated', kind: 'text' }, { key: 'willpowerSpent', label: 'Willpower spent to extend the effect', kind: 'number', min: 0 }],
    activation: { roll: true, duration: 'until:assimilation-ends', variableCost: { choiceKey: 'willpowerSpent', resource: 'willpower', minimum: 0 }, condition: 'Lasts for one scene plus one day per Willpower spent. Record that fictional expiry on the effect.' },
  },
  'divine-wind': {
    effects: [add('successes:automatic', { per: 'choice', choiceKey: 'rageSpent' }, ['action:divine-wind'])],
    choiceFields: [{ key: 'rageSpent', label: 'Rage spent', kind: 'number', min: 1 }],
    activation: { roll: true, duration: 'scene', variableCost: { choiceKey: 'rageSpent', resource: 'rage', minimum: 1 } },
    note: 'Every Rage point adds one activation success. Each total success produces one mile of storm radius.',
  },
  gremlins: {
    effects: [add('pool', { per: 'choice', choiceKey: 'bonusDice' }, ['action:gremlins'])],
    choiceFields: [{ key: 'bonusDice', label: 'Roleplaying bonus dice awarded by the Storyteller', kind: 'number', min: 0, max: 3 }],
    activation: { roll: true, duration: 'instant', condition: 'Any roleplaying bonus is awarded by the Storyteller. The printed one-to-three dice are discretionary.' },
  },
  'fog-on-the-moor': {
    effects: [flag('damage:non-silver', 'ignore', [], 'turns:successes'), flag('healing:regeneration', 'deny', [], 'turns:successes')],
    activation: { cost: { willpower: 1 }, roll: true, duration: 'turns:successes' },
  },
  'malleable-spirit': {
    effects: [add('$choices.trait', { per: 'choice', choiceKey: 'change' }, ['recipient:spirit'], 'until:spirit-reformed', recipient)],
    choiceFields: [
      { key: 'trait', label: 'Spirit trait changed', kind: 'select', options: ['resource:rage', 'resource:gnosis', 'resource:willpower', ...[...physicalAttributes, ...mentalAttributes, ...socialAttributes].map((attribute) => `attribute:${attribute}`)], perTarget: true },
      { key: 'change', label: 'Storyteller-confirmed trait change', kind: 'number', perTarget: true },
    ],
    activation: { roll: true, rollSpec: { attribute: 'gnosis', difficulty: 6, opposed: true }, duration: 'until:spirit-reformed', condition: 'Requires a spirit target and a resisted Gnosis contest. Trait alteration is difficulty six; disposition and type use different difficulties.' },
  },
  'gift-of-the-spriggan': {
    effects: [add('pool', { per: 'choice', choiceKey: 'sizeIncreases', factor: 3 }, ['attribute:strength', 'situation:grown'], 'hours:successes')],
    choiceFields: [{ key: 'sizeIncreases', label: '100% increases over normal size', kind: 'number', min: 0, max: 2 }],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'hours:successes' },
  },
  'halo-of-the-sun': {
    effects: [
      add('pool', 2, ['roll:damage', 'weapon:hand-to-hand'], 'scene'),
      ...['homid', 'glabro'].flatMap((form) => [
        set('damage:type:aggravated', 1, ['roll:damage', 'weapon:hand-to-hand', `form:${form}`], 'scene'),
      ]),
      add('difficulty', 3, [...defensive, 'roll:attack', 'situation:facing-source'], 'scene'),
    ],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
    note: 'The two extra damage dice apply to hand-to-hand attacks. Homid and Glabro attacks also become aggravated. Nearby vampires suffer the rule’s separate sunlight damage.',
  },
  'harmonious-unity-of-the-emerald-mother': {
    effects: [add('attribute:strength', 4, ['form:homid'], 'days:1'), add('attribute:dexterity', 1, ['form:homid'], 'days:1'), add('attribute:stamina', 3, ['form:homid'], 'days:1'), flag('healing:regeneration', 'allow', ['form:homid'], 'days:1')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'days:1' },
  },
  'kiss-of-helios': {
    effects: [flag('damage:natural-fire', 'ignore', [], 'scene'), set('damage:artificial-or-magical-fire-per-turn', 1, [], 'scene'), set('damage:type:bashing', 1, ['damage:artificial-or-magical-fire'], 'scene'), add('pool', 2, ['roll:damage', 'weapon:burning'], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene' },
  },
  'lunas-avenger': {
    effects: [flag('damage:silver', 'ignore', [], 'scene'), flag('damage:silver', 'allow', ['roll:damage', 'weapon:natural'], 'scene'), add('attribute:stamina', 2, [], 'scene'), add('health:temporary', 1, [], 'scene')],
    activation: { cost: { gnosis: 1 }, roll: false, duration: 'scene', preparation: 'Concentrate for one full turn.' },
    note: 'Damage marked in the temporary health level disappears harmlessly when the Gift ends (W20 p.195).',
  },
  'paws-of-the-newborn-cub': {
    effects: [flag('source:supernatural', 'deny', [], 'turns:successes', recipient)],
    activation: { cost: { gnosis: 2 }, roll: true, duration: 'turns:successes' },
  },
  'part-the-veil': {
    effects: [flag('delirium:enabled', 'deny', [], 'scene', recipient)],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'scene', condition: 'A human recipient. Subsequent memory effects follow the printed rule.' },
  },
  'protean-form': {
    effects: [
      add('pool', 2, ['roll:attack', 'move:$choices.maneuver', 'choice:benefit:attack'], undefined, { stackingKey: 'protean-form' }),
      add('pool', 2, ['roll:damage', 'move:$choices.maneuver', 'choice:benefit:damage'], undefined, { stackingKey: 'protean-form' }),
      add('movement:yards-per-turn', 5, ['choice:benefit:movement']),
    ],
    choiceFields: [{ key: 'description', label: 'Partial transformation', kind: 'text' }, { key: 'maneuver', label: 'Affected attack category', kind: 'text' }, { key: 'benefit', label: 'Benefit', kind: 'select', options: ['attack', 'damage', 'movement'] }],
    note: 'The alteration must logically grant exactly one of the documented benefits.',
  },
  'reach-the-umbra': { effects: [add('difficulty', -2, ['task:cross-realms']), flag('task:step-sideways', 'allow', ['situation:instant-step'])] },
  'strength-of-will': {
    effects: [add('resource:willpower', successes, [], 'scene', recipient)],
    activation: { frequency: 'once-per-scene', cost: { willpower: 1 }, roll: true, duration: 'scene', excludeCaster: true, condition: 'Once per scene. Caster does not receive the granted points.' },
  },
  'summon-net-spider': {
    effects: [multiply('difficulty', 0.5, ['task:use-build-hack-computer'])],
    note: 'Halving computer difficulties is permanent upon learning; summoning the spirit separately costs one Gnosis and a Charisma + Computer roll.',
  },
  survivor: {
    effects: [flag('penalty:hostile-environment', 'ignore', [], 'days:successes'), multiply('toxin:wyrm-effect', 0.5, [], 'days:successes'), add('attribute:stamina', 3, ['choice:additionalGnosis:1'], 'turns:10'), flag('wound:penalty', 'ignore', ['choice:additionalGnosis:1'], 'turns:10')],
    choiceFields: [{ key: 'additionalGnosis', label: 'Additional Gnosis for enhanced endurance', kind: 'number', min: 0, max: 1 }],
    activation: { cost: { gnosis: 1 }, roll: true, duration: 'days:successes', variableCost: { choiceKey: 'additionalGnosis', resource: 'gnosis', minimum: 0 }, durationOverrides: [{ choiceKey: 'additionalGnosis', equals: 1, duration: 'turns:10' }], condition: 'An additional Gnosis grants +3 Stamina and ignores wounds, but ends the entire Gift after ten rounds.' },
    note: 'Needs no food, water or sleep while active. Sleep for eight hours after it expires.',
  },
  'as-in-the-beginning': {
    effects: [add('gauntlet', -1, [], 'permanent', { stackingKey: 'as-in-the-beginning' })],
    activation: { cost: { gnosis: 3 }, roll: true, duration: 'permanent', condition: 'The permanent one-point local reduction does not stack with repeated use.' },
  },
  'break-the-bonds': {
    effects: [flag('coercion:all', 'ignore'), set('attribute:strength', 15, ['task:break-restraints'])],
  },
  'shield-of-gaia': {
    effects: [flag('damage:$choices.technology', 'ignore', ['damage:$choices.technology'])],
    choiceFields: [{ key: 'technology', label: 'Weaver technology selected when learned', kind: 'text' }],
  },
  'unstoppable-warrior': {
    effects: [flag('healing:aggravated-as-lethal', 'allow', [], undefined, { unless: ['damage:silver'] })],
  },
};

// These two entries refer to another Gift verbatim in the printed book.
definitions['claws-of-frozen-death'] = definitions['fangs-of-the-north']!;
definitions['yus-endurance'] = definitions['heart-of-the-mountain']!;

export const GIFT_MODIFIER_RULES: Record<string, ModifierRule> = Object.fromEntries(
  W20_GIFT_CATALOG.flatMap((gift) => {
    const definition = definitions[gift.slug];
    if (!definition) return [];
    const activation = definition.activation?.roll
      ? {
          ...definition.activation,
          rollSpec: {
            ...(gift.rollAttribute ? { attribute: gift.rollAttribute } : {}),
            ...(gift.rollAbility ? { ability: gift.rollAbility } : {}),
            ...(gift.difficultyNote
              ? { difficultyNote: gift.difficultyNote }
              : { difficulty: gift.defaultDifficulty }),
            ...definition.activation.rollSpec,
          },
        }
      : definition.activation;
    return [[gift.id, {
      ...definition,
      ...(activation ? { activation } : {}),
      id: gift.id,
      name: gift.name,
      source: gift.source,
    }]];
  }),
);

/** Explicitly reviewed outcomes. New catalog entries must be reviewed before release. */
const reviewedNonModifierSlugs = new Set([
  'beast-speech',
  'beat-of-the-heart-drum',
  'brothers-scent',
  'control-simple-machine',
  'cooking',
  'create-element',
  'faerie-light',
  'falling-touch',
  'heavens-guidance',
  'hidden-killer',
  'infectious-laughter',
  'jam-weapon',
  'liars-face',
  'mans-skin',
  'mothers-touch',
  'open-seal',
  'perfect-recall',
  'plug-and-play',
  'rat-head',
  'see-past-the-skin',
  'sense-magic',
  'sense-prey',
  'sense-wyrm',
  'shed',
  'shroud',
  'spirit-of-the-lizard',
  'spirit-speech',
  'trash-is-treasure',
  'truth-of-gaia',
  'umbral-tether',
  'visions-of-duat',
  'whisper-catching',
  'wyld-resurgence',
  'axis-mundi',
  'beastmind',
  'between-the-cracks',
  'call-of-the-wyrm',
  'call-to-duty',
  'clap-of-thunder',
  'coils-of-the-serpent',
  'cold-voice-of-reason',
  'command-spirit',
  'command-the-gathering',
  'cybersenses',
  'dreamspeak',
  'empathy',
  'feed-the-pack',
  'fetish-fetch',
  'glib-tongue',
  'grandmothers-touch',
  'guise-of-the-hound',
  'hands-full-of-thunder',
  'howl-of-the-banshee',
  'howl-of-the-unseen',
  'howls-in-the-night',
  'jam-technology',
  'king-of-the-beasts',
  'kneel',
  'mark-of-the-wolf',
  'name-the-spirit',
  'power-surge',
  'sense-silver',
  'shadows-at-dawn',
  'sight-from-beyond',
  'song-of-the-earth-mother',
  'speak-with-wind-spirits',
  'speech-of-the-world',
  'spiders-song',
  'staredown',
  'storm-winds-slash',
  'taking-the-forgotten',
  'true-fear',
  'wuxing',
  'call-the-rust',
  'calm-the-savage-beast',
  'chameleon',
  'control-complex-machine',
  'dark-of-night',
  'dazzle',
  'direct-the-storm',
  'electroshock',
  'elemental-favor',
  'exorcism',
  'eye-of-the-cobra',
  'faerie-kin',
  'gift-of-the-termite',
  'heart-claw',
  'icy-chill-of-despair',
  'liars-craft',
  'lovers-touch',
  'mark-of-the-death-wolf',
  'mental-speech',
  'monkey-tail',
  'open-moon-bridge',
  'paralyzing-stare',
  'predators-many-eyes',
  'pulse-of-the-invisible',
  'render-down',
  'scrying',
  'sense-balance',
  'sense-the-unnatural',
  'silence-the-weaver',
  'song-of-the-siren',
  'territory',
  'trackless-waste',
  'umbral-camouflage',
  'venom-blood',
  'web-walker',
  'winds-returning-favor',
  'wrath-of-gaia',
  'yaos-commands',
  'attunement',
  'beast-life',
  'black-mark',
  'blink',
  'bridge-walker',
  'call-elemental',
  'call-of-the-cannibal-spirit',
  'cocoon',
  'doppelganger',
  'durance',
  'gift-of-dreams',
  'grasp-the-beyond',
  'hand-of-the-earth-lords',
  'howl-of-death',
  'infest',
  'lash-of-rage',
  'living-treasure',
  'mastery',
  'open-wounds',
  'phantasm',
  'roll-over',
  'scream-of-gaia',
  'shadows-by-the-firelight',
  'sidestep-death',
  'signal-rider',
  'take-the-true-form',
  'tech-speak',
  'uncaught-since-the-primal-morn',
  'wasp-talons',
  'call-the-hunt',
  'crocodile-pact',
  'curse-of-lycaon',
  'elemental-gift',
  'fabric-of-the-mind',
  'fenris-bite',
  'fetish-doll',
  'gaias-vengeance',
  'gate-of-the-moon',
  'geas',
  'gorgons-gaze',
  'head-games',
  'heart-of-ice',
  'horde-of-valhalla',
  'huang-dis-sacrifice',
  'invoke-the-spirits-of-the-storm',
  'madness',
  'mask-taint',
  'obedience',
  'riot',
  'scabwalker-curse',
  'shadow-pack',
  'song-of-the-great-beast',
  'the-living-wood',
  'thieving-talons-of-the-magpie',
  'thousand-forms',
  'totem-gift',
  'ultimate-argument-of-logic',
  'wall-of-granite',
  'wisdom-of-the-seer',
  'wyld-warp',
  'call-great-fenris',
  'firebringer',
  'renew-the-cycle',
]);

export interface GiftModifierCoverage {
  id: string;
  slug: string;
  disposition: 'defined' | 'no_modifier' | 'unreviewed';
  source: { book: string; page?: number };
  note: string;
}

/**
 * Every catalog Gift receives a disposition. The catalog itself retains activation
 * rolls and immediate attacks, healing, travel, information and narrative powers.
 * This register covers persistent/conditional stat and roll modifications.
 */
export const GIFT_MODIFIER_COVERAGE: readonly GiftModifierCoverage[] = W20_GIFT_CATALOG.map((gift) => ({
  id: gift.id,
  slug: gift.slug,
  disposition: GIFT_MODIFIER_RULES[gift.id] ? 'defined' : reviewedNonModifierSlugs.has(gift.slug) ? 'no_modifier' : 'unreviewed',
  source: gift.source,
  note: GIFT_MODIFIER_RULES[gift.id]
    ? 'Mechanical effects are declared in GIFT_MODIFIER_RULES; activation, recipients and conditions remain explicit.'
    : reviewedNonModifierSlugs.has(gift.slug)
      ? gift.summary
      : 'This catalog entry has not received a modifier coverage review.',
}));
