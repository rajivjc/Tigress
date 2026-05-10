# Tigress — Project Handover Document

## Last updated: April 2026, after Session 19 (Phase 2 Tiers 1–2 complete)

-----

## 1. What Tigress Is

Tigress is a club management platform for a bar and billiards venue in Singapore. It is NOT a POS or payment system. It sits alongside **Qashier** (POS, handles transactions at the bar) and **Stripe** (membership billing, collects monthly subscriptions) as the **operational and community hub** for the club.

**Three audiences, three experiences:**

- **Members (~30):** Book tables using monthly credits, invite friends to sessions, manage their profile, enable push notifications
- **Staff (2 FT + 4 PT):** View floorplan, record walk-ins, check calendar, look up members, complete daily checklists, reference recipe book
- **Manager (1) + Owners (2):** Block tables for events, manage scheduling, configure tiers/rates, manage checklist templates, curate recipe book, view checklist history, handle payroll (Phase 3)

**The venue:** 7 identical pool tables, open 10:00–midnight, located in Singapore.

-----

## 2. Tech Stack

|Layer    |Technology                                  |Notes                                                              |
|---------|--------------------------------------------|-------------------------------------------------------------------|
|Framework|Next.js 14.2.15 (App Router, Server Actions)|`src/app/` uses route groups for role separation                   |
|Language |TypeScript                                  |Strict mode                                                        |
|Styling  |Tailwind CSS                                |Dark theme (#0F0F23), mobile-first, Plus Jakarta Sans font         |
|Database |Supabase (Postgres)                         |Singapore region (ap-southeast-1), Row Level Security on all tables|
|Auth     |Supabase Auth                               |Email/password, no social login                                    |
|Payments |Stripe (external)                           |Webhooks for subscription sync only                                |
|Hosting  |Vercel                                      |Production at tigress.vercel.app                                   |
|Real-time|Supabase Realtime + 30s polling fallback    |Floorplan live updates                                             |
|Push     |Web Push API + VAPID (web-push npm)         |Self-hosted, no third-party push service                           |
|PWA      |Hand-written service worker                 |No next-pwa or workbox                                             |
|Icons    |Lucide React                                |Consistent 20px/16px sizes, strokeWidth 1.5                        |
|Testing  |Vitest                                      |317 tests across 17 test files                                     |

-----

## 3. Repo & Deployment

- **Repo:** https://github.com/rajivjc/Tigress
- **Production:** https://tigress.vercel.app
- **Supabase project:** Singapore region (ap-southeast-1) — **live and connected**
- **Branch strategy:** Single `main` branch, direct push
- **Key project files:** `CLAUDE.md` (project intelligence), `SPECIFICATIONS.md` (Phase 1 rules)

-----

## 4. Architecture Overview

### Route Groups (role-based)

```
src/app/
  (auth)/        → login, register, forgot-password (public)
  (member)/      → dashboard, book, bookings, bookings/[id], profile, invites
  (staff)/       → floor, calendar, walk-in, members, members/[id], members/new,
                   block, checklists, checklists/templates, checklists/templates/[id],
                   checklists/templates/new, checklists/history,
                   recipes, recipes/[id], recipes/[id]/edit, recipes/new
  (owner)/       → settings, rates
  actions/       → Server actions (one file per domain)
  api/
    auth/register/              → Member self-registration (admin client)
    webhooks/stripe/            → Stripe webhook receiver
    cron/booking-reminders/     → Vercel Cron endpoint (every 15 min via GitHub Actions)
  offline/       → Offline fallback page (Next.js route mirrors public/offline.html)
```

### Auth & Role System

- **AuthProvider** (`src/lib/auth/AuthProvider.tsx`) — client-side context, dual-mode (Supabase or mock)
- **RouteGuard** (`src/components/auth/RouteGuard.tsx`) — wraps each layout, checks `allowedRoles`
- **Role hierarchy:** member < staff < manager < owner (each inherits permissions of roles below)
- **Role resolution:** on login, checks `staff` table first (returns staff/manager/owner), then `members` table (returns member). If neither exists, signs out (orphan auth user). Suspended/inactive members are blocked from signing in.
- **Mock mode:** activates when Supabase env vars are missing/placeholder. Uses hardcoded test accounts in `src/lib/auth/mock-users.ts`. Sessions stored in localStorage + cookie.

### Data Layer Pattern

Every domain has a data file in `src/lib/data/`:

```
bookings.ts, blocks.ts, calendar.ts, checklists.ts, invites.ts,
members.ts, mock-data.ts, push-subscriptions.ts, recipes.ts,
settings.ts, staff.ts, tables.ts
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

### Tables (18 total)

|Table                     |Purpose                                                   |Migration|
|--------------------------|----------------------------------------------------------|---------|
|`membership_tiers`        |Tier definitions (Standard/Premium, price, credits, perks)|001      |
|`members`                 |Member profiles, credit balances, Stripe link             |001      |
|`staff`                   |Employee profiles with role (staff/manager/owner)         |001      |
|`tables`                  |The 7 physical billiards tables                           |001      |
|`bookings`                |Reservations (member, walk-in, or admin block)            |001      |
|`walk_in_guests`          |Non-member guest details linked to walk-in bookings       |001      |
|`booking_invites`         |Session invites between members                           |001      |
|`blocked_slots`           |Manager/owner blocked time ranges                         |001      |
|`rate_card`               |Display rates (informational, not used for billing)       |001      |
|`audit_log`               |All system events for accountability                      |001      |
|`push_subscriptions`      |Web Push subscription endpoints per device                |005      |
|`checklist_templates`     |Reusable checklist definitions                            |008      |
|`checklist_template_items`|Ordered items within a checklist template                 |008      |
|`checklist_instances`     |Per-date materialised checklists (lazy-created)           |008      |
|`checklist_instance_items`|Checkable items staff tick off each day                   |008      |
|`recipes`                 |Bar recipe catalogue                                      |009      |
|`recipe_ingredients`      |Structured ingredients with amount + unit                 |009      |
|`recipe_steps`            |Ordered preparation instructions                          |009      |

### Migrations

```
supabase/migrations/
  001_initial_schema.sql         — all Phase 1 tables, indexes, RLS, triggers, seed data
  002_credit_operations.sql      — atomic refund_credits / deduct_credits RPCs
  003_stripe_price_id.sql        — adds stripe_price_id column to membership_tiers
  004_booking_indexes.sql        — composite indexes for booking queries + audit log
  005_push_subscriptions.sql     — Web Push subscription table + RLS
  006_no_show.sql                — no_show boolean on bookings + partial index
  007_booking_reminders.sql      — reminder_sent_at timestamp on bookings
  008_checklists.sql             — 4 checklist tables + RLS + updated_at trigger
  009_recipes.sql                — 3 recipe tables + RLS + pg_trgm + trigram index
```

### RLS Strategy

- RLS enabled on all 18 tables
- Helper functions `get_staff_role()` and `get_member_id()` used in policies
- Members: read/update own row only
- Staff: read all members/bookings/checklists/recipes, create walk-ins, check off checklist items
- Manager: all staff permissions + block/unblock slots, manage checklist templates, manage recipes, view checklist history
- Owner: everything + tier/rate config
- Stripe webhooks and cron use service role (bypasses RLS)

### Credit System

- 1 credit = 1 hour of table time
- Credits allocated per tier (Standard: 4/mo, Premium: 10/mo)
- Credits reset on Stripe `invoice.paid` webhook
- Deduction uses `deduct_credits` RPC (SELECT…FOR UPDATE row lock, prevents double-spend)
- Refund on cancel uses `refund_credits` RPC (atomic increment)
- No rollover (credits reset to tier allocation on each billing cycle)

-----

## 6. Key Features

### Phase 1 — “The Floor” ✅ COMPLETE (Sessions 1–13)

Member profiles, table booking with credits, floorplan, session invites, staff floor/calendar/walk-in, owner settings/rates, Stripe webhooks, security hardening, UI polish, responsive calendar, date-specific booking flow.

### Phase 2 — “The Bar” (In Progress, Tiers 1–2 complete)

#### Tier 1: Operational Gaps ✅ COMPLETE (Sessions 14–17)

**PWA Foundation (Session 14)**

- Manifest, hand-written service worker (`public/sw.js`), offline fallback
- Cross-browser install banner (Chromium native prompt, iOS Safari manual instructions)
- 14-day dismiss cooldown, standalone mode detection
- Placeholder icons (dark “T” on #0F0F23), replaceable with brand assets
- Cache strategy: network-first for navigation, cache-first for static assets, network-only for data

**Push Notifications (Session 15)**

- Web Push API with VAPID keys (self-hosted via `web-push` npm package)
- Push subscriptions stored in `push_subscriptions` table (one row per device)
- Three triggers: booking confirmed → booker, booking cancelled → accepted invitees, invite received → invitee
- Fire-and-forget: push failures never break booking/invite flows
- 404/410 expired subscription auto-cleanup
- iOS gating: must be installed to home screen AND iOS 16.4+ for Web Push
- Notification controls on member profile page (state machine: loading/unsupported/needs-install/needs-ios-upgrade/blocked/disabled/enabled)

**No-Show Tracking (Session 16)**

- `bookings.no_show` boolean flag (NOT a booking status — `BookingStatus` remains `confirmed | cancelled | completed`)
- Staff/manager/owner can mark/unmark completed bookings within 48-hour window
- Surfaces in: calendar day view (badge + mark/undo), calendar week view (count indicator), member detail page (count + history)
- Audit logged (mark and unmark events)
- Purely informational — no automatic consequences

**Booking Reminders (Session 17)**

- Cron job via GitHub Actions (every 15 min) hitting `/api/cron/booking-reminders`
- Finds confirmed member bookings starting in 45–75 min window, sends push, stamps `reminder_sent_at`
- `CRON_SECRET` bearer token authentication
- Idempotent: `reminder_sent_at` prevents duplicate sends, push `tag` collapses device-side
- `reminder_sent_at` stamped AFTER push attempt — failed sends retry on next tick

#### Tier 2: Staff Tools ✅ COMPLETE (Sessions 18–19)

**Daily Checklists & SOPs (Session 18)**

- Template → Instance model: manager creates reusable templates, instances materialised lazily per date
- 4 tables: `checklist_templates`, `checklist_template_items`, `checklist_instances`, `checklist_instance_items`
- Items copied from template at creation time (editing templates doesn’t rewrite history)
- Staff check items for today only (past dates are readonly)
- Auto-completion: checking last item stamps instance as complete, unchecking clears it
- Template management and history views for manager/owner only
- Race-safe lazy creation via `UNIQUE(template_id, date)` + `ON CONFLICT DO NOTHING`
- Seeded: “Opening Procedures” + “Closing Procedures” with realistic items

**Recipe Book (Session 19)**

- Structured data: `recipes`, `recipe_ingredients` (amount + unit + name), `recipe_steps`
- 21 fixed units (ml, oz, cl, dash, splash, piece, slice, sprig, scoop, tsp, tbsp, cup, drop, pinch, whole + plurals)
- Dual search: recipe name AND ingredient name (`ILIKE` with `pg_trgm` trigram index)
- Category filter pills: cocktails, mocktails, shots, beer, coffee, other (colour-coded)
- “To taste” ingredients: null amount/unit displayed as “Name — to taste”
- Full replacement strategy for ingredients and steps (same as checklist template items)
- Seeded: Margarita, Espresso Martini, Virgin Mojito, Jägerbomb, Long Black

#### Tier 3: Community Features — NEXT

**Item 8: Social Feed** — text posts, YouTube embeds, image URLs, likes. Members + staff can post. Manager/owner moderation.
**Item 9: Tournament Brackets** — single/double elimination, leaderboards.
**Item 10: Member Achievements/Badges** — visit streaks, tournament wins, milestones.

#### Tier 4: CRM & Revenue Intelligence — LATER

Item 11: Visit history dashboard. Item 12: Birthday/promo triggers. Item 13: Qashier integration.

#### Tier 5: Platform Hardening — LATER

Item 14: Postgres exclusion constraint. Item 15: DB-configurable booking rules. Item 16: Member avatar upload. Item 17: Next.js 15 upgrade.

-----

## 7. Codebase Stats

|Metric              |Count                |
|--------------------|---------------------|
|TypeScript/TSX files|130                  |
|TypeScript LOC      |~21,200              |
|SQL migrations LOC  |~1,100               |
|Database tables     |18                   |
|RLS policies        |50+                  |
|Server actions      |11 files, ~40 actions|
|Data layer files    |12                   |
|Components          |~60                  |
|Route pages         |~30                  |
|Test files          |17                   |
|Test cases          |317                  |

-----

## 8. Development Workflow

The project is built using **Claude Code browser agents**, following this workflow:

1. **Spec prompt written in Claude chat** — detailed, scoped to one session’s work
1. **Claude Code executes** — pointed at the GitHub repo, commits and pushes directly
1. **Audit in Claude chat** — code reviewed against the spec, repo pulled and inspected
1. **Fixes batched into next session** — audit issues folded into the next prompt

**Key patterns:**

- One feature scope per session (except Session 17 which combined a fix + feature)
- Audit after each session before moving forward
- All fixes from audit N go into session N+1 prompt
- Mock mode maintained throughout — every feature works without Supabase
- `CLAUDE.md` at repo root provides project intelligence to Claude Code

### Session History

|Session|Scope                                                                                                                     |Audit Result|
|-------|--------------------------------------------------------------------------------------------------------------------------|------------|
|1–8    |Phase 1 feature build (auth, schema, floorplan, booking, invites, walk-ins, calendar, staff views, owner settings, Stripe)|—           |
|9      |Migration fix (helper function ordering)                                                                                  |—           |
|10     |Phase 1 hardening (17 audit fixes — security, validation, indexes, tests)                                                 |—           |
|11     |UI/UX polish (typography, icons, elevation, animations, empty states)                                                     |—           |
|12     |Responsive calendar (agenda list on mobile, grid on desktop)                                                              |—           |
|13     |Member booking flow fix (date-specific availability, remove step indicator)                                               |—           |
|14     |PWA foundation (manifest, service worker, offline shell, install banner)                                                  |Clean pass  |
|15     |Push notifications (VAPID, subscriptions, 3 triggers, iOS handling)                                                       |Clean pass  |
|16     |No-show tracking (boolean flag, 48h window, calendar + member detail UI)                                                  |1 type issue|
|17     |Session 16 type fix + booking reminders (cron via GitHub Actions)                                                         |Clean pass  |
|18     |Daily checklists & SOPs (4 tables, lazy creation, template management)                                                    |Clean pass  |
|19     |Recipe book (3 tables, structured ingredients, dual search, category filters)                                             |Clean pass  |

-----

## 9. Environment Variables

|Name                           |Purpose                      |Required for                           |
|-------------------------------|-----------------------------|---------------------------------------|
|`NEXT_PUBLIC_SUPABASE_URL`     |Supabase project URL         |All real data                          |
|`NEXT_PUBLIC_SUPABASE_ANON_KEY`|Supabase anon key            |All real data                          |
|`SUPABASE_SERVICE_ROLE_KEY`    |Supabase service role        |Registration, webhooks, member creation|
|`STRIPE_WEBHOOK_SECRET`        |Stripe webhook signing secret|Webhook verification                   |
|`STRIPE_SECRET_KEY`            |Stripe API secret key        |Webhook event construction             |
|`NEXT_PUBLIC_VAPID_PUBLIC_KEY` |Public VAPID key             |Push notification subscription         |
|`VAPID_PRIVATE_KEY`            |Private VAPID key            |Push notification sending              |
|`CRON_SECRET`                  |Cron endpoint auth token     |Booking reminders                      |

GitHub Actions secrets (for booking reminder cron):

- `CRON_SECRET` — same value as Vercel env var
- `CRON_TARGET_URL` — deployment origin (e.g., https://tigress.vercel.app)

When any Supabase var is missing/placeholder, the app runs in **mock mode** with in-memory test data.

-----

## 10. Test Accounts (Mock Mode)

|Email               |Password|Role   |
|--------------------|--------|-------|
|member@tigress.test |password|member |
|staff@tigress.test  |password|staff  |
|manager@tigress.test|password|manager|
|owner@tigress.test  |password|owner  |

-----

## 11. Known Gaps & Future Considerations

- Booking rules (venue hours, max session, slot granularity) are compile-time constants, not database-configurable
- No email notifications (Resend setup pending — Item 1 on Phase 2 list, parked)
- No file upload for member avatars or recipe images (URL input only)
- Calendar week view is basic (booking counts only, no revenue or utilisation metrics)
- `cookies()` is sync in Next 14 — will need `await cookies()` if upgrading to Next 15+
- TOCTOU gap between slot availability check and booking INSERT (negligible at current scale; should add Postgres exclusion constraint in Tier 5)
- No tournament/league management (Tier 3, Item 9)
- No social feed (Tier 3, Item 8)
- No member achievements/badges (Tier 3, Item 10)
- No employee scheduling, leave tracking, or payroll (Phase 3)

-----

## 12. Phase 2 Master Priority List (Items 1–17)

|# |Item                         |Tier|Status     |Session|
|--|-----------------------------|----|-----------|-------|
|1 |Email notifications (Resend) |1   |PARKED     |—      |
|2 |Push notifications (PWA)     |1   |✅ DONE     |14–15  |
|3 |No-show tracking             |1   |✅ DONE     |16     |
|4 |Booking reminders            |1   |✅ DONE     |17     |
|5 |Daily checklists/SOPs        |2   |✅ DONE     |18     |
|6 |Recipe book                  |2   |✅ DONE     |19     |
|7 |Incident logging             |2   |NOT STARTED|—      |
|8 |Social feed                  |3   |NEXT       |20     |
|9 |Tournament brackets          |3   |NOT STARTED|—      |
|10|Member achievements/badges   |3   |NOT STARTED|—      |
|11|Visit history dashboard      |4   |NOT STARTED|—      |
|12|Birthday/promo triggers      |4   |NOT STARTED|—      |
|13|Qashier integration          |4   |NOT STARTED|—      |
|14|Postgres exclusion constraint|5   |NOT STARTED|—      |
|15|DB-configurable booking rules|5   |NOT STARTED|—      |
|16|Member avatar upload         |5   |NOT STARTED|—      |
|17|Next.js 15 upgrade           |5   |NOT STARTED|—      |

**Note:** Item 7 (incident logging) was in the original Tier 2 list but was not spec’d or built. It can be slotted in at any point — low complexity, similar pattern to checklists.

-----

## 13. Tier 3 Design Direction (for next chat session)

These were discussed but not spec’d. The next chat session should start here.

### Social Feed (Item 8) — discussed, direction agreed

- **Who posts:** All members + staff (this is the one member-facing engagement feature)
- **Content types:** Text posts, YouTube embeds (paste URL → auto-embed), image URLs (no file upload)
- **Engagement:** Simple like/heart. No comments in v1 (moderation overhead for 30-person club)
- **Moderation:** Manager/owner can delete any post. Members delete own posts only.
- **Purpose:** Container feature — tournament results and achievement unlocks will eventually auto-post here

### Tournament Brackets (Item 9) — not discussed yet

### Member Achievements (Item 10) — not discussed yet
