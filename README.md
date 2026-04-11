# Tigress

Club management platform for a bar &amp; billiards venue in Singapore. Handles
member bookings, staff floor operations, walk-ins, pricing, and owner-level
configuration.

> Status: **auth + routing wired up**. Placeholder feature pages remain, but
> login, sign-up, session handling, and role-based route protection are
> functional.

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

Run the migration via the Supabase CLI:

```bash
supabase db push
```

or by pasting the SQL file into the Supabase SQL editor on a fresh project.

### Authentication

Auth runs in one of two modes, selected automatically at runtime:

- **Real mode** — used when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set to non-placeholder values. Uses
  `@supabase/ssr` with email/password sign-in.
- **Mock mode** — used when those env vars are missing or still set to the
  placeholder values from `.env.local.example`. The login page accepts any of
  the hardcoded test accounts listed below; sessions are stored in
  `localStorage` + a cookie so middleware can still gate routes. This is
  purely for scaffold-stage development and is disabled automatically as soon
  as real Supabase env vars are filled in.

#### Mock test accounts (mock mode only)

| Email | Password | Role |
|-------|----------|------|
| `member@tigress.test` | `password` | member |
| `staff@tigress.test` | `password` | staff |
| `manager@tigress.test` | `password` | manager |
| `owner@tigress.test` | `password` | owner |

#### Creating staff / manager / owner accounts (real mode)

Staff accounts are never self-service. Create them manually once you have a
Supabase project wired up:

1. In the Supabase dashboard, go to **Authentication → Users → Add user** and
   create an auth user with email + password. Tick "Auto confirm" so the
   account can log in immediately.
2. Copy the new user's UUID, then run this SQL in **SQL Editor** (replace the
   placeholder values):

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
    (auth)/          # login, register, forgot-password
    (member)/        # dashboard, book, bookings, bookings/[id], profile, invites
    (staff)/         # floor, calendar, walk-in, members, members/[id]
    (owner)/         # settings, rates
    api/auth/        # register route (server-side, service role)
  components/
    auth/            # RouteGuard, LogoutButton
    ui/              # Shared UI (PlaceholderPage, nav, header, skeletons)
    floorplan/       # Table layout components (TBD)
    booking/         # Booking flow components (TBD)
  lib/
    auth/            # AuthContext, AuthProvider, mock-users
    supabase/        # client.ts, server.ts, admin.ts, middleware.ts, env.ts
    stripe/          # webhooks.ts stub
    types/           # Shared TypeScript types
    constants.ts     # App constants
  hooks/             # useAuth
  middleware.ts      # Next.js middleware (session refresh + route protection)
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
