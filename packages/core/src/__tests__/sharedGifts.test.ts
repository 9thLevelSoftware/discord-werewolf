import { describe, expect, it } from 'vitest';
import { W20_GIFT_CATALOG } from '../catalog/gifts.data';
import { ITEM_MODIFIER_RULES } from '../catalog/itemModifierRules';
import {
  buildSharedGiftGrant,
  listOwnedGiftChoices,
  listUnlinkedGiftSources,
} from '../sharedGifts';
import { getCharacterModifierSources, getSheetModifierSources } from '../modifierRules';
import { computeUserSheetStats, createBlankUserCharacterSheet } from '../userCharacterSheet';
import { computeEffectiveCharacterStats } from '../forms';
import { CANONICAL_W20_PRESETS } from '../macros';
import { makeTestCharacter } from './testHelpers';

const gift = W20_GIFT_CATALOG.find((entry) => entry.slug === 'spirit-of-the-fray')!;
const blankSheet = (id: string) =>
  createBlankUserCharacterSheet({ id, ownerDiscordId: id, now: 1 });
function giftLeader() {
  const leader = blankSheet('leader');
  leader.gifts = [
    {
      id: 'leader-gift',
      name: gift.name,
      level: gift.level,
      ruleId: gift.id,
      summary: gift.summary,
    },
  ];
  return leader;
}

describe('Unbroken Cord sharing a Gift', () => {
  it('declares the scene action and links an actually owned documented Gift', () => {
    const action = ITEM_MODIFIER_RULES['fetish-unbroken-cord'].actions!.find(
      (entry) => entry.id === 'share-gift'
    )!;
    expect(action.activation.grantsGiftChoiceKey).toBe('giftSourceId');
    expect(action.activation.cost?.gnosis).toBe(1);
    expect(action.effects[0].duration).toBe('scene');
    expect(listOwnedGiftChoices(giftLeader())).toMatchObject([
      { sourceEntryId: 'leader-gift', giftId: gift.id },
    ]);
    expect(() => buildSharedGiftGrant(giftLeader(), 'unowned')).toThrow('owned by the leader');
  });

  it('exposes passive and activated Gift definitions until the scene grant expires', () => {
    const recipient = blankSheet('recipient');
    const grantedGift = buildSharedGiftGrant(giftLeader(), 'leader-gift');
    recipient.activeRuleEffects = [
      {
        id: 'grant',
        sourceId: 'leader:cord',
        ruleId: 'cord-share-gift',
        duration: 'scene',
        remainingScenes: 1,
        grantedGift,
      },
    ];
    const source = getSheetModifierSources(recipient).find(
      (entry) => entry.grantInstanceId === 'grant'
    )!;
    expect(source.id).toBe('shared-gift:grant');
    expect(source.customRule?.activation?.cost?.gnosis).toBe(1);
    expect(computeUserSheetStats(recipient).ruleInitiativeBonus).toBe(10);
    recipient.activeRuleEffects.push({
      id: 'enhancement',
      sourceId: `recipient:${source.id}`,
      sourceItemId: source.id,
      sourceOwnerId: recipient.id,
      parentGrantId: 'grant',
      ruleId: gift.id,
      duration: 'next-roll',
      rule: {
        ...grantedGift.rule,
        effects: grantedGift.rule.effects.filter((effect) => effect.duration === 'next-roll'),
      },
    });
    expect(computeUserSheetStats(recipient).ruleInitiativeBonus).toBe(20);
    recipient.activeRuleEffects[0].remainingScenes = 0;
    expect(
      getSheetModifierSources(recipient).some((entry) => entry.grantInstanceId === 'grant')
    ).toBe(false);
    expect(computeUserSheetStats(recipient).ruleInitiativeBonus).toBe(0);
    expect(recipient.gifts).toEqual([]);
  });

  it('supports persisted campaign Gift IDs with legacy macro deduplication', () => {
    const leader = makeTestCharacter({
      giftIds: [gift.id],
      macros: [CANONICAL_W20_PRESETS.spirit_of_the_fray],
    });
    expect(
      getCharacterModifierSources(leader).filter((source) => source.ruleId === gift.id)
    ).toHaveLength(1);
    const recipient = makeTestCharacter({
      activeRuleEffects: [
        {
          id: 'campaign-grant',
          sourceId: 'leader:cord',
          ruleId: 'cord-share-gift',
          duration: 'scene',
          remainingScenes: 1,
          grantedGift: buildSharedGiftGrant(leader, gift.id),
        },
      ],
    });
    expect(
      computeEffectiveCharacterStats(recipient).ruleEvaluation.modifiers.some(
        (modifier) => modifier.ruleId === gift.id && modifier.target === 'initiative'
      )
    ).toBe(true);
  });

  it('reports unlinked legacy Gifts and requires an exact reference before sharing', () => {
    const leader = blankSheet('legacy-leader');
    leader.gifts = [
      { id: 'old-row', name: 'Unknown house Gift', level: 1, summary: 'Saved custom content' },
    ];
    expect(listOwnedGiftChoices(leader)).toEqual([]);
    expect(listUnlinkedGiftSources(leader)).toMatchObject([
      { sourceEntryId: 'old-row', name: 'Unknown house Gift' },
    ]);
    expect(() => buildSharedGiftGrant(leader, 'old-row')).toThrow(
      'exact documented catalog reference'
    );
  });
});
