import type { AttributeKey, DamageType } from '../types';

export interface W20WeaponPreset {
  id: string;
  name: string;
  rollAttribute: AttributeKey;
  rollAbility: string;
  difficulty: number;
  damageMode: 'strength_plus' | 'flat';
  damageDice: number;
  damageType: Exclude<DamageType, 'none'>;
  range: string;
  rate: string;
  clip: string;
  notes?: string;
  source: { book: 'W20'; page: number };
}

export interface W20ArmorPreset {
  id: string;
  name: string;
  rating: number;
  /** Added to Dexterity-related roll difficulties, W20 pp. 291–292. */
  dexterityDifficultyPenalty: number;
  notes?: string;
  source: { book: 'W20'; page: number };
}

function melee(
  slug: string, name: string, difficulty: number, damageDice: number,
  damageType: Exclude<DamageType, 'none'>, notes?: string,
): W20WeaponPreset {
  return {
    id: `equipment-${slug}`, name, rollAttribute: 'dexterity', rollAbility: 'melee',
    difficulty, damageMode: 'strength_plus', damageDice, damageType,
    range: '', rate: '', clip: '', ...(notes ? { notes } : {}), source: { book: 'W20', page: 302 },
  };
}

function thrown(
  slug: string, name: string, difficulty: number, damageDice: number,
  damageType: Exclude<DamageType, 'none'>, flat = false,
): W20WeaponPreset {
  return {
    ...melee(slug, name, difficulty, damageDice, damageType),
    rollAbility: 'athletics', damageMode: flat ? 'flat' : 'strength_plus',
  };
}

function ranged(
  slug: string, name: string, damageDice: number, range: number, rate: string, clip: string,
  notes?: string, bashing = false,
): W20WeaponPreset {
  return {
    id: `equipment-${slug}`, name, rollAttribute: 'dexterity', rollAbility: 'firearms',
    difficulty: 6, damageMode: 'flat', damageDice, damageType: bashing ? 'bashing' : 'lethal',
    range: `${range} yards`, rate, clip, ...(notes ? { notes } : {}), source: { book: 'W20', page: 303 },
  };
}

function bow(slug: string, name: string, damageDice: number, range: number, rate: string, clip: string, notes: string): W20WeaponPreset {
  return { ...ranged(slug, name, damageDice, range, rate, clip, notes), rollAbility: 'archery' };
}

const heavy = 'Two-handed; requires Strength 3.';
const silver = 'Silver weapon. Apply silver soak restrictions and carried-silver Gnosis rules.';
const automatic = 'Supports full-auto, three-round bursts and sprays.';
const disabling = 'Damage receives no extra dice from attack successes.';

/** Printed W20 weapon statistics. Range-dependent difficulty is selected for each attack. */
export const W20_WEAPON_PRESETS: readonly W20WeaponPreset[] = [
  melee('sap', 'Sap', 4, 0, 'bashing'),
  melee('whip', 'Whip', 6, 1, 'lethal', 'Entangle a limb at +1 difficulty.'),
  melee('spiked-gauntlet', 'Spiked Gauntlet', 6, 1, 'lethal'),
  melee('broken-bottle', 'Broken Bottle', 6, 1, 'lethal', 'Breaks after three uses.'),
  melee('chair', 'Chair', 7, 2, 'bashing'),
  melee('table', 'Table', 8, 3, 'bashing', heavy),
  melee('chain', 'Chain', 5, 0, 'bashing', 'Entangle a limb at +1 difficulty.'),
  melee('staff', 'Staff', 5, 1, 'bashing'),
  melee('mace', 'Mace', 6, 2, 'lethal'),
  melee('baseball-bat', 'Baseball Bat', 5, 2, 'bashing'),
  melee('spiked-club', 'Spiked Club', 6, 2, 'lethal'),
  melee('huge-spiked-club', 'Huge Spiked Club', 7, 4, 'lethal', heavy),
  melee('knife', 'Knife', 4, 1, 'lethal'),
  melee('sword', 'Sword', 6, 2, 'lethal'),
  melee('klaive', 'Klaive', 6, 2, 'aggravated', silver),
  melee('grand-klaive', 'Grand Klaive', 7, 5, 'aggravated', silver),
  melee('great-sword', 'Great Sword', 7, 6, 'lethal', heavy),
  melee('axe', 'Axe', 7, 3, 'lethal'),
  melee('great-axe', 'Great Axe', 7, 6, 'lethal', heavy),
  melee('polearm', 'Polearm', 7, 3, 'lethal', heavy),
  melee('chainsaw', 'Chainsaw', 8, 7, 'lethal', 'A botch damages the wielder.'),
  thrown('thrown-knife', 'Thrown Knife', 6, 0, 'lethal'),
  thrown('shuriken', 'Shuriken', 7, 3, 'lethal', true),
  thrown('spear', 'Spear', 6, 1, 'lethal'),
  thrown('stone', 'Stone', 5, 0, 'bashing'),
  thrown('head-sized-stone', 'Head-sized Stone', 6, 3, 'bashing'),
  thrown('tomahawk', 'Tomahawk', 6, 1, 'lethal'),
  ranged('light-revolver', 'Light Revolver', 4, 12, '3', '6'),
  ranged('heavy-revolver', 'Heavy Revolver', 6, 35, '2', '6'),
  ranged('light-semiautomatic-pistol', 'Light Semi-Automatic Pistol', 4, 20, '4', '17+1'),
  ranged('heavy-semiautomatic-pistol', 'Heavy Semi-Automatic Pistol', 5, 25, '3', '13+1'),
  ranged('rifle', 'Rifle', 8, 200, '1', '5+1'),
  ranged('small-smg', 'Small SMG', 4, 25, '3', '30+1', automatic),
  ranged('large-smg', 'Large SMG', 4, 50, '3', '30+1'),
  ranged('assault-rifle', 'Assault Rifle', 7, 150, '3', '30+1', automatic),
  ranged('sawed-off-shotgun', 'Sawed-off Shotgun', 8, 10, '2', '2'),
  ranged('shotgun', 'Shotgun', 8, 20, '1', '5+1'),
  ranged('semiautomatic-shotgun', 'Semi-Automatic Shotgun', 8, 25, '3', '6+1'),
  ranged('assault-shotgun', 'Assault Shotgun', 8, 50, '*', '32+1', automatic),
  bow('short-bow', 'Short Bow', 4, 60, '1', '1', 'Nock and draw require an automatic action.'),
  bow('hunting-bow', 'Hunting Bow', 5, 100, '1', '1', 'Nock and draw require an automatic action.'),
  bow('long-bow', 'Long Bow', 5, 120, '1', '1', 'Nock and draw require an automatic action.'),
  bow('commando-crossbow', 'Commando Crossbow', 3, 20, '1', '1', 'Unfolding takes one turn, then load. Reloading takes two automatic actions.'),
  bow('crossbow', 'Crossbow', 5, 90, '1', '1', 'Reloading takes two automatic actions.'),
  bow('heavy-crossbow', 'Heavy Crossbow', 6, 100, '1', '1', 'Reloading takes two automatic actions.'),
  ranged('taser', 'Taser', 5, 5, '1', '1', disabling, true),
  ranged('tear-gas', 'Tear Gas', 3, 3, '1', '5', `${disabling} Target loses two dice for one turn per success.`, true),
  ranged('bear-mace', 'Bear Mace', 4, 3, '1', '3', `${disabling} Target loses two dice for one turn per success.`, true),
];

function armor(slug: string, name: string, rating: number, dexterityDifficultyPenalty: number): W20ArmorPreset {
  return { id: `equipment-${slug}`, name, rating, dexterityDifficultyPenalty, source: { book: 'W20', page: 292 } };
}

export const W20_ARMOR_PRESETS: readonly W20ArmorPreset[] = [
  armor('tough-hide-1', 'Tough Hide (1)', 1, 0),
  armor('tough-hide-2', 'Tough Hide (2)', 2, 0),
  armor('tough-hide-3', 'Tough Hide (3)', 3, 0),
  armor('reinforced-clothing', 'Reinforced Clothing', 1, 0),
  armor('biker-jacket', 'Biker Jacket', 1, 1),
  armor('leather-duster', 'Leather Duster', 2, 2),
  armor('bearskin-coat', 'Bearskin Coat', 3, 3),
  armor('steel-breastplate', 'Steel Breastplate', 3, 2),
  armor('kevlar-vest', 'Kevlar Vest', 3, 1),
  armor('flak-vest', 'Flak Vest', 4, 2),
  armor('riot-suit', 'Riot Suit', 5, 3),
  { ...armor('trashcan-lid', 'Trashcan Lid', 2, 0), notes: 'Requires a successful Dexterity + Melee roll at difficulty 6 to employ.' },
];
