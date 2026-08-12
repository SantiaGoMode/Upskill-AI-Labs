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

Changes reach participants through an authorized Server-Sent Events channel. The
channel carries only an invalidation signal, never room data; each client refetches
through the normal authorized API, so access checks and peer-email redaction apply to
every read. Local development uses an in-process event bus and Server-Sent Events.
The deployed client listens to one small authenticated Firestore signal document only
while a participant is connected, avoiding a long-lived App Hosting server request.
If the channel drops, the client falls back to timed refreshes.

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

### Identity on Firebase

The deployed app uses Firebase Authentication with Google sign-in. The Next.js server
verifies the Firebase ID token and then issues a signed, HTTP-only session cookie so
normal API calls and the Live Room event stream share the same identity. The addresses
in `FACILITATOR_EMAILS` receive facilitator access; other Google accounts must already
have an active invitation or membership.

`SESSION_SECRET` signs account session cookies and is stored in Google Secret Manager
through the App Hosting secret binding in `apphosting.yaml`. A managed environment
refuses to create or accept sessions without it. The older trusted-proxy header path is
still available for private deployments, but it is not required by Firebase hosting.

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

App Hosting stores application records in Cloud Firestore through the Firebase Admin
SDK. Browser clients have no application-data access. `firestore.rules` denies all
writes and every data read except an authenticated `get` of a known Live Room signal
path; authorization and room state remain in the Next.js API routes.

Local development and all automated tests use an in-process adapter by default, so
they create no Firestore reads, writes, storage, or network traffic. Set
`FIRESTORE_EMULATOR_HOST` only when explicitly testing the Firestore adapter. The
schema contract remains in [`db/schema.ts`](./db/schema.ts); Firestore itself is
schema-less. Queries push a selective indexed predicate to Firestore and chunk `in`
lookups at 30 values to avoid collection-wide reads and query-limit failures.

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

The Governance page can delete prompt and model-response records older than the
policy's retention window on demand: model runs, judge results, regression runs, live
room cards, and usage events. No scheduled cloud job is created by default, which
avoids an unnecessary recurring service. Add a scheduled invocation only when the
deployment needs automatic retention enforcement.

Submitted artifacts, evaluations, and capability claims are deliberately out of
scope. They are assessment evidence with their own lifecycle, and a learner is
entitled to keep them as proof of capability. Setting the window to zero disables
time-based deletion, and the governance page says so rather than appearing to
enforce something it does not.

### Data-subject requests

From `/account`, a learner can export everything held for them as JSON, or erase it.
Erasure requires typing their own address, removes learner-owned records child-first,
and leaves a single audit event recording that the erasure happened. The operation is
idempotent, so retrying safely completes any remainder after a transient failure. Both
operations act only on the caller's own data.

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
| `npm run build:production` | Build against the production environment configuration |
| `npm run deploy` | Create an App Hosting rollout for the configured backend |
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
  schema.ts               Application collection and field definitions
  firestore-orm.ts        Local-memory and Admin Firestore persistence adapter
  firebase-admin.ts       Process-wide Firebase Admin initialization
  runtime.ts              Persistence readiness check
data/northwind-v1/        Synthetic records and document corpus
apphosting.yaml           Cost-capped App Hosting runtime and secret configuration
firebase.json             Firebase project resource configuration
firestore.rules           Deny-all browser database policy
tests/
  unit/                   Pure logic, identity trust, budget, and fixture tests
  api/                    Ownership, data-rights, and API behavior tests
  e2e/                    Chromium course, lab, facilitator, and hardening flows
tests/support/            Shared fixtures used by both Playwright suites
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
| `/api/auth` | Firebase Google sign-in, signed sessions, and invitation acceptance |
| `/api/cohorts` | Enrollment, progress, scheduled sessions, interventions, and outcomes |
| `/api/live-room` | Session access, lesson progression, presence, shared prompts, and whiteboard notes |
| `/api/live-room/channel` | Authorized Server-Sent Events change channel |
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

API and browser tests start the application on port `3100` and use the in-process
database. Firebase Analytics is opt-in and disabled for local runs, and no provider
credentials are configured by CI, so the suite makes no Firebase or model-provider
calls. Tests use one worker and no retries to keep shared setup deterministic and
surface real ordering or state bugs.

`tests/api/access-control.api.spec.ts` drives two unrelated facilitators against the
same deployment, which is the case a role-only check passes and an ownership check
does not. The pure decisions — cross-site refusal and the request bounds — are unit
tested in `tests/unit/cross-site.test.ts` and `tests/unit/request-limits.test.ts`.

## Firebase deployment

The Firebase configuration targets project `processbridge` and backend
`upskill-ai-labs`. Releases upload the current local source after it passes local
validation; `.gitignore` keeps local environment files and build output out of the
archive. The runtime is intentionally capped in `apphosting.yaml` at zero
idle instances and two maximum instances. Analytics remains disabled unless explicitly
enabled. Before the first rollout:

1. Create the default Firestore database in `us-central1` and deploy the deny-all
   client rules.
2. Enable Firebase Authentication's Google provider and authorize the App Hosting
   domain.
3. Store a random `SESSION_SECRET` with `firebase apphosting:secrets:set` and grant the
   backend access.
4. Create the App Hosting backend connected to this repository.

After those one-time steps, releases are created with:

```bash
npm run deploy
```

App Hosting builds the native Next.js application and serves its dynamic routes from
Cloud Run. Firestore is used only by the server. The local validation suite should be
run before a rollout so cloud builds and live smoke checks stay minimal.

`GET /api/health` reports database and session-secret readiness without revealing
secret values. It returns `503` when a required dependency is unavailable.

## Project website

[`docs/`](./docs) contains a separate static project description for GitHub Pages; it
does not contain the application runtime or receive provider credentials.
