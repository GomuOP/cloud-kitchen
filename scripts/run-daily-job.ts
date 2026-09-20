import "dotenv/config";
import { runDailyPipeline } from "@/lib/jobs/dailyPipeline";
import { businessTomorrow } from "@/lib/domain/time";

// Usage: npx tsx scripts/run-daily-job.ts [YYYY-MM-DD]
// Defaults to tomorrow's business date. Safe to run more than once for the
// same date — order generation is idempotent.
async function main() {
  const arg = process.argv[2];
  const date = arg ? new Date(`${arg}T00:00:00.000Z`) : businessTomorrow();

  const result = await runDailyPipeline(date);
  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/client");
    await prisma.$disconnect();
  });
