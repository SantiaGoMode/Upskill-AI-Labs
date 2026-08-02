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
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS workflow_maps (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, role_description TEXT NOT NULL,
        intake_tier TEXT NOT NULL, industry TEXT NOT NULL, seniority TEXT NOT NULL,
        artifact_shapes_json TEXT DEFAULT '[]' NOT NULL, workflows_json TEXT DEFAULT '[]' NOT NULL,
        priority_workflow_ids_json TEXT DEFAULT '[]' NOT NULL, status TEXT DEFAULT 'draft' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS workflow_maps_owner_email_idx ON workflow_maps (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS curriculum_instances (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL,
        workflow_map_id TEXT NOT NULL REFERENCES workflow_maps(id), recipe_version TEXT NOT NULL,
        route_json TEXT NOT NULL, adaptations_json TEXT NOT NULL, estimated_minutes INTEGER NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS curriculum_instances_owner_email_idx ON curriculum_instances (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS redaction_experiments (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL,
        workflow_map_id TEXT NOT NULL REFERENCES workflow_maps(id), tier TEXT NOT NULL,
        transfer_score INTEGER, notes TEXT DEFAULT '' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, measured_at TEXT
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS redaction_experiments_tier_idx ON redaction_experiments (tier)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS policy_profiles (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, version INTEGER NOT NULL,
        status TEXT DEFAULT 'draft' NOT NULL, allowed_intake_tier TEXT DEFAULT 'T1' NOT NULL,
        data_classes_json TEXT NOT NULL, approved_models_json TEXT NOT NULL,
        prohibited_uses_json TEXT NOT NULL, disclosure_rules_json TEXT NOT NULL,
        human_review_rules_json TEXT NOT NULL, prompt_retention_days INTEGER DEFAULT 90 NOT NULL,
        updated_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS policy_profiles_status_idx ON policy_profiles (status)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS curriculum_versions (
        id TEXT PRIMARY KEY NOT NULL, parent_id TEXT, owner_email TEXT NOT NULL, name TEXT NOT NULL,
        version INTEGER NOT NULL, status TEXT DEFAULT 'draft' NOT NULL, content_json TEXT NOT NULL,
        change_summary TEXT DEFAULT '' NOT NULL, reviewer_email TEXT, reviewed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS curriculum_versions_status_idx ON curriculum_versions (status)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS cohorts (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, name TEXT NOT NULL,
        curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
        learner_emails_json TEXT DEFAULT '[]' NOT NULL, workflow_summary_json TEXT DEFAULT '{}' NOT NULL,
        status TEXT DEFAULT 'draft' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohorts_owner_email_idx ON cohorts (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS workflow_baselines (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, workflow_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL, metric_name TEXT NOT NULL, unit TEXT NOT NULL,
        baseline_value TEXT NOT NULL, target_value TEXT NOT NULL, notes TEXT DEFAULT '' NOT NULL,
        measured_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS workflow_baselines_owner_email_idx ON workflow_baselines (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS workflow_measurements (
        id TEXT PRIMARY KEY NOT NULL, baseline_id TEXT NOT NULL REFERENCES workflow_baselines(id),
        owner_email TEXT NOT NULL, value TEXT NOT NULL, source_type TEXT NOT NULL,
        reflection TEXT NOT NULL, measured_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS workflow_measurements_baseline_id_idx ON workflow_measurements (baseline_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS capability_claims (
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, capability_key TEXT NOT NULL,
        label TEXT NOT NULL, band TEXT NOT NULL, status TEXT DEFAULT 'active' NOT NULL,
        evidence_json TEXT NOT NULL, earned_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS capability_claims_owner_email_idx ON capability_claims (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, details_json TEXT DEFAULT '{}' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id)"),
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
