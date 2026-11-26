import type { ModifierRule, RuleEffect, RuleMagnitude } from '../ruleTypes';
import { W20_BACKGROUND_CATALOG } from './backgrounds';
import { W20_FETISH_CATALOG, W20_TALEN_CATALOG } from './fetishes.data';
import { W20_MERITS_FLAWS_CATALOG } from './meritsFlaws.data';
import { W20_RITE_CATALOG } from './rites.data';
import { W20_TOTEM_CATALOG } from './totems.data';
import { W20_ARMOR_PRESETS, W20_WEAPON_PRESETS } from './equipmentPresets';

/** Effects are transcribed from the printed rules, independently of display summaries. */
export const ITEM_MODIFIER_RULES: Record<string, ModifierRule> = {};

const catalogs = [
  ...W20_MERITS_FLAWS_CATALOG, ...W20_FETISH_CATALOG, ...W20_TALEN_CATALOG,
  ...W20_RITE_CATALOG, ...W20_TOTEM_CATALOG,
  ...W20_BACKGROUND_CATALOG.map((entry) => ({
    ...entry, id: entry.key, name: entry.label,
    source: entry.source ?? { book: 'chronicle' },
  })),
];

for (const entry of catalogs) {
  ITEM_MODIFIER_RULES[entry.id] = {
    id: entry.id, name: entry.name, source: entry.source, effects: [],
    note: entry.source.book === 'W20'
      ? entry.summary || 'Resolve the documented effect with the Storyteller.'
      : 'The available source provides no verified W20 mechanical effect. Attach a documented custom rule.',
  };
}

function effect(target: string, value: RuleMagnitude, when?: string[], operation: RuleEffect['operation'] = 'add'): RuleEffect {
  return { target, operation, value, ...(when ? { when } : {}) };
}

function define(id: string, effects: RuleEffect[], extra: Partial<ModifierRule> = {}): void {
  if (!ITEM_MODIFIER_RULES[id]) throw new Error(`Unknown item rule ${id}`);
  ITEM_MODIFIER_RULES[id] = { ...ITEM_MODIFIER_RULES[id], effects, ...extra };
}

function difficulty(id: string, amount: number, when: string[]): void {
  define(id, [effect('difficulty', amount, when)]);
}

function pool(id: string, amount: RuleMagnitude, when: string[]): void {
  define(id, [effect('pool', amount, when)]);
}

function active(id: string, effects: RuleEffect[], duration: string, extra: Partial<ModifierRule['activation']> = {}): void {
  define(id, effects.map((entry) => ({ ...entry, duration })), { activation: { duration, ...extra } });
}

// Physical Merits and Flaws, W20 pp. 472–474.
define('merit-acute-senses', [{ ...effect('difficulty', -2, ['sense:$choice']), unless: ['sense:impaired:$choice'], stackingKey: 'acute-sense' }], {
  choices: ['sight', 'hearing', 'smell', 'touch', 'taste'],
  note: 'Choose an unimpaired sense. Different senses can be purchased separately; one Acute Sense reduction applies per roll.',
});
active('merit-alcohol-tolerance', [effect('penalty:intoxication', 1, ['intoxicant:natural'], 'ignore')], 'intoxication', { roll: true, condition: 'Succeed on Stamina at difficulty 7; excludes poisons and synthetic drugs.' });
define('merit-ambidextrous', [effect('penalty:off_hand', 1, undefined, 'ignore')]);
difficulty('merit-double-jointed', -2, ['action:flexibility']);
define('merit-mixed-morph', [effect('difficulty', 6, ['action:partial_transformation'], 'set'), effect('cost:partial-shift-willpower', 0, ['source:dots:5'], 'set')]);
difficulty('merit-perfect-balance', -2, ['action:balance']);
define('merit-wolf-sight', [
  { ...effect('pool', 1, ['attribute:perception', 'sense:sight', 'scene:night']), stackingKey: 'wolf-sight' },
  { ...effect('pool', 1, ['attribute:perception', 'sense:sight', 'subject:moving']), stackingKey: 'wolf-sight' },
]);
define('merit-fair-glabro', [effect('form:social_penalty', 1, ['form:glabro'], 'ignore')]);
define('merit-lack-of-scent', [effect('target:difficulty', 2, ['target:source', 'action:tracking', 'sense:smell'])]);
pool('merit-physically-impressive', 1, ['roll:social', 'action:intimidation']);
define('merit-daredevil', [effect('pool', 3, ['action:risky_noncombat']), effect('botch:negate_dice', 1, ['action:risky_noncombat'])]);
active('merit-long-distance-runner', [effect('movement:run', 2, undefined, 'multiply')], 'Stamina hours');
define('merit-natural-weapons', [effect('difficulty', -1, ['roll:attack', 'weapon:natural', 'form:lupus']), effect('difficulty', 1, ['roll:attack', 'weapon:natural', 'form:homid'])]);
define('merit-huge-size', [effect('health:bruised', 1)]);
define('merit-metamorph', [effect('shift:automatic_successes', 5), effect('shift:rage_cost', 0, undefined, 'set'), effect('shift:roll_required', 0, undefined, 'set')]);
define('flaw-animal-musk', [
  { ...effect('difficulty', 2, ['roll:social', 'scene:indoors']), unless: ['target:lupus', 'target:wolf'], stackingKey: 'animal-musk' },
  { ...effect('difficulty', 2, ['roll:social', 'scene:crowded']), unless: ['target:lupus', 'target:wolf'], stackingKey: 'animal-musk' },
]);
define('flaw-anosmia', [
  effect('roll:automatic_failure', 1, ['sense:smell'], 'allow'), effect('roll:automatic_failure', 1, ['sense:taste'], 'allow'),
  effect('form:perception_difficulty', 1, ['form:lupus'], 'ignore'),
]);
define('flaw-hard-of-hearing', [effect('difficulty', 2, ['sense:hearing']), effect('form:perception_difficulty', 1, ['form:lupus', 'sense:hearing'], 'ignore')]);
define('flaw-short', [effect('movement:run', 0.5, undefined, 'multiply')]);
define('flaw-one-eye', [effect('difficulty', 2, ['attribute:perception', 'sense:sight']), effect('difficulty', 1, ['action:depth_perception'])]);
define('flaw-bad-sight', [effect('difficulty', 2, ['sense:sight']), effect('form:perception_difficulty', 1, ['form:lupus', 'sense:sight'], 'ignore')]);
define('flaw-lame', [effect('movement:walk', 0.25, undefined, 'multiply'), effect('movement:jog', 0, undefined, 'set'), effect('movement:run', 0, undefined, 'set')]);
define('flaw-monstrous', [effect('attribute:appearance', 0, undefined, 'set')]);
define('flaw-one-arm', [effect('pool', -2, ['action:two_handed']), effect('movement:run', 0.5, ['form:hispo'], 'multiply'), effect('movement:run', 0.5, ['form:lupus'], 'multiply'), effect('penalty:off_hand', 1, undefined, 'ignore')]);
difficulty('flaw-deaf', 3, ['attribute:perception', 'sense:hearing']);
define('flaw-mute', [effect('communication:speech', 1, undefined, 'deny')]);
define('flaw-blind', [effect('roll:automatic_failure', 1, ['sense:vision_only'], 'allow'), effect('difficulty', 2, ['attribute:dexterity']), effect('difficulty', 1, ['action:step_sideways'])]);
define('flaw-no-partial-transformation', [effect('shift:partial', 1, undefined, 'deny')]);
define('flaw-deformity', [
  effect('attribute:dexterity', -2, ['choice:hunchback']),
  effect('attribute:dexterity', -2, ['choice:withered-arm', 'action:manual_manipulation']),
  { ...effect('difficulty', 1, ['roll:social', 'choice:hunchback']), stackingKey: 'deformity-social' },
  { ...effect('difficulty', 1, ['roll:social', 'choice:withered-arm']), stackingKey: 'deformity-social' },
], {
  choices: ['hunchback', 'withered-arm', 'custom'],
  note: 'The two printed examples impose these penalties. Select the agreed deformity; custom deformities require a documented custom rule and may also alter movement.',
});

// Mental and Social entries, pp. 474–482. Situation tags require explicit confirmation.
difficulty('merit-computer-aptitude', -2, ['action:computers']);
define('merit-concentration', [effect('penalty:distraction', 1, undefined, 'ignore')]);
difficulty('merit-expert-driver', -2, ['ability:drive']);
difficulty('merit-lightning-calculator', -2, ['action:mental_math']);
define('merit-mechanical-aptitude', [{ ...effect('difficulty', -2, ['action:mechanical_device']), unless: ['ability:drive', 'action:electronics'] }]);
active('merit-berserker', [effect('wound:penalty', 1, ['state:berserk'], 'ignore')], 'berserk frenzy');
pool('merit-code-of-honor', 2, ['attribute:willpower', 'action:honor_code']);
difficulty('merit-inner-strength', -2, ['attribute:willpower', 'situation:overwhelming_odds']);
pool('merit-natural-linguist', 3, ['action:language']);
difficulty('merit-calm-heart', 2, ['roll:rage']);
pool('merit-iron-will', 3, ['action:resist_direct_mental_control']);
define('merit-jack-of-all-trades', [effect('penalty:untrained_skill', 1, undefined, 'ignore'), effect('untrained:knowledge', 1, undefined, 'allow'), effect('difficulty', 2, ['ability:untrained_knowledge'])]);
define('merit-untamable', [
  effect('control:domination', 1, undefined, 'deny'),
  effect('target:roll:automatic_failure', 1, ['target:source', 'action:vampiric_domination'], 'allow'),
  ...['roll-over', 'obedience', 'mastery'].map((gift) => effect('target:roll:automatic_failure', 1, ['target:source', `gift:${gift}`], 'allow')),
]);
define('merit-seldom-sleeps', [effect('penalty:sleep_deprivation', 1, undefined, 'ignore')]);
define('merit-self-confident', [effect('willpower:refund_on_additional_success', 1, undefined, 'allow')], { note: 'At final difficulty 6+, refund a Willpower point spent for an automatic success when the roll earns another success.' });
difficulty('flaw-intolerance', 2, ['subject:intolerance']);
active('flaw-nightmares', [effect('pool', -1)], 'day', { condition: 'Failed waking Willpower roll at difficulty 7.' });
define('flaw-shy', [
  { ...effect('difficulty', 2, ['roll:social', 'target:stranger']), unless: ['situation:center_of_attention'] },
  effect('difficulty', 3, ['roll:social', 'situation:center_of_attention']),
]);
difficulty('flaw-speech-impediment', 2, ['action:verbal_communication']);
define('flaw-pack-mentality', [effect('difficulty', -1, ['pack:present', 'action:group_activity']), effect('difficulty', 2, ['pack:absent'])]);
difficulty('flaw-short-fuse', -2, ['roll:rage']);
define('flaw-weak-willed', [effect('difficulty', 2, ['action:resist_intimidation']), effect('difficulty', 2, ['action:resist_leadership']), effect('difficulty', 2, ['action:resist_mind_magic']), effect('resource:willpower:max', 4, undefined, 'min')]);
ITEM_MODIFIER_RULES['flaw-weak-willed'].effects.push(effect('target:outcome:success', 1, ['target:source', 'action:domination_gift'], 'allow'));
active('flaw-flashbacks', [effect('resource:willpower', 1, undefined, 'set')], 'session', { condition: 'Failed session-opening Willpower roll.' });
define('flaw-ability-deficit', [effect('creation:ability_budget:$choice', -5), effect('creation:ability_dot_max:$choice', 2, undefined, 'min')], { choices: ['talents', 'skills', 'knowledges'], note: 'The chosen Ability category receives five fewer starting points and none of its Abilities can reach three dots during character creation (W20 p. 478).' });
pool('merit-pitiable', 1, ['roll:social', 'action:appeal_to_pity']);
define('merit-camp-goodwill', [effect('difficulty', -1, ['roll:social', 'target:camp:$choices.camp'])], { choiceFields: [{ key: 'camp', label: 'Chosen camp', kind: 'text' }], note: 'Set the chosen tribal camp.' });
difficulty('merit-animal-magnetism', -2, ['action:attract_own_breed']);
pool('merit-natural-leader', 2, ['ability:leadership']);
difficulty('merit-notable-heritage', -1, ['roll:social', 'target:heritage_society']);
pool('merit-reputation', 3, ['roll:social', 'target:sept_garou']);
define('merit-supporter', [effect('difficulty', -2, ['roll:social']), effect('pool', 1, ['action:group_effort'])]);
pool('flaw-conniver', -1, ['roll:social', 'action:request_trust']);
difficulty('flaw-naive', 2, ['action:detect_ill_intent']);
define('flaw-camp-enmity', [effect('difficulty', 1, ['roll:social', 'target:camp:$choices.camp'])], { choiceFields: [{ key: 'camp', label: 'Chosen camp', kind: 'text' }] });
pool('flaw-gullible', -3, ['action:deceit']);
define('flaw-notoriety', [{ ...effect('pool', -2, ['roll:social', 'target:sept_garou']), unless: ['target:packmate'] }]);
pool('flaw-metis-child', -2, ['roll:social', 'target:garou_knows_child']);
difficulty('merit-ancestor-ally', -2, ['action:contact_chosen_ancestor']);
define('merit-moon-bound', [effect('pool', 1, ['moon:auspice_waxing']), effect('pool', -1, ['moon:auspice_waning'])]);
difficulty('merit-natural-channel', -1, ['action:step_sideways']);
define('merit-true-love', [effect('roll:automatic_successes', 1, ['attribute:willpower', 'action:protect_or_reach_true_love'])]);
define('merit-lucky', [effect('reroll:story_limit', 3, undefined, 'set'), effect('reroll:per_result_limit', 1, undefined, 'set')]);
define('merit-immune-to-wyrm-emanations', [effect('penalty:wyrm_toxin', 1, undefined, 'ignore'), effect('possession:bane', 1, undefined, 'deny'), effect('target:roll:automatic_failure', 1, ['target:source', 'action:bane_possession'], 'allow')]);
define('merit-silver-tolerance', [effect('soak:silver', 1, undefined, 'allow'), effect('difficulty', 8, ['roll:soak', 'damage:silver'], 'set')]);
difficulty('flaw-slip-sideways', -1, ['action:involuntary_step_sideways']);
define('flaw-banned-transformation', [
  { ...effect('shift', 1, ['situation:transformation_banned'], 'deny'), unless: ['target:breed_form'] },
  { ...effect('shift', 1, undefined, 'allow'), duration: 'one shift' },
], { activation: { duration: 'one shift', cost: { willpower: 1 }, roll: true, condition: 'The chosen ban is present. A successful difficulty-8 Willpower roll permits the otherwise blocked transformation.' } });
define('flaw-forced-transformation', [
  { ...effect('shift:forced_form:$choice', 1, ['situation:forced_transformation_trigger'], 'allow'), unless: ['shift:suppressed'] },
  { ...effect('shift', 1, ['situation:forced_transformation_trigger'], 'deny'), unless: ['target:forced_form', 'shift:suppressed'] },
  { ...effect('shift:forced', 1, undefined, 'ignore'), duration: 'trigger occurrence' },
], {
  choices: ['homid', 'glabro', 'crinos', 'hispo', 'lupus'],
  activation: { duration: 'trigger occurrence', cost: { willpower: 1 }, condition: 'Spend Willpower to resist this occurrence of the agreed trigger. Otherwise shift to the chosen form and remain there until the trigger passes.' },
});
define('flaw-docile', [effect('resource:rage:max', { per: 'dots', factor: -2, offset: 10 }, undefined, 'min')]);
define('flaw-mark-of-the-predator', [effect('ability:animal_ken', 0, undefined, 'set')]);
define('flaw-pierced-veil', [effect('delirium:trigger', 1, undefined, 'deny')]);
active('flaw-harano-prone', [effect('pool', -1)], 'scene', { condition: 'Failed Willpower check after a setback; a Willpower spend delays onset.' });
difficulty('flaw-taint-of-corruption', 2, ['action:resist_wyrmspawn_power']);

// Kinfolk appendix, pp. 382–383.
pool('merit-kinfolk-feral-appearance', 1, ['attribute:appearance', 'target:garou']);
pool('merit-kinfolk-gall', 1, ['roll:social', 'action:courage']);
difficulty('merit-kinfolk-recognize-garou', -2, ['attribute:perception', 'action:recognize_garou']);
difficulty('flaw-kinfolk-inferiority-complex', 1, ['action:lead_or_take_responsibility']);
define('merit-kinfolk-good-old-boy-or-girl', [
  { ...effect('pool', 1, ['roll:social', 'target:garou']), stackingKey: 'good-old-boy' },
  { ...effect('pool', 1, ['roll:social', 'target:kinfolk']), stackingKey: 'good-old-boy' },
]);
define('flaw-kinfolk-outsider', [
  { ...effect('difficulty', 2, ['roll:social', 'target:garou']), stackingKey: 'kinfolk-outsider' },
  { ...effect('difficulty', 2, ['roll:social', 'target:kinfolk']), stackingKey: 'kinfolk-outsider' },
]);
define('merit-kinfolk-gnosis', [effect('resource:gnosis', { per: 'dots', offset: -4 }, undefined, 'max')]);
define('flaw-kinfolk-veiled', [effect('delirium:chart', 1), effect('delirium:veil_alteration', 1, undefined, 'deny')]);

// Backgrounds, pp. 135–140. Ownership and activation are distinct.
define('pure_breed', [
  { ...effect('pool', 'dots', ['roll:social', 'target:garou']), stackingKey: 'pure-breed' },
  { ...effect('pool', 'dots', ['action:formal_challenge']), stackingKey: 'pure-breed' },
]);
define('spirit_heritage', [
  { ...effect('pool', 'dots', ['roll:social', 'target:spirit:$choices.spirit']), stackingKey: 'spirit-heritage' },
  { ...effect('pool', 'dots', ['action:challenge', 'target:spirit:$choices.spirit']), stackingKey: 'spirit-heritage' },
], { choiceFields: [{ key: 'spirit', label: 'Related spirit group', kind: 'text' }] });
active('ancestors', [effect('ability:$choices.ability', 'successes')], 'scene', { roll: true, condition: 'Once per session, Ancestors at difficulty 8 (10 for a specific ancestor).' });
ITEM_MODIFIER_RULES.ancestors.choiceFields = [{ key: 'ability', label: 'Ability provided by the ancestor', kind: 'ability' }];
active('fate', [effect('roll:automatic_successes', 'successes')], 'one failed or insufficient roll', {
  roll: true,
  correctsPreviousRoll: true,
  condition: 'Once per session, roll Fate at difficulty 8 and add its successes to the original roll. Storyteller may refuse uses contrary to fate.',
});

// Individual Totem blessings. Shared pack traits are explicitly assigned to a member.
define('totem-bear', [effect('attribute:strength', 1), { ...effect('ability:medicine', 3), recipient: 'shared', duration: 'assigned pack trait' }]);
define('totem-boar', [effect('attribute:stamina', 1), { ...effect('ability:brawl', 2), recipient: 'shared', duration: 'assigned pack trait' }]);
define('totem-fenris', [effect('attribute:$choice', 1)], { choices: ['strength', 'dexterity', 'stamina'] });
define('totem-fox', [effect('attribute:manipulation', 1)]);
pool('totem-grandfather-thunder', 2, ['ability:intimidation', 'action:invoke_thunder']);
define('totem-stag', [effect('attribute:stamina', 1, ['action:long_distance_running'])]);
define('totem-rat', [
  { ...effect('difficulty', -1, ['roll:attack', 'move:bite']), stackingKey: 'rat' },
  { ...effect('difficulty', -1, ['ability:stealth']), stackingKey: 'rat' },
  { ...effect('difficulty', -1, ['action:quiet']), stackingKey: 'rat' },
]);
difficulty('totem-chimera', -2, ['action:riddle_dream_enigma']);
define('totem-cockroach', [
  { ...effect('difficulty', -2, ['action:computers']), stackingKey: 'cockroach' },
  { ...effect('difficulty', -2, ['action:electricity']), stackingKey: 'cockroach' },
  { ...effect('difficulty', -2, ['action:applied_science']), stackingKey: 'cockroach' },
  { ...effect('pool', 3, ['action:technology_gift']), recipient: 'shared', duration: 'assigned pack trait' },
]);
define('totem-owl', [
  effect('movement:flight', 1, ['realm:umbra'], 'allow'),
  { ...effect('difficulty', -2, ['ability:stealth']), stackingKey: 'owl' },
  { ...effect('difficulty', -2, ['action:silence']), stackingKey: 'owl' },
  { ...effect('pool', 3, ['action:air_travel_movement_darkness_gift']), recipient: 'shared', duration: 'assigned pack trait' },
]);
define('totem-uktena', [effect('pool', 3, ['roll:soak', 'realm:umbra']), { ...effect('difficulty', 1, ['roll:social', 'target:non_uktena_tribe']), unless: ['target:wendigo'] }]);
define('totem-unicorn', [
  effect('movement:all', 2, ['realm:umbra'], 'multiply'),
  { ...effect('difficulty', -2, ['action:healing']), stackingKey: 'unicorn-healing' },
  { ...effect('difficulty', -2, ['action:empathy']), stackingKey: 'unicorn-healing' },
  { ...effect('difficulty', 2, ['action:harm', 'target:garou']), unless: ['target:wyrm_tainted'] },
  { ...effect('pool', 3, ['action:healing_strength_protection_gift']), recipient: 'shared', duration: 'assigned pack trait' },
]);

const sharedTotemTraits: Record<string, Record<string, number>> = {
  'totem-falcon': { leadership: 3 }, 'totem-grandfather-thunder': { etiquette: 3 },
  'totem-pegasus': { animal_ken: 3 }, 'totem-stag': { survival: 3 },
  'totem-griffin': { alertness: 3 }, 'totem-chimera': { enigmas: 3, 'attribute:perception': 1 },
  'totem-raven': { survival: 3, subterfuge: 1, enigmas: 1 },
  'totem-coyote': { stealth: 3, streetwise: 3, subterfuge: 1, survival: 1 },
  'totem-cuckoo': { 'attribute:manipulation': 1, subterfuge: 2 },
  'totem-fox': { stealth: 2, streetwise: 2, subterfuge: 3 },
};
for (const [id, traits] of Object.entries(sharedTotemTraits)) {
  const rule = ITEM_MODIFIER_RULES[id];
  rule.effects.push(...Object.entries(traits).map(([trait, value]): RuleEffect => ({
    target: trait.startsWith('attribute:') ? trait : `ability:${trait}`,
    operation: 'add', value, recipient: 'shared', duration: 'assigned pack trait',
  })));
  rule.activation = { duration: 'assigned pack trait', condition: 'Assign this shared pack benefit to its current recipient; one member uses it at a time (W20 p. 140).' };
}

// Lifecycle events are explicit commands. Totem acceptance grants are applied once per source.
const totemAcceptance: Record<string, { trait: 'glory' | 'honor' | 'wisdom'; amount: number }> = {
  'totem-falcon': { trait: 'honor', amount: 2 },
  'totem-grandfather-thunder': { trait: 'honor', amount: 1 },
  'totem-pegasus': { trait: 'honor', amount: 2 },
  'totem-stag': { trait: 'honor', amount: 3 },
  'totem-bear': { trait: 'honor', amount: -5 },
  'totem-fenris': { trait: 'glory', amount: 2 },
  'totem-griffin': { trait: 'glory', amount: 2 },
  'totem-wendigo': { trait: 'glory', amount: 2 },
  'totem-chimera': { trait: 'wisdom', amount: 2 },
  'totem-owl': { trait: 'wisdom', amount: 2 },
  'totem-raven': { trait: 'wisdom', amount: 1 },
  'totem-uktena': { trait: 'wisdom', amount: 2 },
  'totem-unicorn': { trait: 'wisdom', amount: 3 },
};
for (const [id, grant] of Object.entries(totemAcceptance)) {
  ITEM_MODIFIER_RULES[id].effects.push(effect(`renown:${grant.trait}`, grant.amount, ['event:totem_acceptance']));
}
for (const [id, amount] of Object.entries({ 'totem-falcon': 4, 'totem-grandfather-thunder': 5, 'totem-pegasus': 3, 'totem-stag': 3, 'totem-rat': 5 })) {
  ITEM_MODIFIER_RULES[id].effects.push(effect('pack:willpower:story', amount, ['event:story_start'], 'set'));
}
for (const [id, trait, amount] of [
  ['totem-bear', 'honor', -1], ['totem-fox', 'honor', -1],
  ['totem-cuckoo', 'honor', -2], ['totem-coyote', 'wisdom', -1],
] as const) ITEM_MODIFIER_RULES[id].effects.push(effect(`renown:${trait}:award_adjustment`, amount, ['event:renown_award']));
ITEM_MODIFIER_RULES['totem-wendigo'].effects.push(effect('resource:rage', 5, ['event:story_start']));
ITEM_MODIFIER_RULES['totem-uktena'].effects.push(effect('experience:mystical', 2, ['event:story_end']));

// Fetishes and Talens, pp. 221–229, require successful activation or a Gnosis spend.
active('fetish-mirrorshades', [effect('difficulty', -2, ['action:step_sideways'])], 'activation', { roll: true });
active('fetish-nyxs-bangle', [effect('pool', 4, ['ability:stealth', 'scene:night'])], 'night', { roll: true, condition: 'Activate at night.' });
active('fetish-truth-earring', [effect('target:difficulty', 3, ['target:source', 'action:audible_deception'])], 'activation', { roll: true });
active('fetish-chameleon-skin', [{ ...effect('target:difficulty', 3, ['target:source', 'action:spot_wearer', 'terrain:attuned']), stackingKey: 'camouflage' }], 'activation', { roll: true });
active('fetish-fang-dagger', [
  effect('damage:success_multiplier', 2, ['item:selected', 'roll:damage'], 'multiply'),
  effect('damage:type:aggravated', 1, ['item:selected', 'roll:damage'], 'allow'),
], 'one damage roll', { roll: true, condition: 'Activate after a successful hit; damage becomes aggravated.' });
active('fetish-wind-whistle', [{ ...effect('pool', -1, ['action:pursuit']), recipient: 'target' }], 'hour', { roll: true });
active('fetish-labrys-of-isthmene', [{ ...effect('initiative', 10), stackingKey: 'spirit-of-the-fray' }], 'scene', { roll: true, condition: 'Works only for female wielders; grants Spirit of the Fray.' });
active('fetish-apeskin', [effect('soak:silver', 1, ['form:homid'], 'allow'), effect('regeneration', 1, ['form:homid'], 'deny')], 'day', { roll: true });
active('fetish-beast-mask', [effect('regeneration', 1, undefined, 'deny'), effect('shift', 1, undefined, 'deny')], 'until mask removed', { roll: true, condition: 'Choose depicted animal and use its abilities.' });
active('fetish-phoebes-veil', [effect('target:roll:automatic_failure', 1, ['target:source', 'action:detect_wearer', 'sense:non_touch'], 'allow')], 'one minute per activation success', { roll: true, condition: 'Activate at night; ends when removed.' });
active('fetish-sanctuary-chimes', [{ ...effect('spirit:manifestation', 1, ['location:within_100_feet'], 'deny'), recipient: 'target', unless: ['spirit:invited'] }], 'day', { roll: true });
active('fetish-feathered-cloak', [effect('movement:flight', 1, undefined, 'allow')], 'until landing', { roll: true, condition: 'Horizontal flight at running speed or vertical at walking speed. Stamina + Athletics difficulty 5 every ten minutes.' });
active('fetish-unbroken-cord', [{ ...effect('ability:$choices.ability', { per: 'trait', trait: '$choices.ability' }, undefined, 'set'), recipient: 'target' }], 'scene', { cost: { gnosis: 1 }, condition: 'Pack leader shares one of her own Abilities; recipients cannot exceed her current Gnosis.' });
ITEM_MODIFIER_RULES['fetish-unbroken-cord'].choiceFields = [{ key: 'ability', label: 'Leader’s shared Ability', kind: 'ability' }];
define('fetish-klaive', [{ ...effect('resource:gnosis:capacity', -1, ['item:carried']), stackingKey: '$source:gnosis-capacity' }]);
define('fetish-grand-klaive', [{ ...effect('resource:gnosis:capacity', -2, ['item:carried']), stackingKey: '$source:gnosis-capacity' }]);

const fetishWeapons: Record<string, { difficulty?: number; damage: number }> = {
  'fetish-dagger-of-retribution': { difficulty: 4, damage: 0 },
  'fetish-dsiah': { difficulty: 7, damage: 0 },
  'fetish-sun-whip': { difficulty: 7, damage: 1 },
  'fetish-ironhammer': { damage: 2 },
  'fetish-klaive': { difficulty: 6, damage: 2 },
  'fetish-labrys-of-isthmene': { difficulty: 7, damage: 4 },
  'fetish-grand-klaive': { difficulty: 7, damage: 5 },
  'fetish-jarlhammer': { difficulty: 7, damage: 6 },
};
const knife = W20_WEAPON_PRESETS.find((weapon) => weapon.id === 'equipment-knife')!;
fetishWeapons['fetish-fang-dagger'] = { difficulty: knife.difficulty, damage: knife.damageDice };
ITEM_MODIFIER_RULES['fetish-fang-dagger'].note = 'Uses the ordinary knife profile (W20 p. 302). After a hit, activate the dagger to double damage successes before soak and inflict aggravated damage (p. 224).';
for (const [id, weapon] of Object.entries(fetishWeapons)) {
  ITEM_MODIFIER_RULES[id].effects.push(
    effect('weapon:strength_damage_bonus', weapon.damage, ['item:selected', 'roll:damage'], 'set'),
  );
  if (weapon.difficulty !== undefined) ITEM_MODIFIER_RULES[id].effects.push(effect('difficulty', weapon.difficulty, ['item:selected', 'roll:attack'], 'set'));
}
ITEM_MODIFIER_RULES['fetish-dsiah'].effects.push(effect('weapon:strength_damage_bonus', 3, ['item:selected', 'roll:damage', 'target:snake_kin'], 'set'));
ITEM_MODIFIER_RULES['fetish-sun-whip'].effects.push(effect('weapon:strength_damage_bonus', 4, ['item:selected', 'roll:damage', 'target:vampire'], 'set'));
ITEM_MODIFIER_RULES['fetish-jarlhammer'].choices = ['forge-crusher', 'grinding-tooth', 'spear-chaser', 'troll-eater', 'bright-arm', 'hag-talon', 'pain-eagle'];
ITEM_MODIFIER_RULES['fetish-jarlhammer'].effects.push(
  effect('target:pool', -1, ['target:source', 'roll:soak', 'situation:hit_by_source_weapon', 'variant:troll-eater']),
  effect('target:pool', -2, ['target:source', 'roll:attack', 'sense:sight', 'variant:bright-arm']),
  effect('pool', 3, ['attribute:willpower', 'action:resist_mind_power', 'variant:hag-talon']),
  { ...effect('wound:penalty', 2, ['variant:pain-eagle'], 'multiply'), recipient: 'target', duration: 'until wounds heal' },
);

active('talen-bane-arrows', [effect('attack:automatic_hit', 1, ['target:bane'], 'allow'), effect('weapon:flat_damage', 3, ['target:bane', 'roll:damage'], 'set')], 'one attack', { roll: true, consumable: true });
active('talen-gaias-breath', [effect('healing:levels', 4, undefined, 'set'), effect('healing:aggravated', 1, undefined, 'allow')], 'instant', { roll: true, consumable: true });
active('talen-nightshade', [{ ...effect('target:roll:automatic_failure', 1, ['target:source', 'action:detect_wearer', 'scene:darkness'], 'allow'), unless: ['observer:actively_searching'] }], 'hour', { roll: true, consumable: true });
active('talen-wind-snorkel', [effect('breathing', 1, undefined, 'allow')], 'until removed from mouth', { roll: true, consumable: true });

// Rites with ongoing numerical effects. Knowing a rite never applies its outcome.
active('rite-rite-of-the-opened-caern', [effect('pool', { per: 'choice' }, ['action:caern_affinity'])], 'caern use', { roll: true, condition: 'Win the resisted extended roll. Set choice value to caern rating.' });
active('rite-rite-of-the-glorious-past', [effect('background:ancestors', 1)], 'until dawn', { roll: true });
ITEM_MODIFIER_RULES['rite-rite-of-the-glorious-past'].effects.push({ ...effect('difficulty', -1, ['roll:activation', 'action:caern_rite']), duration: 'next caern rite' });
active('rite-voice-of-the-jackal', [{ ...effect('pool', -2, ['roll:social']), recipient: 'target' }], 'until lifted', { roll: true });
active('rite-rite-of-the-omega-wolf', [{ ...effect('pool', -3, ['ability:leadership', 'action:lead_pack']), recipient: 'target' }], 'until relinquishing leadership or achieving a great leadership victory', { roll: true });
active('rite-rite-of-praise', [{ ...effect('pool', 'successes', ['roll:social', 'target:sept']), recipient: 'target' }], 'three months', { roll: true });
active('rite-bone-rhythms', [effect('pool', 1, ['realm:umbra'])], 'one roll', { preparation: 'Three performances daily for three consecutive days.', consumable: true });
active('rite-breath-of-gaia', [
  { ...effect('difficulty', -2, ['action:healing']), stackingKey: 'breath-of-gaia' },
  { ...effect('difficulty', -2, ['action:detection']), stackingKey: 'breath-of-gaia' },
], 'one roll', { preparation: 'Perform daily for one full lunar cycle.', consumable: true });
active('rite-greet-the-moon', [effect('pool', 1, ['roll:social', 'target:auspice_phase_garou'])], 'next matching moon phase night', { preparation: 'Greet moonrise throughout one complete moon phase.' });
active('rite-greet-the-sun', [effect('pool', 1, ['action:sense_wyrm'])], 'while daily observance continues', { preparation: 'Nine consecutive sunrises, then continue every day.' });
active('rite-hunting-prayer', [effect('pool', 1, ['action:tracking'])], 'while every hunt is preceded by prayer', { preparation: 'Three lunar months of observance; carry the dedicated item.' });
active('rite-prayer-for-the-prey', [effect('difficulty', -1, ['target:nature_spirit'])], 'until a killed animal goes unthanked', { preparation: 'Thank every slain Gaian animal for one full lunar cycle.' });
active('rite-the-great-hunt', [{ ...effect('difficulty', 1, ['roll:activation', 'action:rite']), recipient: 'target' }], 'until next Midsummer', { condition: 'The sept failed its Great Hunt; apply to the sept’s ritemasters.' });
active('rite-rite-of-the-loyal-pack', [
  { ...effect('resource:willpower', 2, ['event:session_start', 'alpha:serving_pack']), recipient: 'target' },
  { ...effect('resource:willpower', -2, ['event:session_start', 'alpha:betrayed_pack']), recipient: 'target' },
], 'until alpha changes', { roll: true, condition: 'Storyteller determines whether the alpha has served the pack at each session start. Temporary Willpower remains capped by permanent rating.' });

const riteRenown: Record<string, Partial<Record<'glory' | 'honor' | 'wisdom', number>>> = {
  'rite-rite-of-ostracism': { glory: -1, honor: -5, wisdom: -1 },
  'rite-stone-of-scorn': { honor: -8, wisdom: -2 },
  'rite-voice-of-the-jackal': { glory: -2, honor: -5 },
  'rite-rite-of-the-omega-wolf': { honor: -4, wisdom: -2 },
  'rite-rite-of-wounding': { glory: 2 },
};
for (const [id, renown] of Object.entries(riteRenown)) {
  ITEM_MODIFIER_RULES[id].effects.push(...Object.entries(renown).map(([trait, amount]): RuleEffect => ({
    ...effect(`renown:${trait}`, amount), recipient: 'target', duration: 'instant',
  })));
}
active('rite-rite-of-accomplishment', [
  { ...effect('renown:$choices.renown', 0, undefined, 'set'), recipient: 'target' },
  { ...effect('renown:$choices.renown:permanent', 1), recipient: 'target' },
], 'instant', { roll: true, condition: 'The honored character has ten temporary points in the chosen Renown category. Convert those points into one permanent dot.' });
ITEM_MODIFIER_RULES['rite-rite-of-accomplishment'].choiceFields = [{ key: 'renown', label: 'Renown category', kind: 'select', options: ['glory', 'honor', 'wisdom'] }];
ITEM_MODIFIER_RULES['rite-the-great-hunt'].effects.push(
  { ...effect('renown:glory', 3, ['hunt:successful']), recipient: 'target', duration: 'instant' },
  { ...effect('renown:glory', -2, ['hunt:failed']), recipient: 'target', duration: 'instant' },
);

// Bonuses to performing the selected rite apply during its own activation roll.
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-bridge'].effects.push(effect('pool', 3, ['item:selected', 'roll:activation', 'totem:matches_caern']));
ITEM_MODIFIER_RULES['rite-rite-of-the-questing-stone'].effects.push(effect('difficulty', -1, ['item:selected', 'roll:activation', 'sample:target']));
ITEM_MODIFIER_RULES['rite-enchant-the-forest'].effects.push(effect('difficulty', -1, ['item:selected', 'roll:activation', 'scene:caern_within_five_miles']));
for (const id of ['rite-rite-of-cleansing', 'rite-rite-of-the-opened-sky']) {
  ITEM_MODIFIER_RULES[id].effects.push(effect('difficulty', -1, ['item:selected', 'roll:activation', 'scene:dawn']));
}
ITEM_MODIFIER_RULES['rite-rite-of-the-fetish'].effects.push(effect('difficulty', { per: 'choice', choiceKey: 'permanent_gnosis_spent', factor: -2 }, ['item:selected', 'roll:activation']));
ITEM_MODIFIER_RULES['rite-rite-of-the-fetish'].choiceFields = [{ key: 'permanent_gnosis_spent', label: 'Permanent Gnosis spent', kind: 'number', min: 0, max: 10 }];

// Required and optional rolls are described structurally for the activation flow.
// Variable difficulties remain explicit inputs accompanied by their printed formula.
type ActivationRollSpec = NonNullable<ModifierRule['activation']>['rollSpec'];
function activationRoll(id: string, rollSpec: ActivationRollSpec, condition?: string): void {
  const rule = ITEM_MODIFIER_RULES[id];
  rule.activation = {
    duration: rule.activation?.duration ?? 'instant',
    ...rule.activation, roll: true, rollSpec,
    ...(condition ? { condition } : {}),
  };
}

for (const item of [...W20_FETISH_CATALOG, ...W20_TALEN_CATALOG]) {
  activationRoll(item.id, { attribute: 'gnosis', difficulty: item.gnosis });
  if (item.id.startsWith('talen-')) ITEM_MODIFIER_RULES[item.id].activation!.consumable = true;
  else ITEM_MODIFIER_RULES[item.id].activation!.alternativeCost = { gnosis: 1 };
}
// Unbroken Cord's power specifically spends Gnosis instead of a separate activation roll.
ITEM_MODIFIER_RULES['fetish-unbroken-cord'].activation = {
  ...ITEM_MODIFIER_RULES['fetish-unbroken-cord'].activation!, roll: false, rollSpec: undefined,
  alternativeCost: undefined, cost: { gnosis: 1 },
};
for (const rite of W20_RITE_CATALOG) {
  if (rite.type === 'minor') continue;
  activationRoll(rite.id, {
    ...(rite.rollAttribute ? { attribute: rite.rollAttribute } : {}),
    ...(rite.rollAbility ? { ability: rite.rollAbility } : {}),
    ...(rite.difficulty !== null ? { difficulty: rite.difficulty } : {}),
    ...(rite.difficultyNote ? { difficultyNote: rite.difficultyNote } : {}),
    ...(rite.type === 'caern' ? { poolCapTrait: 'gnosis' } : {}),
  });
}

const specialRolls: Record<string, ActivationRollSpec> = {
  ancestors: { pool: 'dots', difficulty: 8, difficultyNote: 'Difficulty 10 to contact a specific ancestor.' },
  contacts: { pool: 'dots', difficulty: 7 },
  fate: { pool: 'dots', difficulty: 8 },
  'merit-alcohol-tolerance': { attribute: 'stamina', difficulty: 7 },
  'merit-eidetic-memory': { attribute: 'perception', ability: 'alertness', difficulty: 6 },
  'merit-danger-sense': { attribute: 'perception', ability: 'alertness', difficultyNote: 'Storyteller sets difficulty from danger immediacy and rolls secretly.' },
  'merit-kinfolk-wolf-sense': { attribute: 'wits', difficultyNote: 'Storyteller decides whether to offer advice on success.' },
  'flaw-impatient': { attribute: 'willpower', difficulty: 6 },
  'flaw-soft-hearted': { attribute: 'willpower', difficulty: 8 },
  'flaw-curiosity': { attribute: 'wits', difficultyNote: 'Difficulty 5–9 depending on circumstances.' },
  'flaw-phobia': { attribute: 'willpower', minimumSuccesses: 3, difficultyNote: 'Storyteller-set difficulty; three successes required. Three-point flaw also requires a fox-frenzy check.' },
  'flaw-territorial': { attribute: 'rage', difficultyNote: 'Normal frenzy difficulty when uninvited strangers enter the territory.' },
  'flaw-absent-minded': { attribute: 'intelligence', difficultyNote: 'Storyteller determines recall difficulty.' },
  'flaw-hatred': { attribute: 'rage', difficultyNote: 'Normal frenzy check when encountering the hated subject.' },
  'flaw-nightmares': { attribute: 'willpower', difficulty: 7, outcome: 'failure' },
  'flaw-flashbacks': { attribute: 'willpower', outcome: 'failure', difficultyNote: 'Session-opening Willpower roll; cannot spend Willpower for an automatic success.' },
  'flaw-banned-transformation': { attribute: 'willpower', difficulty: 8 },
  'flaw-insane-ancestor': { poolTrait: 'ancestors', difficulty: 6 },
  'flaw-slip-sideways': { attribute: 'wits', ability: 'occult', difficulty: 7 },
  'flaw-harano-prone': { attribute: 'willpower', outcome: 'failure' },
  'rite-rite-of-the-loyal-pack': { attribute: 'charisma', ability: 'rituals', difficultyNote: '9 minus the pack alpha’s Leadership.' },
  'rite-rite-of-cleansing': { attribute: 'charisma', ability: 'rituals', difficultyNote: 'Taint strength or tainted spirit’s Gnosis; one lower at dawn.' },
  'rite-rite-of-contrition': { attribute: 'charisma', ability: 'rituals', difficultyTrait: 'rage' },
  'rite-rite-of-the-opened-sky': { attribute: 'charisma', ability: 'rituals', difficultyNote: 'Taint strength or tainted spirit’s Gnosis; one lower at dawn.' },
  'rite-rite-of-the-opened-caern': { attribute: 'wits', ability: 'rituals', difficulty: 7, opposed: true, poolCapTrait: 'gnosis' },
  'rite-rite-of-caern-building': { attribute: 'wits', ability: 'rituals', difficulty: 8, difficultyNote: 'Reduce by one per five additional Gnosis-donating participants above thirteen, minimum 4.', poolCapTrait: 'gnosis' },
  'rite-rite-of-the-glorious-past': { attribute: 'intelligence', ability: 'rituals', difficultyNote: '9 minus the ritemaster’s Ancestors rating.', poolCapTrait: 'gnosis' },
  'rite-the-badgers-burrow': { attribute: 'perception', ability: 'rituals', difficultyNote: 'Area size: room 5, ballroom 6, house 7, acre 8, small forest 9.', poolCapTrait: 'gnosis' },
  'rite-rite-of-the-opened-bridge': { attribute: 'wits', ability: 'enigmas', difficultyNote: '8 minus home caern level. +1 after an unsuccessful earlier attempt.', poolCapTrait: 'gnosis' },
  'rite-rite-of-the-shrouded-glen': { difficultyNote: 'Local Gauntlet +4; choose the caern rite pool with the Storyteller.', poolCapTrait: 'gnosis' },
  'rite-rite-of-binding': { attribute: 'willpower', difficultyTrait: 'gnosis', difficultyNote: 'Each Gnosis spent reduces the spirit’s effective Gnosis by one.' },
  'rite-rite-of-growth': { attribute: 'wits', ability: 'rituals', difficultyNote: 'Difficulty 5–9 according to growing conditions.' },
  'rite-rite-of-spirit-awakening': { attribute: 'wits', ability: 'rituals', difficultyTrait: 'rage' },
  'rite-rite-of-the-cardboard-palace': { attribute: 'intelligence', ability: 'survival', difficulty: 6 },
  'rite-rite-of-summoning': { attribute: 'gnosis', difficultyNote: 'Gaffling 4, Jaggling 5, Totem avatar 7, Incarna 8–9, Celestine avatar 10; minus one per invoking hour, minimum 3. First cross the Gauntlet unless already in Umbra.' },
  'rite-rite-of-sacred-rebirth': { attribute: 'wits', ability: 'rituals', difficulty: 9 },
  'rite-descent-into-the-underworld': { attribute: 'intelligence', ability: 'occult', difficultyNote: 'Local Gauntlet rating.' },
  'rite-rite-of-the-jackdaw': { attribute: 'manipulation', ability: 'subterfuge', difficulty: 7 },
  'rite-rite-of-the-fetish': { attribute: 'wits', ability: 'rituals', difficulty: 10 },
  'rite-satire-rite': { attribute: 'charisma', ability: 'rituals', difficultyNote: 'Target’s Rank +4.' },
  'rite-rite-of-accomplishment': { attribute: 'charisma', ability: 'rituals', difficulty: 4, difficultyNote: 'Difficulty 6 when disputed.' },
  'rite-rite-of-praise': { attribute: 'charisma', ability: 'rituals', difficulty: 6 },
};
for (const [id, rollSpec] of Object.entries(specialRolls)) activationRoll(id, rollSpec);
ITEM_MODIFIER_RULES.ancestors.activation!.frequency = 'once-per-session';
ITEM_MODIFIER_RULES.fate.activation!.frequency = 'once-per-session';
ITEM_MODIFIER_RULES['rite-rite-of-the-fetish'].activation!.permanentCost = { choiceKey: 'permanent_gnosis_spent', resource: 'gnosis' };
ITEM_MODIFIER_RULES['flaw-banned-transformation'].activation!.cost = { willpower: 1 };
for (const id of ['rite-last-blessing', 'rite-rite-of-talisman-dedication', 'rite-rite-of-the-opened-sky']) {
  ITEM_MODIFIER_RULES[id].activation!.cost = { gnosis: 1 };
}
// The Hunt uses the tracking system instead of a single rite activation roll.
ITEM_MODIFIER_RULES['rite-the-hunt'].activation = { duration: 'hunt', roll: false, condition: 'Resolve using the tracking and hunting rules (W20 p. 215).' };

for (const rite of W20_RITE_CATALOG) {
  if (rite.type === 'minor' || rite.id === 'rite-the-hunt' || rite.id === 'rite-rite-of-caern-building') continue;
  ITEM_MODIFIER_RULES[rite.id].effects.push(
    effect('difficulty', { per: 'choice', choiceKey: 'additional_helpers', factor: -0.2, rounding: 'ceil' }, ['item:selected', 'roll:activation']),
    effect('difficulty', 3, ['item:selected', 'roll:activation', 'rite:helpers_present'], 'max'),
  );
  ITEM_MODIFIER_RULES[rite.id].choiceFields = [...(ITEM_MODIFIER_RULES[rite.id].choiceFields ?? []), { key: 'additional_helpers', label: 'Additional helping Garou above the rite’s required participants', kind: 'number', min: 0, max: 10000 }];
}
ITEM_MODIFIER_RULES['rite-rite-of-caern-building'].effects.push(
  effect('difficulty', { per: 'choice', choiceKey: 'additional_gnosis_donors', factor: -0.2, rounding: 'ceil' }, ['item:selected', 'roll:activation']),
  effect('difficulty', 4, ['item:selected', 'roll:activation'], 'max'),
);
ITEM_MODIFIER_RULES['rite-rite-of-caern-building'].choiceFields = [{ key: 'additional_gnosis_donors', label: 'Additional Gnosis-donating Garou above thirteen', kind: 'number', min: 0, max: 10000 }];

// Secondary actions retain the same authenticated source, with their own roll and result.
ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].effects.push({
  ...effect('shelter:healing_enabled', { per: 'choice', choiceKey: 'shelter_gnosis' }, undefined, 'set'),
  duration: 'one day per success',
});
ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].choiceFields!.push({ key: 'shelter_gnosis', label: 'Gnosis spent to enable healing', kind: 'number', min: 0, max: 1 });
ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].activation!.variableCost = { choiceKey: 'shelter_gnosis', resource: 'gnosis' };
ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].actions = [{
  id: 'rest', name: 'Heal after resting in the shelter', requiresActive: true,
  requiresActiveTarget: 'shelter:healing_enabled',
  activation: {
    duration: 'instant', preparation: 'The selected occupant completed one full day of rest inside a Gnosis-empowered shelter.',
    roll: true, rollSpec: { actor: 'target', attribute: 'stamina', minimumSuccesses: 3 },
  },
  effects: [
    { ...effect('healing:levels', 1, undefined, 'set'), recipient: 'target', duration: 'instant' },
    { ...effect('healing:aggravated', 1, undefined, 'allow'), recipient: 'target', duration: 'instant' },
  ],
}];
ITEM_MODIFIER_RULES['fetish-cup-of-the-alicorn'].effects.push({ ...effect('item:cup_activated', 1, undefined, 'allow'), duration: 'activation' });
ITEM_MODIFIER_RULES['fetish-cup-of-the-alicorn'].actions = [{
  id: 'identify-poison', name: 'Identify the poison', requiresActive: true,
  activation: { duration: 'instant', roll: true, rollSpec: { attribute: 'gnosis', difficultyNote: 'The poisoner’s Intelligence + Science.' } },
  effects: [],
}];
ITEM_MODIFIER_RULES['fetish-feathered-cloak'].actions = [{
  id: 'maintain-flight', name: 'Check continued flight', requiresActive: true,
  requiresActiveTarget: 'movement:flight', endsParent: true,
  activation: {
    duration: 'instant', preparation: 'Make this check after each ten minutes of flight.',
    roll: true, rollSpec: { attribute: 'stamina', ability: 'athletics', difficulty: 5, outcome: 'failure' },
    condition: 'Failure requires landing and ends the current flight. A successful roll permits continued flight.',
  },
  effects: [],
}];
ITEM_MODIFIER_RULES['fetish-spirit-whistle'].effects.push({ ...effect('whistle:successes', 'successes', undefined, 'set'), duration: 'activation' });
ITEM_MODIFIER_RULES['fetish-spirit-whistle'].actions = [{
  id: 'resist', name: 'Resist the spirit whistle', requiresActive: true,
  requiresActiveTarget: 'whistle:successes',
  activation: { duration: 'instant', roll: true, rollSpec: { actor: 'target', attribute: 'gnosis', opposed: true, outcome: 'failure' }, condition: 'Target is a spirit within the wielder’s line of sight, in front of the wielder. Enter the original activation successes as the opposing total; failure means the spirit must flee.' },
  effects: [{ ...effect('combat:flee', 1, undefined, 'allow'), recipient: 'target', duration: 'until clear of the whistle' }],
}];
ITEM_MODIFIER_RULES['talen-moon-sign'].effects.push({ ...effect('item:moon_sign_activated', 1, undefined, 'allow'), duration: 'until resistance resolved' });
ITEM_MODIFIER_RULES['talen-moon-sign'].actions = [{
  id: 'resist', name: 'Resist the moon sign', requiresActive: true,
  requiresActiveTarget: 'item:moon_sign_activated', endsParent: true,
  activation: { duration: 'instant', roll: true, rollSpec: { actor: 'target', attribute: 'willpower', difficulty: 7, outcome: 'failure' }, condition: 'The activated moon sign was thrown before this werewolf. On failure the target immediately takes Lupus form; other Fera take their animal form.' },
  effects: [{ ...effect('form:lupus', 1, undefined, 'allow'), recipient: 'target', duration: 'instant' }],
}];
ITEM_MODIFIER_RULES['fetish-labrys-of-isthmene'].actions = [{
  id: 'extra-initiative', name: 'Spend Gnosis for additional initiative', requiresActive: true,
  activation: { duration: 'one initiative roll', cost: { gnosis: 1 }, condition: 'Spirit of the Fray is active through the Labrys. Spending Gnosis prevents Rage-bought extra actions this turn.' },
  effects: [{ ...effect('initiative', 10), duration: 'one initiative roll', stackingKey: 'spirit-of-the-fray-enhancement' }],
}];
ITEM_MODIFIER_RULES['fetish-dsiah'].actions = [{
  id: 'drain-gnosis', name: 'Drain Gnosis after a hit',
  activation: { duration: 'instant', roll: true, rollSpec: { attribute: 'gnosis', difficulty: 6 }, condition: 'A successful hit just occurred. Gnosis activation prevents Rage-bought extra actions this turn; spirits lose Essence instead.' },
  effects: [{ ...effect('resource:gnosis', -1), recipient: 'target', duration: 'instant' }],
}];
ITEM_MODIFIER_RULES['fetish-unbroken-cord'].actions = [
  {
    id: 'share-gift', name: 'Share a Gift',
    activation: { duration: 'scene', cost: { gnosis: 1 }, requiresTarget: true, grantsGiftChoiceKey: 'giftSourceId', condition: 'The pack leader shares one of her known Gifts with packmates for the scene. Recipients cannot exceed her current Gnosis before payment (W20 p. 226).' },
    choiceFields: [{ key: 'giftSourceId', label: 'Leader’s Gift', kind: 'select' }],
    effects: [{ ...effect('gift:shared', 1, undefined, 'allow'), recipient: 'target', duration: 'scene' }],
  },
  { id: 'share-rage', name: 'Share the leader’s Rage', activation: { duration: 'scene', cost: { gnosis: 1 }, condition: 'Recipients cannot exceed the leader’s current Gnosis.' }, effects: [{ ...effect('resource:rage', { per: 'trait', trait: 'rage' }, undefined, 'set'), recipient: 'target', duration: 'scene' }] },
  { id: 'share-gnosis', name: 'Share the leader’s Gnosis', activation: { duration: 'scene', cost: { gnosis: 1 }, condition: 'Recipients cannot exceed the leader’s current Gnosis.' }, effects: [{ ...effect('resource:gnosis', { per: 'trait', trait: 'gnosis' }, undefined, 'set'), recipient: 'target', duration: 'scene' }] },
];
ITEM_MODIFIER_RULES['fetish-harmony-flute'].effects.push({ ...effect('item:flute_activated', 1, undefined, 'allow'), duration: 'while played' });
ITEM_MODIFIER_RULES['fetish-harmony-flute'].actions = [
  {
    id: 'play', name: 'Play the activated flute', requiresActive: true,
    activation: { duration: 'while played', roll: true, rollSpec: { ability: 'performance' } },
    effects: [{ ...effect('item:flute_playing', 1, undefined, 'allow'), duration: 'while played' }],
  },
  {
    id: 'resist', name: 'Resist the flute’s peaceful music', requiresActive: true,
    requiresActiveTarget: 'item:flute_playing',
    activation: { duration: 'while played', roll: true, rollSpec: { actor: 'target', attribute: 'rage', outcome: 'failure' }, condition: 'Target hears the music and is aggressive. Creatures without Rage cannot resist. Defending remains possible.' },
    effects: [{ ...effect('combat:attack', 1, undefined, 'deny'), recipient: 'target', duration: 'while played' }],
  },
];
ITEM_MODIFIER_RULES['totem-bear'].actions = [{
  id: 'mothers-touch', name: 'Use Mother’s Touch',
  activation: {
    duration: 'instant', cost: { gnosis: 1 }, roll: true, frequency: 'once-per-day', excludeCaster: true,
    rollSpec: { attribute: 'intelligence', ability: 'empathy', difficultyNote: 'Target’s current Rage, or 5 for a target without Rage.' },
    condition: 'Touch another living creature. Bear grants this Gift once per day (W20 pp. 164, 374).',
  },
  effects: [
    { ...effect('healing:levels', 'successes', undefined, 'set'), recipient: 'target', duration: 'instant' },
    { ...effect('healing:aggravated', 1, undefined, 'allow'), recipient: 'target', duration: 'instant' },
  ],
}];
ITEM_MODIFIER_RULES['totem-chimera'].actions = [{
  id: 'umbral-disguise', name: 'Assume an Umbral disguise',
  activation: { duration: 'until changed', roll: true, rollSpec: { attribute: 'gnosis', difficulty: 7 }, condition: 'The follower is in the Umbra.' },
  effects: [{ ...effect('disguise:umbral', 1, undefined, 'allow'), duration: 'until changed' }],
}];
ITEM_MODIFIER_RULES['totem-cockroach'].actions = [{
  id: 'perceive-data', name: 'Perceive an Umbral data stream',
  activation: { duration: 'instant', roll: true, rollSpec: { attribute: 'gnosis', difficulty: 6 }, condition: 'The follower is in the Umbra.' },
  effects: [],
}];
ITEM_MODIFIER_RULES['totem-cuckoo'].actions = [{
  id: 'overlooked', name: 'Be overlooked',
  activation: { duration: 'until attention is drawn', roll: true, rollSpec: { attribute: 'manipulation', ability: 'subterfuge', difficulty: 6, difficultyNote: 'Higher if the Garou looks out of place; +2 on a new roll after attracting attention.' }, condition: 'One pack member at a time. Observers must beat the user’s successes with Perception + Alertness.' },
  effects: [{ ...effect('concealment:overlooked', 1, undefined, 'allow'), recipient: 'shared', duration: 'until attention is drawn' }],
}, {
  id: 'notice-infiltrator', name: 'Notice the infiltrator', requiresActive: true,
  requiresActiveTarget: 'concealment:overlooked',
  activation: { duration: 'instant', roll: true, rollSpec: { actor: 'target', attribute: 'perception', ability: 'alertness', opposed: true }, condition: 'An observer has noticed the follower. Enter the follower’s Manipulation + Subterfuge successes as the opposing total; the observer must exceed it to recognize the intrusion.' },
  effects: [],
}];
ITEM_MODIFIER_RULES['rite-rite-of-boasting'].effects.push({ ...effect('boast:successes', 'successes', undefined, 'set'), duration: 'until deed resolved' });
ITEM_MODIFIER_RULES['rite-rite-of-boasting'].actions = [{
  id: 'resolve-boast', name: 'Resolve the boasted deed', requiresActive: true,
  requiresActiveTarget: 'boast:successes', endsParent: true,
  choiceFields: [
    { key: 'outcome', label: 'Deed outcome', kind: 'select', options: ['success', 'failure', 'death'] },
    { key: 'usual_glory', label: 'Glory the deed would ordinarily earn', kind: 'number', min: 0, max: 100 },
  ],
  activation: {
    duration: 'instant', condition: 'Resolve the original boast after the deed. A successful deed earns the bonus; failure while surviving loses it; death changes no extra Glory.',
    allocation: { choiceKey: 'extra_glory', limit: [{ per: 'trait', trait: 'boast:successes', factor: 0.5, rounding: 'floor' }, { per: 'choice', choiceKey: 'usual_glory' }] },
  },
  effects: [
    { ...effect('renown:glory', { per: 'choice', choiceKey: 'extra_glory' }, ['choice:outcome:success']), duration: 'instant' },
    { ...effect('renown:glory', { per: 'choice', choiceKey: 'extra_glory', factor: -1 }, ['choice:outcome:failure']), duration: 'instant' },
  ],
}];
ITEM_MODIFIER_RULES['rite-satire-rite'].effects.push(
  { ...effect('rank', -1), recipient: 'target', duration: 'instant' },
  { ...effect('renown:reset_to_rank', 1, undefined, 'allow'), recipient: 'target', duration: 'instant' },
);
ITEM_MODIFIER_RULES['rite-satire-rite'].choiceFields!.push(
  { key: 'renown_glory', label: 'Permanent Glory at the lower rank (W20 p. 251)', kind: 'number', min: 0, max: 10, perTarget: true },
  { key: 'renown_honor', label: 'Permanent Honor at the lower rank (W20 p. 251)', kind: 'number', min: 0, max: 10, perTarget: true },
  { key: 'renown_wisdom', label: 'Permanent Wisdom at the lower rank (W20 p. 251)', kind: 'number', min: 0, max: 10, perTarget: true },
);
ITEM_MODIFIER_RULES['rite-rite-of-renunciation'].effects.push({ ...effect('rank', 1, undefined, 'set'), recipient: 'target', duration: 'instant' });
ITEM_MODIFIER_RULES['rite-satire-rite'].activation!.botchEffects = [{ ...effect('renown:wisdom', -5), duration: 'instant' }];
ITEM_MODIFIER_RULES['rite-rite-of-caern-building'].activation!.failureEffects = [{ ...effect('damage:lethal_levels', 4, undefined, 'set'), recipient: 'pack', duration: 'instant' }];
ITEM_MODIFIER_RULES['rite-rite-of-caern-building'].activation!.botchEffects = [{ ...effect('damage:lethal_levels', 7, undefined, 'set'), recipient: 'pack', duration: 'instant' }];
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-caern'].activation!.failureEffects = [{ ...effect('damage:lethal_levels', { per: 'trait', trait: 'opposedFailureMargin' }, undefined, 'set'), duration: 'instant' }];
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-caern'].activation!.botchEffects = [{ ...effect('damage:aggravated_levels', { per: 'trait', trait: 'opposedFailureMargin' }, undefined, 'set'), duration: 'instant' }];
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-sky'].choiceFields!.push({ key: 'gnosisSpent', label: 'Total Gnosis spent', kind: 'number', min: 1 });
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-sky'].activation!.variableCost = { choiceKey: 'gnosisSpent', resource: 'gnosis', minimum: 1 };
ITEM_MODIFIER_RULES['rite-rite-of-the-opened-sky'].effects.push(
  { ...effect('healing:levels', { per: 'choice', choiceKey: 'gnosisSpent', factor: 0.5, offset: -0.5, rounding: 'floor' }, ['scene:caern'], 'set'), recipient: 'target', duration: 'instant' },
  { ...effect('healing:levels', { per: 'choice', choiceKey: 'gnosisSpent', factor: 0.5, offset: -5, rounding: 'floor' }, ['scene:outside_caern'], 'set'), recipient: 'target', duration: 'instant' },
  { ...effect('healing:aggravated', 1, undefined, 'allow'), recipient: 'target', duration: 'instant' },
);
for (const rule of Object.values(ITEM_MODIFIER_RULES)) {
  for (const action of rule.actions ?? []) action.choiceFields ??= [];
}

for (const armor of W20_ARMOR_PRESETS) {
  ITEM_MODIFIER_RULES[armor.id] = {
    id: armor.id, name: armor.name, source: armor.source,
    effects: [
      effect('armor:rating', armor.rating, ['gear:worn'], 'max'),
      effect('difficulty', armor.dexterityDifficultyPenalty, ['attribute:dexterity', 'gear:worn']),
    ], note: armor.notes,
  };
}
for (const weapon of W20_WEAPON_PRESETS) {
  ITEM_MODIFIER_RULES[weapon.id] = {
    id: weapon.id, name: weapon.name, source: weapon.source,
    effects: [effect(weapon.damageMode === 'strength_plus' ? 'weapon:strength_damage_bonus' : 'weapon:flat_damage', weapon.damageDice, ['item:selected', 'roll:damage'], 'set')],
    note: weapon.notes ?? 'The selected weapon supplies its printed attack difficulty and damage profile.',
  };
  if (weapon.id === 'equipment-klaive' || weapon.id === 'equipment-grand-klaive') {
    ITEM_MODIFIER_RULES[weapon.id].effects.push({ ...effect('resource:gnosis:capacity', weapon.id === 'equipment-klaive' ? -1 : -2, ['item:carried']), stackingKey: '$source:gnosis-capacity' });
  }
  if (weapon.source.page === 303) {
    ITEM_MODIFIER_RULES[weapon.id].effects.push(
      effect('difficulty', 2, ['item:selected', 'roll:attack', 'range:long']),
      effect('difficulty', -2, ['item:selected', 'roll:attack', 'range:point_blank']),
    );
  }
  if (weapon.rollAbility === 'archery') {
    ITEM_MODIFIER_RULES[weapon.id].effects.push(effect('difficulty', 1, ['item:selected', 'roll:attack', 'ability:untrained_archery']));
  }
}
for (const id of ['equipment-small-smg', 'equipment-assault-rifle', 'equipment-assault-shotgun']) {
  ITEM_MODIFIER_RULES[id].effects.push(
    effect('pool', 10, ['item:selected', 'roll:attack', 'action:full_auto']),
    effect('difficulty', 2, ['item:selected', 'roll:attack', 'action:full_auto']),
    effect('pool', 3, ['item:selected', 'roll:attack', 'action:three_round_burst']),
    effect('difficulty', 1, ['item:selected', 'roll:attack', 'action:three_round_burst']),
  );
}
for (const id of ['equipment-taser', 'equipment-tear-gas', 'equipment-bear-mace']) {
  ITEM_MODIFIER_RULES[id].effects.push(effect('damage:attack_success_bonus', 0, ['item:selected', 'roll:damage'], 'set'));
}
for (const id of ['equipment-tear-gas', 'equipment-bear-mace']) {
  ITEM_MODIFIER_RULES[id].effects.push({ ...effect('pool', -2), recipient: 'target', duration: 'one turn per attack success' });
  ITEM_MODIFIER_RULES[id].activation = { duration: 'one turn per attack success', condition: 'Apply after a successful hit. Enter attack successes and target.', roll: false };
}

export interface ItemModifierCoverage {
  status: 'automatic' | 'conditional' | 'storyteller' | 'source_required';
  source: ModifierRule['source'];
  note: string;
}

/** Every selectable item has an explicit disposition, including entries without verified mechanics. */
export const ITEM_MODIFIER_COVERAGE: Record<string, ItemModifierCoverage> = Object.fromEntries(
  Object.values(ITEM_MODIFIER_RULES).map((rule) => [rule.id, {
    status: rule.source.book !== 'W20' ? 'source_required'
      : rule.effects.length === 0 && !rule.activation?.rollSpec ? 'storyteller'
      : rule.activation || rule.effects.some((entry) => entry.when || entry.recipient || entry.duration) ? 'conditional' : 'automatic',
    source: rule.source,
    note: rule.note ?? (rule.effects.length ? 'Uses the documented effect when its conditions are satisfied.' : 'Resolve the documented story, activation, creation, resource, or non-stat effect with the Storyteller.'),
  }]),
);
