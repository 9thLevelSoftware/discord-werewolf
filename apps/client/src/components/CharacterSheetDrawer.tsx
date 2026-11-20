import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ABILITY_GROUPS,
  AbilityCategory,
  ATTRIBUTE_GROUPS,
  AttributeCategory,
  AttributeKey,
  calculateW20XpCost,
  CanonicalAbilityKey,
  computeEffectiveCharacterStats,
  W20CharacterState,
  XpSpendCategory,
} from '@w20-vtt/core';
import {
  Award,
  Dices,
  Flame,
  Plus,
  Shield,
  Sparkles,
  Swords,
  X,
} from 'lucide-react';
import { getVttSupabaseClient } from '../supabaseClient';
import { useVttRoomStore } from '../store/useVttRoomStore';
import { GiftMacroBuilder } from './GiftMacroBuilder';

interface XpLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  approved_by_discord_id: string;
  created_at: string;
}

const DEFAULT_ATTR_FOR_ABILITY: Partial<Record<CanonicalAbilityKey, AttributeKey>> = {
  alertness: 'perception',
  athletics: 'dexterity',
  brawl: 'dexterity',
  empathy: 'perception',
  expression: 'charisma',
  intimidation: 'strength',
  leadership: 'charisma',
  primal_urge: 'stamina',
  streetwise: 'charisma',
  subterfuge: 'manipulation',
  animal_ken: 'charisma',
  crafts: 'dexterity',
  drive: 'dexterity',
  etiquette: 'charisma',
  firearms: 'dexterity',
  larceny: 'dexterity',
  melee: 'dexterity',
  performance: 'charisma',
  stealth: 'dexterity',
  survival: 'perception',
  academics: 'intelligence',
  computer: 'intelligence',
  enigmas: 'perception',
  investigation: 'perception',
  law: 'intelligence',
  medicine: 'intelligence',
  occult: 'intelligence',
  rituals: 'wits',
  science: 'intelligence',
  technology: 'intelligence',
};

function formatTrait(raw: string): string {
  return raw
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

interface CharacterSheetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessionJwt?: string;
  getLatestSupabaseJwt?: () => Promise<string | null>;
}

export const CharacterSheetDrawer: React.FC<CharacterSheetDrawerProps> = ({
  isOpen,
  onClose,
  sessionJwt,
  getLatestSupabaseJwt,
}) => {
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const campaignId = useVttRoomStore((s) => s.campaignId);
  const characters = useVttRoomStore((s) => s.characters);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);

  const [inspectedCharId, setInspectedCharId] = useState<string | null>(null);
  const effectiveCharId = inspectedCharId && characters[inspectedCharId]
    ? inspectedCharId
    : activeCharacterId ?? Object.keys(characters)[0] ?? null;

  const character: W20CharacterState | undefined = effectiveCharId
    ? characters[effectiveCharId]
    : undefined;

  const computed = useMemo(
    () => (character ? computeEffectiveCharacterStats(character) : null),
    [character]
  );

  // Roll composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [rollAttr, setRollAttr] = useState<AttributeKey>('dexterity');
  const [rollAbility, setRollAbility] = useState<string>('brawl');
  const [rollDiff, setRollDiff] = useState<number>(6);
  const [rollSpecialtyId, setRollSpecialtyId] = useState<string>('');
  const [rollSpendWp, setRollSpendWp] = useState(false);
  const [rollSecretSt, setRollSecretSt] = useState(false);

  // Macro builder modal + target
  const [macroModalOpen, setMacroModalOpen] = useState(false);
  const [macroTargetId, setMacroTargetId] = useState('');

  // XP Ledger & Spend / Award
  const [xpRows, setXpRows] = useState<XpLedgerEntry[]>([]);
  const [xpLoading, setXpLoading] = useState(false);
  const [xpError, setXpError] = useState<string | null>(null);
  const [xpStatus, setXpStatus] = useState<string | null>(null);

  const [xpCategory, setXpCategory] = useState<XpSpendCategory>('ability');
  const [xpTraitKey, setXpTraitKey] = useState<string>('brawl');
  const [xpGiftLevel, setXpGiftLevel] = useState<number>(1);
  const [xpSubmitting, setXpSubmitting] = useState(false);

  const [awardDelta, setAwardDelta] = useState<number>(3);
  const [awardReason, setAwardReason] = useState<string>('Session XP Award');

  const fetchXpLedger = useCallback(async () => {
    if (!character) return;
    setXpLoading(true);
    setXpError(null);
    try {
      if (sessionJwt) {
        const res = await fetch(
          `/api/characters/${encodeURIComponent(character.id)}/xp-ledger`,
          {
            headers: { Authorization: `Bearer ${sessionJwt}` },
          }
        );
        if (res.ok) {
          const body = (await res.json()) as { entries?: XpLedgerEntry[] };
          setXpRows(Array.isArray(body.entries) ? body.entries : []);
          return;
        }
      }
      if (getLatestSupabaseJwt) {
        const supabase = getVttSupabaseClient(getLatestSupabaseJwt);
        const { data, error } = await supabase
          .from('xp_ledger')
          .select('id, delta, reason, approved_by_discord_id, created_at')
          .eq('character_id', character.id)
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw error;
        setXpRows((data ?? []) as XpLedgerEntry[]);
      }
    } catch (err: unknown) {
      setXpError(err instanceof Error ? err.message : 'Unable to fetch XP ledger.');
    } finally {
      setXpLoading(false);
    }
  }, [character?.id, sessionJwt, getLatestSupabaseJwt]);

  useEffect(() => {
    if (isOpen && character) {
      void fetchXpLedger();
    }
  }, [isOpen, character?.id, fetchXpLedger]);

  if (!isOpen) return null;

  const openAbilityRollComposer = (abilityKey: string) => {
    const defaultAttr =
      DEFAULT_ATTR_FOR_ABILITY[abilityKey as CanonicalAbilityKey] ?? 'dexterity';
    setRollAbility(abilityKey);
    setRollAttr(defaultAttr);
    const matchingSpec = character?.specialties.find(
      (s) => s.traitKey === abilityKey || s.traitKey === defaultAttr
    );
    setRollSpecialtyId(matchingSpec?.id ?? '');
    setRollDiff(6);
    setRollSpendWp(false);
    setRollSecretSt(false);
    setComposerOpen(true);
  };

  const submitComposedRoll = () => {
    if (!character) return;
    const abilityDots = rollAbility ? (character.abilities[rollAbility] ?? 0) : 0;
    const label = rollAbility
      ? `${formatTrait(rollAttr)} + ${formatTrait(rollAbility)}${abilityDots === 0 ? ' (Untrained)' : ''}`
      : formatTrait(rollAttr);

    sendCommand({
      type: 'ROLL_FREEFORM_POOL',
      characterId: character.id,
      label,
      attributeKey: rollAttr,
      abilityKey: rollAbility || undefined,
      difficulty: Math.max(2, Math.min(10, rollDiff)),
      specialtyId: rollSpecialtyId || undefined,
      spendWillpower: rollSpendWp || undefined,
      isSecretStRoll: viewerRole === 'storyteller' && rollSecretSt ? true : undefined,
    });
    setComposerOpen(false);
  };

  const getCurrentRatingForXp = (): number => {
    if (!character) return 1;
    switch (xpCategory) {
      case 'attribute':
        return character.baseAttributes[xpTraitKey as AttributeKey] ?? 1;
      case 'ability':
        return character.abilities[xpTraitKey] ?? 0;
      case 'rage':
        return character.rage.permanent;
      case 'gnosis':
        return character.gnosis.permanent;
      case 'willpower':
        return character.willpower.permanent;
      case 'in_tribe_gift':
      case 'out_of_tribe_gift':
        return Math.max(1, Math.min(6, xpGiftLevel));
    }
  };

  const currentRatingOrLevel = getCurrentRatingForXp();
  const computedXpCost = calculateW20XpCost(xpCategory, currentRatingOrLevel);
  const xpBalance = xpRows.reduce((sum, r) => sum + r.delta, 0);

  const handleSpendXp = async () => {
    if (!character || !sessionJwt) return;
    setXpSubmitting(true);
    setXpError(null);
    setXpStatus(null);
    try {
      const traitName =
        xpCategory === 'attribute' || xpCategory === 'ability'
          ? xpTraitKey
          : xpCategory === 'rage' || xpCategory === 'gnosis' || xpCategory === 'willpower'
            ? xpCategory
            : `Level ${xpGiftLevel} Gift`;

      const res = await fetch(`/api/characters/${encodeURIComponent(character.id)}/xp-spend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          category: xpCategory,
          traitKey: traitName,
          currentRatingOrGiftLevel: currentRatingOrLevel,
          reason: `${formatTrait(traitName)} ${currentRatingOrLevel} -> ${currentRatingOrLevel + 1} (-${computedXpCost} XP)`,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `XP spend failed (${res.status}).`;
        throw new Error(msg);
      }
      setXpStatus(`Purchased advancement (-${computedXpCost} XP).`);
      await fetchXpLedger();
    } catch (err: unknown) {
      setXpError(err instanceof Error ? err.message : 'Unable to spend XP.');
    } finally {
      setXpSubmitting(false);
    }
  };

  const handleAwardXp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!character || !sessionJwt || !campaignId) return;
    setXpSubmitting(true);
    setXpError(null);
    setXpStatus(null);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/xp-award`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          characterId: character.id,
          delta: awardDelta,
          amount: awardDelta,
          reason: awardReason.trim() || 'Session Award',
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? `XP award failed (${res.status}).`;
        throw new Error(msg);
      }
      setXpStatus(`Awarded ${awardDelta > 0 ? `+${awardDelta}` : awardDelta} XP to ${character.name}.`);
      await fetchXpLedger();
    } catch (err: unknown) {
      setXpError(err instanceof Error ? err.message : 'Unable to award XP.');
    } finally {
      setXpSubmitting(false);
    }
  };

  const allCharEntries = Object.values(characters);
  const canonicalAbilitySet = new Set<string>([
    ...ABILITY_GROUPS.talents,
    ...ABILITY_GROUPS.skills,
    ...ABILITY_GROUPS.knowledges,
  ]);
  const customAbilities = character
    ? Object.entries(character.abilities).filter(([k, v]) => !canonicalAbilitySet.has(k) && v > 0)
    : [];

  return (
    <aside className="pointer-events-auto fixed inset-y-0 left-0 z-40 flex w-full max-w-xl flex-col border-r border-zinc-800 bg-zinc-950/97 text-xs text-zinc-100 shadow-2xl backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-black tracking-wide uppercase">
              {character ? character.name : 'Pack Sheet Inspector'}
            </h2>
            {character?.deedName && (
              <span className="truncate rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] italic text-amber-300">
                “{character.deedName}”
              </span>
            )}
          </div>
          {character && (
            <p className="text-[11px] capitalize text-zinc-400">
              Rank {character.rank} • {character.breed} • {character.auspice} •{' '}
              {character.tribe.replace(/_/g, ' ')}
              {character.caughtInGauntlet && (
                <span className="ml-2 font-bold text-red-400">• CAUGHT IN GAUNTLET</span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {viewerRole === 'storyteller' && allCharEntries.length > 0 && (
            <select
              value={effectiveCharId ?? ''}
              onChange={(e) => setInspectedCharId(e.target.value)}
              className="max-w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px]"
            >
              {allCharEntries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isNpc ? '(NPC)' : ''}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!character || !computed ? (
        <div className="flex flex-1 items-center justify-center p-6 text-zinc-500">
          No Garou character loaded in room yet.
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Active Buffs Banner */}
          {character.activeBuffs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-2">
              {character.activeBuffs.map((b) => (
                <span
                  key={b.sourceMacroId}
                  className="rounded bg-emerald-900/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
                >
                  {b.label} ({b.remainingRounds}r)
                </span>
              ))}
            </div>
          )}

          {/* Compact Roll Composer Popover */}
          {composerOpen && (
            <div className="rounded-xl border border-red-700/70 bg-zinc-900 p-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="flex items-center gap-1.5 font-extrabold uppercase text-red-300">
                  <Dices className="h-4 w-4" />
                  Dice Pool Composer
                </span>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  ×
                </button>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] uppercase text-zinc-400">Attribute</span>
                  <select
                    value={rollAttr}
                    onChange={(e) => setRollAttr(e.target.value as AttributeKey)}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 capitalize"
                  >
                    {(
                      [
                        ...ATTRIBUTE_GROUPS.physical,
                        ...ATTRIBUTE_GROUPS.social,
                        ...ATTRIBUTE_GROUPS.mental,
                      ] as AttributeKey[]
                    ).map((a) => (
                      <option key={a} value={a}>
                        {a} ({computed.effectiveAttributes[a]})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[10px] uppercase text-zinc-400">Ability</span>
                  <input
                    type="text"
                    value={rollAbility}
                    onChange={(e) => setRollAbility(e.target.value)}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] uppercase text-zinc-400">Difficulty (2-10)</span>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={rollDiff}
                    onChange={(e) => setRollDiff(Number(e.target.value))}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] uppercase text-zinc-400">Specialty</span>
                  <select
                    value={rollSpecialtyId}
                    onChange={(e) => setRollSpecialtyId(e.target.value)}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                  >
                    <option value="">None</option>
                    {character.specialties.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} ({formatTrait(sp.traitKey)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-indigo-300">
                    <input
                      type="checkbox"
                      checked={rollSpendWp}
                      onChange={(e) => setRollSpendWp(e.target.checked)}
                    />
                    Spend 1 Willpower (+1 Auto)
                  </label>
                  {viewerRole === 'storyteller' && (
                    <label className="flex items-center gap-1.5 text-amber-300">
                      <input
                        type="checkbox"
                        checked={rollSecretSt}
                        onChange={(e) => setRollSecretSt(e.target.checked)}
                      />
                      Secret ST Roll
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  onClick={submitComposedRoll}
                  className="rounded-lg bg-red-700 px-3 py-1.5 font-bold uppercase text-white hover:bg-red-600"
                >
                  Roll{' '}
                  {Math.max(
                    0,
                    computed.effectiveAttributes[rollAttr] +
                      (rollAbility ? (character.abilities[rollAbility] ?? 0) : 0) +
                      computed.woundPenalty
                  )}
                  d10
                </button>
              </div>
            </div>
          )}

          {/* 1. All 9 Effective Attributes */}
          <section>
            <h3 className="mb-2 text-[11px] font-extrabold tracking-wider uppercase text-zinc-400">
              Attributes (Effective in {character.activeForm})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['physical', 'social', 'mental'] as AttributeCategory[]).map((cat) => (
                <div
                  key={cat}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5"
                >
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-zinc-500">{cat}</div>
                  <div className="space-y-1">
                    {ATTRIBUTE_GROUPS[cat].map((attr) => {
                      const eff = computed.effectiveAttributes[attr];
                      const base = character.baseAttributes[attr];
                      return (
                        <button
                          key={attr}
                          type="button"
                          onClick={() => {
                            setRollAttr(attr);
                            setRollAbility('');
                            setRollDiff(6);
                            setRollSpecialtyId('');
                            setComposerOpen(true);
                          }}
                          className="flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left hover:bg-zinc-800"
                        >
                          <span className="capitalize text-zinc-300">{attr}</span>
                          <span className="font-mono font-bold">
                            <span
                              className={
                                eff > base
                                  ? 'text-emerald-400'
                                  : eff < base
                                    ? 'text-amber-400'
                                    : 'text-zinc-100'
                              }
                            >
                              {eff}
                            </span>
                            {eff !== base && (
                              <span className="ml-1 text-[10px] text-zinc-500">({base})</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. All 30 Abilities */}
          <section>
            <h3 className="mb-2 text-[11px] font-extrabold tracking-wider uppercase text-zinc-400">
              Abilities (Click any Ability to compose dice roll)
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['talents', 'skills', 'knowledges'] as AbilityCategory[]).map((cat) => (
                <div
                  key={cat}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5"
                >
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-zinc-500">{cat}</div>
                  <div className="space-y-0.5">
                    {ABILITY_GROUPS[cat].map((abil) => {
                      const val = character.abilities[abil] ?? 0;
                      return (
                        <button
                          key={abil}
                          type="button"
                          onClick={() => openAbilityRollComposer(abil)}
                          className="flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left hover:bg-zinc-800"
                        >
                          <span className={val > 0 ? 'text-zinc-200' : 'text-zinc-500'}>
                            {formatTrait(abil)}
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              val > 0 ? 'text-emerald-300' : 'text-zinc-600'
                            }`}
                          >
                            {val}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {customAbilities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customAbilities.map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => openAbilityRollComposer(k)}
                    className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] hover:border-zinc-600"
                  >
                    {formatTrait(k)}: <strong className="font-mono">{v}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 3. Specialties, Backgrounds, Renown & Merits */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-zinc-300">
                <Award className="h-3.5 w-3.5 text-amber-400" />
                Renown &amp; Specialties
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                {(['glory', 'honor', 'wisdom'] as const).map((r) => (
                  <div key={r} className="rounded border border-zinc-800 bg-zinc-950 p-1.5">
                    <div className="text-[10px] capitalize text-zinc-400">{r}</div>
                    <div className="font-mono font-bold text-amber-300">
                      {character.renown[r].permanent}{' '}
                      <span className="text-[10px] text-zinc-500">
                        ({character.renown[r].temporary}t)
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2.5">
                <div className="text-[10px] font-bold uppercase text-zinc-500">Specialties</div>
                {character.specialties.length === 0 ? (
                  <p className="mt-1 text-[11px] text-zinc-500">None recorded.</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {character.specialties.map((s) => (
                      <span
                        key={s.id}
                        className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-200"
                      >
                        {formatTrait(s.traitKey)}: {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-zinc-300">
                <Shield className="h-3.5 w-3.5 text-cyan-400" />
                Backgrounds, Silver &amp; Fetishes
              </h3>

              {/* Silver Item Counter */}
              <div className="mt-2 flex items-center justify-between rounded border border-amber-900/50 bg-amber-950/20 px-2.5 py-1.5">
                <div>
                  <div className="font-bold text-amber-200">Silver Items Carried</div>
                  <div className="text-[10px] text-amber-300/80">
                    Effective Gnosis: {computed.effectiveGnosisPool} / {character.gnosis.permanent}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={character.silverCarriedItems <= 0}
                    onClick={() =>
                      sendCommand({
                        type: 'CHARACTER_UPDATE_TRACKER',
                        characterId: character.id,
                        tracker: 'silver',
                        delta: -1,
                      })
                    }
                    className="rounded bg-zinc-800 px-2 py-0.5 font-bold hover:bg-zinc-700 disabled:opacity-40"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold text-amber-300">
                    {character.silverCarriedItems}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({
                        type: 'CHARACTER_UPDATE_TRACKER',
                        characterId: character.id,
                        tracker: 'silver',
                        delta: 1,
                      })
                    }
                    className="rounded bg-zinc-800 px-2 py-0.5 font-bold hover:bg-zinc-700"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(character.backgrounds)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px]"
                    >
                      {formatTrait(k)} <strong>{v}</strong>
                    </span>
                  ))}
              </div>

              {character.fetishes.length > 0 && (
                <div className="mt-2 space-y-1">
                  {character.fetishes.map((f) => (
                    <div
                      key={f.id}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px]"
                    >
                      <span className="font-bold text-zinc-200">{f.name}</span> (Lv {f.level} •
                      Gnosis {f.gnosisRating}
                      {f.isSilver ? ' • Silver' : ''})
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 4. Saved Gift / Rite / Fetish Macros */}
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-zinc-300">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                Saved Gift &amp; Fetish Macros ({character.macros.length})
              </h3>
              <div className="flex items-center gap-2">
                <select
                  value={macroTargetId}
                  onChange={(e) => setMacroTargetId(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px]"
                >
                  <option value="">Target: None / Self</option>
                  {allCharEntries.map((c) => (
                    <option key={c.id} value={c.id}>
                      Target: {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setMacroModalOpen(true)}
                  className="flex items-center gap-1 rounded bg-red-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600"
                >
                  <Plus className="h-3 w-3" />
                  New Macro
                </button>
              </div>
            </div>

            {character.macros.length === 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">
                No saved macros yet. Click <strong>New Macro</strong> to load W20 presets or create
                one.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {character.macros.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-zinc-200">{m.name}</div>
                      <div className="truncate text-[10px] text-zinc-400">{m.summary}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendCommand({
                          type: 'EXECUTE_MACRO',
                          characterId: character.id,
                          macro: m,
                          targetCharacterId: macroTargetId || undefined,
                        })
                      }
                      className="flex shrink-0 items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600"
                    >
                      <Swords className="h-3 w-3" />
                      Run
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 5. XP Ledger & Advancement */}
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase text-zinc-300">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                Experience Ledger
              </h3>
              <span className="rounded bg-zinc-950 px-2 py-0.5 font-mono font-bold text-amber-300">
                Available: {xpBalance} XP
              </span>
            </div>

            {xpError && (
              <div className="mt-2 rounded border border-red-800 bg-red-950/60 p-2 text-[11px] text-red-200">
                {xpError}
              </div>
            )}
            {xpStatus && (
              <div className="mt-2 rounded border border-emerald-800 bg-emerald-950/60 p-2 text-[11px] text-emerald-200">
                {xpStatus}
              </div>
            )}

            {/* Spend XP Form */}
            <div className="mt-2.5 flex flex-wrap items-end gap-2 rounded border border-zinc-800 bg-zinc-950 p-2.5">
              <label className="flex-1">
                <span className="block text-[10px] text-zinc-400">Category</span>
                <select
                  value={xpCategory}
                  onChange={(e) => {
                    const nextCat = e.target.value as XpSpendCategory;
                    setXpCategory(nextCat);
                    if (nextCat === 'attribute') setXpTraitKey('strength');
                    else if (nextCat === 'ability') setXpTraitKey('brawl');
                  }}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                >
                  <option value="attribute">Attribute (Current × 4)</option>
                  <option value="ability">Ability (New=3, Current × 2)</option>
                  <option value="in_tribe_gift">In-Tribe/Breed/Auspice Gift (Lv × 3)</option>
                  <option value="out_of_tribe_gift">Outside Gift (Lv × 5)</option>
                  <option value="rage">Rage (Current × 1)</option>
                  <option value="gnosis">Gnosis (Current × 2)</option>
                  <option value="willpower">Willpower (Current × 1)</option>
                </select>
              </label>

              {xpCategory === 'attribute' && (
                <label className="w-32">
                  <span className="block text-[10px] text-zinc-400">Attribute</span>
                  <select
                    value={xpTraitKey}
                    onChange={(e) => setXpTraitKey(e.target.value)}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 capitalize"
                  >
                    {[
                      ...ATTRIBUTE_GROUPS.physical,
                      ...ATTRIBUTE_GROUPS.social,
                      ...ATTRIBUTE_GROUPS.mental,
                    ].map((a) => (
                      <option key={a} value={a}>
                        {a} ({character.baseAttributes[a]})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {xpCategory === 'ability' && (
                <label className="w-36">
                  <span className="block text-[10px] text-zinc-400">Ability</span>
                  <select
                    value={xpTraitKey}
                    onChange={(e) => setXpTraitKey(e.target.value)}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
                  >
                    {[
                      ...ABILITY_GROUPS.talents,
                      ...ABILITY_GROUPS.skills,
                      ...ABILITY_GROUPS.knowledges,
                    ].map((ab) => (
                      <option key={ab} value={ab}>
                        {formatTrait(ab)} ({character.abilities[ab] ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {(xpCategory === 'in_tribe_gift' || xpCategory === 'out_of_tribe_gift') && (
                <label className="w-20">
                  <span className="block text-[10px] text-zinc-400">Gift Lv</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={xpGiftLevel}
                    onChange={(e) => setXpGiftLevel(Number(e.target.value))}
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono"
                  />
                </label>
              )}

              <button
                type="button"
                disabled={!sessionJwt || xpSubmitting || xpBalance < computedXpCost}
                onClick={() => void handleSpendXp()}
                className="rounded bg-amber-600 px-3 py-1 font-bold text-zinc-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Spend {computedXpCost} XP
              </button>
            </div>

            {/* ST XP Award Form */}
            {viewerRole === 'storyteller' && (
              <form
                onSubmit={(e) => void handleAwardXp(e)}
                className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-800/40 bg-amber-950/20 p-2"
              >
                <input
                  type="number"
                  min={-20}
                  max={50}
                  value={awardDelta}
                  onChange={(e) => setAwardDelta(Number(e.target.value))}
                  className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center font-mono"
                />
                <input
                  type="text"
                  value={awardReason}
                  onChange={(e) => setAwardReason(e.target.value)}
                  placeholder="Award reason"
                  className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                />
                <button
                  type="submit"
                  disabled={!sessionJwt || xpSubmitting}
                  className="rounded bg-emerald-700 px-3 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-45"
                >
                  Award XP
                </button>
              </form>
            )}

            {/* Ledger History */}
            <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {xpLoading ? (
                <p className="text-[11px] text-zinc-500">Loading ledger...</p>
              ) : xpRows.length === 0 ? (
                <p className="text-[11px] text-zinc-500">No XP entries recorded yet.</p>
              ) : (
                xpRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded bg-zinc-950/70 px-2 py-1 text-[11px]"
                  >
                    <span className="truncate text-zinc-300">{row.reason}</span>
                    <span
                      className={`font-mono font-bold ${
                        row.delta >= 0 ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {row.delta >= 0 ? `+${row.delta}` : row.delta} XP
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {macroModalOpen && character && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <GiftMacroBuilder
            characterId={character.id}
            onClose={() => setMacroModalOpen(false)}
          />
        </div>
      )}
    </aside>
  );
};
