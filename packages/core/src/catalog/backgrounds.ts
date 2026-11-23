import type { W20BackgroundCatalogEntry } from './types';

/**
 * Tribe restrictions follow the tribe write-ups in the W20 core rulebook. Creation validation in
 * characterCreation.ts keeps its own (slightly stricter) checks so existing drafts validate the same way.
 */
export const W20_BACKGROUND_CATALOG: readonly W20BackgroundCatalogEntry[] = [
  // The 12 Backgrounds printed in the W20 core rulebook (pp. 135-140)
  { key: 'allies', label: 'Allies', tier: 'core', summary: 'Confederates and mortals who aid the Garou.', source: { book: 'W20', page: 135 }, discouragedTribes: ['red_talons', 'shadow_lords', 'stargazers'] },
  { key: 'ancestors', label: 'Ancestors', tier: 'core', summary: 'Spiritual communion with honored tribal forbears.', source: { book: 'W20', page: 136 }, restrictedTribes: ['bone_gnawers', 'glass_walkers', 'silent_striders'] },
  { key: 'contacts', label: 'Contacts', tier: 'core', summary: 'Informants, street sources, and intelligence networks.', source: { book: 'W20', page: 136 }, discouragedTribes: ['get_of_fenris', 'red_talons', 'wendigo'] },
  { key: 'fate', label: 'Fate', tier: 'core', summary: 'An ominous or prophetic destiny woven by Gaia (W20 Core).', source: { book: 'W20', page: 137 } },
  { key: 'fetish', label: 'Fetish', tier: 'core', summary: 'Spirit-bound mystical items or Talens carried at start.', source: { book: 'W20', page: 137 }, discouragedTribes: ['stargazers'] },
  { key: 'kinfolk', label: 'Kinfolk', tier: 'core', summary: 'Human or wolf family tied to the sept and pack.', source: { book: 'W20', page: 138 } },
  { key: 'mentor', label: 'Mentor', tier: 'core', summary: 'An elder Garou tutor offering guidance and refuge.', source: { book: 'W20', page: 138 }, discouragedTribes: ['glass_walkers', 'shadow_lords'] },
  { key: 'pure_breed', label: 'Pure Breed', tier: 'core', summary: 'Noble Garou lineage commanding respect from Luna and spirits.', source: { book: 'W20', page: 138 }, restrictedTribes: ['bone_gnawers', 'glass_walkers'] },
  { key: 'resources', label: 'Resources', tier: 'core', summary: 'Wealth, property, income, and material assets.', source: { book: 'W20', page: 138 }, restrictedTribes: ['red_talons'], discouragedTribes: ['bone_gnawers', 'silent_striders', 'stargazers', 'wendigo'] },
  { key: 'rites', label: 'Rites', tier: 'core', summary: 'Mystic and seasonal rites known at starting Rank.', source: { book: 'W20', page: 139 } },
  { key: 'spirit_heritage', label: 'Spirit Heritage', tier: 'core', summary: 'Favorable standing and affinity with a spirit court.', source: { book: 'W20', page: 139 } },
  { key: 'totem', label: 'Totem', tier: 'core', summary: 'Shared dots invested toward the pack’s patron Totem spirit.', source: { book: 'W20', page: 140 } },
  // Chronicle Backgrounds from other Storyteller books; no W20 core page reference
  { key: 'caern', label: 'Caern', tier: 'expanded', summary: 'Guardianship or access rights to a sacred Gaian Caern.' },
  { key: 'fame', label: 'Fame', tier: 'expanded', summary: 'Recognition in human media, arts, or subcultures.' },
  { key: 'influence', label: 'Influence', tier: 'expanded', summary: 'Clout in civic, legal, corporate, or underworld institutions.' },
  { key: 'status', label: 'Status / Sept Standing', tier: 'expanded', summary: 'Respect and office within the local Sept.' },
  { key: 'pack_status', label: 'Pack Status', tier: 'expanded', summary: 'Reputation of your pack across the Protectorate.' },
  { key: 'past_life', label: 'Past Life', tier: 'expanded', summary: 'Inherited memories from prior incarnations (alternative Ancestors).' },
  { key: 'patron', label: 'Patron', tier: 'expanded', summary: 'A powerful mortal, Kinfolk, or spirit sponsor.' },
  { key: 'retainers', label: 'Retainers', tier: 'expanded', summary: 'Loyal assistants, bodyguards, or caretakers.' },
  { key: 'favor', label: 'Favor', tier: 'expanded', summary: 'Unclaimed boons owed by elders, spirits, or changers.' },
  { key: 'equipment', label: 'Equipment', tier: 'expanded', summary: 'Specialized tactical gear, vehicles, or safe houses.' },
  { key: 'umbral_maps', label: 'Umbral Lore', tier: 'expanded', summary: 'Knowledge of safe Moon Bridges and Near Umbral paths.' },
  { key: 'arcane', label: 'Arcane', tier: 'expanded', summary: 'Slippery obscurity that hides traces from mortal records.' },
];
