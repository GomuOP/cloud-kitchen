import Link from "next/link";
import { KitchenLoginForm } from "./KitchenLoginForm";

export default function KitchenLoginPage() {
  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍱 The Tiffin Tribe</Link>
        <div className="spacer" />
        <Link href="/kitchen/register">New kitchen? Register</Link>
      </nav>
      <div className="container">
        <div className="card auth-card">
          <h1 style={{ fontSize: "1.5rem" }}>Kitchen login</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            Enter the email and password you registered your kitchen with.
          </p>
          <KitchenLoginForm />
          <p className="muted" style={{ marginTop: 16, fontSize: "0.85rem" }}>
            Try a seeded demo kitchen: <code>lakshmi@example.com</code> or{" "}
            <code>kamala@example.com</code>, password <code>tiffin123</code>.
          </p>
        </div>
      </div>
    </>
  );
}
