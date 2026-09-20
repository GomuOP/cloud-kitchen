"use client";

import Link from "next/link";

export default function KitchenDetailError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Couldn&apos;t complete signup</h1>
      <p className="error">{error.message}</p>
      <p className="muted">
        If this was a capacity error, tomorrow&apos;s slots for that plan are full at this
        kitchen — try a different plan or kitchen.
      </p>
      <div className="actions-row">
        <button onClick={reset}>Try again</button>
        <Link href="/kitchens"><button className="secondary">Back to kitchens</button></Link>
      </div>
    </div>
  );
}
