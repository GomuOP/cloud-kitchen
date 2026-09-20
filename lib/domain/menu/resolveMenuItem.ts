import type { DietaryCategory } from "@/lib/generated/prisma/client";

// jain -> no_onion_garlic -> veg, per the user-confirmed fallback rule in
// docs/design.md. veg is the universal baseline so its chain is itself only.
const FALLBACK_CHAIN: Record<DietaryCategory, readonly DietaryCategory[]> = {
  jain: ["jain", "no_onion_garlic", "veg"],
  no_onion_garlic: ["no_onion_garlic", "veg"],
  veg: ["veg"],
};

export interface AvailableMenuItem {
  id: string;
  dietaryCategory: DietaryCategory;
}

export interface ResolvedMenuItem {
  menuItemId: string;
  dietaryCategory: DietaryCategory;
  /** The originally-requested category, or null if no substitution occurred. */
  substitutedFrom: DietaryCategory | null;
}

export class NoMenuItemAvailableError extends Error {
  constructor(public readonly preference: DietaryCategory) {
    super(`No menu item available for preference "${preference}" or any fallback in its chain`);
    this.name = "NoMenuItemAvailableError";
  }
}

/** Pure function: given a subscriber's preference and the day's available items, pick one via the fallback chain. */
export function resolveMenuItem(
  preference: DietaryCategory,
  availableItems: readonly AvailableMenuItem[],
): ResolvedMenuItem {
  for (const category of FALLBACK_CHAIN[preference]) {
    const item = availableItems.find((candidate) => candidate.dietaryCategory === category);
    if (item) {
      return {
        menuItemId: item.id,
        dietaryCategory: category,
        substitutedFrom: category === preference ? null : preference,
      };
    }
  }
  throw new NoMenuItemAvailableError(preference);
}
