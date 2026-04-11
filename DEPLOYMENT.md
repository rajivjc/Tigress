# Tigress — Deployment Guide

A short, practical runbook for getting Tigress from a fresh clone to a live
Vercel deployment wired up to Supabase and Stripe. Follow the steps in order.

---

## 1. Create a Supabase project

1. Sign in to [supabase.com](https://supabase.com/dashboard) and click
   **New project**.
2. Region: **Southeast Asia (Singapore)** — closest to the venue, lowest
   latency for staff devices.
3. Generate a strong database password and save it somewhere safe.
4. Wait for the project to finish provisioning.
5. From **Settings → API**, copy the following into a scratch doc — you'll
   paste them into Vercel later:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret —
     it bypasses Row Level Security)

## 2. Run the database migrations

The schema lives in `supabase/migrations/`:

- `001_initial_schema.sql` — all tables, indexes, RLS policies, seed data.
- `002_credit_operations.sql` — atomic credit RPCs used by the booking flow.
- `003_stripe_price_id.sql` — adds `stripe_price_id` to `membership_tiers`.

You can either:

**Option A — Supabase CLI** (recommended if you'll be iterating):

```bash
# Install the CLI once
npm install -g supabase

# Link a local checkout to your remote project
supabase link --project-ref <your-project-ref>

# Apply all migrations
supabase db push
```

**Option B — SQL editor** (one-shot):

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the contents of each migration in order (001 → 002 → 003), running
   each as its own query.

After migrations run you should see the expected tables in **Database →
Tables** (`members`, `staff`, `tables`, `bookings`, `membership_tiers`, …).

## 3. Create the initial owner account

Tigress never lets staff self-register. Bootstrap the first owner by hand:

1. **Authentication → Users → Add user**. Email + password. Tick
   **Auto confirm** so the account can log in immediately.
2. Copy the new auth user's UUID.
3. In **SQL Editor**, insert a matching row into `public.staff`:

   ```sql
   insert into public.staff (auth_user_id, full_name, email, role)
   values (
     '00000000-0000-0000-0000-000000000000', -- paste the auth user UUID
     'Venue Owner',
     'owner@yourvenue.com',
     'owner'
   );
   ```

The owner account can later create additional staff / manager accounts the
same way.

## 4. Deploy to Vercel

1. Push this repo to GitHub (or connect your existing fork).
2. On [vercel.com](https://vercel.com/), **Add New → Project** and import the
   repo.
3. Vercel auto-detects Next.js. Leave the default build command
   (`npm run build`) and output directory alone.
4. Click **Deploy**. The first build will succeed even without env vars
   because the app boots in mock mode when Supabase/Stripe env vars are
   missing — but you'll want to add them before shipping to real users.

## 5. Set environment variables in Vercel

Under **Project Settings → Environment Variables**, add the following for
Production (and Preview, if you want previews to hit real Supabase):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `STRIPE_SECRET_KEY` | from the Stripe dashboard (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | from step 6 below (`whsec_...`) |

Redeploy so the new env vars take effect.

## 6. Configure the Stripe webhook

1. In the [Stripe dashboard](https://dashboard.stripe.com/), go to
   **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:
   `https://<your-vercel-domain>/api/webhooks/stripe`
3. Subscribe to these events:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. After creating the endpoint, reveal the **Signing secret** and paste it
   into the `STRIPE_WEBHOOK_SECRET` Vercel env var. Redeploy.

The webhook route (`src/app/api/webhooks/stripe/route.ts`) verifies every
event against the signing secret using the raw request body, then delegates
to `src/lib/stripe/webhooks.ts`.

## 7. Create Stripe products and prices

Create one product per membership tier in the Stripe dashboard (or via the
Stripe CLI). For each product, attach a recurring monthly price that matches
the `monthly_price_cents` value in Tigress:

- **Standard** — e.g. SGD 100.00 / month
- **Premium** — e.g. SGD 200.00 / month

Copy each price's id (`price_xxx`) — you'll paste them into Tigress in the
next step.

## 8. Link Stripe price IDs to Tigress tiers

1. Log into the deployed Tigress app as the owner account you created in
   step 3.
2. Navigate to **Settings** (owner-only).
3. For each membership tier, click **Edit**, paste the corresponding
   `price_xxx` into the **Stripe price ID** field, and save.

From this point on, `customer.subscription.updated` webhook events will
automatically swap a member's `membership_tier_id` when Stripe reports a
subscription price change.

## 9. Smoke-test the live deployment

Once everything is wired up, manually verify the golden paths:

- [ ] Log in as the owner account.
- [ ] Edit a membership tier — the Stripe price id you just set should
      persist after a refresh.
- [ ] Create a test staff account, log in as them, verify `/floor` and
      `/calendar` render with real data.
- [ ] Create a test member via `/register`, log in, and book a slot.
- [ ] In the Stripe dashboard, send a **test webhook event** for
      `invoice.paid` — check the Tigress server logs for the handler's
      audit-log entry.

If all four work, Phase 1 is live.

---

## Troubleshooting

**Build fails on Vercel but succeeds locally.**
Almost always a missing env var the build references. Tigress is designed so
that all Supabase/Stripe calls are guarded by `isSupabaseConfigured()` and
`isSupabaseAdminConfigured()` — if the build is still failing, it's likely a
TypeScript error unrelated to env vars.

**Webhook signature verification fails.**
The most common causes are (a) the wrong `STRIPE_WEBHOOK_SECRET` (each
endpoint has its own), or (b) middleware re-parsing the request body before
the handler. The webhook route already uses `request.text()` to read the raw
body — don't add any framework-level body parsers.

**A member's tier doesn't change after a Stripe upgrade.**
Check that the new tier has the matching `stripe_price_id` set in the owner
settings page. Without that link, `handleSubscriptionUpdated` will log the
event but leave `membership_tier_id` alone.
