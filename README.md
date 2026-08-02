# Upskill AI Labs

Hands-on, enterprise-grade training environment designed to transition professionals from
theoretical AI knowledge to practical, day-to-day execution.

> Most AI training teaches AI. Upskill AI Labs teaches **your job** — the workflow you
> personally own, rebuilt with AI in the loop, inside a synthetic enterprise where the
> practice is real, the failures are safe, and the proof is an artifact rather than a
> certificate.

## Docs

- [**Product Blueprint**](docs/PRODUCT-BLUEPRINT.md) — vision, personas, curriculum
  architecture, the Lab, simulation layer, governance, Trainer Studio, Live Room &
  Cognitive Whiteboard, Capability Ledger, business model, roadmap, tech appendix.
- [**Phase 0 Pilot**](docs/phase-0/README.md) — the first role hypothesis, six manual labs,
  facilitator runbook, evidence plan, and exit criteria.

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

The usable MVP now includes interactive Labs 1–6, synthetic evidence packs, timeboxed artifact
workspaces, durable D1-backed attempts, learner-owned history, and browser-local draft fallback.
Its policy-bounded AI workbench supports Gemini, OpenAI, Anthropic, and local Ollama models. Each
run stores and displays the output, provider trace, token usage, and estimated USD cost. Submitted
artifacts receive a stored deterministic rubric result before human calibration.

## Run the app

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Use `npm test`, `npm run lint`, and `npm run build` for validation.

## Configure model providers

Copy `.env.example` to `.env` for Vinext development, add only the providers you want to use,
and restart the server. `.dev.vars.example` contains the equivalent Cloudflare bindings. API
keys remain server-side and must be configured as hosted secrets rather than committed.

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

## Authentication and ownership

Hosted requests use the authenticated user email supplied by the Sites runtime. Attempt reads,
writes, submissions, histories, and model runs are scoped to that identity on the server. A
localhost-only identity fallback is available through `LOCAL_DEV_USER_EMAIL` for development and
automated tests; hosted requests without an authenticated identity are rejected.
