"use client";

import { useActionState } from "react";
import { loginAdmin, type FormActionState } from "@/app/actions/admin";

const initialState: FormActionState = {};

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(loginAdmin, initialState);

  return (
    <form action={formAction}>
      <label>
        Passcode
        <input name="passcode" type="password" required disabled={pending} />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Checking…" : "Enter"}</button>
    </form>
  );
}
