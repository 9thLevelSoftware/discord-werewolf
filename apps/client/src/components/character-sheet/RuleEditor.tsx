import React, { useState } from 'react';
import {
  ABILITY_GROUPS,
  ATTRIBUTE_GROUPS,
  type ModifierRule,
  type RuleEffect,
} from '@w20-vtt/core';

export const ruleField =
  'rounded border border-stone-700 bg-zinc-950 px-2 py-1.5 text-sm text-stone-100';
export const ruleButton =
  'rounded border border-amber-600/60 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-100 disabled:opacity-40';
const targets = [
  'pool',
  'difficulty',
  'initiative',
  'health:bruised',
  'wound:penalty',
  'soak:silver',
  ...Object.values(ATTRIBUTE_GROUPS)
    .flat()
    .map((key) => 'attribute:' + key),
  ...Object.values(ABILITY_GROUPS)
    .flat()
    .map((key) => 'ability:' + key),
  'movement:walk',
  'movement:jog',
  'movement:run',
  'resource:rage',
  'resource:gnosis',
  'resource:willpower',
];
export function effectText(effect: RuleEffect): string {
  const value =
    typeof effect.value === 'object'
      ? [effect.value.factor, effect.value.trait ?? effect.value.per]
          .filter((v) => v !== undefined)
          .join(' × ')
      : String(effect.value);
  const verb = {
    add: Number(value) >= 0 ? '+' : '',
    multiply: '×',
    set: '= ',
    max: 'at least ',
    min: 'at most ',
    ignore: 'ignore ',
    allow: 'allow ',
    deny: 'deny ',
  }[effect.operation];
  return `${effect.target.replace(/[:_]/g, ' ')} ${verb}${value}`;
}
export const factLabel = (tag: string) => tag.replace(/[:_-]/g, ' ');

export function RuleEditor({
  name,
  existing,
  onSave,
}: {
  name: string;
  existing?: ModifierRule;
  onSave: (rule: ModifierRule | undefined) => void;
}) {
  const [source, setSource] = useState(existing?.source.book ?? '');
  const [page, setPage] = useState(existing?.source.page?.toString() ?? '');
  const [activationRoll, setActivationRoll] = useState(existing?.activation?.roll ?? false);
  const [rollPool, setRollPool] = useState(
    typeof existing?.activation?.rollSpec?.pool === 'number'
      ? String(existing.activation.rollSpec.pool)
      : ''
  );
  const [attribute, setAttribute] = useState(existing?.activation?.rollSpec?.attribute ?? 'gnosis');
  const [ability, setAbility] = useState(existing?.activation?.rollSpec?.ability ?? '');
  const [difficulty, setDifficulty] = useState(existing?.activation?.rollSpec?.difficulty ?? 6);
  const [cost, setCost] = useState(existing?.activation?.cost ?? {});
  const [note, setNote] = useState(existing?.note ?? '');
  const [target, setTarget] = useState('pool');
  const [operation, setOperation] = useState<RuleEffect['operation']>('add');
  const [value, setValue] = useState('1');
  const [condition, setCondition] = useState('');
  const [recipient, setRecipient] = useState<NonNullable<RuleEffect['recipient']>>('self');
  const [duration, setDuration] = useState('');
  const [effects, setEffects] = useState<RuleEffect[]>(existing?.effects ?? []);
  const readClause = (): RuleEffect => ({
    target: target.trim(),
    operation,
    value: value === 'dots' || value === 'successes' ? value : Number(value),
    when: condition
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean),
    recipient,
    ...(duration ? { duration } : {}),
  });
  const validClause = Boolean(
    target.trim() &&
      value.trim() &&
      (['dots', 'successes'].includes(value) ||
        (Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1000)) &&
      (recipient === 'self' || duration)
  );
  const save = (rows: RuleEffect[]) => {
    const timed = rows.find((row) => row.duration);
    const rolled = activationRoll || rows.some((row) => row.value === 'successes');
    const originalRoll = existing?.activation?.rollSpec;
    const changedRoll =
      !originalRoll ||
      rollPool !== (typeof originalRoll.pool === 'number' ? String(originalRoll.pool) : '') ||
      attribute !== (originalRoll.attribute ?? 'gnosis') ||
      ability !== (originalRoll.ability ?? '') ||
      difficulty !== (originalRoll.difficulty ?? 6);
    const rollSpec = changedRoll
      ? {
          ...originalRoll,
          difficulty,
          ...(rollPool !== ''
            ? { pool: Number(rollPool), attribute: undefined, ability: undefined }
            : { pool: undefined, attribute, ability: ability || undefined }),
        }
      : originalRoll;
    onSave({
      ...existing,
      id: existing?.id ?? 'custom-' + crypto.randomUUID(),
      name,
      source: { book: source.trim(), ...(page ? { page: Number(page) } : {}) },
      note: note.trim() || undefined,
      effects: rows,
      activation: timed
        ? {
            ...existing?.activation,
            duration: timed.duration!,
            roll: rolled,
            rollSpec: rolled ? rollSpec : undefined,
            cost,
          }
        : undefined,
    });
  };
  return (
    <details className="mt-3 rounded border border-stone-700 p-3">
      <summary className="cursor-pointer text-sm text-amber-200">Edit custom rule</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save(effects.length ? effects : [readClause()]);
        }}
      >
        <div className="flex flex-wrap gap-2">
          <label>
            Rule source{' '}
            <input
              className={ruleField}
              required
              maxLength={240}
              placeholder="Book or chronicle ruling"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label>
            Page{' '}
            <input
              className={ruleField + ' w-20'}
              type="number"
              min="1"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </label>
        </div>
        {effects.map((effect, index) => (
          <div key={index} className="flex items-center gap-3">
            {effectText(effect)}{' '}
            <button
              type="button"
              className={ruleButton}
              onClick={() => setEffects(effects.filter((_, i) => i !== index))}
            >
              Remove clause
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <label>
            Adjust{' '}
            <select
              className={ruleField}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {targets.map((key) => (
                <option key={key} value={key}>
                  {factLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operation{' '}
            <select
              className={ruleField}
              value={operation}
              onChange={(e) => setOperation(e.target.value as RuleEffect['operation'])}
            >
              {['add', 'set', 'multiply', 'min', 'max', 'allow', 'deny', 'ignore'].map((op) => (
                <option key={op}>{op}</option>
              ))}
            </select>
          </label>
          <label>
            Amount{' '}
            <input
              className={ruleField + ' w-24'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              list="custom-amounts"
            />
          </label>
          <datalist id="custom-amounts">
            <option>dots</option>
            <option>successes</option>
          </datalist>
          <label>
            Applies when{' '}
            <input
              className={ruleField}
              placeholder="ability:leadership, indoors"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </label>
          <label>
            Recipient{' '}
            <select
              className={ruleField}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value as typeof recipient)}
            >
              {['self', 'target', 'pack', 'shared'].map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
          <label>
            Duration{' '}
            <select
              className={ruleField}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="">While owned or equipped</option>
              {['next-roll', 'turn', 'scene', 'story', 'permanent'].map((key) => (
                <option key={key} value={key}>
                  {factLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <button
            className={ruleButton}
            type="button"
            disabled={!validClause || effects.length >= 64}
            onClick={() => setEffects([...effects, readClause()])}
          >
            Add clause
          </button>
        </div>
        <label className="block">
          Rule notes{' '}
          <input
            className={ruleField}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {(duration || effects.some((e) => e.duration)) && (
          <fieldset className="space-y-2">
            <legend>Activation</legend>
            <label className="block">
              <input
                type="checkbox"
                checked={
                  activationRoll ||
                  effects.some((e) => e.value === 'successes') ||
                  value === 'successes'
                }
                onChange={(e) => setActivationRoll(e.target.checked)}
              />{' '}
              Roll to activate
            </label>
            {(activationRoll ||
              effects.some((e) => e.value === 'successes') ||
              value === 'successes') && (
              <div className="flex flex-wrap gap-2">
                <label>
                  Attribute or resource{' '}
                  <select
                    className={ruleField}
                    value={attribute}
                    onChange={(e) => setAttribute(e.target.value as typeof attribute)}
                  >
                    {[...Object.values(ATTRIBUTE_GROUPS).flat(), 'gnosis', 'rage', 'willpower'].map(
                      (key) => (
                        <option key={key}>{key}</option>
                      )
                    )}
                  </select>
                </label>
                <label>
                  Ability{' '}
                  <select
                    className={ruleField}
                    value={ability}
                    onChange={(e) => setAbility(e.target.value)}
                  >
                    <option value="">None</option>
                    {Object.values(ABILITY_GROUPS)
                      .flat()
                      .map((key) => (
                        <option key={key}>{key}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Fixed pool{' '}
                  <input
                    className={ruleField + ' w-20'}
                    type="number"
                    min={1}
                    max={30}
                    placeholder="Optional"
                    value={rollPool}
                    onChange={(e) => setRollPool(e.target.value)}
                  />
                </label>
                <label>
                  Difficulty{' '}
                  <input
                    className={ruleField + ' w-20'}
                    type="number"
                    min={2}
                    max={10}
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(['rage', 'gnosis', 'willpower'] as const).map((key) => (
                <label key={key}>
                  {factLabel(key)} cost{' '}
                  <input
                    className={ruleField + ' w-16'}
                    type="number"
                    min={0}
                    max={10}
                    value={cost[key] ?? 0}
                    onChange={(e) => setCost({ ...cost, [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button
          className={ruleButton}
          disabled={!source.trim() || (!effects.length && !validClause)}
        >
          Save rule
        </button>
        {existing && (
          <button
            className="ml-3 text-sm text-red-300"
            type="button"
            onClick={() => onSave(undefined)}
          >
            Remove custom rule
          </button>
        )}
      </form>
    </details>
  );
}
