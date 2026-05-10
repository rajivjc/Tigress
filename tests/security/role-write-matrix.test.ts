// =============================================================================
// Role write matrix guard
// =============================================================================
// Reads supabase/migrations/*.sql, finds every WRITE policy (INSERT, UPDATE,
// DELETE, FOR ALL) on each declared table, parses the role check
// (`get_staff_role() IN (…)` or `get_staff_role() = 'role'`), and asserts
// the union of allowed roles matches the manifest's `default` writer set.
//
// Why this exists: the S27a audit found that actions can enforce role X
// while the underlying RLS policy allows a wider role Y. The
// rls-pattern test catches NULL-coalescence; this guard catches
// action/RLS divergence at the policy level.
//
// Manifest format: tests/security/role-write-matrix.json. Each entry
// declares `writers.default` (roles allowed to write to the table by the
// "wide" branch) and optionally `writers.lock_transitions` plus
// `lock_state_column` / `lock_state_values` for tables with a status-aware
// split (currently only schedule_payroll_runs).
//
// Coverage: this guard is opt-in per table — only tables listed in the
// manifest are checked, but ANY write policy on a table that prefixes one
// of the declared families (`schedule_payroll_*`) MUST be either declared
// or whitelisted, or the test fails. This forces explicit declaration when
// new payroll tables are added.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const MANIFEST_PATH = join(
  process.cwd(),
  "tests",
  "security",
  "role-write-matrix.json"
);

const ENFORCED_PREFIXES = ["schedule_payroll_", "payroll_venue_branding"];

type WriteAction = "INSERT" | "UPDATE" | "DELETE" | "ALL";

interface ManifestEntry {
  table: string;
  writers: {
    default: string[];
    lock_transitions?: string[];
  };
  lock_state_column?: string;
  lock_state_values?: string[];
}

interface Manifest {
  tables: ManifestEntry[];
}

interface PolicyBlock {
  file: string;
  policyName: string;
  table: string;
  action: WriteAction;
  body: string;
}

function loadManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed = JSON.parse(raw) as Manifest;
  return parsed;
}

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}

function extractWritePolicies(file: string, sql: string): PolicyBlock[] {
  const out: PolicyBlock[] = [];
  // Match `CREATE POLICY "<name>" ON public.<table> FOR <action> ... ;`
  const re =
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)\s+FOR\s+(INSERT|UPDATE|DELETE|ALL)\b([\s\S]*?);/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    out.push({
      file,
      policyName: match[1],
      table: match[2],
      action: match[3].toUpperCase() as WriteAction,
      body: match[4],
    });
  }
  return out;
}

/**
 * Extracts the role names referenced via get_staff_role() in a policy body.
 * Handles both `get_staff_role() = 'owner'` and
 * `get_staff_role() IN ('manager', 'owner')` (with optional `public.` prefix
 * and any whitespace).
 */
function extractRoles(body: string): Set<string> {
  const roles = new Set<string>();

  // `get_staff_role() IN ( 'a', 'b', ... )`
  const inRe =
    /get_staff_role\s*\(\s*\)\s*IN\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = inRe.exec(body))) {
    const inner = m[1];
    const roleRe = /'([a-zA-Z_]+)'/g;
    let r: RegExpExecArray | null;
    while ((r = roleRe.exec(inner))) {
      roles.add(r[1]);
    }
  }

  // `get_staff_role() = 'role'` (and `<>` / `!=`)
  const eqRe =
    /get_staff_role\s*\(\s*\)\s*=\s*'([a-zA-Z_]+)'/gi;
  while ((m = eqRe.exec(body))) {
    roles.add(m[1]);
  }

  return roles;
}

/** True when the body's USING/CHECK clause restricts to the declared lock states. */
function policyTouchesLockStates(
  body: string,
  column: string,
  values: string[]
): boolean {
  // Look for `column IN ('locked', ...)` or `column = 'locked'` referencing
  // any of the configured lock-state values.
  for (const value of values) {
    const eq = new RegExp(`${column}\\s*=\\s*'${value}'`, "i");
    if (eq.test(body)) return true;
  }
  // IN-list shape — match the whole list and look for at least one value.
  const inRe = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, "i");
  const m = inRe.exec(body);
  if (m) {
    const inner = m[1];
    for (const value of values) {
      if (new RegExp(`'${value}'`).test(inner)) return true;
    }
  }
  return false;
}

describe("Role write-matrix guard", () => {
  it("manifest is well-formed and non-empty", () => {
    const manifest = loadManifest();
    expect(manifest.tables.length).toBeGreaterThan(0);
    for (const entry of manifest.tables) {
      expect(entry.writers.default.length).toBeGreaterThan(0);
    }
  });

  it("every WRITE policy on declared tables matches the expected role set", () => {
    const manifest = loadManifest();
    const declaredTables = new Set(manifest.tables.map((t) => t.table));
    const files = getMigrationFiles();

    const allWrites: PolicyBlock[] = [];
    for (const f of files) {
      const sql = readFileSync(f, "utf8");
      allWrites.push(...extractWritePolicies(f, sql));
    }

    // Every write policy on a `schedule_payroll_*` table must be declared.
    const enforcedWrites = allWrites.filter((p) =>
      ENFORCED_PREFIXES.some((prefix) => p.table.startsWith(prefix))
    );
    const undeclared = enforcedWrites
      .filter((p) => !declaredTables.has(p.table))
      .map((p) => `${p.table} :: "${p.policyName}"`);
    expect(
      undeclared,
      `Undeclared write policies on enforced tables — add them to role-write-matrix.json:\n  ${undeclared.join("\n  ")}`
    ).toEqual([]);

    // Per-table: the union of policy role sets matches the manifest.
    const violations: string[] = [];
    for (const entry of manifest.tables) {
      const tableWrites = enforcedWrites.filter(
        (p) => p.table === entry.table
      );

      // Partition by lock-state-aware vs default branches.
      const lockColumn = entry.lock_state_column;
      const lockValues = entry.lock_state_values ?? [];

      const defaultWrites: PolicyBlock[] = [];
      const lockWrites: PolicyBlock[] = [];
      for (const p of tableWrites) {
        if (
          lockColumn &&
          policyTouchesLockStates(p.body, lockColumn, lockValues)
        ) {
          lockWrites.push(p);
        } else {
          defaultWrites.push(p);
        }
      }

      // Default-branch role union.
      const observedDefault = new Set<string>();
      for (const p of defaultWrites) {
        for (const r of extractRoles(p.body)) observedDefault.add(r);
      }
      const expectedDefault = new Set(entry.writers.default);
      if (!setsEqual(observedDefault, expectedDefault)) {
        violations.push(
          `${entry.table} (default writers): expected {${[...expectedDefault].sort().join(",")}} but RLS allows {${[...observedDefault].sort().join(",")}}`
        );
      }

      // Lock-transition branch (only when declared).
      if (entry.writers.lock_transitions) {
        const observedLock = new Set<string>();
        for (const p of lockWrites) {
          for (const r of extractRoles(p.body)) observedLock.add(r);
        }
        const expectedLock = new Set(entry.writers.lock_transitions);
        if (!setsEqual(observedLock, expectedLock)) {
          violations.push(
            `${entry.table} (lock-transition writers): expected {${[...expectedLock].sort().join(",")}} but RLS allows {${[...observedLock].sort().join(",")}}`
          );
        }
      } else if (lockWrites.length > 0) {
        // Found a status-aware policy without a declaration — must be opted into.
        violations.push(
          `${entry.table} has a lock-state-aware write policy ("${lockWrites[0].policyName}") but no writers.lock_transitions declared in the manifest`
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `role-write-matrix violations:\n  ${violations.join("\n  ")}\n\n` +
          `Either tighten the policy to match the manifest or update the manifest after a deliberate review.`
      );
    }
    expect(violations).toEqual([]);
  });
});

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
