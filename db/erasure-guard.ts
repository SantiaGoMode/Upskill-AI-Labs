import { createHash } from "node:crypto";
import type { DocumentTransaction } from "./firestore-orm";

const owners: Record<string, string> = {
  model_budget_ledgers: "ownerEmail",
  lab_attempts: "ownerEmail", score_appeals: "ownerEmail", regression_runs: "ownerEmail",
  workflow_maps: "ownerEmail", curriculum_instances: "ownerEmail", redaction_experiments: "ownerEmail",
  workflow_baselines: "ownerEmail", workflow_measurements: "ownerEmail", capability_claims: "ownerEmail",
  model_usage_events: "ownerEmail", lesson_progress: "ownerEmail", organization_members: "email",
  cohort_enrollments: "learnerEmail", cohort_interventions: "learnerEmail", local_users: "email",
  local_sessions: "userEmail", live_room_participants: "userEmail", live_room_board_cards: "authorEmail",
};
export const guardedTable = (table: string) => Boolean(owners[table]) || ["lab_submissions", "model_runs", "eval_results", "judge_results", "human_reviews", "cohorts"].includes(table);

/** Commit-time fence prevents already-running requests from recreating erased data. */
export async function assertErasureWriteAllowed(tx: DocumentTransaction, table: string, row: Record<string, unknown>) {
  const emails: string[] = [];
  if (owners[table] && typeof row[owners[table]] === "string") emails.push(String(row[owners[table]]));
  if (table === "cohorts") emails.push(...JSON.parse(String(row.learnerEmailsJson ?? "[]")) as string[]);
  let attemptId = row.attemptId;
  if (["eval_results", "judge_results", "human_reviews"].includes(table)) {
    const submission = await tx.get("lab_submissions", String(row.submissionId));
    if (!submission) throw new Error("Cannot write assessment for a missing submission.");
    attemptId = submission.attemptId;
  }
  if (["lab_submissions", "model_runs", "eval_results", "judge_results", "human_reviews"].includes(table)) {
    const attempt = await tx.get("lab_attempts", String(attemptId));
    if (!attempt) throw new Error("Cannot write work for a missing attempt.");
    emails.push(String(attempt.ownerEmail));
  }
  for (const email of new Set(emails)) {
    const id = createHash("sha256").update(email).digest("hex");
    const job = await tx.get("account_erasures", id);
    if (!job) continue;
    if (job.status !== "complete") throw new Error("Account erasure is pending.");
    // Explicit sign-in/account creation can enroll again after completed erasure.
    if (table !== "local_users" && !await tx.get("local_users", email)) throw new Error("Account was erased. Sign in again before creating new work.");
  }
}
