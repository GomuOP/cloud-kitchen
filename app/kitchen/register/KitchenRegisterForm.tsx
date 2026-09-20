"use client";

import { useActionState } from "react";
import { registerKitchenAction, type FormActionState } from "@/app/actions/kitchen";

const initialState: FormActionState = {};

export function KitchenRegisterForm({ areas }: { areas: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(registerKitchenAction, initialState);

  return (
    <form action={formAction}>
      <label>
        Your name
        <input name="ownerName" required disabled={pending} />
      </label>
      <label>
        Email (this is how you&apos;ll log in)
        <input name="email" type="email" required disabled={pending} />
      </label>
      <label>
        Password
        <input name="password" type="password" required minLength={8} disabled={pending} />
      </label>
      <label>
        Confirm password
        <input name="confirmPassword" type="password" required minLength={8} disabled={pending} />
      </label>
      <label>
        Phone (optional)
        <input name="phone" disabled={pending} />
      </label>
      <label>
        Kitchen name
        <input name="name" required placeholder="e.g. Lakshmi's Tiffin" disabled={pending} />
      </label>
      <label>
        Short description (optional)
        <input name="bio" placeholder="e.g. Home-style South Indian, veg only" disabled={pending} />
      </label>
      <label>
        Area you deliver in
        <select name="areaId" required disabled={pending}>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>{area.name}</option>
          ))}
        </select>
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Registering…" : "Register"}</button>
    </form>
  );
}
