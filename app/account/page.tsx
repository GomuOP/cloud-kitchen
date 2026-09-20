import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCustomerUserId } from "@/lib/auth/session";
import { canTransition } from "@/lib/domain/subscription/stateMachine";
import { isSkipAllowed, businessTomorrow } from "@/lib/domain/time";
import {
  logoutCustomer,
  pauseAction,
  resumeAction,
  skipTomorrowAction,
  cancelAction,
} from "@/app/actions/customer";

export const dynamic = "force-dynamic";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtMoney(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export default async function AccountPage() {
  const userId = await getCustomerUserId();
  if (!userId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      subscriptions: {
        include: { plan: true, mealType: true, kitchen: true, address: { include: { area: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const tomorrow = businessTomorrow();
  const skipAllowed = isSkipAllowed(tomorrow);

  const upcomingOrders = await prisma.order.findMany({
    where: { subscription: { userId }, deliveryDate: { gte: businessTomorrow() } },
    include: { menuItem: true, mealType: true },
    orderBy: { deliveryDate: "asc" },
    take: 10,
  });

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
        <Link href="/kitchens">Browse kitchens</Link>
        <div className="spacer" />
        <span className="muted">{user.name}</span>
        <form action={logoutCustomer}>
          <button className="secondary" type="submit">Log out</button>
        </form>
      </nav>
      <div className="container">
      <h1>My subscriptions</h1>

      {user.subscriptions.length === 0 && (
        <p className="muted">No subscriptions yet. <Link href="/kitchens">Browse kitchens</Link>.</p>
      )}

      {user.subscriptions.map((sub) => (
        <div className="card" key={sub.id}>
          <h2>
            {sub.kitchen.name} — {sub.plan.name} <span className={`badge ${sub.status}`}>{sub.status}</span>
          </h2>
          <p className="muted">
            {sub.mealType.name} · {sub.dietaryPreference} · delivering to {sub.address.line1},{" "}
            {sub.address.area.name}
          </p>
          <p className="muted">
            Cycle: {fmtDate(sub.currentCycleStart)} → {fmtDate(sub.currentCycleEnd)} · next billing{" "}
            {fmtDate(sub.nextBillingDate)}
          </p>
          {sub.graceExpiresAt && (
            <p className="error">Grace period — meals still delivered — until {fmtDate(sub.graceExpiresAt)}. Payment retry needed.</p>
          )}
          {sub.pastDueExpiresAt && (
            <p className="error">Past due — delivery paused — auto-cancels {fmtDate(sub.pastDueExpiresAt)} unless resolved.</p>
          )}
          {sub.cancelEffectiveAt && sub.status !== "cancelled" && (
            <p className="muted">Cancellation scheduled to take effect {fmtDate(sub.cancelEffectiveAt)}.</p>
          )}

          <div className="actions-row" style={{ marginTop: 12 }}>
            {canTransition(sub.status, "PAUSE") && (
              <form action={pauseAction}>
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <button className="secondary" type="submit">Pause</button>
              </form>
            )}
            {canTransition(sub.status, "RESUME") && (
              <form action={resumeAction}>
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <button className="secondary" type="submit">Resume</button>
              </form>
            )}
            {sub.status === "active" && (
              <form action={skipTomorrowAction}>
                <input type="hidden" name="subscriptionId" value={sub.id} />
                <button className="secondary" type="submit" disabled={!skipAllowed}>
                  {skipAllowed ? "Skip tomorrow's meal" : "Skip cutoff passed for tomorrow"}
                </button>
              </form>
            )}
            {canTransition(sub.status, "CANCEL") && (
              <>
                <form action={cancelAction}>
                  <input type="hidden" name="subscriptionId" value={sub.id} />
                  <input type="hidden" name="immediate" value="false" />
                  <button className="secondary" type="submit">Cancel at cycle end</button>
                </form>
                <form action={cancelAction}>
                  <input type="hidden" name="subscriptionId" value={sub.id} />
                  <input type="hidden" name="immediate" value="true" />
                  <button className="danger" type="submit">Cancel immediately</button>
                </form>
              </>
            )}
          </div>
        </div>
      ))}

      {upcomingOrders.length > 0 && (
        <div className="card">
          <h2>Upcoming deliveries</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Meal</th>
                <th>Item</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {upcomingOrders.map((order) => (
                <tr key={order.id}>
                  <td>{fmtDate(order.deliveryDate)}</td>
                  <td>{order.mealType.name}</td>
                  <td>
                    {order.menuItem.name}
                    {order.substitutedFrom && (
                      <span className="muted"> (substituted from {order.substitutedFrom})</span>
                    )}
                  </td>
                  <td>{fmtMoney(order.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  );
}
