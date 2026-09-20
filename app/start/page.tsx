import Link from "next/link";

// The public entry point for choosing a role. Admin is deliberately not
// listed here (user decision) — /admin/login stays reachable by direct URL
// only, matching the convention of not advertising an admin portal on a
// public landing/signup flow. "Chef" is a display label only here; the
// underlying routes/domain model stay "kitchen" (see docs/design.md).
export default function StartPage() {
  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
      </nav>
      <div className="container">
        <div className="hero" style={{ paddingBottom: 0 }}>
          <h1 style={{ fontSize: "1.8rem" }}>Continue as…</h1>
        </div>

        <div className="card-grid">
          <div className="card">
            <h2>🎓 Student</h2>
            <p className="muted">Browse kitchens near you, subscribe, pause, skip, cancel.</p>
            <div className="actions-row" style={{ marginTop: 14 }}>
              <Link href="/login"><button>Continue as student</button></Link>
            </div>
          </div>

          <div className="card">
            <h2>👩‍🍳 Chef</h2>
            <p className="muted">
              Register your kitchen, set your menu and capacity, see tomorrow&apos;s orders.
            </p>
            <div className="actions-row" style={{ marginTop: 14 }}>
              <Link href="/kitchen/login"><button>Continue as chef</button></Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
