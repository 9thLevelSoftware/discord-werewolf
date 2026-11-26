import { describe, expect, it } from 'vitest';
import { ITEM_MODIFIER_COVERAGE, ITEM_MODIFIER_RULES } from '../catalog/itemModifierRules';
import { W20_ARMOR_PRESETS, W20_WEAPON_PRESETS } from '../catalog/equipmentPresets';
import { W20_MERITS_FLAWS_CATALOG } from '../catalog/meritsFlaws.data';
import { W20_BACKGROUND_CATALOG } from '../catalog/backgrounds';
import { W20_FETISH_CATALOG, W20_TALEN_CATALOG } from '../catalog/fetishes.data';
import { W20_RITE_CATALOG } from '../catalog/rites.data';
import { W20_TOTEM_CATALOG } from '../catalog/totems.data';
import { computeUserSheetStats, createBlankUserCharacterSheet, resolveSheetShortcut } from '../userCharacterSheet';
import type { SheetShortcut, W20UserCharacterSheet } from '../userCharacterSheet';
import { computeActorMovement, resolveRuleShift } from '../ruleActions';
import { getW20RankRenownRequirement } from '../catalog/rankRenown';
import { applyRuleValue, evaluateModifierRules, getSheetModifierSources } from '../modifierRules';

function testSheet(): W20UserCharacterSheet {
  const sheet = createBlankUserCharacterSheet({ id: 'rules-test', ownerDiscordId: 'player', now: 1 });
  sheet.baseAttributes = { strength: 3, dexterity: 2, stamina: 3, charisma: 3, manipulation: 2, appearance: 2, perception: 3, intelligence: 2, wits: 2 };
  sheet.abilities = { leadership: 2, stealth: 2, melee: 2, athletics: 2 };
  return sheet;
}

function traitShortcut(attribute: 'charisma' | 'dexterity', ability: string): SheetShortcut {
  return {
    id: 'test-roll', name: 'Test roll', source: { kind: 'trait_combo', attribute, ability },
    difficulty: 6, rageDiceCount: 0, applyWoundPenalty: true, isSecretRoll: false,
  };
}

describe('source-backed item rule coverage', () => {
  it('accounts for every catalog item and preserves source references', () => {
    const entries = [
      ...W20_MERITS_FLAWS_CATALOG, ...W20_FETISH_CATALOG, ...W20_TALEN_CATALOG,
      ...W20_RITE_CATALOG, ...W20_TOTEM_CATALOG, ...W20_ARMOR_PRESETS, ...W20_WEAPON_PRESETS,
      ...W20_BACKGROUND_CATALOG.map((entry) => ({ ...entry, id: entry.key })),
    ];
    for (const entry of entries) {
      expect(ITEM_MODIFIER_RULES[entry.id], entry.id).toBeDefined();
      expect(ITEM_MODIFIER_COVERAGE[entry.id]?.note, entry.id).toBeTruthy();
      if (entry.source) expect(ITEM_MODIFIER_RULES[entry.id].source).toEqual(entry.source);
    }
  });

  it('requires documentation before enabling compilation, legacy or chronicle mechanics', () => {
    for (const rule of Object.values(ITEM_MODIFIER_RULES)) {
      if (rule.source.book === 'W20') continue;
      expect(rule.effects, rule.id).toEqual([]);
      expect(ITEM_MODIFIER_COVERAGE[rule.id].status).toBe('source_required');
    }
  });

  it('keeps activation outcomes off a character who merely knows a rite', () => {
    for (const rite of W20_RITE_CATALOG) {
      const rule = ITEM_MODIFIER_RULES[rite.id];
      for (const effect of rule.effects) {
        expect(Boolean(effect.duration) || effect.when?.includes('roll:activation'), rite.id).toBe(true);
      }
    }
    expect(ITEM_MODIFIER_RULES['rite-bone-rhythms'].activation?.consumable).toBe(true);
    expect(ITEM_MODIFIER_RULES['rite-hunting-prayer'].activation?.preparation).toContain('Three lunar months');
  });

  it('calculates Leadership with Natural Leader and qualifying Pure Breed', () => {
    const sheet = testSheet();
    sheet.otherTraits = [{ id: 'merit-natural-leader', name: 'Natural Leader', dots: 2, kind: 'merit' }];
    sheet.backgrounds = [{ id: 'pure_breed', name: 'Pure Breed', dots: 3 }];
    const shortcut = traitShortcut('charisma', 'leadership');
    expect(resolveSheetShortcut(sheet, shortcut).rawPool).toBe(7);
    expect(resolveSheetShortcut(sheet, shortcut, { tags: ['target:garou'] }).rawPool).toBe(10);
  });

  it('adds activated fetish and rite outcomes only for their declared recipients', () => {
    const sheet = testSheet();
    sheet.fetishes = [{ id: 'nyx', ruleId: 'fetish-nyxs-bangle', name: "Nyx's Bangle", level: 1, gnosisRating: 6, power: '' }];
    const stealth = traitShortcut('dexterity', 'stealth');
    expect(resolveSheetShortcut(sheet, stealth).rawPool).toBe(4);
    sheet.activeRuleEffects = [{ id: 'night', sourceId: 'nyx', ruleId: 'fetish-nyxs-bangle', duration: 'night' }];
    expect(resolveSheetShortcut(sheet, stealth, { tags: ['scene:night'] }).rawPool).toBe(8);
    sheet.rites = [{ id: 'praise', ruleId: 'rite-rite-of-praise', name: 'Rite of Praise', summary: '' }];
    sheet.activeRuleEffects.push({ id: 'praise-effect', sourceId: 'praise', ruleId: 'rite-rite-of-praise', successes: 3, duration: 'three months', recipient: 'target' });
    expect(resolveSheetShortcut(sheet, traitShortcut('charisma', 'leadership'), { tags: ['target:sept'] }).rawPool).toBe(8);
  });

  it('calculates individual and assigned shared totem traits', () => {
    const sheet = testSheet();
    sheet.packTotem = 'Bear';
    expect(computeUserSheetStats(sheet).effectiveAttributes.strength).toBe(4);
    sheet.packTotem = 'Falcon';
    expect(resolveSheetShortcut(sheet, traitShortcut('charisma', 'leadership')).rawPool).toBe(5);
    sheet.activeRuleEffects = [{ id: 'falcon-shared', sourceId: 'pack-totem', ruleId: 'totem-falcon', duration: 'assigned pack trait', recipient: 'shared' }];
    expect(resolveSheetShortcut(sheet, traitShortcut('charisma', 'leadership')).rawPool).toBe(8);
  });

  it('calculates armor penalties and printed mundane weapon damage', () => {
    const sheet = testSheet();
    sheet.armor = { rating: 3, description: 'Kevlar Vest', ruleId: 'equipment-kevlar-vest', worn: true };
    expect(resolveSheetShortcut(sheet, traitShortcut('dexterity', 'stealth')).difficulty).toBe(7);
    sheet.armor.worn = false;
    expect(resolveSheetShortcut(sheet, traitShortcut('dexterity', 'stealth')).difficulty).toBe(6);
    const knife = W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-knife')!;
    const thrown = W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-thrown-knife')!;
    sheet.combatWeapons = [knife, thrown];
    const shortcut: SheetShortcut = { ...traitShortcut('dexterity', 'melee'), source: { kind: 'weapon_damage', weaponId: knife.id } };
    expect(resolveSheetShortcut(sheet, shortcut).rawPool).toBe(4);
    shortcut.source = { kind: 'weapon_damage', weaponId: thrown.id };
    expect(resolveSheetShortcut(sheet, shortcut).rawPool).toBe(3);
  });

  it('exposes Fate successes through the actual resolved roll', () => {
    const sheet = testSheet();
    sheet.backgrounds = [{ id: 'fate', name: 'Fate', dots: 3 }];
    sheet.activeRuleEffects = [{ id: 'fate-successes', sourceId: 'fate', ruleId: 'fate', successes: 2, duration: 'one failed or insufficient roll' }];
    expect(resolveSheetShortcut(sheet, traitShortcut('charisma', 'leadership')).bonusAutomaticSuccesses).toBe(2);
    expect(ITEM_MODIFIER_RULES.fate.activation?.rollSpec).toMatchObject({ pool: 'dots', difficulty: 8 });
  });

  it('provides actual activation roll sources instead of treating ownership as activation', () => {
    expect(ITEM_MODIFIER_RULES['fetish-nyxs-bangle'].activation).toMatchObject({
      rollSpec: { attribute: 'gnosis', difficulty: 6 }, alternativeCost: { gnosis: 1 },
    });
    expect(ITEM_MODIFIER_RULES['flaw-insane-ancestor'].activation?.rollSpec).toMatchObject({ poolTrait: 'ancestors', difficulty: 6 });
    expect(ITEM_MODIFIER_RULES['flaw-phobia'].activation?.rollSpec?.minimumSuccesses).toBe(3);
    expect(ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].activation?.rollSpec).toMatchObject({ attribute: 'intelligence', ability: 'survival', difficulty: 6 });
    expect(ITEM_MODIFIER_RULES['rite-rite-of-the-fetish'].activation?.rollSpec?.difficulty).toBe(10);
    expect(ITEM_MODIFIER_RULES['rite-the-hunt'].activation?.roll).toBe(false);
    const rest = ITEM_MODIFIER_RULES['rite-rite-of-the-cardboard-palace'].actions?.find((action) => action.id === 'rest');
    expect(rest).toMatchObject({ requiresActive: true, requiresActiveTarget: 'shelter:healing_enabled', choiceFields: [], activation: { rollSpec: { actor: 'target', attribute: 'stamina', minimumSuccesses: 3 } } });
    expect(ITEM_MODIFIER_RULES['totem-bear'].actions?.find((action) => action.id === 'mothers-touch')?.activation).toMatchObject({ frequency: 'once-per-day', excludeCaster: true });
  });

  it('calculates cumulative silver penalties for separately owned Grand Klaives', () => {
    const sheet = testSheet();
    sheet.gnosis = { permanent: 7, temporary: 7 };
    sheet.fetishes = ['first-klaive', 'second-klaive'].map((id) => ({ id, name: 'Grand Klaive', ruleId: 'fetish-grand-klaive', level: 5, gnosisRating: 7, power: '' }));
    expect(computeUserSheetStats(sheet).effectiveGnosisPool).toBe(3);
  });

  it('calculates movement changes and the five-point Mixed-morph partial shift cost', () => {
    const sheet = testSheet();
    sheet.otherTraits = [{ id: 'flaw-short', name: 'Short', dots: 1, kind: 'flaw' }];
    expect(computeActorMovement(sheet)).toMatchObject({ walk: 7, run: 13 });
    sheet.otherTraits = [{ id: 'flaw-lame', name: 'Lame', dots: 3, kind: 'flaw' }];
    expect(computeActorMovement(sheet)).toMatchObject({ walk: 1.75, jog: 0, run: 0 });
    sheet.otherTraits = [{ id: 'merit-mixed-morph', name: 'Mixed-morph', dots: 5, kind: 'merit' }];
    const shift = resolveRuleShift(sheet, { targetForm: 'crinos', method: 'roll_primal_urge', partial: true });
    expect(shift).toMatchObject({ pool: 2, difficulty: 6, willpowerCost: 0 });
  });

  it('keeps Monstrous Appearance zero when Fair Glabro removes form penalties', () => {
    const sheet = testSheet();
    sheet.activeForm = 'glabro';
    sheet.otherTraits = [
      { id: 'merit-fair-glabro', name: 'Fair Glabro', dots: 2, kind: 'merit' },
      { id: 'flaw-monstrous', name: 'Monstrous', dots: 3, kind: 'flaw' },
    ];
    expect(computeUserSheetStats(sheet).effectiveAttributes).toMatchObject({ manipulation: 2, appearance: 0 });
  });

  it('uses flat bow damage, the secondary Archery Skill and published lower-rank Renown', () => {
    expect(W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-crossbow')).toMatchObject({ rollAbility: 'archery', damageMode: 'flat', damageDice: 5 });
    expect(getW20RankRenownRequirement('ahroun', 3)).toEqual({ glory: 6, honor: 3, wisdom: 1 });
    expect(getW20RankRenownRequirement('ragabash', 3)).toEqual({ total: 13 });
    expect(getW20RankRenownRequirement('ragabash', 0)).toBeUndefined();
  });

  it('calculates Lack of Scent on the tracker’s roll while retaining the merit on its owner', () => {
    const owner = testSheet();
    owner.otherTraits = [{ id: 'merit-lack-of-scent', name: 'Lack of Scent', dots: 2, kind: 'merit' }];
    const rules = evaluateModifierRules(getSheetModifierSources(owner), owner, {
      attribute: 'perception', ability: 'survival', authoritativeTags: ['target:source'],
      tags: ['action:tracking', 'sense:smell'],
    });
    expect(applyRuleValue(rules, 'target:difficulty', 6)).toBe(8);
    expect(applyRuleValue(rules, 'difficulty', 6)).toBe(6);
  });

  it('calculates printed rite helper reductions during that rite’s roll', () => {
    const sheet = testSheet();
    sheet.rites = [{ id: 'cleansing', name: 'Rite of Cleansing', ruleId: 'rite-rite-of-cleansing', summary: '' }];
    const roll: SheetShortcut = { ...traitShortcut('charisma', 'rituals'), difficulty: 8 };
    const context = { selectedItemId: 'cleansing', rollKind: 'activation', ruleChoices: { additional_helpers: 12 }, tags: ['rite:helpers_present'] };
    expect(resolveSheetShortcut(sheet, roll, context).difficulty).toBe(6);
    expect(resolveSheetShortcut(sheet, roll, { ...context, ruleChoices: { additional_helpers: 100 } }).difficulty).toBe(3);
    expect(resolveSheetShortcut(sheet, roll, { ...context, selectedItemId: 'another-rite' }).difficulty).toBe(8);
  });

  it('preserves shared totem ownership and selectable Fenris attributes', () => {
    const falcon = ITEM_MODIFIER_RULES['totem-falcon'];
    expect(falcon.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'ability:leadership', value: 3, recipient: 'shared', duration: 'assigned pack trait' }),
    ]));
    expect(ITEM_MODIFIER_RULES['totem-fenris'].choices).toEqual(['strength', 'dexterity', 'stamina']);
    expect(ITEM_MODIFIER_RULES['totem-stag'].effects[0].when).toContain('action:long_distance_running');
  });

  it('retains rule distinctions that earlier summaries described incorrectly', () => {
    const silver = ITEM_MODIFIER_RULES['merit-silver-tolerance'];
    expect(silver.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'soak:silver', operation: 'allow' }),
      expect.objectContaining({ target: 'difficulty', operation: 'set', value: 8 }),
    ]));
    expect(silver.effects.some((effect) => effect.target.startsWith('damage:'))).toBe(false);
    expect(ITEM_MODIFIER_RULES['flaw-sign-of-wolf'].effects).toEqual([]);
    expect(ITEM_MODIFIER_RULES['flaw-pierced-veil'].effects).toEqual([
      expect.objectContaining({ target: 'delirium:trigger', operation: 'deny' }),
    ]);
    expect(ITEM_MODIFIER_RULES['fetish-chameleon-skin'].effects[0]).toMatchObject({ target: 'target:difficulty', value: 3, when: expect.arrayContaining(['target:source']) });
  });

  it('uses armor difficulty penalties and distinct thrown/melee damage profiles', () => {
    const kevlar = W20_ARMOR_PRESETS.find((entry) => entry.id === 'equipment-kevlar-vest');
    expect(kevlar).toMatchObject({ rating: 3, dexterityDifficultyPenalty: 1, source: { page: 292 } });
    expect(ITEM_MODIFIER_RULES['equipment-kevlar-vest'].effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'difficulty', value: 1, when: ['attribute:dexterity', 'gear:worn'] }),
    ]));
    expect(W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-knife')).toMatchObject({ difficulty: 4, damageDice: 1 });
    expect(W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-thrown-knife')).toMatchObject({ difficulty: 6, damageDice: 0 });
    expect(W20_WEAPON_PRESETS.find((entry) => entry.id === 'equipment-shuriken')).toMatchObject({ damageMode: 'flat', damageDice: 3 });
  });
});
