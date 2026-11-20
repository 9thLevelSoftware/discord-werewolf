import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Check, EyeOff, Sparkles, X } from 'lucide-react';

export interface QuickRollPreset {
  id: string;
  name: string;
  pool: number;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  isSecretRoll: boolean;
}

const DEFAULT_QUICK_ROLLS: QuickRollPreset[] = [
  {
    id: 'starter-claw-strike',
    name: 'Claw Strike',
    pool: 7,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: true,
    isSecretRoll: false,
  },
  {
    id: 'starter-perception',
    name: 'Perception + Alertness',
    pool: 6,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: false,
    isSecretRoll: false,
  },
  {
    id: 'starter-step-sideways',
    name: 'Step Sideways',
    pool: 4,
    rageDiceCount: 0,
    difficulty: 6,
    hasSpecialty: false,
    isSecretRoll: false,
  },
];

function getStorageKey(userId: string): string {
  return `w20-quick-rolls:v1:${userId}`;
}

function isValidPreset(item: unknown): item is QuickRollPreset {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.pool === 'number' &&
    typeof candidate.rageDiceCount === 'number' &&
    typeof candidate.difficulty === 'number' &&
    typeof candidate.hasSpecialty === 'boolean' &&
    typeof candidate.isSecretRoll === 'boolean'
  );
}

function loadPresetsFromStorage(userId: string): QuickRollPreset[] {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (raw === null) {
      window.localStorage.setItem(getStorageKey(userId), JSON.stringify(DEFAULT_QUICK_ROLLS));
      return DEFAULT_QUICK_ROLLS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidPreset);
    }
  } catch {
    // Ignore localStorage access errors in restricted iframe environments
  }
  return DEFAULT_QUICK_ROLLS;
}

function persistPresetsToStorage(userId: string, presets: QuickRollPreset[]): void {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(presets));
  } catch {
    // Ignore storage write failures
  }
}

interface QuickRollBarProps {
  userId: string;
  currentPool: number;
  currentRageDiceCount: number;
  currentDifficulty: number;
  currentHasSpecialty: boolean;
  currentIsSecretRoll: boolean;
  currentRollLabel: string;
  disabled: boolean;
  onTriggerPreset: (preset: QuickRollPreset) => void;
}

export const QuickRollBar: React.FC<QuickRollBarProps> = ({
  userId,
  currentPool,
  currentRageDiceCount,
  currentDifficulty,
  currentHasSpecialty,
  currentIsSecretRoll,
  currentRollLabel,
  disabled,
  onTriggerPreset,
}) => {
  const [presets, setPresets] = useState<QuickRollPreset[]>(() => loadPresetsFromStorage(userId));
  const [namingOpen, setNamingOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    setPresets(loadPresetsFromStorage(userId));
    setNamingOpen(false);
    setDraftName('');
  }, [userId]);

  const savePresetWithName = (rawName: string) => {
    const cleanName = rawName.trim();
    if (!cleanName) return;

    const nextPreset: QuickRollPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.slice(0, 32),
      pool: currentPool,
      rageDiceCount: currentRageDiceCount,
      difficulty: currentDifficulty,
      hasSpecialty: currentHasSpecialty,
      isSecretRoll: currentIsSecretRoll,
    };

    setPresets((prev) => {
      const updated = [...prev, nextPreset];
      persistPresetsToStorage(userId, updated);
      return updated;
    });
    setNamingOpen(false);
    setDraftName('');
  };

  const handleSaveClick = () => {
    const labelTrimmed = currentRollLabel.trim();
    if (labelTrimmed.length > 0) {
      savePresetWithName(labelTrimmed);
      return;
    }
    setNamingOpen(true);
    setDraftName('');
  };

  const handleDeletePreset = (id: string) => {
    setPresets((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      persistPresetsToStorage(userId, updated);
      return updated;
    });
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <span className="font-display shrink-0 text-[10px] font-bold tracking-wider uppercase text-amber-300/75">
        Quick Rolls
      </span>

      {presets.map((preset) => (
        <div
          key={preset.id}
          className="group flex shrink-0 items-center rounded-full border border-stone-700/75 bg-zinc-950/90 text-[11px] transition hover:border-amber-500/55"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onTriggerPreset(preset)}
            className="flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 text-left disabled:opacity-50"
            title={`Roll ${preset.name}: ${preset.pool}d10 Diff ${preset.difficulty}`}
          >
            <span className="font-semibold text-stone-100">{preset.name}</span>
            <span className="font-mono text-[10px] font-bold text-amber-300">
              {preset.pool}d10
            </span>
            {preset.difficulty !== 6 && (
              <span className="font-mono text-[9px] text-stone-400">D{preset.difficulty}</span>
            )}
            {preset.rageDiceCount > 0 && (
              <span className="font-mono text-[9px] text-red-400">{preset.rageDiceCount}R</span>
            )}
            {preset.hasSpecialty && <Sparkles className="h-2.5 w-2.5 text-amber-400" />}
            {preset.isSecretRoll && <EyeOff className="h-2.5 w-2.5 text-amber-300" />}
          </button>
          <button
            type="button"
            onClick={() => handleDeletePreset(preset.id)}
            aria-label={`Remove ${preset.name}`}
            className="mr-1 rounded-full p-0.5 text-stone-500 hover:bg-red-950/70 hover:text-red-300"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}

      {namingOpen ? (
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/65 bg-zinc-950 px-2 py-0.5">
          <input
            type="text"
            value={draftName}
            maxLength={32}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                savePresetWithName(draftName);
              } else if (e.key === 'Escape') {
                setNamingOpen(false);
                setDraftName('');
              }
            }}
            placeholder="Preset name..."
            className="w-28 bg-transparent text-[11px] text-stone-100 placeholder-stone-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => savePresetWithName(draftName)}
            className="rounded-full bg-amber-600/80 p-0.5 text-zinc-950 hover:bg-amber-500"
            aria-label="Confirm preset name"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setNamingOpen(false);
              setDraftName('');
            }}
            className="rounded-full p-0.5 text-stone-400 hover:text-stone-100"
            aria-label="Cancel preset"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSaveClick}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-amber-500/45 bg-amber-950/20 px-2.5 py-1 text-[10px] font-bold text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/40"
          title="Save current Dice Console setup as a personal Quick Roll"
        >
          <BookmarkPlus className="h-3 w-3" />
          Save Preset
        </button>
      )}
    </div>
  );
};
