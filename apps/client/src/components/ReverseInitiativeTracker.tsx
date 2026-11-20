import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionCategory,
  AttributeKey,
  computeEffectiveCharacterStats,
  DeclaredActionInput,
  GarouForm,
  ReactionChoice,
  SubActionSlot,
  validateResourceSpend,
  W20_FORM_MATRIX,
  W20CharacterState,
} from '@w20-vtt/core';
import { ChevronDown, ChevronUp, Shield, Swords, Zap } from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';

type SlotDraft = {
  category: ActionCategory;
  targetCombatantId: string;
  attributeKey: AttributeKey;
  abilityKey: string;
  allocatedDice: number;
  targetForm: GarouForm;
  macroId: string;
};

function computeSlotPool(
  char: W20CharacterState,
  slot: SlotDraft,
  macrosById: Map<string, W20CharacterState['macros'][number]>
): number {
  const stats = computeEffectiveCharacterStats(char);
  if (slot.category === 'shift_form') {
    return Math.max(
      0,
      stats.effectiveAttributes.stamina + (char.abilities.primal_urge ?? 0) + stats.woundPenalty
    );
  }
  if (slot.category === 'gift_or_rite' && slot.macroId) {
    const m = macrosById.get(slot.macroId);
    if (m) {
      if (m.pool.kind === 'attribute_ability') {
        const mAttr = stats.effectiveAttributes[m.pool.attribute];
        const mAbil = m.pool.ability ? (char.abilities[m.pool.ability] ?? 0) : 0;
        return Math.max(0, mAttr + mAbil + stats.woundPenalty);
      }
      if (m.pool.kind === 'permanent_trait') {
        return m.pool.trait === 'gnosis' ? stats.effectiveGnosisPool : char[m.pool.trait].permanent;
      }
      if (m.pool.kind === 'fetish_gnosis_rating') {
        return m.pool.rating;
      }
    }
  }
  const attr = stats.effectiveAttributes[slot.attributeKey];
  const abil = slot.abilityKey ? (char.abilities[slot.abilityKey] ?? 0) : 0;
  return Math.max(0, attr + abil + stats.woundPenalty);
}

function buildSubActionSlot(
  slot: SlotDraft,
  char: W20CharacterState | undefined,
  opponentFallbackId: string | undefined,
  includeAllocated: boolean
): Omit<SubActionSlot, 'slotId' | 'resolved' | 'abortedToDefense'> {
  const targetId = slot.targetCombatantId || opponentFallbackId;

  if (slot.category === 'shift_form') {
    return {
      category: 'shift_form',
      label: `Shift to ${slot.targetForm}`,
      targetForm: slot.targetForm,
      baseDifficulty: W20_FORM_MATRIX[slot.targetForm].shiftDifficulty,
      ...(includeAllocated ? { allocatedDice: slot.allocatedDice } : {}),
    };
  }

  if (slot.category === 'gift_or_rite') {
    const macro = char?.macros.find((m) => m.id === slot.macroId);
    return {
      category: 'gift_or_rite',
      label: macro ? macro.name : 'Gift / Rite',
      ...(targetId ? { targetCombatantId: targetId } : {}),
      ...(macro
        ? { macro, baseDifficulty: macro.difficulty.kind === 'static' ? macro.difficulty.value : 6 }
        : {
            attributeKey: slot.attributeKey,
            abilityKey: slot.abilityKey || undefined,
            baseDifficulty: 6,
          }),
      ...(includeAllocated ? { allocatedDice: slot.allocatedDice } : {}),
    };
  }

  if (slot.category === 'melee_attack' || slot.category === 'brawl_attack' || slot.category === 'ranged_attack') {
    const stats = char ? computeEffectiveCharacterStats(char) : null;
    const isBiteOrClaw = slot.category === 'brawl_attack';
    const claw = stats?.naturalAttacks.find((a) => a.name === 'Claws');
    const bite = stats?.naturalAttacks.find((a) => a.name === 'Bite');
    const label =
      slot.category === 'brawl_attack'
        ? claw
          ? 'Claw Strike'
          : bite
            ? 'Bite Attack'
            : 'Unarmed Brawl'
        : slot.category === 'melee_attack'
          ? 'Melee Weapon Strike'
          : 'Ranged Shot';

    return {
      category: slot.category,
      label,
      ...(targetId ? { targetCombatantId: targetId } : {}),
      attributeKey: slot.attributeKey,
      abilityKey:
        slot.abilityKey ||
        (slot.category === 'brawl_attack'
          ? 'brawl'
          : slot.category === 'melee_attack'
            ? 'melee'
            : 'firearms'),
      baseDifficulty:
        slot.category === 'brawl_attack' && !claw && bite ? bite.accuracyDiff : 6,
      weaponDamageBonus:
        slot.category === 'brawl_attack'
          ? claw
            ? 2
            : bite
              ? 1
              : 0
          : slot.category === 'melee_attack'
            ? 2
            : 4,
      damageType:
        slot.category === 'brawl_attack'
          ? claw || bite
            ? 'aggravated'
            : 'bashing'
          : 'lethal',
      ...(includeAllocated ? { allocatedDice: slot.allocatedDice } : {}),
    };
  }

  return {
    category: slot.category,
    label: slot.category.replace(/_/g, ' '),
    attributeKey: slot.attributeKey,
    abilityKey: slot.abilityKey || undefined,
    baseDifficulty: 6,
    ...(includeAllocated ? { allocatedDice: slot.allocatedDice } : {}),
  };
}

export const ReverseInitiativeTracker: React.FC = () => {
  const combat = useVttRoomStore((s) => s.combat);
  const characters = useVttRoomStore((s) => s.characters);
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const viewerRole = useVttRoomStore((s) => s.viewerRole);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);
  const submitCombatDeclaration = useVttRoomStore((s) => s.submitCombatDeclaration);
  const submitCombatReaction = useVttRoomStore((s) => s.submitCombatReaction);

  const [collapsed, setCollapsed] = useState(false);

  // Storyteller COMBAT_START participant selector
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  // Pre-Initiative local controls
  const [stPreInitTargetId, setStPreInitTargetId] = useState<string>('');
  const [preRageCount, setPreRageCount] = useState(0);
  const [preSpiritGnosis, setPreSpiritGnosis] = useState(false);
  const [preWpIgnoreWounds, setPreWpIgnoreWounds] = useState(false);

  // Reverse Declaration local composer state
  const [declMode, setDeclMode] = useState<DeclaredActionInput['mode']>('single');
  const [slotsDraft, setSlotsDraft] = useState<SlotDraft[]>([
    {
      category: 'brawl_attack',
      targetCombatantId: '',
      attributeKey: 'dexterity',
      abilityKey: 'brawl',
      allocatedDice: 3,
      targetForm: 'crinos',
      macroId: '',
    },
    {
      category: 'brawl_attack',
      targetCombatantId: '',
      attributeKey: 'dexterity',
      abilityKey: 'brawl',
      allocatedDice: 2,
      targetForm: 'crinos',
      macroId: '',
    },
  ]);

  // Turn execution state
  const [spendWpOnAttack, setSpendWpOnAttack] = useState(false);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState('');

  // Reaction defense type selector
  const [reactionDefenseType, setReactionDefenseType] = useState<
    'defend_dodge' | 'defend_parry' | 'defend_block'
  >('defend_dodge');

  // Auto-populate participant list when characters change and no combat active
  useEffect(() => {
    if (combat) return;
    const ids = Object.keys(characters);
    setSelectedParticipantIds((prev) => (prev.length > 0 ? prev.filter((id) => characters[id]) : ids));
  }, [characters, combat]);

  const orderedIds = useMemo(() => {
    if (!combat) return [];
    if (combat.phase === 'DECLARE_REVERSE') return combat.declarationQueueAsc;
    if (combat.resolutionQueueDesc.length > 0) return combat.resolutionQueueDesc;
    return Object.keys(combat.combatants);
  }, [combat]);

  // Empty state: Storyteller Combat Starter
  if (!combat) {
    if (viewerRole !== 'storyteller') return null;

    const charList = Object.values(characters);

    if (collapsed) {
      return (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="pointer-events-auto absolute top-14 right-3 z-30 flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-1.5 text-xs font-bold text-zinc-200 shadow-xl backdrop-blur hover:border-red-500/60"
        >
          <Swords className="h-3.5 w-3.5 text-red-400" />
          Start Combat
        </button>
      );
    }

    return (
      <aside className="pointer-events-auto absolute top-14 right-3 z-30 flex max-h-[calc(100vh-8rem)] w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-xl border border-zinc-800 bg-zinc-950/92 p-3 text-xs text-zinc-100 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <span className="flex items-center gap-1.5 font-extrabold tracking-wide uppercase">
            <Swords className="h-4 w-4 text-red-400" />
            W20 Combat Staging
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700"
          >
            Minimize
          </button>
        </div>

        <p className="mt-2 text-[11px] text-zinc-400">
          Select combatants to begin W20 Reverse Initiative:
        </p>

        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
          {charList.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-zinc-500">
              No characters or NPCs in room yet.
            </p>
          ) : (
            charList.map((c) => {
              const checked = selectedParticipantIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between rounded border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5 hover:border-zinc-700"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedParticipantIds((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                    <span className="font-semibold text-zinc-200">{c.name}</span>
                  </span>
                  <span className="text-[10px] uppercase text-zinc-400">
                    {c.isNpc ? 'NPC' : c.activeForm}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <button
          type="button"
          disabled={selectedParticipantIds.length === 0}
          onClick={() =>
            sendCommand({
              type: 'COMBAT_START',
              participantCharacterIds: selectedParticipantIds,
            })
          }
          className="mt-3 w-full rounded-lg bg-red-700 py-2 font-extrabold uppercase tracking-wider text-white hover:bg-red-600 disabled:opacity-45"
        >
          Begin Combat ({selectedParticipantIds.length})
        </button>
      </aside>
    );
  }

  // Active Combat Tracker
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="pointer-events-auto absolute top-14 right-3 z-30 flex items-center gap-2 rounded-lg border border-amber-500/60 bg-zinc-950/92 px-3 py-1.5 text-xs font-bold text-amber-200 shadow-xl backdrop-blur"
      >
        <Swords className="h-3.5 w-3.5 text-red-400" />
        <span>
          Round {combat.roundNumber} • {combat.phase.replace(/_/g, ' ')}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  const localCombatant = Object.values(combat.combatants).find(
    (c) => c.characterId === activeCharacterId
  );
  const unreadyCombatants = Object.values(combat.combatants).filter((c) => !c.preInitReady);
  const preInitTarget =
    viewerRole === 'storyteller'
      ? (stPreInitTargetId && combat.combatants[stPreInitTargetId]
          ? combat.combatants[stPreInitTargetId]
          : localCombatant && !localCombatant.preInitReady
            ? localCombatant
            : unreadyCombatants[0])
      : localCombatant;

  const activeCursorEntry = combat.activeCursorCombatantId
    ? combat.combatants[combat.activeCursorCombatantId]
    : null;

  const isLocalUsersCursor =
    Boolean(activeCursorEntry) &&
    (viewerRole === 'storyteller' || activeCursorEntry?.characterId === activeCharacterId);

  const opponentOptions = Object.values(combat.combatants).filter(
    (c) => c.combatantId !== activeCursorEntry?.combatantId
  );

  const cursorChar = activeCursorEntry ? characters[activeCursorEntry.characterId] : undefined;
  const cursorMacrosMap = new Map((cursorChar?.macros ?? []).map((m) => [m.id, m]));

  // Smallest-pool validation for split_pool mode
  const activeSlotCount = declMode === 'split_pool' ? slotsDraft.length : 1;
  const visibleSlots = slotsDraft.slice(0, activeSlotCount);
  const slotPools = cursorChar
    ? visibleSlots.map((s) => computeSlotPool(cursorChar, s, cursorMacrosMap))
    : [0];
  const smallestPool = slotPools.length > 0 ? Math.min(...slotPools) : 0;
  const sumAllocated = visibleSlots.reduce((acc, s) => acc + s.allocatedDice, 0);
  const splitInvalid =
    declMode === 'split_pool' &&
    (visibleSlots.length < 2 ||
      visibleSlots.some((s) => s.allocatedDice < 1) ||
      sumAllocated > smallestPool);

  const handleLockPreInit = (combatantId: string) => {
    sendCommand({
      type: 'COMBAT_DECLARE_PRE_INIT',
      combatantId,
      rageExtraActions: preRageCount,
      spendGnosisSpiritOfFray: preSpiritGnosis,
      spendWillpowerIgnoreWounds: preWpIgnoreWounds,
    });
    setPreRageCount(0);
    setPreSpiritGnosis(false);
    setPreWpIgnoreWounds(false);
  };

  const handleConfirmDeclaration = () => {
    if (!activeCursorEntry) return;
    const fallbackTarget = opponentOptions[0]?.combatantId;

    if (declMode === 'hold' || declMode === 'full_defense') {
      submitCombatDeclaration(activeCursorEntry.combatantId, {
        mode: declMode,
        slots: [
          {
            category: declMode,
            label: declMode === 'hold' ? 'Holding Action' : 'Full Defense',
            baseDifficulty: 6,
          },
        ],
      });
      return;
    }

    if (declMode === 'split_pool') {
      if (splitInvalid) return;
      submitCombatDeclaration(activeCursorEntry.combatantId, {
        mode: 'split_pool',
        slots: visibleSlots.map((s) =>
          buildSubActionSlot(s, cursorChar, fallbackTarget, true)
        ),
      });
      return;
    }

    submitCombatDeclaration(activeCursorEntry.combatantId, {
      mode: 'single',
      slots: [buildSubActionSlot(slotsDraft[0], cursorChar, fallbackTarget, false)],
    });
  };

  const renderReactionModal = () => {
    if (combat.phase !== 'AWAITING_REACTION' || !combat.pendingAttack) return null;
    const pending = combat.pendingAttack;
    const defender = combat.combatants[pending.defenderCombatantId];
    const defenderChar = defender ? characters[defender.characterId] : undefined;
    const canControlDefender =
      Boolean(defender) &&
      (viewerRole === 'storyteller' || defender.characterId === activeCharacterId);

    if (!defender || !canControlDefender || !defenderChar) {
      return (
        <div className="mb-2.5 rounded-lg border border-amber-500/50 bg-amber-950/40 p-2.5 text-xs text-amber-200">
          Waiting for <strong>{defender?.name ?? 'defender'}</strong> to react to{' '}
          <strong>{pending.attackRoll.netSuccesses}</strong> incoming hit success(es)...
        </div>
      );
    }

    const hasQueuedDefense =
      defender.declarationMode === 'full_defense' ||
      defender.normalSlots.some((s) => s.category.startsWith('defend_') && !s.resolved);
    const hasUnspentPass1 = defender.normalSlots.some((s) => !s.resolved && !s.abortedToDefense);
    const canWillpowerAbort = hasUnspentPass1 && defenderChar.willpower.temporary >= 1;
    const canRageDefend =
      defender.remainingRageActions >= 1 &&
      validateResourceSpend(defenderChar.turnLocks, 'rage').allowed;

    const sendReaction = (reaction: ReactionChoice) =>
      submitCombatReaction(defender.combatantId, reaction);

    return (
      <div className="mb-2.5 rounded-lg border border-red-500/80 bg-red-950/60 p-2.5 text-xs shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold uppercase tracking-wide text-red-200">
            Incoming Hit: {pending.attackRoll.netSuccesses} Success(es)
          </p>
          {viewerRole === 'storyteller' && (
            <button
              type="button"
              onClick={() =>
                sendCommand({
                  type: 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE',
                  reason: 'Force Soak Only',
                })
              }
              className="text-[10px] text-zinc-300 underline"
            >
              Force Soak
            </button>
          )}
        </div>
        <p className="mt-0.5 text-zinc-300">
          {pending.slot.label} → <strong>{defender.name}</strong>
        </p>

        <div className="mt-2 flex gap-1">
          {(
            [
              ['defend_dodge', 'Dodge (Ath)'],
              ['defend_parry', 'Parry (Melee)'],
              ['defend_block', 'Block (Brawl)'],
            ] as const
          ).map(([defKey, defLabel]) => (
            <button
              key={defKey}
              type="button"
              onClick={() => setReactionDefenseType(defKey)}
              className={`flex-1 rounded border py-1 text-[10px] font-bold ${
                reactionDefenseType === defKey
                  ? 'border-emerald-500 bg-emerald-950/70 text-emerald-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              }`}
            >
              {defLabel}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => sendReaction({ strategy: 'take_hit_soak_only' })}
            className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-left font-semibold text-zinc-200 hover:border-zinc-500"
          >
            Take Hit &amp; Roll Stamina Soak (Preserve Action)
          </button>

          {hasQueuedDefense && (
            <button
              type="button"
              onClick={() =>
                sendReaction({
                  strategy: 'use_queued_defense',
                  defenseType: reactionDefenseType,
                })
              }
              className="rounded border border-emerald-600/70 bg-emerald-950/70 px-2.5 py-1.5 text-left font-semibold text-emerald-200 hover:bg-emerald-900/70"
            >
              Roll Queued Defense
              {defender.declarationMode === 'full_defense' &&
                ` (-${defender.defensesUsedThisRound} Full Defense Penalty)`}
            </button>
          )}

          <button
            type="button"
            disabled={!canWillpowerAbort}
            onClick={() =>
              sendReaction({
                strategy: 'willpower_abort_to_defense',
                defenseType: reactionDefenseType,
              })
            }
            className="rounded border border-indigo-500/60 bg-indigo-950/70 px-2.5 py-1.5 text-left font-semibold text-indigo-200 hover:bg-indigo-900/70 disabled:opacity-40"
          >
            Spend 1 Willpower: Abort Turn to Defend
          </button>

          <button
            type="button"
            disabled={!canRageDefend}
            onClick={() =>
              sendReaction({
                strategy: 'burn_rage_action_to_defend',
                defenseType: reactionDefenseType,
              })
            }
            className="rounded border border-red-500/60 bg-red-900/60 px-2.5 py-1.5 text-left font-semibold text-red-100 hover:bg-red-800/70 disabled:opacity-40"
          >
            Burn 1 Banked Rage Action ({defender.remainingRageActions} left)
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside className="pointer-events-auto absolute top-14 right-3 bottom-3 z-30 flex w-84 max-w-[calc(100vw-1.5rem)] flex-col rounded-xl border border-zinc-800 bg-zinc-950/92 p-3 text-zinc-100 shadow-2xl backdrop-blur">
      {/* 1. Round & Queue Direction Header */}
      <div className="mb-2 flex items-start justify-between gap-2 border-b border-zinc-800 pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-xs font-extrabold tracking-wide uppercase">
              Round {combat.roundNumber} •{' '}
              {combat.currentPassNumber > 1 ? `Rage Pass ${combat.currentPassNumber}` : 'Pass 1'}
            </h2>
            {combat.phase === 'DECLARE_REVERSE' && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                ↑ Slowest First
              </span>
            )}
            {(combat.phase === 'RESOLVE_NORMAL_PASS' ||
              combat.phase === 'RESOLVE_RAGE_PASSES') && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                ↓ Fastest First
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            {combat.phase === 'PRE_ROUND_RAGE' && 'Declare Rage & Spirit of the Fray'}
            {combat.phase === 'ROLL_INITIATIVE' && 'Rolling 1d10 + Dex + Wits Initiative'}
            {combat.phase === 'DECLARE_REVERSE' && 'Reverse Declaration (Lowest → Highest)'}
            {combat.phase === 'RESOLVE_NORMAL_PASS' && 'Action Resolution (Highest → Lowest)'}
            {combat.phase === 'RESOLVE_RAGE_PASSES' && 'Bonus Rage Actions (Highest → Lowest)'}
            {combat.phase === 'AWAITING_REACTION' && '⚡ Defensive Interrupt Window'}
            {combat.phase === 'END_OF_ROUND' && 'Regeneration & Round Cleanup'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {viewerRole === 'storyteller' &&
            (combat.phase === 'PRE_ROUND_RAGE' || combat.phase === 'ROLL_INITIATIVE') && (
              <button
                type="button"
                onClick={() => sendCommand({ type: 'COMBAT_ROLL_ALL_INITIATIVE' })}
                className="rounded bg-red-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600"
              >
                Roll Init
              </button>
            )}
          {viewerRole === 'storyteller' && (
            <button
              type="button"
              onClick={() => sendCommand({ type: 'COMBAT_END' })}
              title="End combat encounter"
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-red-500 hover:text-red-300"
            >
              End
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Minimize tracker"
            className="rounded bg-zinc-800 p-1 text-zinc-300 hover:bg-zinc-700"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Pre-Initiative Rage / Gnosis Staging Box */}
      {combat.phase === 'PRE_ROUND_RAGE' && preInitTarget && !preInitTarget.preInitReady && (
        <div className="mb-2.5 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2.5 text-xs">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-bold text-zinc-200">Pre-Initiative Staging</span>
            {viewerRole === 'storyteller' && unreadyCombatants.length > 0 && (
              <select
                value={preInitTarget.combatantId}
                onChange={(e) => setStPreInitTargetId(e.target.value)}
                className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px]"
              >
                {unreadyCombatants.map((c) => (
                  <option key={c.combatantId} value={c.combatantId}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span>Extra Rage Actions:</span>
            <input
              type="number"
              min={0}
              max={Math.ceil((characters[preInitTarget.characterId]?.rage.permanent ?? 1) / 2)}
              disabled={preSpiritGnosis}
              value={preRageCount}
              onChange={(e) => setPreRageCount(Number(e.target.value))}
              className="w-14 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-right font-mono"
            />
          </div>

          {preInitTarget.hasSpiritOfTheFray && (
            <label className="mt-1.5 flex items-center gap-2 text-cyan-300">
              <input
                type="checkbox"
                checked={preSpiritGnosis}
                onChange={(e) => {
                  setPreSpiritGnosis(e.target.checked);
                  if (e.target.checked) setPreRageCount(0);
                }}
              />
              Spend 1 Gnosis: Spirit of the Fray (+10 Init, locks Rage)
            </label>
          )}

          <label className="mt-1 flex items-center gap-2 text-indigo-300">
            <input
              type="checkbox"
              checked={preWpIgnoreWounds}
              onChange={(e) => setPreWpIgnoreWounds(e.target.checked)}
            />
            Spend 1 Willpower: Ignore Wound Penalties
          </label>

          <button
            type="button"
            onClick={() => handleLockPreInit(preInitTarget.combatantId)}
            className="mt-2 w-full rounded bg-red-700 py-1.5 font-bold text-white hover:bg-red-600"
          >
            Lock Resources ({preInitTarget.name})
          </button>
        </div>
      )}

      {/* 3. Defensive Reaction Card (when paused in AWAITING_REACTION) */}
      {renderReactionModal()}

      {/* 4. Active Reverse Declaration Composer */}
      {combat.phase === 'DECLARE_REVERSE' && isLocalUsersCursor && activeCursorEntry && (
        <div className="mb-2.5 max-h-72 overflow-y-auto rounded-lg border border-amber-500/60 bg-zinc-900/95 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300">
              Declare: {activeCursorEntry.name}
            </span>
            {viewerRole === 'storyteller' && (
              <button
                type="button"
                onClick={() =>
                  sendCommand({
                    type: 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE',
                    reason: 'AFK Default to Hold',
                  })
                }
                className="text-[10px] text-zinc-400 underline hover:text-zinc-200"
              >
                Force Hold (AFK)
              </button>
            )}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1">
            {(['single', 'split_pool', 'full_defense', 'hold'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDeclMode(m)}
                className={`rounded py-1 text-[10px] font-bold uppercase ${
                  declMode === m
                    ? 'bg-amber-600 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>

          {(declMode === 'single' || declMode === 'split_pool') && (
            <div className="mt-2 space-y-2">
              {declMode === 'split_pool' && (
                <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Smallest Pool Cap: {smallestPool}d</span>
                    <span
                      className={
                        splitInvalid ? 'font-bold text-red-400' : 'font-bold text-emerald-400'
                      }
                    >
                      Allocated: {sumAllocated}/{smallestPool}
                    </span>
                  </div>
                </div>
              )}

              {visibleSlots.map((slot, idx) => (
                <div
                  key={idx}
                  className="space-y-1.5 rounded border border-zinc-800 bg-zinc-950/90 p-2"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <select
                      value={slot.category}
                      onChange={(e) => {
                        const nextCat = e.target.value as ActionCategory;
                        setSlotsDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  category: nextCat,
                                  abilityKey:
                                    nextCat === 'brawl_attack'
                                      ? 'brawl'
                                      : nextCat === 'melee_attack'
                                        ? 'melee'
                                        : nextCat === 'ranged_attack'
                                          ? 'firearms'
                                          : item.abilityKey,
                                }
                              : item
                          )
                        );
                      }}
                      className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px]"
                    >
                      <option value="brawl_attack">Brawl (Claws / Bite)</option>
                      <option value="melee_attack">Melee Weapon</option>
                      <option value="ranged_attack">Ranged Attack</option>
                      <option value="shift_form">Shift Form</option>
                      <option value="gift_or_rite">Gift / Rite Macro</option>
                      <option value="defend_dodge">Queued Dodge</option>
                      <option value="defend_parry">Queued Parry</option>
                      <option value="defend_block">Queued Block</option>
                      <option value="move_or_other">Move / Other</option>
                    </select>

                    {declMode === 'split_pool' && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400">Dice:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={slot.allocatedDice}
                          onChange={(e) =>
                            setSlotsDraft((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, allocatedDice: Number(e.target.value) || 0 }
                                  : item
                              )
                            )
                          }
                          className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-center font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {(slot.category === 'brawl_attack' ||
                    slot.category === 'melee_attack' ||
                    slot.category === 'ranged_attack' ||
                    slot.category === 'gift_or_rite') && (
                    <select
                      value={slot.targetCombatantId}
                      onChange={(e) =>
                        setSlotsDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, targetCombatantId: e.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                    >
                      {opponentOptions.map((opp) => (
                        <option key={opp.combatantId} value={opp.combatantId}>
                          Target: {opp.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {slot.category === 'shift_form' && (
                    <select
                      value={slot.targetForm}
                      onChange={(e) =>
                        setSlotsDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, targetForm: e.target.value as GarouForm } : item
                          )
                        )
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] capitalize"
                    >
                      {(['homid', 'glabro', 'crinos', 'hispo', 'lupus'] as GarouForm[]).map((f) => (
                        <option key={f} value={f}>
                          Shift to {f}
                        </option>
                      ))}
                    </select>
                  )}

                  {slot.category === 'gift_or_rite' && cursorChar && (
                    <select
                      value={slot.macroId}
                      onChange={(e) =>
                        setSlotsDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, macroId: e.target.value } : item
                          )
                        )
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px]"
                    >
                      <option value="">Freeform Gift (Wits/Roll)</option>
                      {cursorChar.macros.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}

              {declMode === 'split_pool' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSlotsDraft((prev) => [
                        ...prev,
                        {
                          category: 'brawl_attack',
                          targetCombatantId: '',
                          attributeKey: 'dexterity',
                          abilityKey: 'brawl',
                          allocatedDice: 1,
                          targetForm: 'crinos',
                          macroId: '',
                        },
                      ])
                    }
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 py-1 text-[10px] font-semibold hover:bg-zinc-700"
                  >
                    + Add Action Slot
                  </button>
                  {slotsDraft.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setSlotsDraft((prev) => prev.slice(0, -1))}
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={splitInvalid}
            onClick={handleConfirmDeclaration}
            className="mt-2 w-full rounded bg-amber-500 py-1.5 font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-45"
          >
            Announce Declaration
          </button>
        </div>
      )}

      {/* 5. Active Resolution Turn Execution */}
      {(combat.phase === 'RESOLVE_NORMAL_PASS' || combat.phase === 'RESOLVE_RAGE_PASSES') &&
        isLocalUsersCursor &&
        activeCursorEntry && (
          <div className="mb-2.5 rounded-lg border border-emerald-500/60 bg-zinc-900/95 p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <p className="font-bold text-emerald-300">
                Resolve Turn: {activeCursorEntry.name}
              </p>
              {viewerRole === 'storyteller' && (
                <button
                  type="button"
                  onClick={() =>
                    sendCommand({
                      type: 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE',
                      reason: 'Skipped Turn (ST Override)',
                    })
                  }
                  className="text-[10px] text-zinc-400 underline hover:text-zinc-200"
                >
                  Skip Turn
                </button>
              )}
            </div>

            {cursorChar && cursorChar.specialties.length > 0 && (
              <select
                value={selectedSpecialtyId}
                onChange={(e) => setSelectedSpecialtyId(e.target.value)}
                className="mt-1.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px]"
              >
                <option value="">No Specialty Applied</option>
                {cursorChar.specialties.map((s) => (
                  <option key={s.id} value={s.id}>
                    Specialty: {s.name}
                  </option>
                ))}
              </select>
            )}

            <label className="mt-1.5 flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={spendWpOnAttack}
                onChange={(e) => setSpendWpOnAttack(e.target.checked)}
              />
              Spend 1 Willpower (+1 guaranteed success)
            </label>

            <button
              type="button"
              onClick={() =>
                sendCommand({
                  type: 'COMBAT_EXECUTE_ACTIVE_TURN',
                  combatantId: activeCursorEntry.combatantId,
                  spendWillpowerOnRoll: spendWpOnAttack || undefined,
                  specialtyId: selectedSpecialtyId || undefined,
                })
              }
              className="mt-2 w-full rounded bg-emerald-600 py-1.5 font-bold text-white hover:bg-emerald-500"
            >
              Roll &amp; Execute Action
            </button>
          </div>
        )}

      {/* 6. End of Round Panel */}
      {combat.phase === 'END_OF_ROUND' && (
        <div className="mb-2.5 rounded-lg border border-indigo-500/60 bg-indigo-950/35 p-2.5 text-xs">
          <p className="font-bold text-indigo-200">End of Round {combat.roundNumber}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Advancing triggers Combat Regeneration (Stamina Diff 8) &amp; resets turn locks.
          </p>
          {viewerRole === 'storyteller' && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => sendCommand({ type: 'COMBAT_NEXT_ROUND' })}
                className="flex-1 rounded bg-indigo-600 py-1.5 font-bold text-white hover:bg-indigo-500"
              >
                Next Round
              </button>
              <button
                type="button"
                onClick={() => sendCommand({ type: 'COMBAT_END' })}
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-bold text-zinc-300 hover:border-red-500"
              >
                End Combat
              </button>
            </div>
          )}
        </div>
      )}

      {/* 7. Combatant Initiative Queue List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {orderedIds.map((id) => {
          const entry = combat.combatants[id];
          if (!entry) return null;
          const isCursor = combat.activeCursorCombatantId === id;
          return (
            <div
              key={id}
              className={`rounded-lg border p-2 text-xs transition ${
                isCursor
                  ? 'border-amber-400 bg-zinc-900 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
                  : 'border-zinc-800/90 bg-zinc-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-800 font-mono text-[11px] font-extrabold">
                    {entry.initiativeScore ?? '—'}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-zinc-100">{entry.name}</div>
                    <div className="truncate text-[10px] text-zinc-400">
                      {combat.phase === 'PRE_ROUND_RAGE'
                        ? entry.preInitReady
                          ? 'Locked In'
                          : 'Selecting Rage...'
                        : entry.normalSlots.length > 0
                          ? entry.normalSlots.map((s) => s.label).join(' + ')
                          : entry.declarationMode}
                    </div>
                  </div>
                </div>

                {/* Banked Extra Rage Action Orbs & Hold Interrupt */}
                <div className="flex shrink-0 items-center gap-1">
                  {entry.declaredRageActions === 'hidden' ? (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      ? Rage
                    </span>
                  ) : (
                    Array.from({ length: entry.remainingRageActions }, (_, idx) => (
                      <span
                        key={idx}
                        title="Banked Extra Rage Action"
                        className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_6px_rgba(220,38,38,0.8)]"
                      />
                    ))
                  )}

                  {entry.isHolding &&
                    (combat.phase === 'RESOLVE_NORMAL_PASS' ||
                      combat.phase === 'RESOLVE_RAGE_PASSES') &&
                    (viewerRole === 'storyteller' ||
                      entry.characterId === activeCharacterId) && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            sendCommand({
                              type: 'COMBAT_TRIGGER_HOLD_INTERRUPT',
                              combatantId: entry.combatantId,
                              newDeclaration: {
                                mode: 'single',
                                slots: [
                                  {
                                    category: 'brawl_attack',
                                    label: 'Held Interrupt Strike',
                                    targetCombatantId:
                                      combat.activeCursorCombatantId &&
                                      combat.activeCursorCombatantId !== entry.combatantId
                                        ? combat.activeCursorCombatantId
                                        : opponentOptions[0]?.combatantId,
                                    attributeKey: 'dexterity',
                                    abilityKey: 'brawl',
                                    baseDifficulty: 6,
                                    weaponDamageBonus: 2,
                                    damageType: 'aggravated',
                                  },
                                ],
                              },
                            })
                          }
                          className="flex items-center gap-0.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950 hover:bg-amber-400"
                        >
                          <Zap className="h-3 w-3" />
                          Interrupt!
                        </button>
                        <button
                          type="button"
                          title="Convert Hold to Full Defense"
                          onClick={() =>
                            sendCommand({
                              type: 'COMBAT_TRIGGER_HOLD_INTERRUPT',
                              combatantId: entry.combatantId,
                              newDeclaration: {
                                mode: 'full_defense',
                                slots: [
                                  {
                                    category: 'full_defense',
                                    label: 'Full Defense (from Hold)',
                                    baseDifficulty: 6,
                                  },
                                ],
                              },
                            })
                          }
                          className="rounded border border-emerald-600/70 bg-emerald-950/70 p-0.5 text-emerald-200 hover:bg-emerald-900"
                        >
                          <Shield className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 8. Compact Combat Log */}
      {combat.combatLog.length > 0 && (
        <div className="mt-2 max-h-24 overflow-y-auto border-t border-zinc-800 pt-2 text-[10px] text-zinc-400">
          {combat.combatLog.slice(-6).map((line, i) => (
            <div key={i} className="truncate">
              {line}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
