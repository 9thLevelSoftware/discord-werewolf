import React, { useState } from 'react';
import { Pin, Trash2, X } from 'lucide-react';
import {
  Button,
  ConfirmButton,
  IconButton,
  Modal,
  NumberStepper,
  PipTrack,
  Select,
  TextInput,
  toast,
  ToastViewport,
  type ModalVariant,
} from './index';

/**
 * Development-only page showing every shared UI primitive: open /?ui=1 in a dev build.
 * It is the visual reference for the design system and is not shipped to production.
 */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="w20-obsidian-panel rounded-2xl p-4">
    <h2 className="font-display mb-3 text-sm font-extrabold tracking-wider uppercase text-amber-100">
      {title}
    </h2>
    {children}
  </section>
);

const SWATCHES = [
  'bg-obsidian-950',
  'bg-obsidian-900',
  'bg-obsidian-800',
  'bg-obsidian-700',
  'bg-gold-500',
  'bg-gold-300',
  'bg-crimson-800',
  'bg-crimson-600',
  'bg-rage',
  'bg-gnosis',
  'bg-willpower',
  'bg-health',
  'bg-warning',
  'bg-danger',
];

export const UiGallery: React.FC = () => {
  const [rage, setRage] = useState(3);
  const [gnosis, setGnosis] = useState(2);
  const [willpower, setWillpower] = useState(5);
  const [strength, setStrength] = useState(2);
  const [difficulty, setDifficulty] = useState(6);
  const [bonus, setBonus] = useState(0);
  const [name, setName] = useState('');
  const [modal, setModal] = useState<ModalVariant | null>(null);
  const [dirty, setDirty] = useState(false);

  return (
    <div className="h-dvh overflow-y-auto bg-obsidian-950 p-4 text-parchment">
      <ToastViewport />
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header>
          <h1 className="font-display text-lg font-black tracking-widest uppercase text-amber-100">
            W20 UI primitives
          </h1>
          <p className="text-xs text-stone-400">
            Development reference. Press Tab to check the focus ring on every control.
          </p>
        </header>

        <Section title="Colour tokens">
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((swatch) => (
              <div key={swatch} className="flex flex-col items-center gap-1">
                <div className={`h-10 w-16 rounded-lg border border-stone-700 ${swatch}`} />
                <span className="text-caption text-stone-400">{swatch.replace('bg-', '')}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div className="space-y-1">
            <p className="font-display text-2xl font-black tracking-wider uppercase text-amber-100">
              Display 2xl
            </p>
            <p className="font-display text-lg font-extrabold tracking-wider uppercase text-amber-100">
              Display lg
            </p>
            <p className="text-base">Body base (16px)</p>
            <p className="text-sm">Body sm (14px)</p>
            <p className="text-xs text-stone-300">Label xs (12px), the floor for UI text</p>
            <p className="text-caption text-stone-400">
              Caption (11px), dense sheet tables only
            </p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Roll 7d10</Button>
            <Button variant="secondary">Initiative</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="secondary" loading>
              Saving
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="touch">Touch</Button>
            <IconButton label="Pin this roll" icon={<Pin className="h-4 w-4" />} size="sm" />
            <IconButton label="Close" icon={<X className="h-4 w-4" />} variant="secondary" />
            <IconButton
              label="Delete sheet"
              icon={<Trash2 className="h-4 w-4" />}
              variant="danger"
              size="touch"
            />
          </div>
        </Section>

        <Section title="Fields">
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              label="Name"
              placeholder="e.g. Walks-the-Ash"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="Shown to the whole table."
            />
            <Select label="Breed" defaultValue="homid">
              <option value="homid">Homid</option>
              <option value="metis">Metis</option>
              <option value="lupus">Lupus</option>
            </Select>
            <TextInput label="Sync code" defaultValue="ABCD" error="Enter all 8 characters." />
          </div>
        </Section>

        <Section title="Steppers">
          <div className="flex flex-wrap items-center gap-4">
            <NumberStepper
              label="Difficulty"
              showLabel
              value={difficulty}
              min={2}
              max={10}
              onChange={setDifficulty}
            />
            <NumberStepper
              label="Bonus dice"
              showLabel
              value={bonus}
              min={-15}
              max={15}
              onChange={setBonus}
              format={(v) => (v > 0 ? `+${v}` : String(v))}
              size="touch"
            />
          </div>
        </Section>

        <Section title="Pip tracks">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-stone-400">Strength (sm)</p>
              <PipTrack label="Strength" value={strength} onChange={setStrength} />
            </div>
            <div>
              <p className="text-xs text-stone-400">Rage</p>
              <PipTrack label="Rage" tone="crimson" max={10} value={rage} onChange={setRage} />
            </div>
            <div>
              <p className="text-xs text-stone-400">Gnosis</p>
              <PipTrack label="Gnosis" tone="cyan" max={10} value={gnosis} onChange={setGnosis} />
            </div>
            <div>
              <p className="text-xs text-stone-400">Willpower (touch, square)</p>
              <PipTrack
                label="Willpower"
                tone="indigo"
                shape="square"
                size="touch"
                max={10}
                value={willpower}
                onChange={setWillpower}
              />
            </div>
          </div>
        </Section>

        <Section title="Toasts and confirmation">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => toast.info('Sync code copied.')}>Info toast</Button>
            <Button onClick={() => toast.success('Sheet saved.')}>Success toast</Button>
            <Button onClick={() => toast.error('Roll rejected: the queue is full.')}>
              Error toast
            </Button>
            <ConfirmButton
              prompt="Delete Walks-the-Ash for good?"
              confirmLabel="Delete"
              onConfirm={() => toast.success('Deleted.')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete sheet
            </ConfirmButton>
          </div>
        </Section>

        <Section title="Modals">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setModal('center')}>Centre modal</Button>
            <Button onClick={() => setModal('sheet')}>Bottom sheet</Button>
            <Button onClick={() => setModal('fullscreen')}>Fullscreen</Button>
          </div>
        </Section>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => {
          setModal(null);
          setDirty(false);
        }}
        title="Example modal"
        subtitle="Escape closes it; focus returns to the opener."
        variant={modal ?? 'center'}
        size="sm"
        dirty={dirty}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => toast.error('A toast raised inside a modal.')}>
              Raise toast
            </Button>
            <Button variant="primary" onClick={() => setModal(null)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-stone-300">
            Type in the field to mark the modal as having unsaved changes, then try to close it.
          </p>
          <TextInput
            label="Draft name"
            placeholder="Type to make this dirty"
            onChange={() => setDirty(true)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default UiGallery;
