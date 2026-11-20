import { describe, expect, it } from 'vitest';
import {
  advanceEndOfRound,
  CombatStepOutcome,
  createCombatEncounter,
  declarePreInitiativeResources,
  executeActiveCombatSlot,
  forceStorytellerOverride,
  resolveDefenderReactionAndDamage,
  rollRoundInitiative,
  submitReverseDeclaration,
  triggerHoldInterrupt,
} from '../combatMachine';
import { CANONICAL_W20_PRESETS } from '../macros';
import { makeTestCharacter, seqRng } from './testHelpers';

describe('W20 Reverse Initiative & Combat State Machine', () => {
  it('enforces pre-init Rage cap ceil(perm/2), Spirit of the Fray Golden Rule, and 4-tier initiative tiebreaks', () => {
    const ahroun = makeTestCharacter({
      id: 'ahroun',
      name: 'Ahroun',
      rage: { permanent: 5, temporary: 5 }, // ceil(5/2) = 3 max extra actions
      gnosis: { permanent: 3, temporary: 3 },
      baseAttributes: {
        strength: 3,
        dexterity: 4,
        stamina: 3,
        charisma: 2,
        manipulation: 2,
        appearance: 2,
        perception: 3,
        intelligence: 2,
        wits: 3,
      },
      macros: [CANONICAL_W20_PRESETS.spirit_of_the_fray],
    });
    const fomor = makeTestCharacter({
      id: 'fomor',
      name: 'Fomor',
      isNpc: true,
      rage: { permanent: 4, temporary: 4 },
      baseAttributes: {
        strength: 4,
        dexterity: 2,
        stamina: 3,
        charisma: 1,
        manipulation: 1,
        appearance: 1,
        perception: 2,
        intelligence: 2,
        wits: 3,
      },
    });

    const encounter = createCombatEncounter('enc-1', [ahroun, fomor]);
    const chars = { [ahroun.id]: ahroun, [fomor.id]: fomor };

    // Cannot exceed ceil(5/2) = 3 Rage actions
    expect(() =>
      declarePreInitiativeResources(encounter, chars, 'ahroun', 4, false, false)
    ).toThrow(/exceed 3/);

    // Golden Rule: Cannot spend Rage and Gnosis (Spirit of the Fray) together
    expect(() =>
      declarePreInitiativeResources(encounter, chars, 'ahroun', 1, true, false)
    ).toThrow(/Golden Rule/);

    // Ahroun spends 1 Gnosis on Spirit of the Fray (+10 passive +10 active = +20)
    const step1 = declarePreInitiativeResources(encounter, chars, 'ahroun', 0, true, false);
    expect(step1.characters.ahroun.gnosis.temporary).toBe(2);
    expect(step1.characters.ahroun.turnLocks.hasSpentGnosisThisTurn).toBe(true);

    // Fomor spends 2 Rage for 2 extra actions
    const step2 = declarePreInitiativeResources(
      step1.combat,
      step1.characters,
      'fomor',
      2,
      false,
      false
    );
    expect(step2.combat.combatants.fomor.declaredRageActions).toBe(2);

    // Roll initiative: Ahroun (d10=5 + Dex4+Wits3+20 = 32), Fomor (d10=8 + Dex2+Wits3 = 13)
    const rolled = rollRoundInitiative(
      step2.combat,
      step2.characters,
      seqRng([5, 3, 7, 8, 2, 4])
    );
    expect(rolled.combat.phase).toBe('DECLARE_REVERSE');
    // Lowest -> Highest in declarationQueueAsc
    expect(rolled.combat.declarationQueueAsc).toEqual(['fomor', 'ahroun']);
    expect(rolled.combat.resolutionQueueDesc).toEqual(['ahroun', 'fomor']);
    expect(rolled.combat.activeCursorCombatantId).toBe('fomor');

    // Test tiebreaker 2 & 3 (Equal score, higher Init mod / Dex wins)
    const fast = makeTestCharacter({
      id: 'fast',
      name: 'Fast',
      baseAttributes: { dexterity: 4, wits: 3 } as never,
    });
    const slow = makeTestCharacter({
      id: 'slow',
      name: 'Slow',
      baseAttributes: { dexterity: 2, wits: 3 } as never,
    });
    const tieEnc = createCombatEncounter('enc-tie', [slow, fast]);
    // slow rolls 7 + 5 = 12; fast rolls 5 + 7 = 12 (equal score 12, fast has higher mod 7 > 5)
    const tieRolled = rollRoundInitiative(
      tieEnc,
      { fast, slow },
      seqRng([7, 1, 1, 5, 1, 1])
    );
    expect(tieRolled.combat.resolutionQueueDesc).toEqual(['fast', 'slow']);
  });

  it('enforces reverse declaration order, smallest-pool split validation, full defense penalty, and Rage passes', () => {
    const hero = makeTestCharacter({
      id: 'hero',
      name: 'Hero',
      activeForm: 'crinos',
      baseAttributes: { dexterity: 4, wits: 4, strength: 3, stamina: 3 } as never,
      abilities: { brawl: 3, athletics: 3 },
      rage: { permanent: 4, temporary: 4 },
    });
    const villain = makeTestCharacter({
      id: 'villain',
      name: 'Villain',
      isNpc: true,
      activeForm: 'glabro',
      baseAttributes: { dexterity: 2, wits: 2, strength: 3, stamina: 3 } as never,
      abilities: { brawl: 2, athletics: 2 },
      rage: { permanent: 2, temporary: 2 },
    });

    let state: CombatStepOutcome = {
      combat: createCombatEncounter('enc-2', [hero, villain]),
      characters: { hero, villain },
      emittedRolls: [],
    };

    state = declarePreInitiativeResources(state.combat, state.characters, 'hero', 1, false, false);
    state = declarePreInitiativeResources(state.combat, state.characters, 'villain', 0, false, false);
    // Hero Crinos Dex=5+Wits=4=9; Villain Glabro Dex=2+Wits=2=4
    state = rollRoundInitiative(state.combat, state.characters, seqRng([5, 1, 1, 5, 1, 1]));

    expect(state.combat.declarationQueueAsc).toEqual(['villain', 'hero']);

    // Hero cannot declare before slower Villain
    expect(() =>
      submitReverseDeclaration(state.combat, state.characters, 'hero', {
        mode: 'single',
        slots: [{ category: 'brawl_attack', label: 'Claw', targetCombatantId: 'villain', baseDifficulty: 6 }],
      })
    ).toThrow(/slower combatants/);

    // Villain declares Full Defense
    state = submitReverseDeclaration(state.combat, state.characters, 'villain', {
      mode: 'full_defense',
      slots: [{ category: 'full_defense', label: 'Full Defense', baseDifficulty: 6 }],
    });
    expect(state.combat.activeCursorCombatantId).toBe('hero');

    // Hero tries invalid split_pool: smallest pool is Crinos Dex(5)+Brawl(3)=8, allocating 5+4=9 fails
    expect(() =>
      submitReverseDeclaration(state.combat, state.characters, 'hero', {
        mode: 'split_pool',
        slots: [
          {
            category: 'brawl_attack',
            label: 'Claw 1',
            targetCombatantId: 'villain',
            attributeKey: 'dexterity',
            abilityKey: 'brawl',
            allocatedDice: 5,
            baseDifficulty: 6,
            weaponDamageBonus: 2,
            damageType: 'aggravated',
          },
          {
            category: 'brawl_attack',
            label: 'Claw 2',
            targetCombatantId: 'villain',
            attributeKey: 'dexterity',
            abilityKey: 'brawl',
            allocatedDice: 4,
            baseDifficulty: 6,
            weaponDamageBonus: 2,
            damageType: 'aggravated',
          },
        ],
      })
    ).toThrow(/Cannot allocate 9 dice; smallest dice pool across declared actions is 8/);

    // Hero submits valid 4 + 4 split_pool
    state = submitReverseDeclaration(state.combat, state.characters, 'hero', {
      mode: 'split_pool',
      slots: [
        {
          category: 'brawl_attack',
          label: 'Claw 1',
          targetCombatantId: 'villain',
          attributeKey: 'dexterity',
          abilityKey: 'brawl',
          allocatedDice: 4,
          baseDifficulty: 6,
          weaponDamageBonus: 2,
          damageType: 'aggravated',
        },
        {
          category: 'brawl_attack',
          label: 'Claw 2',
          targetCombatantId: 'villain',
          attributeKey: 'dexterity',
          abilityKey: 'brawl',
          allocatedDice: 4,
          baseDifficulty: 6,
          weaponDamageBonus: 2,
          damageType: 'aggravated',
        },
      ],
    });
    expect(state.combat.phase).toBe('RESOLVE_NORMAL_PASS');
    expect(state.combat.activeCursorCombatantId).toBe('hero');

    // Slot 1: Hero rolls 4 dice -> [9, 8, 7, 3] = 3 successes -> pauses in AWAITING_REACTION
    state = executeActiveCombatSlot(state.combat, state.characters, 'hero', {}, seqRng([9, 8, 7, 3]));
    expect(state.combat.phase).toBe('AWAITING_REACTION');
    expect(state.combat.pendingAttack?.attackRoll.netSuccesses).toBe(3);

    // Defender wins ties: Villain Full Defense rolls Dex(2)+Ath(2)=4 dice -> [6, 7, 8, 2] = 3 successes -> deflected!
    state = resolveDefenderReactionAndDamage(
      state.combat,
      state.characters,
      'villain',
      { strategy: 'use_queued_defense', defenseType: 'defend_dodge' },
      seqRng([6, 7, 8, 2])
    );
    expect(state.combat.combatants.villain.defensesUsedThisRound).toBe(1);
    expect(state.characters.villain.health.boxes.every((b) => b === 'none')).toBe(true);
    expect(state.combat.phase).toBe('RESOLVE_NORMAL_PASS');
    expect(state.combat.activeCursorCombatantId).toBe('hero'); // Hero's 2nd split slot!

    // Slot 2: Hero rolls 4 dice -> [9, 8, 7, 6] = 4 successes
    state = executeActiveCombatSlot(state.combat, state.characters, 'hero', {}, seqRng([9, 8, 7, 6]));
    expect(state.combat.phase).toBe('AWAITING_REACTION');

    // Villain Full Defense 2nd time has -1 cumulative penalty (4 - 1 = 3 dice) -> [6, 2, 2] = 1 success -> 3 net hit successes -> +2 extra damage dice
    // Hero Crinos Str = 3 + 4 = 7 + Claw(2) + Extra(2) = 11 damage dice!
    // Let's supply 11 damage dice (5 successes) + 5 Glabro Stamina soak dice (1 success) => 4 unsoaked Aggravated wounds
    state = resolveDefenderReactionAndDamage(
      state.combat,
      state.characters,
      'villain',
      { strategy: 'use_queued_defense', defenseType: 'defend_dodge' },
      seqRng([
        6, 2, 2, // 3 dodge dice -> 1 success
        8, 8, 8, 8, 8, 2, 2, 2, 2, 2, 2, // 11 damage dice -> 5 successes
        6, 2, 2, 2, 2, // 5 soak dice -> 1 success
      ])
    );
    expect(state.characters.villain.health.boxes.slice(0, 4)).toEqual([
      'aggravated',
      'aggravated',
      'aggravated',
      'aggravated',
    ]);
    // Now Pass 1 is complete; transitions to RESOLVE_RAGE_PASSES Pass 2 for Hero
    expect(state.combat.phase).toBe('RESOLVE_RAGE_PASSES');
    expect(state.combat.currentPassNumber).toBe(2);
    expect(state.combat.activeCursorCombatantId).toBe('hero');

    // Rage pass uses full unsplit Dex(5)+Brawl(3)=8 dice; Hero misses on all 2s -> transitions to END_OF_ROUND
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'hero',
      {},
      seqRng([2, 2, 2, 2, 2, 2, 2, 2])
    );
    expect(state.combat.phase).toBe('END_OF_ROUND');
    expect(state.combat.combatants.hero.remainingRageActions).toBe(0);
  });

  it('handles Hold interrupts, utility slots (shift_form, gift_or_rite, move_or_other), Willpower abort, Rage burn defense, Silver soak, and advanceEndOfRound', () => {
    const shifter = makeTestCharacter({
      id: 'shifter',
      name: 'Shifter',
      breed: 'homid',
      activeForm: 'homid', // Homid in Homid form CAN soak silver!
      baseAttributes: { dexterity: 2, wits: 2, stamina: 4 } as never,
      abilities: { primal_urge: 3, athletics: 2, melee: 3 },
      rage: { permanent: 4, temporary: 4 },
      willpower: { permanent: 5, temporary: 5 },
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'none', 'none', 'none', 'none', 'none', 'none'],
      },
    });
    const hunter = makeTestCharacter({
      id: 'hunter',
      name: 'Silver Hunter',
      isNpc: true,
      breed: 'homid',
      activeForm: 'glabro',
      baseAttributes: { dexterity: 4, wits: 4, strength: 2 } as never,
      abilities: { melee: 3, athletics: 2 },
      rage: { permanent: 2, temporary: 2 },
    });

    let state: CombatStepOutcome = {
      combat: createCombatEncounter('enc-3', [shifter, hunter]),
      characters: { shifter, hunter },
      emittedRolls: [],
    };

    state = declarePreInitiativeResources(state.combat, state.characters, 'shifter', 1, false, false);
    state = declarePreInitiativeResources(state.combat, state.characters, 'hunter', 0, false, false);
    // Shifter has -1 wound penalty (Hurt) -> Init mod = 2+2-1 = 3; Hunter = 4+4 = 8
    state = rollRoundInitiative(state.combat, state.characters, seqRng([5, 1, 1, 5, 1, 1]));
    expect(state.combat.declarationQueueAsc).toEqual(['shifter', 'hunter']);

    // Shifter holds
    state = submitReverseDeclaration(state.combat, state.characters, 'shifter', {
      mode: 'hold',
      slots: [{ category: 'hold', label: 'Hold', baseDifficulty: 6 }],
    });
    // Hunter declares Silver Melee Attack
    state = submitReverseDeclaration(state.combat, state.characters, 'hunter', {
      mode: 'single',
      slots: [
        {
          category: 'melee_attack',
          label: 'Silver Dagger',
          targetCombatantId: 'shifter',
          attributeKey: 'dexterity',
          abilityKey: 'melee',
          baseDifficulty: 6,
          weaponDamageBonus: 2,
          damageType: 'aggravated',
          isSilverAttack: true,
        },
      ],
    });
    expect(state.combat.phase).toBe('RESOLVE_NORMAL_PASS');
    expect(state.combat.activeCursorCombatantId).toBe('hunter');

    // Shifter triggers Hold Interrupt to shift to Crinos!
    state = triggerHoldInterrupt(state.combat, state.characters, 'shifter', {
      mode: 'single',
      slots: [
        {
          category: 'shift_form',
          label: 'Shift to Crinos',
          targetForm: 'crinos',
          baseDifficulty: 6,
        },
      ],
    });
    expect(state.combat.activeCursorCombatantId).toBe('shifter');
    expect(state.combat.combatants.shifter.isHolding).toBe(false);

    // Execute utility slot shift_form (Sta 4 + Primal-Urge 3 - 1 wound = 6 dice, diff 6)
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'shifter',
      {},
      seqRng([8, 2, 2, 2, 2, 2])
    );
    expect(state.characters.shifter.activeForm).toBe('crinos');
    expect(state.combat.activeCursorCombatantId).toBe('hunter');

    // Hunter attacks with Willpower spend
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'hunter',
      { spendWillpowerOnRoll: true },
      seqRng([8, 2, 2, 2, 2, 2, 2]) // 1 rolled + 1 WP = 2 successes
    );
    expect(state.characters.hunter.willpower.temporary).toBe(3);
    expect(state.combat.phase).toBe('AWAITING_REACTION');

    // Shifter already spent Pass 1 slot -> Willpower abort must throw
    expect(() =>
      resolveDefenderReactionAndDamage(state.combat, state.characters, 'shifter', {
        strategy: 'willpower_abort_to_defense',
        defenseType: 'defend_dodge',
      })
    ).toThrow(/No unspent Pass 1 action left/);

    // Shifter burns banked Rage action to Dodge, fails (0 successes vs 2 hit -> 1 extra hit die)
    // Hunter Str(4) + Dagger(2) + Extra(1) = 7 dmg dice -> 3 agg successes; Shifter is Homid-born in Crinos so CANNOT soak silver!
    state = resolveDefenderReactionAndDamage(
      state.combat,
      state.characters,
      'shifter',
      { strategy: 'burn_rage_action_to_defend', defenseType: 'defend_dodge' },
      seqRng([
        2, 2, 2, 2, 2, // Dodge fails
        8, 8, 8, 2, 2, 2, 2, // 7 damage dice -> 3 successes; no soak allowed!
      ])
    );
    expect(state.combat.combatants.shifter.remainingRageActions).toBe(0);
    // 3 new aggravated + 1 existing lethal -> ['aggravated', 'aggravated', 'aggravated', 'lethal', 'none', 'none', 'none']
    expect(state.characters.shifter.health.boxes.slice(0, 4)).toEqual([
      'aggravated',
      'aggravated',
      'aggravated',
      'lethal',
    ]);
    expect(state.combat.phase).toBe('END_OF_ROUND');

    // Advance End of Round: Shifter in Crinos rolls Stamina (4+3=7) Diff 8 -> heals that 1 Lethal wound!
    const nextRound = advanceEndOfRound(
      state.combat,
      state.characters,
      seqRng([9, 2, 2, 2, 2, 2, 2])
    );
    expect(nextRound.combat.roundNumber).toBe(2);
    expect(nextRound.combat.phase).toBe('PRE_ROUND_RAGE');
    expect(nextRound.characters.shifter.health.boxes).toEqual([
      'aggravated',
      'aggravated',
      'aggravated',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(nextRound.characters.shifter.turnLocks.hasSpentRageThisTurn).toBe(false);
  });

  it('supports Storyteller overrides across phases and gift_or_rite / move_or_other utility slots', () => {
    const c1 = makeTestCharacter({
      id: 'c1',
      name: 'C1',
      gnosis: { permanent: 4, temporary: 4 },
      baseAttributes: { dexterity: 4, wits: 4, stamina: 3 } as never,
      abilities: { survival: 3 },
    });
    const c2 = makeTestCharacter({
      id: 'c2',
      name: 'C2',
      baseAttributes: { dexterity: 2, wits: 2 } as never,
    });

    let state: CombatStepOutcome = {
      combat: createCombatEncounter('enc-st', [c1, c2]),
      characters: { c1, c2 },
      emittedRolls: [],
    };

    // ST override during PRE_ROUND_RAGE rolls initiative automatically
    state = forceStorytellerOverride(state.combat, state.characters, 'Start round', seqRng([5, 1, 1, 5, 1, 1]));
    expect(state.combat.phase).toBe('DECLARE_REVERSE');
    expect(state.combat.activeCursorCombatantId).toBe('c2');

    // ST override during DECLARE_REVERSE defaults AFK c2 to hold
    state = forceStorytellerOverride(state.combat, state.characters, 'AFK c2');
    expect(state.combat.activeCursorCombatantId).toBe('c1');

    // c1 declares gift_or_rite (Luna's Armor) + move_or_other via split_pool
    state = submitReverseDeclaration(state.combat, state.characters, 'c1', {
      mode: 'split_pool',
      slots: [
        {
          category: 'gift_or_rite',
          label: "Luna's Armor",
          attributeKey: 'stamina',
          abilityKey: 'survival',
          allocatedDice: 4,
          baseDifficulty: 6,
          macro: CANONICAL_W20_PRESETS.lunas_armor,
        },
        {
          category: 'move_or_other',
          label: 'Reposition behind cover',
          attributeKey: 'dexterity',
          abilityKey: 'athletics',
          allocatedDice: 2,
          baseDifficulty: 6,
        },
      ],
    });
    expect(state.combat.phase).toBe('RESOLVE_NORMAL_PASS');

    // Execute gift_or_rite slot
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'c1',
      {},
      seqRng([8, 9, 7, 2, 2, 2]) // 3 successes -> +3 Soak buff
    );
    expect(state.characters.c1.gnosis.temporary).toBe(3);
    expect(state.characters.c1.activeBuffs).toHaveLength(1);
    expect(state.combat.phase).toBe('RESOLVE_NORMAL_PASS');

    // Execute move_or_other slot -> advances to END_OF_ROUND
    state = executeActiveCombatSlot(state.combat, state.characters, 'c1');
    expect(state.combat.phase).toBe('END_OF_ROUND');
  });

  it('allows Willpower abort to defense and skips incapacitated combatants in initiative', () => {
    const fast = makeTestCharacter({
      id: 'fast',
      name: 'Fast',
      baseAttributes: { dexterity: 4, wits: 4, strength: 3 } as never,
      abilities: { brawl: 3 },
    });
    const defender = makeTestCharacter({
      id: 'defender',
      name: 'Defender',
      baseAttributes: { dexterity: 2, wits: 2 } as never,
      abilities: { athletics: 3 },
      willpower: { permanent: 4, temporary: 4 },
    });
    const downed = makeTestCharacter({
      id: 'downed',
      name: 'Downed',
      health: {
        bonusBruisedBoxes: 0,
        boxes: ['lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'lethal', 'lethal'],
      },
    });

    let state: CombatStepOutcome = {
      combat: createCombatEncounter('enc-abort', [fast, defender, downed]),
      characters: { fast, defender, downed },
      emittedRolls: [],
    };
    state = rollRoundInitiative(state.combat, state.characters, seqRng([5, 1, 1, 5, 1, 1]));
    expect(state.combat.declarationQueueAsc).toEqual(['defender', 'fast']);
    expect(state.combat.combatants.downed.initiativeScore).toBe(-99);

    state = submitReverseDeclaration(state.combat, state.characters, 'defender', {
      mode: 'single',
      slots: [
        {
          category: 'brawl_attack',
          label: 'Counter Punch',
          targetCombatantId: 'fast',
          attributeKey: 'dexterity',
          abilityKey: 'brawl',
          baseDifficulty: 6,
          damageType: 'bashing',
        },
      ],
    });
    state = submitReverseDeclaration(state.combat, state.characters, 'fast', {
      mode: 'single',
      slots: [
        {
          category: 'brawl_attack',
          label: 'Punch',
          targetCombatantId: 'defender',
          attributeKey: 'dexterity',
          abilityKey: 'brawl',
          baseDifficulty: 6,
          damageType: 'bashing',
        },
      ],
    });

    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'fast',
      {},
      seqRng([8, 2, 2, 2, 2, 2, 2]) // 1 hit success
    );
    expect(state.combat.phase).toBe('AWAITING_REACTION');

    // Defender aborts Pass 1 action using 1 Willpower and dodges with 2 successes -> deflects & skips defender's aborted Pass 1 slot
    state = resolveDefenderReactionAndDamage(
      state.combat,
      state.characters,
      'defender',
      { strategy: 'willpower_abort_to_defense', defenseType: 'defend_dodge' },
      seqRng([8, 9, 2, 2, 2])
    );
    expect(state.characters.defender.willpower.temporary).toBe(3);
    expect(state.combat.combatants.defender.normalSlots[0].abortedToDefense).toBe(true);
    expect(state.combat.phase).toBe('END_OF_ROUND');
  });

  it('resolves ranged_attack (Diff 8 dodge, weaponDamageBonus + extra hit dice) and multi-pass Rage Pass 2 & Pass 3 order', () => {
    const gunner = makeTestCharacter({
      id: 'gunner',
      name: 'Gunner',
      rage: { permanent: 4, temporary: 4 }, // max 2 Rage actions
      baseAttributes: { dexterity: 4, wits: 4, strength: 2 } as never,
      abilities: { firearms: 3, athletics: 2 },
    });
    const target = makeTestCharacter({
      id: 'target',
      name: 'Target',
      rage: { permanent: 2, temporary: 2 }, // 1 Rage action
      baseAttributes: { dexterity: 2, wits: 2, stamina: 3 } as never,
      abilities: { athletics: 3, brawl: 2 },
      activeBuffs: [
        {
          sourceMacroId: 'short-buff',
          label: 'Short Buff',
          effect: { type: 'buff_initiative_flat', bonus: 1, durationRounds: 1 },
          appliedSuccesses: 1,
          remainingRounds: 1,
        },
      ],
    });

    let state: CombatStepOutcome = {
      combat: createCombatEncounter('enc-ranged', [gunner, target]),
      characters: { gunner, target },
      emittedRolls: [],
    };
    state = declarePreInitiativeResources(state.combat, state.characters, 'gunner', 2, false, false);
    state = declarePreInitiativeResources(state.combat, state.characters, 'target', 0, false, false);
    state = rollRoundInitiative(state.combat, state.characters, seqRng([5, 1, 1, 5, 1, 1]));
    expect(state.combat.resolutionQueueDesc).toEqual(['gunner', 'target']);

    state = submitReverseDeclaration(state.combat, state.characters, 'target', {
      mode: 'single',
      slots: [
        {
          category: 'defend_dodge',
          label: 'Dodge Gunfire',
          baseDifficulty: 8,
        },
      ],
    });
    state = submitReverseDeclaration(state.combat, state.characters, 'gunner', {
      mode: 'single',
      slots: [
        {
          category: 'ranged_attack',
          label: 'Silver Revolver',
          targetCombatantId: 'target',
          attributeKey: 'dexterity',
          abilityKey: 'firearms',
          baseDifficulty: 6,
          weaponDamageBonus: 4,
          damageType: 'lethal',
        },
      ],
    });

    // Gunner hits with 3 successes
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'gunner',
      {},
      seqRng([8, 8, 8, 2, 2, 2, 2])
    );
    expect(state.combat.phase).toBe('AWAITING_REACTION');

    // Target uses queued dodge -> Diff 8 against ranged! Rolls [7, 7, 8, 2, 2] -> only 1 success (7s fail at diff 8!)
    // Net hit = 3 - 1 = 2 -> +1 extra damage die -> 4 + 1 = 5 damage dice -> 3 lethal -> 3 soak dice (0 successes) -> 3 lethal
    state = resolveDefenderReactionAndDamage(
      state.combat,
      state.characters,
      'target',
      { strategy: 'use_queued_defense', defenseType: 'defend_dodge' },
      seqRng([
        7, 7, 8, 2, 2, // 5 dodge dice at diff 8 -> 1 success
        8, 8, 8, 2, 2, // 5 damage dice -> 3 successes
        2, 2, 2, // 3 soak dice -> 0 successes
      ])
    );
    expect(state.emittedRolls[0].result.clampedDifficulty).toBe(8);
    expect(state.characters.target.health.boxes.slice(0, 3)).toEqual([
      'lethal',
      'lethal',
      'lethal',
    ]);

    // Pass 1 done -> Pass 2 (Gunner acts in Pass 2, then Pass 3!)
    expect(state.combat.phase).toBe('RESOLVE_RAGE_PASSES');
    expect(state.combat.currentPassNumber).toBe(2);
    expect(state.combat.activeCursorCombatantId).toBe('gunner');

    // Gunner misses in Pass 2 -> advances to Pass 3
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'gunner',
      {},
      seqRng([2, 2, 2, 2, 2, 2, 2])
    );
    expect(state.combat.phase).toBe('RESOLVE_RAGE_PASSES');
    expect(state.combat.currentPassNumber).toBe(3);
    expect(state.combat.activeCursorCombatantId).toBe('gunner');

    // Gunner misses Pass 3 -> END_OF_ROUND
    state = executeActiveCombatSlot(
      state.combat,
      state.characters,
      'gunner',
      {},
      seqRng([2, 2, 2, 2, 2, 2, 2])
    );
    expect(state.combat.phase).toBe('END_OF_ROUND');

    // advanceEndOfRound ticks off 1-round buff on target
    const r2 = advanceEndOfRound(state.combat, state.characters, seqRng([2, 2, 2]));
    expect(r2.characters.target.activeBuffs).toHaveLength(0);
    expect(r2.combat.roundNumber).toBe(2);
  });
});
