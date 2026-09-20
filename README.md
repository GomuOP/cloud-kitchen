# Cloud Kitchen Subscription — fulfilment marketplace

A two-sided marketplace: kitchens (run by home cooks — "chefs") list their own meal
subscriptions; students subscribe directly to the kitchen of their choice; each kitchen
delivers its own food. The platform handles matching, capacity, billing, subscription
lifecycle, and commission settlement.

This is a portfolio project — the point is the subscription/fulfilment **domain logic**
(state machine, idempotent jobs, capacity races, dietary substitution), not the UI. Every
feature below links to where it lives and, briefly, how it works; the full reasoning
(alternatives considered, why they were rejected) is in `docs/design.md`, recorded phase by
phase as the project evolved. See `CLAUDE.md` for the project's standing rules and `DEPLOY.md`
for the deployment handoff.

## Local setup

Requires Node 20+, npm, and Docker (for Postgres).

```bash
docker compose up -d        # starts Postgres on localhost:5432
cp .env.example .env        # fill in SESSION_SECRET, ADMIN_PASSCODE
npm install
npx prisma migrate deploy   # applies the schema in prisma/migrations
npm run seed                # demo kitchens, plans, menus, a demo student
npm run test                # run the domain/unit test suite
npm run dev                 # http://localhost:3000
```

Demo logins after seeding (password `tiffin123` for every seeded student/kitchen account):
student `demo@example.com` at `/login`; kitchen owner `lakshmi@example.com` or
`kamala@example.com` at `/kitchen/login`; a third kitchen (`radha@example.com`) is seeded
`pending_approval` to demo the admin approval flow; admin at `/admin/login` with
`ADMIN_PASSCODE`.

## Features

### Two-sided kitchen marketplace

Independent kitchens (run by home cooks) each list their own subscription plans, set their
own menus, and deliver their own orders — there's no central kitchen or company delivery
fleet. The platform's job is matching (students browse/filter kitchens by delivery area),
capacity, billing, and commission settlement.

- **How it's implemented:** `Kitchen` is the central entity in `prisma/schema.prisma` —
  `Plan`, `Menu`, and `KitchenCapacity` are all scoped to a `kitchenId`; `Subscription` and
  `Order` carry `kitchenId` too, denormalized directly onto `Order` rather than derived via a
  join every read, since "this kitchen's today's orders" is the single most common query (the
  kitchen dashboard, `app/kitchen/page.tsx`). Students browse/subscribe under `app/kitchens/`;
  kitchen owners manage their own kitchen under `app/kitchen/`.

### Subscription lifecycle — a real state machine

A subscription moves through `active → paused → grace → past_due → cancelled` under a strict
transition table, not ad-hoc status flags.

- **How it's implemented:** `lib/domain/subscription/stateMachine.ts` is a pure function,
  `transition(state, event)`, over an explicit table of the ~11 legal `(state, event) → state`
  pairs; every other pair throws `InvalidTransitionError`. The full 6-state × 8-event space
  (48 pairs) is exhaustively tested in `stateMachine.test.ts`, not spot-checked. `grace` (3
  days) still delivers meals while a failed charge is retried; `past_due` (7 days) is what
  actually stops delivery — two states instead of one so a customer chasing their bank for a
  week isn't silently cancelled the moment a grace period ends. Deadlines
  (`grace_expires_at`, `past_due_expires_at`) are stored on the row when a state is entered,
  not recomputed from `status_since` at read time, so a later change to the 3/7-day config
  doesn't retroactively move subscriptions already mid-state.

### Kitchen capacity — race-safe, prevents oversell

Two students finishing checkout for the last delivery slot at nearly the same moment can't
both win it.

- **How it's implemented:** `lib/domain/capacity/reserveCapacity.ts` takes a row lock —
  `SELECT ... FOR UPDATE` on the `KitchenCapacity` row for `(date, kitchenId, mealTypeId)` —
  inside the signup transaction, checks `reservedCount < maxCapacity`, increments, and inserts
  the order, all before releasing the lock. Concurrent signups for the same slot serialize
  through that one row instead of racing. Verified with a real concurrency test, not a unit
  test with a fake: `reserveCapacity.integration.test.ts` fires 10 concurrent reservation
  calls at a row with `maxCapacity = 3` against a real Postgres instance and asserts exactly 3
  succeed. Optimistic "count-then-insert" and `SERIALIZABLE` isolation were both considered and
  rejected — see `docs/design.md` for why.

### Idempotent daily order generation

The job that turns "who's subscribed" into "today's actual orders" can be safely re-run any
number of times — after a crash, an operator retry, or an accidental double-trigger — without
ever creating duplicate orders.

- **How it's implemented:** `lib/domain/orders/generateOrders.ts` upserts one row per
  `(subscriptionId, deliveryDate, mealTypeId)` via `INSERT ... ON CONFLICT DO NOTHING`, backed
  by a real `UNIQUE` constraint on that triple in `prisma/schema.prisma` — the guarantee lives
  in the data model, not in a lock. A `pg_try_advisory_lock` around the whole pipeline
  (`lib/jobs/dailyPipeline.ts`) exists only to skip wasted duplicate work on accidental
  overlap, not as the correctness mechanism (a lock alone wouldn't help a run that crashes
  halfway through and gets retried). Each subscription is processed as its own small
  upsert rather than one giant all-or-nothing transaction, so one bad row can't roll back or
  block the other 999. `JobRun` (`UNIQUE(jobName, runDate)`) records whether a given day's run
  succeeded, so "did today's job finish" is a `SELECT`, not something inferred from logs.

### Dietary substitution

Every kitchen's daily menu covers three dietary categories; a subscriber who ordered for a
category the kitchen didn't fill that day gets a clearly-flagged substitute instead of no
meal.

- **How it's implemented:** `MenuItem` has `UNIQUE(menuId, dietaryCategory)` across `veg`,
  `jain`, `no_onion_garlic` (`veg` is the universal baseline). `lib/domain/menu/resolveMenuItem.ts`
  applies a fallback chain — `jain → no_onion_garlic → veg` — when a subscriber's preferred
  category is missing for the day, and records `substitutedFrom` (the originally requested
  category) on the order when the fallback fires. The customer UI surfaces that flag; no
  notification is sent, it's discovered when the order is viewed. Unit-tested in
  `resolveMenuItem.test.ts`.

### Billing — monthly cycles, decoupled from delivery

Monthly billing runs independently of the daily order job, so a payment-provider outage never
blocks tomorrow's meals from being scheduled, and a delivery problem never blocks billing.

- **How it's implemented:** `lib/domain/billing/billingJob.ts`'s `runBilling(date)` is called
  from `runDailyPipeline` as its own step, alongside (not inside) order generation — a billing
  failure is caught and reported via a separate `billingError` field rather than aborting order
  generation. A failed charge fires the state machine's `PAYMENT_FAILED` event, moving the
  subscription to `grace`; order generation only ever reads `status` and `cancelEffectiveAt`,
  never calls the payment provider itself. Billing cycles are a fixed 30 days (not calendar
  months, to dodge Jan-31-plus-a-month edge cases). Idempotent the same way as orders:
  `payments.idempotencyKey` prevents a retried billing run from double-charging.

### Payments — real gateway (test mode), with a zero-dependency mock fallback

Checkout goes through Razorpay's real test-mode API when keys are configured, and transparently
falls back to a deterministic mock otherwise — the app is fully functional with zero external
dependencies out of the box.

- **How it's implemented:** `lib/domain/billing/PaymentProvider.ts` defines the interface
  (`createOrder` / `verifyPayment` / `refund`); `getPaymentProvider()` returns
  `RazorpayPaymentProvider` if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set, else
  `MockPaymentProvider` — same pattern used for the LLM assistant backend below. Signup is
  split into `createSignupOrder()` (no DB writes — just asks the provider for an order) and
  `finalizeSignup()` (called only after the provider verifies payment actually happened; this
  is where capacity gets reserved and the subscription created) — a real interactive checkout
  isn't instant, so holding a capacity row lock across it isn't viable. If capacity runs out
  between order creation and payment completing, `finalizeSignup` calls `provider.refund()`
  before re-throwing, rather than taking the student's money and giving them nothing.
  `MockPaymentProvider` is deterministic, not random (an email ending `+fail@` or a receipt
  ending `:fail` always fails verification), so the failure path is demoable and testable
  without flakiness.

### Kitchen onboarding & moderation

A kitchen isn't visible to students, or able to set a menu, until a platform admin approves it.

- **How it's implemented:** `KitchenStatus` (`pending_approval → active ⇄ suspended`) on the
  `Kitchen` model, gated in `app/admin/page.tsx` (approve/suspend) and checked wherever a
  kitchen acts — `/kitchen/menu` shows an explanatory message instead of the edit form for a
  non-`active` kitchen (`lib/domain/kitchen/actions.ts`). Deliberately not a full transition-table
  state machine like subscriptions — three states is simple enough that a formal table would be
  ceremony, not clarity.

### Commission settlement (payouts)

The platform takes a cut of every successful payment; kitchens get settled in batches.

- **How it's implemented:** `lib/domain/payouts/generatePayouts.ts` aggregates every `success`
  `Payment` per kitchen where `payoutId IS NULL` into one `Payout` row (gross → commission →
  net; commission stored in basis points, e.g. `1500` = 15%, never a float percentage — money
  math stays integer end to end). Marking the aggregated payments with the new payout's id is
  the same "claim it so it can't be double-settled" idempotency pattern used for orders
  elsewhere: re-running `generatePayouts()` finds no unclaimed payments and creates nothing.
  Triggered from `/admin`.

### Customer chat assistant — two interchangeable backends

A floating, site-wide chat widget lets a logged-in student ask about or manage their own
subscriptions in plain language, with real business rules enforced underneath either backend.

- **How it's implemented:** `lib/domain/assistant/subscriptionOps.ts` holds the shared,
  ownership-checked mutation/read logic (`loadSubscriptions`, `getNextDelivery`, `applyAction`)
  used by both backends — every mutating call re-verifies `{ id: subscriptionId, userId }`
  against the session before touching anything, regardless of what a client (or a model) echoes
  back. **Backend 1** (`lib/domain/assistant/intent.ts`): a free, deterministic keyword-matcher,
  zero external calls, fully unit-tested (`intent.test.ts`); mutations require an explicit
  separate "yes" turn via a `PendingAction` two-stage confirm state. **Backend 2**
  (`lib/domain/assistant/llmChat.ts`): a real LLM via OpenRouter's free tier
  (`nvidia/nemotron-3.5-lightning:free`) with OpenAI-compatible tool calling, used automatically
  the moment `OPENROUTER_API_KEY` is set — no code change needed to switch. All mutations still
  go through the exact same domain functions and state machine the account page's buttons use;
  the chat layer adds no new business logic, only a natural-language front end. `FloatingChat`
  renders once in `app/layout.tsx`, gated on an active customer session.

### Chef-managed menus

Kitchen owners set their own daily menu (one form per date + meal type, covering all three
dietary categories) rather than menus coming only from seed data.

- **How it's implemented:** `saveMenuAction` (`app/actions/kitchen.ts`) upserts/deletes all
  three category fields in one `$transaction`, so a partial failure can't leave some categories
  saved and others not. Deleting a category that already has orders against it fails closed
  (foreign-key violation caught and shown as a clear message, not a silent partial save) —
  renaming an already-ordered item is still allowed since existing orders just see a new
  display name. Every read/write is scoped to the session's own `kitchenId`, never a
  client-supplied one. The date/meal-type picker auto-submits on change (rather than requiring
  a separate "Load" click) specifically to close a real bug found in review — see Phases 11–12
  of `docs/design.md` for the two silent-save bugs this page went through and how each was
  fixed and verified.

### Auth — minimal, on purpose

Three session types (student, kitchen owner, admin), password-based, intentionally simple — not
one of the domain problems this project is meant to demonstrate depth on.

- **How it's implemented:** `lib/auth/password.ts` hand-rolls `hashPassword`/`verifyPassword`
  with `node:crypto`'s `scryptSync` + `timingSafeEqual` + a random salt, rather than pulling in
  a dependency like bcrypt. `lib/auth/session.ts` signs a session cookie with an HMAC
  (`SESSION_SECRET`). Students and kitchen owners each have their own password (email is the
  identifier, no separate username); a login failure always returns the same generic "Invalid
  email or password" regardless of whether the email exists, so a login attempt can't be used
  to enumerate registered accounts. Admin is a single shared `ADMIN_PASSCODE`. All three secrets
  fail closed in production (the app throws at request time rather than falling back to a
  hardcoded default) so a public repo can never make sessions forgeable.

### Money & time — integer paise, UTC timestamps

Every money value is an integer (paise), never a float; every stored instant is UTC.

- **How it's implemented:** all price/amount columns in `prisma/schema.prisma` are integers
  (`pricePaise`, `amountPaise`, commission in basis points), so money math never touches
  floating point. Two different notions of "date" are deliberately modeled differently:
  instants (`createdAt`, `statusSince`, billing/grace deadlines) are `@db.Timestamptz(3)`,
  which Postgres normalizes to UTC internally regardless of session timezone; business calendar
  days (`deliveryDate`, `menu.date`, `kitchenCapacity.date`) are plain `@db.Date`, since "which
  day's lunch" is a calendar concept, not a UTC instant, and attaching a timezone to it would
  invite midnight-boundary off-by-one bugs instead of preventing them. The 8pm IST order-cutoff
  is application-layer math (`lib/domain/time.ts`) over a fixed UTC+5:30 offset — correct, not
  just convenient, since India observes no DST.

## Testing

`npm test` runs the domain/unit suite (`vitest`): the subscription state machine (exhaustive
over all 48 state×event pairs), dietary-substitution fallback, chat intent parsing, IST cutoff
time math, and the capacity-race integration test (fires real concurrent transactions at a live
Postgres instance rather than mocking the database — the guarantee being tested only exists at
that layer). `.github/workflows/ci.yml` runs lint, `tsc --noEmit`, this test suite, and a
production build against a throwaway Postgres service container on every push/PR.

## Project structure

```
/app
  /kitchens             browse kitchens, view one, subscribe (student-facing)
  /login, /account      student login + subscription management
  /kitchen              kitchen-owner register/login/dashboard/menu editor (no separate
                         delivery role — each kitchen delivers its own orders)
  /admin                platform admin: approve kitchens, run the daily job, settle payouts
  /actions              server actions per role (customer.ts, kitchen.ts, admin.ts, assistant.ts)
/lib
  /db                   Prisma client (driver-adapter setup, see lib/db/client.ts)
  /domain               pure domain logic: subscription state machine, capacity, menu
                         substitution, billing, kitchen moderation, payouts, chat assistant —
                         this is where the interesting logic lives, independent of Next.js
  /jobs                 the daily order-generation + billing pipeline
  /auth                 minimal session handling (see docs/design.md)
/prisma                 schema.prisma + migrations + seed.ts
/docs/design.md         every design decision, with rejected alternatives, recorded phase by phase
/scripts                CLI entrypoints (e.g. the daily job, for local/demo use)
```
