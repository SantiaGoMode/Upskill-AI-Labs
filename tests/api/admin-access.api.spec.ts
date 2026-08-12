import { expect, test } from "@playwright/test";

const admin = {
  "oai-authenticated-user-email": "admin-access-test@example.com",
  "oai-authenticated-user-role": "admin",
};
const facilitator = {
  "oai-authenticated-user-email": "facilitator-access-test@example.com",
  "oai-authenticated-user-role": "facilitator",
};
const viewer = {
  "oai-authenticated-user-email": "public-demo@upskill.invalid",
  "oai-authenticated-user-role": "viewer",
};
const managedEmail = "managed-student@example.com";

test("viewer requests can read identity but cannot create an attempt", async ({ request }) => {
  const identity = await request.get("/api/auth", { headers: viewer });
  expect(identity.status()).toBe(200);
  expect((await identity.json()).identity.role).toBe("viewer");

  const mutation = await request.post("/api/attempts", {
    headers: viewer,
    data: { action: "start", labId: "lab-01" },
  });
  expect(mutation.status()).toBe(401);
});

test("only an administrator can manage student and facilitator access", async ({ request }) => {
  const denied = await request.post("/api/admin/users", {
    headers: facilitator,
    data: { action: "upsert", email: managedEmail, displayName: "Managed Student", role: "learner" },
  });
  expect(denied.status()).toBe(403);

  const created = await request.post("/api/admin/users", {
    headers: admin,
    data: { action: "upsert", email: managedEmail, displayName: "Managed Student", role: "learner" },
  });
  expect(created.status()).toBe(201);
  expect((await created.json()).user).toMatchObject({ email: managedEmail, role: "learner", status: "active" });

  const promoted = await request.post("/api/admin/users", {
    headers: admin,
    data: { action: "upsert", email: managedEmail, displayName: "Managed Facilitator", role: "facilitator" },
  });
  expect(promoted.status()).toBe(200);
  expect((await promoted.json()).user).toMatchObject({ role: "facilitator", status: "active" });

  const disabled = await request.post("/api/admin/users", {
    headers: admin,
    data: { action: "set-status", email: managedEmail, status: "disabled" },
  });
  expect(disabled.status()).toBe(200);
  expect((await disabled.json()).user.status).toBe("disabled");

  const disabledSignIn = await request.post("/api/auth", {
    data: { action: "sign-in", email: managedEmail, displayName: "Managed Facilitator" },
  });
  expect(disabledSignIn.status()).toBe(403);

  const listing = await request.get("/api/admin/users", { headers: admin });
  expect(listing.status()).toBe(200);
  expect((await listing.json()).users).toContainEqual(expect.objectContaining({ email: managedEmail, status: "disabled" }));
});
