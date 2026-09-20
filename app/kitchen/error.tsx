"use client";

export default function KitchenError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Something went wrong</h1>
      <p className="error">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
