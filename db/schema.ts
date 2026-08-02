import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const labAttempts = sqliteTable(
  "lab_attempts",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    labId: text("lab_id").notNull(),
    status: text("status").notNull().default("in_progress"),
    draftJson: text("draft_json").notNull().default("{}"),
    prompt: text("prompt").notNull().default(""),
    selectedSourcesJson: text("selected_sources_json").notNull().default("[]"),
    verification: text("verification").notNull().default(""),
    secondsRemaining: integer("seconds_remaining").notNull().default(1500),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lab_attempts_lab_id_idx").on(table.labId),
    index("lab_attempts_owner_email_idx").on(table.ownerEmail),
  ],
);

export const labSubmissions = sqliteTable(
  "lab_submissions",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => labAttempts.id),
    payloadJson: text("payload_json").notNull(),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("lab_submissions_attempt_id_idx").on(table.attemptId)],
);

export const evalResults = sqliteTable(
  "eval_results",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => labSubmissions.id),
    evaluatorVersion: text("evaluator_version").notNull(),
    resultJson: text("result_json").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("eval_results_submission_id_idx").on(table.submissionId)],
);

export const modelRuns = sqliteTable(
  "model_runs",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id").notNull().references(() => labAttempts.id),
    responseId: text("response_id").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    outputText: text("output_text").notNull(),
    traceJson: text("trace_json").notNull(),
    usageJson: text("usage_json").notNull(),
    costJson: text("cost_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("model_runs_attempt_id_idx").on(table.attemptId)],
);

export const judgeResults = sqliteTable(
  "judge_results",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => labSubmissions.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    judgeIndex: integer("judge_index").notNull(),
    resultJson: text("result_json").notNull(),
    usageJson: text("usage_json").notNull(),
    costJson: text("cost_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("judge_results_submission_id_idx").on(table.submissionId)],
);

export const humanReviews = sqliteTable(
  "human_reviews",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => labSubmissions.id),
    reviewerEmail: text("reviewer_email").notNull(),
    resultJson: text("result_json").notNull(),
    rationale: text("rationale").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("human_reviews_submission_id_idx").on(table.submissionId)],
);

export const scoreAppeals = sqliteTable(
  "score_appeals",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => labSubmissions.id),
    ownerEmail: text("owner_email").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("score_appeals_submission_id_idx").on(table.submissionId),
    index("score_appeals_owner_email_idx").on(table.ownerEmail),
  ],
);

export const regressionRuns = sqliteTable(
  "regression_runs",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    attemptId: text("attempt_id").notNull().references(() => labAttempts.id),
    setId: text("set_id").notNull(),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(),
    prompt: text("prompt").notNull(),
    resultJson: text("result_json").notNull(),
    usageJson: text("usage_json").notNull(),
    costJson: text("cost_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("regression_runs_owner_email_idx").on(table.ownerEmail),
    index("regression_runs_attempt_id_idx").on(table.attemptId),
  ],
);

export const workflowMaps = sqliteTable(
  "workflow_maps",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    roleDescription: text("role_description").notNull(),
    intakeTier: text("intake_tier").notNull(),
    industry: text("industry").notNull(),
    seniority: text("seniority").notNull(),
    artifactShapesJson: text("artifact_shapes_json").notNull().default("[]"),
    workflowsJson: text("workflows_json").notNull().default("[]"),
    priorityWorkflowIdsJson: text("priority_workflow_ids_json").notNull().default("[]"),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("workflow_maps_owner_email_idx").on(table.ownerEmail)],
);

export const curriculumInstances = sqliteTable(
  "curriculum_instances",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    workflowMapId: text("workflow_map_id").notNull().references(() => workflowMaps.id),
    recipeVersion: text("recipe_version").notNull(),
    routeJson: text("route_json").notNull(),
    adaptationsJson: text("adaptations_json").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("curriculum_instances_owner_email_idx").on(table.ownerEmail)],
);

export const redactionExperiments = sqliteTable(
  "redaction_experiments",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    workflowMapId: text("workflow_map_id").notNull().references(() => workflowMaps.id),
    tier: text("tier").notNull(),
    transferScore: integer("transfer_score"),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    measuredAt: text("measured_at"),
  },
  (table) => [index("redaction_experiments_tier_idx").on(table.tier)],
);

export const policyProfiles = sqliteTable(
  "policy_profiles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    allowedIntakeTier: text("allowed_intake_tier").notNull().default("T1"),
    dataClassesJson: text("data_classes_json").notNull(),
    approvedModelsJson: text("approved_models_json").notNull(),
    prohibitedUsesJson: text("prohibited_uses_json").notNull(),
    disclosureRulesJson: text("disclosure_rules_json").notNull(),
    humanReviewRulesJson: text("human_review_rules_json").notNull(),
    promptRetentionDays: integer("prompt_retention_days").notNull().default(90),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("policy_profiles_status_idx").on(table.status)],
);

export const curriculumVersions = sqliteTable(
  "curriculum_versions",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    contentJson: text("content_json").notNull(),
    changeSummary: text("change_summary").notNull().default(""),
    reviewerEmail: text("reviewer_email"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("curriculum_versions_status_idx").on(table.status)],
);

export const cohorts = sqliteTable(
  "cohorts",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    organizationId: text("organization_id"),
    name: text("name").notNull(),
    curriculumVersionId: text("curriculum_version_id").notNull().references(() => curriculumVersions.id),
    learnerEmailsJson: text("learner_emails_json").notNull().default("[]"),
    workflowSummaryJson: text("workflow_summary_json").notNull().default("{}"),
    status: text("status").notNull().default("draft"),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("cohorts_owner_email_idx").on(table.ownerEmail)],
);

export const organizations = sqliteTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerEmail: text("owner_email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("organizations_owner_email_idx").on(table.ownerEmail)],
);

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("invited"),
    inviteToken: text("invite_token"),
    invitedAt: text("invited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    joinedAt: text("joined_at"),
  },
  (table) => [
    index("organization_members_org_idx").on(table.organizationId),
    index("organization_members_email_idx").on(table.email),
  ],
);

export const localUsers = sqliteTable(
  "local_users",
  {
    email: text("email").primaryKey(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("learner"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("local_users_status_idx").on(table.status)],
);

export const localSessions = sqliteTable(
  "local_sessions",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => localUsers.email),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("local_sessions_user_idx").on(table.userEmail)],
);

export const cohortEnrollments = sqliteTable(
  "cohort_enrollments",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id").notNull().references(() => cohorts.id),
    learnerEmail: text("learner_email").notNull(),
    status: text("status").notNull().default("invited"),
    currentLabId: text("current_lab_id").notNull().default("lab-01"),
    invitedAt: text("invited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    joinedAt: text("joined_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("cohort_enrollments_cohort_idx").on(table.cohortId),
    index("cohort_enrollments_learner_idx").on(table.learnerEmail),
  ],
);

export const cohortSessions = sqliteTable(
  "cohort_sessions",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id").notNull().references(() => cohorts.id),
    title: text("title").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    status: text("status").notNull().default("scheduled"),
    agenda: text("agenda").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("cohort_sessions_cohort_idx").on(table.cohortId)],
);

export const cohortInterventions = sqliteTable(
  "cohort_interventions",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id").notNull().references(() => cohorts.id),
    learnerEmail: text("learner_email").notNull(),
    facilitatorEmail: text("facilitator_email").notNull(),
    note: text("note").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
  },
  (table) => [index("cohort_interventions_cohort_idx").on(table.cohortId)],
);

export const workflowBaselines = sqliteTable(
  "workflow_baselines",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    workflowId: text("workflow_id").notNull(),
    workflowName: text("workflow_name").notNull(),
    metricName: text("metric_name").notNull(),
    unit: text("unit").notNull(),
    baselineValue: text("baseline_value").notNull(),
    targetValue: text("target_value").notNull(),
    notes: text("notes").notNull().default(""),
    measuredAt: text("measured_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("workflow_baselines_owner_email_idx").on(table.ownerEmail)],
);

export const workflowMeasurements = sqliteTable(
  "workflow_measurements",
  {
    id: text("id").primaryKey(),
    baselineId: text("baseline_id").notNull().references(() => workflowBaselines.id),
    ownerEmail: text("owner_email").notNull(),
    value: text("value").notNull(),
    sourceType: text("source_type").notNull(),
    reflection: text("reflection").notNull(),
    measuredAt: text("measured_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("workflow_measurements_baseline_id_idx").on(table.baselineId)],
);

export const capabilityClaims = sqliteTable(
  "capability_claims",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    capabilityKey: text("capability_key").notNull(),
    label: text("label").notNull(),
    band: text("band").notNull(),
    status: text("status").notNull().default("active"),
    evidenceJson: text("evidence_json").notNull(),
    earnedAt: text("earned_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("capability_claims_owner_email_idx").on(table.ownerEmail)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_events_entity_idx").on(table.entityType, table.entityId)],
);
