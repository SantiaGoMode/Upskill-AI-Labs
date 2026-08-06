/**
 * D1 rejects a statement carrying more than 100 bound parameters
 * (`too many SQL variables`). An `inArray(column, ids)` binds one parameter per
 * id, so any query over an unbounded id list fails once the data grows — a
 * facilitator with 100+ cohorts, or a learner with 100+ attempts.
 *
 * These helpers split such a query into batches that stay under the limit.
 */

/** Left below 100 so a query can carry other bound parameters alongside the ids. */
export const MAX_BOUND_IDS = 80;

export function chunkIds<T>(ids: readonly T[], size = MAX_BOUND_IDS): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    batches.push(ids.slice(index, index + size));
  }
  return batches;
}

/**
 * Runs `query` once per batch of ids and concatenates the rows. Queries no
 * database at all for an empty id list, which is also why callers do not need a
 * sentinel value to keep `inArray` non-empty.
 *
 * Rows arrive grouped by batch, so a caller that needs a global order must sort
 * the result rather than relying on the query's own ORDER BY.
 */
export async function selectInChunks<Id, Row>(
  ids: readonly Id[],
  query: (batch: Id[]) => Promise<Row[]>,
): Promise<Row[]> {
  if (!ids.length) return [];
  const rows: Row[] = [];
  for (const batch of chunkIds(ids)) {
    rows.push(...await query(batch));
  }
  return rows;
}

/** Ascending by the given text field, for re-ordering chunked results. */
export const byText = <T>(field: (row: T) => string) => (a: T, b: T) => field(a).localeCompare(field(b));

/** Descending by the given text field, for re-ordering chunked results. */
export const byTextDesc = <T>(field: (row: T) => string) => (a: T, b: T) => field(b).localeCompare(field(a));
