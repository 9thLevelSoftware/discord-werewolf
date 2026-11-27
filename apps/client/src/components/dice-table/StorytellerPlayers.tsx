import React from 'react';
import type { StorytellerSeatView, StorytellerSheetStats, TableParticipant } from '@w20-vtt/protocol';
import { cleanOtherTraitDisplayName, resolveOtherTraitKind, type DualTracker } from '@w20-vtt/core';
import { formatTraitName } from '../character-sheet/sheetShared';

type StatRows = Array<[string, React.ReactNode]>;

const Stats: React.FC<{ rows: StatRows }> = ({ rows }) => (
  <dl className="divide-y divide-stone-800/70 text-sm">
    {rows.map(([label, value], index) => (
      <div key={`${label}-${index}`} className="grid grid-cols-2 gap-2 py-1.5">
        <dt className="min-w-0 break-words text-stone-300">{label}</dt>
        <dd className="min-w-0 break-words text-amber-100">{value}</dd>
      </div>
    ))}
  </dl>
);

const StatsGroup: React.FC<{ title: string; rows: StatRows }> = ({ title, rows }) => (
  <details className="rounded-lg border border-stone-800 px-3">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-amber-100">{title}</summary>
    {rows.length ? <Stats rows={rows} /> : <p className="pb-3 text-sm text-stone-400">None recorded.</p>}
  </details>
);

const tracker = ({ temporary, permanent }: DualTracker) => `${temporary} / ${permanent}`;
const dotValue = (base: number, effective: number) => base === effective ? base : `${base} base · ${effective} effective`;

const SheetStats: React.FC<{ stats: StorytellerSheetStats }> = ({ stats: { sheet, computed } }) => {
  const soak = computed.soakCapabilities;
  const abilityNames = new Set([...Object.keys(sheet.abilities), ...Object.keys(computed.effectiveAbilities)]);
  for (const custom of sheet.customAbilities) {
    abilityNames.delete(custom.name);
    abilityNames.delete(custom.id);
  }

  return (
    <div className="space-y-2">
      <Stats rows={[
        ['Form', formatTraitName(sheet.activeForm)], ['Rank', sheet.rank],
        ['Rage', `${tracker(sheet.rage)} · ${computed.effectiveRagePool} pool`],
        ['Gnosis', `${tracker(sheet.gnosis)} · ${computed.effectiveGnosisPool} pool`],
        ['Willpower', `${tracker(sheet.willpower)} · ${computed.effectiveWillpowerPool} pool`],
        ['Wounds', `${computed.woundLabel} (${computed.woundPenalty})`],
        ['Health boxes', computed.health.boxes.map((damage) => damage === 'none' ? 'Empty' : formatTraitName(damage)).join(', ')],
        ['Initiative modifier', computed.initiativeBonus],
      ]} />
      <StatsGroup title="Identity" rows={[
        ['Name', sheet.name], ['Player', sheet.player], ['Chronicle', sheet.chronicle],
        ['Breed', formatTraitName(sheet.breed)], ['Auspice', formatTraitName(sheet.auspice)],
        ['Tribe', formatTraitName(sheet.tribe)], ['Pack', sheet.packName], ['Pack Totem', sheet.packTotem],
        ['Concept', sheet.concept], ['Deed name', sheet.deedName], ['Metis deformity', sheet.metisDeformity],
      ].filter((row): row is [string, string] => Boolean(row[1]))} />
      <StatsGroup title="Attributes" rows={Object.entries(sheet.baseAttributes).map(([key, base]) => [
        formatTraitName(key), dotValue(base, computed.effectiveAttributes[key as keyof typeof sheet.baseAttributes] ?? base),
      ])} />
      <StatsGroup title="Abilities and specialties" rows={[
        ...[...abilityNames].sort().map((key): [string, React.ReactNode] => [
          formatTraitName(key), dotValue(sheet.abilities[key] ?? 0, computed.effectiveAbilities[key] ?? sheet.abilities[key] ?? 0),
        ]),
        ...sheet.customAbilities.map((custom): [string, React.ReactNode] => [
          custom.name, [String(dotValue(custom.dots, computed.effectiveAbilities[custom.id] ?? computed.effectiveAbilities[custom.name] ?? custom.dots)), custom.specialty].filter(Boolean).join(' · '),
        ]),
        ...Object.entries(sheet.specialties).map(([key, name]): [string, React.ReactNode] => [
          `${formatTraitName(key)} specialty`, name,
        ]),
      ]} />
      <StatsGroup title="Combat and soak" rows={[
        ['Natural soak', soak.naturalSoakPool], ['Armor soak', soak.armorRating], ['Total soak', soak.soakPool],
        ['Soaks', [soak.canSoakBashing && 'Bashing', soak.canSoakLethal && 'Lethal', soak.canSoakAggravated && 'Aggravated', soak.canSoakSilver && 'Silver'].filter(Boolean).join(', ') || 'None'],
        ['Shift difficulty', computed.shiftDifficulty], ['Perception difficulty modifier', computed.perceptionDifficultyMod],
        ['Silver items carried', sheet.silverCarriedItems],
        ['Armor', `${sheet.armor.rating} · ${sheet.armor.worn === false ? 'Not worn' : 'Worn'}`],
        ['Armor Dexterity difficulty penalty', sheet.armor.dexterityDifficultyPenalty ?? 0],
        ...(sheet.armor.description ? [['Armor description', sheet.armor.description] as [string, string]] : []),
        ...sheet.combatWeapons.map((weapon): [string, string] => [
          weapon.name, `${formatTraitName(weapon.rollAttribute)} + ${formatTraitName(weapon.rollAbility)} · Diff ${weapon.difficulty} · ${weapon.damageMode === 'strength_plus' ? 'Strength + ' : ''}${weapon.damageDice} ${weapon.damageType}${weapon.range ? ` · Range ${weapon.range}` : ''}${weapon.rate ? ` · Rate ${weapon.rate}` : ''}${weapon.clip ? ` · Clip ${weapon.clip}` : ''}${weapon.isSilver ? ' · Silver' : ''}${weapon.carried === false ? ' · Not carried' : ''}`,
        ]),
      ]} />
      <StatsGroup title="Renown and experience" rows={[
        ...Object.entries(sheet.renown).map(([name, value]): [string, string] => [formatTraitName(name), tracker(value)]),
        ['Experience total', sheet.experience.total], ['Experience spent', sheet.experience.spent],
        ['Experience remaining', computed.experienceRemaining], ['Mystical experience', sheet.experience.mystical ?? 0],
      ]} />
      <StatsGroup title="Backgrounds and other traits" rows={[
        ...sheet.backgrounds.map((background): [string, number] => [background.name, background.dots]),
        ...sheet.otherTraits.map((trait): [string, string] => [cleanOtherTraitDisplayName(trait.name), `${trait.dots} · ${formatTraitName(resolveOtherTraitKind(trait))}`]),
      ]} />
      <StatsGroup title="Gifts and rites" rows={[
        ...sheet.gifts.map((gift): [string, string] => [gift.name, `Level ${gift.level}${gift.summary ? ` · ${gift.summary}` : ''}`]),
        ...sheet.rites.map((rite): [string, string] => [rite.name, [rite.level && `Level ${rite.level}`, rite.summary].filter(Boolean).join(' · ')]),
      ]} />
      <StatsGroup title="Fetishes and equipment" rows={[
        ...sheet.fetishes.map((fetish): [string, string] => [fetish.name, [
          `Level ${fetish.level}`, `Gnosis ${fetish.gnosisRating}`, fetish.power,
          fetish.active && 'Active', fetish.isAttuned && 'Attuned', fetish.isSilver && 'Silver', fetish.carried === false && 'Not carried',
        ].filter(Boolean).join(' · ')]),
        ...(sheet.equipment ?? []).map((item): [string, string] => [item.name, [
          item.worn && 'Worn', item.carried === false ? 'Not carried' : 'Carried', item.isSilver && 'Silver',
        ].filter(Boolean).join(' · ')]),
      ]} />
    </div>
  );
};

export const StorytellerPlayers: React.FC<{ participants: TableParticipant[]; seats: StorytellerSeatView[] }> = ({ participants, seats }) => {
  const statsByKey = new Map(seats.map((seat) => [seat.participantKey, seat.sheet]));
  const present = participants.filter((participant) => participant.isConnected);
  if (!present.length) return <p className="text-sm text-stone-400">No seats are present at the table.</p>;

  return (
    <ul aria-label="Present seats" className="space-y-3">
      {present.map((participant) => {
        const key = participant.participantKey ?? participant.discordUserId;
        const stats = statsByKey.get(key);
        const { trackers } = participant;
        const name = stats?.sheet.name || participant.characterName;

        return (
          <li key={key}>
            <details className="rounded-xl border border-gold-500/25 bg-zinc-950/65 px-3">
              <summary className="min-h-11 cursor-pointer break-words py-3 text-sm font-bold text-amber-100">
                {name ? `${name} · ${participant.displayName}` : participant.displayName}
                {!stats && <span className="ml-2 font-normal text-stone-400">No sheet bound</span>}
              </summary>
              <div className="pb-3">
                {stats ? <SheetStats stats={stats} /> : (
                  <Stats rows={[
                    ['Rage', trackers.rage], ['Gnosis', trackers.gnosis], ['Willpower', trackers.willpower],
                    ['Wound penalty', trackers.woundPenalty],
                  ]} />
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
};
