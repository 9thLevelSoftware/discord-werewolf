import { createBlankUserCharacterSheet } from '@w20-vtt/core';
import { describe, expect, it } from 'vitest';
import { applyRuleSpend, preserveRuleTransactions, reserveRuleSourceReceipt } from '../userSheetTransactions';

describe('pending consumable source reservation', () => {
  it('protects the exact source from another action or an editor save, then settles it once', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'caster', ownerDiscordId: 'owner', name: 'Caster' });
    const sourceId = 'token:1';
    sheet.equipment = [{ id: sourceId, name: 'Token' }];
    const token = 'room:activation:one';
    const reserve = {
      sheetId: sheet.id, requiredSourceIds: [sourceId], operationId: 'reserve',
      additionalReceipts: [reserveRuleSourceReceipt(sourceId, token)],
    };
    const reserved = applyRuleSpend(sheet, reserve);
    expect(() => applyRuleSpend(reserved, { ...reserve, operationId: 'another-room' })).toThrow('pending use');
    expect(preserveRuleTransactions(reserved, { ...reserved, equipment: [] }).equipment).toEqual(sheet.equipment);

    const settle = { sheetId: sheet.id, operationId: 'settle', sourceReservationSettlements: [{ sourceId, token }] };
    const kept = applyRuleSpend(reserved, settle);
    expect(kept.equipment).toEqual(sheet.equipment);
    expect(applyRuleSpend(kept, settle)).toBe(kept);
    expect(applyRuleSpend(kept, { ...reserve, operationId: 'new-reservation' })).not.toBe(kept);
    const spent = applyRuleSpend(reserved, { ...settle, consumedSourceIds: [sourceId] });
    expect(spent.equipment).toEqual([]);
  });
});
