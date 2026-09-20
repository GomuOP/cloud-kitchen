"use client";

import { useState } from "react";
import { useActionState } from "react";
import { loginCustomer, signupCustomer, type FormActionState } from "@/app/actions/customer";

const initialState: FormActionState = {};

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(loginCustomer, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signupCustomer, initialState);

  const state = mode === "login" ? loginState : signupState;
  const pending = mode === "login" ? loginPending : signupPending;

  return (
    <>
      <div className="actions-row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={mode === "login" ? "" : "secondary"}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === "signup" ? "" : "secondary"}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      {mode === "login" ? (
        <form action={loginAction}>
          <label>
            Email
            <input name="email" type="email" required placeholder="you@example.com" disabled={pending} />
          </label>
          <label>
            Password
            <input name="password" type="password" required disabled={pending} />
          </label>
          {state.error && <p className="error">{state.error}</p>}
          <button type="submit" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
        </form>
      ) : (
        <form action={signupAction}>
          <label>
            Name
            <input name="name" required placeholder="Your name" disabled={pending} />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="you@example.com" disabled={pending} />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} disabled={pending} />
          </label>
          <label>
            Confirm password
            <input name="confirmPassword" type="password" required minLength={8} disabled={pending} />
          </label>
          {state.error && <p className="error">{state.error}</p>}
          <button type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
        </form>
      )}
    </>
  );
}
