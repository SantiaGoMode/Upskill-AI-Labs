"use client";

import { useState } from "react";
import { errorMessage, isAdmin, post, useIdentity, useResource } from "../lib/client-api";
import { Badge, Banners, Button, Callout, Card, Page, PageHeader, Section, Spinner, TextField } from "../components/ui";

type ManagedUser = {
  email: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ManagedRole = "learner" | "facilitator";

export default function AdminPage() {
  const { identity, loading: identityLoading } = useIdentity();
  const authorized = isAdmin(identity);
  const users = useResource<{ users: ManagedUser[] }>(authorized ? "/api/admin/users" : null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<ManagedRole>("learner");
  const [busyEmail, setBusyEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveUser() {
    const normalizedEmail = email.trim().toLowerCase();
    setBusyEmail(normalizedEmail);
    setError("");
    setNotice("");
    try {
      await post("/api/admin/users", {
        action: "upsert",
        email: normalizedEmail,
        displayName: displayName.trim(),
        role,
      });
      setEmail("");
      setDisplayName("");
      setRole("learner");
      setNotice(`${normalizedEmail} can now sign in with Google as a ${role === "learner" ? "student" : "facilitator"}.`);
      await users.reload();
    } catch (cause) {
      setError(errorMessage(cause, "Account could not be saved"));
    } finally {
      setBusyEmail("");
    }
  }

  async function setStatus(user: ManagedUser, status: "active" | "disabled") {
    setBusyEmail(user.email);
    setError("");
    setNotice("");
    try {
      await post("/api/admin/users", { action: "set-status", email: user.email, status });
      setNotice(`${user.email} is now ${status}.`);
      await users.reload();
    } catch (cause) {
      setError(errorMessage(cause, "Account status could not be changed"));
    } finally {
      setBusyEmail("");
    }
  }

  if (identityLoading) return <Page><Spinner label="Checking administrator access…" /></Page>;
  if (!authorized) {
    return (
      <Page>
        <PageHeader eyebrow="Administration" title="User access" />
        <Callout tone="risk">Administrator access is required.</Callout>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Administration"
        title="User access"
        lede="Invite Google accounts as students or facilitators. Disabling an account immediately removes its active app sessions."
      />

      <Banners errors={[error, users.error]} notice={notice} />

      <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Section title="Add or update a user" description="Use the email address they use for Google sign-in.">
          <Card className="p-5">
            <TextField
              label="Google email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student@example.com"
              className="mb-4"
            />
            <TextField
              label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Taylor Morgan"
              className="mb-4"
            />
            <label className="mb-5 block">
              <span className="mb-1.5 block text-[13px] font-semibold">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as ManagedRole)}
                className="w-full rounded-[8px] border border-line bg-bg px-3 py-2.5 text-[14px] focus:border-primary focus:outline-none"
              >
                <option value="learner">Student</option>
                <option value="facilitator">Facilitator</option>
              </select>
            </label>
            <Button
              variant="primary"
              className="w-full"
              disabled={Boolean(busyEmail) || !email.trim() || !displayName.trim()}
              onClick={() => void saveUser()}
            >
              {busyEmail ? "Saving…" : "Save access"}
            </Button>
          </Card>
        </Section>

        <Section title="Managed users" description="Administrators are bootstrapped from the deployment configuration and cannot be changed here.">
          {users.loading ? (
            <Spinner label="Loading users…" />
          ) : (users.data?.users.length ?? 0) === 0 ? (
            <Callout tone="info">No managed student or facilitator accounts yet.</Callout>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {users.data?.users.map((user) => (
                <Card as="li" key={user.email} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 font-bold">{user.displayName}</p>
                    <p className="m-0 mt-0.5 break-all text-[13px] text-muted">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={user.role === "admin" || user.role === "facilitator" ? "primary" : "neutral"}>
                      {user.role === "learner" ? "student" : user.role}
                    </Badge>
                    <Badge tone={user.status === "active" ? "ok" : "warn"}>{user.status}</Badge>
                    {user.role !== "admin" ? (
                      <Button
                        size="sm"
                        variant={user.status === "active" ? "danger" : "secondary"}
                        disabled={Boolean(busyEmail)}
                        onClick={() => void setStatus(user, user.status === "active" ? "disabled" : "active")}
                      >
                        {busyEmail === user.email
                          ? "Saving…"
                          : user.status === "active"
                            ? "Disable"
                            : "Reactivate"}
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Page>
  );
}
