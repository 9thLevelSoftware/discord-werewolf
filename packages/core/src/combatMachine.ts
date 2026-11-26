import { resolveRuleShift, resolveRuleDamageType, resolveIncomingRuleDamage } from './ruleActions';
import { applyRuleValue } from './modifierRules';
import {
  CombatantEntry,
  CombatEncounterState,
  CombatParticipantSeed,
  DeclaredActionInput,
  ReactionChoice,
  SubActionSlot,
} from './combatTypes';
import { W20CharacterState } from './types';
import { computeEffectiveCharacterStats, getBreedNaturalForm, W20_FORM_MATRIX } from './forms';
import {
  resolveW20DicePool,
  rollCsprngD10,
  validateResourceSpend,
  W20RollResult,
} from './diceResolver';
import { applyHealthDamage, resolveCombatRegeneration } from './frenzyAndRegen';
import { executeW20Macro } from './macros';

export interface CombatStepOutcome {
  combat: CombatEncounterState;
  characters: Record<string, W20CharacterState>;
  emittedRolls: Array<{ characterId: string; label: string; result: W20RollResult }>;
}

const PASSIVE_NON_EXEC_CATEGORIES = new Set([
  'defend_dodge',
  'defend_parry',
  'defend_block',
  'full_defense',
  'hold',
]);

function isAttackCategory(category: SubActionSlot['category']): boolean {
  return (
    category === 'melee_attack' ||
    category === 'brawl_attack' ||
    category === 'ranged_attack'
  );
}

/**
 * Canonical W20 Initiative Sort (Descending: Highest goes first in Resolution; reverse for Declaration).
 * Tiebreakers: 1) Total Score, 2) Initiative Modifier, 3) Effective Dexterity, 4) CSPRNG tiebreak seed.
 */
function sortResolutionOrderDesc(entries: CombatantEntry[]): string[] {
  return [...entries]
    .sort((a, b) => {
      const scoreDiff = (b.initiativeScore ?? 0) - (a.initiativeScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const modDiff = b.initiativeModifier - a.initiativeModifier;
      if (modDiff !== 0) return modDiff;
      const dexDiff = b.effectiveDexterity - a.effectiveDexterity;
      if (dexDiff !== 0) return dexDiff;
      return b.tiebreakOrder - a.tiebreakOrder;
    })
    .map((c) => c.combatantId);
}

export function getDeclarationSlotPool(
  char: W20CharacterState,
  slot: DeclaredActionInput['slots'][number]
): number {
  if (slot.category === 'shift_form' && slot.targetForm) {
    const shift = resolveRuleShift(char, {
      targetForm: slot.targetForm,
      method: 'roll_primal_urge',
      baseDifficulty: slot.baseDifficulty,
    });
    return shift.allowed ? Math.max(0, shift.pool + shift.woundPenalty) : 0;
  }
  const macroPool = slot.macro?.pool;
  const attribute =
    macroPool?.kind === 'attribute_ability' && !slot.attributeKey
      ? macroPool.attribute
      : (slot.attributeKey ?? 'dexterity');
  const ability =
    macroPool?.kind === 'attribute_ability' && !slot.attributeKey
      ? macroPool.ability
      : slot.abilityKey;
  const stats = computeEffectiveCharacterStats(char, {
    attribute,
    ability,
    selectedItemId: slot.weaponId,
    rollKind: slot.category.includes('attack') ? 'attack' : undefined,
    tags: [`action:${slot.category}`],
  });
  if (macroPool && !slot.attributeKey) {
    if (macroPool.kind === 'permanent_trait') {
      return macroPool.trait === 'gnosis'
        ? stats.effectiveGnosisPool
        : macroPool.trait === 'rage'
          ? stats.effectiveRagePool
          : stats.effectiveWillpowerPool;
    }
    if (macroPool.kind === 'fetish_gnosis_rating') return macroPool.rating;
    if (macroPool.kind === 'no_roll_instant') return 0;
  }
  if (slot.category === 'shift_form' && !slot.attributeKey && !slot.abilityKey) {
    return Math.max(
      0,
      stats.effectiveAttributes.stamina +
        (stats.effectiveAbilities.primal_urge ?? 0) +
        stats.woundPenalty
    );
  }
  const pool =
    stats.effectiveAttributes[attribute] + (ability ? (stats.effectiveAbilities[ability] ?? 0) : 0);
  return Math.max(
    0,
    Math.floor(applyRuleValue(stats.ruleEvaluation, 'pool', pool) + stats.woundPenalty)
  );
}

function buildValidatedDeclarationSlots(
  combat: CombatEncounterState,
  combatantId: string,
  char: W20CharacterState,
  input: DeclaredActionInput
): SubActionSlot[] {
  const stats = computeEffectiveCharacterStats(char);

  if (input.mode === 'split_pool') {
    if (input.slots.length < 2) {
      throw new Error('Split-pool mode requires at least 2 declared sub-actions.');
    }
    const candidatePools = input.slots.map((slot) => getDeclarationSlotPool(char, slot));
    const smallestPool = Math.min(...candidatePools);
    const sumAllocated = input.slots.reduce((acc, s) => acc + (s.allocatedDice ?? 0), 0);

    if (input.slots.some((s) => !s.allocatedDice || s.allocatedDice < 1)) {
      throw new Error('Every split sub-action must be allocated at least 1 die.');
    }
    if (sumAllocated > smallestPool) {
      throw new Error(
        `Cannot allocate ${sumAllocated} dice; smallest dice pool across declared actions is ${smallestPool}.`
      );
    }
  } else if (input.mode === 'single' && input.slots.length !== 1) {
    throw new Error('Single declaration mode requires exactly 1 action slot.');
  }

  const rawSlots =
    input.slots.length > 0
      ? input.slots
      : input.mode === 'hold'
        ? [{ category: 'hold' as const, label: 'Holding Action', baseDifficulty: 6 }]
        : input.mode === 'full_defense'
          ? [{ category: 'full_defense' as const, label: 'Full Defense', baseDifficulty: 6 }]
          : [];

  return rawSlots.map((s, idx) => ({
    ...s,
    slotId: `${combatantId}-r${combat.roundNumber}-s${idx + 1}`,
    resolved: false,
    abortedToDefense: false,
  }));
}

/**
 * Initializes a new W20 combat encounter in PRE_ROUND_RAGE.
 */
export function createCombatEncounter(
  encounterId: string,
  participants: Array<W20CharacterState | CombatParticipantSeed>
): CombatEncounterState {
  const combatants: Record<string, CombatantEntry> = {};

  participants.forEach((p, idx) => {
    const character = 'character' in p ? p.character : p;
    const baseId = 'character' in p && p.combatantId ? p.combatantId : character.id;
    const combatantId = combatants[baseId] ? `${baseId}-${idx + 1}` : baseId;
    const hasSpiritOfTheFray =
      'character' in p && p.hasSpiritOfTheFray !== undefined
        ? p.hasSpiritOfTheFray
        : character.macros.some(
            (m) => m.id === 'spirit_of_the_fray' || /spirit of the fray/i.test(m.name)
          );

    const stats = computeEffectiveCharacterStats(character);

    combatants[combatantId] = {
      combatantId,
      characterId: character.id,
      name: character.name,
      isNpc: character.isNpc,
      hasSpiritOfTheFray,
      preInitReady: false,
      declaredRageActions: 0,
      remainingRageActions: 0,
      spentGnosisPreInit: false,
      d10Roll: null,
      initiativeModifier: 0,
      initiativeScore: null,
      effectiveDexterity: stats.effectiveAttributes.dexterity,
      tiebreakOrder: 0,
      declarationMode: 'undeclared',
      normalSlots: [],
      isHolding: false,
      defensesUsedThisRound: 0,
    };
  });

  return {
    encounterId,
    roundNumber: 1,
    phase: 'PRE_ROUND_RAGE',
    combatants,
    declarationQueueAsc: [],
    resolutionQueueDesc: [],
    activeCursorCombatantId: null,
    currentPassNumber: 1,
    pendingAttack: null,
    combatLog: ['[Round 1] Combat started — Declare Rage / Spirit of the Fray before Initiative.'],
  };
}

// ============================================================================
// PHASE 1: PRE-ROUND RAGE & SPIRIT OF THE FRAY DECLARATIONS
// ============================================================================
export function declarePreInitiativeResources(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  combatantId: string,
  rageExtraActions: number,
  spendGnosisSpiritOfFray: boolean,
  spendWillpowerIgnoreWounds: boolean
): CombatStepOutcome {
  if (combat.phase !== 'PRE_ROUND_RAGE') {
    throw new Error('Pre-initiative declarations are only allowed in PRE_ROUND_RAGE.');
  }

  const entry = combat.combatants[combatantId];
  if (!entry) throw new Error('Combatant not found.');
  const char = characters[entry.characterId];
  if (!char) throw new Error('Combatant character state not found.');
  if (entry.preInitReady) {
    throw new Error('Combatant has already locked pre-initiative declarations this round.');
  }

  if (rageExtraActions > 0 && spendGnosisSpiritOfFray) {
    throw new Error('W20 Golden Rule: Cannot spend both Rage and Gnosis in the same turn.');
  }
  if (rageExtraActions > 0) {
    const check = validateResourceSpend(char.turnLocks, 'rage');
    if (!check.allowed) throw new Error(check.reason);
  }
  if (spendGnosisSpiritOfFray) {
    const check = validateResourceSpend(char.turnLocks, 'gnosis');
    if (!check.allowed) throw new Error(check.reason);
  }

  // W20 cap: Maximum Rage spent per turn for extra actions is ceil(permanent Rage / 2)
  const maxRageActions = Math.ceil(char.rage.permanent / 2);
  if (!Number.isInteger(rageExtraActions) || rageExtraActions < 0 || rageExtraActions > maxRageActions) {
    throw new Error(
      `Extra Rage actions cannot exceed ${maxRageActions} (half permanent Rage rounded up).`
    );
  }
  if (rageExtraActions > char.rage.temporary) {
    throw new Error('Insufficient temporary Rage.');
  }
  if (spendGnosisSpiritOfFray && (!entry.hasSpiritOfTheFray || char.gnosis.temporary < 1)) {
    throw new Error('Requires Spirit of the Fray and at least 1 temporary Gnosis.');
  }
  if (spendWillpowerIgnoreWounds && char.willpower.temporary < 1) {
    throw new Error('Insufficient temporary Willpower.');
  }

  const updatedChar: W20CharacterState = {
    ...char,
    rage: { ...char.rage, temporary: char.rage.temporary - rageExtraActions },
    gnosis: {
      ...char.gnosis,
      temporary: char.gnosis.temporary - (spendGnosisSpiritOfFray ? 1 : 0),
    },
    willpower: {
      ...char.willpower,
      temporary: char.willpower.temporary - (spendWillpowerIgnoreWounds ? 1 : 0),
    },
    turnLocks: {
      hasSpentRageThisTurn: char.turnLocks.hasSpentRageThisTurn || rageExtraActions > 0,
      hasSpentGnosisThisTurn: char.turnLocks.hasSpentGnosisThisTurn || spendGnosisSpiritOfFray,
      hasSpentWillpowerThisTurn:
        char.turnLocks.hasSpentWillpowerThisTurn || spendWillpowerIgnoreWounds,
      ignoringWoundPenaltiesThisTurn:
        char.turnLocks.ignoringWoundPenaltiesThisTurn || spendWillpowerIgnoreWounds,
      declaredExtraRageActions: rageExtraActions,
    },
    stateVersion: char.stateVersion + 1,
  };

  const updatedCombatant: CombatantEntry = {
    ...entry,
    preInitReady: true,
    declaredRageActions: rageExtraActions,
    remainingRageActions: rageExtraActions,
    spentGnosisPreInit: spendGnosisSpiritOfFray,
  };

  return {
    combat: {
      ...combat,
      combatants: { ...combat.combatants, [combatantId]: updatedCombatant },
    },
    characters: { ...characters, [char.id]: updatedChar },
    emittedRolls: [],
  };
}

// ============================================================================
// PHASE 2: ROLL INITIATIVE & BUILD REVERSE DECLARATION QUEUE
// ============================================================================
export function rollRoundInitiative(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  rngD10: () => number = rollCsprngD10
): CombatStepOutcome {
  if (combat.phase !== 'PRE_ROUND_RAGE' && combat.phase !== 'ROLL_INITIATIVE') {
    throw new Error('Initiative can only be rolled from PRE_ROUND_RAGE or ROLL_INITIATIVE.');
  }

  const updatedCombatants: Record<string, CombatantEntry> = {};
  const logLines = [...combat.combatLog];

  for (const [id, entry] of Object.entries(combat.combatants)) {
    const char = characters[entry.characterId];
    if (!char) throw new Error(`Character ${entry.characterId} not found.`);
    const stats = computeEffectiveCharacterStats(char);

    if (stats.isIncapacitated) {
      updatedCombatants[id] = {
        ...entry,
        preInitReady: true,
        d10Roll: null,
        initiativeScore: -99,
      };
      continue;
    }

    const d10 = rngD10();
    const spiritModifiers = stats.ruleEvaluation.modifiers.filter(
      (modifier) => modifier.name === 'Spirit of the Fray' && modifier.target === 'initiative'
    );
    const learnedSpiritApplied = spiritModifiers.some((modifier) => !modifier.duration);
    const activatedSpiritApplied =
      spiritModifiers.some((modifier) => modifier.duration) ||
      char.activeBuffs.some(
        (buff) => buff.sourceMacroId === 'spirit_of_the_fray' && buff.remainingRounds > 0
      );
    const spiritBonus =
      (entry.hasSpiritOfTheFray && !learnedSpiritApplied ? 10 : 0) +
      (entry.spentGnosisPreInit && !activatedSpiritApplied ? 10 : 0);
    const mod = stats.initiativeBonus + spiritBonus;
    const total = d10 + mod;

    updatedCombatants[id] = {
      ...entry,
      preInitReady: true,
      d10Roll: d10,
      initiativeModifier: mod,
      initiativeScore: total,
      effectiveDexterity: stats.effectiveAttributes.dexterity,
      tiebreakOrder: rngD10() * 100 + rngD10(),
      declarationMode: 'undeclared',
      normalSlots: [],
      isHolding: false,
      defensesUsedThisRound: 0,
      lastResolvedRagePass: undefined,
    };

    logLines.push(
      `[Round ${combat.roundNumber}] ${entry.name} rolled Initiative ${total} (1d10=${d10} + ${mod}).`
    );
  }

  const activeEntries = Object.values(updatedCombatants).filter(
    (c) => !computeEffectiveCharacterStats(characters[c.characterId]).isIncapacitated
  );

  const resolutionQueueDesc = sortResolutionOrderDesc(activeEntries);
  const declarationQueueAsc = [...resolutionQueueDesc].reverse(); // LOWEST -> HIGHEST

  if (declarationQueueAsc.length === 0) {
    return {
      combat: {
        ...combat,
        phase: 'END_OF_ROUND',
        combatants: updatedCombatants,
        declarationQueueAsc: [],
        resolutionQueueDesc: [],
        activeCursorCombatantId: null,
        currentPassNumber: 1,
        combatLog: logLines,
      },
      characters,
      emittedRolls: [],
    };
  }

  return {
    combat: {
      ...combat,
      phase: 'DECLARE_REVERSE',
      combatants: updatedCombatants,
      declarationQueueAsc,
      resolutionQueueDesc,
      activeCursorCombatantId: declarationQueueAsc[0] ?? null,
      currentPassNumber: 1,
      combatLog: logLines,
    },
    characters,
    emittedRolls: [],
  };
}

// ============================================================================
// PHASE 3: REVERSE DECLARATION (LOWEST -> HIGHEST) & SMALLEST-POOL VALIDATION
// ============================================================================
export function submitReverseDeclaration(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  combatantId: string,
  input: DeclaredActionInput
): CombatStepOutcome {
  if (combat.phase !== 'DECLARE_REVERSE') {
    throw new Error('Declarations are only accepted during DECLARE_REVERSE.');
  }
  if (combat.activeCursorCombatantId !== combatantId) {
    throw new Error('Wait for slower combatants to declare first.');
  }

  const entry = combat.combatants[combatantId];
  if (!entry) throw new Error('Combatant not found.');
  const char = characters[entry.characterId];
  if (!char) throw new Error('Combatant character state not found.');

  const slots = buildValidatedDeclarationSlots(combat, combatantId, char, input);

  const updatedEntry: CombatantEntry = {
    ...entry,
    declarationMode: input.mode,
    normalSlots: slots,
    isHolding: input.mode === 'hold',
  };

  const nextCombatants = { ...combat.combatants, [combatantId]: updatedEntry };
  const currentIdx = combat.declarationQueueAsc.indexOf(combatantId);
  const nextDeclarantId = combat.declarationQueueAsc[currentIdx + 1] ?? null;
  const logLines = [
    ...combat.combatLog,
    `${entry.name} declared ${input.mode}: ${slots.map((s) => s.label).join(', ')}.`,
  ];

  // Once the FASTEST combatant finishes declaring, flip immediately to Top-Down Resolution
  if (!nextDeclarantId) {
    return advanceResolutionCursor(
      {
        ...combat,
        phase: 'RESOLVE_NORMAL_PASS',
        combatants: nextCombatants,
        currentPassNumber: 1,
        combatLog: logLines,
      },
      characters,
      []
    );
  }

  return {
    combat: {
      ...combat,
      combatants: nextCombatants,
      activeCursorCombatantId: nextDeclarantId,
      combatLog: logLines,
    },
    characters,
    emittedRolls: [],
  };
}

/**
 * Triggers a held action interrupt during RESOLVE_NORMAL_PASS or RESOLVE_RAGE_PASSES,
 * injecting the holding combatant's new action directly onto the active resolution cursor.
 */
export function triggerHoldInterrupt(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  combatantId: string,
  newDeclaration: DeclaredActionInput
): CombatStepOutcome {
  if (combat.phase !== 'RESOLVE_NORMAL_PASS' && combat.phase !== 'RESOLVE_RAGE_PASSES') {
    throw new Error('Hold interrupts are only allowed during resolution phases.');
  }

  const entry = combat.combatants[combatantId];
  if (!entry) throw new Error('Combatant not found.');
  if (!entry.isHolding) {
    throw new Error(`${entry.name} is not currently holding an action.`);
  }
  if (newDeclaration.mode === 'hold') {
    throw new Error('Hold interrupt must declare an active or defensive mode.');
  }

  const char = characters[entry.characterId];
  if (!char) throw new Error('Combatant character state not found.');
  const stats = computeEffectiveCharacterStats(char);
  if (stats.isIncapacitated) {
    throw new Error(`${entry.name} is incapacitated and cannot interrupt.`);
  }

  const slots = buildValidatedDeclarationSlots(combat, combatantId, char, newDeclaration);

  const updatedEntry: CombatantEntry = {
    ...entry,
    declarationMode: newDeclaration.mode,
    normalSlots: slots,
    isHolding: false,
  };

  const nextCombatants = { ...combat.combatants, [combatantId]: updatedEntry };
  const logLines = [
    ...combat.combatLog,
    `${entry.name} interrupted from Hold (${newDeclaration.mode}: ${slots.map((s) => s.label).join(', ')}).`,
  ];

  if (newDeclaration.mode === 'full_defense') {
    // Switching a hold into Full Defense leaves the current resolution cursor intact
    return {
      combat: {
        ...combat,
        combatants: nextCombatants,
        combatLog: logLines,
      },
      characters,
      emittedRolls: [],
    };
  }

  return {
    combat: {
      ...combat,
      combatants: nextCombatants,
      activeCursorCombatantId: combatantId,
      combatLog: logLines,
    },
    characters,
    emittedRolls: [],
  };
}

/**
 * Storyteller override to unblock AFK / stalled combatants in any combat phase.
 */
export function forceStorytellerOverride(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  reason: string,
  rngD10: () => number = rollCsprngD10
): CombatStepOutcome {
  const withLog: CombatEncounterState = {
    ...combat,
    combatLog: [...combat.combatLog, `[ST Override] ${reason}`],
  };

  if (withLog.phase === 'PRE_ROUND_RAGE' || withLog.phase === 'ROLL_INITIATIVE') {
    return rollRoundInitiative(withLog, characters, rngD10);
  }

  if (withLog.phase === 'DECLARE_REVERSE') {
    const activeId = withLog.activeCursorCombatantId;
    if (!activeId) {
      return advanceResolutionCursor(
        { ...withLog, phase: 'RESOLVE_NORMAL_PASS', currentPassNumber: 1 },
        characters,
        []
      );
    }
    return submitReverseDeclaration(withLog, characters, activeId, {
      mode: 'hold',
      slots: [{ category: 'hold', label: `Hold (${reason})`, baseDifficulty: 6 }],
    });
  }

  if (withLog.phase === 'AWAITING_REACTION' && withLog.pendingAttack) {
    return resolveDefenderReactionAndDamage(
      withLog,
      characters,
      withLog.pendingAttack.defenderCombatantId,
      { strategy: 'take_hit_soak_only' },
      rngD10
    );
  }

  if (withLog.phase === 'RESOLVE_NORMAL_PASS' || withLog.phase === 'RESOLVE_RAGE_PASSES') {
    const activeId = withLog.activeCursorCombatantId;
    if (!activeId) {
      return advanceResolutionCursor(withLog, characters, []);
    }
    const entry = withLog.combatants[activeId];
    const unresolvedNormal = entry.normalSlots.find(
      (s) => !s.resolved && !s.abortedToDefense && !PASSIVE_NON_EXEC_CATEGORIES.has(s.category)
    );
    const updatedEntry = unresolvedNormal
      ? markActionConsumed(entry, unresolvedNormal.slotId, 1, 1)
      : markActionConsumed(entry, entry.normalSlots[0]?.slotId ?? '', withLog.currentPassNumber, withLog.currentPassNumber);

    return advanceResolutionCursor(
      {
        ...withLog,
        combatants: { ...withLog.combatants, [activeId]: updatedEntry },
      },
      characters,
      []
    );
  }

  return advanceEndOfRound(withLog, characters, rngD10);
}

// ============================================================================
// PHASE 4 & 5: TOP-DOWN SLOT EXECUTION, DEFENSIVE INTERRUPTS & SOAK
// ============================================================================
export function executeActiveCombatSlot(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  combatantId: string,
  options: {
    spendWillpowerOnRoll?: boolean;
    hasSpecialty?: boolean;
    localGauntlet?: number;
  } = {},
  rngD10: () => number = rollCsprngD10
): CombatStepOutcome {
  if (combat.phase !== 'RESOLVE_NORMAL_PASS' && combat.phase !== 'RESOLVE_RAGE_PASSES') {
    throw new Error('Cannot execute turn outside resolution phases.');
  }
  if (combat.activeCursorCombatantId !== combatantId) {
    throw new Error('Not this combatant’s turn to resolve.');
  }

  const attacker = combat.combatants[combatantId];
  if (!attacker) throw new Error('Combatant not found.');
  let attackerChar = characters[attacker.characterId];
  if (!attackerChar) throw new Error('Combatant character state not found.');

  // Pull next unresolved normal slot (Pass 1 or held interrupt), or synthesize Rage pass slot
  const unresolvedNormalSlot = attacker.normalSlots.find(
    (s) => !s.resolved && !s.abortedToDefense && !PASSIVE_NON_EXEC_CATEGORIES.has(s.category)
  );
  const isNormalOrInterruptSlot = Boolean(unresolvedNormalSlot);

  if (combat.currentPassNumber === 1 && !unresolvedNormalSlot) {
    throw new Error('No unresolved active action slot for this combatant.');
  }
  if (!isNormalOrInterruptSlot && attacker.remainingRageActions < 1) {
    throw new Error('No banked Rage actions remaining.');
  }

  const activeSlot = isNormalOrInterruptSlot
    ? unresolvedNormalSlot!
    : attacker.normalSlots.find((s) => !PASSIVE_NON_EXEC_CATEGORIES.has(s.category)) ??
      attacker.normalSlots[0];

  if (!activeSlot) {
    throw new Error('Active slot not found for combatant.');
  }

  const effectivePass = isNormalOrInterruptSlot ? 1 : combat.currentPassNumber;

  // Handle Utility Slots: shift_form, gift_or_rite, move_or_other
  if (!isAttackCategory(activeSlot.category)) {
    const consumedAttacker = markActionConsumed(
      attacker,
      activeSlot.slotId,
      effectivePass,
      combat.currentPassNumber
    );
    const nextCombatants = { ...combat.combatants, [combatantId]: consumedAttacker };

    if (activeSlot.category === 'shift_form') {
      const targetForm = activeSlot.targetForm;
      if (!targetForm) {
        throw new Error('shift_form slot requires a valid targetForm.');
      }
      const shiftRules = resolveRuleShift(attackerChar, {
        targetForm,
        method: 'roll_primal_urge',
        baseDifficulty: activeSlot.baseDifficulty || undefined,
      });
      if (!shiftRules.allowed) throw new Error(shiftRules.reason);
      if (targetForm === getBreedNaturalForm(attackerChar.breed)) {
        const shiftedChar: W20CharacterState = {
          ...attackerChar,
          activeForm: targetForm,
          stateVersion: attackerChar.stateVersion + 1,
        };
        return advanceResolutionCursor(
          {
            ...combat,
            combatants: nextCombatants,
            combatLog: [
              ...combat.combatLog,
              `${attacker.name} shifted freely to breed form (${targetForm}).`,
            ],
          },
          { ...characters, [shiftedChar.id]: shiftedChar },
          []
        );
      }
      if (options.spendWillpowerOnRoll) {
        if (attackerChar.willpower.temporary < 1) {
          throw new Error('Insufficient temporary Willpower.');
        }
        attackerChar = {
          ...attackerChar,
          willpower: { ...attackerChar.willpower, temporary: attackerChar.willpower.temporary - 1 },
          turnLocks: { ...attackerChar.turnLocks, hasSpentWillpowerThisTurn: true },
          stateVersion: attackerChar.stateVersion + 1,
        };
      }
      const stats = computeEffectiveCharacterStats(attackerChar, {
        attribute:
          activeSlot.attributeKey ??
          (activeSlot.category === 'shift_form' ? 'stamina' : 'dexterity'),
        ability:
          activeSlot.abilityKey ??
          (activeSlot.category === 'shift_form' ? 'primal_urge' : undefined),
        tags: [`action:${activeSlot.category}`],
      });
      const basePool =
        isNormalOrInterruptSlot && activeSlot.allocatedDice
          ? activeSlot.allocatedDice
          : stats.effectiveAttributes.stamina + (stats.effectiveAbilities.primal_urge ?? 0);
      const shiftDiff = activeSlot.baseDifficulty || W20_FORM_MATRIX[targetForm].shiftDifficulty;
      const shiftRoll = resolveW20DicePool(
        {
          label: `${attacker.name}: Shift to ${targetForm}`,
          basePool: shiftRules.requiresRoll
            ? isNormalOrInterruptSlot && activeSlot.allocatedDice
              ? basePool
              : shiftRules.pool
            : 0,
          bonusAutomaticSuccesses: shiftRules.automaticSuccesses,
          ruleModifiers: shiftRules.modifiers,
          woundPenalty:
            isNormalOrInterruptSlot && activeSlot.allocatedDice ? 0 : shiftRules.woundPenalty,
          baseDifficulty: shiftRules.difficulty,
          hasApplicableSpecialty: options.hasSpecialty,
          spendWillpower: options.spendWillpowerOnRoll,
        },
        rngD10
      );

      let shiftedChar = attackerChar;
      let logMsg = `${attacker.name} failed to shift to ${targetForm}.`;
      if (shiftRoll.netSuccesses > 0) {
        shiftedChar = {
          ...attackerChar,
          activeForm: targetForm,
          stateVersion: attackerChar.stateVersion + 1,
        };
        logMsg = `${attacker.name} shifted to ${targetForm}.`;
      }

      return advanceResolutionCursor(
        {
          ...combat,
          combatants: nextCombatants,
          combatLog: [...combat.combatLog, logMsg],
        },
        { ...characters, [shiftedChar.id]: shiftedChar },
        [{ characterId: shiftedChar.id, label: activeSlot.label, result: shiftRoll }]
      );
    }

    if (activeSlot.category === 'gift_or_rite') {
      if (activeSlot.macro) {
        const targetCombatant = activeSlot.targetCombatantId
          ? combat.combatants[activeSlot.targetCombatantId]
          : undefined;
        const targetChar = targetCombatant ? characters[targetCombatant.characterId] : undefined;
        const macroOutcome = executeW20Macro(
          attackerChar,
          activeSlot.macro,
          {
            localGauntlet: options.localGauntlet ?? 6,
            targetCharacter: targetChar,
            spendWillpowerOnRoll: options.spendWillpowerOnRoll,
            ...(isNormalOrInterruptSlot && activeSlot.allocatedDice
              ? { overrideBasePool: activeSlot.allocatedDice }
              : {}),
          },
          rngD10
        );
        const updatedChars: Record<string, W20CharacterState> = {
          ...characters,
          [macroOutcome.updatedCaster.id]: macroOutcome.updatedCaster,
        };
        if (macroOutcome.updatedTarget) {
          updatedChars[macroOutcome.updatedTarget.id] = macroOutcome.updatedTarget;
        }
        const emittedRolls = macroOutcome.rollResult
          ? [
              {
                characterId: macroOutcome.updatedCaster.id,
                label: activeSlot.label,
                result: macroOutcome.rollResult,
              },
            ]
          : [];
        return advanceResolutionCursor(
          {
            ...combat,
            combatants: nextCombatants,
            combatLog: [...combat.combatLog, `${attacker.name} activated ${activeSlot.macro.name}.`],
          },
          updatedChars,
          emittedRolls
        );
      }

      if (options.spendWillpowerOnRoll) {
        if (attackerChar.willpower.temporary < 1) {
          throw new Error('Insufficient temporary Willpower.');
        }
        attackerChar = {
          ...attackerChar,
          willpower: { ...attackerChar.willpower, temporary: attackerChar.willpower.temporary - 1 },
          turnLocks: { ...attackerChar.turnLocks, hasSpentWillpowerThisTurn: true },
          stateVersion: attackerChar.stateVersion + 1,
        };
      }
      const stats = computeEffectiveCharacterStats(attackerChar, {
        attribute: activeSlot.attributeKey ?? 'wits',
        ability: activeSlot.abilityKey,
        tags: [`action:${activeSlot.category}`],
      });
      const basePool =
        isNormalOrInterruptSlot && activeSlot.allocatedDice
          ? activeSlot.allocatedDice
          : (activeSlot.attributeKey
              ? stats.effectiveAttributes[activeSlot.attributeKey]
              : stats.effectiveAttributes.wits) +
            (activeSlot.abilityKey ? (stats.effectiveAbilities[activeSlot.abilityKey] ?? 0) : 0);
      const giftRoll = resolveW20DicePool(
        {
          label: `${attacker.name}: ${activeSlot.label}`,
          basePool: isNormalOrInterruptSlot && activeSlot.allocatedDice ? basePool : applyRuleValue(stats.ruleEvaluation,'pool',basePool),
          ruleModifiers: stats.ruleEvaluation.modifiers,
          woundPenalty:
            isNormalOrInterruptSlot && activeSlot.allocatedDice ? 0 : stats.woundPenalty,
          baseDifficulty: applyRuleValue(stats.ruleEvaluation,'difficulty',activeSlot.baseDifficulty),
          hasApplicableSpecialty: options.hasSpecialty,
          spendWillpower: options.spendWillpowerOnRoll,
        },
        rngD10
      );

      return advanceResolutionCursor(
        {
          ...combat,
          combatants: nextCombatants,
          combatLog: [
            ...combat.combatLog,
            `${attacker.name} used ${activeSlot.label} (${giftRoll.outcome.toUpperCase()}).`,
          ],
        },
        { ...characters, [attackerChar.id]: attackerChar },
        [{ characterId: attackerChar.id, label: activeSlot.label, result: giftRoll }]
      );
    }

    // move_or_other (or passive fallback)
    const emittedRolls: CombatStepOutcome['emittedRolls'] = [];
    if (activeSlot.attributeKey || activeSlot.abilityKey || activeSlot.allocatedDice) {
      if (options.spendWillpowerOnRoll) {
        if (attackerChar.willpower.temporary < 1) {
          throw new Error('Insufficient temporary Willpower.');
        }
        attackerChar = {
          ...attackerChar,
          willpower: { ...attackerChar.willpower, temporary: attackerChar.willpower.temporary - 1 },
          turnLocks: { ...attackerChar.turnLocks, hasSpentWillpowerThisTurn: true },
          stateVersion: attackerChar.stateVersion + 1,
        };
      }
      const stats = computeEffectiveCharacterStats(attackerChar, {
        attribute: activeSlot.attributeKey ?? 'dexterity',
        ability: activeSlot.abilityKey,
        tags: [`action:${activeSlot.category}`],
      });
      const basePool =
        isNormalOrInterruptSlot && activeSlot.allocatedDice
          ? activeSlot.allocatedDice
          : (activeSlot.attributeKey
              ? stats.effectiveAttributes[activeSlot.attributeKey]
              : stats.effectiveAttributes.dexterity) +
            (activeSlot.abilityKey ? (stats.effectiveAbilities[activeSlot.abilityKey] ?? 0) : 0);
      const utilRoll = resolveW20DicePool(
        {
          label: `${attacker.name}: ${activeSlot.label}`,
          basePool: isNormalOrInterruptSlot && activeSlot.allocatedDice ? basePool : applyRuleValue(stats.ruleEvaluation,'pool',basePool),
          ruleModifiers: stats.ruleEvaluation.modifiers,
          woundPenalty:
            isNormalOrInterruptSlot && activeSlot.allocatedDice ? 0 : stats.woundPenalty,
          baseDifficulty: applyRuleValue(stats.ruleEvaluation,'difficulty',activeSlot.baseDifficulty),
          hasApplicableSpecialty: options.hasSpecialty,
          spendWillpower: options.spendWillpowerOnRoll,
        },
        rngD10
      );
      emittedRolls.push({
        characterId: attackerChar.id,
        label: activeSlot.label,
        result: utilRoll,
      });
    }

    return advanceResolutionCursor(
      {
        ...combat,
        combatants: nextCombatants,
        combatLog: [...combat.combatLog, `${attacker.name} completed ${activeSlot.label}.`],
      },
      { ...characters, [attackerChar.id]: attackerChar },
      emittedRolls
    );
  }

  // Attack Slot Resolution
  if (!activeSlot.targetCombatantId || !combat.combatants[activeSlot.targetCombatantId]) {
    throw new Error('Active attack slot requires a valid target combatant.');
  }

  if (options.spendWillpowerOnRoll) {
    if (attackerChar.willpower.temporary < 1) {
      throw new Error('Insufficient temporary Willpower.');
    }
    attackerChar = {
      ...attackerChar,
      willpower: { ...attackerChar.willpower, temporary: attackerChar.willpower.temporary - 1 },
      turnLocks: { ...attackerChar.turnLocks, hasSpentWillpowerThisTurn: true },
      stateVersion: attackerChar.stateVersion + 1,
    };
  }

  const attackerStats = computeEffectiveCharacterStats(attackerChar, {
    attribute: activeSlot.attributeKey ?? 'dexterity',
    ability: activeSlot.abilityKey,
    selectedItemId: activeSlot.weaponId,
    rollKind: 'attack',
    tags: [`action:${activeSlot.category}`],
  });
  const basePool =
    isNormalOrInterruptSlot && activeSlot.allocatedDice
      ? activeSlot.allocatedDice // Already incorporates wound penalty from split validation
      : (activeSlot.attributeKey
          ? attackerStats.effectiveAttributes[activeSlot.attributeKey]
          : attackerStats.effectiveAttributes.dexterity) +
        (activeSlot.abilityKey
          ? (attackerStats.effectiveAbilities[activeSlot.abilityKey] ?? 0)
          : 0);

  const attackRoll = resolveW20DicePool(
    {
      label: `${attacker.name}: ${activeSlot.label}`,
      basePool: isNormalOrInterruptSlot && activeSlot.allocatedDice ? basePool : applyRuleValue(attackerStats.ruleEvaluation,'pool',basePool),
      ruleModifiers: attackerStats.ruleEvaluation.modifiers,
      woundPenalty:
        isNormalOrInterruptSlot && activeSlot.allocatedDice ? 0 : attackerStats.woundPenalty,
      baseDifficulty: applyRuleValue(attackerStats.ruleEvaluation,'difficulty',activeSlot.baseDifficulty),
      hasApplicableSpecialty: options.hasSpecialty,
      spendWillpower: options.spendWillpowerOnRoll,
    },
    rngD10
  );

  // Mark slot / Rage action consumed
  const updatedAttacker = markActionConsumed(
    attacker,
    activeSlot.slotId,
    effectivePass,
    combat.currentPassNumber
  );
  const nextCombatants = { ...combat.combatants, [combatantId]: updatedAttacker };
  const updatedChars = { ...characters, [attackerChar.id]: attackerChar };

  // If the attack missed or botched, skip reaction window and advance resolution cursor
  if (attackRoll.netSuccesses <= 0) {
    return advanceResolutionCursor(
      {
        ...combat,
        combatants: nextCombatants,
        combatLog: [
          ...combat.combatLog,
          `${attacker.name} missed (${attackRoll.outcome.toUpperCase()}).`,
        ],
      },
      updatedChars,
      [{ characterId: attackerChar.id, label: activeSlot.label, result: attackRoll }]
    );
  }

  const returnPhase =
    combat.phase === 'RESOLVE_RAGE_PASSES' ? 'RESOLVE_RAGE_PASSES' : 'RESOLVE_NORMAL_PASS';

  // Hit! Pause in AWAITING_REACTION so the target can Dodge, Parry, Block, Abort, or Soak
  return {
    combat: {
      ...combat,
      phase: 'AWAITING_REACTION',
      combatants: nextCombatants,
      activeCursorCombatantId: activeSlot.targetCombatantId,
      pendingAttack: {
        returnPhase,
        attackerCombatantId: combatantId,
        defenderCombatantId: activeSlot.targetCombatantId,
        slot: activeSlot,
        attackRoll,
      },
    },
    characters: updatedChars,
    emittedRolls: [{ characterId: attackerChar.id, label: activeSlot.label, result: attackRoll }],
  };
}

/**
 * Alias matching design-doc method naming.
 */
export const executeActiveAttackSlot = executeActiveCombatSlot;

export function resolveDefenderReactionAndDamage(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  defenderCombatantId: string,
  reaction: ReactionChoice,
  rngD10: () => number = rollCsprngD10
): CombatStepOutcome {
  if (combat.phase !== 'AWAITING_REACTION' || !combat.pendingAttack) {
    throw new Error('No pending attack awaiting reaction.');
  }
  const pending = combat.pendingAttack;
  if (pending.defenderCombatantId !== defenderCombatantId) {
    throw new Error('Only the targeted defender may submit a reaction.');
  }

  let defender = combat.combatants[defenderCombatantId];
  let defenderChar = characters[defender.characterId];
  const attacker = combat.combatants[pending.attackerCombatantId];
  const damageTags = [
    `damage:${pending.slot.damageType ?? 'bashing'}`,
    ...(pending.slot.isSilverAttack ? ['damage:silver'] : []),
  ];
  const attackerStats = computeEffectiveCharacterStats(characters[attacker.characterId], {
    rollKind: 'damage',
    selectedItemId: pending.slot.weaponId,
    ability: pending.slot.category === 'brawl_attack' ? 'brawl' : pending.slot.abilityKey,
    tags: damageTags,
  });
  const defenderStats = computeEffectiveCharacterStats(defenderChar, {
    rollKind: 'soak',
    tags: damageTags,
  });

  const emittedRolls: CombatStepOutcome['emittedRolls'] = [];
  let defenseSuccesses = 0;

  if (reaction.strategy !== 'take_hit_soak_only') {
    let queuedAllocatedDice: number | undefined;

    if (reaction.strategy === 'use_queued_defense') {
      if (defender.declarationMode !== 'full_defense') {
        const queuedDefSlot = defender.normalSlots.find(
          (s) =>
            !s.resolved &&
            !s.abortedToDefense &&
            (s.category === reaction.defenseType || s.category.startsWith('defend_'))
        );
        if (!queuedDefSlot) {
          throw new Error('No queued defense action available; abort with Willpower or burn Rage.');
        }
        queuedAllocatedDice = queuedDefSlot.allocatedDice;
        defender = {
          ...defender,
          normalSlots: defender.normalSlots.map((s) =>
            s.slotId === queuedDefSlot.slotId ? { ...s, resolved: true } : s
          ),
        };
      }
    } else if (reaction.strategy === 'willpower_abort_to_defense') {
      const unspentSlot = defender.normalSlots.find((s) => !s.resolved && !s.abortedToDefense);
      if (!unspentSlot) throw new Error('No unspent Pass 1 action left to abort.');
      if (defenderChar.willpower.temporary < 1) {
        throw new Error('Requires 1 temporary Willpower to abort.');
      }
      defenderChar = {
        ...defenderChar,
        willpower: { ...defenderChar.willpower, temporary: defenderChar.willpower.temporary - 1 },
        turnLocks: { ...defenderChar.turnLocks, hasSpentWillpowerThisTurn: true },
        stateVersion: defenderChar.stateVersion + 1,
      };
      defender = {
        ...defender,
        isHolding: false,
        normalSlots: defender.normalSlots.map((s) =>
          s.slotId === unspentSlot.slotId ? { ...s, abortedToDefense: true, resolved: true } : s
        ),
      };
    } else if (reaction.strategy === 'burn_rage_action_to_defend') {
      const check = validateResourceSpend(defenderChar.turnLocks, 'rage');
      if (!check.allowed) throw new Error(check.reason);
      if (defender.remainingRageActions < 1) throw new Error('No banked Rage actions remaining.');
      defender = { ...defender, remainingRageActions: defender.remainingRageActions - 1 };
    }

    const defAbility =
      reaction.defenseType === 'defend_dodge'
        ? 'athletics'
        : reaction.defenseType === 'defend_parry'
          ? 'melee'
          : 'brawl';

    const defenseStats = computeEffectiveCharacterStats(defenderChar, {
      attribute: 'dexterity',
      ability: defAbility,
      rollKind: 'defense',
      tags: [`action:${reaction.defenseType}`],
    });
    const cumulativePenalty =
      defender.declarationMode === 'full_defense' ? -defender.defensesUsedThisRound : 0;
    const defPool =
      (queuedAllocatedDice ??
        applyRuleValue(defenseStats.ruleEvaluation,'pool',defenseStats.effectiveAttributes.dexterity + (defenseStats.effectiveAbilities[defAbility] ?? 0))) +
      cumulativePenalty;

    const defDiff = pending.slot.category === 'ranged_attack' ? 8 : 6;
    const defRoll = resolveW20DicePool(
      {
        label: `${defender.name}: ${reaction.defenseType}`,
        basePool: defPool,
        ruleModifiers: defenseStats.ruleEvaluation.modifiers,
        woundPenalty: queuedAllocatedDice ? 0 : defenderStats.woundPenalty,
        baseDifficulty: applyRuleValue(defenseStats.ruleEvaluation, 'difficulty', defDiff),
      },
      rngD10
    );

    emittedRolls.push({
      characterId: defenderChar.id,
      label: reaction.defenseType,
      result: defRoll,
    });
    defenseSuccesses = defRoll.netSuccesses;
    defender = { ...defender, defensesUsedThisRound: defender.defensesUsedThisRound + 1 };
  }

  // W20 Rule: Defense successes subtract 1:1; defender wins ties (0 remaining = miss)
  const netHitSuccesses = pending.attackRoll.netSuccesses - defenseSuccesses;
  let updatedCharacters = { ...characters, [defenderChar.id]: defenderChar };
  const logLines = [...combat.combatLog];

  if (netHitSuccesses <= 0) {
    logLines.push(`${defender.name} deflected ${attacker.name}'s attack!`);
  } else {
    // Extra successes beyond the 1st carry over to the damage dice pool (minimum 1 damage die)
    const extraHitDice = Math.max(
      0,
      applyRuleValue(
        attackerStats.ruleEvaluation,
        'damage:attack_success_bonus',
        netHitSuccesses - 1
      )
    );
    const rawDamagePool =
      pending.slot.category === 'ranged_attack'
        ? (pending.slot.weaponDamageBonus ?? 4) + extraHitDice
        : attackerStats.effectiveAttributes.strength +
          (pending.slot.weaponDamageBonus ?? 0) +
          extraHitDice;

    const damageType = resolveIncomingRuleDamage(
      defenderChar,
      0,
      resolveRuleDamageType(
        pending.slot.damageType ?? 'bashing',
        attackerStats.ruleEvaluation.modifiers
      ),
      { isSilver: pending.slot.isSilverAttack, tags: damageTags }
    ).type;
    const dmgRoll = resolveW20DicePool(
      {
        label: `${attacker.name}: Damage (${damageType})`,
        basePool: Math.max(1, applyRuleValue(attackerStats.ruleEvaluation, 'pool', rawDamagePool)),
        ruleModifiers: attackerStats.ruleEvaluation.modifiers,
        applyWoundPenalty: false, // W20: Wound penalties never reduce damage pools
        baseDifficulty: 6,
      },
      rngD10
    );
    emittedRolls.push({
      characterId: attacker.characterId,
      label: `Damage (${damageType})`,
      result: dmgRoll,
    });

    // Determine Soak eligibility using W20 form & silver rules
    const canSoakType = pending.slot.isSilverAttack
      ? defenderStats.soakCapabilities.canSoakSilver
      : damageType === 'bashing'
        ? defenderStats.soakCapabilities.canSoakBashing
        : damageType === 'lethal'
          ? defenderStats.soakCapabilities.canSoakLethal
          : defenderStats.soakCapabilities.canSoakAggravated;

    let soakedLevels = 0;
    if (canSoakType && dmgRoll.netSuccesses > 0) {
      const soakRoll = resolveW20DicePool(
        {
          label: `${defender.name}: Stamina Soak`,
          basePool: applyRuleValue(
            defenderStats.ruleEvaluation,
            'pool',
            defenderStats.soakCapabilities.soakPool
          ),
          ruleModifiers: defenderStats.ruleEvaluation.modifiers,
          applyWoundPenalty: false,
          baseDifficulty: 6,
        },
        rngD10
      );
      emittedRolls.push({ characterId: defenderChar.id, label: 'Soak', result: soakRoll });
      soakedLevels = soakRoll.netSuccesses;
    }

    const finalWounds = Math.max(
      0,
      Math.floor(
        applyRuleValue(
          attackerStats.ruleEvaluation,
          'damage:after-soak',
          dmgRoll.netSuccesses - soakedLevels
        )
      )
    );
    defenderChar = applyHealthDamage(defenderChar, finalWounds, damageType, {
      isSilver: pending.slot.isSilverAttack,
      tags: damageTags,
    });
    updatedCharacters = { ...updatedCharacters, [defenderChar.id]: defenderChar };
    logLines.push(
      `${attacker.name} dealt ${finalWounds} unsoaked ${damageType} wound(s) to ${defender.name}.`
    );
  }

  return advanceResolutionCursor(
    {
      ...combat,
      phase: pending.returnPhase,
      combatants: { ...combat.combatants, [defenderCombatantId]: defender },
      pendingAttack: null,
      combatLog: logLines,
    },
    updatedCharacters,
    emittedRolls
  );
}

// ============================================================================
// END OF ROUND: REGENERATION, BUFF TICKS, LOCK RESET, NEXT ROUND
// ============================================================================
export function advanceEndOfRound(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  rngD10: () => number = rollCsprngD10
): CombatStepOutcome {
  if (combat.phase !== 'END_OF_ROUND') {
    throw new Error('Can only advance to next round from END_OF_ROUND.');
  }

  const nextRound = combat.roundNumber + 1;
  const updatedCharacters: Record<string, W20CharacterState> = { ...characters };
  const updatedCombatants: Record<string, CombatantEntry> = {};
  const emittedRolls: CombatStepOutcome['emittedRolls'] = [];
  const logLines = [...combat.combatLog];

  for (const [id, entry] of Object.entries(combat.combatants)) {
    const baseChar = updatedCharacters[entry.characterId];
    if (!baseChar) throw new Error(`Character ${entry.characterId} not found.`);

    const regen = resolveCombatRegeneration(baseChar, true, rngD10);
    if (regen.rollResult) {
      emittedRolls.push({
        characterId: baseChar.id,
        label: 'Combat Regeneration',
        result: regen.rollResult,
      });
    }
    if (regen.healedLevels > 0) {
      logLines.push(`${entry.name} regenerated ${regen.healedLevels} wound level.`);
    }

    const tickedBuffs = regen.updatedChar.activeBuffs
      .map((b) => ({ ...b, remainingRounds: b.remainingRounds - 1 }))
      .filter((b) => b.remainingRounds > 0);

    const resetChar: W20CharacterState = {
      ...regen.updatedChar,
      activeBuffs: tickedBuffs,
      turnLocks: {
        hasSpentRageThisTurn: false,
        hasSpentGnosisThisTurn: false,
        hasSpentWillpowerThisTurn: false,
        ignoringWoundPenaltiesThisTurn: false,
        declaredExtraRageActions: 0,
      },
      stateVersion: regen.updatedChar.stateVersion + 1,
    };
    updatedCharacters[resetChar.id] = resetChar;

    const stats = computeEffectiveCharacterStats(resetChar);
    updatedCombatants[id] = {
      ...entry,
      preInitReady: false,
      declaredRageActions: 0,
      remainingRageActions: 0,
      spentGnosisPreInit: false,
      d10Roll: null,
      initiativeModifier: 0,
      initiativeScore: null,
      effectiveDexterity: stats.effectiveAttributes.dexterity,
      tiebreakOrder: 0,
      declarationMode: 'undeclared',
      normalSlots: [],
      isHolding: false,
      defensesUsedThisRound: 0,
      lastResolvedRagePass: undefined,
    };
  }

  logLines.push(`[Round ${nextRound}] New round started — Declare Rage / Spirit of the Fray.`);

  return {
    combat: {
      ...combat,
      roundNumber: nextRound,
      phase: 'PRE_ROUND_RAGE',
      combatants: updatedCombatants,
      declarationQueueAsc: [],
      resolutionQueueDesc: [],
      activeCursorCombatantId: null,
      currentPassNumber: 1,
      pendingAttack: null,
      combatLog: logLines,
    },
    characters: updatedCharacters,
    emittedRolls,
  };
}

// ============================================================================
// CURSOR ADVANCEMENT ACROSS NORMAL PASS -> RAGE PASSES -> END OF ROUND
// ============================================================================
function markActionConsumed(
  entry: CombatantEntry,
  slotId: string,
  effectivePass: number,
  currentPassNumber: number
): CombatantEntry {
  if (effectivePass === 1) {
    return {
      ...entry,
      normalSlots: entry.normalSlots.map((s) =>
        s.slotId === slotId ? { ...s, resolved: true } : s
      ),
    };
  }
  return {
    ...entry,
    remainingRageActions: Math.max(0, entry.remainingRageActions - 1),
    lastResolvedRagePass: currentPassNumber,
  };
}

function findNextEligibleResolver(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  passNumber: number
): string | null {
  for (const id of combat.resolutionQueueDesc) {
    const entry = combat.combatants[id];
    if (!entry) continue;
    const stats = computeEffectiveCharacterStats(characters[entry.characterId]);
    if (stats.isIncapacitated) continue;

    if (passNumber === 1) {
      const hasOffensiveOrUtilitySlot = entry.normalSlots.some(
        (s) =>
          !s.resolved &&
          !s.abortedToDefense &&
          !PASSIVE_NON_EXEC_CATEGORIES.has(s.category)
      );
      if (hasOffensiveOrUtilitySlot) return id;
    } else if (
      entry.remainingRageActions > 0 &&
      (entry.lastResolvedRagePass ?? 0) < passNumber
    ) {
      return id;
    }
  }
  return null;
}

function advanceResolutionCursor(
  combat: CombatEncounterState,
  characters: Record<string, W20CharacterState>,
  emittedRolls: CombatStepOutcome['emittedRolls']
): CombatStepOutcome {
  // 1. Always finish any unresolved Pass 1 slots (split-pool or interrupted hold slots)
  const nextInNormalPass = findNextEligibleResolver(combat, characters, 1);
  if (nextInNormalPass) {
    return {
      combat: {
        ...combat,
        phase: combat.currentPassNumber > 1 ? combat.phase : 'RESOLVE_NORMAL_PASS',
        activeCursorCombatantId: nextInNormalPass,
      },
      characters,
      emittedRolls,
    };
  }

  // 2. If currently in a Rage pass (Pass 2+), check remaining combatants in THIS pass first
  if (combat.currentPassNumber >= 2) {
    const nextInCurrentRagePass = findNextEligibleResolver(
      combat,
      characters,
      combat.currentPassNumber
    );
    if (nextInCurrentRagePass) {
      return {
        combat: {
          ...combat,
          phase: 'RESOLVE_RAGE_PASSES',
          activeCursorCombatantId: nextInCurrentRagePass,
        },
        characters,
        emittedRolls,
      };
    }
  }

  // 3. Advance to next Rage Extra Action pass (Pass 2..N, Highest -> Lowest each pass)
  const nextPass = combat.currentPassNumber + 1;
  const nextRageResolver = findNextEligibleResolver(combat, characters, nextPass);
  if (nextRageResolver) {
    return {
      combat: {
        ...combat,
        phase: 'RESOLVE_RAGE_PASSES',
        currentPassNumber: nextPass,
        activeCursorCombatantId: nextRageResolver,
      },
      characters,
      emittedRolls,
    };
  }

  // 4. All normal and Rage passes complete -> Transition to END_OF_ROUND
  return {
    combat: {
      ...combat,
      phase: 'END_OF_ROUND',
      activeCursorCombatantId: null,
    },
    characters,
    emittedRolls,
  };
}
