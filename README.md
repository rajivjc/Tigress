# Tigress

Club management platform for a bar & billiards venue in Singapore. Handles
member bookings, staff floor operations, walk-ins, pricing, and owner-level
configuration.

> Status: **Phase 1 feature-complete.** Member booking flow, invites, staff
> floor/calendar/walk-in/members views, manager block/unblock, owner settings
> + rate card, and Stripe subscription webhooks are all wired up. The app runs
> end-to-end in mock mode without a Supabase or Stripe project.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router, Server Actions)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (`@supabase/supabase-js`, `@supabase/ssr`)
  for auth, Postgres, and Row Level Security
- [Stripe](https://stripe.com/) for membership subscriptions and webhooks
- Deployed on [Vercel](https://vercel.com/)

## Getting started

```bash
# 1. Clone
git clone https://github.com/rajivjc/Tigress.git
cd Tigress

# 2. Install
npm install

# 3. Env vars
cp .env.local.example .env.local
# then fill in values — the app runs fine with the placeholder values in
# mock mode (no Supabase / Stripe calls are made when the env vars are
# still set to their defaults).

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Mock mode

Tigress ships with a full mock-data layer so you can explore the app without
standing up a Supabase project. Mock mode activates automatically when
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing or
left at their placeholder values.

In mock mode:

- Log in with any of the test accounts below — the password doesn't matter.
- Sessions are stored in `localStorage` + a cookie so middleware and server
  actions can still resolve "who am I".
- Membership tiers, tables, bookings, invites, members, blocks and rate card
  entries are served from in-memory fixtures (`src/lib/data/mock-data.ts` and
  the mock branches in each `src/lib/data/*.ts` file).
- Stripe webhooks accept any payload and no-op with a 200 response.

As soon as the real Supabase env vars are filled in, every data accessor
flips over to the Supabase client automatically.

### Mock test accounts

| Email | Password | Role |
|-------|----------|------|
| `member@tigress.test` | `password` | member |
| `staff@tigress.test` | `password` | staff |
| `manager@tigress.test` | `password` | manager |
| `owner@tigress.test` | `password` | owner |

## Database (Supabase)

The schema lives in [`supabase/migrations/`](supabase/migrations):

- `001_initial_schema.sql` — all Phase 1 tables, indexes, RLS policies,
  triggers and seed data (7 billiards tables, 2 placeholder membership tiers,
  starter rate card).
- `002_credit_operations.sql` — atomic credit decrement / refund RPCs used by
  the booking and cancel flows.
- `003_stripe_price_id.sql` — adds `stripe_price_id` to `membership_tiers` so
  the `customer.subscription.updated` webhook can map a Stripe price back to
  a tier.

Run the migrations via the Supabase CLI:

```bash
supabase db push
```

or by pasting each file into the Supabase SQL editor on a fresh project, in
order.

### Creating staff / manager / owner accounts (real mode)

Staff accounts are never self-service. Create them manually once Supabase is
wired up:

1. In the Supabase dashboard, go to **Authentication → Users → Add user** and
   create an auth user with email + password. Tick "Auto confirm" so the
   account can log in immediately.
2. Copy the new user's UUID, then run this SQL in **SQL Editor**:

   ```sql
   insert into public.staff (auth_user_id, full_name, email, role)
   values (
     '00000000-0000-0000-0000-000000000000', -- auth user UUID
     'Jane Manager',
     'jane@example.com',
     'manager'                               -- staff | manager | owner
   );
   ```

3. The user can now sign in at `/login`; on success they'll be routed to
   `/floor`.

Members, by contrast, can sign up themselves via `/register` — the API route
`src/app/api/auth/register/route.ts` uses the Supabase service role key to
create the auth user and the matching `members` row.

## Environment variables

| Name | Required? | Description |
|------|-----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | prod | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | Supabase anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Service role key (server-side only — used by the register API route and Stripe webhook handlers) |
| `STRIPE_SECRET_KEY` | prod | Stripe secret key (`sk_...`) used to instantiate the Stripe client in the webhook route |
| `STRIPE_WEBHOOK_SECRET` | prod | Webhook signing secret (`whsec_...`) used to verify `stripe-signature` headers |

Leave all of these at their placeholder values to run in mock mode. As soon as
the Supabase vars look real, the app switches to the live Supabase client.

## Project structure

```
src/
  app/
    (auth)/                 # login, register, forgot-password
    (member)/               # dashboard, book, bookings, bookings/[id], profile, invites
    (staff)/                # floor, calendar, walk-in, members, members/[id], block
    (owner)/                # settings, rates
    actions/                # Server actions (bookings, invites, profile, walk-in, block, members, settings, tables)
    api/
      auth/register/        # Member sign-up (server-side, service role)
      webhooks/stripe/      # Stripe webhook receiver
  components/
    auth/                   # RouteGuard, LogoutButton
    ui/                     # Shared UI (nav, header, skeletons, access denied)
    booking/                # BookingFlow + slot picker
    floorplan/              # FloorplanLayout, TableDetailPanel, StaffFloorView
    calendar/               # CalendarDayView, CalendarWeekView
    member/                 # Dashboard cards, invite panel, booking history
    staff/                  # Walk-in form, block form, members list, notes editor, Stripe link form
    owner/                  # TierEditor, RateCardEditor
  lib/
    auth/                   # AuthContext, AuthProvider, mock-users
    data/                   # Server-only data accessors (one file per domain, mock+Supabase)
    stripe/                 # Webhook handlers (invoice + subscription lifecycle)
    supabase/               # client.ts, server.ts, admin.ts, middleware.ts, env.ts
    types/                  # Shared TypeScript types (mirrors DB schema)
    format.ts               # SGD + date formatting helpers
    timezone.ts             # SGT (Asia/Singapore) helpers
    constants.ts            # App constants
  hooks/                    # useAuth, useFloorplanRealtime
  middleware.ts             # Next.js middleware (session refresh + route protection)
supabase/
  migrations/               # 001_initial_schema.sql, 002_credit_operations.sql, 003_stripe_price_id.sql
```

## Design

Dark themed for a bar/billiards club vibe. Palette:

| Token | Value |
|-------|-------|
| Primary | `#1A1A2E` |
| Accent | `#E94560` |
| Background | `#0F0F23` |
| Surface | `#16213E` |

Mobile-first: members get a bottom nav. Staff/owner get a sidebar on desktop
and a bottom nav on mobile/tablet (where staff are most likely to be working).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step instructions covering the
Supabase project, Vercel deploy, Stripe webhook configuration, and linking
Stripe price IDs to membership tiers.

## Phase 2 teaser

Phase 2 will layer on customer-facing payments (Stripe Checkout for
memberships and top-up credit packs), loyalty points, in-venue POS, inventory,
and a full staff payroll / timesheet module. Phase 1 is the operational
backbone that Phase 2 rests on.

## Spec

Product spec will be linked here once published.
