import React, { useEffect, useMemo, useState } from 'react';
import {
  ABILITY_GROUPS,
  AbilityCategory,
  ATTRIBUTE_GROUPS,
  AttributeCategory,
  AttributeKey,
  Auspice,
  BaseAttributes,
  Breed,
  CanonicalAbilityKey,
  GarouForm,
  GarouTribe,
  LUPUS_RESTRICTED_BASE_ABILITIES,
  MeritOrFlawChoice,
  SelectedGiftChoice,
  STARTING_GNOSIS_BY_BREED,
  STARTING_RAGE_BY_AUSPICE,
  STARTING_RENOWN_BY_AUSPICE,
  STARTING_WILLPOWER_BY_TRIBE,
  validateW20CharacterCreation,
  W20_FREEBIE_COSTS,
  W20CharacterCreationDraft,
  W20CharacterState,
} from '@w20-vtt/core';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { getVttSupabaseClient } from '../supabaseClient';

interface CompendiumGiftRow {
  id: string;
  name: string;
  level: number;
  sources: string[];
  system_summary: string;
}

const ALL_TRIBES: Array<{ key: GarouTribe; label: string }> = [
  { key: 'black_furies', label: 'Black Furies' },
  { key: 'bone_gnawers', label: 'Bone Gnawers' },
  { key: 'children_of_gaia', label: 'Children of Gaia' },
  { key: 'fianna', label: 'Fianna' },
  { key: 'get_of_fenris', label: 'Get of Fenris' },
  { key: 'glass_walkers', label: 'Glass Walkers' },
  { key: 'red_talons', label: 'Red Talons' },
  { key: 'shadow_lords', label: 'Shadow Lords' },
  { key: 'silent_striders', label: 'Silent Striders' },
  { key: 'silver_fangs', label: 'Silver Fangs' },
  { key: 'stargazers', label: 'Stargazers' },
  { key: 'uktena', label: 'Uktena' },
  { key: 'wendigo', label: 'Wendigo' },
];

const CANONICAL_BACKGROUNDS: Array<{ key: string; label: string }> = [
  { key: 'allies', label: 'Allies' },
  { key: 'ancestors', label: 'Ancestors' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'fetish', label: 'Fetish' },
  { key: 'kinfolk', label: 'Kinfolk' },
  { key: 'mentor', label: 'Mentor' },
  { key: 'pure_breed', label: 'Pure Breed' },
  { key: 'resources', label: 'Resources' },
  { key: 'rites', label: 'Rites' },
  { key: 'spirit_heritage', label: 'Spirit Heritage' },
  { key: 'totem', label: 'Totem' },
];

const PRESET_MERITS_FLAWS: MeritOrFlawChoice[] = [
  { id: 'merit-acute-senses', name: 'Acute Senses', kind: 'merit', pointValue: 1 },
  { id: 'merit-code-of-honor', name: 'Code of Honor', kind: 'merit', pointValue: 2 },
  { id: 'merit-pack-mentality', name: 'Pack Mentality', kind: 'merit', pointValue: 2 },
  { id: 'merit-huge-size', name: 'Huge Size (+1 Bruised Box)', kind: 'merit', pointValue: 4 },
  { id: 'merit-silver-tolerance', name: 'Silver Tolerance', kind: 'merit', pointValue: 7 },
  { id: 'flaw-deep-sleeper', name: 'Deep Sleeper', kind: 'flaw', pointValue: 1 },
  { id: 'flaw-strict-carnivore', name: 'Strict Carnivore', kind: 'flaw', pointValue: 1 },
  { id: 'flaw-bad-taste', name: 'Bad Taste', kind: 'flaw', pointValue: 2 },
  { id: 'flaw-slippery-mind', name: 'Slippery Mind', kind: 'flaw', pointValue: 3 },
  { id: 'flaw-dark-fate', name: 'Dark Fate', kind: 'flaw', pointValue: 5 },
];

const FALLBACK_LEVEL_1_GIFTS: CompendiumGiftRow[] = [
  { id: '10000000-0000-4000-8000-000000000101', name: 'Master of Fire', level: 1, sources: ['homid'], system_summary: 'Spend 1 Gnosis and roll Charisma + Survival (Diff 6) to soften fire harm.' },
  { id: '10000000-0000-4000-8000-000000000102', name: 'Persuasion', level: 1, sources: ['homid', 'fianna', 'glass_walkers'], system_summary: 'Roll Charisma + Subterfuge (Diff 7) for -1 Social difficulty.' },
  { id: '10000000-0000-4000-8000-000000000103', name: 'Smell of Man', level: 1, sources: ['homid'], system_summary: 'Normal animals hesitate or flee from the Garou.' },
  { id: '10000000-0000-4000-8000-000000000104', name: 'Create Element', level: 1, sources: ['metis'], system_summary: 'Spend 1 Gnosis and roll Gnosis (Diff 6) to conjure elemental matter.' },
  { id: '10000000-0000-4000-8000-000000000105', name: 'Primal Anger', level: 1, sources: ['metis'], system_summary: 'Store up to +2 temporary Rage above permanent rating for a scene.' },
  { id: '10000000-0000-4000-8000-000000000106', name: 'Sense Wyrm', level: 1, sources: ['metis', 'theurge', 'black_furies', 'silent_striders', 'silver_fangs'], system_summary: 'Roll Perception + Occult (Diff 6) to detect Wyrm taint.' },
  { id: '10000000-0000-4000-8000-000000000107', name: "Hare's Leap", level: 1, sources: ['lupus'], system_summary: 'Roll Strength + Athletics (Diff 7) to double jumping distances.' },
  { id: '10000000-0000-4000-8000-000000000108', name: 'Heightened Senses', level: 1, sources: ['lupus', 'black_furies'], system_summary: 'Spend 1 Gnosis for -2 Perception difficulty for the scene.' },
  { id: '10000000-0000-4000-8000-000000000109', name: 'Sense Prey', level: 1, sources: ['lupus'], system_summary: 'Roll Perception + Enigmas (Diff 6) to pinpoint hunted quarry.' },
  { id: '10000000-0000-4000-8000-000000000110', name: 'Blur of the Milky Eye', level: 1, sources: ['ragabash'], system_summary: 'Roll Manipulation + Stealth (Diff 8) to go unnoticed.' },
  { id: '10000000-0000-4000-8000-000000000111', name: 'Open Seal', level: 1, sources: ['ragabash'], system_summary: 'Spend 1 Gnosis and roll Gnosis (Diff 7) to unlock sealed doors.' },
  { id: '10000000-0000-4000-8000-000000000112', name: 'Scent of Running Water', level: 1, sources: ['ragabash', 'red_talons'], system_summary: 'Masks scent trail (+2 tracking difficulty).' },
  { id: '10000000-0000-4000-8000-000000000113', name: "Mother's Touch", level: 1, sources: ['theurge'], system_summary: 'Spend 1 Gnosis and roll Intelligence + Empathy to heal wounds.' },
  { id: '10000000-0000-4000-8000-000000000114', name: 'Spirit Speech', level: 1, sources: ['theurge'], system_summary: 'Understand and speak the high speech of spirits.' },
  { id: '10000000-0000-4000-8000-000000000115', name: 'Resist Pain', level: 1, sources: ['philodox', 'get_of_fenris', 'wendigo'], system_summary: 'Spend 1 Willpower to ignore wound penalties for the scene.' },
  { id: '10000000-0000-4000-8000-000000000116', name: 'Truth of Gaia', level: 1, sources: ['philodox'], system_summary: 'Roll Intelligence + Empathy to detect deliberate lies.' },
  { id: '10000000-0000-4000-8000-000000000117', name: 'Beast Speech', level: 1, sources: ['galliard', 'red_talons'], system_summary: 'Communicate natively with mundane animals.' },
  { id: '10000000-0000-4000-8000-000000000118', name: 'Call of the Wyld', level: 1, sources: ['galliard'], system_summary: 'Roll Stamina + Expression (Diff 6) to project a distant howl.' },
  { id: '10000000-0000-4000-8000-000000000119', name: 'Mindspeak', level: 1, sources: ['galliard'], system_summary: 'Spend 1 Gnosis and roll Manipulation + Expression for telepathy.' },
  { id: '10000000-0000-4000-8000-000000000120', name: 'Razor Claws', level: 1, sources: ['ahroun', 'get_of_fenris'], system_summary: 'Spend 1 Rage for +2 Claw damage dice in Crinos/Hispo/Lupus.' },
  { id: '10000000-0000-4000-8000-000000000121', name: 'Inspiration', level: 1, sources: ['ahroun'], system_summary: 'Spend 1 Gnosis to bolster packmate resolve and initiative.' },
  { id: '10000000-0000-4000-8000-000000000122', name: 'Falling Touch', level: 1, sources: ['ahroun'], system_summary: 'Roll Dexterity + Medicine (Diff target Stamina + 3) to knock prone.' },
  { id: '10000000-0000-4000-8000-000000000123', name: 'Breath of the Wyld', level: 1, sources: ['black_furies'], system_summary: 'Spend 1 Gnosis and roll Charisma + Empathy to revitalize an ally.' },
  { id: '10000000-0000-4000-8000-000000000124', name: 'Cooking', level: 1, sources: ['bone_gnawers'], system_summary: 'Spend 1 Gnosis and roll Intelligence + Survival to turn scrap into food.' },
  { id: '10000000-0000-4000-8000-000000000125', name: 'Resist Toxin', level: 1, sources: ['bone_gnawers', 'fianna'], system_summary: 'Roll Stamina + Survival (Diff 6) to neutralize poisons.' },
  { id: '10000000-0000-4000-8000-000000000126', name: 'Calm', level: 1, sources: ['children_of_gaia'], system_summary: 'Spend 1 Gnosis and roll Charisma + Empathy to soothe Rage/Frenzy.' },
  { id: '10000000-0000-4000-8000-000000000127', name: "Brother's Scent", level: 1, sources: ['children_of_gaia'], system_summary: 'Roll Charisma + Primal-Urge (Diff 6) to project peaceful kinship.' },
  { id: '10000000-0000-4000-8000-000000000128', name: 'Two Tongues', level: 1, sources: ['fianna'], system_summary: 'Roll Intelligence + Expression (Diff 6) to hide double meanings.' },
  { id: '10000000-0000-4000-8000-000000000129', name: 'Visage of Fenris', level: 1, sources: ['get_of_fenris'], system_summary: 'Spend 1 Rage and roll Charisma + Intimidation (Diff 6) to terrify foes.' },
  { id: '10000000-0000-4000-8000-000000000130', name: 'Control Simple Machine', level: 1, sources: ['glass_walkers'], system_summary: 'Spend 1 Gnosis and roll Manipulation + Technology (Diff 6).' },
  { id: '10000000-0000-4000-8000-000000000131', name: 'Diagnostics', level: 1, sources: ['glass_walkers'], system_summary: 'Roll Perception + Science (Diff 6) to inspect machines.' },
  { id: '10000000-0000-4000-8000-000000000132', name: 'Wolf at the Door', level: 1, sources: ['red_talons'], system_summary: 'Spend 1 Gnosis and roll Manipulation + Intimidation (Diff 7).' },
  { id: '10000000-0000-4000-8000-000000000133', name: 'Aura of Confidence', level: 1, sources: ['shadow_lords'], system_summary: 'Conceal emotional doubt from telepathy and Empathy.' },
  { id: '10000000-0000-4000-8000-000000000134', name: 'Fatal Flaw', level: 1, sources: ['shadow_lords'], system_summary: 'Spend 1 Gnosis and roll Perception + Empathy (Diff target WP).' },
  { id: '10000000-0000-4000-8000-000000000135', name: 'Speed of Thought', level: 1, sources: ['silent_striders'], system_summary: 'Spend 1 Gnosis to double running speed for the scene.' },
  { id: '10000000-0000-4000-8000-000000000136', name: "Heaven's Guidance", level: 1, sources: ['silent_striders'], system_summary: 'Roll Perception + Survival (Diff 6) under open sky for navigation.' },
  { id: '10000000-0000-4000-8000-000000000137', name: 'Eye of the Falcon', level: 1, sources: ['silver_fangs'], system_summary: 'Spend 1 Gnosis to command respect from lower-ranked Garou.' },
  { id: '10000000-0000-4000-8000-000000000138', name: 'Lambent Flame', level: 1, sources: ['silver_fangs'], system_summary: 'Spend 1 Gnosis for protective silver moonlight aura.' },
  { id: '10000000-0000-4000-8000-000000000139', name: 'Balance', level: 1, sources: ['stargazers'], system_summary: 'Maintain flawless footing on narrow ledges or unstable ground.' },
  { id: '10000000-0000-4000-8000-000000000140', name: 'Inner Strength', level: 1, sources: ['stargazers'], system_summary: 'Spend 1 Gnosis and roll Stamina + Athletics (Diff 6) to center chi.' },
  { id: '10000000-0000-4000-8000-000000000141', name: 'Sense Magic', level: 1, sources: ['uktena'], system_summary: 'Roll Perception + Occult (Diff 6) to sense Fetishes and Rites.' },
  { id: '10000000-0000-4000-8000-000000000142', name: 'Shroud', level: 1, sources: ['uktena'], system_summary: 'Spend 1 Gnosis and roll Gnosis (Diff 7) to shroud an area in shadow.' },
  { id: '10000000-0000-4000-8000-000000000143', name: 'Call the Breeze', level: 1, sources: ['wendigo'], system_summary: 'Spend 1 Gnosis and roll Charisma + Survival (Diff 6) for chill winds.' },
  { id: '10000000-0000-4000-8000-000000000144', name: 'Camouflage', level: 1, sources: ['wendigo'], system_summary: 'Roll Wits + Stealth (Diff 6) to blend into natural wilderness cover.' },
];

const INITIAL_DRAFT: W20CharacterCreationDraft = {
  name: '',
  concept: '',
  breed: 'homid',
  auspice: 'ahroun',
  tribe: 'get_of_fenris',
  attributePriorities: {
    physical: 'primary',
    social: 'tertiary',
    mental: 'secondary',
  },
  abilityPriorities: {
    talents: 'primary',
    skills: 'secondary',
    knowledges: 'tertiary',
  },
  priorityAttributeDots: {
    strength: 0,
    dexterity: 0,
    stamina: 0,
    charisma: 0,
    manipulation: 0,
    appearance: 0,
    perception: 0,
    intelligence: 0,
    wits: 0,
  },
  priorityAbilityDots: {},
  priorityBackgroundDots: {},
  startingRenown: { ...STARTING_RENOWN_BY_AUSPICE.ahroun },
  selectedGifts: [],
  freebieAttributeDots: {},
  freebieAbilityDots: {},
  freebieBackgroundDots: {},
  freebieRageDots: 0,
  freebieGnosisDots: 0,
  freebieWillpowerDots: 0,
  meritsAndFlaws: [],
};

const ATTR_TIER_DOTS: Record<'primary' | 'secondary' | 'tertiary', number> = {
  primary: 7,
  secondary: 5,
  tertiary: 3,
};

const ABIL_TIER_DOTS: Record<'primary' | 'secondary' | 'tertiary', number> = {
  primary: 13,
  secondary: 9,
  tertiary: 5,
};

function formatLabel(raw: string): string {
  return raw
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function swapPriorityMap<T extends string>(
  current: Record<T, 'primary' | 'secondary' | 'tertiary'>,
  targetCategory: T,
  nextTier: 'primary' | 'secondary' | 'tertiary'
): Record<T, 'primary' | 'secondary' | 'tertiary'> {
  const prevTier = current[targetCategory];
  if (prevTier === nextTier) return current;
  const updated = { ...current };
  for (const key of Object.keys(updated) as T[]) {
    if (updated[key] === nextTier) {
      updated[key] = prevTier;
    }
  }
  updated[targetCategory] = nextTier;
  return updated;
}

interface CharacterCreationWizardProps {
  campaignId: string;
  sessionJwt: string;
  getLatestSupabaseJwt: () => Promise<string | null>;
  onClose: () => void;
  onCreated: (character: W20CharacterState) => void;
}

export const CharacterCreationWizard: React.FC<CharacterCreationWizardProps> = ({
  campaignId,
  sessionJwt,
  getLatestSupabaseJwt,
  onClose,
  onCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [draft, setDraft] = useState<W20CharacterCreationDraft>(INITIAL_DRAFT);
  const [deedName, setDeedName] = useState('');
  const [portraitsByForm, setPortraitsByForm] = useState<Partial<Record<GarouForm, string>>>({});

  const [gifts, setGifts] = useState<CompendiumGiftRow[]>(FALLBACK_LEVEL_1_GIFTS);
  const [giftFetchNote, setGiftFetchNote] = useState<string | null>(null);

  const [customMfName, setCustomMfName] = useState('');
  const [customMfKind, setCustomMfKind] = useState<'merit' | 'flaw'>('merit');
  const [customMfPoints, setCustomMfPoints] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load Level 1 Gifts from Supabase compendium_gifts, falling back seamlessly to canonical seed presets
  useEffect(() => {
    let active = true;
    const loadGifts = async () => {
      try {
        const supabase = getVttSupabaseClient(getLatestSupabaseJwt);
        const { data, error } = await supabase
          .from('compendium_gifts')
          .select('id, name, level, sources, system_summary')
          .eq('level', 1)
          .order('name', { ascending: true });

        if (!active) return;
        if (error) {
          setGiftFetchNote('Using offline canonical W20 Level 1 Gifts (Supabase compendium unavailable).');
          return;
        }
        if (data && data.length > 0) {
          setGifts(data as CompendiumGiftRow[]);
          setGiftFetchNote(null);
        }
      } catch {
        if (active) {
          setGiftFetchNote('Using offline canonical W20 Level 1 Gifts.');
        }
      }
    };
    void loadGifts();
    return () => {
      active = false;
    };
  }, [getLatestSupabaseJwt]);

  const summary = useMemo(() => validateW20CharacterCreation(draft), [draft]);

  const setIdentityField = (
    patch: Partial<
      Pick<W20CharacterCreationDraft, 'name' | 'concept' | 'breed' | 'auspice' | 'tribe' | 'metisDeformity'>
    >
  ) => {
    setDraft((prev) => {
      const next: W20CharacterCreationDraft = { ...prev, ...patch };
      if (patch.auspice && patch.auspice !== prev.auspice) {
        next.startingRenown =
          patch.auspice === 'ragabash'
            ? { glory: 1, honor: 1, wisdom: 1 }
            : { ...STARTING_RENOWN_BY_AUSPICE[patch.auspice] };
      }
      // Clear selected gifts whose source slot no longer matches the new breed/auspice/tribe
      if (patch.breed || patch.auspice || patch.tribe) {
        next.selectedGifts = prev.selectedGifts.filter((g) => {
          if (g.slotSource === 'breed' && patch.breed && patch.breed !== prev.breed) return false;
          if (g.slotSource === 'auspice' && patch.auspice && patch.auspice !== prev.auspice) return false;
          if (g.slotSource === 'tribe' && patch.tribe && patch.tribe !== prev.tribe) return false;
          return true;
        });
      }
      return next;
    });
  };

  const adjustPriorityAttr = (attr: AttributeKey, delta: number) => {
    setDraft((prev) => {
      const curPrio = prev.priorityAttributeDots[attr] ?? 0;
      const curFree = prev.freebieAttributeDots[attr] ?? 0;
      const nextPrio = curPrio + delta;
      if (nextPrio < 0 || 1 + nextPrio + curFree > 5) return prev;
      return {
        ...prev,
        priorityAttributeDots: { ...prev.priorityAttributeDots, [attr]: nextPrio },
      };
    });
  };

  const adjustFreebieAttr = (attr: AttributeKey, delta: number) => {
    setDraft((prev) => {
      const curPrio = prev.priorityAttributeDots[attr] ?? 0;
      const curFree = prev.freebieAttributeDots[attr] ?? 0;
      const nextFree = curFree + delta;
      if (nextFree < 0 || 1 + curPrio + nextFree > 5) return prev;
      return {
        ...prev,
        freebieAttributeDots: { ...prev.freebieAttributeDots, [attr]: nextFree },
      };
    });
  };

  const adjustPriorityAbility = (key: CanonicalAbilityKey, delta: number) => {
    setDraft((prev) => {
      const curPrio = prev.priorityAbilityDots[key] ?? 0;
      const curFree = prev.freebieAbilityDots[key] ?? 0;
      const nextPrio = curPrio + delta;
      if (nextPrio < 0 || nextPrio > 3 || nextPrio + curFree > 5) return prev;
      if (prev.breed === 'lupus' && delta > 0 && LUPUS_RESTRICTED_BASE_ABILITIES.has(key)) {
        return prev;
      }
      return {
        ...prev,
        priorityAbilityDots: { ...prev.priorityAbilityDots, [key]: nextPrio },
      };
    });
  };

  const adjustFreebieAbility = (key: CanonicalAbilityKey, delta: number) => {
    setDraft((prev) => {
      const curPrio = prev.priorityAbilityDots[key] ?? 0;
      const curFree = prev.freebieAbilityDots[key] ?? 0;
      const nextFree = curFree + delta;
      if (nextFree < 0 || curPrio + nextFree > 5) return prev;
      return {
        ...prev,
        freebieAbilityDots: { ...prev.freebieAbilityDots, [key]: nextFree },
      };
    });
  };

  const adjustBackground = (key: string, kind: 'priority' | 'freebie', delta: number) => {
    setDraft((prev) => {
      const prio = prev.priorityBackgroundDots[key] ?? 0;
      const free = prev.freebieBackgroundDots[key] ?? 0;
      const nextPrio = kind === 'priority' ? prio + delta : prio;
      const nextFree = kind === 'freebie' ? free + delta : free;
      if (nextPrio < 0 || nextFree < 0 || nextPrio + nextFree > 5) return prev;
      return {
        ...prev,
        priorityBackgroundDots: { ...prev.priorityBackgroundDots, [key]: nextPrio },
        freebieBackgroundDots: { ...prev.freebieBackgroundDots, [key]: nextFree },
      };
    });
  };

  const toggleGiftChoice = (giftId: string, slotSource: SelectedGiftChoice['slotSource']) => {
    setDraft((prev) => {
      const alreadySameSlot = prev.selectedGifts.some(
        (g) => g.giftId === giftId && g.slotSource === slotSource
      );
      if (slotSource === 'freebie') {
        if (alreadySameSlot) {
          return {
            ...prev,
            selectedGifts: prev.selectedGifts.filter(
              (g) => !(g.giftId === giftId && g.slotSource === 'freebie')
            ),
          };
        }
        if (prev.selectedGifts.some((g) => g.giftId === giftId)) return prev;
        return {
          ...prev,
          selectedGifts: [...prev.selectedGifts, { giftId, level: 1, slotSource: 'freebie' }],
        };
      }

      // Mandatory Breed / Auspice / Tribe single-select slot
      const filtered = prev.selectedGifts.filter(
        (g) => g.slotSource !== slotSource && g.giftId !== giftId
      );
      if (alreadySameSlot) {
        return { ...prev, selectedGifts: filtered };
      }
      return {
        ...prev,
        selectedGifts: [...filtered, { giftId, level: 1, slotSource }],
      };
    });
  };

  const togglePresetMeritFlaw = (item: MeritOrFlawChoice) => {
    setDraft((prev) => {
      const exists = prev.meritsAndFlaws.some((m) => m.id === item.id);
      return {
        ...prev,
        meritsAndFlaws: exists
          ? prev.meritsAndFlaws.filter((m) => m.id !== item.id)
          : [...prev.meritsAndFlaws, { ...item }],
      };
    });
  };

  const addCustomMeritFlaw = () => {
    if (!customMfName.trim()) return;
    const val = Math.max(1, Math.min(7, Math.floor(customMfPoints)));
    const entry: MeritOrFlawChoice = {
      id: `${customMfKind}-${crypto.randomUUID().slice(0, 8)}`,
      name: customMfName.trim(),
      kind: customMfKind,
      pointValue: val,
    };
    setDraft((prev) => ({
      ...prev,
      meritsAndFlaws: [...prev.meritsAndFlaws, entry],
    }));
    setCustomMfName('');
  };

  const handleSubmitCharacter = async () => {
    if (!summary.isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanedPortraits: Partial<Record<GarouForm, string>> = {};
      for (const formKey of ['homid', 'glabro', 'crinos', 'hispo', 'lupus'] as const) {
        const url = portraitsByForm[formKey]?.trim();
        if (url) cleanedPortraits[formKey] = url;
      }

      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionJwt}`,
        },
        body: JSON.stringify({
          campaignId,
          draft,
          deedName: deedName.trim() || undefined,
          selectedGiftIds: draft.selectedGifts.map((g) => g.giftId),
          portraitsByForm: Object.keys(cleanedPortraits).length > 0 ? cleanedPortraits : undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const obj = data as { error?: string; errors?: Array<{ field?: string; message: string }> };
        if (Array.isArray(obj.errors) && obj.errors.length > 0) {
          throw new Error(
            obj.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join(' | ')
          );
        }
        throw new Error(obj.error ?? `Character creation failed (${res.status}).`);
      }

      const charObj =
        data && typeof data === 'object' && 'character' in data
          ? (data as { character: W20CharacterState }).character
          : (data as W20CharacterState);
      onCreated(charObj);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save character.');
    } finally {
      setSubmitting(false);
    }
  };

  const breedGifts = gifts.filter((g) => g.sources.includes(draft.breed));
  const auspiceGifts = gifts.filter((g) => g.sources.includes(draft.auspice));
  const tribeGifts = gifts.filter((g) => g.sources.includes(draft.tribe));

  const ledger = summary.freebieLedger;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
        {/* Header + Step Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-extrabold tracking-wider uppercase">
              Rank 1 Cliath Creation Wizard
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step Navigation & Live Freebie Ledger Bar */}
        <div className="border-b border-zinc-800 bg-zinc-900/40 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  [1, '1. Identity'],
                  [2, '2. Attributes'],
                  [3, '3. Abilities'],
                  [4, '4. Backgrounds & Merits'],
                  [5, '5. Gifts & Review'],
                ] as const
              ).map(([num, label]) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setStep(num)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
                    step === num
                      ? 'bg-red-700 text-white'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px]">
              <span className="text-zinc-400">
                Freebies:{' '}
                <strong
                  className={
                    ledger.remainingFreebies < 0
                      ? 'text-red-400'
                      : ledger.remainingFreebies === 0
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                  }
                >
                  {ledger.remainingFreebies}
                </strong>{' '}
                / {ledger.totalAvailableFreebies} left
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">
                Flaws +{ledger.creditedFlawBonus} (raw {ledger.rawFlawPoints}/7 cap)
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Step Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {/* STEP 1: IDENTITY */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block">
                  <span className="font-bold text-zinc-300">Garou Name *</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setIdentityField({ name: e.target.value })}
                    placeholder="e.g. Walks-the-Ash"
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5"
                  />
                </label>

                <label className="block">
                  <span className="font-bold text-zinc-300">Deed Name (Optional)</span>
                  <input
                    type="text"
                    value={deedName}
                    onChange={(e) => setDeedName(e.target.value)}
                    placeholder="e.g. Silver-Fang's Bane"
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5"
                  />
                </label>

                <label className="block">
                  <span className="font-bold text-zinc-300">Concept</span>
                  <input
                    type="text"
                    value={draft.concept}
                    onChange={(e) => setIdentityField({ concept: e.target.value })}
                    placeholder="e.g. Urban Pack Scout / Umbral Mystic"
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5"
                  />
                </label>

                {draft.breed === 'metis' && (
                  <label className="block">
                    <span className="font-bold text-amber-300">Metis Deformity *</span>
                    <input
                      type="text"
                      value={draft.metisDeformity ?? ''}
                      onChange={(e) => setIdentityField({ metisDeformity: e.target.value })}
                      placeholder="e.g. Twisted Horns, Albino Pelt, Hairless"
                      className="mt-1 w-full rounded border border-amber-700/70 bg-zinc-900 px-3 py-1.5"
                    />
                  </label>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <span className="block font-bold text-zinc-300">Breed (Starting Gnosis)</span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {(['homid', 'metis', 'lupus'] as Breed[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setIdentityField({ breed: b })}
                        className={`rounded-lg border p-2 text-left capitalize transition ${
                          draft.breed === b
                            ? 'border-cyan-500 bg-cyan-950/40 text-cyan-100'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="font-bold">{b}</div>
                        <div className="text-[10px] text-zinc-400">
                          Gnosis {STARTING_GNOSIS_BY_BREED[b]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block font-bold text-zinc-300">Auspice (Starting Rage)</span>
                  <div className="mt-1 grid grid-cols-5 gap-1.5">
                    {(['ragabash', 'theurge', 'philodox', 'galliard', 'ahroun'] as Auspice[]).map(
                      (a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setIdentityField({ auspice: a })}
                          className={`rounded-lg border p-2 text-center capitalize transition ${
                            draft.auspice === a
                              ? 'border-red-500 bg-red-950/45 text-red-100'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{a}</div>
                          <div className="text-[10px] text-zinc-400">
                            Rage {STARTING_RAGE_BY_AUSPICE[a]}
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <label className="block">
                  <span className="font-bold text-zinc-300">Tribe (Starting Willpower)</span>
                  <select
                    value={draft.tribe}
                    onChange={(e) => setIdentityField({ tribe: e.target.value as GarouTribe })}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5"
                  >
                    {ALL_TRIBES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label} (Willpower {STARTING_WILLPOWER_BY_TRIBE[t.key]})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200">Starting Cliath Renown (Total 3)</span>
                    <span className="text-[10px] text-zinc-400">
                      {draft.auspice === 'ragabash'
                        ? 'Ragabash: Distribute any 3 dots'
                        : `Fixed by ${formatLabel(draft.auspice)}`}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(['glory', 'honor', 'wisdom'] as const).map((rKey) => {
                      const val = draft.startingRenown[rKey];
                      const isRagabash = draft.auspice === 'ragabash';
                      return (
                        <div
                          key={rKey}
                          className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5"
                        >
                          <span className="capitalize text-zinc-300">{rKey}</span>
                          <div className="flex items-center gap-1.5">
                            {isRagabash && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    startingRenown: {
                                      ...prev.startingRenown,
                                      [rKey]: Math.max(0, prev.startingRenown[rKey] - 1),
                                    },
                                  }))
                                }
                                className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                              >
                                -
                              </button>
                            )}
                            <span className="font-mono font-bold text-amber-300">{val}</span>
                            {isRagabash && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((prev) => {
                                    const curSum =
                                      prev.startingRenown.glory +
                                      prev.startingRenown.honor +
                                      prev.startingRenown.wisdom;
                                    if (curSum >= 3) return prev;
                                    return {
                                      ...prev,
                                      startingRenown: {
                                        ...prev.startingRenown,
                                        [rKey]: prev.startingRenown[rKey] + 1,
                                      },
                                    };
                                  })
                                }
                                className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ATTRIBUTES */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-zinc-400">
                Every Attribute begins with <strong>1 free dot</strong>. Assign{' '}
                <strong>7 / 5 / 3</strong> Priority dots across Physical, Social, and Mental, then
                optionally spend Freebie points ({W20_FREEBIE_COSTS.attribute} Freebies/dot; Rank 1
                cap 5).
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(['physical', 'social', 'mental'] as AttributeCategory[]).map((cat) => {
                  const tier = draft.attributePriorities[cat];
                  const budget = ATTR_TIER_DOTS[tier];
                  const spent = ATTRIBUTE_GROUPS[cat].reduce(
                    (sum, k) => sum + (draft.priorityAttributeDots[k] ?? 0),
                    0
                  );
                  return (
                    <div
                      key={cat}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="font-extrabold uppercase tracking-wide text-zinc-200">
                          {cat}
                        </span>
                        <select
                          value={tier}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              attributePriorities: swapPriorityMap(
                                prev.attributePriorities,
                                cat,
                                e.target.value as 'primary' | 'secondary' | 'tertiary'
                              ),
                            }))
                          }
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px]"
                        >
                          <option value="primary">Primary (7)</option>
                          <option value="secondary">Secondary (5)</option>
                          <option value="tertiary">Tertiary (3)</option>
                        </select>
                      </div>

                      <div className="mt-1.5 flex justify-between text-[11px]">
                        <span className="text-zinc-400">Priority Allocated</span>
                        <span
                          className={`font-mono font-bold ${
                            spent === budget ? 'text-emerald-400' : 'text-amber-300'
                          }`}
                        >
                          {spent} / {budget}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2.5">
                        {ATTRIBUTE_GROUPS[cat].map((attr) => {
                          const prio = draft.priorityAttributeDots[attr] ?? 0;
                          const free = draft.freebieAttributeDots[attr] ?? 0;
                          const total = 1 + prio + free;
                          return (
                            <div
                              key={attr}
                              className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold capitalize text-zinc-200">{attr}</span>
                                <span className="font-mono text-sm font-black text-emerald-300">
                                  {total}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
                                <div className="flex items-center gap-1">
                                  <span>Prio:</span>
                                  <button
                                    type="button"
                                    onClick={() => adjustPriorityAttr(attr, -1)}
                                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-bold hover:bg-zinc-700"
                                  >
                                    -
                                  </button>
                                  <span className="w-4 text-center font-mono text-zinc-200">
                                    {prio}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={total >= 5 || spent >= budget}
                                    onClick={() => adjustPriorityAttr(attr, 1)}
                                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-bold hover:bg-zinc-700 disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <span>Free ({W20_FREEBIE_COSTS.attribute}pt):</span>
                                  <button
                                    type="button"
                                    onClick={() => adjustFreebieAttr(attr, -1)}
                                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-bold hover:bg-zinc-700"
                                  >
                                    -
                                  </button>
                                  <span className="w-4 text-center font-mono text-amber-300">
                                    {free}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={total >= 5}
                                    onClick={() => adjustFreebieAttr(attr, 1)}
                                    className="rounded bg-zinc-800 px-1.5 py-0.5 font-bold hover:bg-zinc-700 disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: ABILITIES */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-zinc-400">
                Assign <strong>13 / 9 / 5</strong> Priority dots across Talents, Skills, and
                Knowledges (<strong>max 3 dots</strong> per Ability before Freebies;{' '}
                {W20_FREEBIE_COSTS.ability} Freebies/dot for dots 4–5).
                {draft.breed === 'lupus' && (
                  <span className="ml-1 font-semibold text-amber-300">
                    Lupus Garou cannot allocate base Priority dots to restricted human Abilities.
                  </span>
                )}
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(['talents', 'skills', 'knowledges'] as AbilityCategory[]).map((cat) => {
                  const tier = draft.abilityPriorities[cat];
                  const budget = ABIL_TIER_DOTS[tier];
                  const spent = ABILITY_GROUPS[cat].reduce(
                    (sum, k) => sum + (draft.priorityAbilityDots[k] ?? 0),
                    0
                  );
                  return (
                    <div
                      key={cat}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="font-extrabold uppercase tracking-wide text-zinc-200">
                          {cat}
                        </span>
                        <select
                          value={tier}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              abilityPriorities: swapPriorityMap(
                                prev.abilityPriorities,
                                cat,
                                e.target.value as 'primary' | 'secondary' | 'tertiary'
                              ),
                            }))
                          }
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px]"
                        >
                          <option value="primary">Primary (13)</option>
                          <option value="secondary">Secondary (9)</option>
                          <option value="tertiary">Tertiary (5)</option>
                        </select>
                      </div>

                      <div className="mt-1.5 flex justify-between text-[11px]">
                        <span className="text-zinc-400">Priority Allocated</span>
                        <span
                          className={`font-mono font-bold ${
                            spent === budget ? 'text-emerald-400' : 'text-amber-300'
                          }`}
                        >
                          {spent} / {budget}
                        </span>
                      </div>

                      <div className="mt-2.5 space-y-1.5">
                        {ABILITY_GROUPS[cat].map((abilKey) => {
                          const prio = draft.priorityAbilityDots[abilKey] ?? 0;
                          const free = draft.freebieAbilityDots[abilKey] ?? 0;
                          const total = prio + free;
                          const lupusRestricted =
                            draft.breed === 'lupus' && LUPUS_RESTRICTED_BASE_ABILITIES.has(abilKey);
                          return (
                            <div
                              key={abilKey}
                              className={`flex items-center justify-between rounded border px-2 py-1.5 ${
                                lupusRestricted
                                  ? 'border-amber-900/50 bg-amber-950/20'
                                  : 'border-zinc-800/80 bg-zinc-950/80'
                              }`}
                            >
                              <div className="min-w-0 pr-1">
                                <div className="truncate font-semibold text-zinc-200">
                                  {formatLabel(abilKey)}
                                </div>
                                {lupusRestricted && (
                                  <div className="text-[9px] text-amber-400">
                                    Lupus Restricted (Freebies only)
                                  </div>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2 text-[10px]">
                                <div className="flex items-center gap-0.5" title="Priority (cap 3)">
                                  <button
                                    type="button"
                                    onClick={() => adjustPriorityAbility(abilKey, -1)}
                                    className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700"
                                  >
                                    -
                                  </button>
                                  <span className="w-3 text-center font-mono text-zinc-200">
                                    {prio}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={
                                      lupusRestricted || prio >= 3 || total >= 5 || spent >= budget
                                    }
                                    onClick={() => adjustPriorityAbility(abilKey, 1)}
                                    className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700 disabled:opacity-35"
                                  >
                                    +
                                  </button>
                                </div>

                                <div
                                  className="flex items-center gap-0.5"
                                  title={`Freebie (${W20_FREEBIE_COSTS.ability}pt/dot)`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => adjustFreebieAbility(abilKey, -1)}
                                    className="rounded bg-zinc-800 px-1 font-bold text-amber-300 hover:bg-zinc-700"
                                  >
                                    -
                                  </button>
                                  <span className="w-3 text-center font-mono text-amber-300">
                                    {free}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={total >= 5}
                                    onClick={() => adjustFreebieAbility(abilKey, 1)}
                                    className="rounded bg-zinc-800 px-1 font-bold text-amber-300 hover:bg-zinc-700 disabled:opacity-35"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: BACKGROUNDS, CORE TRAITS & MERITS/FLAWS */}
          {step === 4 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Backgrounds */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="font-extrabold uppercase tracking-wide text-zinc-200">
                    Backgrounds (5 Base Dots + {W20_FREEBIE_COSTS.background}pt Freebie)
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    Base:{' '}
                    {Object.values(draft.priorityBackgroundDots).reduce((a, b) => a + b, 0)} / 5
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {CANONICAL_BACKGROUNDS.map((bg) => {
                    const prio = draft.priorityBackgroundDots[bg.key] ?? 0;
                    const free = draft.freebieBackgroundDots[bg.key] ?? 0;
                    const total = prio + free;
                    const isForbidden =
                      ((draft.tribe === 'bone_gnawers' || draft.tribe === 'glass_walkers') &&
                        bg.key === 'pure_breed') ||
                      (draft.tribe === 'red_talons' &&
                        ['resources', 'allies', 'contacts'].includes(bg.key)) ||
                      (draft.tribe === 'silent_striders' && bg.key === 'ancestors');
                    const isRequiredMin3 =
                      draft.tribe === 'silver_fangs' && bg.key === 'pure_breed';

                    return (
                      <div
                        key={bg.key}
                        className={`flex items-center justify-between rounded border px-2 py-1.5 ${
                          isForbidden
                            ? 'border-red-900/50 bg-red-950/20'
                            : isRequiredMin3
                              ? 'border-amber-700/60 bg-amber-950/20'
                              : 'border-zinc-800 bg-zinc-950/80'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-zinc-200">{bg.label}</div>
                          {isForbidden && (
                            <div className="text-[9px] text-red-400">Tribe Forbidden</div>
                          )}
                          {isRequiredMin3 && (
                            <div className="text-[9px] text-amber-300">Silver Fangs min 3</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px]">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => adjustBackground(bg.key, 'priority', -1)}
                              className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700"
                            >
                              -
                            </button>
                            <span className="w-3 text-center font-mono">{prio}</span>
                            <button
                              type="button"
                              disabled={isForbidden || total >= 5}
                              onClick={() => adjustBackground(bg.key, 'priority', 1)}
                              className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700 disabled:opacity-35"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex items-center gap-0.5 text-amber-300">
                            <button
                              type="button"
                              onClick={() => adjustBackground(bg.key, 'freebie', -1)}
                              className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700"
                            >
                              -
                            </button>
                            <span className="w-3 text-center font-mono">{free}</span>
                            <button
                              type="button"
                              disabled={isForbidden || total >= 5}
                              onClick={() => adjustBackground(bg.key, 'freebie', 1)}
                              className="rounded bg-zinc-800 px-1 font-bold hover:bg-zinc-700 disabled:opacity-35"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Core Trait Freebies & Merits / Flaws */}
              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="font-extrabold uppercase tracking-wide text-zinc-200">
                    Raise Rage, Gnosis &amp; Willpower with Freebies
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="text-[10px] font-bold uppercase text-red-400">
                        Rage ({W20_FREEBIE_COSTS.rage}pt/dot)
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-mono text-sm font-black">
                          {summary.finalComputedSheetPreview.rage}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieRageDots: Math.max(0, p.freebieRageDots - 1),
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieRageDots:
                                  STARTING_RAGE_BY_AUSPICE[p.auspice] + p.freebieRageDots >= 10
                                    ? p.freebieRageDots
                                    : p.freebieRageDots + 1,
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="text-[10px] font-bold uppercase text-cyan-400">
                        Gnosis ({W20_FREEBIE_COSTS.gnosis}pt/dot)
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-mono text-sm font-black">
                          {summary.finalComputedSheetPreview.gnosis}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieGnosisDots: Math.max(0, p.freebieGnosisDots - 1),
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieGnosisDots:
                                  STARTING_GNOSIS_BY_BREED[p.breed] + p.freebieGnosisDots >= 10
                                    ? p.freebieGnosisDots
                                    : p.freebieGnosisDots + 1,
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="text-[10px] font-bold uppercase text-indigo-400">
                        Willpower ({W20_FREEBIE_COSTS.willpower}pt/dot)
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-mono text-sm font-black">
                          {summary.finalComputedSheetPreview.willpower}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieWillpowerDots: Math.max(0, p.freebieWillpowerDots - 1),
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                freebieWillpowerDots:
                                  STARTING_WILLPOWER_BY_TRIBE[p.tribe] + p.freebieWillpowerDots >= 10
                                    ? p.freebieWillpowerDots
                                    : p.freebieWillpowerDots + 1,
                              }))
                            }
                            className="rounded bg-zinc-800 px-1.5 font-bold hover:bg-zinc-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Merits & Flaws */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="font-extrabold uppercase tracking-wide text-zinc-200">
                    Merits &amp; Flaws (Flaws cap +7 Freebies = max 22)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PRESET_MERITS_FLAWS.map((mf) => {
                      const active = draft.meritsAndFlaws.some((m) => m.id === mf.id);
                      return (
                        <button
                          key={mf.id}
                          type="button"
                          onClick={() => togglePresetMeritFlaw(mf)}
                          className={`rounded border px-2 py-1 text-[11px] font-semibold transition ${
                            active
                              ? mf.kind === 'merit'
                                ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                                : 'border-amber-500 bg-amber-950/60 text-amber-200'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {mf.name} ({mf.kind === 'merit' ? `-${mf.pointValue}` : `+${mf.pointValue}`})
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Merit / Flaw */}
                  <div className="mt-3 flex gap-1.5">
                    <input
                      type="text"
                      value={customMfName}
                      onChange={(e) => setCustomMfName(e.target.value)}
                      placeholder="Custom Merit or Flaw name"
                      className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    />
                    <select
                      value={customMfKind}
                      onChange={(e) => setCustomMfKind(e.target.value as 'merit' | 'flaw')}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                    >
                      <option value="merit">Merit</option>
                      <option value="flaw">Flaw</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={customMfPoints}
                      onChange={(e) => setCustomMfPoints(Number(e.target.value))}
                      className="w-12 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center font-mono"
                    />
                    <button
                      type="button"
                      onClick={addCustomMeritFlaw}
                      className="rounded bg-zinc-800 px-2.5 py-1 font-bold hover:bg-zinc-700"
                    >
                      Add
                    </button>
                  </div>

                  {draft.meritsAndFlaws.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {draft.meritsAndFlaws.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[10px]"
                        >
                          {m.name} ({m.kind} {m.pointValue}pt)
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                meritsAndFlaws: p.meritsAndFlaws.filter((x) => x.id !== m.id),
                              }))
                            }
                            className="text-zinc-400 hover:text-red-300"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: GIFTS & REVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              {giftFetchNote && (
                <div className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-[11px] text-amber-300">
                  {giftFetchNote}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(
                  [
                    ['breed', `Breed Gift (${formatLabel(draft.breed)})`, breedGifts],
                    ['auspice', `Auspice Gift (${formatLabel(draft.auspice)})`, auspiceGifts],
                    ['tribe', `Tribe Gift (${formatLabel(draft.tribe)})`, tribeGifts],
                  ] as const
                ).map(([slotSource, title, pool]) => (
                  <div
                    key={slotSource}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
                  >
                    <p className="font-extrabold uppercase tracking-wide text-zinc-200">{title}</p>
                    <p className="text-[10px] text-zinc-400">Pick exactly 1 Level 1 Gift</p>
                    <div className="mt-2 space-y-1.5">
                      {pool.map((g) => {
                        const selected = draft.selectedGifts.some(
                          (s) => s.giftId === g.id && s.slotSource === slotSource
                        );
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => toggleGiftChoice(g.id, slotSource)}
                            className={`w-full rounded-lg border p-2 text-left transition ${
                              selected
                                ? 'border-emerald-500 bg-emerald-950/45 text-emerald-100'
                                : 'border-zinc-800 bg-zinc-950/80 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            <div className="font-bold">{g.name}</div>
                            <div className="mt-0.5 text-[10px] text-zinc-400">
                              {g.system_summary}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Extra Freebie Level 1 Gifts */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="font-bold text-zinc-200">
                  Optional Extra Level 1 Gifts ({W20_FREEBIE_COSTS.levelOneGift} Freebies each)
                </p>
                <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {gifts.map((g) => {
                    const isFreebieSelected = draft.selectedGifts.some(
                      (s) => s.giftId === g.id && s.slotSource === 'freebie'
                    );
                    const isBaseSelected = draft.selectedGifts.some(
                      (s) => s.giftId === g.id && s.slotSource !== 'freebie'
                    );
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={isBaseSelected}
                        onClick={() => toggleGiftChoice(g.id, 'freebie')}
                        className={`rounded border px-2 py-1 text-[11px] transition ${
                          isFreebieSelected
                            ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        } disabled:opacity-35`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Form Portraits */}
              <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <summary className="cursor-pointer font-bold text-zinc-300">
                  Optional Shifted Form Portrait URLs
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(['homid', 'glabro', 'crinos', 'hispo', 'lupus'] as GarouForm[]).map((form) => (
                    <label key={form} className="flex items-center gap-2">
                      <span className="w-14 capitalize text-zinc-400">{form}</span>
                      <input
                        type="text"
                        value={portraitsByForm[form] ?? ''}
                        onChange={(e) =>
                          setPortraitsByForm((p) => ({ ...p, [form]: e.target.value }))
                        }
                        placeholder="/r2-assets/tokens/..."
                        className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                  ))}
                </div>
              </details>

              {/* Validation Review */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                <div className="flex items-center gap-2 font-bold">
                  {summary.isValid ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-300">
                        Sheet passes canonical W20 Rank 1 Cliath validation!
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <span className="text-red-300">
                        Resolve {summary.errors.length} validation issue(s) before creating:
                      </span>
                    </>
                  )}
                </div>

                {summary.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-red-300">
                    {summary.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                )}

                {summary.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-amber-300">
                    {summary.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}

                {submitError && (
                  <div className="mt-2 rounded border border-red-700 bg-red-950/70 p-2 text-[11px] text-red-200">
                    Server validation error: {submitError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/80 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4 | 5)}
              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              disabled={step === 5}
              onClick={() => setStep((s) => Math.min(5, s + 1) as 1 | 2 | 3 | 4 | 5)}
              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!summary.isValid && step !== 5 && (
              <span className="text-[11px] text-amber-300">
                {summary.errors.length} rule check(s) remaining
              </span>
            )}
            <button
              type="button"
              disabled={!summary.isValid || submitting}
              onClick={() => void handleSubmitCharacter()}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 font-extrabold uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? 'Forging Garou...' : 'Finalize & Save Garou'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
