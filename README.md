# Tiffin subscription & fulfilment marketplace

A two-sided marketplace: kitchens (run by home cooks — "chefs") list their own meal
subscriptions; students subscribe directly to the kitchen of their choice; each kitchen
delivers its own food. The platform handles matching, capacity, billing, subscription
lifecycle, and commission settlement. See `CLAUDE.md` for the project's standing rules and
`docs/design.md` for every design decision and the alternatives rejected.

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

## Project structure

```
/app
  /kitchens             browse kitchens, view one, subscribe (student-facing)
  /login, /account       student login + subscription management
  /kitchen               kitchen-owner register/login/dashboard (tomorrow's counts,
                          today's own deliveries — no separate delivery role, since
                          each kitchen delivers its own orders)
  /admin                 platform admin: approve kitchens, run the daily job, settle payouts
  /actions                server actions per role (customer.ts, kitchen.ts, admin.ts)
/lib
  /db                   Prisma client (driver-adapter setup, see lib/db/client.ts)
  /domain               pure domain logic: subscription state machine, capacity,
                         menu substitution, billing, kitchen moderation, payouts —
                         this is where the interesting logic lives, independent of Next.js
  /jobs                 the daily order-generation pipeline
  /auth                 minimal session handling (see docs/design.md)
/prisma                 schema.prisma + migrations + seed.ts
/docs/design.md          every design decision, with rejected alternatives
/scripts                 CLI entrypoints (e.g. the daily job, for local/demo use)
```
