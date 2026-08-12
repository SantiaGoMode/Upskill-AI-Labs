import { describe, expect, it } from "vitest";
import { byText, byTextDesc, chunkIds, MAX_BOUND_IDS, selectInChunks } from "../../app/lib/sql-chunks";

describe("query-value chunking", () => {
  it("keeps every batch inside Firestore's in-query limit", () => {
    const ids = Array.from({ length: 205 }, (_, index) => `id-${index}`);
    const batches = chunkIds(ids);
    expect(batches.every((batch) => batch.length <= MAX_BOUND_IDS)).toBe(true);
    expect(MAX_BOUND_IDS).toBe(30);
    // Every id appears exactly once, in order.
    expect(batches.flat()).toEqual(ids);
  });

  it("returns a single batch when the ids already fit", () => {
    expect(chunkIds(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
    expect(chunkIds([])).toEqual([]);
  });

  it("issues no query at all for an empty id list", async () => {
    let calls = 0;
    const rows = await selectInChunks([], async () => {
      calls += 1;
      return ["unreachable"];
    });
    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });

  it("concatenates the rows of one query per batch", async () => {
    const ids = Array.from({ length: 170 }, (_, index) => index);
    const seen: number[][] = [];
    const rows = await selectInChunks(ids, async (batch) => {
      seen.push(batch);
      return batch.map((id) => `row-${id}`);
    });
    expect(seen).toHaveLength(6); // 30 + 30 + 30 + 30 + 30 + 20
    expect(rows).toHaveLength(170);
    expect(rows[0]).toBe("row-0");
    expect(rows.at(-1)).toBe("row-169");
  });

  it("re-sorts chunked results, which arrive ordered only within their batch", () => {
    // What a two-batch query looks like before sorting: each batch ordered, the
    // concatenation not.
    const rows = [{ at: "2026-03-01" }, { at: "2026-09-01" }, { at: "2026-01-01" }, { at: "2026-05-01" }];
    expect([...rows].sort(byText((row) => row.at)).map((row) => row.at))
      .toEqual(["2026-01-01", "2026-03-01", "2026-05-01", "2026-09-01"]);
    expect([...rows].sort(byTextDesc((row) => row.at)).map((row) => row.at))
      .toEqual(["2026-09-01", "2026-05-01", "2026-03-01", "2026-01-01"]);
  });
});
