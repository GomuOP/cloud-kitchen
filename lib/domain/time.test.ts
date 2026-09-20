import { describe, expect, it } from "vitest";
import { isSkipAllowed, skipCutoffInstant } from "./time";

describe("skipCutoffInstant", () => {
  it("is 8pm IST (14:30 UTC) on the day before delivery", () => {
    const delivery = new Date("2026-03-10T00:00:00.000Z");
    const cutoff = skipCutoffInstant(delivery);
    expect(cutoff.toISOString()).toBe("2026-03-09T14:30:00.000Z");
  });
});

describe("isSkipAllowed", () => {
  const delivery = new Date("2026-03-10T00:00:00.000Z");

  it("allows a skip well before cutoff", () => {
    const now = new Date("2026-03-09T10:00:00.000Z");
    expect(isSkipAllowed(delivery, now)).toBe(true);
  });

  it("allows a skip one millisecond before cutoff", () => {
    const now = new Date("2026-03-09T14:29:59.999Z");
    expect(isSkipAllowed(delivery, now)).toBe(true);
  });

  it("rejects a skip exactly at cutoff", () => {
    const now = new Date("2026-03-09T14:30:00.000Z");
    expect(isSkipAllowed(delivery, now)).toBe(false);
  });

  it("rejects a skip after cutoff", () => {
    const now = new Date("2026-03-09T20:00:00.000Z");
    expect(isSkipAllowed(delivery, now)).toBe(false);
  });
});
