# W20 Discord Activity VTT

A custom **Werewolf: The Apocalypse 20th Anniversary Edition (W20)** Virtual Tabletop built as a **Discord Embedded Activity** paired with a serverless Discord Slash Command & Webhook bridge.

## Specialties and rerolls at the voice table

Declare an applicable specialty before rolling. Under the default W20 rule, a 10 on that roll earns two successes. If the dice show 10 and 1, one success survives. Initiative uses its own single d10. [W20 core, pp. 123, 234–235](https://theonyxpath.com/w20-is-on-sale/)

Any seated player can switch **Shared specialty mode** in **Table settings** to Revised-style explosions. Each specialty 10 then adds a die to the felt at the same difficulty. A bonus 10 continues the chain and a bonus 1 cancels nothing. [Werewolf Revised, “Specialties”](https://www.drivethrurpg.com/en/product/637/werewolf-the-apocalypse-revised-edition)

In **Roll Log**, **Roll again** starts a new attempt. Characters with **Lucky** can replace up to three failures or botches per story. **Fair Fortune** costs one temporary Gnosis and allows one replacement per scene. Replacements keep the original roll settings and the new result, even on another botch. If a sheet activation offers a replacement, **Keep result** applies its original consequences. Closing the choice leaves it in the log until resolved, and advancing the rule clock accepts outstanding results. [W20 core, pp. 179, 236, 483](https://theonyxpath.com/w20-is-on-sale/)

## Architecture

- **`packages/core` (`@w20-vtt/core`)** — Zero-IO pure TypeScript W20 rules engine:
  - CSPRNG d10 pool resolver (`1`s cancel successes, True Botch vs. Failure, W20 Specialties vs. exploding 10s, Willpower auto-success).
  - Five-Form shifting matrix (`Homid`, `Glabro`, `Crinos`, `Hispo`, `Lupus`), silver Gnosis reduction, form-specific soak & natural attacks.
  - Rage/Gnosis Golden Turn Lock, Frenzy checks, cascading 7-box health & regeneration.
  - Reverse Initiative & Action-Splitting combat state machine (`PRE_ROUND_RAGE` -> `ROLL_INITIATIVE` -> `DECLARE_REVERSE` -> `RESOLVE_NORMAL_PASS` / `AWAITING_REACTION` / `RESOLVE_RAGE_PASSES` -> `END_OF_ROUND`).
  - Declarative Gift/Rite/Fetish macro executor, W20 character creation point-buy/freebie validator, and XP cost calculator.
- **`packages/protocol` (`@w20-vtt/protocol`)** — Typed WebSocket `ClientEnvelope` / `ServerEnvelope` contracts, `RoomSnapshotView` role/realm projections, and Zod runtime validation (`parseClientEnvelope`).
- **`apps/edge` (`@w20-vtt/edge`)** — Unified Cloudflare Worker + SQLite-backed `GameRoomDO` Durable Object (hibernation WebSockets, role & Umbra realm scrubbing, Discord OAuth2 + Supabase JWT minting, Ed25519 `/w20` slash command interactions, R2 media serving).
- **`apps/client` (`@w20-vtt/client`)** — React 19 + Tailwind CSS v4 + Zustand + PixiJS v8 Dual-Realm (Physical/Penumbra GLSL shader + GPU Fog of War) + `@3d-dice/dice-box` + `@discord/embedded-app-sdk` voice-reactive HUD.
- **`supabase/`** — PostgreSQL schema, Row-Level Security policies, permanent trait protection triggers, and canonical W20 Level 1–5 Gifts, Rites, and Pack Totems seed data.

## Workspace Scripts

```bash
pnpm install           # Install all monorepo dependencies
pnpm build             # Build @w20-vtt/core, @w20-vtt/protocol, and @w20-vtt/client
pnpm typecheck         # Build shared packages and run tsc --noEmit across all workspaces
pnpm test              # Run Vitest unit test suites across workspaces
pnpm dev:client        # Start Vite dev server for @w20-vtt/client
pnpm dev:edge          # Start Wrangler local Worker + GameRoomDO server
pnpm discord:register  # Register /w20 slash commands via Discord REST v10
pnpm deploy            # Build client + packages and deploy unified Worker to Cloudflare
```

## Setup & Deployment

See [docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md) for complete instructions covering Discord Developer Portal setup (`https://127.0.0.1` redirect, `/` and `/supabase` URL Mappings), Supabase migrations & seeding, Cloudflare Worker secrets & R2 bucket provisioning, and local `cloudflared` voice-channel testing.
