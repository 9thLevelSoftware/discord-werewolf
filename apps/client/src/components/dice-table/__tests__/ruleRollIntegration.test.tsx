import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createBlankUserCharacterSheet,
  W20_ARMOR_PRESETS,
  resolveSheetShortcut,
  resolveW20DicePool,
  type ModifierRule,
  type SheetShortcut,
} from '@w20-vtt/core';
import { W20UserCharacterSheetSchema } from '@w20-vtt/protocol';
import { SheetRules } from '../../character-sheet/SheetRules';
import { useCharacterSheetStore } from '../../../store/useCharacterSheetStore';
import { useVttRoomStore } from '../../../store/useVttRoomStore';
import { RuleEditor } from '../../character-sheet/RuleEditor';
import { shortcutToRollRequest } from '../../character-sheet/sheetShared';
import { resolveTraitRollSelection } from '../traitRollMath';

describe('sheet rule integration', () => {
  it('retains the editable source and resolves Leadership in the composer and the submitted shortcut', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'sheet', ownerDiscordId: 'owner' });
    sheet.baseAttributes.charisma = 3;
    sheet.abilities.leadership = 2;
    sheet.otherTraits.push({
      id: 'instance-1',
      name: 'Natural Leader',
      kind: 'merit',
      dots: 2,
      ruleId: 'merit-natural-leader',
    });
    const rule: ModifierRule = {
      id: 'feather',
      name: 'Ceremonial feather',
      source: { book: 'Chronicle sheet', page: 2 },
      effects: [
        { operation: 'add', target: 'difficulty', value: -1, when: ['ability:leadership'] },
      ],
    };
    sheet.equipment = [{ id: 'gear', name: 'Ceremonial feather', carried: true, customRule: rule }];
    const restored = W20UserCharacterSheetSchema.parse(JSON.parse(JSON.stringify(sheet)));
    const preview = resolveTraitRollSelection({
      sheet: restored,
      attribute: 'charisma',
      ability: 'leadership',
      difficulty: 7,
      bonusDice: 0,
      woundOverride: null,
      specialtyOverride: null,
    });
    expect(preview).toMatchObject({ basePool: 7, effectivePool: 7, difficulty: 6 });
    const intent = shortcutToRollRequest(restored, preview.shortcut as SheetShortcut);
    expect(intent).toMatchObject({ pool: 7, difficulty: 6 });
    expect(resolveSheetShortcut(restored, intent.shortcut!)).toMatchObject({
      rawPool: 7,
      difficulty: 6,
    });
    expect(restored.abilities.leadership).toBe(2);
    expect(restored.equipment?.[0].customRule).toEqual(rule);
  });

  it('records a sourced custom rule through the sheet editor', () => {
    const save = vi.fn();
    render(<RuleEditor name="Chronicle token" onSave={save} />);
    fireEvent.click(screen.getByText('Edit custom rule'));
    fireEvent.change(screen.getByPlaceholderText('Book or chronicle ruling'), {
      target: { value: 'Pack chronicle' },
    });
    fireEvent.change(screen.getByPlaceholderText('ability:leadership, indoors'), {
      target: { value: 'indoors' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Save rule'));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { book: 'Pack chronicle' },
        effects: [expect.objectContaining({ target: 'pool', value: 2, when: ['indoors'] })],
      })
    );
  });
  it('equips printed armor from the sheet and removes its Dexterity adjustment when it is taken off', () => {
    const base = createBlankUserCharacterSheet({ id: 'armor-sheet', ownerDiscordId: 'owner' });
    const armor = W20_ARMOR_PRESETS.find((item) => item.dexterityDifficultyPenalty > 0)!;
    const shortcut: SheetShortcut = {
      id: 'dodge',
      name: 'Dodge',
      source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'athletics' },
      difficulty: 5,
      applyWoundPenalty: true,
      isSecretRoll: false,
      rageDiceCount: 0,
    };
    function Sheet() {
      const [sheet, setSheet] = React.useState(base);
      return (
        <>
          <SheetRules sheet={sheet} seatId="main" onUpdate={setSheet} />
          <output data-testid="dodge-difficulty">
            {resolveSheetShortcut(sheet, shortcut).difficulty}
          </output>
        </>
      );
    }
    render(<Sheet />);
    fireEvent.click(screen.getByText('Add equipment'));
    fireEvent.change(screen.getByLabelText('Rulebook equipment'), { target: { value: armor.id } });
    fireEvent.click(screen.getByText('Wear this armor'));
    fireEvent.change(screen.getByLabelText('Trait or item'), { target: { value: 'armor' } });
    expect(screen.getByTestId('dodge-difficulty').textContent).toBe(
      String(5 + armor.dexterityDifficultyPenalty)
    );
    fireEvent.click(screen.getByLabelText('Worn'));
    expect(screen.getByTestId('dodge-difficulty').textContent).toBe('5');
  });

  it('selects an existing roll when applying the Fate Background', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'fate-sheet', ownerDiscordId: 'owner' });
    sheet.backgrounds = [{ id: 'background', name: 'Fate', dots: 2, ruleId: 'fate' }];
    const priorRoom = useVttRoomStore.getState();
    const priorUser = useCharacterSheetStore.getState();
    const send = vi.fn().mockReturnValue('activation-id');
    const history = {
      id: 'failed-roll',
      timestamp: 100,
      rollerDiscordId: 'owner',
      rollerName: 'Owner',
      rollerAvatarUrl: null,
      label: 'Tracking',
      rageDiceCount: 0,
      isSecretRoll: true,
      sheetId: sheet.id,
      roll: resolveW20DicePool({ label: 'Tracking', basePool: 1 }, () => 2),
    };
    useVttRoomStore.setState({
      connectionStatus: 'authenticated',
      sendCommand: send,
      rollHistory: [
        history,
        { ...history, id: 'other', label: 'Other player', rollerDiscordId: 'other' },
      ],
    });
    useCharacterSheetStore.setState({ initializedUserId: 'owner', focusedRuleId: 'background' });
    try {
      render(<SheetRules sheet={sheet} seatId="main" onUpdate={() => {}} />);
      const selector = screen.getByLabelText(/Original roll/);
      expect(selector.textContent).toContain('Tracking');
      expect(selector.textContent).not.toContain('Other player');
      fireEvent.change(selector, { target: { value: 'failed-roll' } });
      fireEvent.click(screen.getByLabelText(/Once per session, roll Fate/i));
      fireEvent.click(screen.getByRole('button', { name: 'Activate Fate' }));
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ACTIVATE_RULE',
          ruleId: 'fate',
          referenceRollId: 'failed-roll',
        })
      );
    } finally {
      useVttRoomStore.setState(priorRoom);
      useCharacterSheetStore.setState(priorUser);
    }
  });

  it('applies confirmed resource and progression changes once while preserving local character notes', () => {
    const sheet = createBlankUserCharacterSheet({ id: 'sync', ownerDiscordId: 'owner' });
    sheet.concept = 'Previous description';
    useCharacterSheetStore.setState({
      initializedUserId: 'owner',
      sessionJwt: null,
      sheetsById: { sync: sheet },
    });
    useCharacterSheetStore.getState().receiveRuleSheets([sheet]);
    useCharacterSheetStore
      .getState()
      .updateSheet(sheet.id, (current) => ({ ...current, concept: 'Local edit' }));
    const confirmation = {
      ...sheet,
      concept: 'Previous description',
      ruleActivationReceipts: ['event-1'],
      experience: { ...sheet.experience, mystical: 2 },
      willpower: { ...sheet.willpower, temporary: 1 },
    };
    useCharacterSheetStore.getState().receiveRuleSheets([confirmation, confirmation]);
    expect(useCharacterSheetStore.getState().sheetsById.sync).toMatchObject({
      concept: 'Local edit',
      experience: { mystical: 2 },
      willpower: { temporary: 1 },
      ruleActivationReceipts: ['event-1'],
    });
  });
});
