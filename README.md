# Tigress

Club management platform for a bar &amp; billiards venue in Singapore. Handles
member bookings, staff floor operations, walk-ins, pricing, and owner-level
configuration.

> Status: **scaffold only** — placeholder pages and project structure. No
> features are wired up yet.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) (`@supabase/supabase-js`, `@supabase/ssr`) — client setup only
- [Stripe](https://stripe.com/) — webhook stub only
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
# then fill in values — the scaffold runs fine with the placeholder values
# because no Supabase/Stripe calls are made yet.

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database (Supabase)

The schema lives in [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).
It creates all Phase 1 tables, indexes, RLS policies, triggers and seed data
(7 billiards tables, 2 placeholder membership tiers, and a starter rate card).

No Supabase project is wired up yet. When one is created, run the migration via
either the Supabase CLI:

```bash
supabase db push
```

or by pasting the SQL file into the Supabase SQL editor on a fresh project.

### Environment variables

| Name | Description |
|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

## Project structure

```
src/
  app/
    (auth)/          # login, forgot-password
    (member)/        # dashboard, book, bookings, bookings/[id], profile, invites
    (staff)/         # floor, calendar, walk-in, members, members/[id]
    (owner)/         # settings, rates
  components/
    ui/              # Shared UI (PlaceholderPage, nav, header)
    floorplan/       # Table layout components (TBD)
    booking/         # Booking flow components (TBD)
  lib/
    supabase/        # client.ts, server.ts, middleware.ts
    stripe/          # webhooks.ts stub
    types/           # Shared TypeScript types
    constants.ts     # App constants
  hooks/             # Custom React hooks
  middleware.ts      # Next.js middleware (session refresh)
supabase/
  migrations/        # SQL migrations (001_initial_schema.sql)
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

## Spec

Product spec will be linked here once published.
