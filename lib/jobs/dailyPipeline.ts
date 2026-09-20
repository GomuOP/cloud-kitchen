import { prisma } from "@/lib/db/client";
import { businessTomorrow } from "@/lib/domain/time";
import { DEFAULT_KITCHEN_CAPACITY_PER_MEAL_TYPE } from "@/lib/config/business";
import { ensureCapacityWindow } from "@/lib/domain/capacity/ensureCapacityWindow";
import { sweepSubscriptionLifecycle, type SweepResult } from "@/lib/domain/subscription/lifecycle";
import { generateOrders, type GenerateOrdersResult } from "@/lib/domain/orders/generateOrders";
import { runBilling, type BillingRunResult } from "@/lib/domain/billing/billingJob";

// Arbitrary fixed namespace so this pipeline's advisory locks don't collide
// with locks anything else in the app might take.
const ADVISORY_LOCK_NAMESPACE = 918273;

const JOB_NAME = "generate_orders";

async function startJobRun(runDate: Date) {
  const existing = await prisma.jobRun.findUnique({ where: { jobName_runDate: { jobName: JOB_NAME, runDate } } });
  await prisma.jobRun.upsert({
    where: { jobName_runDate: { jobName: JOB_NAME, runDate } },
    update: { status: "running", attempt: (existing?.attempt ?? 0) + 1, startedAt: new Date(), finishedAt: null, errorMessage: null },
    create: { jobName: JOB_NAME, runDate, status: "running", attempt: 1, startedAt: new Date() },
  });
}

async function finishJobRun(runDate: Date, status: "success" | "failed", errorMessage?: string) {
  await prisma.jobRun.update({
    where: { jobName_runDate: { jobName: JOB_NAME, runDate } },
    data: { status, finishedAt: new Date(), errorMessage: errorMessage ?? null },
  });
}

export interface DailyPipelineResult {
  date: string;
  lockAcquired: boolean;
  sweep?: SweepResult;
  billing?: BillingRunResult;
  billingError?: string;
  generateOrders?: GenerateOrdersResult;
  error?: string;
}

/**
 * The daily pipeline: charge renewals due, then materialize tomorrow's
 * orders from active subscriptions across every kitchen. Used by both the
 * CLI script and the admin dashboard's "run daily job now" button (see
 * docs/design.md).
 *
 * Billing runs as its own step, not folded into generateOrders — per
 * docs/design.md, order generation must never call the payment provider
 * itself, so a billing failure (payment provider down) is caught here and
 * reported separately rather than blocking that day's order generation
 * (database availability is order generation's only failure mode).
 * runBilling is itself idempotent per subscription-cycle (unique
 * payments.idempotency_key), so re-running the pipeline for a date it
 * already billed is safe.
 *
 * Originally a two-stage pipeline (generate_orders -> assign_routes); the
 * route-assignment stage was removed when the project pivoted to a
 * marketplace model where each kitchen delivers its own orders — there's no
 * cross-kitchen batching left to do. See docs/design.md "Phase 3".
 */
export async function runDailyPipeline(date: Date = businessTomorrow()): Promise<DailyPipelineResult> {
  const dateStr = date.toISOString().slice(0, 10);

  const lockRows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${dateStr})) as locked
  `;
  const lockAcquired = lockRows[0]?.locked ?? false;
  if (!lockAcquired) {
    return { date: dateStr, lockAcquired: false };
  }

  try {
    await ensureCapacityWindow(DEFAULT_KITCHEN_CAPACITY_PER_MEAL_TYPE);
    const sweep = await sweepSubscriptionLifecycle();

    let billing: BillingRunResult | undefined;
    let billingError: string | undefined;
    try {
      billing = await runBilling(date);
    } catch (error) {
      billingError = error instanceof Error ? error.message : String(error);
    }

    await startJobRun(date);
    try {
      const generateResult = await generateOrders(date);
      await finishJobRun(date, "success");
      return { date: dateStr, lockAcquired: true, sweep, billing, billingError, generateOrders: generateResult };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishJobRun(date, "failed", message);
      return { date: dateStr, lockAcquired: true, sweep, billing, billingError, error: message };
    }
  } finally {
    await prisma.$executeRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_NAMESPACE}, hashtext(${dateStr}))`;
  }
}
