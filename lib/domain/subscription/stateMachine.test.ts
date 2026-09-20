import { describe, expect, it } from "vitest";
import {
  InvalidTransitionError,
  NONE,
  SUBSCRIPTION_EVENTS,
  StateMachineState,
  SUBSCRIPTION_STATUSES,
  SubscriptionEvent,
  canTransition,
  transition,
} from "./stateMachine";

// The exhaustive list of legal (from, event) -> to moves. This is the same
// information as TRANSITIONS in stateMachine.ts, written out flat so the
// test below can diff the *entire* state space against it rather than
// spot-checking a few cases.
const LEGAL: ReadonlyArray<[StateMachineState, SubscriptionEvent, string]> = [
  [NONE, "SIGNUP_PAID", "active"],
  ["active", "PAUSE", "paused"],
  ["active", "PAYMENT_FAILED", "grace"],
  ["active", "CANCEL", "cancelled"],
  ["paused", "RESUME", "active"],
  ["paused", "CANCEL", "cancelled"],
  ["grace", "PAYMENT_SUCCEEDED", "active"],
  ["grace", "GRACE_EXPIRED", "past_due"],
  ["grace", "CANCEL", "cancelled"],
  ["past_due", "PAYMENT_SUCCEEDED", "active"],
  ["past_due", "PAST_DUE_EXPIRED", "cancelled"],
  ["past_due", "CANCEL", "cancelled"],
];

const ALL_STATES: readonly StateMachineState[] = [NONE, ...SUBSCRIPTION_STATUSES];

describe("subscription state machine", () => {
  describe("every legal transition", () => {
    it.each(LEGAL)("%s --%s--> %s", (from, event, expected) => {
      expect(transition(from, event)).toBe(expected);
      expect(canTransition(from, event)).toBe(true);
    });
  });

  describe("full state space: every (state, event) pair not in the legal list is rejected", () => {
    const legalSet = new Set(LEGAL.map(([from, event]) => `${from}:${event}`));

    for (const from of ALL_STATES) {
      for (const event of SUBSCRIPTION_EVENTS) {
        const isLegal = legalSet.has(`${from}:${event}`);

        it(`${from} --${event}--> ${isLegal ? "allowed" : "rejected"}`, () => {
          if (isLegal) {
            expect(canTransition(from, event)).toBe(true);
            expect(() => transition(from, event)).not.toThrow();
          } else {
            expect(canTransition(from, event)).toBe(false);
            expect(() => transition(from, event)).toThrow(InvalidTransitionError);
          }
        });
      }
    }
  });

  it("cancelled is terminal: no event moves out of it", () => {
    for (const event of SUBSCRIPTION_EVENTS) {
      expect(canTransition("cancelled", event)).toBe(false);
    }
  });

  it("a subscription cannot be created twice: SIGNUP_PAID is only legal from none", () => {
    for (const from of SUBSCRIPTION_STATUSES) {
      expect(canTransition(from, "SIGNUP_PAID")).toBe(false);
    }
  });

  it("throws InvalidTransitionError carrying the offending state and event", () => {
    try {
      transition("cancelled", "RESUME");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      const err = error as InvalidTransitionError;
      expect(err.from).toBe("cancelled");
      expect(err.event).toBe("RESUME");
    }
  });
});
