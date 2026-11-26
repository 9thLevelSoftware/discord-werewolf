import { AttributeKey, CanonicalAbilityKey, DamageType, GarouForm, W20CharacterState, W20MacroDefinition } from './types';
import { W20RollResult } from './diceResolver';

export type CombatPhase =
  | 'PRE_ROUND_RAGE' // Declare Rage extra actions / Spirit of the Fray Gnosis
  | 'ROLL_INITIATIVE' // Authoritative 1d10 + Dex + Wits + mods
  | 'DECLARE_REVERSE' // Cursor moves LOWEST -> HIGHEST initiative
  | 'RESOLVE_NORMAL_PASS' // Pass 1 (plus split-pool sub-actions), HIGHEST -> LOWEST
  | 'AWAITING_REACTION' // Paused mid-attack so target can Dodge/Parry/Block/Abort
  | 'RESOLVE_RAGE_PASSES' // Extra Rage actions (Pass 2..N), HIGHEST -> LOWEST
  | 'END_OF_ROUND'; // Regeneration ticks & cleanup before next round

export type ActionCategory =
  | 'melee_attack'
  | 'brawl_attack'
  | 'ranged_attack'
  | 'gift_or_rite'
  | 'shift_form'
  | 'defend_dodge'
  | 'defend_parry'
  | 'defend_block'
  | 'full_defense' // Dedicates entire normal turn to defense (-1 cumulative die per defense)
  | 'hold' // Delays action to interrupt later in resolution
  | 'move_or_other';

export interface SubActionSlot {
  slotId: string;
  category: ActionCategory;
  label: string; // e.g. "Claw Slash vs. Pentex Guard A"
  targetCombatantId?: string;
  attributeKey?: AttributeKey;
  abilityKey?: CanonicalAbilityKey | string;
  allocatedDice?: number; // Required when splitting smallest pool across multiple actions
  baseDifficulty: number; // e.g. 6 for Claws, 5 for Bite/Dodge
  weaponId?: string;
  weaponDamageBonus?: number; // e.g. +2 for Claws, +3 for Grand Klaive
  damageType?: Exclude<DamageType, 'none'>;
  isSilverAttack?: boolean;
  targetForm?: GarouForm; // Used if category === 'shift_form'
  macro?: W20MacroDefinition; // Optional declarative Gift/Fetish macro for gift_or_rite
  resolved: boolean;
  abortedToDefense: boolean;
}

export interface DeclaredActionInput {
  mode: 'single' | 'split_pool' | 'full_defense' | 'hold';
  slots: Omit<SubActionSlot, 'slotId' | 'resolved' | 'abortedToDefense'>[];
}

export type ReactionChoice =
  | { strategy: 'take_hit_soak_only' }
  | {
      strategy: 'use_queued_defense'; // Uses pre-declared Dodge/Parry/Block or Full Defense
      defenseType: 'defend_dodge' | 'defend_parry' | 'defend_block';
    }
  | {
      strategy: 'willpower_abort_to_defense'; // Spends 1 Willpower to abort unspent Pass 1 slot
      defenseType: 'defend_dodge' | 'defend_parry' | 'defend_block';
    }
  | {
      strategy: 'burn_rage_action_to_defend'; // Consumes 1 banked Rage extra action immediately
      defenseType: 'defend_dodge' | 'defend_parry' | 'defend_block';
    };

export interface PendingAttackContext {
  returnPhase: 'RESOLVE_NORMAL_PASS' | 'RESOLVE_RAGE_PASSES';
  attackerCombatantId: string;
  defenderCombatantId: string;
  slot: SubActionSlot;
  attackRoll: W20RollResult;
}

export interface CombatantEntry {
  combatantId: string; // Unique encounter slot ID
  characterId: string;
  name: string;
  isNpc: boolean;
  hasSpiritOfTheFray: boolean; // Passive +10 Initiative

  // Pre-initiative declarations
  preInitReady: boolean;
  declaredRageActions: number; // Total extra Rage actions purchased this round
  remainingRageActions: number; // Decrements as Rage passes resolve or burn on defense
  spentGnosisPreInit: boolean;

  // Initiative metrics & deterministic tie-breakers
  d10Roll: number | null;
  initiativeModifier: number; // Effective Dex + Wits + Spirit of the Fray + buffs + woundPenalty
  initiativeScore: number | null;
  effectiveDexterity: number;
  tiebreakOrder: number; // CSPRNG tiebreak assigned once per round if Dex+Wits & Dex match

  // Action economy for current round
  declarationMode: 'undeclared' | 'single' | 'split_pool' | 'full_defense' | 'hold';
  normalSlots: SubActionSlot[]; // Pass 1 action (or N split-pool sub-actions)
  isHolding: boolean;
  defensesUsedThisRound: number; // Tracks cumulative -1 die penalty on Full Defense
  lastResolvedRagePass?: number; // Prevents same combatant acting twice in one Rage pass
}

export interface CombatEncounterState {
  encounterId: string;
  roundNumber: number;
  phase: CombatPhase;
  combatants: Record<string, CombatantEntry>;

  // Ordered queues of combatantIds
  declarationQueueAsc: string[]; // LOWEST -> HIGHEST initiative
  resolutionQueueDesc: string[]; // HIGHEST -> LOWEST initiative
  activeCursorCombatantId: string | null;
  currentPassNumber: number; // 1 = Normal/Split pass, 2+ = Rage passes

  pendingAttack: PendingAttackContext | null;
  combatLog: string[];
}

/**
 * Scrubbed view sent to clients (hides unrevealed NPC Rage declarations during PRE_ROUND_RAGE)
 */
export interface CombatEncounterView extends Omit<CombatEncounterState, 'combatants'> {
  combatants: Record<
    string,
    Omit<CombatantEntry, 'declaredRageActions'> & {
      declaredRageActions: number | 'hidden';
    }
  >;
}

export interface CombatParticipantSeed {
  character: W20CharacterState;
  combatantId?: string;
  hasSpiritOfTheFray?: boolean;
}
