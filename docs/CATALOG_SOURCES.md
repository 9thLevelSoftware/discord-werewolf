# Game content catalogs: what was imported and from where

The selectable trait lists live in `packages/core/src/catalog/`. The creation wizard, the character
sheet and creation validation all read them from `@w20-vtt/core`.

## What the catalogs hold

Each entry carries catalog facts only: name, level or point cost, who may take it, roll, difficulty,
resource cost and a source reference. The `summary` on each entry is a one-line mechanical summary
written for this app. No descriptive text from the rulebook or from the third-party lists is stored
in the repo.

| Catalog | File | Entries | Source |
| --- | --- | --- | --- |
| Gifts | `gifts.data.ts` | 368 (85 / 81 / 82 / 61 / 52 / 7 at levels 1 to 6) | W20 core, pp. 152-201 |
| Merits and Flaws, Garou | `meritsFlaws.data.ts` (`tier: 'core'`) | 55 Merits, 64 Flaws | W20 core, pp. 472-485 |
| Merits and Flaws, Kinfolk | same file (`tier: 'kinfolk'`) | 7 Merits, 5 Flaws | W20 core, pp. 382-383 |
| Merits and Flaws, compilation | same file (`tier: 'compilation'`) | 72 Merits, 96 Flaws | Wolfbane master lists |
| Backgrounds | `backgrounds.ts` | 12 core, 12 chronicle | W20 core, pp. 135-140 (core 12) |
| Rites | `rites.data.ts` | 54 | W20 core, pp. 203-220 |
| Fetishes and Talens | `fetishes.data.ts` | 31 and 9 | W20 core, pp. 221-227 and 228-229 |
| Pack Totems | `totems.data.ts` | 19 | W20 core, pp. 373-377 |

Page numbers are the printed page numbers of *Werewolf: The Apocalypse 20th Anniversary Edition*.

## Sources

1. **W20 core rulebook** (the PDF in `docs/`). Names, levels, costs, groups and pages were parsed
   from the book text by script. Rolls, difficulties and resource costs were extracted per entry and
   checked back against the book's rule text by script; every flagged difference was resolved by
   reading the book.
2. **Wolfbane Werewolf Master List of Merits / of Flaws** (two shared PDFs). Used for names and
   point costs only, and only for entries the rulebook does not have. These entries have no
   summary and are labelled as a separate tier, because the lists mix several books and some
   costs look like house rules (for example a lower cost for one auspice, kept in `costNote`).
3. **wyrmfoe.com Gift index.** Used only as a cross-check on Gift names. Nothing was copied from
   it. The index covers 972 Gifts across Revised-edition books, supplements, lost tribes, Black
   Spiral Dancers and Kinfolk; only the W20 core book's Gifts are in the catalog.

## How Gifts are grouped

- `sources` lists every breed, auspice or tribe whose list includes the Gift. A Gift shared by
  several lists (the book's "as the Ahroun Gift" entries) is one catalog entry.
- `tier: 'camp'` marks the camp Gifts printed in sidebars: Hakken (Shadow Lords), Boli Zousizhe
  (Glass Walkers) and Kucha Ekundu (Red Talons). `tier: 'outsider'` marks the two Skin Dancer Gifts.
- When the book gives a variable difficulty, `defaultDifficulty` is 6 and `difficultyNote` says
  what it depends on.

## Ids and existing saves

- The 44 Gift ids that shipped earlier are unchanged. Other Gifts reuse the ids already used in
  `supabase/seed.sql` where the name matches, and get new deterministic ids otherwise.
- The 29 earlier Merit and Flaw ids are unchanged. Background keys are unchanged.
- Saved sheets store their own copy of each trait, so they are unaffected by catalog changes.

## Known limits

- Summaries were written to state mechanics in new words. About 55 of the 620 still share a run of
  five or six words with the book where the wording is a bare game term or number (for example
  "until the next full moon"). None reproduces a sentence.
- When a Gift with a variable difficulty is added to a sheet, the sheet rolls it at difficulty 6
  and the note is appended to the Gift's summary.

## Corrections to the earlier lists

The earlier hand-entered lists disagreed with the rulebook in places. The catalog follows the book:

- 22 of the 44 earlier Level 1 Gifts had a different roll, difficulty or cost (for example
  Falling Touch is a Willpower roll, Mindspeak costs Willpower, Lambent Flame costs Willpower).
- Calm and Inner Strength are Level Two Gifts in the book, so the wizard no longer offers them as
  starting Gifts.
- Merit and Flaw costs: Natural Leader is 2 points, Danger Sense is 3, Bad Sight is 3. Several
  Flaws have a cost range (Enemy 1-5, Banned Transformation 1-6, Cursed 1-5).
- Bad Taste is a Merit in the book and Pack Mentality is a Flaw. The earlier entries with the
  opposite kind are kept under their old ids as `tier: 'legacy'`, next to the book entries.
- Slippery Mind is in neither source and is kept as `tier: 'legacy'`.

## Skipped, and why

- **Supplement Gifts** (tribebooks, Changing Ways, lost tribes, Black Spiral Dancers, Kinfolk,
  planetary Gifts): outside the W20 core book. They can be added later as another tier.
- **Wolfbane "Confidence" and "Funny"**: no cost is printed in the list.
- **Four Gifts from the earlier database seed** (Awe, Trackless Step, Dream Speak, Obedient
  Slave): no Gift with that name is in the W20 core Gifts chapter. They stay in the database seed
  and are not in the catalog. Two other seed Gifts were renames and keep their ids: Cybernetic
  Senses is the book's Cybersenses, and Open Wound is Open Wounds.
- **Rite, Fetish and Totem database tables**: only the Gift table is synced from the catalog.
  The starter Rites and Totems in `supabase/seed.sql` are unchanged.
- **Tribe Background restrictions in validation**: `backgrounds.ts` records the book's restricted
  and discouraged Backgrounds per tribe, but `validateW20CharacterCreation` keeps its existing
  checks so that drafts validate exactly as before.

## Database

`supabase/migrations/202611220001_w20_gift_catalog_sync.sql` is generated from `gifts.data.ts`. It
upserts the 368 Gifts into `compendium_gifts`, keeps existing ids and `macro_config`, and leaves
campaign homebrew rows alone. It has not been applied to any hosted project.

**Apply this migration when deploying this version.** `character_gifts.gift_id` references
`compendium_gifts`, and about half of the Level 1 Gifts the wizard now offers have ids that exist
in the database only after the migration. Until it is applied, a cloud-saved character is still
created, but the link rows for those Gifts are skipped (the Worker filters out ids the database
does not know). Local and mock-mode sheets are unaffected.
