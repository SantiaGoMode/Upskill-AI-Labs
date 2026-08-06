"use client";

import type { ReactNode } from "react";
import { useIdentity } from "../lib/client-api";
import { Callout, LinkButton, Page, Spinner } from "./ui";

/**
 * Facilitator surfaces are hidden from the learner nav, but a learner can still
 * type the URL. The API enforces the role independently; this only avoids
 * rendering a page full of 403s.
 */
export function FacilitatorGuard({ children }: { children: ReactNode }) {
  const { identity, loading } = useIdentity();

  if (loading) {
    return (
      <Page>
        <Spinner label="Checking access…" />
      </Page>
    );
  }

  if (identity?.role !== "facilitator") {
    return (
      <Page>
        <Callout tone="warn" title="Facilitator access required">
          <p className="m-0 mt-1">
            This surface is for trainers and compliance owners. Your account is signed in as a learner.
          </p>
          <div className="mt-3 flex gap-2">
            <LinkButton href="/" size="sm">
              Back to Today
            </LinkButton>
            <LinkButton href="/account" size="sm" variant="ghost">
              Switch account
            </LinkButton>
          </div>
        </Callout>
      </Page>
    );
  }

  return <>{children}</>;
}
