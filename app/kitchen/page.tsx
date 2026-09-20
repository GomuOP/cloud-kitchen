import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getKitchenId } from "@/lib/auth/session";
import { businessToday, businessTomorrow } from "@/lib/domain/time";
import { logoutKitchenOwner, markDeliveredAction } from "@/app/actions/kitchen";

export const dynamic = "force-dynamic";

function KitchenNav() {
  return (
    <nav className="nav">
      <Link href="/" className="brand">🍱 The Tiffin Tribe</Link>
      <div className="spacer" />
      <Link href="/kitchen/menu">Menu</Link>
      <form action={logoutKitchenOwner}><button className="secondary" type="submit">Log out</button></form>
    </nav>
  );
}

export default async function KitchenDashboardPage() {
  const kitchenId = await getKitchenId();
  if (!kitchenId) redirect("/kitchen/login");

  const kitchen = await prisma.kitchen.findUniqueOrThrow({ where: { id: kitchenId } });

  if (kitchen.status === "pending_approval") {
    return (
      <>
        <KitchenNav />
        <div className="container">
          <h1>{kitchen.name}</h1>
          <p className="muted">Your kitchen is awaiting admin approval. You&apos;ll be able to set your menu and see orders once approved.</p>
        </div>
      </>
    );
  }

  if (kitchen.status === "suspended") {
    return (
      <>
        <KitchenNav />
        <div className="container">
          <h1>{kitchen.name}</h1>
          <p className="error">Your kitchen has been suspended by an admin.</p>
        </div>
      </>
    );
  }

  const tomorrow = businessTomorrow();
  const today = businessToday();

  const [tomorrowOrders, todayOrders, capacity, jobRun] = await Promise.all([
    prisma.order.findMany({ where: { kitchenId, deliveryDate: tomorrow }, include: { mealType: true, menuItem: true } }),
    prisma.order.findMany({
      where: { kitchenId, deliveryDate: today },
      include: { mealType: true, menuItem: true, address: true, subscription: { include: { user: true } } },
      orderBy: { address: { line1: "asc" } },
    }),
    prisma.kitchenCapacity.findMany({ where: { kitchenId, date: tomorrow }, include: { mealType: true } }),
    prisma.jobRun.findUnique({ where: { jobName_runDate: { jobName: "generate_orders", runDate: tomorrow } } }),
  ]);

  const byMealType = new Map<string, { name: string; total: number; byCategory: Map<string, number> }>();
  for (const order of tomorrowOrders) {
    const entry = byMealType.get(order.mealTypeId) ?? { name: order.mealType.name, total: 0, byCategory: new Map() };
    entry.total++;
    entry.byCategory.set(order.menuItem.dietaryCategory, (entry.byCategory.get(order.menuItem.dietaryCategory) ?? 0) + 1);
    byMealType.set(order.mealTypeId, entry);
  }

  return (
    <>
      <KitchenNav />
      <div className="container">
        <h1>{kitchen.name}</h1>

        <div className="card">
          <h2>Tomorrow&apos;s counts ({tomorrow.toISOString().slice(0, 10)})</h2>
          {jobRun && (
            <p className="muted">
              Order generation: <span className={jobRun.status === "success" ? "badge active" : "badge grace"}>{jobRun.status}</span>
              {jobRun.errorMessage && <span className="error"> — {jobRun.errorMessage}</span>}
            </p>
          )}
          {byMealType.size === 0 && <p className="muted">No orders generated yet — the admin runs the daily job each evening.</p>}
          {[...byMealType.values()].map((entry) => (
            <div key={entry.name} style={{ marginBottom: 12 }}>
              <strong>{entry.name}: {entry.total}</strong>
              <div style={{ marginTop: 4 }}>
                {[...entry.byCategory.entries()].map(([category, count]) => (
                  <span className="chip" key={category}>{category}: {count}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Your capacity for tomorrow</h2>
          <table>
            <thead><tr><th>Meal type</th><th>Reserved</th><th>Max</th></tr></thead>
            <tbody>
              {capacity.map((row) => (
                <tr key={row.id}><td>{row.mealType.name}</td><td>{row.reservedCount}</td><td>{row.maxCapacity}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Today&apos;s deliveries ({today.toISOString().slice(0, 10)})</h2>
          {todayOrders.length === 0 && <p className="muted">Nothing to deliver today.</p>}
          {todayOrders.length > 0 && (
            <table>
              <thead>
                <tr><th>Student</th><th>Address</th><th>Item</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {todayOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.subscription.user.name}</td>
                    <td>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}, {order.address.pincode}</td>
                    <td>{order.menuItem.name}</td>
                    <td><span className={`badge ${order.status === "delivered" ? "active" : "paused"}`}>{order.status}</span></td>
                    <td>
                      {order.status !== "delivered" && (
                        <form action={markDeliveredAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button className="secondary" type="submit">Mark delivered</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
