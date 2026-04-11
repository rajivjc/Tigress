# Tigress — CLAUDE.md

## Project overview
Club management platform for a billiards venue in Singapore. NOT a POS — sits alongside Qashier (POS) and Stripe (billing) as the operational and community hub.

## Tech stack
- Next.js 14.2.15 (App Router, Server Actions, `src/app/` with route groups)
- TypeScript strict mode
- Tailwind CSS (dark theme, mobile-first)
- Supabase (Postgres, Auth, Realtime) — Singapore region
- Stripe webhooks for subscription sync
- Vercel hosting

## Architecture patterns
- **Dual-mode data layer:** Every function in `src/lib/data/` checks `isSupabaseConfigured()` and branches to mock or real. Both paths must stay in sync.
- **Server Actions pattern:** authenticate → authorize → validate → call data function → revalidate paths → return `{ success, error? }`.
- **Role hierarchy:** member < staff < manager < owner. Each inherits permissions below.
- **Auth resolution:** staff table first (returns staff/manager/owner), then members table (returns member). Orphan = sign out.
- **Timezone:** All date logic uses helpers from `src/lib/timezone.ts`. Never use raw `new Date()` for date boundaries. Venue is UTC+8 (Singapore).

## Key conventions
- All data files import `"server-only"` — never import from client components.
- Snake_case for DB column names / TypeScript fields (matches Supabase response shape).
- Mock data lives in `src/lib/data/mock-data.ts`. Mutations in mock mode modify arrays in-place.
- Server actions live in `src/app/actions/` — one file per domain.
- Route groups: `(auth)/` public, `(member)/` all roles, `(staff)/` staff+, `(owner)/` owner only.

## Database
- 10 tables, 30+ RLS policies, 3 migrations in `supabase/migrations/`.
- Credit operations use atomic RPCs (`deduct_credits`, `refund_credits`) with row-level locks.
- `members INSERT` RLS only allows manager/owner — self-registration uses service role via API route.

## Environment
- Mock mode activates when Supabase env vars are missing/placeholder.
- Test accounts: member/staff/manager/owner @tigress.test, password: "password".
- Vercel runs in UTC — all SGT conversion must go through timezone helpers.

## Development workflow
- One feature scope per Claude Code session.
- Audit after each session before moving forward.
- All audit fixes go into the next session prompt.
- Mock mode maintained throughout — every feature must work without Supabase.
