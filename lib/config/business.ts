// Business-rule config, kept out of hardcoded call sites per the Phase 0
// decision that the skip cutoff is "config, not hardcoded."

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

// Meals for a given calendar date can no longer be skipped once local time
// in BUSINESS_TIMEZONE passes this hour (24h clock, IST).
export const SKIP_CUTOFF_HOUR_LOCAL = 20;

// Durations from docs/design.md's subscription state machine section.
export const GRACE_PERIOD_DAYS = 3;
export const PAST_DUE_PERIOD_DAYS = 7;

export const DEFAULT_KITCHEN_CAPACITY_PER_MEAL_TYPE = 200;

// Billing cycles are a fixed 30 days rather than true calendar months, to
// avoid variable-month-length edge cases (Jan 31 -> Feb 31 doesn't exist).
// A defensible simplification for a portfolio project; a production system
// would need real calendar-month billing.
export const BILLING_CYCLE_DAYS = 30;

// How many days of kitchen_capacity rows to keep populated ahead of today,
// so a signup for a near-future start date always finds a row to lock.
export const CAPACITY_HORIZON_DAYS = 21;

// The platform's cut of every subscription payment, in basis points
// (1500 = 15.00%). Integer basis points, never a float percentage, for the
// same reason money is integer paise — see lib/domain/payouts.
export const PLATFORM_COMMISSION_BPS = 1500;
