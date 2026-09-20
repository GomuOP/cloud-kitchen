# Cloud Kitchen Subscription & Fulfilment Service

Portfolio project for SDE placement interviews. The point of the project is the
subscription/fulfilment domain logic (state machine, idempotent job, capacity
races, dietary substitution, delivery batching) — not the UI. Every line must
be understood and defensible in an interview.

## Standing rules

1. **Design before code.** Before writing any non-trivial code, explain the
   design and the alternatives rejected, and wait for explicit agreement.
2. **One phase at a time.** Stop after each phase for review. Never chain
   phases without a checkpoint.
3. **Record decisions.** Every design decision, with rejected alternatives and
   why, goes in `docs/design.md` as it's finalized.
4. **Money & time.** Money is integer paise (never floats). All timestamps
   stored in the DB are UTC.
5. **No silent assumptions.** If a requirement is ambiguous, ask — don't guess.

## Stack

- Next.js (App Router) + TypeScript
- Postgres
- Prisma (primary) + raw SQL for concurrency-critical paths (see design.md)
- No real payment gateway — mocked behind a `PaymentProvider` interface

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
