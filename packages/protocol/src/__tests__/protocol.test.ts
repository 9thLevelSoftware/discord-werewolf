import { describe, expect, it } from 'vitest';
import { createBlankUserCharacterSheet, type W20CharacterState } from '@w20-vtt/core';
import {
  ClientEnvelope,
  ClientSeatSyncItem,
  ParticipantRole,
  RoomSnapshotView,
  ServerEnvelope,
  ServerEvent,
  TableParticipant,
  W20MacroDefinitionSchema,
  W20UserCharacterSheetSchema,
  parseClientEnvelope,
} from '../index';

function makeEnvelope(command: ClientEnvelope['command'], expectedSeq = 1): string {
  const envelope: ClientEnvelope = {
    reqId: 'req-123',
    expectedSeq,
    sentAt: 1_700_000_000_000,
    command,
  };
  return JSON.stringify(envelope);
}

describe('@w20-vtt/protocol parseClientEnvelope & schemas', () => {
  it('accepts a valid HELLO_AUTH envelope with null characterId and lastSeenSeq', () => {
    const raw = makeEnvelope(
      {
        type: 'HELLO_AUTH',
        sessionJwt: 'jwt.token.value',
        campaignId: 'camp-1',
        characterId: null,
        lastSeenSeq: null,
      },
      0
    );

    const parsed = parseClientEnvelope(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.command.type).toBe('HELLO_AUTH');
      if (parsed.data.command.type === 'HELLO_AUTH') {
        expect(parsed.data.command.sessionJwt).toBe('jwt.token.value');
      }
    }
  });

  it('validates private Storyteller pools without accepting client dice faces', () => {
    const command = {
      type: 'ST_ROLL_TABLE_POOL',
      count: 30,
      difficulty: 6,
      rollClientId: 'pool-1',
    } as const;
    expect(parseClientEnvelope(makeEnvelope(command))).toMatchObject({ success: true });
    expect(parseClientEnvelope(makeEnvelope({ ...command, count: 0 }))).toMatchObject({ success: false });
    expect(parseClientEnvelope(makeEnvelope({ ...command, count: 31 }))).toMatchObject({ success: false });
    expect(parseClientEnvelope(makeEnvelope({ ...command, difficulty: 11 }))).toMatchObject({ success: false });

    const suppliedFaces = { ...command, physicalDiceValues: Array.from({ length: 30 }, () => 10) };
    expect(parseClientEnvelope(makeEnvelope(suppliedFaces))).toMatchObject({ success: false });
  });

  it('requires a named Storyteller initiative roll and a reveal entry id', () => {
    const command = {
      type: 'ST_ROLL_TABLE_INITIATIVE',
      rollClientId: 'initiative-1',
      label: '  First guard  ',
      modifier: -2,
    } as const;
    expect(parseClientEnvelope(makeEnvelope(command))).toMatchObject({
      success: true,
      data: { command: { label: 'First guard', modifier: -2 } },
    });
    expect(parseClientEnvelope(makeEnvelope({ ...command, label: '  ' }))).toMatchObject({ success: false });
    expect(parseClientEnvelope(makeEnvelope({ ...command, modifier: 51 }))).toMatchObject({ success: false });
    expect(parseClientEnvelope(makeEnvelope({
      type: 'ST_REVEAL_TABLE_INITIATIVE', entryId: 'initiative-1',
    }))).toMatchObject({ success: true });
    expect(parseClientEnvelope(makeEnvelope({
      type: 'ST_REVEAL_TABLE_INITIATIVE', entryId: '',
    }))).toMatchObject({ success: false });
  });

  it('accepts all 36 ClientCommand variants with strict schema validation', () => {
    const sampleMacro = {
      id: 'macro-razor-claws',
      name: 'Razor Claws',
      category: 'gift' as const,
      rankOrLevel: 1,
      requiredForms: ['crinos', 'hispo', 'lupus'] as Array<'crinos' | 'hispo' | 'lupus'>,
      costs: { rage: 1, gnosis: 0, willpower: 0 },
      pool: { kind: 'no_roll_instant' as const },
      difficulty: { kind: 'static' as const, value: 6 },
      effects: [{ type: 'buff_claw_damage' as const, bonusDice: 2, durationRounds: 10 }],
      summary: 'Hone claws for +2 Aggravated damage dice.',
    };

    const validCommands: Array<ClientEnvelope['command']> = [
      {
        type: 'HELLO_AUTH',
        sessionJwt: 'jwt-1',
        campaignId: 'camp-1',
        characterId: 'char-1',
        lastSeenSeq: 5,
      },
      { type: 'PING' },
      { type: 'VOICE_SPEAKING_STATE', isSpeaking: true },
      { type: 'TOKEN_MOVE', tokenId: 'tok-1', x: 140, y: 210, waypoints: [{ x: 70, y: 140 }] },
      {
        type: 'CHARACTER_SHIFT_FORM',
        characterId: 'char-1',
        targetForm: 'crinos',
        method: 'instant_rage_spend',
      },
      { type: 'STEP_SIDEWAYS', characterId: 'char-1', targetRealm: 'penumbra' },
      {
        type: 'ROLL_FREEFORM_POOL',
        characterId: 'char-1',
        label: 'Perception + Primal-Urge',
        attributeKey: 'perception',
        abilityKey: 'primal_urge',
        difficulty: 6,
        specialtyId: 'spec-1',
        spendWillpower: true,
        isSecretStRoll: false,
      },
      {
        type: 'CHARACTER_UPDATE_TRACKER',
        characterId: 'char-1',
        tracker: 'rage',
        delta: -1,
      },
      {
        type: 'CHARACTER_APPLY_HEALTH',
        characterId: 'char-1',
        mode: 'damage',
        levels: 3,
        damageType: 'aggravated',
        isSilver: true,
      },
      {
        type: 'CHARACTER_SAVE_MACRO',
        characterId: 'char-1',
        macro: sampleMacro,
      },
      {
        type: 'EXECUTE_MACRO',
        characterId: 'char-1',
        macro: sampleMacro,
        targetCharacterId: 'npc-1',
        spendWillpowerOnRoll: true,
      },
      { type: 'FRENZY_ROLL_CHECK', characterId: 'char-1', difficultyMod: -1, preferredType: 'berserk' },
      { type: 'CHARACTER_CLEAR_FRENZY', characterId: 'char-1' },
      { type: 'COMBAT_START', participantCharacterIds: ['char-1', 'npc-1'] },
      {
        type: 'COMBAT_DECLARE_PRE_INIT',
        combatantId: 'c-1',
        rageExtraActions: 2,
        spendGnosisSpiritOfFray: false,
        spendWillpowerIgnoreWounds: true,
      },
      { type: 'COMBAT_ROLL_ALL_INITIATIVE' },
      {
        type: 'COMBAT_SUBMIT_DECLARATION',
        combatantId: 'c-1',
        declaration: {
          mode: 'single',
          slots: [
            {
              category: 'gift_or_rite',
              label: 'Invoke Razor Claws',
              baseDifficulty: 6,
              macro: sampleMacro,
            },
          ],
        },
      },
      {
        type: 'COMBAT_TRIGGER_HOLD_INTERRUPT',
        combatantId: 'c-1',
        newDeclaration: {
          mode: 'single',
          slots: [
            {
              category: 'brawl_attack',
              label: 'Interrupt Bite',
              targetCombatantId: 'c-2',
              baseDifficulty: 5,
            },
          ],
        },
      },
      {
        type: 'COMBAT_EXECUTE_ACTIVE_TURN',
        combatantId: 'c-1',
        spendWillpowerOnRoll: true,
        specialtyId: 'spec-claws',
      },
      {
        type: 'COMBAT_SUBMIT_REACTION',
        defenderCombatantId: 'c-2',
        reaction: { strategy: 'willpower_abort_to_defense', defenseType: 'defend_dodge' },
      },
      { type: 'COMBAT_ADVANCE_PHASE_ST_OVERRIDE', reason: 'AFK player defaulted to hold' },
      { type: 'COMBAT_NEXT_ROUND' },
      { type: 'COMBAT_END' },
      {
        type: 'ST_SET_WORLD_ENV',
        localGauntlet: 7,
        moonPhase: 'full',
        specialtyMode: 'w20_double',
        mapAssetUrl: '/r2-assets/maps/caern.webp',
      },
      {
        type: 'ST_FOG_STROKE',
        stroke: { mode: 'reveal', shape: 'circle', x: 350, y: 420, radiusOrWidth: 120 },
      },
      {
        type: 'ST_SPAWN_NPC_TEMPLATE',
        templateId: 'scrag_bane',
        quantity: 2,
        realm: 'penumbra',
        isHidden: true,
        x: 500,
        y: 500,
      },
      { type: 'ST_REMOVE_TOKEN', tokenId: 'tok-npc-1' },
      { type: 'ST_TOGGLE_TOKEN_HIDDEN', tokenId: 'tok-npc-1', isHidden: false },
      {
        type: 'ST_SYNC_AUDIO',
        payload: {
          physicalTrackUrl: '/r2-assets/audio/forest.ogg',
          penumbraTrackUrl: '/r2-assets/audio/umbra.ogg',
          startedAtServerMs: 1_700_000_000_000,
          masterVolume: 0.7,
        },
      },
      { type: 'ST_TRIGGER_AUDIO_STING', stingUrl: '/r2-assets/sfx/crinos-howl.ogg' },
      { type: 'ST_PUSH_HANDOUT', imageUrl: '/r2-assets/handouts/memo.webp', caption: 'Pentex Memo' },
      { type: 'ST_DISMISS_HANDOUT' },
      {
        type: 'ST_SEND_WHISPER',
        targetDiscordId: 'user-42',
        title: 'Sense Wyrm',
        body: 'The crate smells of oiled iron and bile.',
      },
      { type: 'PACK_UPDATE_POOL', delta: -1 },
      { type: 'SAFETY_X_CARD_PAUSE', reason: 'Need a quick breather' },
      { type: 'SAFETY_RESUME' },
    ];

    expect(validCommands).toHaveLength(36);
    for (const cmd of validCommands) {
      const result = parseClientEnvelope(makeEnvelope(cmd));
      expect(result.success).toBe(true);
    }
  });

  it('rejects malformed JSON and preserves reqId on invalid command shapes', () => {
    const badJson = parseClientEnvelope('{not-json');
    expect(badJson.success).toBe(false);
    if (!badJson.success) {
      expect(badJson.reqId).toBeUndefined();
    }

    const outOfRange = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-bad-diff',
        expectedSeq: 2,
        sentAt: 12345,
        command: {
          type: 'ROLL_FREEFORM_POOL',
          characterId: 'char-1',
          label: 'Impossible roll',
          attributeKey: 'strength',
          difficulty: 15,
        },
      })
    );
    expect(outOfRange.success).toBe(false);
    if (!outOfRange.success) {
      expect(outOfRange.reqId).toBe('req-bad-diff');
      expect(outOfRange.error).toContain('difficulty');
    }

    const negativeSeq = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-neg-seq',
        expectedSeq: -1,
        sentAt: 12345,
        command: { type: 'PING' },
      })
    );
    expect(negativeSeq.success).toBe(false);
  });

  it('rejects invalid Gauntlet rating, unknown NPC template, NaN coords, and out-of-range volume', () => {
    const badGauntlet = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-gauntlet',
        expectedSeq: 1,
        sentAt: 12345,
        command: {
          type: 'ST_SET_WORLD_ENV',
          localGauntlet: 12,
          moonPhase: 'full',
        },
      })
    );
    expect(badGauntlet.success).toBe(false);

    const badNpc = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-npc',
        expectedSeq: 1,
        sentAt: 12345,
        command: {
          type: 'ST_SPAWN_NPC_TEMPLATE',
          templateId: 'unknown_monster',
          quantity: 1,
          realm: 'physical',
          isHidden: true,
        },
      })
    );
    expect(badNpc.success).toBe(false);

    const badAudio = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-audio',
        expectedSeq: 1,
        sentAt: 12345,
        command: {
          type: 'ST_SYNC_AUDIO',
          payload: {
            physicalTrackUrl: null,
            penumbraTrackUrl: null,
            startedAtServerMs: 100,
            masterVolume: 2.5,
          },
        },
      })
    );
    expect(badAudio.success).toBe(false);

    const macroCheck = W20MacroDefinitionSchema.safeParse({
      id: 'm-1',
      name: 'Sense Wyrm',
      category: 'gift',
      rankOrLevel: 1,
      costs: { rage: 0, gnosis: 0, willpower: 0 },
      pool: { kind: 'attribute_ability', attribute: 'perception', ability: 'occult' },
      difficulty: { kind: 'local_gauntlet', modifier: 0 },
      effects: [{ type: 'storyteller_secret_whisper', promptTemplate: 'Smell Wyrm taint' }],
      summary: 'Detects Wyrm taint.',
    });
    expect(macroCheck.success).toBe(true);
  });

  it('compiles ServerEnvelope, RoomSnapshotView, and all 15 ServerEvent variants cleanly', () => {
    const role: ParticipantRole = 'storyteller';
    const snapshot: RoomSnapshotView = {
      campaignId: 'camp-1',
      localGauntlet: 6,
      moonPhase: 'half',
      specialtyMode: 'w20_double',
      mapAssetUrl: null,
      fogStrokes: [],
      audioState: null,
      activeHandout: null,
      packTotem: {
        packId: 'pack-1',
        name: 'Iron Fang',
        totemName: 'Stag',
        willpowerMax: 5,
        willpowerTemp: 4,
      },
      safetyPaused: false,
      viewerRole: role,
      viewerRealm: 'physical',
      speakingDiscordIds: [],
      characters: {},
      tokens: [
        {
          id: 'tok-1',
          characterId: 'char-1',
          name: 'Kaelen',
          x: 70,
          y: 70,
          form: 'crinos',
          realm: 'physical',
          portraitUrl: '/r2-assets/portraits/kaelen.webp',
          visibilityMode: 'full',
          woundBadge: 'Healthy',
        },
      ],
      combat: null,
    };

    const events: ServerEvent[] = [
      { type: 'SYNC_SNAPSHOT', snapshot },
      { type: 'COMMAND_REJECTED', code: 'SEQ_MISMATCH', message: 'Stale seq', currentSeq: 2 },
      {
        type: 'DICE_ROLLED_3D',
        rollerDiscordId: 'u-1',
        characterId: 'char-1',
        label: 'Dex + Brawl',
        roll: {
          effectivePool: 3,
          clampedDifficulty: 6,
          dice: [
            { value: 8, isBonusExplosionDie: false, contributedSuccesses: 1, isOne: false },
            { value: 6, isBonusExplosionDie: false, contributedSuccesses: 1, isOne: false },
            { value: 3, isBonusExplosionDie: false, contributedSuccesses: 0, isOne: false },
          ],
          rawSuccesses: 2,
          onesRolled: 0,
          automaticSuccesses: 0,
          netSuccesses: 2,
          isBotch: false,
          outcome: 'moderate',
          physicsSeed: 'deadbeef12345678',
        },
      },
      { type: 'COMBAT_STATE_UPDATED', combat: null, transitionReason: 'Ended' },
      {
        type: 'CHARACTER_PATCHED',
        characterId: 'char-1',
        character: {
          id: 'char-1',
          campaignId: 'camp-1',
          packId: 'pack-1',
          ownerDiscordId: 'u-1',
          isNpc: false,
          name: 'Kaelen',
          breed: 'homid',
          auspice: 'ahroun',
          tribe: 'get_of_fenris',
          rank: 1,
          activeForm: 'crinos',
          activeRealm: 'physical',
          caughtInGauntlet: false,
          inFrenzy: false,
          frenzyType: null,
          baseAttributes: {
            strength: 3,
            dexterity: 3,
            stamina: 3,
            charisma: 2,
            manipulation: 2,
            appearance: 2,
            perception: 3,
            intelligence: 2,
            wits: 3,
          },
          abilities: { brawl: 3 },
          specialties: [],
          backgrounds: {},
          meritsFlaws: [],
          rage: { permanent: 5, temporary: 4 },
          gnosis: { permanent: 3, temporary: 3 },
          willpower: { permanent: 4, temporary: 4 },
          silverCarriedItems: 0,
          renown: {
            glory: { permanent: 2, temporary: 0 },
            honor: { permanent: 1, temporary: 0 },
            wisdom: { permanent: 0, temporary: 0 },
          },
          health: {
            bonusBruisedBoxes: 0,
            boxes: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
          },
          activeBuffs: [],
          macros: [],
          fetishes: [],
          portraitsByForm: {},
          turnLocks: {
            hasSpentRageThisTurn: true,
            hasSpentGnosisThisTurn: false,
            hasSpentWillpowerThisTurn: false,
            ignoringWoundPenaltiesThisTurn: false,
            declaredExtraRageActions: 0,
          },
          stateVersion: 2,
        } satisfies W20CharacterState,
      },
      { type: 'TOKENS_UPDATED', tokens: snapshot.tokens },
      { type: 'VOICE_SPEAKERS_UPDATED', speakingDiscordIds: ['u-1'] },
      {
        type: 'WORLD_ENV_UPDATED',
        localGauntlet: 7,
        moonPhase: 'gibbous',
        specialtyMode: 'w20_double',
        mapAssetUrl: '/r2-assets/maps/factory.webp',
      },
      {
        type: 'FOG_UPDATED',
        stroke: { mode: 'reveal', shape: 'circle', x: 100, y: 100, radiusOrWidth: 90 },
      },
      {
        type: 'AUDIO_SYNCED',
        payload: {
          physicalTrackUrl: '/r2-assets/audio/rain.ogg',
          penumbraTrackUrl: null,
          startedAtServerMs: 1_700_000_000_000,
          masterVolume: 0.65,
        },
      },
      {
        type: 'HANDOUT_UPDATED',
        handout: {
          id: 'h-1',
          imageUrl: '/r2-assets/handouts/glyph.webp',
          caption: 'Silver Fang Glyphs',
          pushedAt: 1_700_000_000_000,
        },
      },
      {
        type: 'WHISPER_RECEIVED',
        whisper: {
          id: 'w-1',
          targetDiscordId: 'u-1',
          senderName: 'Storyteller',
          title: 'Sense Wyrm',
          body: 'You taste copper and stagnant oil.',
          sentAt: 1_700_000_000_000,
        },
      },
      {
        type: 'PACK_UPDATED',
        packTotem: snapshot.packTotem!,
      },
      {
        type: 'SAFETY_PAUSE_UPDATED',
        paused: true,
        reason: 'X-Card triggered',
        triggeredByDiscordId: 'u-1',
      },
      {
        type: 'FRENZY_PROMPT',
        characterId: 'char-1',
        triggerReason: 'rage_4_plus_successes',
        baseDifficulty: 4,
        moonPhase: 'full',
      },
    ];

    const envelope: ServerEnvelope = {
      seq: 1,
      serverTime: Date.now(),
      event: events[0],
    };

    expect(envelope.event.type).toBe('SYNC_SNAPSHOT');
    expect(events).toHaveLength(15);
  });

  it('validates ROLL_TABLE_POOL and UPDATE_LIGHT_TRACKERS and rejects out-of-range dice/wound values', () => {
    const validRoll = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-table-1',
        expectedSeq: 0,
        sentAt: 1_700_000_000_000,
        command: {
          type: 'ROLL_TABLE_POOL',
          pool: 6,
          rageDiceCount: 2,
          difficulty: 6,
          hasSpecialty: true,
          spendWillpower: true,
          applyWoundPenalty: false,
          label: 'Dexterity + Brawl',
          isSecretRoll: false,
          physicalDiceValues: [10, 8, 6, 4, 2, 1],
          physicalBonusWaves: [[10], [1]],
          rollClientId: 'roll-abc',
        },
      })
    );
    expect(validRoll.success).toBe(true);
    if (validRoll.success && validRoll.data.command.type === 'ROLL_TABLE_POOL') {
      expect(validRoll.data.command.physicalDiceValues).toEqual([10, 8, 6, 4, 2, 1]);
      expect(validRoll.data.command.physicalBonusWaves).toEqual([[10], [1]]);
      for (const waves of [[[11]], [Array(31).fill(6)], Array(13).fill([10])]) {
        expect(parseClientEnvelope(JSON.stringify({
          ...validRoll.data, command: { ...validRoll.data.command, physicalBonusWaves: waves },
        })).success).toBe(false);
      }
    }

    const validTracker = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-tracker-1',
        expectedSeq: 0,
        sentAt: 1_700_000_000_000,
        command: {
          type: 'UPDATE_LIGHT_TRACKERS',
          trackers: { rage: 4, gnosis: 3, willpower: 5, woundPenalty: -2 },
        },
      })
    );
    expect(validTracker.success).toBe(true);

    const badDice = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-bad-dice',
        expectedSeq: 0,
        sentAt: 1_700_000_000_000,
        command: {
          type: 'ROLL_TABLE_POOL',
          pool: 3,
          rageDiceCount: 0,
          difficulty: 6,
          hasSpecialty: false,
          spendWillpower: false,
          applyWoundPenalty: false,
          physicalDiceValues: [11, 6, 4],
        },
      })
    );
    expect(badDice.success).toBe(false);

    const badWound = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-bad-wound',
        expectedSeq: 0,
        sentAt: 1_700_000_000_000,
        command: {
          type: 'UPDATE_LIGHT_TRACKERS',
          trackers: { woundPenalty: -3 },
        },
      })
    );
    expect(badWound.success).toBe(false);
  });

  it('validates SYNC_CLIENT_SEATS and extended multi-seat fields on ROLL_TABLE_POOL and UPDATE_LIGHT_TRACKERS', () => {
    const seats: ClientSeatSyncItem[] = [
      {
        seatId: 'seat-1',
        displayName: 'Kaelen',
        characterName: 'Kaelen Shadowclaw',
        activeForm: 'crinos',
        trackers: { rage: 5, gnosis: 3, willpower: 4, woundPenalty: -1 },
      },
      {
        seatId: 'seat-2',
        displayName: 'Lyra',
        characterName: null,
        activeForm: null,
        trackers: { rage: 2, gnosis: 5, willpower: 6, woundPenalty: 0 },
      },
    ];

    const syncSeats = parseClientEnvelope(
      makeEnvelope({
        type: 'SYNC_CLIENT_SEATS',
        seats,
      })
    );
    expect(syncSeats.success).toBe(true);
    if (syncSeats.success && syncSeats.data.command.type === 'SYNC_CLIENT_SEATS') {
      expect(syncSeats.data.command.seats).toHaveLength(2);
      expect(syncSeats.data.command.seats[0].activeForm).toBe('crinos');
    }

    const emptySeats = parseClientEnvelope(
      makeEnvelope({
        type: 'SYNC_CLIENT_SEATS',
        seats: [],
      })
    );
    expect(emptySeats.success).toBe(false);

    const tooManySeats = parseClientEnvelope(
      makeEnvelope({
        type: 'SYNC_CLIENT_SEATS',
        seats: Array.from({ length: 9 }, (_, i) => ({
          seatId: `seat-${i + 1}`,
          displayName: `Player ${i + 1}`,
          trackers: { rage: 3, gnosis: 3, willpower: 5, woundPenalty: 0 as const },
        })),
      })
    );
    expect(tooManySeats.success).toBe(false);

    const extendedRoll = parseClientEnvelope(
      makeEnvelope({
        type: 'ROLL_TABLE_POOL',
        pool: 7,
        rageDiceCount: 1,
        difficulty: 6,
        hasSpecialty: true,
        spendWillpower: false,
        applyWoundPenalty: true,
        label: 'Claws',
        seatId: 'seat-1',
        rollerDisplayName: 'Kaelen',
      })
    );
    expect(extendedRoll.success).toBe(true);
    if (extendedRoll.success && extendedRoll.data.command.type === 'ROLL_TABLE_POOL') {
      expect(extendedRoll.data.command.seatId).toBe('seat-1');
      expect(extendedRoll.data.command.rollerDisplayName).toBe('Kaelen');
    }

    const initiativeRoll = parseClientEnvelope(
      makeEnvelope({
        type: 'ROLL_TABLE_POOL',
        pool: 1,
        rageDiceCount: 0,
        difficulty: 6,
        hasSpecialty: false,
        spendWillpower: false,
        applyWoundPenalty: true,
        rollMode: 'initiative',
        initiativeModifier: 7,
        label: 'Initiative',
      })
    );
    expect(initiativeRoll.success).toBe(true);
    if (initiativeRoll.success && initiativeRoll.data.command.type === 'ROLL_TABLE_POOL') {
      expect(initiativeRoll.data.command.rollMode).toBe('initiative');
      expect(initiativeRoll.data.command.initiativeModifier).toBe(7);
    }

    const extendedTracker = parseClientEnvelope(
      makeEnvelope({
        type: 'UPDATE_LIGHT_TRACKERS',
        trackers: { rage: 4 },
        seatId: 'seat-1',
        displayName: 'Kaelen',
        characterName: 'Kaelen Shadowclaw',
        activeForm: 'hispo',
      })
    );
    expect(extendedTracker.success).toBe(true);
    if (extendedTracker.success && extendedTracker.data.command.type === 'UPDATE_LIGHT_TRACKERS') {
      expect(extendedTracker.data.command.seatId).toBe('seat-1');
      expect(extendedTracker.data.command.activeForm).toBe('hispo');
    }

    const participant: TableParticipant = {
      discordUserId: 'u-1',
      displayName: 'Kaelen',
      avatarUrl: null,
      isConnected: true,
      trackers: { rage: 4, gnosis: 3, willpower: 5, woundPenalty: 0 },
      participantKey: 'u-1:seat-1',
      seatId: 'seat-1',
      characterName: 'Kaelen Shadowclaw',
      activeForm: 'hispo',
    };
    expect(participant.participantKey).toBe('u-1:seat-1');
  });

  it('validates W20UserCharacterSheetSchema and rejects out-of-range dots or invalid shapes', () => {
    const baseSheet = createBlankUserCharacterSheet({
      id: 'sheet-proto-1',
      ownerDiscordId: 'u-42',
      syncCode: 'ABCD2345',
      name: 'Ashara Moonfang',
      player: 'Alice',
      chronicle: 'Silver Oak',
      breed: 'lupus',
      auspice: 'theurge',
      tribe: 'Uktena (Custom String)',
      now: 1_700_000_000_000,
    });

    const populatedSheet = {
      ...baseSheet,
      customAbilities: [
        {
          id: 'ca-1',
          category: 'knowledges' as const,
          name: 'Umbral Lore',
          dots: 3,
          specialty: 'Banes',
        },
      ],
      specialties: { brawl: 'Bite', 'ca-1': 'Banes' },
      backgrounds: [{ id: 'totem', name: 'Totem', dots: 3 }],
      gifts: [
        {
          id: '10000000-0000-4000-8000-000000000142',
          name: 'Shroud',
          level: 1,
          rollAttribute: 'gnosis' as const,
          rollAbility: null,
          difficulty: 7,
          gnosisCost: 1,
          summary: 'Creates darkness.',
        },
      ],
      otherTraits: [
        { id: 'merit-1', name: 'Acute Senses', dots: 1 },
        { id: 'flaw-1', name: 'Dark Fate', dots: 5, kind: 'flaw' as const, category: 'supernatural' as const },
      ],
      fetishes: [
        {
          id: 'fet-1',
          name: 'Klaive',
          level: 4,
          gnosisRating: 6,
          power: 'Deals Aggravated Silver damage.',
          isSilver: true,
        },
      ],
      rites: [{ id: 'rite-1', name: 'Rite of Cleansing', level: 1, summary: 'Purifies Wyrm taint.' }],
      combatWeapons: [
        {
          id: 'wpn-1',
          name: 'Klaive',
          rollAttribute: 'dexterity' as const,
          rollAbility: 'melee',
          difficulty: 6,
          damageMode: 'strength_plus' as const,
          damageDice: 2,
          damageType: 'aggravated' as const,
          range: 'Melee',
          rate: '1',
          clip: '-',
        },
      ],
      armor: { rating: 2, description: 'Leather jacket' },
    };

    expect(W20UserCharacterSheetSchema.safeParse(populatedSheet).success).toBe(true);

    // Rejects dots > 10
    expect(
      W20UserCharacterSheetSchema.safeParse({
        ...populatedSheet,
        baseAttributes: { ...populatedSheet.baseAttributes, strength: 11 },
      }).success
    ).toBe(false);

    // Rejects negative ability dots
    expect(
      W20UserCharacterSheetSchema.safeParse({
        ...populatedSheet,
        abilities: { brawl: -1 },
      }).success
    ).toBe(false);

    // Rejects health track with fewer than 7 boxes
    expect(
      W20UserCharacterSheetSchema.safeParse({
        ...populatedSheet,
        health: { bonusBruisedBoxes: 0, boxes: ['none', 'none'] },
      }).success
    ).toBe(false);

    // Rejects invalid custom ability item shape
    expect(
      W20UserCharacterSheetSchema.safeParse({
        ...populatedSheet,
        customAbilities: [{ id: '', category: 'talents', name: 'Bad', dots: 2 }],
      }).success
    ).toBe(false);
  });

  it('accepts CLEAR_TABLE_INITIATIVE with no extra fields', () => {
    const parsed = parseClientEnvelope(
      JSON.stringify({
        reqId: 'req-clear-init',
        expectedSeq: 0,
        sentAt: 1,
        command: { type: 'CLEAR_TABLE_INITIATIVE' },
      }),
    );
    expect(parsed.success).toBe(true);
  });
});
