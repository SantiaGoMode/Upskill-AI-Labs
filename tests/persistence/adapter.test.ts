import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FirestoreOrm, and, desc, eq, gte, inArray, lt, sql } from "../../db/firestore-orm";
import { integer, sqliteTable, text } from "../../db/firestore-schema";

// Both runners use only these uniquely named collections in a demo project.
const suffix = crypto.randomUUID().replaceAll("-", "");
const records = sqliteTable(`contract_records_${suffix}`, {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  amount: integer("amount").notNull(),
  note: text("note").default("initial"),
});
const children = sqliteTable(`contract_children_${suffix}`, {
  id: text("id").primaryKey(),
  parentId: text("parent_id").notNull(),
});
const db = new FirestoreOrm();
const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();

beforeEach(async () => {
  await db.delete(children);
  await db.delete(records);
  await db.insert(records).values([
    { id: "a", owner: "alice", amount: 2 },
    { id: "b", owner: "alice", amount: 10 },
    { id: "c", owner: "bob", amount: 100 },
  ]);
});

afterAll(async () => {
  await db.delete(children);
  await db.delete(records);
});

describe("persistence contract", () => {
  it("probes readiness and reads defaults without mutating returned data", async () => {
    await db.ping();
    const [row] = await db.select().from(records).where(eq(records.id, "a"));
    expect(row.note).toBe("initial");
    row.note = "client edit";
    expect((await db.select().from(records).where(eq(records.id, "a")))[0].note).toBe("initial");
  });

  it("compares numbers numerically in both pushed and residual filters", async () => {
    expect(ids(await db.select().from(records).where(lt(records.amount, 10)))).toEqual(["a"]);
    expect(ids(await db.select().from(records).where(gte(records.amount, 10)))).toEqual(["b", "c"]);
    expect(ids(await db.select().from(records).where(and(eq(records.owner, "alice"), gte(records.amount, 10))))).toEqual(["b"]);
  });

  it("filters before ordering and limiting, and supports empty membership", async () => {
    expect(ids(await db.select().from(records).where(eq(records.owner, "alice")).orderBy(desc(records.amount)).limit(1))).toEqual(["b"]);
    expect(await db.select().from(records).where(inArray(records.id, []))).toEqual([]);
    expect(ids(await db.select().from(records).where(inArray(records.id, ["a", "c"])))).toEqual(["a", "c"]);
  });

  it("aggregates and joins only matching records", async () => {
    expect(await db.select({ count: sql<number>`count(*)`, total: sql<number>`sum(${records.amount})` })
      .from(records).where(eq(records.owner, "alice"))).toEqual([{ count: 2, total: 12 }]);
    await db.insert(children).values([{ id: "child", parentId: "a" }, { id: "orphan", parentId: "missing" }]);
    expect(await db.select({ id: children.id, owner: records.owner }).from(children)
      .innerJoin(records, eq(records.id, children.parentId))).toEqual([{ id: "child", owner: "alice" }]);
  });

  it("updates and deletes only matching rows and returns projections", async () => {
    expect(await db.update(records).set({ note: "changed" }).where(eq(records.id, "b")).returning({ id: records.id })).toEqual([{ id: "b" }]);
    expect(await db.delete(records).where(eq(records.owner, "bob")).returning({ id: records.id })).toEqual([{ id: "c" }]);
    expect(ids(await db.select().from(records))).toEqual(["a", "b"]);
  });

  it("upserts an existing primary key while preserving untouched fields", async () => {
    await db.insert(records).values({ id: "a", owner: "replacement", amount: 99 })
      .onConflictDoUpdate({ target: records.id, set: { note: "upserted" } });
    expect((await db.select().from(records).where(eq(records.id, "a")))[0]).toMatchObject({ owner: "alice", amount: 2, note: "upserted" });
  });

  it("preserves concurrent writes to independent documents", async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => db.insert(children).values({ id: `parallel-${i}`, parentId: "a" })));
    expect(await db.select().from(children)).toHaveLength(12);
  });

  it("serializes concurrent read-modify-write transactions", async () => {
    await Promise.all(Array.from({ length: 6 }, () => new FirestoreOrm().transaction(async (tx) => {
      const row = await tx.get(records.tableName, "a");
      tx.put(records.tableName, "a", { ...row!, amount: Number(row!.amount) + 1 });
    })));
    expect((await db.select().from(records).where(eq(records.id, "a")))[0].amount).toBe(8);
  });

  it("rolls back all writes when a transaction throws", async () => {
    await expect(db.transaction(async (tx) => {
      tx.remove(records.tableName, "a");
      tx.put(children.tableName, "rolled-back", { id: "rolled-back", parentId: "a" });
      throw new Error("injected failure");
    })).rejects.toThrow("injected failure");
    expect(ids(await db.select().from(records))).toEqual(["a", "b", "c"]);
    expect(await db.select().from(children)).toEqual([]);
  });

  it("rejects reading after writing without committing", async () => {
    await expect(db.transaction(async (tx) => {
      tx.remove(records.tableName, "a");
      await tx.get(records.tableName, "b");
    })).rejects.toThrow();
    expect(ids(await db.select().from(records))).toEqual(["a", "b", "c"]);
  });

  it.runIf(Boolean(process.env.FIRESTORE_EMULATOR_HOST))("propagates rejected writes without corrupting existing records", async () => {
    await expect(db.insert(records).values({ id: "invalid/path", owner: "alice", amount: 1 })).rejects.toThrow();
    expect(ids(await db.select().from(records))).toEqual(["a", "b", "c"]);
  });
});
