import { eq, inArray } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { cohortEnrollments, cohorts, labAttempts, labSubmissions } from "../../db/schema";
import { selectInChunks } from "./sql-chunks";

/**
 * The tenant boundary between facilitators.
 *
 * A facilitator owns an organization and the cohorts under it, and every learner
 * reaches the application through an invitation into one of those cohorts. So
 * "which learners may this facilitator see?" has one answer: the ones enrolled in
 * a cohort they own. `role === "facilitator"` establishes *that* someone is a
 * trainer, never *whose* learners they are; anything keyed only on the role would
 * expose one organization's learner work to another's trainer.
 *
 * Cohort reads already scope this way. These helpers exist so the assessment and
 * curriculum surfaces can scope the same way instead of reading whole tables.
 */

/** Learner addresses enrolled in a cohort owned by this facilitator. */
export async function facilitatorLearnerEmails(facilitatorEmail: string): Promise<string[]> {
  const db = getDb();
  const owned = await db.select({ id: cohorts.id }).from(cohorts)
    .where(eq(cohorts.ownerEmail, facilitatorEmail));
  if (!owned.length) return [];

  const enrollments = await selectInChunks(owned.map((cohort) => cohort.id), (batch) =>
    db.select({ email: cohortEnrollments.learnerEmail }).from(cohortEnrollments)
      .where(inArray(cohortEnrollments.cohortId, batch)));

  return [...new Set(enrollments.map((enrollment) => enrollment.email))];
}

/**
 * True when the submission was made by a learner this facilitator is responsible
 * for. Used to gate grading, review, and appeal resolution on a specific record
 * rather than on the role alone.
 */
export async function facilitatorOwnsSubmission(facilitatorEmail: string, submissionId: string) {
  const emails = await facilitatorLearnerEmails(facilitatorEmail);
  if (!emails.length) return false;

  const [row] = await getDb()
    .select({ ownerEmail: labAttempts.ownerEmail })
    .from(labSubmissions)
    .innerJoin(labAttempts, eq(labAttempts.id, labSubmissions.attemptId))
    .where(eq(labSubmissions.id, submissionId))
    .limit(1);

  return Boolean(row && emails.includes(row.ownerEmail));
}
