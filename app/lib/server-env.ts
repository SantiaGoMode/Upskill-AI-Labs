/**
 * Server-only environment access shared by local Next.js and Firebase App Hosting.
 * Keeping this tiny boundary prevents provider credentials from entering client
 * bundles and removes the former dependency on `cloudflare:workers` bindings.
 */
export const env = process.env as Record<string, string | undefined>;
