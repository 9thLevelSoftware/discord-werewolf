import React, { useEffect, useMemo, useState } from 'react';
import {
  applyRuleValue,
  resolveModifierRule,
  resolveSheetShortcut,
  type AppliedRuleModifier,
  type RuleContext,
  type SheetShortcut,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import { useVttRoomStore } from '../../store/useVttRoomStore';
import { useRuleTargetOptions } from '../character-sheet/sheetShared';
import { Button, Modal } from '../ui';
import { factLabel, ruleField, ruleInset } from '../character-sheet/RuleEditor';

export function ModifierBreakdown({ modifiers }: { modifiers: AppliedRuleModifier[] }) {
  return (
    <ul className="space-y-1 text-xs text-stone-300">
      {modifiers.map((m, i) => (
        <li key={m.sourceId + m.target + i}>
          <strong>{m.name}</strong> · {factLabel(m.target)}{' '}
          {m.operation === 'add' && m.value >= 0
            ? '+'
            : m.operation === 'add'
              ? ''
              : m.operation + ' '}
          {m.value}
          {' · '}
          {m.source.book}
          {m.source.page ? ' p. ' + m.source.page : ''}
        </li>
      ))}
    </ul>
  );
}
export function actionableFacts(reasons: string[]): string[] {
  return Array.from(
    new Set(
      reasons
        .flatMap((reason) =>
          reason.startsWith('Excludes ') ? reason.slice(9).split(', ') : [reason]
        )
        .filter(
          (reason) =>
            reason !== 'target:source' &&
            reason !== 'Activation required' &&
            reason !== 'Choose rule inputs' &&
            !reason.startsWith('event:') &&
            !reason.endsWith(':') &&
            !reason.includes('$choice')
        )
    )
  );
}

export function getRollReserves(sheet: W20UserCharacterSheet) {
  return (sheet.activeRuleEffects ?? []).flatMap((instance) => {
    const rule = instance.rule ?? resolveModifierRule(instance.ruleId);
    const allocation = rule?.activation?.allocation;
    if (
      !rule ||
      !allocation?.consumeOnRoll ||
      instance.preparationRounds ||
      instance.preparationSeconds
    )
      return [];
    const remaining = Number(
      instance.ruleChoices?.[allocation.choiceKey] ?? instance.successes ?? 0
    );
    return remaining > 0
      ? [{ id: instance.id, key: allocation.choiceKey, name: rule.name, remaining }]
      : [];
  });
}

export function canResolveWithoutDice(modifiers: AppliedRuleModifier[]) {
  return [
    'successes:automatic',
    'roll:automatic_successes',
    'outcome:success',
    'attack:automatic_hit',
    'outcome:failure',
    'roll:automatic_failure',
  ].some((target) => applyRuleValue({ modifiers }, target, 0) > 0);
}

export type RollPreview = Pick<
  ReturnType<typeof resolveSheetShortcut>,
  | 'effectivePool'
  | 'difficulty'
  | 'applyWoundPenalty'
  | 'hasSpecialty'
  | 'woundPenalty'
  | 'modifiers'
> & { pool: number };
export function RuleRollReview({
  sheet,
  seatId,
  shortcut,
  initial,
  onCancel,
  onConfirm,
}: {
  sheet: W20UserCharacterSheet;
  seatId: string;
  shortcut: SheetShortcut;
  initial: RuleContext;
  onCancel: () => void;
  onConfirm: (context: RuleContext, preview: RollPreview) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial.tags ?? []);
  const [specialtyOverride, setSpecialtyOverride] = useState(initial.specialtyOverride);
  const [target, setTarget] = useState(initial.targetIds?.[0] ?? '');
  const [request, setRequest] = useState<{ id: string; key: string }>();
  const [effectChoices, setEffectChoices] = useState<RuleContext['effectChoices']>(
    initial.effectChoices ?? {}
  );
  const [penalties, setPenalties] = useState<NonNullable<RuleContext['penalties']>>(
    initial.penalties ?? []
  );
  const reserves = getRollReserves(sheet);
  const peers = useRuleTargetOptions();
  const send = useVttRoomStore((s) => s.sendCommand);
  const remote = useVttRoomStore((s) => s.rulePreview);
  const error = useVttRoomStore((s) => s.lastError);
  const connected = useVttRoomStore((s) => s.connectionStatus === 'authenticated');
  const context = useMemo(
    () => ({
      ...initial,
      tags,
      effectChoices,
      penalties,
      targetIds: target ? [target] : [],
      ...(specialtyOverride !== undefined && { specialtyOverride }),
    }),
    [initial, tags, target, effectChoices, penalties, specialtyOverride]
  );
  const local = resolveSheetShortcut(sheet, shortcut, context);
  const baseline = resolveSheetShortcut(sheet, shortcut, initial);
  const awaitingServer = Boolean(target);
  const requestKey = JSON.stringify([seatId, sheet, shortcut, context]);
  useEffect(() => {
    if (!target || !connected) return;
    setRequest({
      id: send({ type: 'PREVIEW_RULE_ROLL', sheetId: sheet.id, seatId, shortcut, context }),
      key: requestKey,
    });
  }, [connected, context, seatId, send, sheet.id, shortcut, target, requestKey]);
  const ack =
    request?.key === requestKey &&
    remote?.reqId === request.id &&
    remote?.event.sheetId === sheet.id
      ? remote.event
      : undefined;
  const resolved = awaitingServer
    ? ack
    : { ...local, pool: Math.max(0, Math.min(30, local.rawPool)) };
  const facts = actionableFacts([
    ...baseline.pending.flatMap((p) => p.reasons),
    ...local.pending.flatMap((p) => p.reasons),
    ...(ack?.pendingTags ?? []),
    ...tags,
  ]);
  const choices = peers.filter((p) => p.id !== sheet.id);
  return (
    <Modal
      open
      onClose={onCancel}
      title={shortcut.name}
      size="sm"
      footer={
        <Button
          variant="primary"
          fullWidth
          disabled={!resolved || (resolved.pool <= 0 && !canResolveWithoutDice(resolved.modifiers))}
          onClick={() => resolved && onConfirm(context, resolved)}
        >
          {resolved && resolved.effectivePool === 0
            ? 'Resolve roll'
            : 'Roll ' + (resolved?.effectivePool ?? '…') + ' dice'}
        </Button>
      }
    >
      <div className="w20-rules space-y-4">
        {local.hasEligibleNamedSpecialty && (
          <label className="block">
            <input
              type="checkbox"
              checked={specialtyOverride ?? shortcut.forceSpecialty ?? false}
              onChange={(e) => setSpecialtyOverride(e.target.checked)}
            />{' '}
            Apply specialty ({local.specialtyReason})
          </label>
        )}
        {choices.length > 0 && (
          <label>
            Target{' '}
            <select
              className={ruleField}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">No table target</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {facts.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend>Which circumstances apply?</legend>
            {facts.map((tag) => (
              <label key={tag} className="block">
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={(e) =>
                    setTags(e.target.checked ? [...tags, tag] : tags.filter((t) => t !== tag))
                  }
                />{' '}
                {factLabel(tag)}
              </label>
            ))}
          </fieldset>
        )}
        {reserves.map((reserve) => (
          <label className="block" key={reserve.id}>
            {reserve.name} bonus dice ({reserve.remaining} available){' '}
            <input
              className={ruleField + ' w-20'}
              type="number"
              min={0}
              max={reserve.remaining}
              value={effectChoices?.[reserve.id]?.[reserve.key] ?? 0}
              onChange={(e) =>
                setEffectChoices({
                  ...effectChoices,
                  [reserve.id]: {
                    [reserve.key]: Math.max(
                      0,
                      Math.min(reserve.remaining, Math.trunc(Number(e.target.value)))
                    ),
                  },
                })
              }
            />
          </label>
        ))}
        {local.modifiers
          .filter((m) => m.target.startsWith('penalty:'))
          .map((m) => {
            const key = m.target.slice('penalty:'.length);
            const row = penalties.find((p) => p.key === key);
            const update = (patch: { pool?: number; difficulty?: number }) =>
              setPenalties([...penalties.filter((p) => p.key !== key), { ...row, key, ...patch }]);
            return (
              <details key={m.sourceId + key} className={ruleInset}>
                <summary>
                  {factLabel(key)} penalty · {m.name}
                </summary>
                <div className="grid grid-cols-2 gap-2">
                <label>
                  Dice penalty{' '}
                  <input
                    className={ruleField}
                    type="number"
                    min={-30}
                    max={0}
                    value={row?.pool ?? 0}
                    onChange={(e) =>
                      update({ pool: Math.max(-30, Math.min(0, Number(e.target.value))) })
                    }
                  />
                </label>
                <label>
                  Difficulty increase{' '}
                  <input
                    className={ruleField}
                    type="number"
                    min={0}
                    max={10}
                    value={row?.difficulty ?? 0}
                    onChange={(e) =>
                      update({ difficulty: Math.min(10, Math.max(0, Number(e.target.value))) })
                    }
                  />
                </label>
                </div>
              </details>
            );
          })}
        {resolved ? (
          <div className="space-y-2 rounded-lg border border-gold-500/30 bg-obsidian-900 px-3 py-2.5">
            <p aria-live="polite" className="font-display text-base font-bold tracking-wide text-parchment">
              {resolved.effectivePool} dice · Difficulty {resolved.difficulty}
            </p>
            {resolved.modifiers.length > 0 && <ModifierBreakdown modifiers={resolved.modifiers} />}
          </div>
        ) : (
          <p role="status" className="text-sm text-stone-400">
            {(error?.reqId === request?.id ? error?.message : undefined) ??
              (connected ? 'Checking target modifiers…' : 'Waiting for the table to reconnect…')}
          </p>
        )}
      </div>
    </Modal>
  );
}
