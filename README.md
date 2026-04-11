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
    (member)/        # dashboard, book, bookings, profile, invites
    (staff)/         # floor, calendar, walk-in, members
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
```

## Design

Dark themed for a bar/billiards club vibe. Palette:

| Token | Value |
|-------|-------|
| Primary | `#1A1A2E` |
| Accent | `#E94560` |
| Background | `#0F0F23` |
| Surface | `#16213E` |

Mobile-first: members get a bottom nav, staff/owner get a sidebar on desktop.

## Spec

Product spec will be linked here once published.
