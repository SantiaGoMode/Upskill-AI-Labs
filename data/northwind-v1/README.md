# Northwind v1

Northwind v1 is the shared synthetic enterprise used by the Phase 1 labs. It contains exactly
300 relational records across customers, employees, contracts, tickets, financials, and message
history, plus 40 document-store fixtures.

The corpus deliberately includes duplicate customer data, stale evidence, numerical conflicts,
restricted classifications, and instructions embedded inside source content. All names, domains,
events, and values are fictional.

Regenerate deterministically with `npm run data:generate`. Generated counts are enforced by the
generator and by automated tests.
