"use client";

import { useActionState } from "react";
import { loginKitchenOwner, type FormActionState } from "@/app/actions/kitchen";

const initialState: FormActionState = {};

export function KitchenLoginForm() {
  const [state, formAction, pending] = useActionState(loginKitchenOwner, initialState);

  return (
    <form action={formAction}>
      <label>
        Email
        <input name="email" type="email" required disabled={pending} />
      </label>
      <label>
        Password
        <input name="password" type="password" required disabled={pending} />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Continuing…" : "Continue"}</button>
    </form>
  );
}
