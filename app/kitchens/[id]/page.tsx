import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCustomerUserId } from "@/lib/auth/session";
import { addDays, businessToday } from "@/lib/domain/time";
import { SubscribeForm } from "./SubscribeForm";

export const dynamic = "force-dynamic";

export default async function KitchenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const kitchen = await prisma.kitchen.findUnique({
    where: { id },
    include: { area: true, plans: { where: { active: true }, include: { mealType: true } } },
  });
  if (!kitchen || kitchen.status !== "active") {
    notFound();
  }

  const today = businessToday();
  const end = addDays(today, 7);
  const menus = await prisma.menu.findMany({
    where: { kitchenId: kitchen.id, date: { gte: today, lt: end } },
    include: { items: true, mealType: true },
    orderBy: [{ date: "asc" }],
  });

  const userId = await getCustomerUserId();
  const areas = await prisma.deliveryArea.findMany();

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
        <Link href="/kitchens">Back to kitchens</Link>
        <div className="spacer" />
        {userId && <Link href="/account">My account</Link>}
      </nav>
      <div className="container">
      <h1>{kitchen.name}</h1>
      <p className="muted">by {kitchen.ownerName} · {kitchen.area.name}</p>
      {kitchen.bio && <p>{kitchen.bio}</p>}

      <div className="card">
        <h2>This week&apos;s menu</h2>
        {menus.length === 0 && <p className="muted">No menu published yet.</p>}
        {menus.map((menu) => (
          <div key={menu.id} style={{ marginBottom: 10 }}>
            <strong>{menu.date.toISOString().slice(0, 10)} · {menu.mealType.name}</strong>
            <ul>
              {menu.items.map((item) => (
                <li key={item.id}><span className="muted">{item.dietaryCategory}:</span> {item.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Subscribe</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          {process.env.RAZORPAY_KEY_ID
            ? "Razorpay test mode — use test card 4111 1111 1111 1111, any future expiry/CVV. No real money moves."
            : "Payments are mocked in this environment — checkout is simulated instantly."}
          {" "}Logged in with an email containing &quot;+fail@&quot;? This checkout will simulate a declined payment.
        </p>
        {!userId ? (
          <p className="muted">
            <Link href="/login">Log in</Link> to subscribe to {kitchen.name}.
          </p>
        ) : kitchen.plans.length === 0 ? (
          <p className="muted">This kitchen hasn&apos;t published any plans yet.</p>
        ) : (
          <SubscribeForm
            plans={kitchen.plans.map((plan) => ({
              id: plan.id,
              label: `${plan.name} (${plan.mealType.name}) — ₹${(plan.pricePaise / 100).toFixed(0)}/cycle`,
            }))}
            areas={areas}
            defaultAreaId={kitchen.areaId}
          />
        )}
      </div>
      </div>
    </>
  );
}
