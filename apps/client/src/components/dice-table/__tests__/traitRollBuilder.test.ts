import { describe, expect, it } from 'vitest';
import { createBlankUserCharacterSheet, type W20UserCharacterSheet } from '@w20-vtt/core';
import {
  getSheetAbilityOptions,
  getSheetTraitOptions,
  resolveTraitRollSelection,
} from '../TraitRollBuilder';

function makeTestSheet(
  overrides: Partial<W20UserCharacterSheet> = {}
): W20UserCharacterSheet {
  const base = createBlankUserCharacterSheet({
    id: 'sheet-test-1',
    ownerDiscordId: 'user-1',
    name: 'Kaelen Shadowstep',
    breed: 'homid',
    auspice: 'ahroun',
    tribe: 'shadow_lords',
  });

  return {
    ...base,
    baseAttributes: {
      ...base.baseAttributes,
      strength: 3,
      dexterity: 4,
      stamina: 3,
      charisma: 2,
      manipulation: 2,
      appearance: 2,
      perception: 3,
      intelligence: 2,
      wits: 3,
    },
    abilities: {
      alertness: 3,
      brawl: 4,
      firearms: 3,
      stealth: 2,
      occult: 0,
    },
    customAbilities: [
      {
        id: 'custom-demolitions',
        category: 'skills',
        name: 'Demolitions',
        dots: 2,
        specialty: 'C4',
      },
    ],
    specialties: {
      strength: 'Crushing Grip',
      firearms: 'Rifles',
    },
    rage: { permanent: 5, temporary: 4 },
    gnosis: { permanent: 4, temporary: 3 },
    willpower: { permanent: 6, temporary: 5 },
    silverCarriedItems: 1,
    ...overrides,
  };
}

describe('TraitRollBuilder', () => {
  it('resolves Dexterity + Firearms at Difficulty 7 without overwriting Difficulty', () => {
    const sheet = makeTestSheet({
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'none', 'none', 'none', 'none', 'none'], // Injured -> -1 wound penalty
      },
    });

    const result = resolveTraitRollSelection({
      sheet,
      attribute: 'dexterity',
      ability: 'firearms',
      bonusDice: 0,
      difficulty: 7,
      specialtyOverride: null,
      woundOverride: null,
    });

    expect(result.hasSelection).toBe(true);
    expect(result.attrDots).toBe(4);
    expect(result.abilDots).toBe(3);
    expect(result.basePool).toBe(7);
    expect(result.woundPenalty).toBe(-1);
    expect(result.effectiveApplyWounds).toBe(true);
    expect(result.effectivePool).toBe(6);
    expect(result.difficulty).toBe(7);
    expect(result.autoLabel).toBe('Dexterity + Firearms');
    expect(result.formulaSummary).toBe('Dexterity (4) + Firearms (3)');
    expect(result.compactFormula).toBe('4 + 3 - 1 Wnd');
    expect(result.autoSpecialty).toBe(true);
    expect(result.effectiveHasSpecialty).toBe(true);
    expect(result.specialtyReason).toContain('Firearms: Rifles');
  });

  it('updates effective dots live across Garou form shifts and surfaces Perception diff mod without mutating difficulty', () => {
    const homid = makeTestSheet({ activeForm: 'homid' });
    const crinos = makeTestSheet({ activeForm: 'crinos' });
    const lupus = makeTestSheet({ activeForm: 'lupus' });

    const crinosTraits = getSheetTraitOptions(crinos);
    const crinosDex = crinosTraits.find((t) => t.key === 'dexterity');
    const crinosApp = crinosTraits.find((t) => t.key === 'appearance');

    expect(crinosDex?.baseDots).toBe(4);
    expect(crinosDex?.effectiveDots).toBe(5); // Crinos +1 Dex
    expect(crinosDex?.formDelta).toBe(1);
    expect(crinosApp?.effectiveDots).toBe(0);

    const homidRes = resolveTraitRollSelection({
      sheet: homid,
      attribute: 'dexterity',
      ability: 'firearms',
      bonusDice: 0,
      difficulty: 7,
      specialtyOverride: null,
      woundOverride: null,
    });
    const crinosRes = resolveTraitRollSelection({
      sheet: crinos,
      attribute: 'dexterity',
      ability: 'firearms',
      bonusDice: 0,
      difficulty: 7,
      specialtyOverride: null,
      woundOverride: null,
    });

    expect(homidRes.effectivePool).toBe(7);
    expect(crinosRes.effectivePool).toBe(8);
    expect(crinosRes.difficulty).toBe(7);

    const lupusPerception = resolveTraitRollSelection({
      sheet: lupus,
      attribute: 'perception',
      ability: 'alertness',
      bonusDice: 0,
      difficulty: 7,
      specialtyOverride: null,
      woundOverride: null,
    });

    expect(lupusPerception.difficulty).toBe(7); // Must stay user-chosen 7!
    expect(lupusPerception.perceptionFormMod).toBe(-2); // Lupus -2 Perception Diff mod surfaced separately
  });

  it('auto-detects specialties on attribute, canonical ability, and custom ability with clean manual overrides', () => {
    const sheet = makeTestSheet();

    const withAttrSpec = resolveTraitRollSelection({
      sheet,
      attribute: 'strength',
      ability: 'stealth',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(withAttrSpec.autoSpecialty).toBe(true);
    expect(withAttrSpec.effectiveHasSpecialty).toBe(true);
    expect(withAttrSpec.specialtyReason).toContain('Strength: Crushing Grip');

    const withCustomAbilSpec = resolveTraitRollSelection({
      sheet,
      attribute: 'intelligence',
      ability: 'custom-demolitions',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(withCustomAbilSpec.autoSpecialty).toBe(true);
    expect(withCustomAbilSpec.effectiveHasSpecialty).toBe(true);
    expect(withCustomAbilSpec.specialtyReason).toContain('Demolitions: C4');

    const overriddenOff = resolveTraitRollSelection({
      sheet,
      attribute: 'dexterity',
      ability: 'firearms',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: false,
      woundOverride: null,
    });
    expect(overriddenOff.autoSpecialty).toBe(true);
    expect(overriddenOff.effectiveHasSpecialty).toBe(false);

    const overriddenOn = resolveTraitRollSelection({
      sheet,
      attribute: 'wits',
      ability: 'alertness',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: true,
      woundOverride: null,
    });
    expect(overriddenOn.autoSpecialty).toBe(false);
    expect(overriddenOn.effectiveHasSpecialty).toBe(true);
  });

  it('disables automatic wound penalty on pure Inner Trait rolls and reflects silver on Gnosis', () => {
    const sheet = makeTestSheet({
      silverCarriedItems: 1,
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'none', 'none', 'none', 'none', 'none'], // -1 wound
      },
    });

    const pureGnosis = resolveTraitRollSelection({
      sheet,
      attribute: 'gnosis',
      ability: '',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(pureGnosis.attrDots).toBe(3); // 4 perm Gnosis - 1 silver
    expect(pureGnosis.autoApplyWounds).toBe(false);
    expect(pureGnosis.effectiveApplyWounds).toBe(false);
    expect(pureGnosis.effectivePool).toBe(3);

    const pureWillpower = resolveTraitRollSelection({
      sheet,
      attribute: 'willpower',
      ability: '',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(pureWillpower.attrDots).toBe(6);
    expect(pureWillpower.autoApplyWounds).toBe(false);
    expect(pureWillpower.effectivePool).toBe(6);

    const pureRage = resolveTraitRollSelection({
      sheet,
      attribute: 'rage',
      ability: '',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(pureRage.attrDots).toBe(5);
    expect(pureRage.autoApplyWounds).toBe(false);
    expect(pureRage.effectivePool).toBe(5);

    const forcedWounds = resolveTraitRollSelection({
      sheet,
      attribute: 'willpower',
      ability: '',
      bonusDice: 0,
      difficulty: 6,
      specialtyOverride: null,
      woundOverride: true,
    });
    expect(forcedWounds.effectiveApplyWounds).toBe(true);
    expect(forcedWounds.effectivePool).toBe(5);
  });

  it('applies positive/negative bonus dice cleanly and surfaces untrained hints on 0-dot Skills and Knowledges', () => {
    const sheet = makeTestSheet();

    const bonusPlus = resolveTraitRollSelection({
      sheet,
      attribute: 'dexterity',
      ability: 'firearms',
      bonusDice: 2,
      difficulty: 7,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(bonusPlus.basePool).toBe(9);
    expect(bonusPlus.effectivePool).toBe(9);
    expect(bonusPlus.autoLabel).toBe('Dexterity + Firearms (+2)');
    expect(bonusPlus.compactFormula).toBe('4 + 3 + 2');

    const bonusMinusClamped = resolveTraitRollSelection({
      sheet,
      attribute: 'charisma',
      ability: 'occult',
      bonusDice: -5,
      difficulty: 8,
      specialtyOverride: null,
      woundOverride: null,
    });
    expect(bonusMinusClamped.basePool).toBe(0);
    expect(bonusMinusClamped.effectivePool).toBe(0);
    expect(bonusMinusClamped.autoLabel).toBe('Charisma + Occult (-5)');
    expect(bonusMinusClamped.untrainedHint).toBe('Untrained Knowledge');

    const abilities = getSheetAbilityOptions(sheet);
    const drive = abilities.find((a) => a.key === 'drive');
    const alertness = abilities.find((a) => a.key === 'alertness');
    expect(drive?.untrainedHint).toBe('Untrained Skill');
    expect(alertness?.untrainedHint).toBeUndefined();
  });
});
