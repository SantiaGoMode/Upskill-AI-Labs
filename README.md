# Upskill AI Labs

Upskill AI Labs is a local, hands-on learning application for practicing real workplace workflows with AI. Learners work inside a synthetic enterprise, produce evidence-linked artifacts, run them through deterministic and model-assisted evaluation, and retain proof of capability beyond course completion.

The initial curriculum is designed for program managers. Its scenarios use Northwind, a fictional company with deliberately imperfect records, conflicting evidence, restricted data, and adversarial instructions.

## What you can do

### Learn the fundamentals, then practise them

The course is nine modules. Module 0 assumes no prior AI knowledge and covers what a
language model actually does, tokens and context, hallucination and verification, the
data-class boundary, and how the same prompt is run in Microsoft Copilot, Google Gemini,
Anthropic Claude and OpenAI ChatGPT.

Modules 1 to 8 each wrap one lab in teaching: a concept lesson, an annotated worked
example with a real prompt and the failure it prevents, a tool guide for the four
assistants, the lab itself, and a knowledge check.

### Complete an eight-lab curriculum

The assessed pathway progresses from individual AI-assisted tasks to reusable and evaluated workflows:

1. Structure an ambiguous intake request.
2. Draft a weekly status from evidence.
3. Synthesize a noisy risk picture.
4. Prepare a decision with options and tradeoffs.
5. Build an executable delivery plan.
6. Turn a repeated process into a reusable jig.
7. Audit an executive narrative against its sources.
8. Regression-test and decide whether to promote a workflow.

Each lab includes a timeboxed workspace, an evidence pack, data-class controls, a prompt workbench, a structured deliverable, and a process-quality rubric.

### Run multiple model providers

The workbench supports:

- Google Gemini
- OpenAI
- Anthropic
- Local Ollama

The application does not silently fall through to another provider. Each run records the selected provider and model, response identifier, duration, supplied source IDs, token usage, and estimated cost. Unknown pricing is shown as unmetered instead of being guessed.

### Evaluate work, not writing style

Submitted artifacts receive a deterministic evaluation across five dimensions:

- Grounding
- Completeness
- Judgment
- Efficiency
- Guardrails

Facilitators can add a three-provider rubric-judge ensemble, record human calibration, resolve appeals, and inspect judge-versus-human agreement. Model judging and live regression batches require an explicit action; they never run automatically.

### Personalize the pathway safely

Bring Your Own Job onboarding supports two usable intake modes:

- `T0`: a role description only.
- `T1`: a representative artifact is inspected in the browser and reduced to a structural profile before submission.

T1 records counts such as lines, headings, list items, table dimensions, and the presence of date or email markers. Raw artifact text is not sent to the API, and the onboarding endpoint rejects raw-content fields. Full-artifact `T2` intake remains disabled until tenant-isolated storage is available.

Learners review nine proposed workflows, correct the map, choose three priorities, and receive a personalized route. The recipe engine preserves the same assessed eight-lab spine while making scenario context, pacing, and remediation visible.

### Manage curriculum and evidence

Trainer Studio provides curriculum forks, draft editing, human review, publishing gates, and cohort composition. Draft material cannot contribute to capability claims before it is reviewed and published.

Scheduled cohort sessions include a shared Live Room with an interactive whiteboard. The facilitator controls progression through the eight lessons, broadcasts the prompt currently under discussion, monitors participant presence, and can clear each lesson's collaborative whiteboard. Enrolled learners follow the active section and contribute notes without receiving peer email addresses.

Changes reach participants over a WebSocket rather than a polling timer. Each session
has one Durable Object holding the participants' sockets; when the room changes, it
signals them and each client refetches through the normal authorized API. The socket
carries no room state, so access checks and peer-email redaction still apply to every
read, and the WebSocket upgrade is authorized with the same check as the REST route.

The room shows whether that connection is live. If it drops, the client falls back to
refreshing on a timer and reconnects with backoff, so a failed channel costs freshness
rather than function.

The Capability Ledger creates evidence-linked claims from assessed submissions. Claims expire after 180 days. Workplace-transfer claims additionally require a recorded baseline and a measurement at least 30 days later.

## Quick start

Requirements:

- Node.js 22.13 or newer
- npm
- At least one model provider key, or a local Ollama installation, for live model runs

Install and start the local application:

```bash
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app can be used without model credentials for browsing the curriculum, drafting artifacts, deterministic evaluation, regression previews, onboarding, governance configuration, and the Capability Ledger.

## Model configuration

Add only the providers you intend to use to `.env`. Provider credentials are read by the server runtime and must never be exposed to browser code or committed to Git.

| Provider | Default model | Configuration |
|---|---|---|
| Gemini | `gemini-3.5-flash-lite` | `GEMINI_API_KEY`, optional `GEMINI_MODEL` |
| OpenAI | `gpt-5.6-sol` | `OPENAI_API_KEY`, optional `OPENAI_MODEL` |
| Anthropic | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` |
| Ollama | `gemma4` | `OLLAMA_BASE_URL`, optional `OLLAMA_MODEL` |

Gemini is the default testing provider and output is capped conservatively. The cost panel displays a paid-tier-equivalent estimate even when a project is eligible for free usage. OpenAI request storage is disabled. Ollama runs locally and is shown as having zero provider cost.

## Local identity and roles

Local development uses the fallback identity configured in `.env`:

```dotenv
LOCAL_DEV_USER_EMAIL=local-developer@upskill.invalid
LOCAL_DEV_ROLE=facilitator
```

Set `LOCAL_DEV_ROLE=learner` to exercise learner-only access. Attempts, histories, submissions, model runs, workflow maps, baselines, measurements, and claims are scoped to the authenticated email on the server.

The Account page (`/account`) can create a seven-day session for the configured developer account. Trainers can also generate cohort invitation links. Opening an invitation activates the learner membership, enrolls the learner, and starts a learner-scoped session.

Passwordless sign-in as the configured developer account works only on localhost in a non-managed environment. Invitations are redeemable on any hostname, so a deployed runtime can enroll learners without that shortcut.

### Identity on a deployed runtime

An authenticated reverse proxy supplies:

- `oai-authenticated-user-email`
- `oai-authenticated-user-full-name` when available
- `oai-authenticated-user-role: facilitator` only for facilitator access
- `x-upskill-proxy-secret` matching the configured `TRUSTED_PROXY_SECRET`

The secret is what makes the other three believable. Any client can send identity
headers, so they are honoured only when the proxy secret is presented:

| `TRUSTED_PROXY_SECRET` | Request | Identity headers |
|---|---|---|
| Configured | Correct secret presented | Trusted |
| Configured | Missing or wrong secret | Ignored |
| Not configured | `ENVIRONMENT` names a deployed environment | Ignored, so the runtime fails closed |
| Not configured | Local checkout | Trusted, which is how the test suite switches users |

`SESSION_SECRET` signs account session cookies. A managed environment refuses to
create or accept sessions without it rather than issuing unsigned ones. Set both
with `wrangler secret put`, never in `wrangler.jsonc`.

Attempts, histories, submissions, model runs, workflow maps, baselines, measurements, and claims are scoped to the authenticated email on the server.

## Navigation and roles

Every surface has its own URL, and the main navigation is filtered by the signed-in role.

| Surface | Route | Who sees it |
|---|---|---|
| Today | `/` | Everyone |
| Course | `/course` | Everyone |
| Module | `/course/<moduleId>` | Everyone |
| Lesson | `/course/<moduleId>/<lessonId>` | Everyone |
| Pathway | `/path` | Everyone |
| Lab | `/lab/<labId>` | Everyone |
| Prompt library | `/library` | Everyone |
| Capability ledger | `/ledger` | Everyone |
| Bring Your Own Job | `/onboarding` | Everyone |
| Account | `/account` | Everyone |
| Trainer Studio | `/studio` | Facilitator |
| Cohorts | `/cohorts` | Facilitator |
| Live Room | `/room/<sessionId>` | Facilitator and enrolled learners |
| Calibration and appeals | `/review` | Facilitator |
| Governance | `/governance` | Facilitator |

Facilitator routes are hidden from a learner's navigation and additionally rejected by the API, so hiding the link is a convenience rather than the access control itself.

## Data and persistence

The application uses Drizzle ORM with a Cloudflare D1 database. Bindings are declared in [`wrangler.jsonc`](./wrangler.jsonc), which both the Vite plugin and `wrangler deploy` read, so local development and deployment cannot drift apart.

Versioned SQL migrations live in [`drizzle/`](./drizzle), with the schema defined in [`db/schema.ts`](./db/schema.ts). Migrations are the schema contract:

- **Deployed environments** are migrated before serving traffic. A request path never issues DDL; if the schema is missing, the app fails with an explicit instruction to apply migrations instead of silently creating tables.
- **Local checkouts** have no migration step, so API routes still create missing tables. That is keyed off `ENVIRONMENT`, which is `development` locally and `production` in the deployed environment.

Northwind v1 contains:

- 300 relational records across customers, employees, contracts, tickets, financials, and messages
- 40 synthetic documents
- Duplicate records, stale evidence, numerical conflicts, prompt injection, and restricted-data cases

All names, organizations, domains, events, and values in the fixture corpus are fictional. Rebuild it deterministically with:

```bash
npm run data:generate
```

## Governance boundaries

The active governance policy controls:

- Maximum BYOJ intake tier
- Allowed data classes
- Approved model providers
- Prompt-retention period
- Prohibited uses
- AI disclosure rules
- Mandatory human-review boundaries

The same policy is enforced by onboarding and live model execution. Policy changes, curriculum review gates, cohort creation, workflow baselines, and measurements produce actor-linked audit events.

Synthetic training content should be used for model experiments. Sources labeled Confidential or Regulated must not be sent unless an explicitly activated policy and an appropriate runtime support that data class. The default policy permits only Public and Internal data.

### Retention is enforced, not just declared

A nightly Cron Trigger at 03:00 UTC deletes prompt and model-response records older
than the policy's retention window: model runs, judge results, regression runs, live
room cards, and usage events. A facilitator can also run it on demand from
`/governance`, which shows how many records are currently past the window.

Submitted artifacts, evaluations, and capability claims are deliberately out of
scope. They are assessment evidence with their own lifecycle, and a learner is
entitled to keep them as proof of capability. Setting the window to zero disables
time-based deletion, and the governance page says so rather than appearing to
enforce something it does not.

### Data-subject requests

From `/account`, a learner can export everything held for them as JSON, or erase it.
Erasure requires typing their own address, removes every learner-owned record in one
atomic batch, and leaves a single audit event recording that the erasure happened.
Both operations act only on the caller's own data.

### Model execution limits

Every governed provider call is recorded against the learner who caused it, and two
ceilings apply before any provider is contacted, so hitting a limit costs nothing:

| Ceiling | Default | Variable |
|---|---|---|
| Calls per rolling minute | 30 | `MODEL_RATE_LIMIT_PER_MINUTE` |
| Estimated spend per rolling 24 hours | $5.00 | `MODEL_DAILY_USD_CAP` |

Batches are checked as a whole, so a three-provider judge ensemble or a twenty-case
regression run is refused up front rather than billed halfway through. Provider
requests time out after 30 seconds (60 for local Ollama) and retry only on statuses
that indicate the request was never processed. Set a ceiling to `0` to disable it.

The spend cap refuses the call *after* the one that crossed it, so the size of an
individual call has to be bounded separately. Request bounds live in
[`app/lib/request-limits.ts`](./app/lib/request-limits.ts) and apply to every route:
a 256,000-character body ceiling checked before parsing, an 8,000-character prompt,
24 sources per run, 40 draft fields, and 500 objects per Live Room whiteboard. An
oversized request is a 413 and a malformed one a 400, neither of which reaches a
handler.

### One facilitator cannot see another's learners

A facilitator owns an organization and the cohorts under it, and every learner
arrives through an invitation into one of those cohorts. `role === "facilitator"`
therefore establishes *that* someone is a trainer, never *whose* learners they are;
any check keyed on the role alone would show one organization's learner work to
another organization's trainer.

[`app/lib/tenancy.ts`](./app/lib/tenancy.ts) is the single answer to "which learners
may this facilitator see?", and the assessment, curriculum, and audit surfaces all
scope through it:

| Surface | Scoped to |
|---|---|
| Trainer Studio versions and cohorts | Rows the caller owns |
| Curriculum edit, review, approve, publish | Addressed by id *and* owner |
| Calibration dashboard and judge anchors | Submissions by the caller's enrolled learners |
| Human review, appeal resolution, judging | The specific submission, checked per call |
| Governance audit trail | The caller and their learners |

**Known limitation.** The governance policy itself is a single global record, so an
activated policy, and the on-demand retention purge, apply across every
organization. Making policy per-organization needs a schema migration and is not
done here; until it is, treat facilitator accounts on a shared deployment as
mutually trusted for policy administration specifically. Curriculum approval has the
same shape: `approve` and `publish` can be performed by the same facilitator who
authored a version, because an organization with one trainer would otherwise be
unable to publish at all.

## Google Meet

Scheduled cohort sessions can carry a Google Meet link. Meet cannot be embedded in an
iframe, so the call opens in a separate tab while the shared prompt and whiteboard stay
in the Live Room.

Two modes, chosen automatically:

| Mode | When | What happens |
|---|---|---|
| **API** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` are set | The facilitator creates a real Meet space from the cohort page, and can pull a post-session recap |
| **Manual** | No credentials configured | The facilitator pastes a `https://meet.google.com/…` link, which is validated before it is stored |

The refresh token must belong to a Google Workspace user and carry the
`meetings.space.created` and `meetings.space.readonly` scopes. Meet spaces are owned by a
user rather than a service account, so there is no client-credentials path.

> Google's documentation states the Meet REST API "isn't intended for performance tracking
> or user evaluation." Attendance is therefore shown to the facilitator as an aggregate
> session recap only, and never reaches the Capability Ledger.

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler with no emit |
| `npm test` | Run unit, API, and browser-flow tests |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:api` | Run Playwright API tests |
| `npm run test:e2e` | Run Playwright Chromium flows |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate:local` | Apply migrations to the local D1 database |
| `npm run db:migrate:production` | Apply migrations to the production D1 database |
| `npm run build:production` | Build against the production environment configuration |
| `npm run deploy` | Build for production and deploy the worker |
| `npm run desktop` | Build, then open the desktop application |
| `npm run desktop:package` | Build desktop installers into `release/` |
| `npm run icons` | Regenerate the desktop icons from the brand mark |
| `npm run data:generate` | Rebuild the Northwind fixture corpus |

Every one of these except `deploy` runs on each push and pull request via
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Application structure

```text
app/
  page.tsx                Today — resume the course, progress, claims, sessions
  course/                 Course overview, modules and the lesson reader
  content/                Course content: schema, blocks renderer, SVG diagrams,
                          and the nine modules of written material
  path/                   Personalized pathway (fixed spine, visible adaptations)
  lab/[labId]/            The lab runner: brief, evidence, workbench, deliverable
  library/                Prompt library with attached reliability evidence
  ledger/                 Capability ledger, baselines, and measurements
  onboarding/             Bring Your Own Job intake
  account/                Identity, local sessions, attempt history
  studio/                 Trainer Studio (facilitator)
  cohorts/                Roster, sessions, interventions (facilitator)
  room/[sessionId]/       Live Room (facilitator + enrolled learners)
  review/                 Judge calibration and appeals (facilitator)
  governance/             Policy versions and audit trail (facilitator)
  components/             App shell, lab runner, and the shared UI primitives
  api/                    Server routes
  lib/                    Provider, pricing, evaluation, governance, recipe, identity,
                          budget, retention, and observability logic
  error.tsx               Route error boundary
  global-error.tsx        Root layout error boundary
  not-found.tsx           Unknown route, module, lesson, or lab id
db/
  schema.ts               Drizzle table definitions
  runtime.ts              Local schema creation and deployed-schema verification
data/northwind-v1/        Synthetic records and document corpus
drizzle/                  Versioned SQL migrations, applied by wrangler at deploy
wrangler.jsonc            Worker bindings, cron trigger, and environments
tests/
  unit/                   Pure logic, identity trust, budget, and fixture tests
  api/                    Ownership, data-rights, and API behavior tests
  e2e/                    Chromium course, lab, facilitator, and hardening flows
tests/support/            Shared fixtures used by both Playwright suites
desktop/                  Electron shell hosting the Worker locally
worker/
  index.ts                Security headers, the socket upgrade, and the retention cron
  live-room-socket.ts     Durable Object fanning out Live Room change notifications
docs/                     Static GitHub Pages project description
```

The primary API surfaces are:

| Route | Responsibility |
|---|---|
| `/api/attempts` | Start, save, submit, resume, and list learner attempts |
| `/api/model-runs` | Provider availability, governed execution, traces, usage, and cost |
| `/api/evaluations` | Judge ensembles, facilitator calibration, agreement, and appeals |
| `/api/regression-runs` | Preview and live 20-case regression batches |
| `/api/onboarding` | BYOJ workflow mapping, pathway creation, and transfer experiment data |
| `/api/trainer-studio` | Curriculum versions, review gates, publishing, and cohorts |
| `/api/governance` | Versioned policies and audit evidence |
| `/api/capabilities` | Claims, baselines, and workplace measurements |
| `/api/auth` | Local account sessions and invitation acceptance |
| `/api/cohorts` | Enrollment, progress, scheduled sessions, interventions, and outcomes |
| `/api/live-room` | Session access, lesson progression, presence, shared prompts, and whiteboard notes |
| `/api/live-room/socket` | Authorized WebSocket upgrade onto a session's change channel |
| `/api/prompts` | Read-only prompt library derived from attempts and their regression evidence |
| `/api/course` | Lesson completion and knowledge-check scores |
| `/api/meet` | Google Meet space creation, manual link attachment, and session recap |
| `/api/account` | Learner data export and account erasure |
| `/api/health` | Unauthenticated database and secret readiness probe |

## Running a cohort locally

1. Open **Studio** (`/studio`) and move a fork through review to a published version.
2. Create a cohort from that published version.
3. Open **Cohorts** (`/cohorts`) to invite learners and schedule sessions.
4. Give each learner their local invitation link (`/account?invite=…`).
5. Learners accept the invitation on the Account page and receive a learner-scoped cohort view.
6. Open a scheduled session's **Live Room** (`/room/<sessionId>`). The trainer opens the room, controls the active lesson, shares prompts, and facilitates the section whiteboard.
7. Use the cohort roster to monitor submitted and passing labs, record intervention notes, and complete or archive the cohort.

## Testing

Run the complete validation suite before committing changes:

```bash
npm run lint
npm run build
npm test
git diff --check
```

API and browser tests start the application on port `3100` and use a local D1 database. Live provider calls are not required by the automated suite.

They run on a single worker and with no retries: every spec drives the same server
and the same local SQLite file, where concurrent writers produce lock contention
rather than useful parallelism, and a retry would hide the kind of data-dependent
failure that only appears once the local database has grown.

Note that the local database accumulates across runs, so suites that create cohorts
or attempts exercise progressively larger id sets — which is how D1's
bound-parameter limit gets caught (see [`app/lib/sql-chunks.ts`](./app/lib/sql-chunks.ts)).

`tests/api/access-control.api.spec.ts` drives two unrelated facilitators against the
same deployment, which is the case a role-only check passes and an ownership check
does not. The pure decisions — cross-site refusal and the request bounds — are unit
tested in `tests/unit/cross-site.test.ts` and `tests/unit/request-limits.test.ts`,
because under `vinext dev` the framework's own origin guard answers a cross-origin
request before the worker sees it.
Delete `.wrangler/` to start from an empty database.

## Desktop application

The app also ships as a desktop application, which is the local-first way to run it:
no deployment, no proxy, no network dependency beyond the model providers a learner
chooses to configure.

```bash
npm run desktop          # build, then open the app
npm run desktop:package  # build installers into release/
```

**It runs the same Worker as a deployment, not a reimplementation.** The app is a
Cloudflare Worker — it imports `cloudflare:workers` and needs D1, a Durable Object,
and the asset fetcher — so plain Node cannot host it at all (`vinext start` fails on
the `cloudflare:` module scheme). The desktop build therefore embeds **workerd**, via
wrangler's programmatic worker, and points a window at it. There is no second
backend to drift from the first.

| Piece | Where |
|---|---|
| Window, menus, external links | [`desktop/main.mjs`](./desktop/main.mjs) |
| Worker host (workerd, bindings, readiness) | [`desktop/runtime.mjs`](./desktop/runtime.mjs) |
| Runtime child process | [`desktop/serve.mjs`](./desktop/serve.mjs) |
| Credentials and limits | [`desktop/settings.mjs`](./desktop/settings.mjs) |

Learner data — attempts, submissions, claims, whiteboards — lives in the platform's
application-support directory (**File → Open Data Folder**), so it survives upgrades
and can be backed up or deleted as ordinary files. Provider keys go in
`settings.json` beside it (**File → Open Settings File**); nothing is bundled with
the application.

Three constraints are load-bearing, and each is commented where it applies:

- **The app ships unarchived (`asar: false`).** wrangler and workerd resolve and
  spawn real files; inside an asar archive the worker starts but never becomes
  ready. This is why the bundle is large (~580 MB on macOS, most of it Electron and
  workerd).
- **The runtime runs in a child process**, not Electron's main process, so a crash
  in the worker cannot take the window with it.
- **`ENVIRONMENT` stays `development`.** A desktop install is one person's own
  machine with no authenticating proxy; naming a managed environment would make the
  app refuse every request for want of a proxy secret it can never be given. The
  identity is the local account from `settings.json`.

Meet links, and any other outward link, open in the system browser rather than in
the app window.

### Signing and notarization

`npm run desktop:package` will sign with whatever Developer ID it discovers, which
is almost certainly not what you want on a shared machine. For an unsigned local
build:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --dir
```

Signing and notarizing a distributable is deliberately left as an explicit step —
it needs your certificates and an Apple ID, and it produces an artifact under your
identity.

### Application icon

The icon is generated from the brand mark in
[`docs/assets/labs-mark.svg`](./docs/assets/labs-mark.svg), so it cannot drift from
the mark in the app header:

```bash
npm run icons   # writes build/icon.png and build/icon.icns
```

`build/` is where electron-builder looks by convention. The generated files are
committed, so packaging works without rerunning the script; rerun it after editing
the mark. The mark is inset by 8% rather than bled to the edge, because macOS
composites app icons on a grid where full-bleed artwork reads as oversized next to
system icons. Generating the `.icns` uses `iconutil` and therefore only works on
macOS; the PNG covers Linux and is converted for Windows.

## Deployment

The app is a Cloudflare Worker with a D1 database. First time only:

```bash
npx wrangler d1 create upskill-ai-labs      # paste the id into wrangler.jsonc
npm run db:migrate:production
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put TRUSTED_PROXY_SECRET --env production
npx wrangler secret put GEMINI_API_KEY --env production   # and any other providers
```

Then, for each release:

```bash
npm run db:migrate:production   # when the schema changed
npm run deploy
```

The first deploy also creates the `LiveRoomSocket` Durable Object class declared in
`wrangler.jsonc`; no separate step is needed. If the binding is unavailable, the Live
Room reports the channel as unavailable and falls back to timed refreshes instead of
failing.

`GET /api/health` reports whether the database answers and whether the identity and
session secrets are present, without revealing their values. It returns `503` when
anything is missing, so a load balancer will not send traffic to a runtime that
cannot authenticate anyone.

Put the app behind an authenticating reverse proxy that sets the identity headers
described above, strips them from inbound public requests, and adds
`x-upskill-proxy-secret`. Without `TRUSTED_PROXY_SECRET` the deployment ignores
identity headers entirely and no one can sign in except through an invitation.

## Project website

The application runs locally. [`docs/`](./docs) contains a separate static description of the project for GitHub Pages; it does not contain a live application runtime or receive provider credentials.
