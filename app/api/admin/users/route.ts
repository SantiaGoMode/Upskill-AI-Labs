import { eq } from "../../../../db/firestore-orm";
import { getDb } from "../../../../db";
import { ensureLabSchema } from "../../../../db/runtime";
import { localSessions, localUsers } from "../../../../db/schema";
import { hasAdminAccess } from "../../../lib/identity-trust";
import { readJsonBody } from "../../../lib/request-limits";
import { adminRequiredResponse, getRequestIdentity, unauthorizedResponse } from "../../../lib/request-identity";

type ManagedRole = "learner" | "facilitator";
type AdminUserAction = {
  action?: "upsert" | "set-status";
  email?: string;
  displayName?: string;
  role?: ManagedRole;
  status?: "active" | "disabled";
};

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function requireAdmin(request: Request) {
  const identity = await getRequestIdentity(request);
  if (!identity) return { identity: null, response: unauthorizedResponse() };
  if (!hasAdminAccess(identity)) return { identity, response: adminRequiredResponse() };
  return { identity, response: null };
}

export async function GET(request: Request) {
  await ensureLabSchema();
  const access = await requireAdmin(request);
  if (access.response) return access.response;
  const users = await getDb().select().from(localUsers);
  users.sort((left, right) => left.email.localeCompare(right.email));
  return Response.json({ users });
}

export async function POST(request: Request) {
  await ensureLabSchema();
  const access = await requireAdmin(request);
  if (access.response || !access.identity) return access.response ?? unauthorizedResponse();

  const parsed = await readJsonBody<AdminUserAction>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!validEmail(email)) return Response.json({ error: "A valid email address is required" }, { status: 400 });
  if (email === access.identity.email) {
    return Response.json({ error: "The signed-in administrator cannot modify their own access here" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(localUsers).where(eq(localUsers.email, email)).limit(1);

  if (body.action === "upsert") {
    const displayName = body.displayName?.trim() ?? "";
    if (displayName.length < 2 || displayName.length > 100) {
      return Response.json({ error: "Display name must be between 2 and 100 characters" }, { status: 400 });
    }
    if (body.role !== "learner" && body.role !== "facilitator") {
      return Response.json({ error: "Role must be student or facilitator" }, { status: 400 });
    }
    if (existing?.role === "admin") return adminRequiredResponse();
    const now = new Date().toISOString();
    const [user] = await db.insert(localUsers).values({
      email,
      displayName,
      role: body.role,
      status: "active",
      updatedAt: now,
    }).onConflictDoUpdate({
      target: localUsers.email,
      set: { displayName, role: body.role, status: "active", updatedAt: now },
    }).returning();
    return Response.json({ user }, { status: existing ? 200 : 201 });
  }

  if (body.action === "set-status") {
    if (!existing) return Response.json({ error: "Account not found" }, { status: 404 });
    if (existing.role === "admin") return adminRequiredResponse();
    if (body.status !== "active" && body.status !== "disabled") {
      return Response.json({ error: "Status must be active or disabled" }, { status: 400 });
    }
    const [user] = await db.update(localUsers).set({ status: body.status, updatedAt: new Date().toISOString() })
      .where(eq(localUsers.email, email)).returning();
    if (body.status === "disabled") await db.delete(localSessions).where(eq(localSessions.userEmail, email));
    return Response.json({ user });
  }

  return Response.json({ error: "Unsupported action" }, { status: 400 });
}
