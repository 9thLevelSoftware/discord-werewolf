import React, { useEffect, useMemo, useState } from 'react';
import { IconButton, Modal } from './ui';
import {
  ABILITY_GROUPS,
  AbilityCategory,
  ATTRIBUTE_GROUPS,
  AttributeCategory,
  AttributeKey,
  Auspice,
  BaseAttributes,
  Breed,
  CANONICAL_GIFT_CATALOG,
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
  W20_BACKGROUND_CATALOG,
  W20_FREEBIE_COSTS,
  W20_MERITS_FLAWS_CATALOG,
  W20CharacterCreationDraft,
  W20CharacterState,
} from '@w20-vtt/core';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useViewportLayout } from '../hooks/useViewportLayout';
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

const TRIBE_DISCOURAGED_BACKGROUNDS: Partial<Record<GarouTribe, readonly string[]>> = {
  bone_gnawers: ['resources'],
  get_of_fenris: ['contacts'],
  glass_walkers: ['mentor'],
  shadow_lords: ['allies', 'mentor'],
  silent_striders: ['resources'],
  stargazers: ['allies', 'fetish', 'resources'],
  wendigo: ['contacts', 'resources'],
};

const CANONICAL_LEVEL_1_GIFTS: CompendiumGiftRow[] = CANONICAL_GIFT_CATALOG.filter(
  (g) => g.level === 1
).map((g) => ({
  id: g.id,
  name: g.name,
  level: g.level,
  sources: [...g.sources],
  system_summary: g.summary,
}));

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
  customBackgroundLabels: {},
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
  campaignId?: string;
  sessionJwt?: string;
  getLatestSupabaseJwt?: () => Promise<string | null>;
  onClose: () => void;
  onCreated?: (character: W20CharacterState) => void;
  customSubmit?: (payload: {
    draft: W20CharacterCreationDraft;
    deedName?: string;
  }) => Promise<void>;
  defaultPlayerName?: string;
}

const INITIAL_DRAFT_JSON = JSON.stringify(INITIAL_DRAFT);

export const CharacterCreationWizard: React.FC<CharacterCreationWizardProps> = ({
  campaignId,
  sessionJwt,
  getLatestSupabaseJwt,
  onClose,
  onCreated,
  customSubmit,
  defaultPlayerName,
}) => {
  const { isMobile } = useViewportLayout();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [draft, setDraft] = useState<W20CharacterCreationDraft>(INITIAL_DRAFT);
  const [deedName, setDeedName] = useState('');
  const [portraitsByForm, setPortraitsByForm] = useState<Partial<Record<GarouForm, string>>>({});

  const [gifts, setGifts] = useState<CompendiumGiftRow[]>(CANONICAL_LEVEL_1_GIFTS);
  const [giftFetchNote, setGiftFetchNote] = useState<string | null>(null);

  // Step 4 Backgrounds filters & custom adder
  const [bgSearch, setBgSearch] = useState('');
  const [bgTierFilter, setBgTierFilter] = useState<'all' | 'core'>('all');
  const [customBgInput, setCustomBgInput] = useState('');

  // Step 4 Merits & Flaws filters & custom adder
  const [mfSearch, setMfSearch] = useState('');
  const [customMfName, setCustomMfName] = useState('');
  const [customMfKind, setCustomMfKind] = useState<'merit' | 'flaw'>('merit');
  const [customMfPoints, setCustomMfPoints] = useState(1);

  // Step 5 Custom Gift inputs per slot
  const [customGiftInputs, setCustomGiftInputs] = useState<{
    breed: string;
    auspice: string;
    tribe: string;
    freebie: string;
  }>({
    breed: '',
    auspice: '',
    tribe: '',
    freebie: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Closing asks for confirmation once anything has been entered.
  const isDirty = useMemo(
    () => deedName.trim() !== '' || JSON.stringify(draft) !== INITIAL_DRAFT_JSON,
    [draft, deedName]
  );

  // Load Level 1 Gifts from Supabase compendium_gifts when JWT getter is supplied; otherwise use CANONICAL_GIFT_CATALOG directly without warning
  useEffect(() => {
    if (!getLatestSupabaseJwt) {
      setGifts(CANONICAL_LEVEL_1_GIFTS);
      setGiftFetchNote(null);
      return;
    }

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

  const handleAddCustomBackground = () => {
    const cleanLabel = customBgInput.trim().slice(0, 80);
    if (!cleanLabel) return;
    const slug = cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const key = slug ? `custom_${slug}` : `custom_${crypto.randomUUID().slice(0, 6)}`;

    setDraft((prev) => {
      const baseSpent = Object.values(prev.priorityBackgroundDots).reduce((a, b) => a + b, 0);
      const alreadyHasDots =
        (prev.priorityBackgroundDots[key] ?? 0) + (prev.freebieBackgroundDots[key] ?? 0) > 0;
      return {
        ...prev,
        customBackgroundLabels: {
          ...(prev.customBackgroundLabels ?? {}),
          [key]: cleanLabel,
        },
        priorityBackgroundDots:
          !alreadyHasDots && baseSpent < 5
            ? { ...prev.priorityBackgroundDots, [key]: 1 }
            : prev.priorityBackgroundDots,
      };
    });
    setCustomBgInput('');
  };

  const handleRemoveCustomBackground = (key: string) => {
    setDraft((prev) => {
      const nextLabels = { ...(prev.customBackgroundLabels ?? {}) };
      delete nextLabels[key];
      const nextPrio = { ...prev.priorityBackgroundDots };
      delete nextPrio[key];
      const nextFree = { ...prev.freebieBackgroundDots };
      delete nextFree[key];
      return {
        ...prev,
        customBackgroundLabels: nextLabels,
        priorityBackgroundDots: nextPrio,
        freebieBackgroundDots: nextFree,
      };
    });
  };

  const handleSetCustomSlotGift = (slotSource: SelectedGiftChoice['slotSource']) => {
    const raw = customGiftInputs[slotSource].trim().slice(0, 120);
    if (!raw) return;
    toggleGiftChoice(raw, slotSource);
    setCustomGiftInputs((prev) => ({ ...prev, [slotSource]: '' }));
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
      const trimmedDeed = deedName.trim() || undefined;
      if (customSubmit) {
        await customSubmit({ draft, deedName: trimmedDeed });
        return;
      }

      if (!campaignId || !sessionJwt) {
        throw new Error('Campaign session is required to create a campaign character.');
      }

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
          deedName: trimmedDeed,
          selectedGiftIds: draft.selectedGifts
            .map((g) => g.giftId)
            .filter((id) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
            ),
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
      onCreated?.(charObj);
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
  const stepBtnClass = isMobile
    ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-stone-100 hover:bg-zinc-700 disabled:opacity-35'
    : 'rounded bg-zinc-800 px-1.5 py-0.5 font-bold hover:bg-zinc-700 disabled:opacity-40';
  const stepAmberBtnClass = isMobile
    ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-amber-300 hover:bg-zinc-700 disabled:opacity-35'
    : 'rounded bg-zinc-800 px-1 font-bold text-amber-300 hover:bg-zinc-700 disabled:opacity-35';

  const wizardFooter = (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4 | 5)}
              className="flex items-center gap-1 rounded border border-stone-700 bg-zinc-900 px-3 py-2 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              disabled={step === 5}
              onClick={() => setStep((s) => Math.min(5, s + 1) as 1 | 2 | 3 | 4 | 5)}
              className="flex items-center gap-1 rounded border border-stone-700 bg-zinc-900 px-3 py-2 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!summary.isValid && step !== 5 && !isMobile && (
              <span className="text-xs text-amber-300">
                {summary.errors.length} rule check(s) remaining
              </span>
            )}
            <button
              type="button"
              disabled={!summary.isValid || submitting}
              onClick={() => void handleSubmitCharacter()}
              className="w20-crimson-seal font-display rounded-xl px-4 py-2.5 font-black uppercase tracking-wider text-amber-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? 'Forging Garou...' : 'Finalize & Save Garou'}
            </button>
          </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Rank 1 Cliath Creation Wizard"
      variant={isMobile ? 'fullscreen' : 'center'}
      size="lg"
      bodyClassName="p-4 text-xs"
      dirty={isDirty}
      discardMessage="Discard this character? Everything entered will be lost."
      footer={wizardFooter}
      renderHeader={(requestClose) => (
        <>
        {/* Header + Step Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-amber-500/20 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
            <h2 className="font-display truncate text-sm font-black tracking-wider uppercase text-amber-100">
              Rank 1 Cliath Creation Wizard
            </h2>
            {defaultPlayerName?.trim() && (
              <span className="shrink-0 rounded-full border border-amber-500/35 bg-amber-950/35 px-2 py-0.5 text-xs font-semibold text-amber-200">
                {defaultPlayerName.trim()}
              </span>
            )}
          </div>
          <IconButton
            label="Close wizard"
            icon={<X className="h-4 w-4" />}
            size={isMobile ? 'touch' : 'md'}
            onClick={requestClose}
          />
        </div>

        {/* Step Navigation & Live Freebie Ledger Bar */}
        <div className="shrink-0 border-b border-amber-500/20 px-4 py-2.5">
          <div
            className={
              isMobile
                ? 'flex flex-col gap-2'
                : 'flex flex-wrap items-center justify-between gap-2'
            }
          >
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Creation steps">
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
                  role="tab"
                  aria-selected={step === num}
                  onClick={() => setStep(num)}
                  className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
                    step === num
                      ? 'bg-red-800/90 text-amber-50 shadow'
                      : 'bg-zinc-900 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-800 bg-zinc-950 px-3 py-1 text-xs">
              <span className="text-stone-400">
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
              <span className="text-stone-500">|</span>
              <span className="text-stone-400">
                Flaws +{ledger.creditedFlawBonus} (raw {ledger.rawFlawPoints}/7 cap)
              </span>
            </div>
          </div>
        </div>

        </>
      )}
    >
          {/* STEP 1: IDENTITY */}
          {step === 1 && (
            <div className={isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>
              <div className="space-y-3">
                <label className="block">
                  <span className="font-bold text-stone-300">Garou Name *</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setIdentityField({ name: e.target.value })}
                    placeholder="e.g. Walks-the-Ash"
                    className="mt-1 w-full rounded border border-stone-700 bg-zinc-900 px-3 py-1.5"
                  />
                </label>

                <label className="block">
                  <span className="font-bold text-stone-300">Deed Name (Optional)</span>
                  <input
                    type="text"
                    value={deedName}
                    onChange={(e) => setDeedName(e.target.value)}
                    placeholder="e.g. Silver-Fang's Bane"
                    className="mt-1 w-full rounded border border-stone-700 bg-zinc-900 px-3 py-1.5"
                  />
                </label>

                <label className="block">
                  <span className="font-bold text-stone-300">Concept</span>
                  <input
                    type="text"
                    value={draft.concept}
                    onChange={(e) => setIdentityField({ concept: e.target.value })}
                    placeholder="e.g. Urban Pack Scout / Umbral Mystic"
                    className="mt-1 w-full rounded border border-stone-700 bg-zinc-900 px-3 py-1.5"
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
                  <span className="block font-bold text-stone-300">Breed (Starting Gnosis)</span>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {(['homid', 'metis', 'lupus'] as Breed[]).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setIdentityField({ breed: b })}
                        className={`rounded-lg border p-2 text-left capitalize transition ${
                          draft.breed === b
                            ? 'border-cyan-500 bg-cyan-950/40 text-cyan-100'
                            : 'border-stone-800 bg-zinc-900 text-stone-300 hover:border-stone-700'
                        }`}
                      >
                        <div className="font-bold">{b}</div>
                        <div className="text-xs text-stone-400">
                          Gnosis {STARTING_GNOSIS_BY_BREED[b]}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block font-bold text-stone-300">Auspice (Starting Rage)</span>
                  <div className={isMobile ? 'mt-1 grid grid-cols-2 gap-1.5' : 'mt-1 grid grid-cols-5 gap-1.5'}>
                    {(['ragabash', 'theurge', 'philodox', 'galliard', 'ahroun'] as Auspice[]).map(
                      (a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setIdentityField({ auspice: a })}
                          className={`rounded-lg border p-2 text-center capitalize transition ${
                            draft.auspice === a
                              ? 'border-red-500 bg-red-950/45 text-red-100'
                              : 'border-stone-800 bg-zinc-900 text-stone-300 hover:border-stone-700'
                          }`}
                        >
                          <div className="text-xs font-bold">{a}</div>
                          <div className="text-xs text-stone-400">
                            Rage {STARTING_RAGE_BY_AUSPICE[a]}
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <label className="block">
                  <span className="font-bold text-stone-300">Tribe (Starting Willpower)</span>
                  <select
                    value={draft.tribe}
                    onChange={(e) => setIdentityField({ tribe: e.target.value as GarouTribe })}
                    className="mt-1 w-full rounded border border-stone-700 bg-zinc-900 px-3 py-1.5"
                  >
                    {ALL_TRIBES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label} (Willpower {STARTING_WILLPOWER_BY_TRIBE[t.key]})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-lg border border-stone-800 bg-zinc-900/70 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-200">Starting Cliath Renown (Total 3)</span>
                    <span className="text-xs text-stone-400">
                      {draft.auspice === 'ragabash'
                        ? 'Ragabash: Distribute any 3 dots'
                        : `Fixed by ${formatLabel(draft.auspice)}`}
                    </span>
                  </div>
                  <div className={isMobile ? 'mt-2 grid grid-cols-1 gap-2' : 'mt-2 grid grid-cols-3 gap-2'}>
                    {(['glory', 'honor', 'wisdom'] as const).map((rKey) => {
                      const val = draft.startingRenown[rKey];
                      const isRagabash = draft.auspice === 'ragabash';
                      return (
                        <div
                          key={rKey}
                          className="flex items-center justify-between rounded border border-stone-800 bg-zinc-950 px-2.5 py-1.5"
                        >
                          <span className="capitalize text-stone-300">{rKey}</span>
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
                                aria-label={`Decrease ${String(rKey)} renown`}
                                className={stepBtnClass}
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
                                aria-label={`Increase ${String(rKey)} renown`}
                                className={stepBtnClass}
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
              <p className="text-stone-400">
                Every Attribute begins with <strong>1 free dot</strong>. Assign{' '}
                <strong>7 / 5 / 3</strong> Priority dots across Physical, Social, and Mental, then
                optionally spend Freebie points ({W20_FREEBIE_COSTS.attribute} Freebies/dot; Rank 1
                cap 5).
              </p>

              <div className={isMobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
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
                      className="rounded-xl border border-stone-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                        <span className="font-extrabold uppercase tracking-wide text-stone-200">
                          {cat}
                        </span>
                        <select
                          aria-label={`${cat} priority`}
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
                          className="rounded border border-stone-700 bg-zinc-950 px-2 py-0.5 text-xs"
                        >
                          <option value="primary">Primary (7)</option>
                          <option value="secondary">Secondary (5)</option>
                          <option value="tertiary">Tertiary (3)</option>
                        </select>
                      </div>

                      <div className="mt-1.5 flex justify-between text-xs">
                        <span className="text-stone-400">Priority Allocated</span>
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
                              className="rounded-lg border border-stone-800/80 bg-zinc-950/80 p-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold capitalize text-stone-200">{attr}</span>
                                <span className="font-mono text-sm font-black text-emerald-300">
                                  {total}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between text-xs text-stone-400">
                                <div className="flex items-center gap-1">
                                  <span>Prio:</span>
                                  <button
                                    type="button"
                                    onClick={() => adjustPriorityAttr(attr, -1)}
                                    aria-label={`Decrease ${String(attr).replace(/_/g, " ")} priority dots`}
                                    className={stepBtnClass}
                                  >
                                    -
                                  </button>
                                  <span className="w-4 text-center font-mono text-stone-200">
                                    {prio}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={total >= 5 || spent >= budget}
                                    onClick={() => adjustPriorityAttr(attr, 1)}
                                    aria-label={`Increase ${String(attr).replace(/_/g, " ")} priority dots`}
                                    className={stepBtnClass}
                                  >
                                    +
                                  </button>
                                </div>

                                <div className="flex items-center gap-1">
                                  <span>Free ({W20_FREEBIE_COSTS.attribute}pt):</span>
                                  <button
                                    type="button"
                                    onClick={() => adjustFreebieAttr(attr, -1)}
                                    aria-label={`Decrease ${String(attr).replace(/_/g, " ")} freebie dots`}
                                    className={stepBtnClass}
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
                                    aria-label={`Increase ${String(attr).replace(/_/g, " ")} freebie dots`}
                                    className={stepBtnClass}
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
              <p className="text-stone-400">
                Assign <strong>13 / 9 / 5</strong> Priority dots across Talents, Skills, and
                Knowledges (<strong>max 3 dots</strong> per Ability before Freebies;{' '}
                {W20_FREEBIE_COSTS.ability} Freebies/dot for dots 4–5).
                {draft.breed === 'lupus' && (
                  <span className="ml-1 font-semibold text-amber-300">
                    Lupus Garou cannot allocate base Priority dots to restricted human Abilities.
                  </span>
                )}
              </p>

              <div className={isMobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
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
                      className="rounded-xl border border-stone-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                        <span className="font-extrabold uppercase tracking-wide text-stone-200">
                          {cat}
                        </span>
                        <select
                          aria-label={`${cat} priority`}
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
                          className="rounded border border-stone-700 bg-zinc-950 px-2 py-0.5 text-xs"
                        >
                          <option value="primary">Primary (13)</option>
                          <option value="secondary">Secondary (9)</option>
                          <option value="tertiary">Tertiary (5)</option>
                        </select>
                      </div>

                      <div className="mt-1.5 flex justify-between text-xs">
                        <span className="text-stone-400">Priority Allocated</span>
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
                                  : 'border-stone-800/80 bg-zinc-950/80'
                              }`}
                            >
                              <div className="min-w-0 pr-1">
                                <div className="truncate font-semibold text-stone-200">
                                  {formatLabel(abilKey)}
                                </div>
                                {lupusRestricted && (
                                  <div className="text-xs text-amber-400">
                                    Lupus Restricted (Freebies only)
                                  </div>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2 text-xs">
                                <div className="flex items-center gap-0.5" title="Priority (cap 3)">
                                  <button
                                    type="button"
                                    onClick={() => adjustPriorityAbility(abilKey, -1)}
                                    aria-label={`Decrease ${String(abilKey).replace(/_/g, " ")} priority dots`}
                                    className={stepBtnClass}
                                  >
                                    -
                                  </button>
                                  <span className="w-3 text-center font-mono text-stone-200">
                                    {prio}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={
                                      lupusRestricted || prio >= 3 || total >= 5 || spent >= budget
                                    }
                                    onClick={() => adjustPriorityAbility(abilKey, 1)}
                                    aria-label={`Increase ${String(abilKey).replace(/_/g, " ")} priority dots`}
                                    className={stepBtnClass}
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
                                    aria-label={`Decrease ${String(abilKey).replace(/_/g, " ")} freebie dots`}
                                    className={stepAmberBtnClass}
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
                                    aria-label={`Increase ${String(abilKey).replace(/_/g, " ")} freebie dots`}
                                    className={stepAmberBtnClass}
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
          {step === 4 && (() => {
            const bgCatalogKeys = new Set(W20_BACKGROUND_CATALOG.map((b) => b.key));
            const customKeys = new Set([
              ...Object.keys(draft.customBackgroundLabels ?? {}),
              ...Object.keys(draft.priorityBackgroundDots).filter((k) => !bgCatalogKeys.has(k)),
              ...Object.keys(draft.freebieBackgroundDots).filter((k) => !bgCatalogKeys.has(k)),
            ]);
            const customBgRows = Array.from(customKeys).map((key) => ({
              key,
              label:
                draft.customBackgroundLabels?.[key] || formatLabel(key.replace(/^custom_/, '')),
              tier: 'custom' as const,
              summary: 'Custom chronicle Background',
            }));
            const qBg = bgSearch.trim().toLowerCase();
            const filteredCatalogBgs = W20_BACKGROUND_CATALOG.filter((b) => {
              if (bgTierFilter === 'core' && b.tier !== 'core' && !qBg) {
                return (
                  (draft.priorityBackgroundDots[b.key] ?? 0) +
                    (draft.freebieBackgroundDots[b.key] ?? 0) >
                  0
                );
              }
              if (!qBg) return true;
              return (
                b.label.toLowerCase().includes(qBg) || b.summary.toLowerCase().includes(qBg)
              );
            });
            const displayedBackgrounds = [...customBgRows, ...filteredCatalogBgs];

            const qMf = mfSearch.trim().toLowerCase();
            const meritPresets = W20_MERITS_FLAWS_CATALOG.filter(
              (m) =>
                m.kind === 'merit' &&
                (!qMf ||
                  m.name.toLowerCase().includes(qMf) ||
                  (m.summary ?? '').toLowerCase().includes(qMf))
            );
            const flawPresets = W20_MERITS_FLAWS_CATALOG.filter(
              (m) =>
                m.kind === 'flaw' &&
                (!qMf ||
                  m.name.toLowerCase().includes(qMf) ||
                  (m.summary ?? '').toLowerCase().includes(qMf))
            );
            const selectedMerits = draft.meritsAndFlaws.filter((m) => m.kind === 'merit');
            const selectedFlaws = draft.meritsAndFlaws.filter((m) => m.kind === 'flaw');

            return (
              <div className={isMobile ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-4 lg:grid-cols-2'}>
                {/* Backgrounds */}
                <div className="rounded-xl border border-stone-800 bg-zinc-900/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
                    <span className="font-extrabold uppercase tracking-wide text-stone-200">
                      Backgrounds (5 Base + {W20_FREEBIE_COSTS.background}pt Freebie)
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      Base:{' '}
                      {Object.values(draft.priorityBackgroundDots).reduce((a, b) => a + b, 0)} / 5
                    </span>
                  </div>

                  {/* Filter + Custom Background Free-Text Adder */}
                  <div className="mt-2.5 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5">
                        <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                        <input
                          type="text"
                          value={bgSearch}
                          onChange={(e) => setBgSearch(e.target.value)}
                          aria-label="Filter backgrounds"
                          placeholder="Filter W20 Backgrounds (e.g. Fate, Caern)..."
                          className="min-w-0 flex-1 bg-transparent text-xs text-stone-100 placeholder-stone-500"
                        />
                      </div>
                      <div className="flex rounded-lg border border-stone-800 bg-zinc-950 p-0.5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setBgTierFilter('all')}
                          className={`rounded-md px-2 py-1 ${
                            bgTierFilter === 'all'
                              ? 'bg-zinc-800 text-amber-200'
                              : 'text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          All W20 ({W20_BACKGROUND_CATALOG.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setBgTierFilter('core')}
                          className={`rounded-md px-2 py-1 ${
                            bgTierFilter === 'core'
                              ? 'bg-zinc-800 text-amber-200'
                              : 'text-stone-400 hover:text-stone-200'
                          }`}
                        >
                          Core (12)
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={80}
                        value={customBgInput}
                        onChange={(e) => setCustomBgInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomBackground();
                          }
                        }}
                        aria-label="Custom background name"
                        placeholder="Type unlisted/custom Background..."
                        className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400/75"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomBackground}
                        className="flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg border border-amber-500/45 bg-amber-950/40 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-900/50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Custom
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 grid max-h-[380px] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {displayedBackgrounds.map((bg) => {
                      const prio = draft.priorityBackgroundDots[bg.key] ?? 0;
                      const free = draft.freebieBackgroundDots[bg.key] ?? 0;
                      const total = prio + free;
                      const isForbidden =
                        ((draft.tribe === 'bone_gnawers' || draft.tribe === 'glass_walkers') &&
                          (bg.key === 'pure_breed' || bg.key === 'ancestors')) ||
                        (draft.tribe === 'red_talons' &&
                          ['resources', 'allies', 'contacts'].includes(bg.key)) ||
                        (draft.tribe === 'silent_striders' && bg.key === 'ancestors');
                      const isRequiredMin3 =
                        draft.tribe === 'silver_fangs' && bg.key === 'pure_breed';
                      const isDiscouraged =
                        !isForbidden &&
                        (TRIBE_DISCOURAGED_BACKGROUNDS[draft.tribe] ?? []).includes(bg.key);

                      return (
                        <div
                          key={bg.key}
                          title={bg.summary}
                          className={`flex items-center justify-between gap-1.5 rounded border px-2 py-1.5 ${
                            isForbidden
                              ? 'border-red-900/50 bg-red-950/20'
                              : isRequiredMin3 || isDiscouraged
                                ? 'border-amber-700/60 bg-amber-950/20'
                                : bg.tier === 'custom'
                                  ? 'border-amber-500/40 bg-amber-950/15'
                                  : 'border-stone-800 bg-zinc-950/80'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="truncate font-semibold text-stone-200">
                                {bg.label}
                              </span>
                              {bg.tier === 'expanded' && (
                                <span className="shrink-0 rounded bg-zinc-800 px-1 py-0.2 text-xs font-bold uppercase text-stone-400">
                                  Exp
                                </span>
                              )}
                              {bg.tier === 'custom' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCustomBackground(bg.key)}
                                  aria-label={`Remove custom background ${bg.label}`}
                                  className="shrink-0 text-stone-400 hover:text-red-300"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                            {isForbidden && (
                              <div className="text-xs text-red-400">Tribe Forbidden</div>
                            )}
                            {isRequiredMin3 && (
                              <div className="text-xs text-amber-300">Silver Fangs min 3</div>
                            )}
                            {isDiscouraged && (
                              <div className="text-xs text-amber-400">Tribe Discouraged</div>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-2 text-xs">
                            <div className="flex items-center gap-0.5" title="Base Priority Dots">
                              <button
                                type="button"
                                onClick={() => adjustBackground(bg.key, 'priority', -1)}
                                aria-label={`Decrease ${String(bg.key).replace(/_/g, " ")} priority dots`}
                                className={stepBtnClass}
                              >
                                -
                              </button>
                              <span className="w-3 text-center font-mono">{prio}</span>
                              <button
                                type="button"
                                disabled={isForbidden || total >= 5}
                                onClick={() => adjustBackground(bg.key, 'priority', 1)}
                                aria-label={`Increase ${String(bg.key).replace(/_/g, " ")} priority dots`}
                                className={stepBtnClass}
                              >
                                +
                              </button>
                            </div>

                            <div className="flex items-center gap-0.5 text-amber-300" title="Freebie Dots">
                              <button
                                type="button"
                                onClick={() => adjustBackground(bg.key, 'freebie', -1)}
                                aria-label={`Decrease ${String(bg.key).replace(/_/g, " ")} freebie dots`}
                                className={stepAmberBtnClass}
                              >
                                -
                              </button>
                              <span className="w-3 text-center font-mono">{free}</span>
                              <button
                                type="button"
                                disabled={isForbidden || total >= 5}
                                onClick={() => adjustBackground(bg.key, 'freebie', 1)}
                                aria-label={`Increase ${String(bg.key).replace(/_/g, " ")} freebie dots`}
                                className={stepAmberBtnClass}
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

                {/* Core Trait Freebies & Visually Differentiated Merits / Flaws */}
                <div className="space-y-3">
                  <div className="rounded-xl border border-stone-800 bg-zinc-900/60 p-3">
                    <p className="font-extrabold uppercase tracking-wide text-stone-200">
                      Raise Rage, Gnosis &amp; Willpower with Freebies
                    </p>
                    <div className={isMobile ? 'mt-2 grid grid-cols-1 gap-2' : 'mt-2 grid grid-cols-3 gap-2'}>
                      <div className="rounded border border-stone-800 bg-zinc-950 p-2">
                        <div className="text-xs font-bold uppercase text-red-400">
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
                              aria-label={`Decrease Rage freebie dots`}
                              className={stepBtnClass}
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
                              aria-label={`Increase Rage freebie dots`}
                              className={stepBtnClass}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded border border-stone-800 bg-zinc-950 p-2">
                        <div className="text-xs font-bold uppercase text-cyan-400">
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
                              aria-label={`Decrease Gnosis freebie dots`}
                              className={stepBtnClass}
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
                              aria-label={`Increase Gnosis freebie dots`}
                              className={stepBtnClass}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded border border-stone-800 bg-zinc-950 p-2">
                        <div className="text-xs font-bold uppercase text-indigo-400">
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
                              aria-label={`Decrease Willpower freebie dots`}
                              className={stepBtnClass}
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((p) => ({
                                  ...p,
                                  freebieWillpowerDots:
                                    STARTING_WILLPOWER_BY_TRIBE[p.tribe] +
                                      p.freebieWillpowerDots >=
                                    10
                                      ? p.freebieWillpowerDots
                                      : p.freebieWillpowerDots + 1,
                                }))
                              }
                              aria-label={`Increase Willpower freebie dots`}
                              className={stepBtnClass}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visually Differentiated Merits & Flaws */}
                  <div className="space-y-3 rounded-xl border border-stone-800 bg-zinc-900/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-extrabold uppercase tracking-wide text-stone-200">
                        Merits &amp; Flaws
                      </p>
                      <span className="text-xs font-semibold text-stone-400">
                        Flaws grant Freebies (max +{W20_FREEBIE_COSTS.maxFlawBonus} = 22)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5">
                      <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                      <input
                        type="text"
                        value={mfSearch}
                        onChange={(e) => setMfSearch(e.target.value)}
                        aria-label="Filter merits and flaws"
                        placeholder="Filter Merits & Flaws..."
                        className="min-w-0 flex-1 bg-transparent text-xs text-stone-100 placeholder-stone-500"
                      />
                    </div>

                    {/* Merits Sub-Panel (Emerald Boons) */}
                    <div className="rounded-xl border border-emerald-700/45 bg-emerald-950/15 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Merits (Cost Freebies)
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-300">
                          Cost: {ledger.spentBreakdown.merits}pt
                        </span>
                      </div>
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                        {meritPresets.map((mf) => {
                          const active = draft.meritsAndFlaws.some((m) => m.id === mf.id);
                          return (
                            <button
                              key={mf.id}
                              type="button"
                              onClick={() => togglePresetMeritFlaw(mf)}
                              title={mf.summary}
                              className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                                active
                                  ? 'border-emerald-400 bg-emerald-800/55 text-white shadow-[0_0_8px_rgba(16,185,129,0.25)]'
                                  : 'border-emerald-800/55 bg-emerald-950/30 text-emerald-100/85 hover:border-emerald-500/70'
                              }`}
                            >
                              {mf.name} (-{mf.pointValue}pt)
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Flaws Sub-Panel (Crimson/Rose Drawbacks) */}
                    <div className="rounded-xl border border-rose-700/45 bg-rose-950/15 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-rose-300">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Flaws (+Bonus Freebies)
                        </span>
                        <span className="font-mono text-xs font-bold text-rose-300">
                          Bonus: +{ledger.creditedFlawBonus}/{W20_FREEBIE_COSTS.maxFlawBonus}pt
                        </span>
                      </div>
                      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1">
                        {flawPresets.map((mf) => {
                          const active = draft.meritsAndFlaws.some((m) => m.id === mf.id);
                          return (
                            <button
                              key={mf.id}
                              type="button"
                              onClick={() => togglePresetMeritFlaw(mf)}
                              title={mf.summary}
                              className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                                active
                                  ? 'border-rose-400 bg-rose-900/55 text-white shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                                  : 'border-rose-900/60 bg-rose-950/30 text-rose-100/85 hover:border-rose-500/70'
                              }`}
                            >
                              {mf.name} (+{mf.pointValue}pt)
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Mobile & Desktop Custom Merit / Flaw Adder */}
                    <div className="space-y-2 rounded-lg border border-stone-800 bg-zinc-950/80 p-2.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomMfKind('merit')}
                          className={`rounded-lg border py-1.5 text-xs font-bold transition ${
                            customMfKind === 'merit'
                              ? 'border-emerald-400/75 bg-emerald-950/60 text-emerald-200'
                              : 'border-stone-800 bg-zinc-900 text-stone-400'
                          }`}
                        >
                          + Custom Merit (Cost)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomMfKind('flaw')}
                          className={`rounded-lg border py-1.5 text-xs font-bold transition ${
                            customMfKind === 'flaw'
                              ? 'border-rose-400/75 bg-rose-950/60 text-rose-200'
                              : 'border-stone-800 bg-zinc-900 text-stone-400'
                          }`}
                        >
                          + Custom Flaw (+Bonus)
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <input
                          type="text"
                          value={customMfName}
                          onChange={(e) => setCustomMfName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addCustomMeritFlaw();
                            }
                          }}
                          aria-label="Custom merit or flaw name"
                          placeholder={
                            customMfKind === 'merit'
                              ? 'Type custom Merit name...'
                              : 'Type custom Flaw name...'
                          }
                          className="min-h-[40px] min-w-[140px] flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-stone-100"
                        />
                        <input
                          type="number"
                          min={1}
                          max={7}
                          value={customMfPoints}
                          onChange={(e) =>
                            setCustomMfPoints(Math.max(1, Math.min(7, Number(e.target.value) || 1)))
                          }
                          aria-label="Points"
                          className="min-h-[40px] w-14 rounded-lg border border-stone-700 bg-zinc-950 px-2 py-1 text-center font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={addCustomMeritFlaw}
                          className={`min-h-[40px] rounded-lg border px-3 py-1.5 font-bold ${
                            customMfKind === 'merit'
                              ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-200 hover:bg-emerald-900/50'
                              : 'border-rose-500/50 bg-rose-950/50 text-rose-200 hover:bg-rose-900/50'
                          }`}
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Separated Selected Summary */}
                    {draft.meritsAndFlaws.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {selectedMerits.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-xs font-bold uppercase text-emerald-400">
                              Merits:
                            </span>
                            {selectedMerits.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-600/50 bg-emerald-950/45 px-2 py-0.5 text-xs font-semibold text-emerald-100"
                              >
                                {m.name} (-{m.pointValue}pt)
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft((p) => ({
                                      ...p,
                                      meritsAndFlaws: p.meritsAndFlaws.filter((x) => x.id !== m.id),
                                    }))
                                  }
                                  className="text-emerald-300/70 hover:text-red-300"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {selectedFlaws.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-xs font-bold uppercase text-rose-400">
                              Flaws:
                            </span>
                            {selectedFlaws.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 rounded-md border border-rose-600/50 bg-rose-950/45 px-2 py-0.5 text-xs font-semibold text-rose-100"
                              >
                                {m.name} (+{m.pointValue}pt)
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraft((p) => ({
                                      ...p,
                                      meritsAndFlaws: p.meritsAndFlaws.filter((x) => x.id !== m.id),
                                    }))
                                  }
                                  className="text-rose-300/70 hover:text-red-200"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* STEP 5: GIFTS & REVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              {giftFetchNote && (
                <div className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-300">
                  {giftFetchNote}
                </div>
              )}

              <div className={isMobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
                {(
                  [
                    ['breed', `Breed Gift (${formatLabel(draft.breed)})`, breedGifts],
                    ['auspice', `Auspice Gift (${formatLabel(draft.auspice)})`, auspiceGifts],
                    ['tribe', `Tribe Gift (${formatLabel(draft.tribe)})`, tribeGifts],
                  ] as const
                ).map(([slotSource, title, pool]) => {
                  const selectedCustomInSlot = draft.selectedGifts.find(
                    (s) =>
                      s.slotSource === slotSource &&
                      !pool.some((pg) => pg.id === s.giftId)
                  );
                  return (
                    <div
                      key={slotSource}
                      className="flex flex-col justify-between rounded-xl border border-stone-800 bg-zinc-900/60 p-3"
                    >
                      <div>
                        <p className="font-extrabold uppercase tracking-wide text-stone-200">
                          {title}
                        </p>
                        <p className="text-xs text-stone-400">Pick 1 or type custom Level 1 Gift</p>
                        <div className="mt-2 space-y-1.5">
                          {selectedCustomInSlot && (
                            <button
                              type="button"
                              onClick={() => toggleGiftChoice(selectedCustomInSlot.giftId, slotSource)}
                              className="w-full rounded-lg border border-emerald-500 bg-emerald-950/45 p-2 text-left text-emerald-100"
                            >
                              <div className="font-bold">
                                {selectedCustomInSlot.giftId} (Custom)
                              </div>
                              <div className="mt-0.5 text-xs text-emerald-300/80">
                                Custom Level 1 {formatLabel(slotSource)} Gift — tap to deselect
                              </div>
                            </button>
                          )}
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
                                    : 'border-stone-800 bg-zinc-950/80 text-stone-300 hover:border-stone-700'
                                }`}
                              >
                                <div className="font-bold">{g.name}</div>
                                <div className="mt-0.5 text-xs text-stone-400">
                                  {g.system_summary}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-2.5 flex gap-1 border-t border-stone-800 pt-2">
                        <input
                          type="text"
                          maxLength={120}
                          value={customGiftInputs[slotSource]}
                          onChange={(e) =>
                            setCustomGiftInputs((prev) => ({
                              ...prev,
                              [slotSource]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSetCustomSlotGift(slotSource);
                            }
                          }}
                          aria-label={`Custom ${slotSource} gift name`}
                          placeholder={`Custom ${slotSource} Gift...`}
                          className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2 py-1 text-xs text-stone-100 placeholder-stone-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetCustomSlotGift(slotSource)}
                          className="min-h-[36px] shrink-0 rounded-lg border border-amber-500/45 bg-amber-950/35 px-2.5 text-xs font-bold text-amber-200 hover:bg-amber-900/45"
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Extra Freebie Level 1 Gifts */}
              <div className="rounded-xl border border-stone-800 bg-zinc-900/50 p-3">
                <p className="font-bold text-stone-200">
                  Optional Extra Level 1 Gifts ({W20_FREEBIE_COSTS.levelOneGift} Freebies each)
                </p>
                <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                  {draft.selectedGifts
                    .filter(
                      (s) =>
                        s.slotSource === 'freebie' && !gifts.some((g) => g.id === s.giftId)
                    )
                    .map((customFree) => (
                      <button
                        key={customFree.giftId}
                        type="button"
                        onClick={() => toggleGiftChoice(customFree.giftId, 'freebie')}
                        className="rounded border border-amber-500 bg-amber-950/60 px-2 py-1 text-xs text-amber-200"
                      >
                        {customFree.giftId} (Custom) ×
                      </button>
                    ))}
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
                        className={`rounded border px-2 py-1 text-xs transition ${
                          isFreebieSelected
                            ? 'border-amber-500 bg-amber-950/60 text-amber-200'
                            : 'border-stone-800 bg-zinc-950 text-stone-400 hover:text-stone-200'
                        } disabled:opacity-35`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    maxLength={120}
                    value={customGiftInputs.freebie}
                    onChange={(e) =>
                      setCustomGiftInputs((prev) => ({ ...prev, freebie: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSetCustomSlotGift('freebie');
                      }
                    }}
                    aria-label="Custom extra gift name"
                    placeholder="Type custom extra Level 1 Gift..."
                    className="min-h-[38px] min-w-0 flex-1 rounded-lg border border-stone-700 bg-zinc-950 px-2.5 py-1 text-xs text-stone-100 placeholder-stone-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSetCustomSlotGift('freebie')}
                    className="min-h-[38px] shrink-0 rounded-lg border border-amber-500/45 bg-amber-950/35 px-3 text-xs font-bold text-amber-200 hover:bg-amber-900/45"
                  >
                    + Add Gift
                  </button>
                </div>
              </div>

              {/* Optional Form Portraits */}
              <details className="rounded-xl border border-stone-800 bg-zinc-900/40 p-3">
                <summary className="cursor-pointer font-bold text-stone-300">
                  Optional Shifted Form Portrait URLs
                </summary>
                <div className={isMobile ? 'mt-2 grid grid-cols-1 gap-2' : 'mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2'}>
                  {(['homid', 'glabro', 'crinos', 'hispo', 'lupus'] as GarouForm[]).map((form) => (
                    <label key={form} className="flex items-center gap-2">
                      <span className="w-14 capitalize text-stone-400">{form}</span>
                      <input
                        type="text"
                        value={portraitsByForm[form] ?? ''}
                        onChange={(e) =>
                          setPortraitsByForm((p) => ({ ...p, [form]: e.target.value }))
                        }
                        placeholder="/r2-assets/tokens/..."
                        className="flex-1 rounded border border-stone-700 bg-zinc-950 px-2 py-1"
                      />
                    </label>
                  ))}
                </div>
              </details>

              {/* Validation Review */}
              <div className="rounded-xl border border-stone-800 bg-zinc-900/80 p-3">
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
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-300">
                    {summary.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                )}

                {summary.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-300">
                    {summary.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}

                {submitError && (
                  <div className="mt-2 rounded border border-red-700 bg-red-950/70 p-2 text-xs text-red-200">
                    Server validation error: {submitError}
                  </div>
                )}
              </div>
            </div>
          )}
    </Modal>
  );
};
