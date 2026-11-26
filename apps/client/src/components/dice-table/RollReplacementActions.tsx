import React from 'react';
import type { RollReplacementOption } from '@w20-vtt/protocol';
import { Button } from '../ui';

export function RollReplacementActions({ options, disabled, onChoose }: {
  options: readonly RollReplacementOption[];
  disabled: boolean;
  onChoose: (option: RollReplacementOption) => void;
}) {
  return options.map((option) => (
    <Button key={option.ruleId} size="sm" disabled={disabled} onClick={() => onChoose(option)}>
      Use {option.name}{option.gnosisCost > 0 && ` · ${option.gnosisCost} Gnosis`} · {option.remaining} left
    </Button>
  ));
}
