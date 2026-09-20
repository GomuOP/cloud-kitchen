# Deploying

Everything up to this point (schema, domain logic, UIs, migrations, CI config) is done and
verified locally. What's left needs your accounts and credentials — I can't create a Vercel
account, a hosted Postgres instance, or complete an OAuth login on your behalf. This is the
exact handoff: follow these steps and the app is live.

## 1. Hosted Postgres (Neon — free tier, works well with serverless Next.js)

1. Create an account at neon.tech (or Supabase/Railway if you prefer — any Postgres works,
   the steps are equivalent).
2. Create a new project. Note the connection string it gives you — use the **direct**
   (non-pooled) connection string, not the pooled one. For this project's traffic scale
   (a portfolio demo, not production load), the direct connection is simplest and sufficient;
   a pooled connection matters once you have many concurrent serverless invocations, which
   isn't this project's situation.
3. Locally, apply the schema to it once:
   ```bash
   DATABASE_URL="<your neon connection string>" npx prisma migrate deploy
   DATABASE_URL="<your neon connection string>" npm run seed
   ```

## 2. Razorpay test mode (optional — the app works fine without it, via the mock)

1. Create a free account at dashboard.razorpay.com.
2. Switch to **Test Mode** (toggle top-left of the dashboard) — everything below uses test
   keys and test cards; no business verification or real money is involved.
3. Settings → API Keys → generate a test key pair. Copy the Key ID and Key Secret.
4. That's it — no webhook setup needed for this app; verification happens synchronously
   right after checkout (see `docs/design.md`).

## 3. Push this repo to GitHub

```bash
git add -A
git commit -m "Initial commit"
gh repo create meal-service --private --source=. --push
# or create the repo on github.com and:
# git remote add origin <your-repo-url>
# git push -u origin main
```

(I won't run these for you — creating a repo and pushing is visible/shared state, your call.)

## 4. Vercel

1. Create an account at vercel.com, connect your GitHub account.
2. "Add New Project" → import this repo. Vercel auto-detects Next.js; no build command
   changes needed (`postinstall` already runs `prisma generate`).
3. Set these environment variables in the Vercel project settings (Production, and Preview
   if you want preview deployments to work too):
   - `DATABASE_URL` — the same Neon connection string from step 1
   - `SESSION_SECRET` — generate with `openssl rand -hex 32`
   - `ADMIN_PASSCODE` — any passcode of your choice (gates `/admin`: kitchen approval,
     running the daily job, settling payouts)
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — optional, from step 2. Omit both to keep
     using the mock (still fully functional, just skips the real checkout widget).
4. Deploy. Vercel gives you a `*.vercel.app` URL.
5. Run `npm run seed` once against the production `DATABASE_URL` (same command as step 1) if
   you want demo kitchens/a demo student to show an interviewer without registering one live.

## 5. Keeping the daily job running

This project deliberately has no cron (see `docs/design.md`) — the pipeline is triggered
manually via the "Run daily job now" button on `/admin`, which is fine for a portfolio demo
you're driving yourself. If you want it to run automatically once deployed:
- Simplest: a free GitHub Actions scheduled workflow that does
  `curl -X POST https://<your-app>.vercel.app/api/run-job` once a day — this needs a thin
  route handler wrapping `runDailyPipeline()` (not currently in the app, since the kitchen UI
  button already calls it directly as a server action). Ten minutes of work if you want it;
  not required for the demo to work.
- Or just click the button in the kitchen UI whenever you're demoing it.

## 6. GitHub Actions CI

`.github/workflows/ci.yml` runs lint, typecheck, the full test suite (including the live-DB
capacity-race integration test, against a Postgres service container), and a production build
on every push/PR. No setup needed — it uses its own throwaway Postgres, not your Neon instance.
