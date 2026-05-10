# Tigress — Project Handover Document

## Last updated: April 2026, after Session 9 prompt drafted (Session 9 not yet executed)

-----

## 1. What Tigress Is

Tigress is a club management platform for a bar and billiards venue in Singapore. It is NOT a POS or payment system. It sits alongside **Qashier** (POS, handles transactions at the bar) and **Stripe** (membership billing, collects monthly subscriptions) as the **operational and community hub** for the club.

**Three audiences, three experiences:**

- **Members (~30):** Book tables using monthly credits, invite friends to sessions, manage their profile
- **Staff (2 FT + 4 PT):** View floorplan, record walk-ins, check calendar, look up members
- **Manager (1) + Owners (2):** Block tables for events, manage scheduling, configure tiers/rates, handle payroll (Phase 3)

**The venue:** 7 identical pool tables, open 10:00–midnight, located in Singapore.

-----

## 2. Tech Stack

|Layer    |Technology                              |Notes                                             |
|---------|----------------------------------------|--------------------------------------------------|
|Framework|Next.js 14 (App Router, Server Actions) |`src/app/` uses route groups for role separation  |
|Language |TypeScript                              |Strict mode                                       |
|Styling  |Tailwind CSS                            |Dark theme, mobile-first                          |
|Database |Supabase (Postgres)                     |Singapore region, Row Level Security on all tables|
|Auth     |Supabase Auth                           |Email/password, no social login                   |
|Payments |Stripe (external)                       |Webhooks for subscription sync only               |
|Hosting  |Vercel                                  |Production at tigress.vercel.app                  |
|Real-time|Supabase Realtime + 30s polling fallback|Floorplan live updates                            |

-----

## 3. Repo & Deployment

- **Repo:** https://github.com/rajivjc/Tigress
- **Production:** https://tigress.vercel.app
- **Supabase project:** Singapore region (ap-southeast-1)
- **Branch strategy:** Single `main` branch, direct push

-----

## 4. Architecture Overview

### Route Groups (role-based)

```
src/app/
  (auth)/        → login, register, forgot-password (public)
  (member)/      → dashboard, book, bookings, bookings/[id], profile, invites
  (staff)/       → floor, calendar, walk-in, members, members/[id], members/new, block
  (owner)/       → settings, rates
  actions/       → Server actions (one file per domain)
  api/
    auth/register/       → Member self-registration (admin client)
    webhooks/stripe/     → Stripe webhook receiver
```

### Auth & Role System

- **AuthProvider** (`src/lib/auth/AuthProvider.tsx`) — client-side context, dual-mode (Supabase or mock)
- **RouteGuard** (`src/components/auth/RouteGuard.tsx`) — wraps each layout, checks `allowedRoles`
- **Role hierarchy:** member < staff < manager < owner (each inherits permissions of roles below)
- **Role resolution:** on login, checks `staff` table first (returns staff/manager/owner), then `members` table (returns member). If neither exists, signs out (orphan auth user).
- **Mock mode:** activates when Supabase env vars are missing/placeholder. Uses hardcoded test accounts in `src/lib/auth/mock-users.ts`. Sessions stored in localStorage + cookie.

### Data Layer Pattern

Every domain has a data file in `src/lib/data/`:

```
bookings.ts, blocks.ts, calendar.ts, invites.ts,
members.ts, mock-data.ts, settings.ts, staff.ts, tables.ts
```

**Every function follows this pattern:**

```ts
export async function doSomething(): Promise<Result> {
  if (!isSupabaseConfigured()) {
    return doSomethingMock();  // in-memory mock data
  }
  return doSomethingReal();    // Supabase client
}
```

All data files import `"server-only"` — they cannot be imported from client components.

### Server Actions Pattern

Every action in `src/app/actions/` follows:

1. Authenticate (get current user/member/staff)
1. Authorize (check role)
1. Validate inputs
1. Call data function
1. Revalidate affected paths
1. Return `{ success, error? }`

### Timezone

The venue is in Singapore (UTC+8). All server-side date logic uses helpers from `src/lib/timezone.ts`:

- `todaySGT()` — current date in YYYY-MM-DD
- `startOfDaySGT(dateStr)` — midnight of a given date in SGT
- `dateAtHourSGT(dateStr, hour)` — specific hour on a date in SGT
- `addDaysSGT(dateStr, days)` — date arithmetic in SGT
- Vercel runs in UTC, so raw `new Date()` is never used for date boundaries

-----

## 5. Database Schema

### Tables (10 total)

|Table             |Purpose                                                   |
|------------------|----------------------------------------------------------|
|`membership_tiers`|Tier definitions (Standard/Premium, price, credits, perks)|
|`members`         |Member profiles, credit balances, Stripe link             |
|`staff`           |Employee profiles with role (staff/manager/owner)         |
|`tables`          |The 7 physical billiards tables                           |
|`bookings`        |Reservations (member, walk-in, or admin block)            |
|`walk_in_guests`  |Non-member guest details linked to walk-in bookings       |
|`booking_invites` |Session invites between members                           |
|`blocked_slots`   |Manager/owner blocked time ranges                         |
|`rate_card`       |Display rates (informational, not used for billing)       |
|`audit_log`       |All system events for accountability                      |

### Migrations

```
supabase/migrations/
  001_initial_schema.sql     — all tables, indexes, RLS, triggers, seed data (602 lines)
  002_credit_operations.sql  — atomic refund_credits / deduct_credits RPCs (62 lines)
  003_stripe_price_id.sql    — adds stripe_price_id column to membership_tiers (12 lines)
```

**Known issue (fixed):** Migration 001 originally had helper functions (`get_staff_role`, `get_member_id`) before the tables they reference. Fix: move them after all CREATE TABLE statements.

### RLS Strategy

- RLS enabled on all 10 tables
- Helper functions `get_staff_role()` and `get_member_id()` used in policies
- Members: read/update own row only
- Staff: read all members/bookings, create walk-ins
- Manager: all staff permissions + block/unblock slots
- Owner: everything + tier/rate config
- Stripe webhooks use service role (bypasses RLS)

### Credit System

- 1 credit = 1 hour of table time
- Credits allocated per tier (Standard: 4/mo, Premium: 10/mo)
- Credits reset on Stripe `invoice.paid` webhook
- Deduction uses `deduct_credits` RPC (SELECT…FOR UPDATE row lock, prevents double-spend)
- Refund on cancel uses `refund_credits` RPC (atomic increment)
- No rollover (credits reset to tier allocation on each billing cycle)

-----

## 6. Key Features (Phase 1 — Complete)

### Member Booking Flow

1. Member opens `/book` → sees floorplan with 7 tables colour-coded by status
1. Taps available table → TableDetailPanel slides up
1. Confirms table → picks date, duration (1/2/3 hr), start time from available slots
1. Confirms booking → credits deducted, redirect to `/bookings/[id]`
1. Can invite other members to join session from booking detail page
1. Can cancel upcoming bookings → credits refunded

### Floorplan

- SVG-based bird’s-eye layout (3 top, 2 middle angled, 2 bottom)
- Status colours: green (available), amber (occupied), blue (reserved), grey (blocked)
- Glow effects via SVG filters
- Real-time updates via Supabase Realtime + 30s polling + visibility-change refresh

### Staff Operations

- **Floor view:** live floorplan with activity summary (bookings today, occupied, upcoming 2h)
- **Calendar:** 7-column day view (T1-T7) + week summary tab
- **Walk-in form:** guest details, deposit tracking, slot availability shown
- **Members list:** search by name/email, owner can add members
- **Member detail:** profile, bookings, admin notes, Stripe link (owner), tier/credit assignment (owner — Session 9)
- **Block slots:** manager/owner can block tables for events/maintenance

### Owner Settings

- **Tier management:** edit name, price, credits, priority days, guest passes, Stripe price ID
- **Rate card:** CRUD for display rates (hourly, per-person, per-game)
- **Booking rules:** displayed read-only (venue hours, slot granularity, max session)

### Stripe Integration

- Webhook endpoint: `/api/webhooks/stripe`
- Events handled: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- `invoice.paid` → resets credits to tier allocation, sets status to active
- `subscription.deleted` → zeros credits, sets status to cancelled
- Members linked to Stripe via `stripe_customer_id` (set by owner in member detail)
- Tiers linked to Stripe via `stripe_price_id` (set by owner in settings)

-----

## 7. Codebase Stats

|Metric              |Count               |
|--------------------|--------------------|
|TypeScript/TSX files|93                  |
|TypeScript LOC      |~11,900             |
|SQL migrations LOC  |~676                |
|Database tables     |10                  |
|RLS policies        |30+                 |
|Server actions      |8 files, ~15 actions|
|Data layer files    |9                   |
|Components          |~35                 |
|Route pages         |~20                 |

-----

## 8. Development Workflow

The project was built using **Claude Code browser agents** across 8 sessions, following this workflow:

1. **Spec prompt written in Claude chat** — detailed, scoped to one session’s work
1. **Claude Code executes** — pointed at the GitHub repo, commits and pushes directly
1. **Audit in Claude chat** — code reviewed against the spec, issues noted
1. **Fixes batched into next session** — audit issues folded into the next prompt

**Key patterns:**

- One feature scope per session
- Audit after each session before moving forward
- All fixes from audit N go into session N+1 prompt
- Mock mode maintained throughout — every feature works without Supabase

-----

## 9. Known Gaps & Issues

### Session 9 (not yet executed)

- Owner cannot assign membership tier to a member from the UI
- Owner cannot manually set/top up credits from the UI
- Owner cannot set subscription status from the UI
- Owner cannot create member accounts from the UI (only self-registration exists)
- Members list doesn’t show tier/credits/status per row (just name/email)

### Future considerations

- `members INSERT` RLS policy only allows manager/owner — self-registration uses the service role via API route, which is correct but worth knowing
- Calendar week view is basic (booking counts only, no revenue or utilisation metrics)
- No email notifications for invites, booking confirmations, or payment status changes
- No file upload for member avatars (URL input only)
- Booking rules (venue hours, max session, slot granularity) are compile-time constants, not database-configurable yet
- No tournament/league management
- No social feed (YouTube links, member game videos)
- No recipe book or daily checklists
- No employee scheduling, leave tracking, or payroll

-----

## 10. Phase Roadmap

### Phase 1 — “The Floor” ✅ COMPLETE

Member profiles, table booking with credits, floorplan, session invites, staff floor/calendar/walk-in, owner settings/rates, Stripe webhooks.

### Phase 2 — “The Bar” (Next)

- CRM enrichment: visit history, spend tracking (Qashier integration?), birthday/promo triggers
- Email blasts / notifications (booking confirmations, invite notifications, payment reminders)
- Social feed: video links (YouTube embeds), member game highlights
- Recipe book: ingredients + steps, searchable by staff
- Daily checklists and SOPs
- Community features: tournament brackets, leaderboards (scope TBD)

### Phase 3 — “The Back Office” (Later)

- Employee profiles, scheduling, leave tracking
- Payroll engine: base + OT + allowances - deductions, payslip generation
- Supplier management
- Expense claims
- Incident management
- Qashier POS integration (if APIs available)
- **Role-based access for Phase 3:** Manager handles scheduling, leave, suppliers. Owner handles salary and payroll. Staff can view schedules, download payslips, upload MC for sick leave.

-----

## 11. Environment Variables

|Name                           |Purpose                      |Required for              |
|-------------------------------|-----------------------------|--------------------------|
|`NEXT_PUBLIC_SUPABASE_URL`     |Supabase project URL         |All real data             |
|`NEXT_PUBLIC_SUPABASE_ANON_KEY`|Supabase anon key            |All real data             |
|`SUPABASE_SERVICE_ROLE_KEY`    |Supabase service role        |Registration, webhooks    |
|`STRIPE_WEBHOOK_SECRET`        |Stripe webhook signing secret|Webhook verification      |
|`STRIPE_SECRET_KEY`            |Stripe API secret key        |Webhook event construction|

When any Supabase var is missing/placeholder, the app runs in **mock mode** with in-memory test data.

-----

## 12. Test Accounts (Mock Mode)

|Email               |Password|Role   |
|--------------------|--------|-------|
|member@tigress.test |password|member |
|staff@tigress.test  |password|staff  |
|manager@tigress.test|password|manager|
|owner@tigress.test  |password|owner  |

-----

## 13. File Map (Key Files)

### Auth

- `src/lib/auth/AuthProvider.tsx` — dual-mode auth (Supabase/mock)
- `src/lib/auth/AuthContext.tsx` — React context type
- `src/lib/auth/mock-users.ts` — test accounts for mock mode
- `src/lib/supabase/env.ts` — `isSupabaseConfigured()`, `isSupabaseAdminConfigured()`

### Data Layer (all server-only)

- `src/lib/data/members.ts` — member CRUD, profile, search, tier queries
- `src/lib/data/bookings.ts` — booking CRUD, cancel, overlap checks, available slots
- `src/lib/data/tables.ts` — table status computation, available slots, today’s activity
- `src/lib/data/invites.ts` — invite CRUD, respond to invites
- `src/lib/data/blocks.ts` — blocked slot CRUD
- `src/lib/data/calendar.ts` — day/week calendar data aggregation
- `src/lib/data/settings.ts` — tier and rate card CRUD
- `src/lib/data/staff.ts` — current staff resolution for role checks
- `src/lib/data/mock-data.ts` — all in-memory fixtures for mock mode

### Server Actions

- `src/app/actions/bookings.ts` — create booking, cancel booking, fetch available slots
- `src/app/actions/invites.ts` — create invite, respond to invite
- `src/app/actions/profile.ts` — update member profile
- `src/app/actions/walk-in.ts` — create walk-in reservation
- `src/app/actions/block.ts` — create/delete blocked slots
- `src/app/actions/members.ts` — search members, link Stripe, (Session 9: assign tier, set credits, create member)
- `src/app/actions/settings.ts` — tier CRUD, rate card CRUD
- `src/app/actions/tables.ts` — fetch table statuses for realtime polling

### Core Components

- `src/components/floorplan/FloorplanLayout.tsx` — SVG floorplan (295 lines)
- `src/components/floorplan/TableDetailPanel.tsx` — slide-up detail sheet
- `src/components/floorplan/StaffFloorView.tsx` — staff wrapper with realtime + activity
- `src/components/booking/BookingFlow.tsx` — 3-step booking flow (576 lines)
- `src/components/calendar/CalendarDayView.tsx` — 7-column day grid (347 lines)
- `src/components/member/InviteMemberPanel.tsx` — member search + invite (250 lines)
- `src/components/owner/TierEditor.tsx` — tier management (270 lines)
- `src/components/owner/RateCardEditor.tsx` — rate card CRUD (331 lines)

### Utilities

- `src/lib/timezone.ts` — Singapore timezone helpers
- `src/lib/format.ts` — date/time/money formatting
- `src/lib/constants.ts` — APP_NAME, TABLE_COUNT, ROLES
- `src/lib/stripe/webhooks.ts` — Stripe event handlers
