// The five persisted values of subscriptions.status (see prisma/schema.prisma).
export const SUBSCRIPTION_STATUSES = [
  "active",
  "paused",
  "grace",
  "past_due",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// "none" is not a persisted status — it represents "no subscription row
// exists yet". Modeling it as a state (rather than special-casing signup
// outside the table) lets the transition table and its tests stay uniform:
// every legal move, including creation, is one row in TRANSITIONS.
export const NONE = "none" as const;
export type StateMachineState = SubscriptionStatus | typeof NONE;

export const SUBSCRIPTION_EVENTS = [
  "SIGNUP_PAID",
  "PAUSE",
  "RESUME",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCEEDED",
  "GRACE_EXPIRED",
  "PAST_DUE_EXPIRED",
  "CANCEL",
] as const;
export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

type TransitionTable = Readonly<
  Record<StateMachineState, Readonly<Partial<Record<SubscriptionEvent, SubscriptionStatus>>>>
>;

// The state machine. Every legal (from, event) -> to move is one entry here;
// every (from, event) pair not listed is illegal. See docs/design.md for why
// each transition exists and the durations attached to grace/past_due.
export const TRANSITIONS: TransitionTable = {
  none: {
    SIGNUP_PAID: "active",
  },
  active: {
    PAUSE: "paused",
    PAYMENT_FAILED: "grace",
    CANCEL: "cancelled",
  },
  paused: {
    RESUME: "active",
    CANCEL: "cancelled",
  },
  grace: {
    PAYMENT_SUCCEEDED: "active",
    GRACE_EXPIRED: "past_due",
    CANCEL: "cancelled",
  },
  past_due: {
    PAYMENT_SUCCEEDED: "active",
    PAST_DUE_EXPIRED: "cancelled",
    CANCEL: "cancelled",
  },
  cancelled: {},
} as const;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: StateMachineState,
    public readonly event: SubscriptionEvent,
  ) {
    super(`Illegal transition: cannot apply ${event} from state "${from}"`);
    this.name = "InvalidTransitionError";
  }
}

export function transition(
  from: StateMachineState,
  event: SubscriptionEvent,
): SubscriptionStatus {
  const next = TRANSITIONS[from][event];
  if (next === undefined) {
    throw new InvalidTransitionError(from, event);
  }
  return next;
}

export function canTransition(from: StateMachineState, event: SubscriptionEvent): boolean {
  return TRANSITIONS[from][event] !== undefined;
}
