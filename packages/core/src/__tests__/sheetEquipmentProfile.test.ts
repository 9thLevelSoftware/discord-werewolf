import { describe, expect, it } from 'vitest';
import {
  createBlankUserCharacterSheet,
  type SheetShortcut,
  resolveSheetShortcut,
  computeUserSheetStats,
} from '../userCharacterSheet';
import { W20_WEAPON_PRESETS, W20_ARMOR_PRESETS } from '../catalog/equipmentPresets';

const roll: SheetShortcut = {
  id: 'roll',
  name: 'Roll',
  source: { kind: 'static', pool: 1 },
  difficulty: 6,
  applyWoundPenalty: false,
  isSecretRoll: false,
  rageDiceCount: 0,
};
describe('equipped item profiles', () => {
  it('uses the saved weapon profile, honors edits and stops adding damage from a stowed weapon', () => {
    const sheet = createBlankUserCharacterSheet({ id: 's', ownerDiscordId: 'p' });
    const profile = W20_WEAPON_PRESETS.find((item) => item.id === 'equipment-klaive')!;
    sheet.combatWeapons = [{ ...profile, id: 'k', ruleId: profile.id, carried: true }];
    const damage = { ...roll, source: { kind: 'weapon_damage' as const, weaponId: 'k' } };
    expect(resolveSheetShortcut(sheet, damage).rawPool).toBe(sheet.baseAttributes.strength + 2);
    sheet.combatWeapons[0].damageMode = 'flat';
    sheet.combatWeapons[0].damageDice = 7;
    expect(resolveSheetShortcut(sheet, damage).rawPool).toBe(7);
    sheet.combatWeapons[0].carried = false;
    expect(resolveSheetShortcut(sheet, damage).rawPool).toBe(0);
  });
  it('respects a worn armor profile and still evaluates a separate worn item when the armor slot is empty', () => {
    const sheet = createBlankUserCharacterSheet({ id: 's', ownerDiscordId: 'p' });
    const preset = W20_ARMOR_PRESETS.find((item) => item.rating > 1)!;
    sheet.armor = { description: preset.name, ruleId: preset.id, rating: 1, worn: true };
    expect(computeUserSheetStats(sheet).soakCapabilities.armorRating).toBe(1);
    sheet.armor.worn = false;
    sheet.equipment = [
      {
        id: 'ward',
        name: 'Ward',
        worn: true,
        customRule: {
          id: 'w',
          name: 'Ward',
          source: { book: 'Chronicle' },
          effects: [{ target: 'armor:rating', operation: 'add', value: 2, when: ['gear:worn'] }],
        },
      },
    ];
    expect(computeUserSheetStats(sheet).soakCapabilities.armorRating).toBe(2);
  });
  it('uses the attached hearing impairment when evaluating an Acute Senses choice', () => {
    const sheet = createBlankUserCharacterSheet({ id: 's', ownerDiscordId: 'p' });
    sheet.otherTraits = [
      {
        id: 'ear',
        name: 'Acute Senses',
        kind: 'merit',
        dots: 1,
        ruleId: 'merit-acute-senses',
        ruleChoice: 'hearing',
      },
      {
        id: 'flaw',
        name: 'Hard of Hearing',
        kind: 'flaw',
        dots: 1,
        ruleId: 'flaw-hard-of-hearing',
      },
    ];
    const result = resolveSheetShortcut(sheet, roll, { tags: ['sense:hearing'] });
    expect(result.difficulty).toBe(8);
    expect(result.modifiers.some((m) => m.ruleId === 'merit-acute-senses')).toBe(false);
  });
});
