# Maasii

Table service for Ethiopian cafés and restaurants: guests open the Venue Link on their table to read the Menu and order, staff run service, and owners manage the Menu and learn from orders and feedback. One Next.js web app serves every role ([ADR 0001](docs/adr/0001-one-web-app-for-every-role.md)) on top of Supabase.

Read these first: [`GLOSSARY.md`](GLOSSARY.md) (use its terms in code, tests and UI), [`docs/adr/`](docs/adr), and the v1 spec and tickets in [`.scratch/maasii-v1/`](.scratch/maasii-v1).

## Quick start

You need Node 22.12 or later, pnpm 10 and Docker (running).

```bash
pnpm install
pnpm exec playwright install chromium   # once per machine, for the browser tests
pnpm db:start                           # start this checkout's Supabase stack and write .env.local
pnpm db:reset                           # apply migrations and seed Bilo's Pastry
pnpm dev                                # then open http://localhost:3000/v/bilos-lancha
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server. Use `PORT=3001 pnpm dev` when another checkout already uses 3000. |
| `pnpm build` / `pnpm start` | Production build and server. |
| `pnpm test` | Maasii core tests (Vitest) against the local Supabase stack. |
| `pnpm test:e2e` | Browser tests (Playwright) against a fresh production build. Needs the seed. |
| `pnpm typecheck` / `pnpm lint` | Route type generation plus `tsc`, and ESLint. |
| `pnpm db:start` / `pnpm db:stop` | Start or stop this checkout's Supabase stack. `db:start` also runs `db:env`. |
| `pnpm db:env` | Rewrite `.env.local` from the running stack (ports and keys). |
| `pnpm db:reset` | Recreate the database from `supabase/migrations`, then run `db:seed`. |
| `pnpm db:seed` | Seed Bilo's Pastry through the Maasii core. Skips if already seeded. |
| `pnpm supabase <args>` | The pinned Supabase CLI (3.1.0). Never use a global `supabase` binary. |

## One local Supabase stack per worktree

`supabase/config.toml` turns on the CLI's stack mode (`[experimental] stack = true`) and sets no ports. Each checkout or git worktree therefore gets its own Postgres, Auth, REST, Realtime and Storage, on ports the CLI picks and keeps stable across stop and start. Studio, mail, analytics and edge functions are disabled to save memory.

- **Never hard-code ports or keys.** `pnpm db:env` (run by `db:start` and `db:reset`) writes them to `.env.local`, which is gitignored like every `.env*` file. The app, the seed and both test suites read `.env.local`.
- The stack belongs to the checkout's directory and branch. Switching branches in the same directory selects a different, empty stack: run `pnpm db:start && pnpm db:reset` again.
- `pnpm supabase stack list` shows every local stack on the machine. `pnpm db:stop` frees memory and keeps data. `pnpm supabase stack destroy --yes` deletes this checkout's data.
- The first `db:start` on a machine downloads images and can fail with `Owner response unavailable`. Run it again.
- Schema changes go in a new migration: `pnpm supabase migration new <name>`, then `pnpm db:reset`. Never edit a migration that has been merged.
- Ports for the app: `pnpm dev` uses `PORT` (default 3000). `pnpm test:e2e` builds and serves on a port derived from the checkout path (4000-4999), or `E2E_PORT`. Set `E2E_REUSE_SERVER=1` to test against a server you already started on that port.

## Layout

```
src/core/          Maasii core: every business rule. Public interface is src/core/index.ts ("@/core").
src/app/           Next.js routes. Screens call the core and render; they contain no rules.
src/ui/            Presentational components shared by screens.
src/lib/supabase/  Supabase clients (admin client for Auth administration only).
supabase/          config.toml, migrations, supabase.lock (pinned service versions).
scripts/           write-env.mjs, seed/ (Bilo's data and the seed script).
tests/core/        Core tests (seam 1). tests/support/ holds the scenario builder and helpers.
e2e/               Playwright tests (seam 2).
```

## The Maasii core

The core is the only place business rules live. Screens, scripts and tests import it only through `@/core` (a lint rule blocks deep imports).

- **Every command and query takes the calling `Actor` first**: `publicActor` (no session, such as a guest browsing), `staffActor(userId)` (a signed-in person whose roles come from memberships in the database), or `systemActor` (seeding and scheduled jobs). Later tickets add a guest-device actor and a platform-admin actor here.
- **One transaction per call, acting as the actor.** `inTransaction(actor, work)` in `src/core/db.ts` opens a `pg` transaction and switches to the `anon` or `authenticated` role with that actor's JWT claims, so Postgres row-level security applies to every statement the core runs. `systemActor` runs as `postgres` and bypasses it.
- **Two layers of checks.** A command checks permission explicitly (`src/core/access.ts`) and throws `MaasiiError` with code `not_allowed`, `not_found` or `invalid_input`. Row-level security in the migration enforces the same rules as a backstop, and also protects live subscriptions that read the database directly.
- **Records live in the `app` schema**, which the Supabase Data API does not expose. Grant each table to `anon` or `authenticated` explicitly in its migration.
- **Time is an input.** A command that records business time takes `{ now }` (defaulting to the current time) so tests can control it. Do not rely on SQL `now()` for business rules.
- **Money is whole santim** (1 ETB = 100 santim) in integer columns named `price_santim` and fields named `priceSantim`.
- Commands validate their input with zod at the top, then do all their database work inside `inTransaction`.

Adding a command: write a failing core test first, put the command in the area file it belongs to (`menu.ts`, `brands.ts`, `staff.ts`, or a new area file), check access, export it from `src/core/index.ts`, and add the matching RLS policy and grant in a migration.

Current interface: `createBrand`, `createVenue`, `addTables` and `addBrandOwner` (system only until ticket 07), `publishMenu` (the Brand's Owner), and `getPublishedMenu` (anyone, by Venue Link token). A published Menu is an immutable version; dishes, sections, Option Groups and their choices keep stable ids across versions when the publisher passes them, and the Brand points at its current version.

**Browser-safe rules.** `priceDraftLine` and `priceDraft` price a guest's Draft from the published Menu and report what needs attention (a missing required choice, a dish or choice no longer on the Menu). They are pure, so client components import them from `@/core/browser`, the only other entry point the lint rule allows. Never import the database from `src/core/draft.ts` or anything `browser.ts` exports.

## Tests

Tests exercise behaviour through the core's public interface or the browser, never internals. See the spec's Testing Decisions.

**Core tests** (`tests/core`, `pnpm test`) call core commands as specific actors against the real local stack (real migrations and row-level security, no mocks). They never reset the database: every test builds its own tenant with the scenario builder, so tests run in parallel without colliding.

```ts
import { scenario } from "../support/scenario";

const s = await scenario().brand("Bilo's").venue("Lancha", { tables: 16 }).publishedMenu().build();
// s.brand, s.owner (a real Auth user with .actor), s.venue (with .linkToken and .tables),
// s.venues by name, s.menu (the published version), s.dishId("Omelette")
```

The builder creates everything through core commands. Extend it with new steps (waiters, shifts, orders) rather than writing rows by hand in tests.

**Browser tests** (`e2e`, `pnpm test:e2e`) run Playwright on an Android-sized Chromium against a production build. They may use the seeded Bilo's Pastry (`/v/bilos-lancha`) or build their own tenant with the same scenario builder. The guest menu must stay under 250 KB transferred before photos, fonts included; the Next.js and React runtime alone is about 135 KB gzipped and one static Ethiopic font weight about 73 KB, so keep guest client components small.

## Seed data

`pnpm db:seed` creates Bilo's Pastry with its Lancha venue (tables 1-16) and an Owner (`owner@bilos.test`, no password yet), and publishes Bilo's Menu as that Owner through the core. Dish names and descriptions come from bilospastry.com. **All prices are placeholders** until Bilo's provides real ones (see `scripts/seed/bilos.ts`). Bilo's must confirm in writing that we may use its name, logo, photos and Menu.
