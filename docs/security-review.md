# Firebase security review

Reviewed August 12, 2026. The Firebase App Hosting deployment has no known npm
advisories after this pass, uses Firebase ID-token verification plus signed server
sessions for deployed identity, denies browser access to application data, and applies
authorization and request limits in the Next.js API. No critical or high-severity
application vulnerability was found.

## Resolved findings

### SEC-001: Vulnerable transitive dependencies

- **Severity:** High
- **Location:** `package.json:37-61`, `package-lock.json`
- **Evidence:** The initial production audit reported vulnerable `nanoid` and `uuid` versions; the full audit also found affected build/test versions of Babel, brace-expansion, js-yaml, PostCSS, Sharp, and Vite.
- **Impact:** Crafted inputs could trigger denial of service or local file disclosure in affected library paths. Build-tool findings do not execute in the deployed runtime, but still affect developer and CI trust.
- **Fix:** Pin patched compatible versions and regenerate the lockfile. Both `npm audit` and `npm audit --omit=dev` now report zero vulnerabilities.
- **Mitigation:** GitHub Dependabot alerts and security updates are enabled.
- **False positive notes:** The `uuid` advisory concerns buffer-accepting v3/v5/v6 calls not used by this app, but the transitive copy was upgraded anyway.

### SEC-002: Retired proxy authentication path

- **Severity:** Low
- **Location:** `app/lib/identity-trust.ts:1-44`, `app/lib/request-identity.ts:91-114`
- **Evidence:** The prior code retained a shared-secret reverse-proxy identity mechanism after Firebase became the production host.
- **Impact:** Although it failed closed, an unused second deployed authentication mechanism increased review and configuration surface.
- **Fix:** Remove proxy-secret support. Request-header identities are now accepted only on a loopback request in a non-managed environment for automated tests; production uses Firebase sessions.
- **Mitigation:** API integration tests cover learner, facilitator, viewer, and administrator authorization.
- **False positive notes:** Local test headers remain intentionally available and are rejected in managed environments.

### SEC-003: Over-broad disabled analytics policy and server disclosure

- **Severity:** Low
- **Location:** `next.config.ts:3-15`, `next.config.ts:34-48`
- **Evidence:** Google analytics origins were allowed even when analytics was disabled, and Next.js emitted its framework-identification header.
- **Impact:** Unneeded allowed origins weaken CSP least privilege; framework disclosure marginally helps reconnaissance.
- **Fix:** Include analytics origins only when analytics is enabled and disable `X-Powered-By`.
- **Mitigation:** CSP also blocks objects and framing and constrains form actions, base URLs, and browser connections.
- **False positive notes:** Firebase Auth and Firestore origins remain required for sign-in and live-room signals.

## Remaining defense-in-depth item

### SEC-004: CSP permits inline scripts and styles

- **Severity:** Medium
- **Location:** `next.config.ts:4`, `next.config.ts:20`
- **Evidence:** `script-src` and `style-src` contain `'unsafe-inline'`.
- **Impact:** A future HTML-injection bug would have fewer browser-level barriers to inline execution or style injection.
- **Fix:** Move to a nonce-based Next.js CSP after measuring the effect of per-request rendering on App Hosting cache behavior.
- **Mitigation:** React escapes rendered strings; the audit found no untrusted raw-HTML sink. CSP blocks `unsafe-eval`, objects, framing, and cross-origin form submission.
- **False positive notes:** The current inline theme bootstrap is a source constant, not user-controlled content. Removing `'unsafe-inline'` without a nonce would break Next.js hydration.

## Verified deployment controls

- `firestore.rules:5-15` permits only an authenticated `get` of a known, state-free live-room signal and denies all browser writes and application-data reads.
- `apphosting.yaml:1-30` caps the service at two instances and binds administrator addresses and the session key through Secret Manager.
- `app/api/auth/route.ts:25-30` sets `HttpOnly`, `SameSite=Lax`, and production `Secure` session-cookie attributes; Firebase tokens are verified at `app/api/auth/route.ts:65-76`.
- `proxy.ts:4-12` rejects cross-site API writes, and `app/lib/request-limits.ts:19-78` bounds and validates request bodies.
- The live backend was ready, used the dedicated App Hosting compute service account, had no direct public Cloud Run IAM binding, returned a healthy production readiness result, and served CSP, clickjacking, MIME-sniffing, referrer, permissions, COOP, and HSTS headers.
- GitHub now has secret scanning, push protection, Dependabot alerts/security updates, and automatic deletion of merged branches enabled.
