# Upskill AI Labs

Upskill AI Labs is a local, hands-on learning application for practicing real workplace workflows with AI. Learners work inside a synthetic enterprise, produce evidence-linked artifacts, run them through deterministic and model-assisted evaluation, and retain proof of capability beyond course completion.

The initial curriculum is designed for program managers. Its scenarios use Northwind, a fictional company with deliberately imperfect records, conflicting evidence, restricted data, and adversarial instructions.

## What you can do

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

The Account panel can create a seven-day local session for the configured developer account. Trainers can also generate cohort invitation links. Opening an invitation locally activates the learner membership, enrolls the learner, and starts a learner-scoped session. This is an installation-local account flow; it is not intended to replace enterprise SSO on an exposed public runtime.

For a non-local runtime, an authenticated reverse proxy must provide:

- `oai-authenticated-user-email`
- `oai-authenticated-user-full-name` when available
- `oai-authenticated-user-role: facilitator` only for facilitator access

These are trusted upstream identity headers, not values that should be accepted directly from an untrusted public client.

## Data and persistence

The application uses Drizzle ORM with a Cloudflare D1-compatible SQLite database. Local development receives a `DB` binding from the Cloudflare Vite plugin, and API routes initialize missing tables for a clean local checkout.

Versioned SQL migrations live in [`drizzle/`](./drizzle), with the schema defined in [`db/schema.ts`](./db/schema.ts).

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

## Development commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit, API, and browser-flow tests |
| `npm run test:unit` | Run Vitest unit tests |
| `npm run test:api` | Run Playwright API tests |
| `npm run test:e2e` | Run Playwright Chromium flows |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run data:generate` | Rebuild the Northwind fixture corpus |

## Application structure

```text
app/
  api/                    Server routes for attempts, models, evaluation, and Phase 2
  lib/                    Provider, pricing, evaluation, governance, and recipe logic
  *-workspace.tsx         Learner workspaces
  facilitator-console.tsx
  phase-two-console.tsx
db/
  schema.ts               Drizzle table definitions
  runtime.ts              Local D1 schema initialization
data/northwind-v1/        Synthetic records and document corpus
drizzle/                  Versioned SQL migrations
tests/
  unit/                   Pure logic and fixture tests
  api/                    Ownership and API behavior tests
  e2e/                    Chromium learner-flow tests
worker/                   Vinext Cloudflare-compatible entry point
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

## Running a cohort locally

1. Open **Phase 2 → Trainer Studio** and publish a reviewed curriculum version.
2. Create a cohort from that published version.
3. Open **Phase 2 → Cohorts** to invite learners and schedule sessions.
4. Give each learner their local invitation link.
5. Learners accept the invitation through the Account panel and receive a learner-scoped cohort view.
6. Use the cohort roster to monitor submitted and passing labs, record intervention notes, and complete or archive the cohort.

## Testing

Run the complete validation suite before committing changes:

```bash
npm run lint
npm run build
npm test
git diff --check
```

API and browser tests start the application on port `3100` and use a local D1 database. Live provider calls are not required by the automated suite.

## Project website

The application runs locally. [`docs/`](./docs) contains a separate static description of the project for GitHub Pages; it does not contain a live application runtime or receive provider credentials.
