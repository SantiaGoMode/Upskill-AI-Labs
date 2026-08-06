"use client";

import { useEffect } from "react";
import { Button, Callout, Card, Page, PageHeader, Section } from "./components/ui";

/**
 * Route-level boundary. Replaces the blank page a render error used to produce,
 * and keeps the learner's next action obvious: retry, or go back to the course.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: "error",
      message: "route_render_failed",
      errorName: error.name,
      errorMessage: error.message,
      digest: error.digest,
    }));
  }, [error]);

  return (
    <Page>
      <PageHeader eyebrow="Something went wrong" title="This page could not be displayed" />
      <Section>
        <Card className="p-5">
          <p className="m-0 text-[15px]">
            Saved work is not affected. Retrying usually resolves it; if it does not, reload the page.
          </p>
          {error.digest ? (
            <Callout tone="info" className="mt-4">
              Quote reference <span className="font-mono">{error.digest}</span> if you report this.
            </Callout>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <Button onClick={() => window.location.assign("/course")}>Back to the course</Button>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
