// Tiny in-memory fake of the Supabase admin client that implements enough
// of the fluent API for the Stripe webhook handlers to run end-to-end:
//
//   .from(table).select(...).eq(...).maybeSingle() → single row
//   .from(table).select(...).eq(...).filter(...).limit(n) → row array
//   .from(table).update(patch).eq(...)                   → mutates row
//   .from(table).insert(row)                             → appends row
//
// It's specialised to the tables the webhook touches (`members`,
// `membership_tiers`, `audit_log`) so we don't have to implement a full fake.

export interface FakeMemberRow {
  id: string;
  membership_tier_id: string | null;
  credits_remaining: number;
  credits_reset_date?: string | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
}

export interface FakeTierRow {
  id: string;
  credits_per_month: number;
  stripe_price_id?: string | null;
}

export interface FakeAuditRow {
  id?: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface FakeDb {
  members: FakeMemberRow[];
  membership_tiers: FakeTierRow[];
  audit_log: FakeAuditRow[];
}

type Row = Record<string, unknown>;

function matchesEq(row: Row, conditions: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(conditions)) {
    if (row[key] !== value) return false;
  }
  return true;
}

function matchesJsonbFilter(row: Row, path: string, value: unknown): boolean {
  // Handles `metadata->>invoice_id` style.
  const m = /^(\w+)->>(\w+)$/.exec(path);
  if (!m) return false;
  const col = m[1]!;
  const field = m[2]!;
  const json = row[col] as Record<string, unknown> | undefined;
  return json?.[field] === value;
}

type QueryResult = { data: unknown; error: unknown };

interface QueryBuilder extends PromiseLike<QueryResult> {
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  filter(path: string, op: string, value: unknown): QueryBuilder;
  limit(n: number): QueryBuilder;
  order(column: string, opts?: { ascending?: boolean }): QueryBuilder;
  update(patch: Row): QueryBuilder;
  insert(row: Row | Row[]): QueryBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: unknown }>;
  single(): Promise<{ data: Row | null; error: unknown }>;
}

function builder(db: FakeDb, tableName: keyof FakeDb): QueryBuilder {
  const eqConditions: Record<string, unknown> = {};
  const jsonbFilters: Array<{ path: string; value: unknown }> = [];
  let limitN: number | undefined;
  let op: "select" | "update" | "insert" = "select";
  let patch: Row | undefined;
  let inserted: Row | Row[] | undefined;

  const rows = (): Row[] => db[tableName] as unknown as Row[];

  const api: QueryBuilder = {
    select() {
      return api;
    },
    eq(column, value) {
      eqConditions[column] = value;
      return api;
    },
    filter(path, _opArg, value) {
      jsonbFilters.push({ path, value });
      return api;
    },
    limit(n) {
      limitN = n;
      return api;
    },
    order() {
      return api;
    },
    update(p) {
      op = "update";
      patch = p;
      return api;
    },
    insert(row) {
      op = "insert";
      inserted = row;
      return api;
    },
    async maybeSingle() {
      const found = rows().find(
        (r) =>
          matchesEq(r, eqConditions) &&
          jsonbFilters.every((f) => matchesJsonbFilter(r, f.path, f.value))
      );
      return { data: found ?? null, error: null };
    },
    async single() {
      const found = rows().find((r) => matchesEq(r, eqConditions));
      return {
        data: found ?? null,
        error: found ? null : { message: "Not found" },
      };
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ): Promise<TResult1 | TResult2> {
      const execute = async (): Promise<QueryResult> => {
        if (op === "update") {
          const matches = rows().filter((r) => matchesEq(r, eqConditions));
          for (const r of matches) Object.assign(r, patch ?? {});
          return { data: matches, error: null };
        }
        if (op === "insert") {
          const toInsert = Array.isArray(inserted)
            ? inserted
            : inserted
              ? [inserted]
              : [];
          for (const r of toInsert) {
            rows().push({
              id: `fake-${Math.random().toString(36).slice(2, 8)}`,
              ...r,
              created_at: new Date().toISOString(),
            });
          }
          return { data: toInsert, error: null };
        }
        const matches = rows().filter(
          (r) =>
            matchesEq(r, eqConditions) &&
            jsonbFilters.every((f) => matchesJsonbFilter(r, f.path, f.value))
        );
        const capped =
          limitN !== undefined ? matches.slice(0, limitN) : matches;
        return { data: capped, error: null };
      };
      return execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };

  return api;
}

export function createFakeAdminClient(db: FakeDb): {
  from(tableName: keyof FakeDb): QueryBuilder;
} {
  return {
    from(tableName) {
      return builder(db, tableName);
    },
  };
}
