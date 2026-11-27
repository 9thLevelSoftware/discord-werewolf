import React, { useEffect, useState } from 'react';
import {
  computeUserSheetStats,
  computeActorMovement,
  GIFT_MODIFIER_COVERAGE,
  findGiftInCatalog,
  getSheetNamedSpecialty,
  W20_GIFT_CATALOG,
  W20_RITE_CATALOG,
  ABILITY_GROUPS,
  ATTRIBUTE_GROUPS,
  type ModifierRule,
  getSheetModifierSources,
  listOwnedGiftChoices,
  listUnlinkedGiftSources,
  resolveModifierRule,
  W20_WEAPON_PRESETS,
  W20_ARMOR_PRESETS,
  GIFT_MODIFIER_RULES,
  ITEM_MODIFIER_RULES,
  type RuleBinding,
  type RuleSource,
  type W20UserCharacterSheet,
} from '@w20-vtt/core';
import { useCharacterSheetStore } from '../../store/useCharacterSheetStore';
import { useVttRoomStore } from '../../store/useVttRoomStore';
import { RollReplacementActions } from '../dice-table/RollReplacementActions';
import { Button, ConfirmButton, cx } from '../ui';
import { useRuleTargetOptions } from './sheetShared';
import {
  effectText,
  factLabel,
  ruleButton,
  ruleField,
  ruleInset,
  rulePanel,
  rulePanelTitle,
  RuleEditor,
} from './RuleEditor';

type UpdateSheet = (updater: (prev: W20UserCharacterSheet) => W20UserCharacterSheet) => void;
const collections = [
  'otherTraits',
  'backgrounds',
  'gifts',
  'rites',
  'fetishes',
  'combatWeapons',
  'equipment',
] as const;
type ItemPatch = RuleBinding & {
  carried?: boolean;
  worn?: boolean;
  isSilver?: boolean;
  isAttuned?: boolean;
};
function updateEntry(
  sheet: W20UserCharacterSheet,
  id: string,
  patch: ItemPatch
): W20UserCharacterSheet {
  if (id === 'armor') return { ...sheet, armor: { ...sheet.armor, ...patch } };
  if (id === 'pack-totem') return { ...sheet, packTotemRule: { ...sheet.packTotemRule, ...patch } };
  for (const key of collections) {
    const entries = sheet[key];
    if (entries?.some((entry) => entry.id === id)) {
      return {
        ...sheet,
        [key]: entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      };
    }
  }
  return sheet;
}
const catalog = [...Object.values(ITEM_MODIFIER_RULES), ...Object.values(GIFT_MODIFIER_RULES)].sort(
  (a, b) => a.name.localeCompare(b.name)
);

function EquipmentPicker({
  sheet,
  onUpdate,
}: {
  sheet: W20UserCharacterSheet;
  onUpdate: UpdateSheet;
}) {
  const [gear, setGear] = useState('');
  const [selected, setSelected] = useState('');
  const add = () => {
    const weapon = W20_WEAPON_PRESETS.find((item) => item.id === selected);
    const armor = W20_ARMOR_PRESETS.find((item) => item.id === selected);
    if (weapon)
      onUpdate((sheet) =>
        sheet.combatWeapons.length >= 50
          ? sheet
          : {
              ...sheet,
              combatWeapons: [
                ...sheet.combatWeapons,
                {
                  ...weapon,
                  id: crypto.randomUUID(),
                  ruleId: weapon.id,
                  carried: true,
                  isSilver: ['equipment-klaive', 'equipment-grand-klaive'].includes(weapon.id),
                },
              ],
            }
      );
    if (armor)
      onUpdate((sheet) => ({
        ...sheet,
        armor: {
          description: armor.name,
          rating: armor.rating,
          ruleId: armor.id,
          dexterityDifficultyPenalty: armor.dexterityDifficultyPenalty,
          worn: true,
        },
      }));
    setSelected('');
  };
  return (
    <details className={rulePanel}>
      <summary>
        <span className={rulePanelTitle}>Add equipment</span>
      </summary>
      <div className="flex gap-2">
        <select
          aria-label="Rulebook equipment"
          className={ruleField + ' flex-1'}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose W20 equipment</option>
          <optgroup label="Weapons">
            {W20_WEAPON_PRESETS.map((i) => (
              <option value={i.id} key={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Armor">
            {W20_ARMOR_PRESETS.map((i) => (
              <option value={i.id} key={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          className={ruleButton}
          disabled={
            !selected ||
            (sheet.combatWeapons.length >= 50 && W20_WEAPON_PRESETS.some((w) => w.id === selected))
          }
          onClick={add}
        >
          {W20_ARMOR_PRESETS.some((i) => i.id === selected) ? 'Wear this armor' : 'Add weapon'}
        </button>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!gear.trim()) return;
          onUpdate((s) =>
            (s.equipment?.length ?? 0) >= 80
              ? s
              : {
                  ...s,
                  equipment: [
                    ...(s.equipment ?? []),
                    { id: crypto.randomUUID(), name: gear.trim(), carried: true },
                  ],
                }
          );
          setGear('');
        }}
      >
        <input
          aria-label="Custom equipment name"
          placeholder="Custom equipment name"
          className={ruleField + ' flex-1'}
          maxLength={120}
          value={gear}
          onChange={(e) => setGear(e.target.value)}
        />
        <button
          className={ruleButton}
          disabled={!gear.trim() || (sheet.equipment?.length ?? 0) >= 80}
        >
          Add item
        </button>
      </form>
    </details>
  );
}

const ACTIVATION_CHIP =
  'rounded-md border border-stone-700 bg-obsidian-900 px-1.5 py-0.5 text-xs font-semibold text-stone-300';
const COST_CHIP_TONE: Record<string, string> = {
  rage: 'border-red-500/40 text-red-300',
  gnosis: 'border-cyan-500/40 text-cyan-300',
  willpower: 'border-indigo-400/40 text-indigo-300',
};

/** Order and headings for the trait list on the Rules & Equipment page. */
const SOURCE_GROUPS: ReadonlyArray<readonly [kind: string, label: string]> = [
  ['gift', 'Gifts'],
  ['rite', 'Rites'],
  ['fetish', 'Fetishes'],
  ['weapon', 'Weapons'],
  ['armor', 'Armor'],
  ['equipment', 'Equipment'],
  ['background', 'Backgrounds'],
  ['merit', 'Merits'],
  ['flaw', 'Flaws'],
  ['totem', 'Pack totem'],
  ['active-effect', 'Active effects'],
  ['other', 'Other traits'],
];

function groupSources(sources: RuleSource[]) {
  const known = new Set(SOURCE_GROUPS.map(([kind]) => kind));
  return SOURCE_GROUPS.map(([kind, label]) => ({
    label,
    items: sources.filter((source) =>
      kind === 'other' ? !known.has(source.kind ?? 'other') || source.kind === 'other' : source.kind === kind
    ),
  })).filter((group) => group.items.length > 0);
}

const StatTile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-lg border border-stone-800 bg-obsidian-950/60 px-2 py-1.5 text-center">
    <p className="text-xs font-semibold tracking-wide text-stone-400 uppercase">{label}</p>
    <p className="font-display text-base font-bold text-parchment">{value}</p>
  </div>
);

type ChoiceField = NonNullable<ModifierRule['choiceFields']>[number];
function ChoiceInput({
  field,
  value,
  onChange,
  abilities,
  weapons,
  sheet,
}: {
  field: ChoiceField;
  value?: string | number;
  onChange: (value: string | number) => void;
  abilities: string[];
  weapons: W20UserCharacterSheet['combatWeapons'];
  sheet: W20UserCharacterSheet;
}) {
  if (field.key === 'giftSourceId') {
    const unlinked = listUnlinkedGiftSources(sheet);
    return (
      <label className="block">
        {field.label}{' '}
        <select
          className={ruleField}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose a Gift…</option>
          {listOwnedGiftChoices(sheet).map((gift) => (
            <option key={gift.sourceEntryId} value={gift.sourceEntryId}>
              {gift.name}
            </option>
          ))}
        </select>
        {unlinked.length > 0 && (
          <small className="block text-stone-400">
            Link a documented Gift to share {unlinked.map((gift) => gift.name).join(', ')}.
          </small>
        )}
      </label>
    );
  }
  if (field.key === 'weaponId')
    return (
      <label className="block">
        {field.label}{' '}
        <select
          className={ruleField}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose weapon…</option>
          {weapons
            .filter((w) => w.carried !== false)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
        </select>
      </label>
    );
  const options =
    field.options ??
    (field.kind === 'attribute'
      ? Object.values(ATTRIBUTE_GROUPS).flat()
      : field.kind === 'ability'
        ? abilities
        : []);
  return (
    <label className="block">
      {field.label}{' '}
      {options.length ? (
        <select
          className={ruleField}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {options.map((v) => (
            <option key={v} value={v}>
              {factLabel(v)}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={ruleField}
          type={field.kind === 'number' ? 'number' : 'text'}
          min={field.min}
          max={field.max}
          maxLength={160}
          value={value ?? ''}
          onChange={(e) =>
            onChange(
              field.kind === 'number' && e.target.value !== ''
                ? Number(e.target.value)
                : e.target.value
            )
          }
        />
      )}
    </label>
  );
}
function RuleEntry({
  entry,
  sheet,
  seatId,
  onUpdate,
}: {
  entry: RuleSource;
  sheet: W20UserCharacterSheet;
  seatId: string;
  onUpdate: UpdateSheet;
}) {
  const primaryRule = entry.customRule ?? resolveModifierRule(entry.ruleId ?? '');
  const [pendingRequest, setPendingRequest] = useState('');
  const lastActivation = useVttRoomStore((state) => state.lastRuleActivation);
  const lastRuleStateReply = useVttRoomStore((state) => state.lastRuleStateReply);
  const lastError = useVttRoomStore((state) => state.lastError);
  const connectionStatus = useVttRoomStore((state) => state.connectionStatus);
  useEffect(() => {
    if (
      pendingRequest &&
      (lastActivation?.reqId === pendingRequest || lastRuleStateReply === pendingRequest ||
        lastError?.reqId === pendingRequest ||
        connectionStatus !== 'authenticated')
    )
      setPendingRequest('');
  }, [pendingRequest, lastActivation, lastRuleStateReply, lastError, connectionStatus]);
  const followUpOnly = entry.kind === 'active-effect';
  const [actionId, setActionId] = useState(
    followUpOnly ? (primaryRule?.actions?.[0]?.id ?? '') : ''
  );
  const action = primaryRule?.actions?.find((candidate) => candidate.id === actionId);
  const rule =
    primaryRule && action ? { ...primaryRule, ...action, id: primaryRule.id } : primaryRule;
  const giftId =
    !rule && entry.kind === 'gift'
      ? W20_GIFT_CATALOG.find(
          (g) =>
            g.id === (entry.ruleId ?? entry.id) || g.name.toLowerCase() === entry.name.toLowerCase()
        )?.id
      : undefined;
  const giftReference = giftId && GIFT_MODIFIER_COVERAGE.find((row) => row.id === giftId);
  const [activationChoices, setActivationChoices] = useState<Record<string, string | number>>({});
  const send = useVttRoomStore((s) => s.sendCommand);
  const tableTargets = useRuleTargetOptions();
  const connected = useVttRoomStore((s) => s.connectionStatus === 'authenticated');
  const [targets, setTargets] = useState<string[]>([]);
  const [targetChoices, setTargetChoices] = useState<
    Record<string, Record<string, string | number>>
  >({});
  const [confirmed, setConfirmed] = useState(false);
  const [activationTags, setActivationTags] = useState<string[]>([]);
  const [declaredSpecialty, setDeclaredSpecialty] = useState('');
  const [activationDifficulty, setActivationDifficulty] = useState('');
  const [referenceRollId, setReferenceRollId] = useState('');
  const rollHistory = useVttRoomStore((s) => s.rollHistory);
  const roomRules = useVttRoomStore((s) => s.ruleState);
  const userId = useCharacterSheetStore((s) => s.initializedUserId);
  const fateRolls = rule?.activation?.correctsPreviousRoll
    ? rollHistory.filter(
        (roll) =>
          roll.sheetId === sheet.id &&
          roll.rollerDiscordId === userId &&
          roll.roll.rollMode !== 'initiative' &&
          (roomRules?.correctableRollIds
            ? roomRules.correctableRollIds.includes(roll.id)
            : !roll.correctionOf && !roll.rerollOf &&
              !rollHistory.some((other) => other.correctionOf === roll.id || other.rerollOf === roll.id))
      )
    : [];
  const [opposition, setOpposition] = useState('');
  const [extraCosts, setExtraCosts] = useState<
    Partial<Record<'rage' | 'gnosis' | 'willpower', number>>
  >({});
  const [secret, setSecret] = useState(false);
  const [payGnosis, setPayGnosis] = useState(false);
  const [amount, setAmount] = useState(1);
  const [link, setLink] = useState('');
  const patch = (fields: ItemPatch) => onUpdate((s) => updateEntry(s, entry.id, fields));
  const fetish = sheet.fetishes.find((item) => item.id === entry.id);
  const gear = sheet.equipment?.find((item) => item.id === entry.id);
  const weapon = sheet.combatWeapons.find((item) => item.id === entry.id);
  const carriedItem = gear ?? fetish ?? weapon;
  const targetable =
    rule?.activation?.requiresTarget ||
    rule?.activation?.rollSpec?.actor === 'target' ||
    rule?.activation?.excludeCaster ||
    Boolean(rule?.activation?.frequency?.includes('target')) ||
    rule?.effects.some((effect) => effect.recipient && effect.recipient !== 'self');
  const targetsAtTable = tableTargets.filter(
    (p) => !rule?.activation?.excludeCaster || p.id !== sheet.id
  );
  const active = rule?.activation;
  const catalogGift = rule && findGiftInCatalog(rule.id);
  const isFairFortune = catalogGift?.slug === 'fair-fortune';
  const sheetGift = sheet.gifts.find((gift) => gift.id === entry.id);
  const rite = entry.kind === 'rite' ? W20_RITE_CATALOG.find((item) => item.id === rule?.id) : undefined;
  const spec = active?.rollSpec;
  const rollingSheet = spec?.actor === 'target'
    ? roomRules?.sheets.find((item) => item.id === targets[0])
    : sheet;
  const namedSpecialty = active?.roll && rollingSheet && spec?.pool === undefined && !spec?.poolTrait
    ? getSheetNamedSpecialty(rollingSheet,
        spec?.attribute ?? sheetGift?.rollAttribute ?? catalogGift?.rollAttribute ?? rite?.rollAttribute,
        spec ? spec.ability : sheetGift?.rollAbility ?? catalogGift?.rollAbility ?? rite?.rollAbility)
    : undefined;
  const declarationKey = namedSpecialty && `${rollingSheet?.id}:${rule?.id}:${actionId}:${namedSpecialty}`;
  const fairOptions = isFairFortune
    ? roomRules?.rerollOptions?.filter((option) => option.sheetId === sheet.id && option.ruleId === rule?.id) ?? []
    : [];
  const localChoices = active
    ? { ...entry.ruleChoices, ...activationChoices }
    : (entry.ruleChoices ?? {});
  const missingChoice = (rule?.choiceFields ?? []).some((field) => {
    if (
      field.key === active?.allocation?.choiceKey &&
      active.allocation.consumeOnRoll &&
      !field.perTarget
    )
      return false;
    const required = field.kind === 'number' && (field.min ?? 0) <= 0 ? false : true;
    return (
      required &&
      (field.perTarget
        ? targets.some(
            (id) => targetChoices[id]?.[field.key] == null || targetChoices[id]?.[field.key] === ''
          )
        : localChoices[field.key] == null || localChoices[field.key] === '')
    );
  });
  const roomEffects = useVttRoomStore((s) => s.ruleState?.effects);
  const ownEffects = [
    ...(sheet.activeRuleEffects ?? []),
    ...(roomEffects ?? []).filter((e) => e.sourceId === sheet.id).map((e) => e.instance),
  ];
  const isPreviousActive = ownEffects.some(
    (instance) =>
      instance.ruleId === primaryRule?.id &&
      (instance.sourceId === entry.id || instance.sourceId === sheet.id + ':' + entry.id) &&
      (!action?.requiresActiveTarget ||
        instance.rule?.effects.some((e) => e.target === action.requiresActiveTarget))
  );
  const setChoice = (key: string, value: string | number) =>
    active
      ? setActivationChoices({ ...activationChoices, [key]: value })
      : patch({ ruleChoices: { ...entry.ruleChoices, [key]: value } });
  const ruleChoices = Object.fromEntries(
    (rule?.choiceFields ?? [])
      .filter(
        (f) =>
          !f.perTarget &&
          (f.key !== active?.allocation?.choiceKey || !active?.allocation?.consumeOnRoll)
      )
      .map((f) => [f.key, localChoices[f.key] ?? (f.kind === 'number' ? 0 : '')])
  );

  const activationFacts = [
    ...new Set(
      rule?.effects
        .filter((e) => e.duration === 'instant' || e.when?.includes('roll:activation'))
        .flatMap((e) => [...(e.when ?? []), ...(e.unless ?? [])]) ?? []
    ),
  ].filter(
    (tag) =>
      !tag.includes('$') && !/^(roll|item|source|ability|attribute|form|choice|variant):/.test(tag)
  );
  const choices = rule?.choices ?? [];
  const abilities = [
    ...Object.values(ABILITY_GROUPS).flat(),
    ...sheet.customAbilities.map((a) => a.id),
  ];
  const options = choices.includes('ability') ? abilities : choices;
  const variableDifficulty =
    active?.rollSpec?.difficultyNote || (active?.rollSpec?.difficultyTrait && !targets.length);
  const needsDifficulty =
    Boolean(variableDifficulty) &&
    active?.rollSpec?.difficulty === undefined &&
    !(active?.rollSpec?.difficultyTrait && targets.length);
  const freeChoice =
    !rule?.choiceFields?.length &&
    choices.some((choice) => choice === 'camp' || choice.includes(' ') || choice === 'ability');
  return (
    <div className="space-y-3">
      {!!primaryRule?.actions?.length && (
        <label className="block">
          Rule action{' '}
          <select
            className={ruleField}
            value={actionId}
            onChange={(e) => {
              setActionId(e.target.value);
              setActivationChoices({});
              setTargets([]);
              setActivationTags([]);
              setConfirmed(false);
              setTargetChoices({});
              setActivationDifficulty('');
            }}
          >
            {!followUpOnly && <option value="">{primaryRule.name}</option>}
            {primaryRule.actions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {giftReference && (
        <p className="text-sm text-stone-300">
          {giftReference.note}{' '}
          <span className="text-xs text-stone-400">
            {giftReference.source.book} p. {giftReference.source.page}
          </span>
        </p>
      )}
      {rule && (
        <div>
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-parchment">
            {rule.name !== entry.name && rule.name}
            <small className="text-xs font-normal text-stone-400">
              {rule.source.book}
              {rule.source.page ? ' p. ' + rule.source.page : ''}
            </small>
          </p>
          {rule.effects.length > 0 && (
            <ul className="mt-2 divide-y divide-stone-800 rounded-lg border border-stone-800 text-sm">
              {rule.effects.map((effect, index) => (
                <li key={index} className="px-3 py-1.5">
                  <span className="text-parchment">{effectText(effect)}</span>
                  <span className="text-stone-400">
                    {effect.when?.length ? ' when ' + effect.when.map(factLabel).join(' and ') : ''}
                    {effect.unless?.length
                      ? ' unless ' + effect.unless.map(factLabel).join(' or ')
                      : ''}
                    {effect.duration ? ' · ' + factLabel(effect.duration) : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rule.note && <p className="mt-2 text-xs text-stone-400">{rule.note}</p>}
        </div>
      )}
      {freeChoice && (
        <label className="block">
          Rule choice{' '}
          <input
            aria-label="Rule choice"
            list={'choice-' + entry.id}
            className={ruleField}
            placeholder={choices.join(' / ')}
            defaultValue={entry.ruleChoice ?? ''}
            maxLength={120}
            onBlur={(e) => patch({ ruleChoice: e.target.value.trim() || undefined })}
          />
          <datalist id={'choice-' + entry.id}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
      )}
      {!rule?.choiceFields?.length && !freeChoice && !!rule?.choices?.length && (
        <label className="block">
          Rule choice{' '}
          <select
            className={ruleField}
            value={entry.ruleChoice ?? ''}
            onChange={(e) => patch({ ruleChoice: e.target.value || undefined })}
          >
            <option value="">Choose…</option>
            {rule.choices.map((option) => (
              <option key={option} value={option}>
                {factLabel(option)}
              </option>
            ))}
          </select>
        </label>
      )}
      {rule?.choiceFields
        ?.filter(
          (f) =>
            !f.perTarget &&
            (f.key !== active?.allocation?.choiceKey || !active.allocation.consumeOnRoll)
        )
        .map((f) => (
          <ChoiceInput
            key={f.key}
            field={f}
            abilities={abilities}
            weapons={sheet.combatWeapons}
            sheet={sheet}
            value={
              localChoices[f.key] ?? (f.kind === 'number' && (f.min ?? 0) === 0 ? 0 : undefined)
            }
            onChange={(value) => setChoice(f.key, value)}
          />
        ))}
      {(carriedItem || entry.id === 'armor') && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {carriedItem && (
            <label>
              <input
                type="checkbox"
                checked={carriedItem.carried !== false}
                onChange={(e) => patch({ carried: e.target.checked })}
              />{' '}
              Carried
            </label>
          )}
          {carriedItem && (
            <label>
              <input
                type="checkbox"
                checked={Boolean(carriedItem.isSilver)}
                onChange={(e) => patch({ isSilver: e.target.checked })}
              />{' '}
              Silver
            </label>
          )}
          {(gear || entry.id === 'armor') && (
            <label>
              <input
                type="checkbox"
                checked={entry.id === 'armor' ? sheet.armor.worn !== false : Boolean(gear?.worn)}
                onChange={(e) => patch({ worn: e.target.checked })}
              />{' '}
              Worn
            </label>
          )}
          {fetish && fetish.level > 0 && (
            <label>
              <input
                type="checkbox"
                checked={fetish.isAttuned !== false}
                onChange={(e) => patch({ isAttuned: e.target.checked })}
              />{' '}
              Attuned
            </label>
          )}
        </div>
      )}
      {rule?.effects.some((e) => e.when?.includes('event:totem_acceptance')) && (
        <button
          className={ruleButton}
          disabled={!connected}
          onClick={() =>
            send({
              type: 'APPLY_RULE_EVENT',
              event: 'totem_acceptance',
              seatId,
              sourceEntryId: entry.id,
              ruleId: rule.id,
            })
          }
        >
          Record totem acceptance
        </button>
      )}
      {isFairFortune && (
        <div className="space-y-2">
          {fairOptions.length === 0 && <p className="text-sm text-stone-400">No eligible failed roll for Fair Fortune.</p>}
          {fairOptions.map((option) => (
            <div
              key={option.rollId}
              className={ruleInset + ' flex flex-wrap items-center justify-between gap-2 py-2'}
            >
              <span className="text-sm text-parchment">{rollHistory.find((roll) => roll.id === option.rollId)?.label ??
                roomRules?.pendingActivations?.find((pending) => pending.rollId === option.rollId)?.label ?? 'Failed roll'}</span>
              <RollReplacementActions options={[option]} disabled={!connected} onChoose={() =>
                send({ type: 'REROLL_RULE_ROLL', seatId, sheetId: sheet.id, rollId: option.rollId, ruleId: option.ruleId })} />
            </div>
          ))}
        </div>
      )}
      {active && rule && !isFairFortune && (
        <div className={ruleInset + ' space-y-2.5 [&>p]:text-xs [&>p]:text-stone-400'}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={rulePanelTitle + ' mr-1'}>Activation</span>
            {Object.entries(active.cost ?? {})
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <span key={k} className={ACTIVATION_CHIP + ' ' + (COST_CHIP_TONE[k] ?? '')}>
                  {v} {factLabel(k)}
                </span>
              ))}
            {active.roll && <span className={ACTIVATION_CHIP}>Activation roll</span>}
            <span className={ACTIVATION_CHIP}>{factLabel(active.duration)}</span>
          </div>
          {(active.preparation || active.condition) && (
            <label className="block">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              {[active.condition, active.preparation].filter(Boolean).join(' · ')}
            </label>
          )}
          {active?.correctsPreviousRoll && (
            <label className="block">
              Original roll{' '}
              <select
                className={ruleField}
                value={referenceRollId}
                onChange={(e) => setReferenceRollId(e.target.value)}
              >
                <option value="">Select the roll Fate should change</option>
                {fateRolls.map((roll) => (
                  <option key={roll.id} value={roll.id}>
                    {roll.label} · {roll.roll.netSuccesses} successes ·{' '}
                    {new Date(roll.timestamp).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {declarationKey && <label className="block">
            <input type="checkbox" checked={declaredSpecialty === declarationKey}
              onChange={(event) => setDeclaredSpecialty(event.target.checked ? declarationKey : '')} />
            {' '}Apply specialty · {namedSpecialty}
          </label>}
          {variableDifficulty && (
            <label className="block">
              {active.rollSpec?.difficultyNote ?? 'Target difficulty'}{' '}
              <input
                type="number"
                min={2}
                max={10}
                aria-label="Activation difficulty"
                className={ruleField + ' w-20'}
                value={activationDifficulty}
                onChange={(e) => setActivationDifficulty(e.target.value)}
              />
            </label>
          )}
          {activationFacts.map((tag) => (
            <label className="block" key={tag}>
              <input
                type="checkbox"
                checked={activationTags.includes(tag)}
                onChange={(e) =>
                  setActivationTags(
                    e.target.checked
                      ? [...activationTags, tag]
                      : activationTags.filter((t) => t !== tag)
                  )
                }
              />{' '}
              {factLabel(tag)}
            </label>
          ))}
          {active.rollSpec?.opposed && (
            <label className="block">
              Opposing successes{' '}
              <input
                type="number"
                min={0}
                max={100}
                className={ruleField + ' w-20'}
                value={opposition}
                onChange={(e) => setOpposition(e.target.value)}
              />
            </label>
          )}
          {targetable && (
            <fieldset className="flex flex-wrap gap-x-5 gap-y-1.5">
              <legend>{active.requiresTarget ? 'Affected opponent' : 'Recipients'}</legend>
              {targetsAtTable.length === 0 && (
                <p className="text-xs text-stone-400">No other characters are seated at this table.</p>
              )}
              {targetsAtTable.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={targets.includes(p.id)}
                    onChange={(e) =>
                      setTargets(
                        e.target.checked ? [...targets, p.id] : targets.filter((id) => id !== p.id)
                      )
                    }
                  />{' '}
                  {p.name}
                </label>
              ))}
            </fieldset>
          )}
          {targets.map((id) => (
            <div key={id}>
              {rule.choiceFields
                ?.filter((f) => f.perTarget)
                .map((f) => (
                  <ChoiceInput
                    key={f.key}
                    field={{
                      ...f,
                      label:
                        (targetsAtTable.find((p) => p.id === id)?.name || id) + ' · ' + f.label,
                    }}
                    abilities={abilities}
                    weapons={sheet.combatWeapons}
                    sheet={sheet}
                    value={targetChoices[id]?.[f.key]}
                    onChange={(value) =>
                      setTargetChoices({
                        ...targetChoices,
                        [id]: { ...targetChoices[id], [f.key]: value },
                      })
                    }
                  />
                ))}
            </div>
          ))}
          {(active.alternativeCost || (fetish && fetish.level > 0 && !rule.id.startsWith('talen-') && active.roll !== false)) && !action && (
            <label className="block">
              <input
                type="checkbox"
                checked={payGnosis}
                onChange={(e) => setPayGnosis(e.target.checked)}
              />{' '}
              {active.alternativeCost
                ? 'Pay alternative cost · ' +
                  Object.entries(active.alternativeCost)
                    .map(([k, v]) => v + ' ' + k)
                    .join(', ')
                : 'Spend Gnosis to activate'}
            </label>
          )}
          {rule.effects.some(
            (e) => typeof e.value === 'object' && e.value.per === 'choice' && !e.value.choiceKey
          ) && (
            <label>
              Amount{' '}
              <input
                className={ruleField + ' w-20'}
                type="number"
                min="0"
                max="100"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
          )}
          {active.permanentCost && (
            <p>
              Permanent {active.permanentCost.resource} spent ·{' '}
              {String(localChoices[active.permanentCost.choiceKey] ?? 0)}
            </p>
          )}
          {!!active.failureEffects?.length && (
            <p>On failure · {active.failureEffects.map(effectText).join(', ')}</p>
          )}
          {!!active.botchEffects?.length && (
            <p>On a botch · {active.botchEffects.map(effectText).join(', ')}</p>
          )}
          {active.healthCost && (
            <p>
              Health cost · {active.healthCost.levels} {active.healthCost.type}
              {active.healthCost.choiceKey ? ' per ' + factLabel(active.healthCost.choiceKey) : ''}
            </p>
          )}
          {active.variableCost && (
            <p>
              Resource cost ·{' '}
              {String(
                localChoices[active.variableCost.choiceKey] ?? active.variableCost.minimum ?? 0
              )}{' '}
              × {active.variableCost.factor ?? 1}{' '}
              {active.variableCost.resource === '$choices.resource'
                ? String(localChoices.resource ?? 'selected resource')
                : active.variableCost.resource}
            </p>
          )}
          {active.rollSpec && (
            <p>
              {[
                active.rollSpec.poolTrait ?? active.rollSpec.pool ?? active.rollSpec.attribute,
                active.rollSpec.ability,
              ]
                .filter(Boolean)
                .map((v) => factLabel(String(v)))
                .join(' + ')}
              {active.rollSpec.difficulty && ' · Difficulty ' + active.rollSpec.difficulty}
            </p>
          )}
          {active.frequency && <p>{factLabel(active.frequency)}</p>}
          <details>
            <summary>Activation options</summary>
            <label>
              <input
                type="checkbox"
                checked={secret}
                onChange={(e) => setSecret(e.target.checked)}
              />{' '}
              Secret roll
            </label>
            {/spen[dt]|cost|sacrifice/i.test(active.condition ?? '') && (
              <>
                <p className="mt-2 mb-1.5 text-xs text-stone-400">
                  Total resources paid for this activation
                </p>
                <div className="grid grid-cols-3 gap-2">
                {(['rage', 'gnosis', 'willpower'] as const).map((key) => (
                  <label key={key}>
                    {key}{' '}
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className={ruleField}
                      value={extraCosts[key] ?? active.cost?.[key] ?? 0}
                      onChange={(e) =>
                        setExtraCosts({ ...extraCosts, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                </div>
              </>
            )}
          </details>
          <Button
            variant="primary"
            disabled={
              !connected ||
              !!pendingRequest ||
              (fetish && fetish.level > 0 && !rule.id.startsWith('talen-') && fetish.isAttuned === false) ||
              missingChoice ||
              (active?.correctsPreviousRoll &&
                !fateRolls.some((roll) => roll.id === referenceRollId)) ||
              (action?.requiresActive && !isPreviousActive) ||
              (needsDifficulty && !activationDifficulty) ||
              (active.rollSpec?.opposed && !opposition) ||
              (!!(active.preparation || active.condition) && !confirmed) ||
              (targetable && !targets.length) ||
              (!rule.choiceFields?.length && !!rule.choices?.length && !entry.ruleChoice)
            }
            onClick={() =>
              setPendingRequest(
                send({
                  type: 'ACTIVATE_RULE',
                  seatId,
                  context: { tags: activationTags, ...(declarationKey && declaredSpecialty === declarationKey
                    ? { specialtyOverride: true } : {}) },
                  sourceEntryId: entry.id,
                  ruleId: rule.id,
                  actionId: action?.id,
                  referenceRollId: active?.correctsPreviousRoll ? referenceRollId : undefined,
                  targetIds: targetable ? targets : [],
                  ruleChoices,
                  targetChoices: Object.fromEntries(
                    targets.map((id) => [id, targetChoices[id] ?? {}])
                  ),
                  choiceValue: amount,
                  spendGnosis: payGnosis,
                  confirmedConditions: confirmed,
                  activationDifficulty: activationDifficulty
                    ? Number(activationDifficulty)
                    : undefined,
                  opposingSuccesses: opposition ? Number(opposition) : undefined,
                  variableCosts: extraCosts,
                  isSecretRoll: secret,
                })
              )
            }
          >
            {pendingRequest ? 'Activating…' : 'Activate ' + rule.name}
          </Button>
        </div>
      )}
      {!rule && (
        <details className={ruleInset}>
          <summary>Link a documented rule</summary>
          <div className="flex gap-2">
          <select
            aria-label="Catalog rule"
            className={ruleField + ' flex-1'}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          >
            <option value="">Select a rule</option>
            {catalog.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.source.book} {r.source.page}
              </option>
            ))}
          </select>
          <button className={ruleButton} disabled={!link} onClick={() => patch({ ruleId: link })}>
            Link rule
          </button>
          </div>
        </details>
      )}
      {entry.grantInstanceId && (
        <p className="text-sm text-stone-400">Shared through the Unbroken Cord for this scene.</p>
      )}
      {!followUpOnly && !entry.grantInstanceId && (
        <RuleEditor
          key={entry.id + ':' + (entry.customRule?.id ?? '')}
          existing={entry.customRule}
          name={entry.name}
          onSave={(customRule) => patch({ customRule })}
        />
      )}
      {gear && (
        <ConfirmButton
          prompt={'Remove ' + entry.name + '?'}
          confirmLabel="Remove"
          onConfirm={() =>
            onUpdate((s) => ({ ...s, equipment: s.equipment?.filter((i) => i.id !== entry.id) }))
          }
        >
          Remove equipment
        </ConfirmButton>
      )}
    </div>
  );
}

function RuleEventControls({
  seatId,
  sheet,
  connected,
}: {
  seatId: string;
  sheet: W20UserCharacterSheet;
  connected: boolean;
}) {
  const send = useVttRoomStore((s) => s.sendCommand);
  const [event, setEvent] = useState<
    'story_start' | 'story_end' | 'session_start' | 'renown_award' | 'experience_award'
  >('story_start');
  const [amount, setAmount] = useState(1);
  const [trait, setTrait] = useState<'honor' | 'glory' | 'wisdom'>('honor');
  const [tags, setTags] = useState<string[]>([]);
  const factOptions = [
    ...new Set(
      [
        ...getSheetModifierSources(sheet).map(
          (s) => s.customRule ?? resolveModifierRule(s.ruleId ?? '')
        ),
        ...(sheet.activeRuleEffects ?? []).map((e) => e.rule ?? resolveModifierRule(e.ruleId)),
      ].flatMap(
        (r) =>
          r?.effects
            .filter((e) => e.when?.includes('event:' + event))
            .flatMap((e) => e.when?.filter((t) => !t.startsWith('event:')) ?? []) ?? []
      )
    ),
  ];
  return (
    <details className={rulePanel}>
      <summary>
        <span className={rulePanelTitle}>Story events and awards</span>
      </summary>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className={event === 'renown_award' ? '' : 'col-span-2'}>
            Event{' '}
            <select
              className={ruleField}
              value={event}
              onChange={(e) => {
                setEvent(e.target.value as typeof event);
                setTags([]);
              }}
            >
              {['story_start', 'story_end', 'session_start', 'renown_award', 'experience_award'].map(
                (key) => (
                  <option key={key} value={key}>
                    {factLabel(key)}
                  </option>
                )
              )}
            </select>
          </label>
          {event === 'renown_award' && (
            <label>
              Renown{' '}
              <select
                className={ruleField}
                value={trait}
                onChange={(e) => setTrait(e.target.value as typeof trait)}
              >
                {['honor', 'glory', 'wisdom'].map((key) => (
                  <option key={key}>{key}</option>
                ))}
              </select>
            </label>
          )}
          {event.endsWith('_award') && (
            <label className="col-span-2">
              Base award{' '}
              <input
                type="number"
                className={ruleField}
                value={amount}
                min={0}
                max={100}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        {factOptions.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={tags.includes(t)}
              onChange={(e) =>
                setTags(e.target.checked ? [...tags, t] : tags.filter((f) => f !== t))
              }
            />{' '}
            {factLabel(t)}
          </label>
        ))}
        <button
          className={ruleButton + ' w-full'}
          disabled={!connected}
          onClick={() =>
            send({
              type: 'APPLY_RULE_EVENT',
              seatId,
              event,
              amount: event.endsWith('_award') ? amount : undefined,
              trait: event === 'renown_award' ? trait : undefined,
              context: { tags },
            })
          }
        >
          Record for {sheet.name}
        </button>
      </div>
    </details>
  );
}

export function SheetRules({
  sheet,
  seatId,
  onUpdate,
}: {
  sheet: W20UserCharacterSheet;
  seatId: string;
  onUpdate: UpdateSheet;
}) {
  const sources = getSheetModifierSources(sheet);
  const state = useVttRoomStore((s) => s.ruleState);
  const snapshots = [
    ...(sheet.activeRuleEffects ?? []),
    ...(state?.effects ?? [])
      .filter((effect) => effect.sourceId === sheet.id)
      .map((effect) => effect.instance),
  ];
  for (const instance of snapshots) {
    if (
      !instance.sourceId.startsWith(sheet.id + ':') ||
      !instance.rule?.actions?.some((a) => a.requiresActive)
    )
      continue;
    const id = instance.sourceId.slice(sheet.id.length + 1);
    if (sources.some((source) => source.id === id)) continue;
    sources.push({
      id,
      name: (instance.sourceName ?? instance.rule.name) + ' (active effect)',
      kind: 'active-effect',
      customRule: {
        ...instance.rule,
        actions: instance.rule.actions.filter((a) => a.requiresActive),
      },
    });
  }
  const stats = computeUserSheetStats(sheet);
  const selected = useCharacterSheetStore((s) => s.focusedRuleId);
  const setSelected = (focusedRuleId: string) => useCharacterSheetStore.setState({ focusedRuleId });
  const sourceGroups = groupSources(sources);
  // With nothing chosen yet, open the first trait shown in the list.
  const entry = sources.find((item) => item.id === selected) ?? sourceGroups[0]?.items[0];
  const send = useVttRoomStore((s) => s.sendCommand);
  const connected = useVttRoomStore((s) => s.connectionStatus === 'authenticated');
  const [unit, setUnit] = useState<'turn' | 'scene' | 'story' | 'session' | 'seconds'>('turn');
  const [amount, setAmount] = useState(1);
  const [allFours, setAllFours] = useState(false);
  const [movementTags, setMovementTags] = useState<string[]>([]);
  const movement = computeActorMovement(sheet, { allFours, context: { tags: movementTags } });
  const movementFacts = [
    ...new Set(
      stats.ruleEvaluation.pending
        .filter((p) => p.rule.effects.some((e) => e.target.startsWith('movement:')))
        .flatMap((p) => p.reasons)
        .filter(
          (t) =>
            t !== 'Activation required' &&
            t !== 'Choose rule inputs' &&
            !t.includes('$') &&
            !t.startsWith('event:')
        )
    ),
  ];
  const pack = state?.packPools?.[sheet.packName.trim().toLowerCase()];
  // An effect that is still being prepared is tracked by the table before it reaches the sheet.
  const listedEffects = [
    ...(sheet.activeRuleEffects ?? []),
    ...(state?.effects ?? [])
      .filter(
        (item) =>
          item.targetId === sheet.id &&
          !sheet.activeRuleEffects?.some((own) => own.id === item.instance.id)
      )
      .map((item) => item.instance),
  ].map((effect) => ({
    effect,
    preparing: (effect.preparationRounds ?? 0) > 0 || (effect.preparationSeconds ?? 0) > 0,
  }));
  return (
    <section className="w20-rules grid items-start gap-3 text-sm lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className={rulePanel + ' min-w-0'}>
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
          <h3 className={rulePanelTitle}>Traits and items</h3>
          <span className="text-xs text-stone-400">{sources.length} on this sheet</span>
        </div>
        <div className="grid items-start gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label="Trait or item"
            className="w20-thin-scrollbar max-h-48 space-y-2 overflow-y-auto pr-1 md:max-h-[30rem]"
          >
            {sourceGroups.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-0.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((source) => {
                    const sourceRule = source.customRule ?? resolveModifierRule(source.ruleId ?? '');
                    const isSelected = source.id === entry?.id;
                    return (
                      <li key={source.id}>
                        <button
                          type="button"
                          aria-current={isSelected ? 'true' : undefined}
                          onClick={() => setSelected(source.id)}
                          className={cx(
                            'flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition',
                            isSelected
                              ? 'border-gold-500/50 bg-obsidian-800 font-semibold text-gold-200'
                              : 'border-transparent text-stone-300 hover:bg-obsidian-800 hover:text-parchment'
                          )}
                        >
                          <span className="min-w-0 truncate">{source.name}</span>
                          {sourceRule?.activation ? (
                            <span className="shrink-0 rounded border border-gold-500/40 px-1 text-xs font-semibold text-gold-300">
                              Use
                            </span>
                          ) : sourceRule ? (
                            <span
                              aria-hidden="true"
                              title="Has a linked rule"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500/70"
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="min-w-0 space-y-3">
            {entry && (
              <>
                <h4 className="font-display text-sm font-bold tracking-wide text-parchment">
                  {entry.name}
                </h4>
                <RuleEntry
                  key={entry.id + ':' + entry.kind}
                  entry={entry}
                  sheet={sheet}
                  seatId={seatId}
                  onUpdate={onUpdate}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <div className={rulePanel}>
          <h3 className={rulePanelTitle + ' mb-2.5 border-b border-stone-800 pb-2'}>
            Movement <span className="font-sans font-normal tracking-normal text-stone-400 normal-case">· yards per turn</span>
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Walk" value={movement.walk} />
            <StatTile label="Jog" value={movement.jog} />
            <StatTile label="Run" value={movement.run} />
          </div>
          {movement.special.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-stone-300">
              {movement.special.map((item) => (
                <li key={item.label}>
                  {item.label} · {item.value} {item.unit}
                </li>
              ))}
            </ul>
          )}
          {(sheet.activeForm === 'crinos' || movementFacts.length > 0) && (
            <div className="mt-2.5 space-y-1.5">
              {sheet.activeForm === 'crinos' && (
                <label>
                  <input
                    type="checkbox"
                    checked={allFours}
                    onChange={(e) => setAllFours(e.target.checked)}
                  />{' '}
                  On all fours
                </label>
              )}
              {movementFacts.length > 0 && (
                <fieldset className="space-y-1.5">
                  <legend>Movement circumstances</legend>
                  {movementFacts.map((t) => (
                    <label key={t}>
                      <input
                        type="checkbox"
                        checked={movementTags.includes(t)}
                        onChange={(e) =>
                          setMovementTags(
                            e.target.checked
                              ? [...movementTags, t]
                              : movementTags.filter((tag) => tag !== t)
                          )
                        }
                      />{' '}
                      {factLabel(t)}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
        </div>
        <EquipmentPicker sheet={sheet} onUpdate={onUpdate} />
        <div className={rulePanel}>
          <h3 className={rulePanelTitle + ' mb-2.5 border-b border-stone-800 pb-2'}>
            Active effects
          </h3>
          {!listedEffects.length && (
            <p className="text-xs text-stone-400">No active effects on this character.</p>
          )}
          <ul className="space-y-1.5">
            {listedEffects.map(({ effect, preparing }) => {
              const remaining = (
                [
                  [effect.preparationRounds, 'turn', 'turns', 'to prepare'],
                  [effect.preparationSeconds, 'second', 'seconds', 'to prepare'],
                  [effect.remainingRounds, 'turn', 'turns', 'left'],
                  [effect.remainingScenes, 'scene', 'scenes', 'left'],
                  [effect.remainingSeconds, 'second', 'seconds', 'left'],
                  [effect.remainingSessions, 'session', 'sessions', 'left'],
                  [effect.remainingStories, 'story', 'stories', 'left'],
                ] as const
              )
                .filter(([v]) => typeof v === 'number' && v > 0)
                .map(([v, one, many, suffix]) => `${v} ${v === 1 ? one : many} ${suffix}`)
                .join(' · ');
              return (
                <li
                  key={effect.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-stone-800 bg-obsidian-950/60 py-1.5 pr-1.5 pl-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-parchment">
                      {effect.rule?.name ??
                        resolveModifierRule(effect.ruleId)?.name ??
                        effect.sourceName ??
                        effect.ruleId}
                    </p>
                    <p className="text-xs text-stone-400">
                      {preparing && (
                        <span className="mr-1.5 rounded border border-amber-500/40 px-1 font-semibold text-amber-200">
                          Preparing
                        </span>
                      )}
                      {factLabel(effect.duration)}
                      {remaining && ' · ' + remaining}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!connected}
                    onClick={() => send({ type: 'END_RULE_EFFECT', seatId, effectId: effect.id })}
                  >
                    End effect
                  </Button>
                </li>
              );
            })}
          </ul>
          {pack && (
            <p className="mt-2.5 flex items-center justify-between rounded-lg border border-indigo-400/30 bg-indigo-950/30 px-3 py-1.5 text-xs font-semibold text-indigo-200">
              Pack Willpower
              <span className="font-display text-sm">
                {pack.current} / {pack.max}
              </span>
            </p>
          )}
        </div>
        <RuleEventControls seatId={seatId} sheet={sheet} connected={connected} />
        <details className={rulePanel}>
          <summary>
            <span className={rulePanelTitle}>Table time</span>
          </summary>
          <div className="grid grid-cols-4 gap-2">
            <StatTile label="Turn" value={state?.clock.turn ?? 0} />
            <StatTile label="Scene" value={state?.clock.scene ?? 0} />
            <StatTile label="Session" value={state?.clock.session ?? 0} />
            <StatTile label="Story" value={state?.clock.story ?? 0} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <select
              aria-label="Time boundary"
              className={ruleField + ' flex-1'}
              value={unit}
              onChange={(e) => setUnit(e.target.value as typeof unit)}
            >
              {['turn', 'scene', 'story', 'session', 'seconds'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            {unit === 'seconds' && (
              <input
                type="number"
                min={1}
                max={31536000}
                className={ruleField + ' w-24'}
                aria-label="Elapsed fictional seconds"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            )}
            <button
              className={ruleButton}
              disabled={!connected || (unit === 'seconds' && amount < 1)}
              onClick={() =>
                send({ type: 'ADVANCE_RULE_CLOCK', unit, amount: unit === 'seconds' ? amount : 1 })
              }
            >
              Advance table time
            </button>
          </div>
        </details>
        {!!stats.modifiers.length && (
          <details className={rulePanel}>
            <summary>
              <span className={rulePanelTitle}>Current stat modifiers</span>
            </summary>
            <ul className="divide-y divide-stone-800 rounded-lg border border-stone-800 text-xs">
              {stats.modifiers.map((m, index) => (
                <li key={m.sourceId + m.target + index} className="px-3 py-1.5">
                  <span className="font-semibold text-parchment">{m.name}</span>{' '}
                  <span className="text-stone-300">
                    {factLabel(m.target)} {m.operation} {m.value}
                  </span>{' '}
                  <span className="text-stone-500">
                    {m.source.book} {m.source.page}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
