import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { KitchenRegisterForm } from "./KitchenRegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterKitchenPage() {
  const areas = await prisma.deliveryArea.findMany();

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍱 The Tiffin Tribe</Link>
        <div className="spacer" />
        <Link href="/kitchen/login">Already registered? Log in</Link>
      </nav>
      <div className="container">
        <div className="card auth-card">
          <h1 style={{ fontSize: "1.5rem" }}>Register your kitchen</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            Your kitchen goes live after a quick admin approval — you won&apos;t be visible to
            students until then.
          </p>
          <KitchenRegisterForm areas={areas} />
        </div>
      </div>
    </>
  );
}
