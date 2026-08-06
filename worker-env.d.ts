/**
 * Typed Cloudflare bindings and runtime variables.
 *
 * TypeScript merges this into `Cloudflare.Env`, which is the type of the `env`
 * import from `cloudflare:workers`. Keep it in sync with `wrangler.jsonc` and
 * the `.env.example` / `.dev.vars.example` variable lists; `wrangler types`
 * can regenerate an equivalent file if the binding list grows.
 */
declare namespace Cloudflare {
  interface Env {
    /** Static asset fetcher used by the image optimization endpoint. */
    ASSETS: Fetcher;
    /** D1 database holding attempts, submissions, cohorts, and audit events. */
    DB: D1Database;
    /** Cloudflare Images binding used to transform optimized images. */
    IMAGES: ImagesBinding;
    /** One WebSocket fan-out channel per Live Room session. */
    LIVE_ROOM: DurableObjectNamespace;

    /** Deployment environment name. Absent in local development. */
    ENVIRONMENT?: string;

    /**
     * Shared secret that an authenticating reverse proxy must present before
     * `oai-authenticated-user-*` identity headers are trusted.
     */
    TRUSTED_PROXY_SECRET?: string;
    /** HMAC key used to sign account session cookies. */
    SESSION_SECRET?: string;

    /** Fallback identity used when no proxy or session identifies the caller. */
    LOCAL_DEV_USER_EMAIL?: string;
    LOCAL_DEV_ROLE?: string;

    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_MODEL?: string;
    OLLAMA_BASE_URL?: string;
    OLLAMA_MODEL?: string;

    /** Per-learner ceiling on estimated provider spend per rolling day, in USD. */
    MODEL_DAILY_USD_CAP?: string;
    /** Per-learner ceiling on model executions per rolling minute. */
    MODEL_RATE_LIMIT_PER_MINUTE?: string;

    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REFRESH_TOKEN?: string;
  }
}
