import { BUSINESS_TIMEZONE, SKIP_CUTOFF_HOUR_LOCAL } from "@/lib/config/business";

// India observes no DST, so IST is a fixed UTC+5:30 offset — a hardcoded
// offset is correct here and simpler than pulling in a timezone library.
// This would need revisiting if BUSINESS_TIMEZONE ever became configurable
// to a DST-observing region.
const IST_OFFSET_MINUTES = 330;

/** Today's calendar date in BUSINESS_TIMEZONE, as a UTC-midnight Date (matches how Prisma represents `@db.Date` columns). */
export function businessToday(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

export function businessTomorrow(now: Date = new Date()): Date {
  const tomorrow = businessToday(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * The UTC instant of the skip cutoff for a given delivery date: 8pm IST on
 * the day before. A meal delivering on `deliveryDate` can no longer be
 * skipped once `now` passes this instant.
 */
export function skipCutoffInstant(deliveryDate: Date): Date {
  const dayBeforeUtcMidnight = addDays(deliveryDate, -1).getTime();
  // Local midnight (00:00 IST) on that calendar day occurs IST_OFFSET_MINUTES
  // earlier than its UTC-midnight label; the cutoff hour is added from there.
  const cutoffMs =
    dayBeforeUtcMidnight -
    IST_OFFSET_MINUTES * 60_000 +
    SKIP_CUTOFF_HOUR_LOCAL * 3_600_000;
  return new Date(cutoffMs);
}

export function isSkipAllowed(deliveryDate: Date, now: Date = new Date()): boolean {
  return now.getTime() < skipCutoffInstant(deliveryDate).getTime();
}
