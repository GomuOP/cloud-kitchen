"use client";

import { useActionState, useState } from "react";
import { saveMenuAction, type SaveMenuState } from "@/app/actions/kitchen";

const initialState: SaveMenuState = {};

export type CategoryNames = Record<"veg" | "jain" | "no_onion_garlic", string>;

const CATEGORIES: { key: keyof CategoryNames; label: string }[] = [
  { key: "veg", label: "Veg" },
  { key: "jain", label: "Jain" },
  { key: "no_onion_garlic", label: "No onion/garlic" },
];

export function MenuForm({
  date,
  mealTypeId,
  mealTypes,
  currentNames,
}: {
  date: string;
  mealTypeId: string;
  mealTypes: { id: string; name: string }[];
  currentNames: CategoryNames;
}) {
  const [state, formAction, pending] = useActionState(saveMenuAction, initialState);

  // These are controlled (not defaultValue) inputs on purpose: React resets
  // uncontrolled form fields to their original defaultValue after any
  // useActionState action completes, success included — which would snap a
  // just-saved edit back to its stale pre-save text. Resyncing `values` from
  // `currentNames` whenever the signature changes (a different menu was
  // loaded, or a save just landed fresh server data for this same one) uses
  // React's "adjusting state when a prop changes" render-phase pattern
  // instead of an effect, per the framework's own guidance for this case.
  const signature = `${date}:${mealTypeId}:${currentNames.veg}:${currentNames.jain}:${currentNames.no_onion_garlic}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  const [values, setValues] = useState(currentNames);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setValues(currentNames);
  }

  return (
    <>
      {/* Sharing `pending` with the Save form below (both live in this one
          client component) so switching date/meal type is disabled while a
          save is in flight — clicking "Load" mid-save used to be able to
          navigate away before the save's response (and its confirmation)
          ever arrived, which is exactly what made saves look
          inconsistent. */}
      <form method="get" className="card">
        <label>
          Date
          <input
            type="date"
            name="date"
            defaultValue={date}
            required
            disabled={pending}
            // Auto-submit on change — without this, picking a new date here
            // does NOT update what the Save form below actually submits
            // (its hidden `date` field only updates once this navigation
            // completes). A chef who changed the date and went straight to
            // typing/saving without clicking "Load" first would silently
            // save to whatever date was previously loaded instead.
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </label>
        <label>
          Meal type
          <select
            name="mealTypeId"
            defaultValue={mealTypeId}
            required
            disabled={pending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {mealTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="secondary" disabled={pending}>Load</button>
      </form>

      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Exactly one item per dietary category — a student&apos;s preference falls back
        jain → no_onion_garlic → veg if their category isn&apos;t set for the day.
      </p>

      <form action={formAction} className="card">
        <p className="muted" style={{ fontSize: "0.9rem", marginTop: 0 }}>
          Editing menu for <strong>{date}</strong> —{" "}
          <strong>{mealTypes.find((mt) => mt.id === mealTypeId)?.name ?? "—"}</strong>
        </p>
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="mealTypeId" value={mealTypeId} />
        {CATEGORIES.map(({ key, label }) => (
          <label key={key}>
            {label} (blank to remove)
            <input
              name={`name_${key}`}
              value={values[key]}
              onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              disabled={pending}
            />
          </label>
        ))}
        {state.error && <p className="error">{state.error}</p>}
        {!state.error && state.savedAt && <p className="success">✓ Menu saved.</p>}
        <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save menu"}</button>
      </form>
    </>
  );
}
