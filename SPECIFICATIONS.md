# Tigress — Phase 1 Specifications

## Venue rules (compile-time constants in `src/lib/data/tables.ts`)
- 7 identical pool tables (T1–T7)
- Open 10:00–00:00 SGT daily
- Slot granularity: 60 minutes
- Max session: 3 hours
- 1 credit = 1 hour

## Booking rules
- Members must have `subscription_status = 'active'` to book.
- Members cannot have overlapping bookings on any table.
- Booking start must be in the future.
- Booking start must be within the member's tier `priority_booking_days` horizon.
- Credits are deducted atomically via `deduct_credits` RPC before inserting the booking row.
- Cancellation: only `confirmed` bookings that have not yet started. Credits refunded via `refund_credits` RPC.
- Walk-ins: staff-only, no credits, linked to `walk_in_guests` row.

## Floorplan status priority
1. Blocked (grey) — active `blocked_slots` row
2. Occupied (amber) — booking currently in progress
3. Reserved (blue) — confirmed booking starting within 2 hours
4. Available (green) — none of the above

## Credit system
- Allocated per tier (Standard: 4/mo, Premium: 10/mo)
- Reset on Stripe `invoice.paid` webhook (not rollover)
- Deduction: atomic `SELECT…FOR UPDATE` row lock
- Refund on cancel: atomic increment

## Role permissions
| Action | Member | Staff | Manager | Owner |
|---|---|---|---|---|
| Book tables | ✓ (own credits) | — | — | — |
| Cancel own booking | ✓ | — | — | — |
| Invite members | ✓ | — | — | — |
| Record walk-in | — | ✓ | ✓ | ✓ |
| View floorplan | ✓ | ✓ | ✓ | ✓ |
| View all members | — | ✓ | ✓ | ✓ |
| Edit member notes | — | — | ✓ | ✓ |
| Block/unblock tables | — | — | ✓ | ✓ |
| Manage tiers/rates | — | — | — | ✓ |
| Link Stripe | — | — | — | ✓ |
| Assign tier/credits | — | — | — | ✓ |
| Create members | — | — | — | ✓ |

## Stripe integration
- Webhook endpoint: `/api/webhooks/stripe`
- Events: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`
- `invoice.paid` → reset credits to tier allocation, set status active
- `subscription.deleted` → zero credits, set status cancelled
- Members linked via `stripe_customer_id`, tiers via `stripe_price_id`
