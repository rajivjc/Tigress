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
- Route groups: `(auth)/` public, `(member)/` all roles, `(staff)/` staff+, `(owner)/` owner only, `(community)/` all authenticated roles (feed).

## Database
- ~28 tables, ~70+ RLS policies, 13 migrations in `supabase/migrations/`.
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

### Verification sequence (mandatory before commit)

```bash
npx tsc --noEmit
npm run build
npm run lint
npx vitest run
```

All four green. `tsc --noEmit` is non-negotiable: vitest transpiles via
esbuild without type-checking, and `next build` doesn't type-check files
outside the app's import graph. Test files routinely escape both — only
`tsc` catches type drift in tests. The S24b1 audit caught two type errors
in test files that build/lint/vitest all missed; this step is what
prevents that recurring.

## PWA (Session 14)
Tigress is installable as a PWA. Everything is hand-written — do **not** add `next-pwa` or any SW library.

- **Manifest:** `public/manifest.json` — wired into the root layout via Next.js `metadata.manifest`. `theme_color` / `background_color` must stay in sync with the `#0F0F23` theme used in `tailwind.config.ts` and `src/app/layout.tsx`.
- **Service worker:** `public/sw.js`, versioned cache `tigress-v2`. Strategy:
  - Navigation (HTML): network-first, falls back to cached `/offline.html`.
  - Static assets (`/icons/*`, `/manifest.json`, `/offline.html`): cache-first.
  - Everything else (Next.js JS bundles, API routes, Supabase Realtime, cross-origin): passthrough. **Never cache Next.js bundles** — they're hash-named and caching them causes stale-JS on deploy. WebSockets aren't intercepted by fetch handlers, so Supabase Realtime is unaffected.
  - **Bump `CACHE_VERSION`** whenever the precache list or offline shell changes.
- **Offline shell:** `public/offline.html` is the canonical static fallback the SW serves. `src/app/offline/page.tsx` mirrors its markup so `/offline` resolves online too. When editing either, edit both.
- **Registration:** `src/components/pwa/ServiceWorkerRegistration.tsx` renders nothing; mounted from the root layout.
- **Install banner:** `src/components/pwa/InstallBanner.tsx` handles three platforms:
  - **Chromium (Android/desktop Chrome/Edge):** listens for `beforeinstallprompt`, surfaces a native Install button.
  - **iOS Safari:** detected via UA (`detectPlatform`); shows manual "Share → Add to Home Screen" instructions. Chrome/Firefox/Edge on iOS (CriOS/FxiOS/EdgiOS) correctly report as `unsupported`.
  - **Standalone (already installed) / unsupported:** banner hidden silently.
  - Dismiss suppresses the banner for 14 days via `localStorage["pwa-install-dismissed"]`.
  - Pure logic lives in `src/lib/pwa/install-banner.ts` and is covered by `tests/pwa/install-banner.test.ts`.
- **Icons:** placeholder PNGs in `public/icons/` (192/512 regular + 192/512 maskable + 180 apple-touch). Generated by `node scripts/generate-icons.js` (pure Node, no `sharp`/`canvas` dependency). **These are throwaway placeholders — replace them with branded assets from the venue owner by overwriting the files in `public/icons/` with the same filenames/sizes. The maskable variants must keep content inside the 80% safe zone.**

## Push notifications (Session 15)
Web Push using the Push API + VAPID. No third-party push services, no `next-pwa` / workbox.

- **VAPID keys:** generated once via `node scripts/generate-vapid-keys.js` (depends on `web-push`). Two env vars:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — exposed to the browser, passed to `pushManager.subscribe({ applicationServerKey })`.
  - `VAPID_PRIVATE_KEY` — server only, used by `web-push.setVapidDetails()`.
  - Rotating either key invalidates every existing subscription — clients have to re-enable from `/profile`.
- **Mock mode:** when VAPID keys are missing, `src/lib/push/send.ts` logs the payload and returns. The data layer (`src/lib/data/push-subscriptions.ts`) keeps an in-memory array via `__resetMockPushSubscriptions()`. Notification controls still render and behave correctly without keys.
- **Database:** `push_subscriptions` table (migration 005). One row per browser/device, unique on `endpoint`. RLS scoped so members/staff can only manage their own rows; service role bypasses RLS for server-side delivery. The check constraint `member_id IS NOT NULL OR staff_id IS NOT NULL` prevents orphan subscriptions.
- **Service worker handlers:** `push` shows the notification, `notificationclick` focuses any existing Tigress tab and navigates to `data.url` (or opens a new window). Bump `CACHE_VERSION` if either handler shape changes.
- **Sender API:** `sendPushToMember` / `sendPushToMembers` in `src/lib/push/send.ts`. Both are fire-and-forget with try/catch — push failures must NEVER break booking or invite flows. 404/410 responses trigger automatic cleanup of the dead subscription.
- **Triggers (current):**
  - `createBookingAction` → notifies the booker ("Booking Confirmed").
  - `cancelBookingAction` → notifies every accepted invitee ("Session Cancelled"). The booking snapshot is fetched BEFORE cancelling so we always see the original invite list.
  - `createInviteAction` → notifies the invitee ("Session Invite").
  - Booking reminders are deliberately deferred — they need a cron job, which is out of scope for Phase 2.
- **Client component:** `src/components/pwa/PushSubscription.tsx` (mounted on `/profile`). Detects iOS/standalone/permission state via a small state machine and only shows the toggle when the browser can actually subscribe. Server actions live in `src/app/actions/push.ts` (`subscribePush`, `unsubscribePush`, `getPushStatus`).
- **iOS constraint:** Web Push only works on iOS 16.4+ AND only in standalone (home-screen-installed) mode. The toggle shows "Install Tigress to your home screen" when iOS Safari isn't installed; "Notifications require iOS 16.4+" when standalone but PushManager is missing.

## No-show tracking (Session 16)
Staff/manager/owner can flag completed bookings as no-shows. Purely
informational — there are NO automatic consequences (no credit penalties, no
booking blocks). Policy decisions live in a future session.

- **Schema:** `bookings.no_show boolean NOT NULL DEFAULT false` (migration 006)
  plus a partial index `(member_id, no_show) WHERE no_show = true` so
  per-member counts stay cheap. The "completed-only" rule is enforced in the
  application layer (`markNoShow` / `unmarkNoShow`) — a CHECK against `status`
  would fight the auto-complete sweep's UPDATE ordering.
- **Type note (fixed in Session 17):** `no_show` is a boolean column, NOT a
  booking status. The `BookingStatus` union is `"confirmed" | "cancelled" |
  "completed"` — nothing ever writes `status = 'no_show'`. Filters for
  historical bookings use `status.in.(completed,cancelled)` with the
  `no_show` flag applied separately.
- **RLS:** the existing `bookings update: own or staff` policy already covers
  staff writes to `no_show`, so migration 006 adds no new policies.
- **Data layer:** `markNoShow` / `unmarkNoShow` / `getNoShowCountForMember` /
  `getNoShowHistoryForMember` in `src/lib/data/bookings.ts`. History is
  bounded to the most-recent 50 rows. Audit log entries (`no_show_marked` /
  `no_show_unmarked`, entity_type `booking`) are written best-effort and
  never block the caller.
- **Server actions:** `src/app/actions/no-show.ts`. `markNoShowAction` /
  `unmarkNoShowAction` enforce a **48-hour window** (booking must have ended
  in the last 48h) so old records can't be silently rewritten.
  `getNoShowStatsAction` returns `{ count, recentNoShows }` for staff UI.
- **Calendar surfaces:** the day-view fetch now includes `completed` bookings
  (not just `confirmed`) so the agenda can show the No-Show badge, the
  "Mark no-show" / "Undo" controls, and the desktop slot's rose ring.
  The week-view cell carries a `no_show_count` and renders a small rose dot
  in the heat-map. `CalendarSlot.is_completed` / `is_no_show` / `ends_at` /
  `member_id` flow from the data layer to the renderer.
- **Member detail page:** new "No-shows" section under "Recent history"
  shows the count badge and a list of flagged bookings (table + date).
  The existing past-bookings list also gains a small No-Show pill next to
  the status label so staff can spot them in context.
- **Out of scope this session:** no changes to the Floor view (real-time
  operational; historical no-shows would clutter it) and no changes to
  booking creation, cancellation, or credit flows.

## Booking reminders (Session 17)
A scheduled job delivers a Web Push reminder ~1 hour before each member
session starts. No in-app notifications, no SMS, no email — this is the push
stack from Session 15 reused on a schedule.

- **Schema:** `bookings.reminder_sent_at timestamptz NULL` (migration 007).
  NULL means no reminder has been sent; the cron stamps `now()` after a send
  attempt. No new index — the cron query filters on `starts_at` first
  (covered by migration 004's composite indexes) before checking the column.
- **Scheduler:** `.github/workflows/booking-reminders.yml` runs every 15
  minutes and `curl`s the endpoint with
  `Authorization: Bearer $CRON_SECRET`. Originally this used Vercel Cron
  (`vercel.json` `crons` block) but Vercel Hobby caps cron frequency at
  1/day, so we moved the trigger to GitHub Actions. The route itself is
  unchanged. If the deployment ever moves to Vercel Pro, add the `crons`
  block back to `vercel.json` and delete the workflow.
- **Route:** `src/app/api/cron/booking-reminders/route.ts`. Verifies the
  bearer token first (401 otherwise), short-circuits with `{ sent: 0 }` in
  mock mode, otherwise computes the UTC window `[now+45min, now+75min]` and
  sends one push per booking. `reminder_sent_at` is stamped AFTER a push
  attempt so a failing push retries on the next tick. Per-booking failures
  are logged and do not halt the batch.
- **Data layer:** `getBookingsNeedingReminder(windowStartUtc, windowEndUtc)`
  and `markReminderSent(bookingId)` in `src/lib/data/bookings.ts`. The query
  filters `status = 'confirmed'`, `booking_type = 'member'`, the
  `starts_at` range, and `reminder_sent_at IS NULL`. Walk-ins, admin
  blocks, cancelled/completed bookings, and already-reminded bookings are
  excluded by construction.
- **Idempotency:** `reminder_sent_at` is the idempotency key — a duplicate
  run in the same window cannot send a second reminder. GitHub-Actions
  schedule drift (can be several minutes under load) is absorbed by the
  30-minute-wide window. The push payload also carries
  `tag: reminder-<id>` so the device collapses any residual duplicate
  notification.
- **Required secrets:**
  - **Vercel env var** `CRON_SECRET` — any random string (e.g.
    `openssl rand -hex 32`). The route 401s when it's unset or the header
    doesn't match.
  - **GitHub Actions secrets** `CRON_SECRET` (same value as the Vercel env
    var) and `CRON_TARGET_URL` (deployment origin, e.g.
    `https://tigress.vercel.app`). Without both, the workflow fails fast
    with an error.
- **Mock mode:** `getBookingsNeedingReminder` filters the in-memory
  `MOCK_BOOKINGS` array, `markReminderSent` mutates the row, and the cron
  route returns `{ sent: 0, mock: true }` without touching the data layer
  so local dev stays quiet.

## Daily checklists & SOPs (Session 18)
Staff-facing operational checklists. Manager/owner defines reusable templates
(Opening, Closing, Weekly Deep Clean, …) and each day today's instances are
materialised lazily from the active templates on first access. No cron — the
first staff load of `/checklists` does the work.

- **Schema:** migration 008 adds four tables:
  - `checklist_templates` — reusable definitions (name, description, category,
    is_active, sort_order).
  - `checklist_template_items` — ordered items inside a template.
  - `checklist_instances` — one per `(template_id, date)`, generated lazily.
    The `UNIQUE(template_id, date)` constraint makes the lazy-create race-safe
    — concurrent requests upsert with `onConflict: 'template_id,date',
    ignoreDuplicates: true` and then re-fetch.
  - `checklist_instance_items` — copied from the template item at creation
    time (label + description). `template_item_id` is kept for traceability
    but `ON DELETE SET NULL` so removing a template item doesn't break
    historical instances.
- **Items are copied, not referenced.** Editing a template tomorrow doesn't
  rewrite yesterday's record — staff always see exactly what they were asked
  to do on the day.
- **RLS:** staff read everything and can INSERT/UPDATE instances + instance
  items (so they can lazily create the day's checklists and tick boxes).
  Manager/owner additionally have full CRUD on templates + template items.
  Members have no access.
- **Data layer:** `src/lib/data/checklists.ts` (dual-mode).
  - `getChecklistsForDate(date)` does the lazy create and returns
    `ChecklistInstanceWithItems[]` for the UI.
  - `toggleChecklistItem(itemId, staffId)` flips one item. When the flip
    completes the instance, stamps `completed_at`/`completed_by`; unchecking
    on a completed instance clears those fields.
  - `updateChecklistTemplateItems(templateId, items)` replaces ALL items for
    a template in one call (deletes items missing from the payload, updates
    existing rows by id, inserts new ones). Simpler than per-row CRUD for an
    ordered list and matches the editor UI.
  - `deleteChecklistTemplate` is a soft-delete (sets `is_active = false`) so
    historical instances remain valid.
- **Server actions:** `src/app/actions/checklists.ts`. Template + history
  actions enforce manager/owner; instance read/toggle actions only require
  staff. All revalidate `/checklists` (and relevant sub-paths) on success.
- **UI routes:**
  - `/checklists` — staff-facing daily view. Date picker can look back; past
    dates are read-only. Items have an optional description that expands
    inline.
  - `/checklists/templates` + `/checklists/templates/new` +
    `/checklists/templates/[id]` — manager/owner only. Simple up/down arrows
    instead of drag-and-drop so the editor works on mobile without a dep.
  - `/checklists/history` — manager/owner only. Date-range + template filter,
    each row expands to show which items were checked by whom.
- **Nav:** `ClipboardCheck` icon added to both `StaffMobileNav` (labelled
  "Checks") and `StaffSidebar` (labelled "Checklists"). The sidebar grows a
  new "Manager" section visible to manager/owner that links to Templates and
  Checklist history.
- **Mock mode:** `MOCK_CHECKLIST_TEMPLATES` + `MOCK_CHECKLIST_TEMPLATE_ITEMS`
  seed three realistic templates (Opening 6 items, Closing 6 items, Weekly
  Deep Clean 5 items). Instances and instance items are pushed into
  `MOCK_CHECKLIST_INSTANCES` / `MOCK_CHECKLIST_INSTANCE_ITEMS` on first access
  for a date. `__resetMockChecklistInstances()` is exported for tests; the
  standard `resetMockData()` helper also clears them between runs.

## Recipe book (Session 19)
Structured reference for bar staff. Manager/owner curates drink recipes with
categorised ingredients (name + amount + unit) and ordered steps; all staff
can browse and search. Members have no access — recipes are an operational
concern, not a member-facing feature.

- **Schema:** migration 009 adds three tables:
  - `recipes` — header row (name, category, optional notes/prep-time/image).
    Category is constrained by CHECK to
    `cocktails | mocktails | shots | beer | coffee | other`. Soft-delete via
    `is_active = false`.
  - `recipe_ingredients` — one row per ingredient line, with `amount`
    (nullable for "to taste") and `unit` (nullable, constrained by CHECK to
    a fixed list — `ml`, `oz`, `cl`, `dash(es)`, `splash`, `piece(s)`,
    `slice(s)`, `sprig(s)`, `scoop(s)`, `tsp`, `tbsp`, `cup`, `drop(s)`,
    `pinch`, `whole`). A trigram GIN index on `lower(name)` keeps ingredient
    search fast.
  - `recipe_steps` — ordered instruction lines keyed by
    `(recipe_id, step_number)`.
- **pg_trgm:** the migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
  Supabase has it available; if for some reason it isn't, drop the trigram
  index — plain `ILIKE` still performs fine at the catalogue's expected
  scale (<500 recipes).
- **RLS:** staff SELECT all three tables; manager/owner have full CRUD.
  Members have no policies at all.
- **Data layer:** `src/lib/data/recipes.ts` (dual-mode).
  - `getRecipes({ category?, search?, activeOnly? })` runs two ILIKE queries
    (one on `recipes.name`, one on `recipe_ingredients.name`), unions the
    resulting recipe IDs, then fetches + batches the detail. This is what
    powers "margarita" (by name) AND "campari" (by ingredient) searches. In
    mock mode the same filter runs in-memory.
  - `createRecipe` inserts recipe → ingredients → steps. If either child
    insert fails, the recipe row is rolled back so there's no orphan.
  - `updateRecipeIngredients` / `updateRecipeSteps` are full-replacement
    updates — same pattern as checklist template items (delete rows missing
    from the payload, update existing rows by id, insert the rest).
  - `deleteRecipe` is a soft-delete (`is_active = false`). No hard delete
    exposed via the UI.
- **Server actions:** `src/app/actions/recipes.ts`. Reads require staff+;
  writes require manager/owner. All mutations revalidate `/recipes` and
  `/recipes/[id]`.
- **UI routes (staff console):**
  - `/recipes` — searchable + category-filterable list. The whole catalogue
    is prefetched server-side and filtered client-side because it's small
    and staying instant is more valuable than a round-trip per keystroke.
    Manager/owner see "Add recipe".
  - `/recipes/[id]` — detail view, optimised for glanceability while
    making a drink (large step type, ingredients with an accent-coloured
    left rail). Manager/owner see "Edit".
  - `/recipes/new` + `/recipes/[id]/edit` — manager/owner only.
    `RecipeEditor` uses up/down arrows (mobile-friendly, no DnD dep),
    delete-row buttons, and a fixed unit dropdown. Archive button sits at
    the bottom of the edit form.
- **Ingredient display:** `<amount> <unit> <name>` when the amount is set
  (e.g. "60 ml Tequila"); `<name> — to taste` when amount is null.
- **Nav:** `BookOpen` icon added to `StaffMobileNav` (between Checks and
  Walk-in) and to the Operations section of `StaffSidebar`.
- **Mock mode:** `MOCK_RECIPES` seeds five realistic recipes — Margarita,
  Espresso Martini, Virgin Mojito, Jägerbomb, Long Black — each with proper
  ingredients and steps. `MOCK_RECIPE_INGREDIENTS` + `MOCK_RECIPE_STEPS`
  hold their detail rows. `resetMockData()` restores all three arrays.

## Social feed (Session 20)
Community feed shared across all authenticated roles (member/staff/manager/
owner). Container for future tournament results and achievement unlocks —
the data model already supports `system_generated = true` posts, but no
auto-post logic is wired this session.

- **Route group:** lives under `(community)/` so both members and staff see
  the same `/feed` page. `RouteGuard` allows every authenticated role.
- **Schema:** migration 010 adds two tables:
  - `posts` — polymorphic authorship: `author_member_id` XOR `author_staff_id`
    for human authors, OR `system_generated = true` with both nulls. A
    `posts_authorship` CHECK constraint enforces this at the DB so bad writes
    are rejected. Media is `media_type IN ('none','youtube','image')` with a
    matching `posts_media` CHECK on `media_url`. Soft-deleted via
    `deleted_at` (no hard deletes).
  - `post_likes` — liker_member_id XOR liker_staff_id, with two partial
    unique indexes enforcing one-like-per-liker-per-post.
- **YouTube IDs, not URLs:** `media_url` stores the 11-char video id when
  `media_type = 'youtube'`. Embeds render via
  `https://www.youtube-nocookie.com/embed/<id>` (privacy-enhanced). The
  parser `src/lib/youtube.ts` handles all 7 URL variants (watch, youtu.be,
  embed, shorts, m., etc.) and rejects anything else. Image URLs are stored
  as-is — they must be https + end in `.jpg/.jpeg/.png/.gif/.webp`.
- **Moderation:** RLS allows INSERT on `posts` (self-author) and
  SELECT/INSERT/DELETE on `post_likes` (self-liker). UPDATE and DELETE on
  `posts` are NOT covered by any policy, which makes them deny-by-default
  for the anon/authenticated roles. Soft-delete goes through the service
  role via `deletePostAction`, which enforces "author OR manager/owner" in
  application code.
- **Data layer:** `src/lib/data/posts.ts` (dual-mode).
  - `listFeed({ beforeCursor?, limit?, currentUser })` does cursor
    pagination on `created_at DESC` — asks Supabase for `limit + 1` rows
    and uses the extra row's timestamp as `nextCursor`. The real-mode
    query uses embedded-resource joins (`author_member:members!...`,
    `post_likes(...)`) so the whole page — authors, like counts, and
    likedByCurrentUser — comes back in one round trip. No N+1.
  - `toggleLike` is idempotent: inspects current state, inserts or deletes,
    returns the new count.
  - `softDeletePost` uses the service-role admin client in real mode (RLS
    blocks UPDATE on posts).
- **Server actions:** `src/app/actions/posts.ts`.
  - `createPostAction` validates body (1–500 chars, trimmed) and resolves
    the optional media URL: YouTube-shaped URLs go through
    `extractYouTubeVideoId` (reject on null), https image URLs must end
    with a supported image extension, anything else is rejected.
  - `deletePostAction` authorises "author OR manager/owner" before calling
    the data layer.
  - `toggleLikeAction` is optimistic — returns `{ liked, newCount }` so
    clients can render immediately; no `revalidatePath` call because
    likes aren't audit-logged and don't need a route refetch.
  - Audit log: `post.created` and `post.deleted` are written best-effort to
    the existing `audit_log` table (mock mode skips them). Likes are NOT
    audit-logged — too noisy.
- **UI:** `src/components/feed/`.
  - `FeedClient` is the interactive shell: holds posts + cursor in state
    so create/delete/load-more mutate the list locally without a
    full-page refetch.
  - `PostComposer` is inline at the top of the feed (no separate
    `/feed/new` route). Live char counter turns amber at 480 and rose at
    501+. Media URL input shows an inline preview for YouTube/image.
  - `PostCard` renders author row, linkified body, media, like button,
    and (conditionally) a delete button. Delete confirms via
    `window.confirm`.
  - `LikeButton` is optimistic — flips state + count immediately, reverts
    on action failure, then reconciles with the server's authoritative
    count so concurrent likes from another session aren't lost.
  - `PostImage` uses a plain `<img>` (not `next/image`) so we don't have
    to maintain a domain allow-list for arbitrary user URLs.
- **Linkification:** plain-text regex on `https?://…` produces external
  anchors with `target="_blank" rel="noopener noreferrer"`. No markdown.
- **Nav:** `MessageCircle` icon added to `MemberNav` and both staff navs
  (`StaffMobileNav`, `StaffSidebar`). Same URL for everyone — `/feed`.
- **Mock mode:** `MOCK_POSTS` seeds 8 posts spanning ~2 weeks with author
  variety (staff / manager / owner / 4 members) and one YouTube + one
  image example. `MOCK_POST_LIKES` seeds realistic like counts and
  includes likes by `mock-member-row-1` (Mona) so the "liked by current
  user" state is visible when signed in as the primary member.
- **Future use:** `system_generated = true` is reserved for auto-posts
  from tournament results (Session 21) and achievement unlocks. The row
  shape is supported top-to-bottom (DB CHECK, types, data layer enrichment
  returns `{ kind: 'system' }`, PostCard renders a "System" badge) but no
  code writes such rows yet.

## Competitions module (Session 21)
Tournaments, leagues, ladders, and casual matches. Ships as an intentionally
isolated module so it can be lifted out into a standalone product later.

- **Module layout:** all module code lives under `src/competitions/`.
  Nothing outside imports from there except route pages in
  `src/app/(owner)/competitions/**` and the sidebar nav entry in
  `src/components/ui/StaffSidebar.tsx`. Nothing inside imports from the
  rest of the app except through the Player adapter
  (`src/competitions/data/players.ts`), the audit wrapper
  (`src/competitions/audit.ts`), and the events hook
  (`src/competitions/events.ts`). `tests/competitions/boundary.test.ts`
  is a grep test that asserts these rules on every CI run — if you add a
  new integration point, update both the allowlist and this paragraph.
- **Table prefix:** all 9 new tables use `comp_` — `comp_game_types`,
  `comp_player_skills`, `comp_guests`, `comp_teams`, `comp_team_members`,
  `comp_competitions`, `comp_competition_entrants`, `comp_matches`,
  `comp_match_results`. Prefix exists so a future extraction can find
  everything with one `LIKE 'comp_%'`.
- **Player adapter:** `Player` and `PlayerRef` are the module's internal
  identity currency. `data/players.ts` is the ONLY file that imports
  `@/lib/data/members`, `@/lib/data/staff`, or `@/lib/auth/*`. Every
  other file in the module works with the adapter's types and has no
  idea Tigress has a `members` table. If the module is extracted, this
  file is where the rewrite happens.
- **Polymorphic entrants:** a single `comp_competition_entrants` row
  carries exactly one of (`entrant_member_id`, `entrant_guest_id`,
  `entrant_team_id`). Matches reference entrants, not players, so
  guest-vs-member and team-vs-team flow through identically. DB enforces
  the XOR via a CHECK constraint plus partial unique indexes per subject
  kind.
- **Manual handicap:** `comp_player_skills.skill_level` (integer 1..10)
  is display-only. Each match carries its own `race_to_a` and `race_to_b`
  columns so organisers set the handicap explicitly at match-creation
  time. No automatic SL-based adjustment.
- **Team-night structure:** `comp_matches.parent_match_id` links
  sub-matches of a team-vs-team night — the parent row is the overall
  team match, child rows are the individual singles / doubles that make
  it up. Individual competitions leave `parent_match_id` null.
  `team_match_config` JSONB on `comp_competitions` defines the slot
  shape; resolution into child match rows happens in S23.
- **Loose booking link:** `comp_matches.booking_id` is a nullable FK to
  `bookings`. Staff book the table manually via the existing booking
  flow; the match row just annotates which booking it happened on.
- **Audit events:** every module write uses `writeCompAuditLog(...)`
  which prefixes the action with `comp.` so extraction-time grep finds
  the lot. Events cover competitions, entrants, matches, results, teams,
  guests, and skill updates.
- **S21 scope:** foundation-only. Ships the tables, Player adapter,
  dual-mode data layer for all 9 tables, minimal server actions,
  owner-only `/competitions` admin (list + new + detail view), and the
  boundary test. **No** bracket generation, **no** standings, **no**
  member-facing UI, **no** feed auto-posts. Those arrive in S22+.
- **Mock mode:** seed data lives in `src/competitions/data/mock-data.ts`
  (module-owned, separate from the top-level mock-data). One draft
  tournament + one draft league, 2 teams, 2 guests, skill levels for
  the 4 mock members. The top-level `resetMockData()` helper imports +
  clones these arrays so tests stay isolated.

## Single-elimination tournaments (Session 22)

First playable format. Members register during `registration_open`, manager
publishes the bracket (auto-seeds by registration order when seeds aren't
set), the WINNING player of each match reports their result, and the
system auto-advances the winner into the next round. The module's
`Player` adapter continues to be the ONLY identity-aware file.

- **Pure generator:** `src/competitions/lib/bracket.ts` is a zero-dep,
  no-DB, no-React function that takes `SeededEntrant[]` and returns
  `BracketMatchSpec[]`. Validates N >= 2 and contiguous 1..N seeds.
  Standard recursive top-down seeding — QFs 1v8/4v5/2v7/3v6 for an
  8-bracket, SFs 1v4/2v3, Final 1v2. Byes always go to the top seeds.
  Every spec carries a `feedsInto` pointer (round+1, `ceil(pos/2)`) plus
  `feedsIntoSlot` ("a" for odd positions, "b" for even).
- **Migration 012:**
  - `comp_matches.is_walkover boolean NOT NULL DEFAULT false`.
  - `entrant_a_id` / `entrant_b_id` drop NOT NULL — round 2+ matches
    persist with NULL entrants and are filled by auto-advance.
  - New CHECK `comp_matches_entrants_when_active` requires both
    entrants the moment a match leaves `scheduled`.
  - Three new RLS policies: members self-register during
    registration_open, flip their own row to `withdrawn`, and insert a
    result on a match they're a participant in. The winner-must-report
    rule is application-enforced, not SQL.
- **Persistence — `data/bracket.ts`:**
  - `persistBracket` INSERTs every round's matches up-front. Round 1
    byes land as `is_walkover=true`, `status='completed'`, with a
    synthetic result row (score 0-0, winner = the non-bye side). Rounds
    2..R are scheduled placeholders with NULL entrants. Re-publish is
    rejected — managers must `clearBracket` first.
  - `advanceWinner` writes the winner into the downstream slot via a
    `(competitionId, round, position)` lookup. Returns `null` for the
    final.
  - `revertAdvance` walks the chain: when an upstream result is cleared
    or overridden, the downstream slot is nulled and any downstream
    result is deleted + status reverted to scheduled.
  - `clearBracket` deletes every match and result for a competition.
- **Action layer — `actions/`:**
  - `registration.ts` — members register / withdraw. Pre-bracket
    withdrawal deletes the entrant row; `in_progress` withdrawal flips
    `status='withdrawn'`, forfeits every active match as a walkover
    with the opponent advancing.
  - `bracket.ts` — `publishBracketAction` (manager+) auto-seeds when
    seeds are missing, calls `persistBracket`, and transitions the
    competition to `in_progress`. `clearBracketAction` wipes matches
    and returns the competition to `registration_open`.
  - `seeding.ts` — bulk-set seeds or Fisher-Yates random seed. Two-phase
    writes (clear first, stamp after) so the DB unique index never
    conflicts mid-update.
  - `results.ts` — `reportMatchResultAction` for members (enforces the
    "winning player reports" rule and race-to score sanity).
    `overrideMatchResultAction` for manager+; when an override would
    invalidate a completed downstream match, the caller MUST pass
    `cascadeRevert: true` — otherwise the action refuses so the bracket
    stays consistent. `clearMatchResultAction` wipes a result and
    cascades through downstream advances.
  - Completing the final transitions the competition to `completed` and
    fires `emitCompEvent({ kind: "competition_completed" })` (no-op
    placeholder until S26's feed auto-posts).
- **UI — `/competitions`:** consolidated into the `(community)` route
  group (allowed to every authenticated role). The old
  `(owner)/competitions` routes were removed to avoid a path collision
  (Next.js route groups don't participate in the URL, so two groups
  can't own `/competitions/page.tsx` simultaneously). Role checks
  inside each page gate the write controls — members see a read-only
  bracket + their register/withdraw CTA, manager/owner see the same
  bracket plus Publish / Clear / Override controls.
- **Components:** `Bracket.tsx` renders a column-per-round grid with an
  inline `ReportResultButton` per match card (members only see it when
  they're a participant in a scheduled match; managers see it for every
  fully-populated match via the override flag). `RegistrationButton.tsx`
  drives the member register/withdraw flow. `PublishBracketButton.tsx`
  is the manager-facing publish / clear control.
- **Navigation:** `/competitions` is now in every top-level nav — Trophy
  in `MemberNav` (between Bookings and Feed), `StaffMobileNav` (as
  "Compete"), and the Operations section of `StaffSidebar`.
- **Mock mode:** three lifecycle-showcase tournaments are seeded
  alongside the original draft so dev / preview can render every
  bracket state without manually publishing:
  `comp-tournament-regopen-1` (registration_open, 4 members),
  `comp-tournament-inprogress-1` (in_progress with R1 complete, R2
  final waiting), `comp-tournament-completed-1` (fully played, Mona
  champions). The original `comp-tournament-draft-1` is kept as the
  draft fixture that S21/S22 tests depend on.
- **Audit events added:** `comp.bracket.published`,
  `comp.bracket.cleared`, `comp.entrant.self_registered`,
  `comp.entrant.self_withdrew`, `comp.match.advance_triggered`.
- **Out of scope this session:** double elimination / round-robin /
  Swiss (S24), league standings (S23), ladder mechanics (S25), feed
  auto-posts on completion (S26 — `emitCompEvent` stays a no-op),
  scheduling integration with bookings, real-time WebSocket bracket
  updates.

## League foundation (Session 23)

Second playable competition format. Ships the schema, config model,
manual fixture creation, captain lineup + result workflow, and a pure
standings computation for the most common config (single round-robin,
win=3/draw=1/loss=0, strict roster). The configurable league engine
continues in S24 (schedule generator, multi-team galas,
promotion/relegation, alternative configs).

- **Migration 013** adds 5 tables: `comp_seasons`, `comp_divisions`,
  `comp_fixtures`, `comp_fixture_participants` (schema-only stub for
  S24 multi-team galas), `comp_match_lineups`. Plus: `comp_matches`
  grows a nullable `fixture_id` FK; `comp_competitions` grows
  `division_id` + `league_config` (JSONB) with two CHECK constraints
  (`kind <> 'league' OR division_id IS NOT NULL`,
  `kind <> 'league' OR league_config IS NOT NULL`). New RLS policies
  include captain-set-lineup, captain-clear-lineup-pre-play, and
  captain-report-sub-match.
- **Module layer split (all under `src/competitions/`):**
  - `lib/standings.ts` — pure function `computeStandings(input) →
    StandingsRow[]`. Throws `LeagueConfigNotImplementedError(feature)`
    on anything outside the supported config. Validator
    `validateLeagueConfigSupported` is called both by the standings
    engine and by `createLeagueCompetitionAction`.
  - `data/seasons.ts`, `data/divisions.ts`, `data/fixtures.ts`,
    `data/lineups.ts`, `data/league-standings.ts` — dual-mode data
    layer for each new concept.
  - `data/matches.ts` grows `createSubMatch` (pulls entrants off a
    fixture, stamps `fixture_id` + race-to from the slot).
  - `data/match-results.ts` grows `listResultsForCompetition` (single
    batched query; replaces the per-match dynamic-import loop the
    detail page used before).
  - `actions/seasons.ts` (owner-only), `actions/divisions.ts`
    (owner-only), `actions/fixtures.ts` (manager+),
    `actions/lineups.ts` (captain or manager+),
    `actions/league-results.ts` (captain or manager+; runs the
    fixture-complete check after every report), `actions/leagues.ts`
    (`createLeagueCompetitionAction` — validates config, rejects
    unsupported features before persisting).
  - `actions/results.ts` — `finalizeResult` now detects a league
    sub-match via `fixture_id !== null` and skips the bracket-advance
    path. Fixture completion is handled by the league-results action.
- **Polymorphic detail page:** `/competitions/[id]` now branches on
  `competition.kind` — tournaments keep the Bracket; leagues get a
  Standings table + Fixture list. Leagues also get fixture subpages
  at `/competitions/[id]/fixtures/[fixtureId]` for lineup + per-
  sub-match result reporting.
- **Supported config (S23):**
  - `fixture_format: "flexible"`
  - `home_away: "tracked" | "label_only"`
  - `points.rule: "win_draw_loss"` (any whole-number values)
  - `lineup.rule: "strict"`
  - `tiebreakers: ["head_to_head", "sub_match_diff"]` (in order)
  - Everything else is stored but throws
    `LeagueConfigNotImplementedError(feature)` with the feature name.
  - `defaultSupportedLeagueConfig(slots)` returns 3-1-0 with the two
    standard tiebreakers — used by the "Use default config" button.
- **Standings algorithm:**
  1. Validate config (throws on unsupported).
  2. Initialise a row per entrant.
  3. For each completed fixture, tally sub-match wins per side;
     compute the fixture winner / draw; award win/draw/loss points
     and increment sub-match counters.
  4. Sort by points desc, then each configured tiebreaker in order
     (head-to-head: points scored between the two teams; sub-match
     diff: aggregate `+/-`), then a stable alphabetic fall-through on
     entrant id.
  5. Stamp 1-based positions.
- **Captain workflow:**
  1. Manager creates a fixture (home + away team, date).
  2. Manager creates sub-matches per the league's `sub_match_slots`
     (one `comp_matches` row per slot with `fixture_id` stamped).
  3. Each captain sets their side's lineup on each sub-match.
  4. Either captain (or a manager) reports the sub-match result.
  5. When every sub-match has a result, the fixture auto-flips to
     `completed` and `emitCompEvent({ kind: "match_completed" })`
     fires (no-op until S26).
- **Season + division model decoupled from leagues by
  `league_name`:** a division belongs to
  (season, league_name, tier). `league_name` is a plain text column,
  not a FK — "Wednesday Night" can reappear each season and S24's
  promotion/relegation will use name reuse to wire seasons together.
- **Sub-match linkage via `fixture_id`**, not `parent_match_id`.
  `parent_match_id` stays reserved for match-of-matches nesting
  (S24 team-night round shapes).
- **Mock mode (`src/competitions/data/mock-data.ts`):** 2 seasons
  (Spring 2026 active, Winter 2025 completed), 4 divisions (2 per
  season, same league names so S24 tests can test name-reuse), 2
  extra teams (Cue Crew + Break Point) plus rosters, 2 league
  competitions in the Spring season (in_progress Premier, open Div 1),
  4 fixtures on the Premier league (2 completed with full results +
  lineups, 1 in_progress with partial results, 1 scheduled with no
  lineups). Results produce meaningful W/D/L across teams so the
  standings table renders with variety.
- **UI entry points:**
  - `/competitions/[id]` — polymorphic detail page.
  - `/competitions/[id]/fixtures/[fixtureId]` — fixture detail with
    lineup forms (captain/manager) and sub-match report buttons.
  - `/leagues` — lists current league competitions.
  - `/leagues/seasons` — owner admin (create + status transitions +
    archive).
  - `/leagues/divisions` — owner admin (create + delete, FK-restricted).
- **Nav:** `StaffSidebar` owner section grows `Seasons` + `Divisions`
  links (under the existing Settings / Rates entries).
- **Audit events added:** `comp.season.created`,
  `comp.season.status_changed`, `comp.season.archived`,
  `comp.division.created`, `comp.division.deleted`,
  `comp.fixture.created`, `comp.fixture.status_changed`,
  `comp.fixture.cancelled`, `comp.fixture.postponed`,
  `comp.fixture.completed`, `comp.lineup.set`, `comp.lineup.cleared`,
  `comp.league.created`.
- **Boundary:** the boundary test allowlist grew one entry
  (`src/app/(community)/leagues/`) — the module itself remains
  imported only through the Player adapter, audit helper, and
  events hook.
- **Out of scope this session:** round-robin / double-round-robin
  schedule generator, multi-team galas (schema landed, logic in S24),
  promotion/relegation between seasons, win_loss / per_sub_match
  points configs, loose lineup rule + sub-with-approval, configurable
  tiebreakers beyond the two listed, mid-season roster changes that
  affect already-played fixtures.

## Scheduling foundation (Session 25)

First scheduling session. Manager builds a weekly draft (auto-materialised
from FT standing assignments), assigns staff to shifts, then publishes —
which fires a Web Push to every assigned staff member. Staff submit PT
availability per week and view the published schedule. No clock-in,
swaps, or no-shows yet (S26); no payroll (S27).

- **Module layout:** `src/scheduling/` (host-folded — no boundary test).
  - `lib/coverage.ts`, `lib/materialize.ts`, `lib/availability-check.ts`
    are pure functions covered by `tests/scheduling/lib/*.test.ts`.
  - `data/templates.ts`, `data/qualifications.ts`,
    `data/ft-assignments.ts`, `data/availability.ts`, `data/weeks.ts`
    are dual-mode (mock + real) data accessors.
  - `actions/templates.ts`, `actions/qualifications.ts`,
    `actions/ft-assignments.ts`, `actions/availability.ts`,
    `actions/weeks.ts` are the server-action surface.
  - `audit.ts` writes `schedule.*` events into the existing
    `audit_log` table.
- **Schema (migration 018):**
  - `schedule_shift_templates` — reusable shift definitions.
  - `schedule_template_day_coverage` — per-(template, day_of_week)
    role requirements (jsonb). Missing row = template doesn't run that
    day.
  - `user_qualifications` — many-to-many of staff -> qualification
    (`bartender | floor | mod`).
  - `schedule_ft_assignments` — recurring weekly contract for FT staff.
    `(effective_from, effective_until)` window allows contract changes
    without rewriting history.
  - `schedule_availability` — PT submissions per (user, week). Multiple
    blocks per day allowed.
  - `schedule_weeks` — per-week container. Status:
    `draft | published | archived`. Carries `published_at`,
    `published_by`, and `publish_override_note`.
  - `schedule_shifts` — concrete assigned shift rows. `user_id NULL` =
    scaffolded slot waiting on a person; manager fills people in
    second.
- **Identity convention:** `user_id` columns reference
  `public.staff(id)` directly — same convention as `comp_*` and
  `checklist_*`. The S25 spec called for `auth.users` but the
  codebase-wide convention is the staff PK; that's what the data
  layer + RLS use.
- **Mon=0..Sun=6:** week starts Monday.
  `weekStartFor(date)` and `dayOfWeekFor(date)` in
  `lib/materialize.ts` are the canonical converters; everything else
  layers on top of them.
- **RLS:**
  - Templates + day-coverage + qualifications: read by every
    authenticated staff, write by manager/owner.
  - FT assignments + availability: read by self or manager/owner;
    write by self (availability) or manager/owner (FT).
  - `schedule_weeks`: drafts visible only to manager/owner; published
    visible to all staff. Backed by SECURITY DEFINER helper
    `schedule_user_can_see_shift(week_id)` so the per-shift policy
    can re-use the same predicate.
  - `schedule_shifts`: write manager/owner; read gated by the helper.
- **Atomic RPCs:** `schedule_publish_week(week_id, publisher_id, note)`
  and `schedule_unpublish_week(week_id)`. Mock mode runs the same
  state transitions in-memory.
- **Coverage gate on publish:** publish is blocked when any
  (template, date, role) requirement is under-staffed UNLESS the
  manager supplies an override note (`publishWeekAction({weekId,
  overrideNote})` — first call returns `{requiresOverride: true,
  gaps}`, second call with the note succeeds and writes
  `schedule.week.published_with_override` instead of
  `schedule.week.published`).
- **Assignment validator (`assignUserToShiftAction`)** runs three
  checks before writing:
  1. User has the qualification for the shift's role.
  2. PT availability covers `[start_time, end_time)` on that day, OR
     FT standing assignment covers the (template, dow) on that date.
  3. No same-day overlapping shift already assigned to the user.
  All three are application-layer; the DB doesn't enforce them.
- **Push notifications** reuse the existing Web Push pipeline via
  new `sendPushToStaff(staffId, payload)` /
  `sendPushToStaffMembers(staffIds, payload)` helpers in
  `src/lib/push/send.ts`. Triggers:
  - `publishWeekAction` → "Your shifts are up: N this week" to every
    assigned staff.
  - `unpublishWeekAction` → "Schedule … is being revised" to every
    previously-assigned staff.
  - `assignUserToShiftAction` after publish → "New shift assigned" to
    the new assignee.
  - `unassignUserFromShiftAction` after publish → "Shift removed" to
    the previous assignee.
  Tier 1 push subscriptions already accept `staff_id` so no schema
  change was needed; the helpers added a staff lookup path alongside
  the existing member ones.
- **Routes:**
  - `/staff/schedule` — published weekly view (all roles). Defaults to
    "my shifts", toggle for full team.
  - `/staff/availability` — PT submission widget. Two tabs (this week
    + next week), day grid with multi-block support. FT staff see a
    read-only banner explaining their FT contract covers everything.
  - `/manager/scheduling` — build/publish workspace. Per-day cards
    show scaffolded shifts + add-slot buttons; assign modal filters
    eligible users client-side using the same pure
    `isUserAvailableForShift` + `timeRangesOverlap` checks the server
    action enforces.
  - `/manager/settings/shift-templates` — template + per-day
    coverage editor.
  - `/manager/users` — staff list with qualification chips and FT
    assignment add/end controls.
- **Mock mode (`src/scheduling/data/mock-data.ts`):** AM/PM/Closer
  templates with the spec's day coverage matrix; quals seeded for
  every mock staff (FT all three, PT bartender or floor); two FT
  standing assignments (Sam AM Mon-Fri bartender, Maya PM Mon-Fri
  mod); seeded availability for the two new PT staff (Pat
  `pat@tigress.test` and Phoebe `phoebe@tigress.test`, both
  password "password"). Weeks + shifts are empty by default —
  manager workflow creates them.
- **Audit events added:** `schedule.template.created/updated/deleted`,
  `schedule.template_day_coverage.set/removed`,
  `schedule.qualifications.updated`,
  `schedule.ft_assignment.created/ended`,
  `schedule.availability.submitted/late_submitted`,
  `schedule.week.created/copied_from`,
  `schedule.shift.assigned/unassigned/time_overridden/removed`,
  `schedule.week.published/published_with_override/unpublished`.
- **PT availability deadline:** Friday 18:00 SGT for the following
  week. Late submissions still go through but write
  `schedule.availability.late_submitted` instead of
  `schedule.availability.submitted` so manager review can find them.
- **Out of scope this session:** clock-in/out, hours approval, swaps,
  no-show tracking, payroll. Mid-week archive cron also deferred —
  archiving is an explicit manager action for now.

### Environment variables

| Name | Purpose | Required for |
|------|---------|--------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key, exposed to browser | Push |
| `VAPID_PRIVATE_KEY` | VAPID private key, server only | Push |
| `CRON_SECRET` | Bearer token verified by the reminders route | Booking reminders |
