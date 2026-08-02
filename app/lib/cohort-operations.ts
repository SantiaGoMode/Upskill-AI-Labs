import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { cohortEnrollments, cohorts, organizationMembers, organizations } from "../../db/schema";

export async function ensureFacilitatorOrganization(email: string, displayName: string) {
  const db = getDb();
  const [existing] = await db.select().from(organizations).where(eq(organizations.ownerEmail, email)).limit(1);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const slugBase = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "local-training";
  const [organization] = await db.insert(organizations).values({ id, name: `${displayName} training`, slug: `${slugBase}-${id.slice(0, 6)}`, ownerEmail: email }).returning();
  await db.insert(organizationMembers).values({ id: crypto.randomUUID(), organizationId: id, email, displayName, role: "facilitator", status: "active", joinedAt: new Date().toISOString() });
  return organization;
}

export async function inviteCohortLearners(cohortId: string, organizationId: string, emails: string[]) {
  const db = getDb(); const invitations: Array<{ email: string; token: string }> = [];
  for (const email of [...new Set(emails.map((item) => item.trim().toLowerCase()).filter((item) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item)))]) {
    const token = crypto.randomUUID();
    const [member] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.email, email))).limit(1);
    if (member) await db.update(organizationMembers).set({ inviteToken: token, status: "invited", invitedAt: new Date().toISOString() }).where(eq(organizationMembers.id, member.id));
    else await db.insert(organizationMembers).values({ id: crypto.randomUUID(), organizationId, email, displayName: email.split("@")[0], role: "learner", status: "invited", inviteToken: token });
    const [enrollment] = await db.select().from(cohortEnrollments).where(and(eq(cohortEnrollments.cohortId, cohortId), eq(cohortEnrollments.learnerEmail, email))).limit(1);
    if (!enrollment) await db.insert(cohortEnrollments).values({ id: crypto.randomUUID(), cohortId, learnerEmail: email });
    invitations.push({ email, token });
  }
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
  const current = cohort ? JSON.parse(cohort.learnerEmailsJson) as string[] : [];
  await db.update(cohorts).set({ organizationId, learnerEmailsJson: JSON.stringify([...new Set([...current, ...invitations.map((item) => item.email)])]) }).where(eq(cohorts.id, cohortId));
  return invitations;
}
