"use client";

import { useCallback, useState } from "react";
import { errorMessage, post } from "./client-api";

/**
 * The shared write path behind the facilitator surfaces: POST, report the
 * outcome in a banner, then refetch the view.
 *
 * `run` resolves to the response body, or to `undefined` when the request
 * failed — callers that only drive banners can ignore the return, and the ones
 * that read the response get a value they do not have to null-check twice.
 */
/** Signature of `run`, for the child components that receive it as a prop. */
export type ActionRunner = (body: unknown, success: string) => Promise<unknown>;

export function useAction(endpoint: string, reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = useCallback(
    async <T,>(body: unknown, success: string): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const result = await post<T>(endpoint, body);
        setNotice(success);
        await reload();
        return result;
      } catch (cause) {
        setError(errorMessage(cause, "Action failed"));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [endpoint, reload],
  );

  return { busy, error, notice, setError, setNotice, run };
}
