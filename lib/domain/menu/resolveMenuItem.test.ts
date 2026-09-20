import { describe, expect, it } from "vitest";
import { NoMenuItemAvailableError, resolveMenuItem } from "./resolveMenuItem";

const full = [
  { id: "veg-1", dietaryCategory: "veg" as const },
  { id: "jain-1", dietaryCategory: "jain" as const },
  { id: "nog-1", dietaryCategory: "no_onion_garlic" as const },
];

describe("resolveMenuItem", () => {
  it("picks the exact match when available, no substitution", () => {
    expect(resolveMenuItem("jain", full)).toEqual({
      menuItemId: "jain-1",
      dietaryCategory: "jain",
      substitutedFrom: null,
    });
  });

  it("falls back jain -> no_onion_garlic when jain is missing", () => {
    const items = full.filter((i) => i.dietaryCategory !== "jain");
    expect(resolveMenuItem("jain", items)).toEqual({
      menuItemId: "nog-1",
      dietaryCategory: "no_onion_garlic",
      substitutedFrom: "jain",
    });
  });

  it("falls back jain -> veg when both jain and no_onion_garlic are missing", () => {
    const items = full.filter((i) => i.dietaryCategory === "veg");
    expect(resolveMenuItem("jain", items)).toEqual({
      menuItemId: "veg-1",
      dietaryCategory: "veg",
      substitutedFrom: "jain",
    });
  });

  it("falls back no_onion_garlic -> veg when no_onion_garlic is missing", () => {
    const items = full.filter((i) => i.dietaryCategory !== "no_onion_garlic");
    expect(resolveMenuItem("no_onion_garlic", items)).toEqual({
      menuItemId: "veg-1",
      dietaryCategory: "veg",
      substitutedFrom: "no_onion_garlic",
    });
  });

  it("veg has no fallback: throws if veg itself is missing", () => {
    expect(() => resolveMenuItem("veg", [])).toThrow(NoMenuItemAvailableError);
  });

  it("throws when nothing in the chain is available", () => {
    expect(() => resolveMenuItem("jain", [])).toThrow(NoMenuItemAvailableError);
  });
});
