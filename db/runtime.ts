import { env } from "cloudflare:workers";

let initialization: Promise<void> | null = null;

export function ensureLabSchema() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  if (!initialization) {
    initialization = (async () => {
      await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_attempts (
        id TEXT PRIMARY KEY NOT NULL,
        owner_email TEXT NOT NULL,
        lab_id TEXT NOT NULL,
        status TEXT DEFAULT 'in_progress' NOT NULL,
        draft_json TEXT DEFAULT '{}' NOT NULL,
        prompt TEXT DEFAULT '' NOT NULL,
        selected_sources_json TEXT DEFAULT '[]' NOT NULL,
        verification TEXT DEFAULT '' NOT NULL,
        seconds_remaining INTEGER DEFAULT 1500 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS lab_attempts_lab_id_idx ON lab_attempts (lab_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS lab_submissions (
        id TEXT PRIMARY KEY NOT NULL,
        attempt_id TEXT NOT NULL REFERENCES lab_attempts(id),
        payload_json TEXT NOT NULL,
        submitted_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS lab_submissions_attempt_id_idx ON lab_submissions (attempt_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS eval_results (
        id TEXT PRIMARY KEY NOT NULL,
        submission_id TEXT NOT NULL REFERENCES lab_submissions(id),
        evaluator_version TEXT NOT NULL,
        result_json TEXT NOT NULL,
        passed INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS eval_results_submission_id_idx ON eval_results (submission_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS model_runs (
        id TEXT PRIMARY KEY NOT NULL,
        attempt_id TEXT NOT NULL REFERENCES lab_attempts(id),
        response_id TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        output_text TEXT NOT NULL,
        trace_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        cost_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS model_runs_attempt_id_idx ON model_runs (attempt_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS judge_results (
        id TEXT PRIMARY KEY NOT NULL,
        submission_id TEXT NOT NULL REFERENCES lab_submissions(id),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        judge_index INTEGER NOT NULL,
        result_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        cost_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS judge_results_submission_id_idx ON judge_results (submission_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS human_reviews (
        id TEXT PRIMARY KEY NOT NULL,
        submission_id TEXT NOT NULL REFERENCES lab_submissions(id),
        reviewer_email TEXT NOT NULL,
        result_json TEXT NOT NULL,
        rationale TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS human_reviews_submission_id_idx ON human_reviews (submission_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS score_appeals (
        id TEXT PRIMARY KEY NOT NULL,
        submission_id TEXT NOT NULL REFERENCES lab_submissions(id),
        owner_email TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'open' NOT NULL,
        resolution TEXT DEFAULT '' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS score_appeals_submission_id_idx ON score_appeals (submission_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS score_appeals_owner_email_idx ON score_appeals (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS regression_runs (
        id TEXT PRIMARY KEY NOT NULL,
        owner_email TEXT NOT NULL,
        attempt_id TEXT NOT NULL REFERENCES lab_attempts(id),
        set_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        mode TEXT NOT NULL,
        prompt TEXT NOT NULL,
        result_json TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        cost_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS regression_runs_owner_email_idx ON regression_runs (owner_email)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS regression_runs_attempt_id_idx ON regression_runs (attempt_id)"),
      ]);
      const columns = await env.DB.prepare("PRAGMA table_info(lab_attempts)").all<{ name: string }>();
      if (!columns.results.some((column) => column.name === "owner_email")) {
        await env.DB.prepare("ALTER TABLE lab_attempts ADD COLUMN owner_email TEXT NOT NULL DEFAULT 'legacy-local@upskill.invalid'").run();
      }
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS lab_attempts_owner_email_idx ON lab_attempts (owner_email)").run();
    })();
  }

  return initialization;
}
