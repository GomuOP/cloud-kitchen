"use client";

export default function AdminLoginError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Login failed</h1>
      <p className="error">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
