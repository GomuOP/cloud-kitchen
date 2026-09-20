import Link from "next/link";
import { AdminLoginForm } from "./AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
      </nav>
      <div className="container">
        <div className="card auth-card">
          <h1 style={{ fontSize: "1.5rem" }}>Admin login</h1>
          <AdminLoginForm />
        </div>
      </div>
    </>
  );
}
