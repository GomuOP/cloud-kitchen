import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function KitchensPage({
  searchParams,
}: {
  searchParams: Promise<{ areaId?: string }>;
}) {
  const { areaId } = await searchParams;

  const [kitchens, areas] = await Promise.all([
    prisma.kitchen.findMany({
      where: { status: "active", ...(areaId ? { areaId } : {}) },
      include: { area: true, plans: { where: { active: true }, include: { mealType: true } } },
    }),
    prisma.deliveryArea.findMany(),
  ]);

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
        <div className="spacer" />
        <Link href="/login">Student login</Link>
      </nav>
      <div className="container">
        <h1>Kitchens</h1>
        <p className="muted">Home cooks near you, each with their own menu and plans.</p>

        <form method="get" style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 16 }}>
          <label style={{ flex: 1 }}>
            Filter by area
            <select name="areaId" defaultValue={areaId ?? ""}>
              <option value="">All areas</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>{area.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary">Filter</button>
        </form>

        {kitchens.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No active kitchens in this area yet.</p>}

        <div className="card-grid">
          {kitchens.map((kitchen) => (
            <div className="card" key={kitchen.id}>
              <h2>{kitchen.name}</h2>
              <p className="muted">by {kitchen.ownerName} · {kitchen.area.name}</p>
              {kitchen.bio && <p style={{ fontSize: "0.92rem", marginTop: 4 }}>{kitchen.bio}</p>}
              <div style={{ margin: "10px 0", flex: 1 }}>
                {kitchen.plans.length === 0 ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>No plans published yet</span>
                ) : (
                  kitchen.plans.map((p) => (
                    <span className="chip" key={p.id}>{p.mealType.name} · ₹{(p.pricePaise / 100).toFixed(0)}/cycle</span>
                  ))
                )}
              </div>
              <Link href={`/kitchens/${kitchen.id}`}><button>View &amp; subscribe</button></Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
