"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { PersistedAttempt } from "../lib/attempt-types";
import { labById } from "../lib/labs";
import { errorMessage, formatDateTime, isFacilitator, isViewer, post, useIdentity, useResource } from "../lib/client-api";
import { signInWithGoogle, signOutOfFirebase } from "../lib/firebase-client";
import {
  Badge,
  Banners,
  Button,
  Callout,
  Card,
  CardHeader,
  LinkButton,
  Page,
  PageHeader,
  Section,
  Spinner,
  TextField,
} from "../components/ui";

export default function AccountPage() {
  return (
    <Suspense fallback={<Page><Spinner label="Loading account…" /></Page>}>
      <AccountView />
    </Suspense>
  );
}

function AccountView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { identity, sessionsAvailable, developerSignInAvailable, firebaseSignInAvailable, loading, reload } = useIdentity();
  const history = useResource<{ attempts: PersistedAttempt[] }>("/api/attempts?history=1");

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteToken, setInviteToken] = useState(searchParams.get("invite") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Without the developer account, an invitation token is the only way in.
  const canSignIn = developerSignInAvailable ? Boolean(email.trim() || inviteToken.trim()) : Boolean(inviteToken.trim());

  /**
   * Both session transitions re-read the identity and re-render the server
   * components that branch on it. Resolves to whether the transition succeeded.
   */
  async function submitAuth(body: Record<string, unknown>, failure: string) {
    setBusy(true);
    setError("");
    try {
      await post("/api/auth", body);
      await reload();
      router.refresh();
      return true;
    } catch (cause) {
      setError(errorMessage(cause, failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    const body = {
      action: "sign-in",
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      inviteToken: inviteToken.trim() || undefined,
    };
    // A rejected token is worth keeping in the field so it can be corrected.
    if (await submitAuth(body, "Sign-in failed")) setInviteToken("");
  }

  async function googleSignIn() {
    setBusy(true);
    setError("");
    try {
      const idToken = await signInWithGoogle();
      await post("/api/auth", { action: "firebase-sign-in", idToken });
      await reload();
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Google sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  const signOut = async () => {
    await signOutOfFirebase().catch(() => undefined);
    await submitAuth({ action: "sign-out" }, "Sign-out failed");
  };

  return (
    <Page>
      <PageHeader eyebrow="Account" title="Who you are here" lede="Roles decide which surfaces appear. Facilitators additionally see Studio, Cohorts, Review, and Governance." />

      <Banners errors={[error]} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Section title="Current identity">
          {loading ? (
            <Spinner label="Loading…" />
          ) : identity ? (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="m-0 text-[17px] font-bold">{identity.displayName}</p>
                  <p className="m-0 mt-1 break-words text-[13px] text-muted">{identity.email}</p>
                </div>
                <Badge tone={isFacilitator(identity) ? "primary" : "neutral"}>{identity.role}</Badge>
              </div>
              <p className="mt-4 text-[13px] text-muted">
                Session source: <span className="font-mono">{identity.source}</span>
              </p>
              {identity.source === "local-session" ? (
                <Button className="mt-4" onClick={() => void signOut()} disabled={busy}>
                  Sign out
                </Button>
              ) : isViewer(identity) ? (
                <>
                  <Callout tone="info" className="mt-4">
                    You are viewing the public demo. Quizzes, labs, progress, and other actions are disabled.
                  </Callout>
                  {firebaseSignInAvailable ? (
                    <Button variant="primary" className="mt-4 w-full" onClick={() => void googleSignIn()} disabled={busy}>
                      {busy ? "Signing in…" : "Continue with Google"}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Callout tone="info" className="mt-4">
                  {identity.source === "local-header"
                    ? "This local-only identity was supplied by the test harness."
                    : "This is the local development identity configured in your environment file."}
                </Callout>
              )}
            </Card>
          ) : (
            <>
              <Callout tone="warn">No identity resolved for this request.</Callout>
              {firebaseSignInAvailable ? (
                <Button variant="primary" className="mt-4 w-full" onClick={() => void googleSignIn()} disabled={busy}>
                  {busy ? "Signing in…" : "Continue with Google"}
                </Button>
              ) : null}
            </>
          )}

          {sessionsAvailable ? (
            <Card className="mt-4">
              <CardHeader
                eyebrow={developerSignInAvailable ? "Local only" : "Invitation"}
                title={developerSignInAvailable ? "Switch account" : "Redeem an invitation"}
                meta={developerSignInAvailable
                  ? "Use the configured local account, or redeem a cohort invitation."
                  : "Paste the token from your cohort invitation link to start a session."}
              />
              <div className="p-5">
                {developerSignInAvailable ? (
                  <>
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="local-developer@upskill.invalid"
                      className="mb-4"
                    />
                    <TextField
                      label="Display name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Optional"
                      className="mb-4"
                    />
                  </>
                ) : null}
                <TextField
                  label="Invitation token"
                  hint={developerSignInAvailable ? "Optional" : "Required"}
                  value={inviteToken}
                  onChange={(event) => setInviteToken(event.target.value)}
                  placeholder="Paste from a cohort invite link"
                  className="mb-4"
                />
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => void signIn()}
                  disabled={busy || !canSignIn}
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </div>
            </Card>
          ) : null}
        </Section>

        <Section title="Attempt history" description="Every durable attempt on this account, newest first.">
          {history.loading ? (
            <Spinner label="Loading history…" />
          ) : (history.data?.attempts.length ?? 0) === 0 ? (
            <Callout tone="info">No durable attempts yet. Starting any lab creates the first record.</Callout>
          ) : (
            <ul className="grid list-none gap-2 p-0">
              {history.data?.attempts.map((attempt) => {
                const lab = labById(attempt.labId);
                return (
                  <Card as="li" key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="m-0 text-[14px] font-bold">
                        Lab {lab?.number ?? "?"} · {lab?.title ?? attempt.labId}
                      </p>
                      <p className="m-0 mt-0.5 text-[12px] text-muted">Updated {formatDateTime(attempt.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={attempt.status === "submitted" ? "ok" : "warn"}>
                        {attempt.status === "submitted" ? "Submitted" : "In progress"}
                      </Badge>
                      <LinkButton size="sm" variant="ghost" href={`/lab/${attempt.labId}`}>
                        Open
                      </LinkButton>
                    </div>
                  </Card>
                );
              })}
            </ul>
          )}
        </Section>

        {identity ? <DataRights email={identity.email} /> : null}
      </div>
    </Page>
  );
}

/**
 * Data-subject controls. Export is a plain download; erasure is irreversible and
 * therefore requires the account's own address to be typed out.
 */
function DataRights({ email }: { email: string }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const erase = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await post<{ deleted: Record<string, number> }>("/api/account", {
        action: "delete",
        confirmEmail: confirmEmail.trim().toLowerCase(),
      });
      const total = Object.values(result.deleted).reduce((sum, count) => sum + count, 0);
      setNotice(`Erased ${total} record${total === 1 ? "" : "s"}. Reload to start fresh.`);
      setConfirmEmail("");
    } catch (cause) {
      setError(errorMessage(cause, "Erasure failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Your data" description="Take a copy of everything held for this account, or erase it.">
      <Banners errors={[error]} notice={notice} className="mb-4" />

      <Card className="p-5">
        <p className="m-0 text-[15px]">
          The export includes attempts, submissions, evaluations, model runs, claims, baselines, measurements, and
          course progress as JSON.
        </p>
        <LinkButton href="/api/account?action=export" className="mt-4">
          Download my data
        </LinkButton>
      </Card>

      <Card className="mt-4 p-5">
        <p className="m-0 text-[15px] font-semibold">Erase this account</p>
        <p className="m-0 mt-1 text-[13px] text-muted">
          This cannot be undone. Capability claims and their evidence are removed too. A single audit event recording
          the erasure is retained.
        </p>
        <TextField
          label="Type your email address to confirm"
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          placeholder={email}
          className="mt-4"
        />
        <Button
          variant="danger"
          className="mt-4"
          disabled={busy || confirmEmail.trim().toLowerCase() !== email}
          onClick={() => void erase()}
        >
          {busy ? "Erasing…" : "Erase my data"}
        </Button>
      </Card>
    </Section>
  );
}
