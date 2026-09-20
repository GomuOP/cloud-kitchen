import Link from "next/link";

export default function Home() {
  return (
    <>
      <div className="hero-band">
        <nav className="nav">
          <Link href="/" className="brand">🍱 The Tiffin Tribe</Link>
          <div className="spacer" />
          <Link href="/start"><button>Log in / Sign up</button></Link>
        </nav>
        <div className="container">
          <div className="hero hero-inner">
            <h1>Home-cooked tiffins, subscribed directly from the chef who makes them.</h1>
            <p>
              Kitchens run by home cooks list their own meal subscriptions; students subscribe
              directly to the kitchen of their choice. The platform handles matching, capacity, and
              billing — each kitchen cooks and delivers its own food.
            </p>
            <div className="actions-row" style={{ marginTop: 20 }}>
              <Link href="/start"><button>Get started</button></Link>
              <Link href="/kitchens"><button className="secondary">Browse kitchens</button></Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <h2 style={{ marginTop: 48, fontSize: "1.5rem" }}>How it works</h2>
        <div className="card-grid">
          <div className="card">
            <h2>🔍 Browse kitchens</h2>
            <p className="muted">See what&apos;s cooking nearby, pick a plan, and set your dietary preference.</p>
          </div>
          <div className="card">
            <h2>📝 Subscribe</h2>
            <p className="muted">Pay securely once, then pause, skip, or cancel any day right from your account.</p>
          </div>
          <div className="card">
            <h2>🍱 Get delivered</h2>
            <p className="muted">The chef cooks and delivers your meal — fresh, home-style, every day.</p>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, marginBottom: 48, textAlign: "center" }}>
          <h2>Ready to try it?</h2>
          <p className="muted">Join as a student, or list your own kitchen as a chef.</p>
          <div className="actions-row" style={{ marginTop: 14, justifyContent: "center" }}>
            <Link href="/start"><button>Get started</button></Link>
          </div>
        </div>
      </div>
    </>
  );
}
