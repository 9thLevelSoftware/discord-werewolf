import React, { useState } from 'react';
import {
  ABILITY_GROUPS,
  ATTRIBUTE_GROUPS,
  type ModifierRule,
  type RuleEffect,
} from '@w20-vtt/core';
import { X } from 'lucide-react';
import { Button, ConfirmButton, IconButton } from '../ui';

/** Text inputs and selects in rule forms. Matches the shared `TextInput` and `Select`. */
export const ruleField =
  'h-control-md min-w-0 rounded-lg border border-stone-700 bg-obsidian-950 px-2.5 text-sm text-parchment transition ' +
  'placeholder:text-stone-500 hover:not-disabled:border-stone-500 focus-visible:border-gold-400 ' +
  'disabled:cursor-not-allowed disabled:opacity-45';
/** Secondary actions in rule forms. Matches the shared secondary `Button`. */
export const ruleButton =
  'inline-flex h-control-md shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gold-500/45 ' +
  'bg-obsidian-900 px-3.5 text-xs font-semibold text-gold-200 transition hover:not-disabled:border-gold-300 ' +
  'hover:not-disabled:bg-obsidian-800 disabled:cursor-not-allowed disabled:opacity-45';
/** A titled card on the Rules & Equipment page. Matches the other sheet pages. */
export const rulePanel = 'rounded-xl border border-amber-500/20 bg-zinc-950/75 p-3.5';
export const rulePanelTitle =
  'font-display text-xs font-bold tracking-wider uppercase text-amber-200';
/** An inset group inside a panel. */
export const ruleInset = 'rounded-lg border border-stone-800 bg-obsidian-950/60 p-3';
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
    <details className={ruleInset}>
      <summary>Edit custom rule</summary>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save(effects.length ? effects : [readClause()]);
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
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
              className={ruleField}
              type="number"
              min="1"
              value={page}
              onChange={(e) => setPage(e.target.value)}
            />
          </label>
        </div>
        {effects.length > 0 && (
          <ul className="divide-y divide-stone-800 rounded-lg border border-stone-800">
            {effects.map((effect, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-1 pr-1 pl-3">
                <span className="min-w-0 text-sm text-parchment">{effectText(effect)}</span>
                <IconButton
                  label="Remove clause"
                  icon={<X className="h-3.5 w-3.5" />}
                  variant="ghost"
                  size="sm"
                  onClick={() => setEffects(effects.filter((_, i) => i !== index))}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3">
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
              className={ruleField}
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
            className={ruleButton + ' col-span-2 sm:col-span-3 sm:justify-self-start'}
            type="button"
            disabled={!validClause || effects.length >= 64}
            onClick={() => setEffects([...effects, readClause()])}
          >
            Add clause
          </button>
        </div>
        <label>
          Rule notes{' '}
          <input
            className={ruleField}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {(duration || effects.some((e) => e.duration)) && (
          <fieldset className="space-y-2.5 border-t border-stone-800 pt-3">
            <legend className="sr-only">Activation</legend>
            <p className={rulePanelTitle}>Activation</p>
            <label>
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
              <div className="grid grid-cols-2 gap-2">
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
                    className={ruleField}
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
                    className={ruleField}
                    type="number"
                    min={2}
                    max={10}
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(['rage', 'gnosis', 'willpower'] as const).map((key) => (
                <label key={key}>
                  {factLabel(key)} cost{' '}
                  <input
                    className={ruleField}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-800 pt-3">
          <Button
            type="submit"
            variant="primary"
            disabled={!source.trim() || (!effects.length && !validClause)}
          >
            Save rule
          </Button>
          {existing && (
            <ConfirmButton
              prompt="Remove this custom rule?"
              confirmLabel="Remove"
              onConfirm={() => onSave(undefined)}
            >
              Remove custom rule
            </ConfirmButton>
          )}
        </div>
      </form>
    </details>
  );
}
