import { describe, expect, it } from "vitest";
import { isAffirmative, isNegative, parseIntent } from "./intent";

describe("parseIntent", () => {
  const cases: Array<[string, ReturnType<typeof parseIntent>]> = [
    ["help", { type: "help" }],
    ["what can you do?", { type: "help" }],
    ["cancel my subscription", { type: "cancel", immediate: false }],
    ["cancel it right away", { type: "cancel", immediate: true }],
    ["please cancel immediately", { type: "cancel", immediate: true }],
    ["I want to pause my subscription", { type: "pause" }],
    ["resume please", { type: "resume" }],
    ["unpause my plan", { type: "resume" }],
    ["skip tomorrow's meal", { type: "skip_tomorrow" }],
    ["when is my next delivery", { type: "next_delivery" }],
    ["what's my dietary preference", { type: "dietary_preference" }],
    ["what's my subscription status", { type: "list_subscriptions" }],
    ["asdkjfhaslkdjf", { type: "unknown" }],
  ];

  for (const [message, expected] of cases) {
    it(`"${message}" -> ${JSON.stringify(expected)}`, () => {
      expect(parseIntent(message)).toEqual(expected);
    });
  }

  it("cancel is checked before the generic subscription/status keywords", () => {
    // Contains "subscription" (a list_subscriptions keyword) but should
    // still resolve to cancel, since cancel is the more specific intent.
    expect(parseIntent("cancel my subscription now")).toEqual({ type: "cancel", immediate: true });
  });

  it("resume is checked before pause (unpause contains no 'pause' substring conflict, but restart must not fall through)", () => {
    expect(parseIntent("restart my subscription")).toEqual({ type: "resume" });
  });
});

describe("isAffirmative", () => {
  for (const word of ["yes", "y", "yeah", "yep", "confirm", "sure", "ok", "okay", "do it"]) {
    it(`recognizes "${word}"`, () => {
      expect(isAffirmative(word)).toBe(true);
    });
  }

  it("recognizes affirmative words with trailing text", () => {
    expect(isAffirmative("yes please")).toBe(true);
  });

  it("does not treat unrelated text as affirmative", () => {
    expect(isAffirmative("when is my next delivery")).toBe(false);
  });
});

describe("isNegative", () => {
  for (const word of ["no", "n", "nope", "nevermind", "never mind", "stop"]) {
    it(`recognizes "${word}"`, () => {
      expect(isNegative(word)).toBe(true);
    });
  }

  it("does not treat unrelated text as negative", () => {
    expect(isNegative("skip tomorrow")).toBe(false);
  });
});
