import { eq } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { organizationMembers, organizations } from "../../db/schema";

/** Membership is read server-side; callers never choose a tenant through request bodies. */
export async function organizationIdsFor(email: string): Promise<string[]> {
  const [owned, memberships] = await Promise.all([
    getDb().select().from(organizations).where(eq(organizations.ownerEmail, email)),
    getDb().select().from(organizationMembers).where(eq(organizationMembers.email, email)),
  ]);
  return [...new Set([...owned.map((row) => row.id), ...memberships.filter((row) => row.status === "active").map((row) => row.organizationId)])].sort();
}

/** Ambiguous/personal work remains unassigned rather than guessing ownership. */
export async function recordOrganization(email: string) {
  const ids = await organizationIdsFor(email);
  return ids.length === 1 ? ids[0] : null;
}
