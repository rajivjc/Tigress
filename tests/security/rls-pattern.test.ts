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
// S27a-fix-2 strengthening: the original check passed when get_staff_role()
// appeared *anywhere* in the body. The actual bug shape is an OR-chain
// where one branch references get_staff_role() but another is a bare
// equality — that bare branch leaks. This file now splits each clause on
// top-level OR (respecting parenthesis depth) and asserts every operand
// references get_staff_role().
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

/**
 * Extract the body of the first USING(...) or WITH CHECK(...) clause
 * encountered in `policyBody`. Tracks paren depth so the result captures
 * only the clause's parenthesised expression and not the trailing tail
 * of the CREATE POLICY statement. Returns null when the keyword is absent.
 */
export function extractClauseBody(
  policyBody: string,
  keyword: "USING" | "WITH CHECK"
): string | null {
  // Match the keyword followed by optional whitespace then `(`. Use a regex
  // to find the keyword position; from there, walk char-by-char respecting
  // string literals to find the matching close paren.
  const re =
    keyword === "USING"
      ? /\bUSING\s*\(/gi
      : /\bWITH\s+CHECK\s*\(/gi;
  const match = re.exec(policyBody);
  if (!match) return null;
  const openIdx = match.index + match[0].length - 1; // position of the `(`
  // Walk to find the matching close paren.
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = openIdx; i < policyBody.length; i++) {
    const ch = policyBody[i];
    const prev = i > 0 ? policyBody[i - 1] : "";
    if (inSingle) {
      if (ch === "'" && prev !== "\\") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== "\\") inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        return policyBody.slice(openIdx + 1, i);
      }
    }
  }
  return null;
}

/**
 * Split `clauseBody` on top-level `OR` (case-insensitive), respecting
 * parenthesis depth and string literals so nested ORs aren't split.
 * Returns the trimmed operand strings.
 */
export function splitTopLevelOr(clauseBody: string): string[] {
  const operands: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let cursor = 0;
  // Tokenize manually: scan for the literal `OR` only when depth === 0
  // and not inside a string literal. We require word-boundary so `FOR` /
  // `WORD` etc. don't trigger.
  for (let i = 0; i <= clauseBody.length - 2; i++) {
    const ch = clauseBody[i];
    const prev = i > 0 ? clauseBody[i - 1] : "";
    if (inSingle) {
      if (ch === "'" && prev !== "\\") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && prev !== "\\") inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    // Word-boundary `OR` check.
    const two = clauseBody.slice(i, i + 2);
    if (two !== "OR" && two !== "or" && two !== "Or" && two !== "oR") continue;
    const before = i === 0 ? " " : clauseBody[i - 1];
    const after = i + 2 < clauseBody.length ? clauseBody[i + 2] : " ";
    if (/[A-Za-z0-9_]/.test(before)) continue;
    if (/[A-Za-z0-9_]/.test(after)) continue;
    operands.push(clauseBody.slice(cursor, i).trim());
    cursor = i + 2;
    i += 1; // skip past the second `R`
  }
  operands.push(clauseBody.slice(cursor).trim());
  return operands.filter((s) => s.length > 0);
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

  it("every CREATE POLICY clause references public.get_staff_role() on every top-level OR-branch (or has an allow-list marker)", () => {
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
        const inlineAllowed = block.precedingComments.some((c) =>
          /-- *rls-allow:/i.test(c)
        );
        const fileAllowed = allowlist.has(
          `${fileShort}::${block.policyName}`
        );
        if (inlineAllowed || fileAllowed) continue;

        // Per-OR-branch check on USING and WITH CHECK clauses.
        for (const keyword of ["USING", "WITH CHECK"] as const) {
          const body = extractClauseBody(block.body, keyword);
          if (body === null) continue;
          const operands = splitTopLevelOr(body);
          for (const operand of operands) {
            if (!/public\.get_staff_role\s*\(/i.test(operand)) {
              const snippet = operand.replace(/\s+/g, " ").trim().slice(0, 80);
              violations.push({
                file: fileShort,
                policy: block.policyName,
                reason: `${keyword} OR-branch missing public.get_staff_role() reference: "${snippet}${
                  operand.length > 80 ? "..." : ""
                }"`,
              });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file} :: "${v.policy}" — ${v.reason}`)
        .join("\n");
      throw new Error(
        `RLS NULL-coalescence rule violations found:\n${formatted}\n\n` +
          `Wrap EVERY top-level OR-branch in public.get_staff_role() ` +
          `IN (...) or add the inline marker '-- rls-allow: <reason>' ` +
          `on the line immediately above the CREATE POLICY.`
      );
    }
    expect(violations).toEqual([]);
  });
});
