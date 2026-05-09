// =============================================================================
// RLS pattern guard
// =============================================================================
// Reads every supabase/migrations/*.sql file, finds each CREATE POLICY block,
// and asserts the USING/WITH CHECK clauses reference public.get_staff_role().
//
// Why this exists: a bare equality like `kind = 'giveaway'` evaluates TRUE
// for any auth user regardless of role, so members can read staff-only rows
// when get_staff_role() returns NULL. Two consecutive sessions (S25, S26)
// shipped policies with this bug. This grep guard fails CI before the
// pattern can recur.
//
// Allow-list:
//   * the legacy allowlist file `tests/security/rls-allowlist.json` exempts
//     pre-S27a policies that intentionally don't reference get_staff_role()
//     (e.g. competition data readable by everyone, self-only via auth.uid()).
//     Do NOT add new policies to that file.
//   * a `-- rls-allow: <reason>` comment on the line immediately preceding
//     the CREATE POLICY also exempts it.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const ALLOWLIST_PATH = join(
  process.cwd(),
  "tests",
  "security",
  "rls-allowlist.json"
);

interface AllowlistEntry {
  file: string;
  policy: string;
  reason: string;
}

interface AllowlistFile {
  exemptPolicies: AllowlistEntry[];
}

interface PolicyBlock {
  file: string;
  policyName: string;
  body: string;
  precedingComments: string[];
}

function extractPolicyBlocks(file: string, sql: string): PolicyBlock[] {
  const out: PolicyBlock[] = [];
  // Match `CREATE POLICY "<name>" ON ... ;` greedy through the next semicolon.
  const re =
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+[^\s]+\s+([\s\S]*?);/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const policyName = match[1];
    const body = match[2];
    const startOffset = match.index;
    const pre = sql.slice(0, startOffset);
    const lines = pre.split("\n");
    const precedingComments: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line === "") continue;
      if (line.startsWith("--")) {
        precedingComments.unshift(line);
        continue;
      }
      break;
    }
    out.push({ file, policyName, body, precedingComments });
  }
  return out;
}

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}

function loadAllowlist(): Set<string> {
  const raw = readFileSync(ALLOWLIST_PATH, "utf8");
  const parsed = JSON.parse(raw) as AllowlistFile;
  return new Set(
    parsed.exemptPolicies.map((e) => `${e.file}::${e.policy}`)
  );
}

describe("RLS NULL-coalescence pattern guard", () => {
  it("finds at least one policy in the migrations", () => {
    const files = getMigrationFiles();
    let total = 0;
    for (const f of files) {
      const sql = readFileSync(f, "utf8");
      total += extractPolicyBlocks(f, sql).length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it("every CREATE POLICY clause references public.get_staff_role() or has an allow-list marker", () => {
    const allowlist = loadAllowlist();
    const files = getMigrationFiles();
    const violations: Array<{
      file: string;
      policy: string;
      reason: string;
    }> = [];

    for (const f of files) {
      const sql = readFileSync(f, "utf8");
      const blocks = extractPolicyBlocks(f, sql);
      for (const block of blocks) {
        const fileShort = basename(f);
        // Inline marker exemption.
        const inlineAllowed = block.precedingComments.some((c) =>
          /-- *rls-allow:/i.test(c)
        );
        // Allow-list file exemption.
        const fileAllowed = allowlist.has(
          `${fileShort}::${block.policyName}`
        );
        if (inlineAllowed || fileAllowed) continue;

        if (!/public\.get_staff_role\s*\(/i.test(block.body)) {
          violations.push({
            file: fileShort,
            policy: block.policyName,
            reason: "missing public.get_staff_role() reference",
          });
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file} :: "${v.policy}" — ${v.reason}`)
        .join("\n");
      throw new Error(
        `RLS NULL-coalescence rule violations found:\n${formatted}\n\n` +
          `Wrap the USING/WITH CHECK clause in public.get_staff_role() ` +
          `IN (...) or add the inline marker '-- rls-allow: <reason>' ` +
          `on the line immediately above the CREATE POLICY.`
      );
    }
    expect(violations).toEqual([]);
  });
});
