import type { Column, SqlExpression } from "./firestore-schema";
import { getAdminFirestore } from "./firebase-admin";
import { usesFirestore } from "../app/lib/runtime-env";
import { assertErasureWriteAllowed, guardedTable } from "./erasure-guard";

type StoredRow = Record<string, unknown>;
type RowContext = Record<string, StoredRow>;
type AnyTable = {
  tableName: string;
  columns: Record<string, Column>;
  primaryKey: Column;
};

type Condition =
  | { kind: "and"; conditions: Condition[] }
  | { kind: "compare"; operator: "eq" | "ne" | "lt" | "gte" | "in"; column: Column; value: unknown };

type Order = { kind: "order"; column: Column; direction: "asc" | "desc" };
type Projection = Record<string, Column | SqlExpression>;
type TableRow<TTable> = TTable extends { $inferSelect: infer TRow extends object } ? TRow : StoredRow;
type ProjectionRow<TProjection extends Projection> = {
  [K in keyof TProjection]: TProjection[K] extends Column<infer TValue>
    ? TValue
    : TProjection[K] extends SqlExpression & { _type?: infer TValue }
      ? TValue
      : unknown;
};

interface Persistence {
  transaction<T>(work: (tx: DocumentTransaction) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  list(tableName: string): Promise<StoredRow[]>;
  query(tableName: string, filter: QueryFilter): Promise<StoredRow[]>;
  put(tableName: string, id: string, row: StoredRow): Promise<void>;
  remove(tableName: string, id: string): Promise<void>;
  clear(): Promise<void>;
}

type QueryFilter = {
  key: string;
  operator: "eq" | "ne" | "lt" | "gte" | "in";
  value: unknown;
  directId: boolean;
};

declare global {
  var __upskillMemoryDb: Map<string, Map<string, StoredRow>> | undefined;
  var __upskillMemoryRevision: number | undefined;
}

export interface DocumentTransaction {
  get(table: string, id: string): Promise<StoredRow | undefined>;
  put(table: string, id: string, row: StoredRow): void;
  remove(table: string, id: string): void;
}

class MemoryPersistence implements Persistence {
  private readonly tables = globalThis.__upskillMemoryDb ??= new Map();

  async ping() { void this.tables.size; }

  async transaction<T>(work: (tx: DocumentTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const revision = globalThis.__upskillMemoryRevision ?? 0;
      const snapshot = structuredClone(this.tables);
      const writes: Array<{ table: string; id: string; row?: StoredRow }> = [];
      const result = await work({
        get: async (table, id) => {
          if (writes.length) throw new Error("Transaction reads must precede writes.");
          return structuredClone(snapshot.get(table)?.get(id));
        },
        put: (table, id, row) => { writes.push({ table, id, row: structuredClone(row) }); },
        remove: (table, id) => { writes.push({ table, id }); },
      });
      if (revision !== (globalThis.__upskillMemoryRevision ?? 0)) continue;
      // Commit synchronously: no observer can see a partially applied transaction.
      for (const { table, id, row } of writes) {
        if (row) {
          if (!this.tables.has(table)) this.tables.set(table, new Map());
          this.tables.get(table)!.set(id, row);
        } else this.tables.get(table)?.delete(id);
      }
      if (writes.length) globalThis.__upskillMemoryRevision = revision + 1;
      return result;
    }
    throw new Error("Transaction contention exceeded retry limit.");
  }

  async list(tableName: string) {
    return [...(this.tables.get(tableName)?.values() ?? [])].map((row) => structuredClone(row));
  }

  async query(tableName: string, filter: QueryFilter) {
    const rows = await this.list(tableName);
    return rows.filter((row) => compareValues(row[filter.key], filter.operator, filter.value));
  }

  async put(tableName: string, id: string, row: StoredRow) {
    if (guardedTable(tableName)) return this.transaction(async (tx) => {
      await assertErasureWriteAllowed(tx, tableName, row);
      tx.put(tableName, id, row);
    });
    let table = this.tables.get(tableName);
    if (!table) {
      table = new Map();
      this.tables.set(tableName, table);
    }
    table.set(id, structuredClone(row));
    globalThis.__upskillMemoryRevision = (globalThis.__upskillMemoryRevision ?? 0) + 1;
  }

  async remove(tableName: string, id: string) {
    this.tables.get(tableName)?.delete(id);
    globalThis.__upskillMemoryRevision = (globalThis.__upskillMemoryRevision ?? 0) + 1;
  }

  async clear() {
    this.tables.clear();
    globalThis.__upskillMemoryRevision = (globalThis.__upskillMemoryRevision ?? 0) + 1;
  }
}

class FirestorePersistence implements Persistence {
  private readonly firestore = getAdminFirestore();

  async transaction<T>(work: (tx: DocumentTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async (transaction) => work({
      get: async (table, id) => {
        const snapshot = await transaction.get(this.firestore.collection(table).doc(id));
        return snapshot.exists ? snapshot.data() : undefined;
      },
      put: (table, id, row) => { transaction.set(this.firestore.collection(table).doc(id), row); },
      remove: (table, id) => { transaction.delete(this.firestore.collection(table).doc(id)); },
    }));
  }

  async ping() {
    // A missing document still verifies database access, with at most one read.
    await this.firestore.collection("_health").doc("readiness").get();
  }

  async list(tableName: string) {
    const snapshot = await this.firestore.collection(tableName).get();
    return snapshot.docs.map((document) => document.data());
  }

  async query(tableName: string, filter: QueryFilter) {
    const collection = this.firestore.collection(tableName);
    if (filter.directId && filter.operator === "eq") {
      const document = await collection.doc(String(filter.value)).get();
      return document.exists ? [document.data() as StoredRow] : [];
    }
    if (filter.operator === "in" && (!Array.isArray(filter.value) || filter.value.length === 0)) return [];
    const operator = { eq: "==", ne: "!=", lt: "<", gte: ">=", in: "in" }[filter.operator] as "==" | "!=" | "<" | ">=" | "in";
    const snapshot = await collection.where(filter.key, operator, filter.value).get();
    return snapshot.docs.map((document) => document.data());
  }

  async put(tableName: string, id: string, row: StoredRow) {
    if (guardedTable(tableName)) return this.transaction(async (tx) => {
      await assertErasureWriteAllowed(tx, tableName, row);
      tx.put(tableName, id, row);
    });
    await this.firestore.collection(tableName).doc(id).set(row);
  }

  async remove(tableName: string, id: string) {
    await this.firestore.collection(tableName).doc(id).delete();
  }

  async clear() {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("Refusing to clear a non-emulated Firestore database.");
    }
    const collections = await this.firestore.listCollections();
    await Promise.all(collections.map((collection) => this.firestore.recursiveDelete(collection)));
  }
}

let persistence: Persistence | null = null;
const store = () => persistence ??= usesFirestore() ? new FirestorePersistence() : new MemoryPersistence();
let pendingProbe: Promise<void> | undefined;

const valueFor = (context: RowContext, column: Column) => context[column.tableName]?.[column.key];

function evaluate(context: RowContext, condition?: Condition): boolean {
  if (!condition) return true;
  if (condition.kind === "and") return condition.conditions.every((item) => evaluate(context, item));
  const left = valueFor(context, condition.column);
  const right = condition.value && typeof condition.value === "object" && (condition.value as Column).kind === "column"
    ? valueFor(context, condition.value as Column)
    : condition.value;
  return compareValues(left, condition.operator, right);
}

function compareValues(left: unknown, operator: QueryFilter["operator"], right: unknown) {
  if (operator === "eq") return left === right;
  if (operator === "ne") return left !== right;
  if (operator === "lt" || operator === "gte") {
    if (left == null || right == null) return false;
    if (typeof left === "number" && typeof right === "number") {
      return operator === "lt" ? left < right : left >= right;
    }
    return operator === "lt" ? String(left) < String(right) : String(left) >= String(right);
  }
  return Array.isArray(right) && right.includes(left);
}

function comparisons(condition?: Condition): Array<Extract<Condition, { kind: "compare" }>> {
  if (!condition) return [];
  return condition.kind === "compare" ? [condition] : condition.conditions.flatMap(comparisons);
}

/** Select one indexed predicate, preferring an exact document-id lookup. */
function preferredFilter(condition: Condition | undefined, table: AnyTable, context?: RowContext): QueryFilter | undefined {
  const candidates = comparisons(condition).flatMap((item) => {
    if (item.column.tableName !== table.tableName) return [];
    const raw = item.value;
    const value = raw && typeof raw === "object" && (raw as Column).kind === "column"
      ? context ? valueFor(context, raw as Column) : undefined
      : raw;
    if (value === undefined || item.operator === "in" && !Array.isArray(value)) return [];
    return [{ key: item.column.key, operator: item.operator, value, directId: item.column.primary } satisfies QueryFilter];
  });
  const priority = (filter: QueryFilter) => filter.directId && filter.operator === "eq" ? 0 : filter.operator === "eq" ? 1 : filter.operator === "in" ? 2 : 3;
  return candidates.sort((left, right) => priority(left) - priority(right))[0];
}

function project(contexts: RowContext[], projection?: Projection): StoredRow[] {
  if (!projection) {
    return contexts.map((context) => ({ ...Object.values(context)[0] }));
  }

  const aggregate = Object.values(projection).find((value): value is SqlExpression => value.kind === "sql" && Boolean(value.aggregate));
  if (aggregate) {
    const output: StoredRow = {};
    for (const [key, value] of Object.entries(projection)) {
      if (value.kind !== "sql") output[key] = contexts[0] ? valueFor(contexts[0], value) : undefined;
      else if (value.aggregate === "count") output[key] = contexts.length;
      else if (value.aggregate === "sum") output[key] = contexts.reduce((sum, context) => sum + Number(value.column ? valueFor(context, value.column) ?? 0 : 0), 0);
    }
    return [output];
  }

  return contexts.map((context) => Object.fromEntries(
    Object.entries(projection).map(([key, value]) => [key, value.kind === "column" ? valueFor(context, value) : undefined]),
  ));
}

class SelectBuilder<TResult extends object = StoredRow> implements PromiseLike<TResult[]> {
  private source?: AnyTable;
  private readonly joins: Array<{ table: AnyTable; condition: Condition }> = [];
  private condition?: Condition;
  private order?: Order;
  private maximum?: number;

  constructor(private readonly projection?: Projection) {}

  from<TTable extends AnyTable>(table: TTable): SelectBuilder<[TResult] extends [never] ? TableRow<TTable> : TResult> {
    this.source = table;
    return this as unknown as SelectBuilder<[TResult] extends [never] ? TableRow<TTable> : TResult>;
  }

  innerJoin(table: AnyTable, condition: Condition) {
    this.joins.push({ table, condition });
    return this;
  }

  where(condition: Condition) {
    this.condition = condition;
    return this;
  }

  orderBy(order: Order | Column) {
    this.order = order.kind === "order" ? order : { kind: "order", column: order, direction: "asc" };
    return this;
  }

  limit(maximum: number) {
    this.maximum = maximum;
    return this;
  }

  private async execute() {
    if (!this.source) throw new Error("A query source is required.");
    const sourceFilter = preferredFilter(this.condition, this.source);
    const sourceRows = sourceFilter
      ? await store().query(this.source.tableName, sourceFilter)
      : await store().list(this.source.tableName);
    let contexts = sourceRows.map((row) => ({ [this.source!.tableName]: row }));
    for (const join of this.joins) {
      const joined: RowContext[] = [];
      for (const context of contexts) {
        const joinFilter = preferredFilter(join.condition, join.table, context);
        const rows = joinFilter
          ? await store().query(join.table.tableName, joinFilter)
          : await store().list(join.table.tableName);
        joined.push(...rows.map((row) => ({ ...context, [join.table.tableName]: row }))
          .filter((candidate) => evaluate(candidate, join.condition)));
      }
      contexts = joined;
    }
    contexts = contexts.filter((context) => evaluate(context, this.condition));
    if (this.order) {
      const { column, direction } = this.order;
      contexts.sort((left, right) => {
        const a = valueFor(left, column);
        const b = valueFor(right, column);
        const comparison = a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1;
        return direction === "desc" ? -comparison : comparison;
      });
    }
    if (this.maximum !== undefined) contexts = contexts.slice(0, this.maximum);
    return project(contexts, this.projection) as unknown as TResult[];
  }

  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?: ((value: TResult[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function defaultsFor(table: AnyTable, values: StoredRow) {
  const now = new Date().toISOString();
  const row: StoredRow = {};
  for (const column of Object.values(table.columns)) {
    if (values[column.key] !== undefined) row[column.key] = values[column.key];
    else if (column.defaultValue && typeof column.defaultValue === "object" && (column.defaultValue as SqlExpression).kind === "sql") row[column.key] = now;
    else if (column.defaultValue !== undefined) row[column.key] = column.defaultValue;
  }
  return { ...row, ...values };
}

class InsertBuilder<TRow extends object = StoredRow> implements PromiseLike<TRow[]> {
  private rows: StoredRow[] = [];
  private returnRows = false;
  private conflict?: { set: StoredRow };

  constructor(private readonly table: AnyTable) {}

  values(values: Partial<TRow> | Array<Partial<TRow>>) {
    this.rows = (Array.isArray(values) ? values : [values]).map((row) => defaultsFor(this.table, row as unknown as StoredRow));
    return this;
  }

  returning(projection?: Projection) {
    void projection;
    this.returnRows = true;
    return this;
  }

  onConflictDoUpdate(options: { target: Column; set: Partial<TRow> }) {
    this.conflict = { set: options.set as unknown as StoredRow };
    return this;
  }

  private async execute() {
    const written: StoredRow[] = [];
    for (const input of this.rows) {
      const id = String(input[this.table.primaryKey.key]);
      const [existing] = this.conflict ? await store().query(this.table.tableName, {
        key: this.table.primaryKey.key,
        operator: "eq",
        value: id,
        directId: true,
      }) : [];
      const row = existing && this.conflict ? { ...existing, ...this.conflict.set } : input;
      await store().put(this.table.tableName, id, row);
      written.push(row);
    }
    return (this.returnRows ? written : []) as unknown as TRow[];
  }

  then<TResult1 = TRow[], TResult2 = never>(onfulfilled?: ((value: TRow[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class UpdateBuilder<TRow extends object = StoredRow> implements PromiseLike<TRow[]> {
  private changes: StoredRow = {};
  private condition?: Condition;
  private returnProjection?: Projection | true;

  constructor(private readonly table: AnyTable) {}
  set(changes: Partial<TRow>) { this.changes = changes as unknown as StoredRow; return this; }
  where(condition: Condition) { this.condition = condition; return this; }
  returning(projection?: Projection) { this.returnProjection = projection ?? true; return this; }

  private async execute() {
    const filter = preferredFilter(this.condition, this.table);
    const rows = filter ? await store().query(this.table.tableName, filter) : await store().list(this.table.tableName);
    const updated: StoredRow[] = [];
    for (const row of rows) {
      if (!evaluate({ [this.table.tableName]: row }, this.condition)) continue;
      const next = { ...row, ...this.changes };
      await store().put(this.table.tableName, String(next[this.table.primaryKey.key]), next);
      updated.push(next);
    }
    if (!this.returnProjection) return [];
    return (this.returnProjection === true ? updated : project(updated.map((row) => ({ [this.table.tableName]: row })), this.returnProjection)) as unknown as TRow[];
  }

  then<TResult1 = TRow[], TResult2 = never>(onfulfilled?: ((value: TRow[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class DeleteBuilder<TRow extends object = StoredRow> implements PromiseLike<TRow[]> {
  private condition?: Condition;
  private returnProjection?: Projection | true;

  constructor(private readonly table: AnyTable) {}
  where(condition: Condition) { this.condition = condition; return this; }
  returning(projection?: Projection) { this.returnProjection = projection ?? true; return this; }

  private async execute() {
    const filter = preferredFilter(this.condition, this.table);
    const rows = filter ? await store().query(this.table.tableName, filter) : await store().list(this.table.tableName);
    const deleted = rows.filter((row) => evaluate({ [this.table.tableName]: row }, this.condition));
    await Promise.all(deleted.map((row) => store().remove(this.table.tableName, String(row[this.table.primaryKey.key]))));
    if (!this.returnProjection) return [];
    return (this.returnProjection === true ? deleted : project(deleted.map((row) => ({ [this.table.tableName]: row })), this.returnProjection)) as unknown as TRow[];
  }

  then<TResult1 = TRow[], TResult2 = never>(onfulfilled?: ((value: TRow[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const eq = (column: Column, value: unknown): Condition => ({ kind: "compare", operator: "eq", column, value });
export const ne = (column: Column, value: unknown): Condition => ({ kind: "compare", operator: "ne", column, value });
export const lt = (column: Column, value: unknown): Condition => ({ kind: "compare", operator: "lt", column, value });
export const gte = (column: Column, value: unknown): Condition => ({ kind: "compare", operator: "gte", column, value });
export const inArray = (column: Column, values: unknown[]): Condition => ({ kind: "compare", operator: "in", column, value: values });
export const and = (...conditions: Array<Condition | undefined>): Condition => ({ kind: "and", conditions: conditions.filter(Boolean) as Condition[] });
export const desc = (column: Column): Order => ({ kind: "order", column, direction: "desc" });
export { sql } from "./firestore-schema";

export class FirestoreOrm {
  /** Callback may retry. Read before writing; perform no external side effects. */
  transaction<T>(work: (tx: DocumentTransaction) => Promise<T>) { return store().transaction(work); }
  select(): SelectBuilder<never>;
  select<TProjection extends Projection>(projection: TProjection): SelectBuilder<ProjectionRow<TProjection>>;
  select(projection?: Projection) { return new SelectBuilder(projection); }
  insert<TTable extends AnyTable>(table: TTable) { return new InsertBuilder<TableRow<TTable>>(table); }
  update<TTable extends AnyTable>(table: TTable) { return new UpdateBuilder<TableRow<TTable>>(table); }
  delete<TTable extends AnyTable>(table: TTable) { return new DeleteBuilder<TableRow<TTable>>(table); }
  async batch<TStatements extends readonly PromiseLike<object[]>[]>(statements: TStatements): Promise<{ [K in keyof TStatements]: Awaited<TStatements[K]> }> {
    return Promise.all(statements) as Promise<{ [K in keyof TStatements]: Awaited<TStatements[K]> }>;
  }
  async ping(timeoutMs = 3000): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Readiness timeout must be positive.");
    // Share an outstanding SDK read so repeated probes cannot pile up during an
    // outage. A timed-out HTTP request does not cancel the underlying SDK call.
    const probe = pendingProbe ??= store().ping().finally(() => { pendingProbe = undefined; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        probe,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Database readiness timed out.")), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async clear() { await store().clear(); }
}
