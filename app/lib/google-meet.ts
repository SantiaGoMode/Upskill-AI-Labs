import { env } from "./server-env";

/**
 * Google Meet REST API client.
 *
 * Authentication uses an OAuth 2.0 refresh token belonging to the facilitator's
 * Google Workspace account. Meet spaces are owned by a user, not by a service
 * account, so domain-wide delegation or a stored user refresh token is required —
 * there is no client-credentials path.
 *
 * Configure in .dev.vars / .env:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 *
 * Required scopes on that refresh token:
 *   https://www.googleapis.com/auth/meetings.space.created
 *   https://www.googleapis.com/auth/meetings.space.readonly   (for participants)
 *
 * NOTE: Google's terms state the Meet REST API "isn't intended for performance
 * tracking or user evaluation." Attendance read here is shown to the facilitator
 * as a session recap only, and must never feed the Capability Ledger.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MEET_API = "https://meet.googleapis.com/v2";

export class MeetNotConfiguredError extends Error {
  constructor() {
    super("Google Meet is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN, or paste a meeting link manually.");
  }
}

export class MeetApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type MeetConfig = { clientId: string; clientSecret: string; refreshToken: string };

function readConfig(): MeetConfig | null {
  const bindings = env as unknown as Record<string, unknown>;
  const clientId = typeof bindings.GOOGLE_CLIENT_ID === "string" ? bindings.GOOGLE_CLIENT_ID.trim() : "";
  const clientSecret = typeof bindings.GOOGLE_CLIENT_SECRET === "string" ? bindings.GOOGLE_CLIENT_SECRET.trim() : "";
  const refreshToken = typeof bindings.GOOGLE_REFRESH_TOKEN === "string" ? bindings.GOOGLE_REFRESH_TOKEN.trim() : "";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export const isMeetConfigured = () => readConfig() !== null;

/** Access tokens last an hour; cached in module scope for the isolate's lifetime. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const config = readConfig();
  if (!config) throw new MeetNotConfiguredError();

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new MeetApiError(data.error_description ?? data.error ?? "Google token exchange failed", 502);
  }

  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function meetFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${MEET_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init?.headers },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = (data as { error?: { message?: string } }).error?.message ?? `Meet API error (${response.status})`;
    throw new MeetApiError(message, response.status === 401 || response.status === 403 ? 502 : response.status);
  }
  return data as T;
}

export type MeetSpace = { name: string; meetingUri: string; meetingCode: string };

/** Creates a meeting space owned by the configured Workspace account. */
export async function createMeetSpace(): Promise<MeetSpace> {
  const space = await meetFetch<{ name: string; meetingUri: string; meetingCode: string }>("/spaces", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return { name: space.name, meetingUri: space.meetingUri, meetingCode: space.meetingCode };
}

export type MeetRecap = {
  conferenceCount: number;
  latest: { startTime: string; endTime: string | null; participantCount: number } | null;
};

/**
 * Post-session recap for the facilitator. Deliberately returns counts and times
 * only — no per-person attendance — so it cannot be repurposed as evaluation data.
 */
export async function fetchMeetRecap(spaceName: string): Promise<MeetRecap> {
  const filter = encodeURIComponent(`space.name="${spaceName}"`);
  const records = await meetFetch<{ conferenceRecords?: Array<{ name: string; startTime: string; endTime?: string }> }>(
    `/conferenceRecords?filter=${filter}`,
  );
  const list = records.conferenceRecords ?? [];
  if (!list.length) return { conferenceCount: 0, latest: null };

  const latest = list[0];
  const participants = await meetFetch<{ participants?: unknown[]; totalSize?: number }>(`/${latest.name}/participants`);

  return {
    conferenceCount: list.length,
    latest: {
      startTime: latest.startTime,
      endTime: latest.endTime ?? null,
      participantCount: participants.totalSize ?? participants.participants?.length ?? 0,
    },
  };
}

/** Accepts only real Meet links, so a pasted value cannot become an open redirect. */
export function normalizeMeetUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "meet.google.com") return null;
  return `https://meet.google.com${url.pathname}${url.search}`;
}
