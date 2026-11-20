import type { RealmLayer, W20CharacterState } from '@w20-vtt/core';
import type { NpcSpawnTemplateId } from '@w20-vtt/protocol';

interface NpcTemplateSpec {
  label: string;
  breed: W20CharacterState['breed'];
  auspice: W20CharacterState['auspice'];
  tribe: string;
  rank: number;
  metisDeformity?: string;
  activeForm: W20CharacterState['activeForm'];
  baseAttributes: W20CharacterState['baseAttributes'];
  abilities: Record<string, number>;
  rage: number;
  gnosis: number;
  willpower: number;
  bonusBruisedBoxes: number;
}

export const ANTAGONIST_TEMPLATES: Record<NpcSpawnTemplateId, NpcTemplateSpec> = {
  pentex_first_team: {
    label: 'Pentex First Team Trooper',
    breed: 'homid',
    auspice: 'ahroun',
    tribe: 'Pentex First Team',
    rank: 1,
    activeForm: 'homid',
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
    abilities: {
      alertness: 3,
      athletics: 3,
      brawl: 3,
      dodge: 2,
      firearms: 4,
      melee: 3,
      stealth: 2,
    },
    rage: 0,
    gnosis: 0,
    willpower: 6,
    bonusBruisedBoxes: 0,
  },
  fomor_berserker: {
    label: 'Bane-Possessed Fomor',
    breed: 'homid',
    auspice: 'ahroun',
    tribe: 'Wyrm Fomori',
    rank: 2,
    activeForm: 'glabro',
    baseAttributes: {
      strength: 3,
      dexterity: 3,
      stamina: 3,
      charisma: 1,
      manipulation: 2,
      appearance: 2,
      perception: 3,
      intelligence: 2,
      wits: 2,
    },
    abilities: {
      alertness: 2,
      athletics: 3,
      brawl: 4,
      intimidation: 4,
      melee: 3,
    },
    rage: 5,
    gnosis: 2,
    willpower: 5,
    bonusBruisedBoxes: 2,
  },
  bsd_crinos: {
    label: 'Black Spiral Dancer',
    breed: 'metis',
    auspice: 'ahroun',
    tribe: 'Black Spiral Dancers',
    rank: 2,
    metisDeformity: 'Spiral Wyrm-Scar',
    activeForm: 'crinos',
    baseAttributes: {
      strength: 3,
      dexterity: 3,
      stamina: 3,
      charisma: 2,
      manipulation: 3,
      appearance: 1,
      perception: 3,
      intelligence: 2,
      wits: 3,
    },
    abilities: {
      alertness: 3,
      athletics: 3,
      brawl: 4,
      dodge: 3,
      primal_urge: 3,
      stealth: 3,
    },
    rage: 6,
    gnosis: 4,
    willpower: 5,
    bonusBruisedBoxes: 0,
  },
  scrag_bane: {
    label: 'Scrag Hunter-Bane',
    breed: 'lupus',
    auspice: 'theurge',
    tribe: 'Wyrm Spirit',
    rank: 2,
    activeForm: 'hispo',
    baseAttributes: {
      strength: 3,
      dexterity: 4,
      stamina: 3,
      charisma: 1,
      manipulation: 2,
      appearance: 1,
      perception: 4,
      intelligence: 2,
      wits: 3,
    },
    abilities: {
      alertness: 4,
      brawl: 4,
      dodge: 3,
      occult: 2,
      primal_urge: 3,
      stealth: 4,
    },
    rage: 7,
    gnosis: 5,
    willpower: 6,
    bonusBruisedBoxes: 1,
  },
  nexus_crawler: {
    label: 'Nexus Crawler',
    breed: 'metis',
    auspice: 'ragabash',
    tribe: 'Wyrm Spirit',
    rank: 4,
    metisDeformity: 'Distorted Umbral Flesh',
    activeForm: 'crinos',
    baseAttributes: {
      strength: 4,
      dexterity: 4,
      stamina: 4,
      charisma: 1,
      manipulation: 4,
      appearance: 1,
      perception: 4,
      intelligence: 4,
      wits: 4,
    },
    abilities: {
      alertness: 4,
      brawl: 4,
      dodge: 3,
      intimidation: 4,
      occult: 5,
      primal_urge: 4,
    },
    rage: 8,
    gnosis: 8,
    willpower: 8,
    bonusBruisedBoxes: 3,
  },
};

export function createNpcFromTemplate(params: {
  templateId: NpcSpawnTemplateId;
  index: number;
  totalCount: number;
  campaignId: string;
  storytellerDiscordId: string;
  realm: RealmLayer;
}): W20CharacterState {
  const spec = ANTAGONIST_TEMPLATES[params.templateId];
  const suffix = params.totalCount > 1 ? ` #${params.index + 1}` : '';
  const id = `npc-${crypto.randomUUID()}`;
  const healthCount = 7 + spec.bonusBruisedBoxes;

  return {
    id,
    campaignId: params.campaignId,
    packId: null,
    ownerDiscordId: params.storytellerDiscordId,
    isNpc: true,
    name: `${spec.label}${suffix}`,
    breed: spec.breed,
    auspice: spec.auspice,
    tribe: spec.tribe,
    rank: spec.rank,
    metisDeformity: spec.metisDeformity,
    activeForm: spec.activeForm,
    activeRealm: params.realm,
    caughtInGauntlet: false,
    inFrenzy: false,
    frenzyType: null,
    baseAttributes: { ...spec.baseAttributes },
    abilities: { ...spec.abilities },
    specialties: [],
    backgrounds: {},
    meritsFlaws: [],
    rage: { permanent: spec.rage, temporary: spec.rage },
    gnosis: { permanent: spec.gnosis, temporary: spec.gnosis },
    willpower: { permanent: spec.willpower, temporary: spec.willpower },
    silverCarriedItems: 0,
    renown: {
      glory: { permanent: 0, temporary: 0 },
      honor: { permanent: 0, temporary: 0 },
      wisdom: { permanent: 0, temporary: 0 },
    },
    health: {
      bonusBruisedBoxes: spec.bonusBruisedBoxes,
      boxes: Array.from({ length: healthCount }, () => 'none'),
    },
    activeBuffs: [],
    macros: [],
    fetishes: [],
    portraitsByForm: {},
    turnLocks: {
      hasSpentRageThisTurn: false,
      hasSpentGnosisThisTurn: false,
      hasSpentWillpowerThisTurn: false,
      ignoringWoundPenaltiesThisTurn: false,
      declaredExtraRageActions: 0,
    },
    stateVersion: 1,
  };
}
