"use client";

import { useCallback, useEffect, useState } from "react";

export type Identity = {
  email: string;
  displayName: string;
  role: "viewer" | "learner" | "facilitator" | "admin";
  source: "local-header" | "local-session" | "local" | "public-demo";
};

export class ApiError extends Error {
  status: number;
  /** Present on server failures; quoting it lets an operator find the log line. */
  incidentId?: string;
  constructor(message: string, status: number, incidentId?: string) {
    super(incidentId ? `${message} (reference ${incidentId})` : message);
    this.status = status;
    this.incidentId = incidentId;
  }
}

/** Every call goes through here so error shapes stay consistent across surfaces. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
  });
  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as T & { error?: string; incidentId?: string })
    : ({} as T & { error?: string; incidentId?: string });
  if (!response.ok) {
    throw new ApiError(data.error ?? `Request failed (${response.status})`, response.status, data.incidentId);
  }
  return data;
}

export const post = <T,>(url: string, body: unknown) => api<T>(url, { method: "POST", body: JSON.stringify(body) });

export function errorMessage(cause: unknown, fallback = "Something went wrong") {
  return cause instanceof Error ? cause.message : fallback;
}

type ResourceState<T> = { data: T | null; error: string; loading: boolean };

/**
 * Loads a resource on mount and exposes `reload` for post-mutation refresh.
 * Deliberately simple — there is no cache layer to invalidate.
 *
 * `load` never calls setState before its first await, so the mount effect stays
 * free of synchronous state updates. Reloads leave the previous data on screen
 * instead of flashing a spinner.
 */
export function useResource<T>(url: string | null) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: "", loading: Boolean(url) });

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const data = await api<T>(url);
      setState({ data, error: "", loading: false });
    } catch (cause) {
      setState((current) => ({ ...current, error: errorMessage(cause, "Unable to load this view"), loading: false }));
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}

export function useIdentity() {
  const { data, error, loading, reload } = useResource<{
    identity: Identity | null;
    sessionsAvailable: boolean;
    developerSignInAvailable: boolean;
    firebaseSignInAvailable: boolean;
  }>("/api/auth");
  return {
    identity: data?.identity ?? null,
    /** Whether an account session can be created at all, invitation included. */
    sessionsAvailable: data?.sessionsAvailable ?? false,
    /** Whether the configured developer account can sign in without a credential. */
    developerSignInAvailable: data?.developerSignInAvailable ?? false,
    firebaseSignInAvailable: data?.firebaseSignInAvailable ?? false,
    error,
    loading,
    reload,
  };
}

export const isFacilitator = (identity: Identity | null) => identity?.role === "facilitator" || identity?.role === "admin";
export const isAdmin = (identity: Identity | null) => identity?.role === "admin";
export const isViewer = (identity: Identity | null) => identity?.role === "viewer";

export function formatCost(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unmetered";
  if (value === 0) return "$0.00";
  return value < 0.01 ? `$${value.toFixed(5)}` : `$${value.toFixed(3)}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString([], { dateStyle: "medium" });
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}
