"use client";

export default function RegisterKitchenError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Couldn&apos;t register</h1>
      <p className="error">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
