"use client";

import Link from "next/link";

export default function AccountError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <h1>Something went wrong</h1>
      <p className="error">{error.message}</p>
      <div className="actions-row">
        <button onClick={reset}>Try again</button>
        <Link href="/account"><button className="secondary">Back to account</button></Link>
      </div>
    </div>
  );
}
