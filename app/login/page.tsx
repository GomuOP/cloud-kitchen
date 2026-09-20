import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
        <div className="spacer" />
      </nav>
      <div className="container">
        <div className="card auth-card">
          <h1 style={{ fontSize: "1.5rem" }}>Student</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            Log in with an existing account, or sign up for a new one.
          </p>
          <LoginForm />
          <p className="muted" style={{ marginTop: 16, fontSize: "0.85rem" }}>
            Try the seeded demo account: <code>demo@example.com</code> / <code>tiffin123</code>.
            Any email containing <code>+fail@</code> (e.g. <code>you+fail@example.com</code>) makes
            future checkouts simulate a declined payment, to demo that path without a real
            declined card.
          </p>
        </div>
      </div>
    </>
  );
}
