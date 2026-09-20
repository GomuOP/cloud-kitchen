import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getKitchenId } from "@/lib/auth/session";
import { businessTomorrow } from "@/lib/domain/time";
import { logoutKitchenOwner } from "@/app/actions/kitchen";
import { MenuForm, type CategoryNames } from "./MenuForm";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function KitchenMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mealTypeId?: string }>;
}) {
  const kitchenId = await getKitchenId();
  if (!kitchenId) redirect("/kitchen/login");

  const kitchen = await prisma.kitchen.findUniqueOrThrow({ where: { id: kitchenId } });
  const mealTypes = await prisma.mealType.findMany({ orderBy: { name: "asc" } });

  const params = await searchParams;
  const date = params.date || fmtDate(businessTomorrow());
  const mealTypeId = params.mealTypeId || mealTypes[0]?.id || "";

  const menu = mealTypeId
    ? await prisma.menu.findUnique({
        where: { date_kitchenId_mealTypeId: { date: new Date(`${date}T00:00:00.000Z`), kitchenId, mealTypeId } },
        include: { items: true },
      })
    : null;

  const currentNames: CategoryNames = {
    veg: menu?.items.find((i) => i.dietaryCategory === "veg")?.name ?? "",
    jain: menu?.items.find((i) => i.dietaryCategory === "jain")?.name ?? "",
    no_onion_garlic: menu?.items.find((i) => i.dietaryCategory === "no_onion_garlic")?.name ?? "",
  };

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍳 Cloud Kitchen Subscription</Link>
        <div className="spacer" />
        <Link href="/kitchen">Dashboard</Link>
        <form action={logoutKitchenOwner}><button className="secondary" type="submit">Log out</button></form>
      </nav>
      <div className="container">
        <h1>{kitchen.name} — menu</h1>

        {kitchen.status !== "active" ? (
          <p className="error">Your kitchen must be approved by an admin before you can set a menu.</p>
        ) : (
          <MenuForm date={date} mealTypeId={mealTypeId} mealTypes={mealTypes} currentNames={currentNames} />
        )}
      </div>
    </>
  );
}
