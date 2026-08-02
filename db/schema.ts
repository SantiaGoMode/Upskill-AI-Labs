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
