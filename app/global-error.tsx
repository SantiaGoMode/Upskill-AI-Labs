"use client";

/**
 * Last-resort boundary for a failure in the root layout itself. It renders its own
 * document and avoids the app's styles and components, because whatever failed may
 * be the thing that provides them.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: "48px 24px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
        <main style={{ maxWidth: "34rem", margin: "0 auto" }}>
          <h1 style={{ fontSize: "1.375rem", margin: "0 0 12px" }}>Upskill AI Labs could not start</h1>
          <p style={{ margin: "0 0 16px" }}>
            The application failed to load. Saved work is not affected. Reload to try again.
          </p>
          {error.digest ? (
            <p style={{ margin: "0 0 16px", fontFamily: "ui-monospace, monospace", fontSize: "0.875rem" }}>
              Reference {error.digest}
            </p>
          ) : null}
          {/* A full document load, not client navigation: the router is part of what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ fontWeight: 600 }}>
            Reload the application
          </a>
        </main>
      </body>
    </html>
  );
}
