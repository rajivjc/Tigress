// =============================================================================
// Competitions — Player adapter (Session 21)
// =============================================================================
// The ONLY file in the module that imports identity from the rest of Tigress.
// Every other competition file works with `Player` and `PlayerRef`, never
// raw `Member` / `Staff` / `auth.users`.
//
// Why this matters: if the module is extracted into a standalone product,
// this file is where the rewrite happens. Replace Supabase auth + Tigress
// members / staff lookups with the new host's equivalents and everything
// downstream works unchanged.
// =============================================================================

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_ACCOUNTS, MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { MOCK_MEMBERS } from "@/lib/data/mock-data";
import type { Member, Staff, StaffRole } from "@/lib/types";
import type { Player, PlayerRef } from "../types";
import { MOCK_COMP_GUESTS, MOCK_COMP_PLAYER_SKILLS } from "./mock-data";

// ---------------------------------------------------------------------------
// Current-user resolver
// ---------------------------------------------------------------------------

/**
 * Returns the signed-in user as a Player, or null if not signed in. Mirrors
 * the host app's resolution order: staff table first, members table second.
 */
export async function getCurrentPlayer(): Promise<Player | null> {
  if (!isSupabaseConfigured()) {
    const authId = cookies().get(MOCK_SESSION_COOKIE)?.value;
    if (!authId) return null;
    const account = MOCK_ACCOUNTS.find((a) => a.user.id === authId);
    if (!account) return null;

    if (account.role === "member") {
      const member = account.profile as Member;
      return memberToPlayerFromMock(member);
    }

    const staff = account.profile as Staff;
    return staffToPlayer(staff);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Try staff first.
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (staffRow) {
    const s = staffRow as Pick<Staff, "id" | "full_name" | "role">;
    return {
      kind: "staff",
      id: s.id,
      displayName: s.full_name,
      skillLevel: null,
      role: s.role,
    };
  }

  const { data: memberRow } = await supabase
    .from("members")
    .select("id, full_name, avatar_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!memberRow) return null;
  const m = memberRow as Pick<Member, "id" | "full_name" | "avatar_url">;
  const skillLevel = await fetchSkillLevelReal(supabase, m.id);
  return {
    kind: "member",
    id: m.id,
    displayName: m.full_name,
    skillLevel,
    avatarUrl: m.avatar_url,
  };
}

// ---------------------------------------------------------------------------
// Single / batch lookup by PlayerRef
// ---------------------------------------------------------------------------

export async function getPlayerById(ref: PlayerRef): Promise<Player | null> {
  if (!isSupabaseConfigured()) {
    return lookupMockPlayer(ref);
  }

  const supabase = createClient();

  if (ref.kind === "member") {
    const { data } = await supabase
      .from("members")
      .select("id, full_name, avatar_url")
      .eq("id", ref.id)
      .maybeSingle();
    if (!data) return null;
    const m = data as Pick<Member, "id" | "full_name" | "avatar_url">;
    const skillLevel = await fetchSkillLevelReal(supabase, m.id);
    return {
      kind: "member",
      id: m.id,
      displayName: m.full_name,
      skillLevel,
      avatarUrl: m.avatar_url,
    };
  }

  if (ref.kind === "staff") {
    const { data } = await supabase
      .from("staff")
      .select("id, full_name, role")
      .eq("id", ref.id)
      .maybeSingle();
    if (!data) return null;
    const s = data as Pick<Staff, "id" | "full_name" | "role">;
    return {
      kind: "staff",
      id: s.id,
      displayName: s.full_name,
      skillLevel: null,
      role: s.role,
    };
  }

  const { data } = await supabase
    .from("comp_guests")
    .select("id, display_name, is_paying, archived_at")
    .eq("id", ref.id)
    .maybeSingle();
  if (!data) return null;
  const g = data as {
    id: string;
    display_name: string;
    is_paying: boolean;
    archived_at: string | null;
  };
  return {
    kind: "guest",
    id: g.id,
    displayName: g.display_name,
    skillLevel: null,
    isPaying: g.is_paying,
  };
}

/**
 * Returns the current Player plus a convenience flag that server actions
 * use for manager/owner gating. Centralised here so the rest of the
 * module never has to ask the host app "what role is this user?" — the
 * answer is already embedded in the staff variant of Player.
 */
export interface CurrentActor {
  player: Player;
  isManagerOrOwner: boolean;
  isStaff: boolean;
}

export async function getCurrentActor(): Promise<CurrentActor | null> {
  const player = await getCurrentPlayer();
  if (!player) return null;
  const isStaff = player.kind === "staff";
  const isManagerOrOwner =
    player.kind === "staff" &&
    (player.role === "manager" || player.role === "owner");
  return { player, isStaff, isManagerOrOwner };
}

/**
 * Batch resolver keyed by `<kind>:<id>` so list views can render large
 * entrant lists without N+1 queries.
 */
export async function getPlayersByRefs(
  refs: PlayerRef[]
): Promise<Map<string, Player>> {
  const out = new Map<string, Player>();
  if (refs.length === 0) return out;

  // Deduplicate
  const seen = new Set<string>();
  const unique: PlayerRef[] = [];
  for (const r of refs) {
    const k = `${r.kind}:${r.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(r);
    }
  }

  if (!isSupabaseConfigured()) {
    for (const r of unique) {
      const p = lookupMockPlayer(r);
      if (p) out.set(`${r.kind}:${r.id}`, p);
    }
    return out;
  }

  const supabase = createClient();
  const memberIds = unique.filter((r) => r.kind === "member").map((r) => r.id);
  const staffIds = unique.filter((r) => r.kind === "staff").map((r) => r.id);
  const guestIds = unique.filter((r) => r.kind === "guest").map((r) => r.id);

  if (memberIds.length > 0) {
    const { data } = await supabase
      .from("members")
      .select("id, full_name, avatar_url")
      .in("id", memberIds);
    const { data: skills } = await supabase
      .from("comp_player_skills")
      .select("member_id, skill_level")
      .in("member_id", memberIds);
    const skillMap = new Map<string, number>(
      ((skills as { member_id: string; skill_level: number }[] | null) ?? []).map(
        (s) => [s.member_id, s.skill_level]
      )
    );
    for (const row of (data as Pick<Member, "id" | "full_name" | "avatar_url">[] | null) ?? []) {
      out.set(`member:${row.id}`, {
        kind: "member",
        id: row.id,
        displayName: row.full_name,
        skillLevel: skillMap.get(row.id) ?? null,
        avatarUrl: row.avatar_url,
      });
    }
  }

  if (staffIds.length > 0) {
    const { data } = await supabase
      .from("staff")
      .select("id, full_name, role")
      .in("id", staffIds);
    for (const row of (data as Pick<Staff, "id" | "full_name" | "role">[] | null) ?? []) {
      out.set(`staff:${row.id}`, {
        kind: "staff",
        id: row.id,
        displayName: row.full_name,
        skillLevel: null,
        role: row.role,
      });
    }
  }

  if (guestIds.length > 0) {
    const { data } = await supabase
      .from("comp_guests")
      .select("id, display_name, is_paying")
      .in("id", guestIds);
    for (const row of (data as {
      id: string;
      display_name: string;
      is_paying: boolean;
    }[] | null) ?? []) {
      out.set(`guest:${row.id}`, {
        kind: "guest",
        id: row.id,
        displayName: row.display_name,
        skillLevel: null,
        isPaying: row.is_paying,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Eligible-player list (drives the Add Entrant picker)
// ---------------------------------------------------------------------------

export interface ListEligiblePlayersOpts {
  includeMembers?: boolean;
  /** Which guests to include. "none" = members only. */
  includeGuests?: "none" | "invited" | "paying" | "both";
  /** Substring match on display name (case-insensitive). */
  search?: string;
}

export async function listEligiblePlayers(
  opts: ListEligiblePlayersOpts = {}
): Promise<Player[]> {
  const includeMembers = opts.includeMembers ?? true;
  const includeGuests = opts.includeGuests ?? "none";
  const term = (opts.search ?? "").trim().toLowerCase();

  if (!isSupabaseConfigured()) {
    const results: Player[] = [];

    if (includeMembers) {
      const skillMap = new Map<string, number>(
        MOCK_COMP_PLAYER_SKILLS.map((s) => [s.member_id, s.skill_level])
      );
      for (const m of MOCK_MEMBERS) {
        if (m.status !== "active") continue;
        if (term && !m.full_name.toLowerCase().includes(term)) continue;
        results.push({
          kind: "member",
          id: m.id,
          displayName: m.full_name,
          skillLevel: skillMap.get(m.id) ?? null,
          avatarUrl: m.avatar_url,
        });
      }
    }

    if (includeGuests !== "none") {
      for (const g of MOCK_COMP_GUESTS) {
        if (g.archived_at !== null) continue;
        if (includeGuests === "invited" && g.is_paying) continue;
        if (includeGuests === "paying" && !g.is_paying) continue;
        if (term && !g.display_name.toLowerCase().includes(term)) continue;
        results.push({
          kind: "guest",
          id: g.id,
          displayName: g.display_name,
          skillLevel: null,
          isPaying: g.is_paying,
        });
      }
    }

    return results.sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }

  const supabase = createClient();
  const results: Player[] = [];

  if (includeMembers) {
    let query = supabase
      .from("members")
      .select("id, full_name, avatar_url")
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .limit(200);
    if (term) {
      const safe = term.replace(/[^a-z0-9@.\-_\s]/gi, "").replace(/[%_\\]/g, "\\$&");
      if (safe.length > 0) query = query.ilike("full_name", `%${safe}%`);
    }
    const { data } = await query;
    const rows = (data as Pick<Member, "id" | "full_name" | "avatar_url">[] | null) ?? [];
    const memberIds = rows.map((r) => r.id);
    const { data: skills } = await supabase
      .from("comp_player_skills")
      .select("member_id, skill_level")
      .in("member_id", memberIds);
    const skillMap = new Map<string, number>(
      ((skills as { member_id: string; skill_level: number }[] | null) ?? []).map(
        (s) => [s.member_id, s.skill_level]
      )
    );
    for (const r of rows) {
      results.push({
        kind: "member",
        id: r.id,
        displayName: r.full_name,
        skillLevel: skillMap.get(r.id) ?? null,
        avatarUrl: r.avatar_url,
      });
    }
  }

  if (includeGuests !== "none") {
    let query = supabase
      .from("comp_guests")
      .select("id, display_name, is_paying")
      .is("archived_at", null)
      .order("display_name", { ascending: true });

    if (includeGuests === "invited") query = query.eq("is_paying", false);
    if (includeGuests === "paying") query = query.eq("is_paying", true);
    if (term) {
      const safe = term.replace(/[^a-z0-9@.\-_\s]/gi, "").replace(/[%_\\]/g, "\\$&");
      if (safe.length > 0) query = query.ilike("display_name", `%${safe}%`);
    }
    const { data } = await query;
    for (const r of (data as { id: string; display_name: string; is_paying: boolean }[] | null) ?? []) {
      results.push({
        kind: "guest",
        id: r.id,
        displayName: r.display_name,
        skillLevel: null,
        isPaying: r.is_paying,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entrant column <-> PlayerRef translation
// ---------------------------------------------------------------------------

export type EntrantRef = PlayerRef | { kind: "team"; id: string };

export function entrantRowToPlayerRef(row: {
  entrant_member_id: string | null;
  entrant_guest_id: string | null;
  entrant_team_id: string | null;
}): EntrantRef | null {
  if (row.entrant_member_id) return { kind: "member", id: row.entrant_member_id };
  if (row.entrant_guest_id) return { kind: "guest", id: row.entrant_guest_id };
  if (row.entrant_team_id) return { kind: "team", id: row.entrant_team_id };
  return null;
}

export function playerRefToEntrantColumns(ref: EntrantRef): {
  entrant_member_id: string | null;
  entrant_guest_id: string | null;
  entrant_team_id: string | null;
} {
  return {
    entrant_member_id: ref.kind === "member" ? ref.id : null,
    entrant_guest_id: ref.kind === "guest" ? ref.id : null,
    entrant_team_id: ref.kind === "team" ? ref.id : null,
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function memberToPlayerFromMock(member: Member): Player {
  const skill = MOCK_COMP_PLAYER_SKILLS.find((s) => s.member_id === member.id);
  return {
    kind: "member",
    id: member.id,
    displayName: member.full_name,
    skillLevel: skill?.skill_level ?? null,
    avatarUrl: member.avatar_url,
  };
}

function staffToPlayer(staff: Staff): Player {
  return {
    kind: "staff",
    id: staff.id,
    displayName: staff.full_name,
    skillLevel: null,
    role: staff.role as StaffRole,
  };
}

function lookupMockPlayer(ref: PlayerRef): Player | null {
  if (ref.kind === "member") {
    const m = MOCK_MEMBERS.find((row) => row.id === ref.id);
    return m ? memberToPlayerFromMock(m) : null;
  }
  if (ref.kind === "staff") {
    const account = MOCK_ACCOUNTS.find(
      (a) => a.role !== "member" && (a.profile as Staff).id === ref.id
    );
    return account ? staffToPlayer(account.profile as Staff) : null;
  }
  const g = MOCK_COMP_GUESTS.find((row) => row.id === ref.id);
  if (!g) return null;
  return {
    kind: "guest",
    id: g.id,
    displayName: g.display_name,
    skillLevel: null,
    isPaying: g.is_paying,
  };
}

async function fetchSkillLevelReal(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("comp_player_skills")
    .select("skill_level")
    .eq("member_id", memberId)
    .maybeSingle();
  if (!data) return null;
  return (data as { skill_level: number }).skill_level;
}
