# Maasii

Table service for Ethiopian cafés and restaurants: guests open the Venue Link on their table to see the Menu, place an Order, find Payment details, leave private Reviews and follow the Brand's social links. Managers run service at their assigned Venues; Owners manage the Brand and learn from orders and feedback. One Next.js web app serves every role ([ADR 0001](docs/adr/0001-one-web-app-for-every-role.md)) on top of Supabase.

Read these first: [`GLOSSARY.md`](GLOSSARY.md) (use its terms in code, tests and UI), [`docs/adr/`](docs/adr), and the v1 spec and tickets in [`.scratch/maasii-v1/`](.scratch/maasii-v1).

## Quick start

You need Node 22.12 or later, pnpm 10 and Docker (running).

```bash
pnpm install
pnpm exec playwright install chromium   # once per machine, for the browser tests
pnpm db:start                           # start this checkout's Supabase stack and write .env.local
pnpm db:reset                           # apply migrations and seed Bilo's Menu
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
| `pnpm db:seed` | Seed Bilo's Pastry through the Maasii core. Skips Bilo's if already seeded. |
| `pnpm supabase <args>` | The pinned Supabase CLI (3.1.0). Never use a global `supabase` binary. |

## One local Supabase stack per worktree

`supabase/config.toml` turns on the CLI's stack mode (`[experimental] stack = true`) and sets no ports. Each checkout or git worktree therefore gets its own Postgres, Auth, REST, Realtime and Storage, on ports the CLI picks and keeps stable across stop and start. Studio, mail, analytics and edge functions are disabled to save memory.

- **Never hard-code ports or keys.** `pnpm db:env` (run by `db:start` and `db:reset`) writes them to `.env.local`, which is gitignored like every `.env*` file. The app, the seed and both test suites read `.env.local`.
- The stack belongs to the checkout's directory and branch. Switching branches in the same directory selects a different, empty stack: run `pnpm db:start && pnpm db:reset` again.
- `pnpm supabase stack list` shows every local stack on the machine. `pnpm db:stop` frees memory and keeps data. `pnpm supabase stack destroy --yes` deletes this checkout's data.
- The first `db:start` on a machine downloads images and can fail with `Owner response unavailable`. Run it again.
- Schema changes go in a new migration: `pnpm supabase migration new <name>`, then `pnpm db:reset`. Never edit a migration that has been merged.
- Ports for the app: `pnpm dev` uses `PORT` (default 3000). `pnpm test:e2e` builds and serves on a port derived from the checkout path (4000-4999), or `E2E_PORT`. Set `E2E_REUSE_SERVER=1` to test against a server you already started on that port. For tests with controlled dates, start the server with `NODE_OPTIONS='--import ./e2e/support/server-clock.mjs' pnpm start -p <port>`.

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

- **Every command and query takes the calling `Actor` first**: `publicActor` (no session, such as a guest browsing), `guestActor(userId)` (an anonymous Supabase identity created on the first Send), `staffActor(userId)` (a signed-in person whose roles come from memberships), `adminActor(userId)` (a signed-in person whose platform admin role is checked in the database), or `systemActor` (seeding and scheduled jobs).
- **One transaction per database operation, acting as the actor.** `inTransaction(actor, work)` in `src/core/db.ts` opens a `pg` transaction and switches to the `anon` or `authenticated` role with that actor's JWT claims, so Postgres row-level security applies to every statement the core runs. `systemActor` runs as `postgres` and bypasses it.
- **Two layers of checks.** A command checks permission explicitly (`src/core/access.ts`) and throws `MaasiiError` with code `not_allowed`, `not_found` or `invalid_input`. Row-level security in the migration enforces the same rules as a backstop, and also protects live subscriptions that read the database directly.
- **Records live in the `app` schema**, which the Supabase Data API does not expose. Grant each table to `anon` or `authenticated` explicitly in its migration.
- **Time is an input.** A command that records business time takes `{ now }` (defaulting to the current time) so tests can control it. Do not rely on SQL `now()` for business rules.
- **Money is whole santim** (1 ETB = 100 santim) in integer columns named `price_santim` and fields named `priceSantim`.
- Commands validate their input with zod at the top, then do all their database work inside `inTransaction`.

Adding a command: write a failing core test first, put the command in the area file it belongs to (`menu.ts`, `brands.ts`, `staff.ts`, or a new area file), check access, export it from `src/core/index.ts`, and add the matching RLS policy and grant in a migration.

A published Menu is an immutable version. Dishes, sections, Option Groups and their choices keep stable IDs across versions when the publisher passes them, and the Brand points at its current version.

A Venue Menu combines that Brand Menu with the Venue's latest published local changes ([ADR 0007](docs/adr/0007-managers-publish-venue-local-menu-changes.md)). The guest Menu, Send and Quick add all use that offering. Saved Venue drafts are private. Local publishes never rewrite an existing Order or Bill.

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

**Browser tests** (`e2e`, `pnpm test:e2e`) run Playwright on an Android-sized Chromium against a production build. They may use the seeded Bilo's Pastry (`/v/bilos-lancha`) or build their own tenant with the same scenario builder. The guest homepage and Menu must each stay under 250 KB transferred before photos, fonts included; the Next.js and React runtime alone is about 135 KB gzipped and one static Ethiopic font weight about 73 KB, so keep guest client components small.

Guest Menu utilities are selected in `src/app/globals.css`. Secondary guest pages and the lazy Order service load `src/app/guest-extras.css`; staff routes load `src/app/staff.css` through their shared header or layout.

## Language

Interface messages live in `messages/en.json` and `messages/am.json`. The next-intl request config uses the guest's saved preference or phone language. Staff have a separate preference and default to Amharic. Pass only the namespaces a client component uses to its `NextIntlClientProvider`. The Menu supplies localized names and descriptions through the core, with the other language as fallback. Drafts retain the dish and choice IDs when the guest switches language.

## Seed data

`pnpm db:seed` creates Bilo's Pastry with its Lancha venue (tables 1-16) and an Owner (`owner@bilos.test`, no password yet), and publishes Bilo's Menu as that Owner through the core. English dish names and descriptions come from bilospastry.com. The Amharic Menu and interface text are drafts for a fluent speaker and Bilo's to review before the pilot. **All prices are placeholders** until Bilo's provides real ones (see `scripts/seed/bilos.ts`). Bilo's must confirm in writing that we may use its name, logo, photos and Menu.

Open Maasii at `/`. The only seeded guest demo is Bilo's at `/v/bilos-lancha`. Choose **Menu** there or open `/v/bilos-lancha/menu` directly. For `/staff` and `/manage`, follow the staff setup below.

If your local stack still has the old Saba House demo, `pnpm db:reset` clears the local database and reseeds Bilo's only.

## Staff setup

To provision the first platform admin, create a confirmed Supabase Auth user with a password, then call `addPlatformAdmin(systemActor, { userId })` from a server script. At `/sign-in`, sign in and open **Platform admin** to create a Brand and copy its Owner invitation link. Owners create Venues and share Manager invitations from `/manage`. Invitation links are single-use and expire after seven days.

Owners open their Brand overview at `/manage`. Managers land in **Venue operations** at `/manage/operations`, where they can open Shifts, Tables, Waiters and the Venue Menu. Owners can enter the same operational controls for their Venues. From **Venue menu**, use **Edit Venue Menu** to save and preview a draft, then publish changes for that Venue only. **Use Brand dish details** restores inheritance; **Sold Out** is immediate and separate from archiving a dish. Brand Menu, Brand social links and Payment Options stay under Owner control.

In a Venue's **Waiters** section, show a QR for a new Waiter or select an existing Waiter to set up or reset their sign-in. Each QR expires after five minutes and works once. During setup the Waiter enters a phone number and chooses a six-digit PIN. On a new browser, they can sign in at `/staff` with their phone number and PIN. Five unsuccessful sign-in attempts pause that account's phone sign-in for 30 minutes. On a connected browser, the PIN unlock lasts up to eight hours. Five wrong unlock attempts require reconnecting the browser. Existing devices can still unlock with their original PIN until a Manager's QR sets up the Waiter's new credentials. Removing a Waiter revokes access on every enrolled device.

Staff language choices follow their account between phones. Amharic is the default.

Set `MAASII_SITE_URL` on the server to the public origin when deploying so the Venue Links, QR images and invitation links use the same address.

For hosted Supabase, use the transaction pooler URL in `DATABASE_URL` and set `SUPABASE_DB_CA` to the PEM certificate from Supabase Database Settings. Leave SSL query parameters off that URL so the PostgreSQL driver uses the supplied CA and verifies the hostname.

Use an HTTPS `MAASII_SITE_URL` in deployments. Auth and Waiter unlock cookies share a Secure policy;
HTTP cookies are permitted for local development. The proxy supplies a fresh nonce for Next.js scripts,
blocks framing and plugin content, and starts HSTS at five minutes. Increase HSTS at the hosting edge
after verifying HTTPS; do not preload unverified subdomains. Set `MAASII_CSP_REPORT_URL` to your HTTPS
Reporting API collector to receive CSP violations. Strip page URLs, query strings and script samples
before retaining reports, since they may contain invitation tokens or personal data. Inline Brand
styles, Menu photos and Supabase connections remain supported. Trusted Types enforcement needs a
separate framework compatibility check before enabling it.

`pnpm exec playwright install webkit` installs the second browser used by the focused web reliability
checks. `pnpm exec playwright test e2e/web-reliability.spec.ts` checks Chromium and WebKit. Scroll
containment on non-scrollable dialog backdrops is progressive enhancement; Safari versions that
ignore it still get native modal focus containment and the tested light-dismiss fallback.

## Staff notifications

Waiters install Maasii from the browser menu at `/staff`, then select **Enable notifications** on each enrolled phone. Android is the supported staff platform. On iPhone, open Maasii from the Home Screen before enabling notifications. The staff worker stays inside `/staff` and uses the network for live Orders. A tap or key press on the staff screen enables the foreground chime.

The current Table Assignments identify the Waiters on duty. An Order at an unassigned Table reaches those Waiters immediately. The minute job marks still-Sent Orders once they are at least two minutes old, then alerts the current Shift. A Shift with no Table Assignments has no push recipients until Waiters are assigned.

To enable delivery on a deployment:

1. Run `pnpm exec web-push generate-vapid-keys --json`. Set `MAASII_VAPID_PUBLIC_KEY`, `MAASII_VAPID_PRIVATE_KEY` and `MAASII_VAPID_SUBJECT` in the Next.js server environment. Use a real `mailto:` contact or HTTPS URL for the subject.
2. With the migration applied, create the Vault secret named `maasii_order_notify_url` with the full URL for `/api/jobs/notify`. Use an address reachable from Postgres. For local Docker that is `http://host.docker.internal:<app-port>/api/jobs/notify`. For self-hosted Supabase use a Postgres instance with `pg_cron` and `pg_net` preloaded and the database named `postgres`.
3. Check the `maasii-order-notifications` job in `cron.job_run_details`. Postgres issues a one-use authorization token for each request. Delivery rows survive transient failures and become eligible for retry on the next minute. Invalid or expired provider subscriptions are cleared.

The deployed staff origin must use HTTPS. Local browser tests use a fixture at the browser push boundary. Core tests supply the delivery transport and control the escalation clock.

### Check delivery on a real staff phone

1. Use the target HTTPS environment and a test Venue. Confirm all three Web Push environment variables are set, the Vault URL points to that environment's notification job endpoint, and the minute job runs successfully. For each test Order, check that the wake reached the endpoint and the worker attempted delivery; a 204 from the endpoint confirms the worker ran, not that the phone received a notification.
2. Install Maasii on a supported Android phone. If the pilot uses iPhone, test it separately by opening Maasii from the Home Screen. Enroll the phone as a Waiter, unlock it, start a Shift, assign a Table to that Waiter, then tap **Enable notifications** and grant permission. Check the phone's notification settings, Focus/Do Not Disturb and connection. **Setup completed** means Maasii saved the subscription; it does not confirm delivery.
3. From a separate guest phone, Send to the assigned Table three times, using a fresh Order for each check: with the unlocked Waiter page open (tap it first to enable sound), with Maasii in the background, and with the phone screen locked. Expect a visible Order and chime in the first case, and a device notification in the other two. Leave each Order Sent until the alert arrives; then tap a notification to confirm the correct Table opens, through PIN unlock when needed. Accept and close out test Orders normally.
4. With Waiters assigned on the running Shift, Send to an unassigned Table and confirm the current on-duty Waiters receive it. Leave one assigned Order unaccepted and confirm escalation on the minute job after the Order is at least two minutes old. A Shift without any Table Assignments has no push recipients; assign a Waiter before treating a missing alert as a delivery failure.
5. Record the environment, test date, device/browser/OS, assigned Table, Send/receipt timing and result for each case. Record failed and pending cases separately. Never include VAPID keys, subscription endpoints, wake tokens, PINs or guest data. Automated browser results cannot substitute for this check.

## Menu assistance

Set `OPENAI_API_KEY` and `MAASII_MENU_AI_MODEL` on the server to enable Menu photo import and translation suggestions. Choose a model that supports image input and Structured Outputs in the [Responses API](https://developers.openai.com/api/docs/guides/structured-outputs). Never use a `NEXT_PUBLIC_` prefix for these values.

Owners can import one or two JPEG, PNG or WebP photos at a time, up to 4 MB each. Crop to the paper Menu and remove any personal information before upload. Maasii removes image metadata before sending the photos and sends only the source Menu fields and language codes for translations. The model call runs outside the database transaction. Maasii checks the draft revision again before saving a result. Keep or discard imported entries, and edit or accept suggested translations, before publishing the Menu manually. Core tests use a fake model.

## Production redesign and serving media

The production UI uses shared warm surfaces, sans-serif operational text, four guest destinations, and explicit Table confirmation. Menu changes still require **Save draft**, then **Publish**. Editor recovery stays in the current tab, keyed by actor and Brand/Venue; restoring an older revision never overwrites a newer server draft silently.

Serving photos accept JPEG, PNG or WebP up to 4 MiB. New uploads strip metadata and produce a 960px detail image and 320px thumbnail; existing photo URLs continue to work. Videos are externally prepared MP4/H.264 clips: 2–5 seconds, at most 1 MiB and 720px on the long edge, one video track and no audio. The server inspects the MP4; a serving photo is required before publication. Uploading either medium only changes the editing draft.

Apply `20261117093036_dish_serving_media.sql` before deploying the UI. It adds immutable video metadata, a nullable published-dish reference and the public `dish-videos` bucket. Uploads remain server-mediated and actor-authorized. No existing Menu needs backfilling or republishing. The MP4 parser stays outside browser bundles.

Unreferenced serving uploads can be inspected with:

```sh
node scripts/cleanup-serving-media.mjs
```

The default is a dry run. `--delete` removes only unreferenced serving objects older than seven days; it locks Menu reference tables during the check and retains references in saved drafts, archives and every published version. It never removes media on ordinary replace/remove actions. Unsaved browser drafts are not durable references: save work before long-term storage maintenance. Run this maintenance command against the intended environment, with its database and server Storage credentials.

The release register is [production redesign coverage](.scratch/maasii-production-redesign/coverage.md). Real-phone notification delivery, fluent Amharic review, first-time user observation and final manual accessibility/visual review remain required before production release. Keep the additive migration during an application rollback; never reset production data. Pause Menu authoring during rollback to an older application version so its older draft schema cannot discard newly added video references.
