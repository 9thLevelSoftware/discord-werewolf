import React from 'react';
import {
  getSourceModifierRule,
  resolveSheetShortcut,
  type SheetFetishItem,
  type SheetShortcut,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import type { SheetRollRequest } from '../../store/useCharacterSheetStore';
import { shortcutToRollRequest } from './sheetShared';

export const FetishWeaponRollControls: React.FC<{
  sheet: W20UserCharacterSheet;
  fetish: SheetFetishItem;
  onRoll: (request: SheetRollRequest) => void;
}> = ({ sheet, fetish, onRoll }) => {
  const rule = getSourceModifierRule({ ...fetish, kind: 'fetish' });
  const hasWeaponProfile = rule?.effects.some(
    (effect) =>
      !effect.duration &&
      effect.when?.includes('item:selected') &&
      ['weapon:strength_damage_bonus', 'weapon:flat_damage'].includes(effect.target)
  );
  if (!hasWeaponProfile) return null;
  const common = {
    difficulty: 6,
    rageDiceCount: 0,
    isSecretRoll: false,
  };
  const attack: SheetShortcut = {
    ...common,
    id: `fetish-weapon-attack-${fetish.id}`,
    name: `${fetish.name} Attack`,
    source: { kind: 'trait_combo', attribute: 'dexterity', ability: 'melee' },
    ruleContext: { rollKind: 'attack', selectedItemId: fetish.id },
    applyWoundPenalty: true,
  };
  const damage: SheetShortcut = {
    ...common,
    id: `fetish-weapon-damage-${fetish.id}`,
    name: `${fetish.name} Damage`,
    source: { kind: 'static', pool: 0 },
    ruleContext: {
      rollKind: 'damage',
      attribute: 'strength',
      ability: 'melee',
      selectedItemId: fetish.id,
    },
    applyWoundPenalty: false,
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {[attack, damage].map((shortcut) => {
        const resolved = resolveSheetShortcut(sheet, shortcut);
        return (
          <button
            key={shortcut.id}
            type="button"
            disabled={fetish.carried === false}
            onClick={() => onRoll(shortcutToRollRequest(sheet, shortcut))}
            aria-label={`Roll ${shortcut.name}`}
            title={resolved.formulaSummary}
            className="rounded border border-stone-600 bg-zinc-950 px-2 py-1 font-semibold text-amber-100 disabled:opacity-40"
          >
            {shortcut === attack ? 'Attack' : 'Damage'} · {resolved.rawPool}d10 · Diff{' '}
            {resolved.difficulty}
          </button>
        );
      })}
    </div>
  );
};
