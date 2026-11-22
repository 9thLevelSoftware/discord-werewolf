import React, { useMemo, useState } from 'react';
import {
  DamageType,
  DualTracker,
  GarouForm,
  computeEffectiveCharacterStats,
  getBreedNaturalForm,
  validateResourceSpend,
  W20_FORM_MATRIX,
} from '@w20-vtt/core';
import { BookOpen, HeartPulse, ShieldAlert, Swords } from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';

const ORDERED_FORMS: Array<{ key: GarouForm; label: string; subtitle: string }> = [
  { key: 'homid', label: 'Homid', subtitle: 'Human' },
  { key: 'glabro', label: 'Glabro', subtitle: 'Near-Man' },
  { key: 'crinos', label: 'Crinos', subtitle: 'War-Form' },
  { key: 'hispo', label: 'Hispo', subtitle: 'Dire Wolf' },
  { key: 'lupus', label: 'Lupus', subtitle: 'Wolf' },
];

const HEALTH_LABELS = [
  'Bruised (-0)',
  'Hurt (-1)',
  'Injured (-1)',
  'Wounded (-2)',
  'Mauled (-2)',
  'Crippled (-5)',
  'Incapacitated',
];

function renderWoundGlyph(type: DamageType): string {
  if (type === 'bashing') return '/';
  if (type === 'lethal') return 'X';
  if (type === 'aggravated') return '*';
  return '';
}

const DualPoolRow: React.FC<{
  label: string;
  tracker: DualTracker;
  effectivePermanent?: number;
  accentClass: string;
  lockedReason?: string;
  onAdjust: (delta: number) => void;
}> = ({ label, tracker, effectivePermanent, accentClass, lockedReason, onAdjust }) => {
  const perm = effectivePermanent ?? tracker.permanent;
  const spendBlocked = Boolean(lockedReason) || tracker.temporary <= 0;
  const gainBlocked = tracker.temporary >= 10;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold tracking-wide uppercase text-stone-300">{label}</span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-stone-400">
            {tracker.temporary}/{perm}
            {effectivePermanent !== undefined && effectivePermanent < tracker.permanent && (
              <span className="ml-1 text-amber-400" title="Reduced by carried silver items">
                (Ag -{tracker.permanent - effectivePermanent})
              </span>
            )}
          </span>
          <button
            type="button"
            disabled={spendBlocked}
            onClick={() => onAdjust(-1)}
            aria-label={lockedReason ?? `Spend 1 ${label}`}
            title={lockedReason ?? `Spend 1 ${label}`}
            className="flex h-6 w-6 items-center justify-center rounded border border-stone-700 bg-zinc-900 font-mono leading-none text-stone-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            -
          </button>
          <button
            type="button"
            disabled={gainBlocked}
            onClick={() => onAdjust(1)}
            aria-label={`Restore 1 ${label}`}
            title={`Restore 1 ${label}`}
            className="flex h-6 w-6 items-center justify-center rounded border border-stone-700 bg-zinc-900 font-mono leading-none text-stone-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            +
          </button>
        </div>
      </div>

      {/* Top row: Permanent dots (1-10) | Bottom row: Temporary boxes (1-10) */}
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, idx) => {
          const dotIndex = idx + 1;
          const hasPerm = dotIndex <= perm;
          const hasTemp = dotIndex <= tracker.temporary;
          return (
            <div key={idx} className="flex flex-col items-center gap-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full border ${
                  hasPerm ? `${accentClass} border-transparent` : 'border-stone-700 bg-zinc-900'
                }`}
              />
              <span
                className={`h-2 w-2 rounded-[2px] border ${
                  hasTemp ? 'border-stone-300 bg-zinc-200' : 'border-stone-700 bg-zinc-950'
                } ${lockedReason ? 'opacity-40' : ''}`}
                title={lockedReason}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface GarouCharacterHudProps {
  onToggleSheet?: () => void;
  sheetOpen?: boolean;
}

export const GarouCharacterHud: React.FC<GarouCharacterHudProps> = ({
  onToggleSheet,
  sheetOpen = false,
}) => {
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const character = useVttRoomStore((s) =>
    s.activeCharacterId ? s.characters[s.activeCharacterId] : undefined
  );
  const speakingDiscordIds = useVttRoomStore((s) => s.speakingDiscordIds);
  const shiftCharacterForm = useVttRoomStore((s) => s.shiftCharacterForm);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);

  const [instantRageShift, setInstantRageShift] = useState(false);
  const [hoveredForm, setHoveredForm] = useState<GarouForm | null>(null);
  const [healthPopoverOpen, setHealthPopoverOpen] = useState(false);
  const [healthMode, setHealthMode] = useState<'damage' | 'heal' | 'soak'>('damage');
  const [healthLevels, setHealthLevels] = useState(1);
  const [healthType, setHealthType] = useState<Exclude<DamageType, 'none'>>('lethal');
  const [healthSilver, setHealthSilver] = useState(false);

  const computed = useMemo(
    () => (character ? computeEffectiveCharacterStats(character) : null),
    [character]
  );

  const previewComputed = useMemo(() => {
    if (!character) return null;
    if (!hoveredForm || hoveredForm === character.activeForm) return computed;
    return computeEffectiveCharacterStats({ ...character, activeForm: hoveredForm });
  }, [character, hoveredForm, computed]);

  if (!character || !computed || !previewComputed || !activeCharacterId) {
    return (
      <div className="pointer-events-auto absolute bottom-3 left-3 z-hud flex items-center gap-2 rounded-xl w20-obsidian-panel px-3 py-2 text-xs">
        {viewerRole === 'storyteller' && onToggleSheet && (
          <button
            type="button"
            onClick={onToggleSheet}
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-900 px-2.5 py-1.5 font-bold text-stone-200 hover:bg-zinc-800"
          >
            <BookOpen className="h-3.5 w-3.5 text-amber-400" />
            {sheetOpen ? 'Hide Roster Sheet' : 'Inspect Pack Sheets'}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            sendCommand({
              type: 'SAFETY_X_CARD_PAUSE',
              reason: 'X-Card safety pause requested.',
            })
          }
          aria-label="Pause scene immediately (X-Card safety tool)"
          title="Pause scene immediately (X-Card safety tool)"
          className="flex items-center gap-1 rounded-lg border border-red-800/70 bg-red-950/60 px-2.5 py-1.5 font-bold text-red-200 hover:bg-red-900/80"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          X-Card
        </button>
      </div>
    );
  }

  const isSpeaking = speakingDiscordIds.has(character.ownerDiscordId);
  const rageCheck = validateResourceSpend(character.turnLocks, 'rage');
  const gnosisCheck = validateResourceSpend(character.turnLocks, 'gnosis');
  const canInstantRageShift = rageCheck.allowed && character.rage.temporary >= 1;

  const previewForm = hoveredForm ?? character.activeForm;
  const previewSpec = W20_FORM_MATRIX[previewForm];
  const portraitSrc =
    character.portraitsByForm[character.activeForm] ?? character.portraitsByForm.homid;

  const healthLadderLabels = [
    ...Array<string>(character.health.bonusBruisedBoxes).fill('Bruised (-0)'),
    ...HEALTH_LABELS,
  ];

  const triggerNaturalAttack = (attackName: string, diff: number) => {
    sendCommand({
      type: 'ROLL_FREEFORM_POOL',
      characterId: character.id,
      label: `${character.activeForm.toUpperCase()}: ${attackName}`,
      attributeKey: 'dexterity',
      abilityKey: 'brawl',
      difficulty: diff,
    });
  };

  const applyHealthChange = () => {
    sendCommand({
      type: 'CHARACTER_APPLY_HEALTH',
      characterId: character.id,
      mode: healthMode,
      levels: Math.max(1, healthLevels),
      damageType: healthType,
      isSilver: healthSilver || undefined,
    });
    setHealthPopoverOpen(false);
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-hud flex max-w-[calc(100vw-1.5rem)] flex-wrap items-stretch gap-2.5 rounded-xl w20-obsidian-panel p-2.5 text-stone-100 md:max-w-[calc(100vw-23rem)]">
      {/* 1. Voice-Reactive Shifted Portrait */}
      <div className="relative flex flex-col items-center justify-between">
        <div
          className={`relative h-18 w-18 overflow-hidden rounded-xl border-2 transition-all ${
            character.inFrenzy
              ? 'border-red-500 shadow-[0_0_16px_rgba(239,68,68,0.65)]'
              : isSpeaking
                ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.6)]'
                : 'border-stone-700'
          }`}
        >
          {portraitSrc ? (
            <img src={portraitSrc} alt={character.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-lg font-bold text-stone-400">
              {character.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/80 py-0.5 text-center text-xs font-bold tracking-wider uppercase">
            {character.activeForm}
          </span>
        </div>
        <div className="mt-1 text-center">
          <p className="max-w-20 truncate text-xs font-bold">{character.name}</p>
          <p className="text-xs capitalize text-stone-400">
            {character.breed} {character.auspice}
          </p>
        </div>
      </div>

      {/* 2. Five-Form Shifter & Live Attribute Strip */}
      <div className="flex flex-col justify-between border-l border-stone-800 pl-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {ORDERED_FORMS.map((f) => {
              const isCurrent = character.activeForm === f.key;
              const isBreedForm = f.key === getBreedNaturalForm(character.breed);
              const diff = W20_FORM_MATRIX[f.key].shiftDifficulty;
              const disabled = isCurrent || (!isBreedForm && instantRageShift && !canInstantRageShift);
              return (
                <button
                  key={f.key}
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setHoveredForm(f.key)}
                  onMouseLeave={() => setHoveredForm(null)}
                  onClick={() =>
                    shiftCharacterForm(character.id, f.key, !isBreedForm && instantRageShift)
                  }
                  className={`rounded-md border px-2 py-1 text-left transition ${
                    isCurrent
                      ? 'border-red-500/80 bg-red-950/60 text-red-100'
                      : 'border-stone-800 bg-zinc-900 text-stone-300 hover:border-stone-600'
                  } disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  <div className="text-xs font-bold">{f.label}</div>
                  <div className="text-xs text-stone-400">
                    {isCurrent
                      ? 'Active'
                      : isBreedForm
                        ? 'Breed (Free)'
                        : instantRageShift
                          ? '1 Rage'
                          : `Diff ${diff}`}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setInstantRageShift((v) => !v)}
            aria-label={rageCheck.reason ?? 'Toggle between Primal-Urge roll and 1-Rage instant shift'}
            title={rageCheck.reason ?? 'Toggle between Primal-Urge roll and 1-Rage instant shift'}
            className={`rounded border px-2 py-1 text-xs font-semibold transition ${
              instantRageShift
                ? 'border-red-500/60 bg-red-950/70 text-red-200'
                : 'border-stone-700 bg-zinc-900 text-stone-400 hover:text-stone-200'
            }`}
          >
            {instantRageShift ? 'Instant (1 Rage)' : 'Roll Primal-Urge'}
          </button>
        </div>

        {/* Effective Attributes + Hover Delta Preview */}
        <div className="my-1.5 flex flex-wrap items-center gap-2.5 rounded-lg bg-zinc-900/80 px-2.5 py-1 text-xs">
          {(
            [
              'strength',
              'dexterity',
              'stamina',
              'manipulation',
              'appearance',
              'perception',
              'wits',
            ] as const
          ).map((attr) => {
            const val = previewComputed.effectiveAttributes[attr];
            const base = character.baseAttributes[attr];
            const diff = val - base;
            return (
              <div key={attr} className="flex flex-col items-center">
                <span className="text-xs uppercase text-stone-400">{attr.slice(0, 3)}</span>
                <span
                  className={`font-mono text-xs font-bold ${
                    diff > 0
                      ? 'text-emerald-400'
                      : diff < 0
                        ? 'text-amber-400'
                        : 'text-stone-200'
                  }`}
                >
                  {val}
                </span>
              </div>
            );
          })}

          <span className="h-5 w-px bg-zinc-800" />

          {/* Natural Attacks Quick-Launchers */}
          <div className="flex flex-wrap items-center gap-1">
            {previewComputed.naturalAttacks.map((atk) => (
              <button
                key={atk.name}
                type="button"
                onClick={() => triggerNaturalAttack(atk.name, atk.accuracyDiff)}
                className="flex items-center gap-1 rounded border border-stone-700 bg-zinc-800 px-2 py-1 text-xs font-semibold text-stone-200 hover:border-red-500/70 hover:text-white"
              >
                <Swords className="h-3 w-3 text-red-400" />
                {atk.name} ({atk.damageDicePool}d {atk.damageType.slice(0, 3).toUpperCase()})
              </button>
            ))}
          </div>
        </div>

        {/* Form Special Rule Hint Bar & Turn Lock */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <span>
            {hoveredForm && hoveredForm !== character.activeForm && (
              <strong className="mr-1.5 text-amber-300 uppercase">Preview {hoveredForm}:</strong>
            )}
            {previewSpec.incitesDelirium && 'Incites Delirium • '}
            {previewSpec.perceptionDifficultyMod < 0 &&
              `Perception Diff ${previewSpec.perceptionDifficultyMod} • `}
            Soak: {previewComputed.soakCapabilities.soakPool}d10 (
            {previewComputed.soakCapabilities.canSoakAggravated ? 'B/L/Agg' : 'Bashing Only'}
            {previewComputed.soakCapabilities.canSoakSilver ? ' + Silver' : ', No Silver'})
          </span>

          {(character.turnLocks.hasSpentRageThisTurn ||
            character.turnLocks.hasSpentGnosisThisTurn) && (
            <span className="rounded bg-amber-950/80 px-1.5 py-0.5 font-semibold text-amber-300">
              {character.turnLocks.hasSpentRageThisTurn
                ? 'Golden Turn Lock: Gnosis Blocked'
                : 'Golden Turn Lock: Rage Blocked'}
            </span>
          )}
        </div>
      </div>

      {/* 3. Dual Rage / Gnosis / Willpower Interactive Trackers */}
      <div className="flex flex-col justify-between gap-1 border-l border-stone-800 pl-2.5">
        <DualPoolRow
          label="Rage"
          tracker={character.rage}
          accentClass="bg-red-600"
          lockedReason={rageCheck.reason}
          onAdjust={(delta) =>
            sendCommand({
              type: 'CHARACTER_UPDATE_TRACKER',
              characterId: character.id,
              tracker: 'rage',
              delta,
            })
          }
        />
        <DualPoolRow
          label="Gnosis"
          tracker={character.gnosis}
          effectivePermanent={computed.effectiveGnosisPool}
          accentClass="bg-cyan-500"
          lockedReason={gnosisCheck.reason}
          onAdjust={(delta) =>
            sendCommand({
              type: 'CHARACTER_UPDATE_TRACKER',
              characterId: character.id,
              tracker: 'gnosis',
              delta,
            })
          }
        />
        <DualPoolRow
          label="Willpower"
          tracker={character.willpower}
          accentClass="bg-indigo-500"
          onAdjust={(delta) =>
            sendCommand({
              type: 'CHARACTER_UPDATE_TRACKER',
              characterId: character.id,
              tracker: 'willpower',
              delta,
            })
          }
        />
      </div>

      {/* 4. Cascading Health Track + Damage/Heal/Soak Popover + Sheet & X-Card */}
      <div className="relative flex flex-col justify-between gap-1.5 border-l border-stone-800 pl-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={() => setHealthPopoverOpen((v) => !v)}
            className="flex items-center gap-1 font-bold uppercase text-stone-200 hover:text-red-300"
          >
            <HeartPulse className="h-3.5 w-3.5 text-red-400" />
            Health
          </button>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
              computed.isIncapacitated
                ? 'bg-red-900 text-red-100'
                : character.inFrenzy || character.turnLocks.ignoringWoundPenaltiesThisTurn
                  ? 'bg-amber-900/70 text-amber-200'
                  : computed.woundPenalty < 0
                    ? 'bg-zinc-800 text-red-400'
                    : 'bg-zinc-900 text-emerald-400'
            }`}
          >
            {computed.isIncapacitated
              ? 'INCAP'
              : character.inFrenzy
                ? 'FRENZY (0)'
                : `Pen ${computed.woundPenalty}`}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {character.health.boxes.map((dmg, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setHealthPopoverOpen((v) => !v)}
              aria-label={healthLadderLabels[idx] ?? 'Health Box'}
              title={healthLadderLabels[idx] ?? 'Health Box'}
              className={`flex h-5 w-5 items-center justify-center rounded border font-mono text-xs font-black ${
                dmg === 'aggravated'
                  ? 'border-red-500 bg-red-950/80 text-amber-300'
                  : dmg === 'lethal'
                    ? 'border-red-700/80 bg-zinc-900 text-red-400'
                    : dmg === 'bashing'
                      ? 'border-amber-600/60 bg-zinc-900 text-amber-300'
                      : 'border-stone-800 bg-zinc-950 text-stone-400'
              }`}
            >
              {renderWoundGlyph(dmg)}
            </button>
          ))}
        </div>

        {/* Sheet Drawer Toggle & X-Card Safety */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {onToggleSheet && (
            <button
              type="button"
              onClick={onToggleSheet}
              className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-1 text-xs font-bold transition ${
                sheetOpen
                  ? 'border-emerald-500/70 bg-emerald-950/60 text-emerald-200'
                  : 'border-stone-700 bg-zinc-900 text-stone-200 hover:bg-zinc-800'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              Sheet
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              sendCommand({
                type: 'SAFETY_X_CARD_PAUSE',
                reason: `${character.name} triggered the X-Card safety pause.`,
              })
            }
            aria-label="Pause scene immediately (X-Card safety tool)"
            title="Pause scene immediately (X-Card safety tool)"
            className="flex items-center gap-1 rounded border border-red-800/70 bg-red-950/60 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-900/80"
          >
            <ShieldAlert className="h-3 w-3" />
            X
          </button>
        </div>

        {/* Damage / Heal / Soak Popover */}
        {healthPopoverOpen && (
          <div className="absolute right-0 bottom-full z-drawer mb-2 w-60 rounded-xl border border-stone-700 bg-zinc-950 p-3 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-1.5">
              <span className="font-bold uppercase text-stone-200">Health &amp; Soak</span>
              <button
                type="button"
                onClick={() => setHealthPopoverOpen(false)}
                className="text-stone-400 hover:text-stone-200"
              >
                ×
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1">
              {(['damage', 'soak', 'heal'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setHealthMode(m)}
                  className={`rounded py-1 text-xs font-bold uppercase ${
                    healthMode === m
                      ? 'bg-red-800/90 text-amber-50'
                      : 'bg-zinc-900 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="mt-2 flex gap-2">
              <select
                aria-label="Health type"
                value={healthType}
                onChange={(e) => setHealthType(e.target.value as Exclude<DamageType, 'none'>)}
                className="flex-1 rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-xs"
              >
                <option value="bashing">Bashing (/)</option>
                <option value="lethal">Lethal (X)</option>
                <option value="aggravated">Aggravated (*)</option>
              </select>
              <input
                aria-label="Health levels"
                type="number"
                min={1}
                max={20}
                value={healthLevels}
                onChange={(e) => setHealthLevels(Number(e.target.value))}
                className="w-14 rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-center font-mono text-xs"
              />
            </div>

            {healthMode !== 'heal' && (
              <label className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                <input
                  type="checkbox"
                  checked={healthSilver}
                  onChange={(e) => setHealthSilver(e.target.checked)}
                />
                Silver Weapon Damage
              </label>
            )}

            <button
              type="button"
              onClick={applyHealthChange}
              className="mt-2.5 w-full rounded bg-red-800/90 py-1.5 text-xs font-bold uppercase text-amber-50 hover:bg-red-700"
            >
              Apply {healthMode}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
