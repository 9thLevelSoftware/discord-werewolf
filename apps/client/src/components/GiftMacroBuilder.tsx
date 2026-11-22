import React, { useState } from 'react';
import {
  AttributeKey,
  CANONICAL_W20_PRESETS,
  CanonicalMacroPresetKey,
  DamageType,
  GarouForm,
  MacroDifficultySource,
  MacroEffectPayload,
  W20MacroDefinition,
} from '@w20-vtt/core';
import { X } from 'lucide-react';
import { useVttRoomStore } from '../store/useVttRoomStore';

const ALL_ATTRIBUTES: AttributeKey[] = [
  'strength',
  'dexterity',
  'stamina',
  'charisma',
  'manipulation',
  'appearance',
  'perception',
  'intelligence',
  'wits',
];

const ALL_FORMS: GarouForm[] = ['homid', 'glabro', 'crinos', 'hispo', 'lupus'];

interface GiftMacroBuilderProps {
  characterId?: string;
  onSave?: (macro: W20MacroDefinition) => void;
  onClose?: () => void;
}

export const GiftMacroBuilder: React.FC<GiftMacroBuilderProps> = ({
  characterId,
  onSave,
  onClose,
}) => {
  const activeCharacterId = useVttRoomStore((s) => s.activeCharacterId);
  const characters = useVttRoomStore((s) => s.characters);
  const sendCommand = useVttRoomStore((s) => s.sendCommand);

  const targetCharId = characterId ?? activeCharacterId;

  const [selectedPreset, setSelectedPreset] = useState<CanonicalMacroPresetKey>('razor_claws');
  const [draft, setDraft] = useState<W20MacroDefinition>(() => ({
    ...CANONICAL_W20_PRESETS.razor_claws,
    costs: { ...CANONICAL_W20_PRESETS.razor_claws.costs },
    effects: [...CANONICAL_W20_PRESETS.razor_claws.effects],
  }));
  const [execTargetId, setExecTargetId] = useState<string>('');
  const [spendWpOnRoll, setSpendWpOnRoll] = useState(false);

  const loadPreset = (key: CanonicalMacroPresetKey) => {
    setSelectedPreset(key);
    const p = CANONICAL_W20_PRESETS[key];
    setDraft({
      ...p,
      costs: { ...p.costs },
      effects: [...p.effects],
      requiredForms: p.requiredForms ? [...p.requiredForms] : undefined,
    });
  };

  const setCost = (field: 'rage' | 'gnosis' | 'willpower', rawVal: number) => {
    const val = Math.max(0, Math.min(10, Math.floor(rawVal || 0)));
    setDraft((prev) => ({
      ...prev,
      costs: {
        rage: field === 'gnosis' && val > 0 ? 0 : field === 'rage' ? val : prev.costs.rage,
        gnosis: field === 'rage' && val > 0 ? 0 : field === 'gnosis' ? val : prev.costs.gnosis,
        willpower: field === 'willpower' ? val : prev.costs.willpower,
      },
    }));
  };

  const toggleRequiredForm = (form: GarouForm) => {
    setDraft((prev) => {
      const current = prev.requiredForms ?? [];
      const next = current.includes(form)
        ? current.filter((f) => f !== form)
        : [...current, form];
      return {
        ...prev,
        requiredForms: next.length > 0 ? next : undefined,
      };
    });
  };

  const primaryEffect: MacroEffectPayload = draft.effects[0] ?? {
    type: 'storyteller_secret_whisper',
    promptTemplate: 'Gift effect triggered',
  };

  const setPrimaryEffectType = (nextType: MacroEffectPayload['type']) => {
    let nextEffect: MacroEffectPayload;
    switch (nextType) {
      case 'buff_claw_damage':
        nextEffect = { type: 'buff_claw_damage', bonusDice: 2, durationRounds: 10 };
        break;
      case 'buff_soak_per_success':
        nextEffect = { type: 'buff_soak_per_success', maxCap: 5, durationRounds: 10 };
        break;
      case 'buff_initiative_flat':
        nextEffect = { type: 'buff_initiative_flat', bonus: 10, durationRounds: 1 };
        break;
      case 'heal_wounds':
        nextEffect = { type: 'heal_wounds', levels: 1, healAggravated: true };
        break;
      case 'weapon_strike':
        nextEffect = {
          type: 'weapon_strike',
          damageBonus: 2,
          damageType: 'aggravated',
          isSilver: false,
        };
        break;
      case 'storyteller_secret_whisper':
        nextEffect = {
          type: 'storyteller_secret_whisper',
          promptTemplate: draft.summary || 'Storyteller effect triggered',
        };
        break;
    }
    setDraft((prev) => ({ ...prev, effects: [nextEffect] }));
  };

  const handleSaveAndTest = (executeImmediately: boolean) => {
    const cleanName = draft.name.trim() || 'Unnamed W20 Gift';
    const finalized: W20MacroDefinition = {
      ...draft,
      id: draft.id.trim() || crypto.randomUUID(),
      name: cleanName,
      summary: draft.summary.trim() || cleanName,
    };

    if (targetCharId) {
      sendCommand({
        type: 'CHARACTER_SAVE_MACRO',
        characterId: targetCharId,
        macro: finalized,
      });
    }

    onSave?.(finalized);

    if (executeImmediately && targetCharId) {
      sendCommand({
        type: 'EXECUTE_MACRO',
        characterId: targetCharId,
        macro: finalized,
        targetCharacterId: execTargetId || undefined,
        spendWillpowerOnRoll: spendWpOnRoll || undefined,
      });
    }
  };

  const characterList = Object.values(characters);

  return (
    <div className="w-full text-xs text-stone-100">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-stone-800 pb-2">
        <h3 className="text-sm font-display font-extrabold tracking-wide uppercase text-amber-100">
          W20 Gift &amp; Fetish Macro Builder
        </h3>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Load a preset"
            value={selectedPreset}
            onChange={(e) => loadPreset(e.target.value as CanonicalMacroPresetKey)}
            className="rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-xs"
          >
            {(Object.keys(CANONICAL_W20_PRESETS) as CanonicalMacroPresetKey[]).map((key) => (
              <option key={key} value={key}>
                Preset: {CANONICAL_W20_PRESETS[key].name}
              </option>
            ))}
          </select>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close macro builder"
              className="rounded p-1 text-stone-400 hover:bg-zinc-800 hover:text-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="grid grid-cols-12 gap-2">
          <input
            aria-label="Gift, Rite, or Fetish Name"
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value, id: crypto.randomUUID() })}
            placeholder="Gift, Rite, or Fetish Name"
            className="col-span-6 rounded border border-stone-700 bg-zinc-900 px-2.5 py-1.5 font-semibold"
          />
          <select
            aria-label="Category"
            value={draft.category}
            onChange={(e) =>
              setDraft({
                ...draft,
                category: e.target.value as W20MacroDefinition['category'],
              })
            }
            className="col-span-4 rounded border border-stone-700 bg-zinc-900 px-2 py-1.5 capitalize"
          >
            <option value="gift">Gift</option>
            <option value="rite">Rite</option>
            <option value="fetish">Fetish</option>
            <option value="talen">Talen</option>
          </select>
          <input
            aria-label="Rank or level"
            type="number"
            min={0}
            max={6}
            value={draft.rankOrLevel}
            onChange={(e) =>
              setDraft({
                ...draft,
                rankOrLevel: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
              })
            }
            title="Rank / Level (0-6)"
            className="col-span-2 rounded border border-stone-700 bg-zinc-900 px-2 py-1.5 text-center font-mono"
          />
        </div>

        {/* Resource Costs (Mutually Exclusive Rage vs Gnosis) */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-stone-800 bg-zinc-900/70 p-2">
          {(['rage', 'gnosis', 'willpower'] as const).map((res) => (
            <label key={res} className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase text-stone-400">{res} Cost</span>
              <input
                type="number"
                min={0}
                max={5}
                value={draft.costs[res]}
                onChange={(e) => setCost(res, Number(e.target.value))}
                className="rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
              />
            </label>
          ))}
        </div>

        {/* Roll Pool Selector */}
        <div className="space-y-1.5">
          <span className="font-semibold text-stone-300">Activation Roll Type</span>
          <select
            aria-label="Activation roll type"
            value={draft.pool.kind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === 'no_roll_instant') {
                setDraft({ ...draft, pool: { kind: 'no_roll_instant' } });
              } else if (kind === 'permanent_trait') {
                setDraft({ ...draft, pool: { kind: 'permanent_trait', trait: 'gnosis' } });
              } else if (kind === 'fetish_gnosis_rating') {
                setDraft({ ...draft, pool: { kind: 'fetish_gnosis_rating', rating: 6 } });
              } else {
                setDraft({
                  ...draft,
                  pool: { kind: 'attribute_ability', attribute: 'perception', ability: 'occult' },
                });
              }
            }}
            className="w-full rounded border border-stone-700 bg-zinc-900 px-2 py-1.5"
          >
            <option value="no_roll_instant">Instant Spend (No Dice Roll)</option>
            <option value="attribute_ability">Attribute + Ability Pool</option>
            <option value="permanent_trait">Pure Permanent Trait (Rage / Gnosis / WP)</option>
            <option value="fetish_gnosis_rating">Fetish Spirit Gnosis Rating</option>
          </select>

          {draft.pool.kind === 'attribute_ability' && (
            <div className="flex gap-2">
              <select
                aria-label="Pool attribute"
                value={draft.pool.attribute}
                onChange={(e) => {
                  const pool = draft.pool;
                  if (pool.kind !== 'attribute_ability') return;
                  setDraft({
                    ...draft,
                    pool: { ...pool, attribute: e.target.value as AttributeKey },
                  });
                }}
                className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1 capitalize"
              >
                {ALL_ATTRIBUTES.map((attr) => (
                  <option key={attr} value={attr}>
                    {attr}
                  </option>
                ))}
              </select>
              <input
                aria-label="Ability"
                type="text"
                value={draft.pool.ability ?? ''}
                onChange={(e) => {
                  const pool = draft.pool;
                  if (pool.kind !== 'attribute_ability') return;
                  const val = e.target.value.trim();
                  setDraft({
                    ...draft,
                    pool: {
                      kind: 'attribute_ability',
                      attribute: pool.attribute,
                      ...(val ? { ability: val } : {}),
                    },
                  });
                }}
                placeholder="Ability (e.g. occult)"
                className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1"
              />
            </div>
          )}

          {draft.pool.kind === 'permanent_trait' && (
            <select
              aria-label="Pool trait"
              value={draft.pool.trait}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  pool: {
                    kind: 'permanent_trait',
                    trait: e.target.value as 'rage' | 'gnosis' | 'willpower',
                  },
                })
              }
              className="w-full rounded border border-stone-700 bg-zinc-900 px-2 py-1 capitalize"
            >
              <option value="gnosis">Permanent Gnosis</option>
              <option value="rage">Permanent Rage</option>
              <option value="willpower">Permanent Willpower</option>
            </select>
          )}

          {draft.pool.kind === 'fetish_gnosis_rating' && (
            <label className="flex items-center justify-between rounded border border-stone-800 bg-zinc-900 px-2.5 py-1">
              <span className="text-stone-300">Fetish Gnosis Rating (1-10)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={draft.pool.rating}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pool: {
                      kind: 'fetish_gnosis_rating',
                      rating: Math.max(1, Math.min(10, Number(e.target.value) || 6)),
                    },
                  })
                }
                className="w-16 rounded border border-stone-700 bg-zinc-950 px-2 py-0.5 text-center font-mono"
              />
            </label>
          )}
        </div>

        {/* Difficulty Source */}
        <div className="space-y-1.5">
          <span className="font-semibold text-stone-300">Difficulty Formula</span>
          <div className="flex gap-2">
            <select
              aria-label="Difficulty formula"
              value={draft.difficulty.kind}
              onChange={(e) => {
                const kind = e.target.value as MacroDifficultySource['kind'];
                if (kind === 'static') setDraft({ ...draft, difficulty: { kind: 'static', value: 6 } });
                else if (kind === 'local_gauntlet') {
                  setDraft({ ...draft, difficulty: { kind: 'local_gauntlet', modifier: 0 } });
                } else {
                  setDraft({ ...draft, difficulty: { kind: 'target_trait', trait: 'rage' } });
                }
              }}
              className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1"
            >
              <option value="static">Static Number</option>
              <option value="local_gauntlet">Local Gauntlet</option>
              <option value="target_trait">Target Trait</option>
            </select>

            {draft.difficulty.kind === 'static' && (
              <input
                aria-label="Difficulty"
                type="number"
                min={2}
                max={10}
                value={draft.difficulty.value}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    difficulty: {
                      kind: 'static',
                      value: Math.max(2, Math.min(10, Number(e.target.value) || 6)),
                    },
                  })
                }
                className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1 font-mono"
              />
            )}

            {draft.difficulty.kind === 'local_gauntlet' && (
              <input
                aria-label="Difficulty modifier"
                type="number"
                min={-5}
                max={5}
                value={draft.difficulty.modifier ?? 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    difficulty: {
                      kind: 'local_gauntlet',
                      modifier: Math.max(-5, Math.min(5, Number(e.target.value) || 0)),
                    },
                  })
                }
                title="Gauntlet modifier (-5 to +5)"
                className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1 font-mono"
              />
            )}

            {draft.difficulty.kind === 'target_trait' && (
              <select
                aria-label="Difficulty trait"
                value={draft.difficulty.trait}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    difficulty: {
                      kind: 'target_trait',
                      trait: e.target.value as 'willpower' | 'rage' | 'gnosis' | 'stamina_plus_3',
                    },
                  })
                }
                className="w-1/2 rounded border border-stone-700 bg-zinc-900 px-2 py-1"
              >
                <option value="willpower">Target Willpower</option>
                <option value="rage">Target Rage</option>
                <option value="gnosis">Target Gnosis</option>
                <option value="stamina_plus_3">Target Stamina + 3</option>
              </select>
            )}
          </div>
        </div>

        {/* Effect Payload */}
        <div className="space-y-1.5 rounded-lg border border-stone-800 bg-zinc-900/50 p-2">
          <span className="font-semibold text-stone-300">Primary Mechanical Effect</span>
          <select
            aria-label="Primary effect type"
            value={primaryEffect.type}
            onChange={(e) => setPrimaryEffectType(e.target.value as MacroEffectPayload['type'])}
            className="w-full rounded border border-stone-700 bg-zinc-950 px-2 py-1"
          >
            <option value="buff_claw_damage">Buff Claw Damage (+Dice)</option>
            <option value="buff_soak_per_success">Buff Soak (+1/Success)</option>
            <option value="buff_initiative_flat">Buff Initiative (+Flat)</option>
            <option value="heal_wounds">Heal Wounds</option>
            <option value="weapon_strike">Weapon / Fetish Strike</option>
            <option value="storyteller_secret_whisper">Storyteller Whisper / Note</option>
          </select>

          {primaryEffect.type === 'weapon_strike' && (
            <div className="flex items-center gap-2">
              <input
                aria-label="Primary effect damage bonus"
                type="number"
                min={0}
                max={20}
                value={primaryEffect.damageBonus}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    effects: [
                      {
                        ...primaryEffect,
                        damageBonus: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                      },
                    ],
                  })
                }
                className="w-16 rounded border border-stone-700 bg-zinc-950 px-2 py-1 font-mono"
              />
              <select
                aria-label="Primary effect damage type"
                value={primaryEffect.damageType}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    effects: [
                      {
                        ...primaryEffect,
                        damageType: e.target.value as Exclude<DamageType, 'none'>,
                      },
                    ],
                  })
                }
                className="flex-1 rounded border border-stone-700 bg-zinc-950 px-2 py-1"
              >
                <option value="bashing">Bashing</option>
                <option value="lethal">Lethal</option>
                <option value="aggravated">Aggravated</option>
              </select>
              <label className="flex items-center gap-1 text-amber-300">
                <input
                  type="checkbox"
                  checked={primaryEffect.isSilver}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      effects: [{ ...primaryEffect, isSilver: e.target.checked }],
                    })
                  }
                />
                Silver
              </label>
            </div>
          )}
        </div>

        {/* Form Restrictions */}
        <div>
          <span className="block font-semibold text-stone-300">Form Restrictions (Empty = Any)</span>
          <div className="mt-1 flex gap-1">
            {ALL_FORMS.map((f) => {
              const selected = draft.requiredForms?.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleRequiredForm(f)}
                  className={`flex-1 rounded border py-1 text-xs font-bold uppercase ${
                    selected
                      ? 'border-red-500 bg-red-950/70 text-red-200'
                      : 'border-stone-800 bg-zinc-900 text-stone-400'
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <textarea
          aria-label="Summary"
          rows={2}
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          className="w-full rounded border border-stone-700 bg-zinc-900 p-2 text-stone-300"
        />

        {/* Execution Target & Willpower */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Target"
            value={execTargetId}
            onChange={(e) => setExecTargetId(e.target.value)}
            className="flex-1 rounded border border-stone-700 bg-zinc-900 px-2 py-1 text-xs"
          >
            <option value="">Target: None / Self</option>
            {characterList.map((c) => (
              <option key={c.id} value={c.id}>
                Target: {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-indigo-300">
            <input
              type="checkbox"
              checked={spendWpOnRoll}
              onChange={(e) => setSpendWpOnRoll(e.target.checked)}
            />
            +1 WP Auto
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={!targetCharId}
            onClick={() => handleSaveAndTest(false)}
            className="flex-1 rounded border border-stone-700 bg-zinc-800 py-1.5 font-bold hover:bg-zinc-700 disabled:opacity-45"
          >
            Save to Sheet
          </button>
          <button
            type="button"
            disabled={!targetCharId}
            onClick={() => handleSaveAndTest(true)}
            className="flex-1 rounded bg-red-800/90 py-1.5 font-bold text-amber-50 hover:bg-red-700 disabled:opacity-45"
          >
            Save &amp; Roll Now
          </button>
        </div>
      </div>
    </div>
  );
};
