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
        id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, organization_id TEXT, name TEXT NOT NULL,
        curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
        learner_emails_json TEXT DEFAULT '[]' NOT NULL, workflow_summary_json TEXT DEFAULT '{}' NOT NULL,
        status TEXT DEFAULT 'draft' NOT NULL, starts_at TEXT, ends_at TEXT, archived_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohorts_owner_email_idx ON cohorts (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL,
        owner_email TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS organizations_owner_email_idx ON organizations (owner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS organization_members (
        id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id),
        email TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL,
        status TEXT DEFAULT 'invited' NOT NULL, invite_token TEXT,
        invited_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, joined_at TEXT
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS organization_members_org_idx ON organization_members (organization_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS organization_members_email_idx ON organization_members (email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS local_users (
        email TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL,
        role TEXT DEFAULT 'learner' NOT NULL, status TEXT DEFAULT 'active' NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS local_users_status_idx ON local_users (status)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS local_sessions (
        id TEXT PRIMARY KEY NOT NULL, user_email TEXT NOT NULL REFERENCES local_users(email),
        expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS local_sessions_user_idx ON local_sessions (user_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS cohort_enrollments (
        id TEXT PRIMARY KEY NOT NULL, cohort_id TEXT NOT NULL REFERENCES cohorts(id),
        learner_email TEXT NOT NULL, status TEXT DEFAULT 'invited' NOT NULL,
        current_lab_id TEXT DEFAULT 'lab-01' NOT NULL, invited_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        joined_at TEXT, completed_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohort_enrollments_cohort_idx ON cohort_enrollments (cohort_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohort_enrollments_learner_idx ON cohort_enrollments (learner_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS cohort_sessions (
        id TEXT PRIMARY KEY NOT NULL, cohort_id TEXT NOT NULL REFERENCES cohorts(id),
        title TEXT NOT NULL, scheduled_at TEXT NOT NULL, duration_minutes INTEGER DEFAULT 60 NOT NULL,
        status TEXT DEFAULT 'scheduled' NOT NULL, agenda TEXT DEFAULT '' NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohort_sessions_cohort_idx ON cohort_sessions (cohort_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS live_rooms (
        id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES cohort_sessions(id),
        status TEXT DEFAULT 'open' NOT NULL, current_lab_id TEXT DEFAULT 'lab-01' NOT NULL,
        current_section TEXT DEFAULT 'Welcome and objectives' NOT NULL, shared_prompt TEXT DEFAULT '' NOT NULL,
        opened_by TEXT NOT NULL, opened_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, closed_at TEXT
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS live_rooms_session_idx ON live_rooms (session_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS live_room_participants (
        id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL REFERENCES live_rooms(id),
        user_email TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL,
        status TEXT DEFAULT 'present' NOT NULL, joined_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, left_at TEXT
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS live_room_participants_room_idx ON live_room_participants (room_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS live_room_participants_user_idx ON live_room_participants (user_email)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS live_room_board_cards (
        id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL REFERENCES live_rooms(id),
        section_key TEXT NOT NULL, author_email TEXT NOT NULL, body TEXT NOT NULL,
        color TEXT DEFAULT 'blue' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS live_room_board_cards_room_idx ON live_room_board_cards (room_id)"),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS cohort_interventions (
        id TEXT PRIMARY KEY NOT NULL, cohort_id TEXT NOT NULL REFERENCES cohorts(id),
        learner_email TEXT NOT NULL, facilitator_email TEXT NOT NULL, note TEXT NOT NULL,
        status TEXT DEFAULT 'open' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        resolved_at TEXT
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS cohort_interventions_cohort_idx ON cohort_interventions (cohort_id)"),
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
      const cohortColumns = await env.DB.prepare("PRAGMA table_info(cohorts)").all<{ name: string }>();
      const cohortColumnNames = new Set(cohortColumns.results.map((column) => column.name));
      if (!cohortColumnNames.has("organization_id")) await env.DB.prepare("ALTER TABLE cohorts ADD COLUMN organization_id TEXT").run();
      if (!cohortColumnNames.has("starts_at")) await env.DB.prepare("ALTER TABLE cohorts ADD COLUMN starts_at TEXT").run();
      if (!cohortColumnNames.has("ends_at")) await env.DB.prepare("ALTER TABLE cohorts ADD COLUMN ends_at TEXT").run();
      if (!cohortColumnNames.has("archived_at")) await env.DB.prepare("ALTER TABLE cohorts ADD COLUMN archived_at TEXT").run();
    })();
  }

  return initialization;
}
