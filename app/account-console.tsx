"use client";

import { useEffect, useState } from "react";

type Identity = { email: string; displayName: string; role: "learner" | "facilitator"; source: string };

export function AccountConsole({ open, onClose, initialInvite = "" }: { open: boolean; onClose: () => void; initialInvite?: string }) {
  const [identity, setIdentity] = useState<Identity | null>(null); const [email, setEmail] = useState(""); const [displayName, setDisplayName] = useState(""); const [inviteToken, setInviteToken] = useState(initialInvite); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; const timer = window.setTimeout(async () => { const response = await fetch("/api/auth"); if (response.ok) setIdentity((await response.json()).identity); }, 0); return () => window.clearTimeout(timer); }, [open]);
  const effectiveInvite = inviteToken || initialInvite;
  async function submit(action: "sign-in" | "sign-out") {
    setBusy(true); setError("");
    const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email, displayName, inviteToken: effectiveInvite }) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(data.error ?? "Account action failed"); return; }
    window.history.replaceState({}, "", window.location.pathname);
    window.location.reload();
  }
  if (!open) return null;
  return <div className="account-backdrop"><section className="account-console" role="dialog" aria-modal="true" aria-labelledby="account-title"><header><div><span className="eyebrow">Local account</span><h2 id="account-title">{identity?.displayName ?? "Sign in"}</h2></div><button onClick={onClose} aria-label="Close account">×</button></header><div className="account-current"><span>{identity?.email}</span><b>{identity?.role}</b><small>{identity?.source === "local-session" ? "Signed-in session" : "Configured local fallback"}</small></div><p>Account switching is local to this installation. Join with a trainer invitation, or return to the configured developer account.</p>{effectiveInvite ? <><label>Invitation token<input value={effectiveInvite} onChange={(event) => setInviteToken(event.target.value)} /></label><button className="phase2-primary" disabled={busy} onClick={() => submit("sign-in")}>Accept invitation and sign in</button></> : <><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><button className="phase2-primary" disabled={busy || !email} onClick={() => submit("sign-in")}>Sign in locally</button></>}<button className="phase2-secondary" disabled={busy || identity?.source !== "local-session"} onClick={() => submit("sign-out")}>End local session</button>{error && <p className="account-error" role="alert">{error}</p>}</section></div>;
}
