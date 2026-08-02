# Upskill AI Labs

Hands-on, enterprise-grade training environment designed to transition professionals from
theoretical AI knowledge to practical, day-to-day execution.

> Most AI training teaches AI. Upskill AI Labs teaches **your job** — the workflow you
> personally own, rebuilt with AI in the loop, inside a synthetic enterprise where the
> practice is real, the failures are safe, and the proof is an artifact rather than a
> certificate.

## Core concepts

| Concept | What it is |
|---|---|
| **The Atlas** | Role → Workflow → AI Play taxonomy. The content backbone. |
| **AI Plays** | Reusable patterns (`DRAFT-FROM-EVIDENCE`, `BUILD-THE-JIG`, …) that are the atoms of curriculum. |
| **The Lab** | Sandboxed workspace where learners do the real task and get graded on process, not prose. |
| **Northwind** | One persistent synthetic enterprise with dirty, realistic data that every lab is set inside. |
| **Recipe Engine** | Rigid spine, flexible skin — adaptive without becoming unpredictable. |
| **Trainer Studio** | Curriculum-as-code: fork, diff, review, merge, promote. |
| **Cognitive Whiteboard** | Infinite canvas where objects are live and executable, not ink. |
| **Capability Ledger** | Evidence-backed, decaying, artifact-linked capability claims. |

## Status

The Phase 1 application now includes interactive Labs 1–8, synthetic evidence packs, timeboxed artifact
workspaces, durable D1-backed attempts, learner-owned history, and browser-local draft fallback.
Its policy-bounded AI workbench supports Gemini, OpenAI, Anthropic, and local Ollama models. Each
run stores and displays the output, provider trace, token usage, and estimated USD cost. Submitted
artifacts receive a stored deterministic rubric result before human calibration.

Northwind v1 provides 300 relational records and 40 synthetic documents with planted duplicate,
stale-evidence, conflict, prompt-injection, and restricted-data failure modes. The Prompt Lab adds a
20-case regression set with a zero-token preview and an explicitly confirmed live batch mode.

Facilitators can run a three-provider rubric-judge ensemble, record human calibration bands and
rationales, resolve learner appeals, and monitor quadratic-weighted agreement per rubric dimension.
Dimensions below the 0.75 agreement threshold are marked provisional. Saved human reviews become
few-shot calibration anchors for later judge runs. Live batch and ensemble runs are never automatic.

Phase 2 is now available from the application navigation. Bring Your Own Job onboarding supports
description-only T0 and client-side-redacted T1 intake. T1 sends only structural counts and markers;
the API explicitly rejects raw artifact fields. Learners review nine proposed workflows, choose
three priorities, and receive a visible adaptive route that preserves the common eight-lab assessed
spine while varying scenario skin, pacing, and remediation.

Trainer Studio supports curriculum forks, draft edits, a required human review gate, publishing,
cohort composition, and aggregate workflow-demand signals. The governance plane versions allowed
BYOJ tiers, data classes, model providers, retention, prohibited uses, disclosures, and human-review
rules; those rules now gate model execution and intake. Its actor-linked audit log starts the SOC 2
evidence trail. The Capability Ledger creates evidence-linked, 180-day capability claims from
assessed submissions and supports self-attested workflow baselines and day-30 remeasurement.

## Run the app

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Use `npm test`, `npm run lint`, and `npm run build` for validation.
Use `npm run data:generate` to deterministically rebuild the Northwind v1 fixture corpus.

## Configure model providers

Copy `.env.example` to `.env` for Vinext development, add only the providers you want to use,
and restart the server. `.dev.vars.example` contains the equivalent Cloudflare bindings. API
keys remain server-side and must never be committed or exposed to browser code.

| Provider | Default model | Required setting |
|---|---|---|
| Gemini | `gemini-3.5-flash-lite` | `GEMINI_API_KEY` |
| OpenAI | `gpt-5.6-sol` | `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| Ollama | `gemma4` | Local Ollama at `OLLAMA_BASE_URL` |

Gemini is the conservative testing default because eligible projects can use its free tier. The
app limits each run to 600 output tokens and shows the paid-tier-equivalent estimate even when a
run is free. Use synthetic training content only: Google states that free-tier content may be used
to improve its products. The application never silently falls through to a paid provider.

The workbench sends only sources permitted by the selected lab and persists the provider response
ID, model, duration, supplied source IDs, token usage, and estimated cost. OpenAI storage is
disabled. An unknown model remains explicitly unmetered until its rate is added.

## Local identity and ownership

Attempt reads, writes, submissions, histories, and model runs are scoped to a learner identity on
the server. Local development uses `LOCAL_DEV_USER_EMAIL`. A trusted reverse proxy can supply the
`oai-authenticated-user-email` header and may grant facilitator access with
`oai-authenticated-user-role: facilitator`; non-local requests without an identity are rejected.
Local development defaults to facilitator access and can be restricted with `LOCAL_DEV_ROLE=learner`.

## Project page

The application itself runs locally. A separate static project page in `docs/` describes the
product and is deployed to GitHub Pages by `.github/workflows/pages.yml`; it does not receive model
keys or expose a live application runtime.
