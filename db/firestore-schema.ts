export type SqlExpression = {
  kind: "sql";
  text: string;
  values: unknown[];
  aggregate?: "count" | "sum";
  column?: Column;
};

export type Column<T = unknown> = {
  kind: "column";
  key: string;
  fieldName: string;
  tableName: string;
  primary: boolean;
  defaultValue?: T | SqlExpression;
  dataType: "text" | "integer" | "real" | "boolean";
};

type AnyColumn = Column<unknown>;

class ColumnBuilder<T> {
  readonly config: Omit<Column<T>, "key" | "tableName">;

  constructor(fieldName: string, dataType: Column<T>["dataType"]) {
    this.config = { kind: "column", fieldName, primary: false, dataType };
  }

  notNull(): ColumnBuilder<NonNullable<T>> {
    return this as unknown as ColumnBuilder<NonNullable<T>>;
  }

  default(value: T | SqlExpression) {
    this.config.defaultValue = value;
    return this;
  }

  primaryKey(): ColumnBuilder<NonNullable<T>> {
    this.config.primary = true;
    return this as unknown as ColumnBuilder<NonNullable<T>>;
  }

  references(reference: () => AnyColumn) {
    void reference;
    return this;
  }
}

type BuilderRecord = Record<string, ColumnBuilder<unknown>>;
type Columns<T extends BuilderRecord> = {
  [K in keyof T]: T[K] extends ColumnBuilder<infer TValue> ? Column<TValue> : never;
};

type InferRow<TColumns extends Record<string, AnyColumn>> = {
  [K in keyof TColumns]: TColumns[K] extends Column<infer TValue> ? TValue : never;
};

export type Table<TColumns extends Record<string, AnyColumn>> = TColumns & {
  kind: "table";
  tableName: string;
  columns: TColumns;
  primaryKey: AnyColumn;
  $inferSelect: InferRow<TColumns>;
};

export function sqliteTable<T extends BuilderRecord>(
  tableName: string,
  definitions: T,
  indexes?: (table: Columns<T>) => unknown,
): Table<Columns<T>> {
  const columns = {} as Columns<T>;
  for (const [key, builder] of Object.entries(definitions)) {
    (columns as Record<string, AnyColumn>)[key] = {
      ...builder.config,
      key,
      tableName,
    } as AnyColumn;
  }

  // Keep the schema callback executable so a misspelled column still fails fast.
  indexes?.(columns);
  const primaryKey = Object.values(columns).find((column) => column.primary) ?? Object.values(columns)[0];
  return Object.assign({ kind: "table" as const, tableName, columns, primaryKey, $inferSelect: undefined as unknown as InferRow<Columns<T>> }, columns);
}

export const text = (fieldName: string) => new ColumnBuilder<string | null>(fieldName, "text");
export const real = (fieldName: string) => new ColumnBuilder<number | null>(fieldName, "real");
export function integer(fieldName: string, options: { mode: "boolean" }): ColumnBuilder<boolean | null>;
export function integer(fieldName: string, options?: undefined): ColumnBuilder<number | null>;
export function integer(fieldName: string, options?: { mode?: "boolean" }) {
  return new ColumnBuilder<number | boolean | null>(fieldName, options?.mode === "boolean" ? "boolean" : "integer");
}

export function index(name: string) {
  void name;
  return { on: (...columns: AnyColumn[]) => { void columns; return {}; } };
}

export function sql<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): SqlExpression & { _type?: T } {
  const textValue = strings.reduce((result, part, index) => `${result}${part}${index < values.length ? "?" : ""}`, "");
  const normalized = textValue.toLowerCase().replaceAll(/\s+/g, " ").trim();
  const column = values.find((value): value is Column => Boolean(value && typeof value === "object" && (value as Column).kind === "column"));
  return {
    kind: "sql",
    text: textValue,
    values,
    aggregate: normalized.includes("count(") ? "count" : normalized.includes("sum(") ? "sum" : undefined,
    column,
  };
}
