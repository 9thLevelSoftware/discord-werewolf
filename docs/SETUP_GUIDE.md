# W20 Discord Activity VTT — Complete Setup & Deployment Guide

This guide walks through configuring Discord, Supabase, Cloudflare Workers + Durable Objects + R2, local `cloudflared` testing inside a live Discord voice channel, and production deployment.

---

## 1. Prerequisites & Environment Variables

1. Ensure Node.js (`>=20`, tested on Node 26) and `pnpm` (`9.15.9`) are installed.
2. Install workspace dependencies (includes local `wrangler` and `supabase` CLIs):
   ```bash
   pnpm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

---

## 2. Create the Discord Application & Enable Activities

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. On **General Information**:
   - Copy **Application ID** (`DISCORD_APPLICATION_ID` / `VITE_DISCORD_CLIENT_ID`).
   - Copy **Public Key** (`DISCORD_PUBLIC_KEY`) for Ed25519 slash command verification.
3. On **OAuth2 -> General**:
   - Copy **Client Secret** (`DISCORD_CLIENT_SECRET`).
   - Under **Redirects**, add **`https://127.0.0.1`** (required by the Discord Embedded App SDK OAuth2 handshake).
4. On **Bot**:
   - Create/reset the bot token and save it as `DISCORD_BOT_TOKEN` (used to register `/w20` slash commands).
5. On **Activities -> Settings**:
   - Enable **Activities**.
   - Under **Supported Platforms**, enable Web / Desktop (and iOS/Android if desired).
6. On **Activities -> URL Mappings** (always **omit `https://`** and point targets to host/directory roots, never individual files like `index.html`):

| Prefix | Target (Production) | Target (Local Dev Tunnel) | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | `w20-discord-vtt.<your-subdomain>.workers.dev` | `<random>.trycloudflare.com` | Serves the Vite React SPA, `/api/*` OAuth/Bot endpoints, and `/ws/room/*` Durable Object WebSockets on one origin |
| `/supabase` | `<your-project-ref>.supabase.co` | `<your-project-ref>.supabase.co` | Proxies Supabase PostgreSQL REST queries inside Discord's `*.discordsays.com` CSP sandbox |
| `/r2-assets` | `media.<your-domain>.com` (or R2 custom domain) | `media.<your-domain>.com` | Serves battlemaps, form portraits, soundscapes, and self-hosted Ammo.js/dice-box assets |

7. On **General Information -> Interactions Endpoint URL**:
   - Set to `https://w20-discord-vtt.<your-subdomain>.workers.dev/api/discord-interactions` after deploying the Worker (or your `trycloudflare.com` URL while testing locally).

---

## 3. Supabase Schema, RLS Policies & Seed Data

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. From **Project Settings -> API**, copy:
   - Project URL (`SUPABASE_URL`)
   - Publishable / Anon Key (`SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`)
   - Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)
   - JWT Secret (`SUPABASE_JWT_SECRET`) — used by `/api/discord-token` to mint short-lived authenticated JWTs containing `discord_id` and `guild_ids` claims.
3. Link and push local migrations + seed data using the workspace `supabase` CLI:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push
   ```
   Or for local Docker-based Supabase development:
   ```bash
   pnpm exec supabase start
   pnpm exec supabase db reset
   ```
   This applies:
   - `supabase/migrations/202611200001_initial_w20_schema.sql` — enums, `campaigns`, `packs`, `characters`, `compendium_gifts`, `compendium_rites`, `compendium_totems`, `character_gifts`, `character_fetishes`, `roll_audit_logs`, `xp_ledger`.
   - `supabase/migrations/202611200002_rls_and_triggers.sql` — Row-Level Security policies (Storyteller CRUD, hidden NPC/secret roll scrubbing, `guild_ids` JWT claim membership check for pre-character campaign discovery, and `BEFORE UPDATE` permanent trait protection trigger on `characters`).
   - `supabase/seed.sql` — Canonical W20 Level 1–5 Gifts across all 3 Breeds, 5 Auspices, and 13 Tribes, starter Rites, and Pack Totems with declarative JSON macro configs.

---

## 4. Cloudflare R2 Bucket & Worker Configuration

1. Authenticate Wrangler (installed locally in `@w20-vtt/edge`):
   ```bash
   pnpm --filter @w20-vtt/edge exec wrangler login
   ```
2. Create the Cloudflare R2 bucket for battlemaps, portraits, audio loops, handouts, and dice assets:
   ```bash
   pnpm --filter @w20-vtt/edge exec wrangler r2 bucket create w20-vtt-media
   ```
3. Update `apps/edge/wrangler.jsonc` `[vars]` with your `DISCORD_APPLICATION_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`.
4. Upload production secrets to Cloudflare Workers (never commit these to git):
   ```bash
   pnpm --filter @w20-vtt/edge exec wrangler secret put DISCORD_CLIENT_SECRET
   pnpm --filter @w20-vtt/edge exec wrangler secret put DISCORD_PUBLIC_KEY
   pnpm --filter @w20-vtt/edge exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   pnpm --filter @w20-vtt/edge exec wrangler secret put SUPABASE_JWT_SECRET
   ```
5. For local `wrangler dev`, create `apps/edge/.dev.vars` (gitignored):
   ```ini
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   DISCORD_PUBLIC_KEY=your_discord_ed25519_public_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   SUPABASE_JWT_SECRET=your_supabase_jwt_secret
   ```

### Assign a voice-table Storyteller

Set the optional Worker variable `VOICE_TABLE_STORYTELLERS` to a JSON object. Each key is a raw Discord voice channel ID and each value is that table's Storyteller Discord user ID. With Discord Developer Mode enabled, use **Copy Channel ID** and **Copy User ID** to get these values.

```json
{"123456789012345678":"234567890123456789"}
```

For production, set it as a string in the Worker's variables. For local mock mode, add the following to `apps/edge/.dev.vars`, restart the local Worker, and sign in with mock slot 1.

```ini
VOICE_TABLE_STORYTELLERS='{"mock-channel":"900000000000000001"}'
```

The appointed account gets a private roll log, named initiative rolls it can reveal, and a read-only view of sheets currently bound to connected seats in that voice table. The latest 50 private rolls are stored in the table's Durable Object. Revealing publishes the initiative name and total to the shared order. Seated players can clear the order for the next encounter.

---

## 5. Register Discord `/w20` Slash Commands

Register `/w20 roll`, `/w20 xp-calc`, `/w20 xp-award`, and `/w20 npc-say`:

```bash
# Uses DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and optional DISCORD_GUILD_ID from .env
pnpm discord:register
```

> **Tip:** Set `DISCORD_GUILD_ID` in `.env` during testing so slash commands appear in your server immediately instead of waiting up to an hour for global command propagation.

---

## 6. Local Testing Inside a Live Discord Voice Channel (`cloudflared`)

1. Build `@w20-vtt/core` and `@w20-vtt/protocol`:
   ```bash
   pnpm --filter @w20-vtt/core build
   pnpm --filter @w20-vtt/protocol build
   ```
2. Start the local Cloudflare Worker + Durable Object server (default port `8787`) and Vite client dev server (default port `5173`):
   ```bash
   # Terminal 1
   pnpm dev:edge

   # Terminal 2
   pnpm dev:client
   ```
3. Expose Vite via Cloudflare Tunnel (`cloudflared`):
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
4. Copy the generated `<random>.trycloudflare.com` hostname (without `https://`) into **Discord Developer Portal -> Activities -> URL Mappings** for prefix `/`.
5. Enable **Developer Mode** in Discord (`User Settings -> Advanced`), join any Voice Channel in your test server, click the **Rocket (Activities)** button, and launch your W20 VTT Activity.

---

## 7. Production Build & Deploy

Run typechecking, full unit test suites, client Vite build, and Cloudflare Worker + Durable Object + Static Assets deployment:

```bash
pnpm typecheck
pnpm test
pnpm deploy
```
