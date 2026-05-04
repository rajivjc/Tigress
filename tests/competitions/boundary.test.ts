import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// =============================================================================
// Competitions module boundary test
// =============================================================================
// Walks the source tree and asserts the two invariants that keep the module
// extractable:
//
//   1. Nothing OUTSIDE src/competitions/ imports FROM inside, except a
//      whitelisted set of integration points (route pages in
//      (owner)/competitions/, the nav entry in StaffSidebar.tsx, and tests
//      under tests/competitions/).
//   2. Nothing INSIDE src/competitions/ imports FROM outside, except a
//      whitelisted set of hosts (the Player adapter file, the audit
//      wrapper, shared primitives).
//
// When this test fails, read the error message and either (a) remove the
// stray import, or (b) document why a new exception is warranted and add
// it to the whitelist below.
// =============================================================================

const REPO_ROOT = join(__dirname, "..", "..");
const SRC_DIR = join(REPO_ROOT, "src");
const TEST_DIR = join(REPO_ROOT, "tests");
const COMP_PREFIX = "src/competitions/";

// Files OUTSIDE src/competitions/ that are allowed to import from it.
const OUTSIDE_ALLOWLIST = [
  // S22: /competitions moved into (community) so members + staff + owner
  // share a single URL. Internal role checks gate the write actions.
  /^src\/app\/\(community\)\/competitions\//,
  // S23: owner-facing league admin + the league listing page.
  /^src\/app\/\(community\)\/leagues\//,
  /^src\/components\/ui\/StaffSidebar\.tsx$/,
  // Test infrastructure clones module-owned mock arrays so resetMockData()
  // can restore them between tests. Not production code — wouldn't travel
  // with an extraction.
  /^tests\/helpers\/reset-mock-data\.ts$/,
];

// Host modules that files INSIDE src/competitions/ may import from. Matched
// against the full "@/" alias string that appears in the import.
const INSIDE_HOST_ALLOWLIST = [
  "server-only",
  "next/headers",
  "next/cache",
  "next/navigation",
  "@/lib/supabase/env",
  "@/lib/supabase/server",
  "@/lib/supabase/admin",
  "@/lib/timezone",
  "@/lib/types",
  "@/lib/format",
];

// Files INSIDE src/competitions/ that are specifically allowed to import
// from any host location (the three adapter files).
const INSIDE_ADAPTER_FILES = [
  "src/competitions/data/players.ts",
  "src/competitions/audit.ts",
  "src/competitions/events.ts",
];

// Additional @/ imports permitted only in the adapter files above.
const ADAPTER_HOST_EXTRA = [
  "@/lib/data/members",
  "@/lib/data/staff",
  "@/lib/auth/mock-users",
  "@/lib/data/mock-data",
];

// ---------- Helpers ----------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

function extractImports(content: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /^[ \t]*import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm,
    /^[ \t]*import\(['"]([^'"]+)['"]\)/gm,
    /require\(['"]([^'"]+)['"]\)/g,
    /await\s+import\(['"]([^'"]+)['"]\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      specifiers.push(m[1]!);
    }
  }
  return specifiers;
}

function isHostAllowed(spec: string): boolean {
  if (INSIDE_HOST_ALLOWLIST.includes(spec)) return true;
  // Relative imports inside the module are fine.
  if (spec.startsWith(".")) return true;
  // Any non-@/ absolute (package-style) import is a third-party package,
  // which is allowed.
  if (!spec.startsWith("@/")) return true;
  return false;
}

function specifierPointsIntoComp(spec: string): boolean {
  return spec.startsWith("@/competitions") || spec.includes("/src/competitions/");
}

describe("competitions module boundary", () => {
  it("outside files do not import from src/competitions/ unless whitelisted", () => {
    const srcFiles = walk(SRC_DIR);
    const testFiles = walk(TEST_DIR);
    const offenders: string[] = [];

    for (const file of [...srcFiles, ...testFiles]) {
      const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
      if (rel.startsWith(COMP_PREFIX)) continue;
      if (rel.startsWith("tests/competitions/")) continue;

      const content = readFileSync(file, "utf-8");
      const imports = extractImports(content);

      for (const spec of imports) {
        if (!specifierPointsIntoComp(spec)) continue;
        const permitted = OUTSIDE_ALLOWLIST.some((re) => re.test(rel));
        if (!permitted) {
          offenders.push(`${rel}  →  ${spec}`);
        }
      }
    }

    expect(offenders, "Unexpected imports into src/competitions/").toEqual([]);
  });

  it("inside files do not import host code unless whitelisted", () => {
    const srcFiles = walk(SRC_DIR);
    const offenders: string[] = [];

    for (const file of srcFiles) {
      const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
      if (!rel.startsWith(COMP_PREFIX)) continue;

      const isAdapter = INSIDE_ADAPTER_FILES.includes(rel);
      const content = readFileSync(file, "utf-8");
      const imports = extractImports(content);

      for (const spec of imports) {
        if (isHostAllowed(spec)) continue;
        if (isAdapter && ADAPTER_HOST_EXTRA.includes(spec)) continue;
        if (spec.startsWith("@/") && !spec.startsWith("@/competitions")) {
          offenders.push(`${rel}  →  ${spec}`);
        }
      }
    }

    expect(offenders, "Unexpected host imports from inside src/competitions/").toEqual([]);
  });
});
