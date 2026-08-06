import { LinkButton, Card, Page, PageHeader, Section } from "./components/ui";

/** Shown for an unknown route, and for a module, lesson, or lab id that does not exist. */
export default function NotFound() {
  return (
    <Page>
      <PageHeader eyebrow="Not found" title="That page does not exist" />
      <Section>
        <Card className="p-5">
          <p className="m-0 text-[15px]">
            The link may be out of date, or the module, lesson, or lab id may have changed.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <LinkButton href="/course" variant="primary">
              Course overview
            </LinkButton>
            <LinkButton href="/">Today</LinkButton>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
