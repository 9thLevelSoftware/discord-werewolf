import { describe, expect, it } from 'vitest';
import { getCreationAbilityLimits, validateW20CharacterCreation } from '../characterCreation';
import type { AbilityCategory } from '../characterCreation';
import { draftToUserCharacterSheet } from '../userCharacterSheet';
import { makeValidCreationDraft } from './testHelpers';

const deficit = {
  id: 'flaw-ability-deficit',
  name: 'Ability Deficit',
  kind: 'flaw' as const,
  pointValue: 5,
  ruleChoice: 'skills',
};
function validDeficitDraft() {
  const draft = makeValidCreationDraft();
  return {
    ...draft,
    priorityAbilityDots: {
      ...draft.priorityAbilityDots,
      animal_ken: 2,
      melee: 2,
      performance: 0,
      survival: 0,
    },
    freebieAbilityDots: { brawl: 1 },
    meritsAndFlaws: [deficit],
  };
}

describe('Ability Deficit during character creation', () => {
  it.each([
    ['talents', 8],
    ['skills', 4],
    ['knowledges', 0],
  ] as const)(
    'reduces only the selected %s budget by five',
    (category: AbilityCategory, budget: number) => {
      const draft = makeValidCreationDraft({
        meritsAndFlaws: [{ ...deficit, ruleChoice: category }],
      });
      const limits = getCreationAbilityLimits(draft);
      expect(limits.budgets[category]).toBe(budget);
      expect(limits.priorityMax[category]).toBe(2);
      expect(limits.totalMax[category]).toBe(2);
      const unaffected = category === 'talents' ? 'skills' : 'talents';
      expect(limits.totalMax[unaffected]).toBe(5);
    }
  );

  it('accepts the reduced allocation and preserves ordinary Freebie accounting', () => {
    const result = validateW20CharacterCreation(validDeficitDraft());
    expect(result.isValid).toBe(true);
    expect(result.freebieLedger.totalAvailableFreebies).toBe(20);
    expect(result.freebieLedger.spentBreakdown.abilities).toBe(2);
    expect(result.finalComputedSheetPreview.abilities.melee).toBe(2);
    expect(result.finalComputedSheetPreview.abilities.brawl).toBe(4);
    const sheet = draftToUserCharacterSheet(validDeficitDraft(), {
      id: 'deficit-sheet',
      ownerDiscordId: 'deficit-player',
      now: 1,
    });
    expect(sheet.otherTraits.find((entry) => entry.id === deficit.id)?.ruleChoice).toBe('skills');
  });

  it('rejects restoring the lost priority budget or buying a third dot with Freebies', () => {
    const draft = validDeficitDraft();
    const overspent = validateW20CharacterCreation({
      ...draft,
      priorityAbilityDots: { ...draft.priorityAbilityDots, performance: 1 },
    });
    expect(
      overspent.errors.some(
        (issue) => issue.field === 'abilities.skills' && issue.message.includes('exactly 4')
      )
    ).toBe(true);
    const thirdDot = validateW20CharacterCreation({ ...draft, freebieAbilityDots: { melee: 1 } });
    expect(
      thirdDot.errors.some(
        (issue) => issue.field === 'abilities.melee' && issue.message.includes('cannot exceed 2')
      )
    ).toBe(true);
    expect(thirdDot.freebieLedger.spentBreakdown.abilities).toBe(2);
  });

  it('requires the category selection and resolves a legacy row through its existing rule choice', () => {
    const missing = validateW20CharacterCreation(
      makeValidCreationDraft({ meritsAndFlaws: [{ ...deficit, ruleChoice: undefined }] })
    );
    expect(
      missing.errors.some((issue) => issue.message.includes('Ability Deficit requires choosing'))
    ).toBe(true);
    const legacy = validDeficitDraft();
    legacy.meritsAndFlaws = [{ ...deficit, id: 'saved-custom-row' }];
    expect(validateW20CharacterCreation(legacy).isValid).toBe(true);
    expect(validateW20CharacterCreation(makeValidCreationDraft()).isValid).toBe(true);
  });
});
