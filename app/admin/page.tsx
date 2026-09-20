import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { isAdmin } from "@/lib/auth/session";
import { businessTomorrow } from "@/lib/domain/time";
import {
  logoutAdmin,
  approveKitchenAction,
  suspendKitchenAction,
  reactivateKitchenAction,
  runJobAction,
  generatePayoutsAction,
  markPayoutPaidAction,
} from "@/app/actions/admin";

export const dynamic = "force-dynamic";

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const tomorrow = businessTomorrow();

  const [pending, active, suspended, jobRun, payouts] = await Promise.all([
    prisma.kitchen.findMany({ where: { status: "pending_approval" }, include: { area: true } }),
    prisma.kitchen.findMany({ where: { status: "active" }, include: { area: true } }),
    prisma.kitchen.findMany({ where: { status: "suspended" }, include: { area: true } }),
    prisma.jobRun.findUnique({ where: { jobName_runDate: { jobName: "generate_orders", runDate: tomorrow } } }),
    prisma.payout.findMany({ include: { kitchen: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand">🍱 The Tiffin Tribe</Link>
        <div className="spacer" />
        <form action={logoutAdmin}><button className="secondary" type="submit">Log out</button></form>
      </nav>
      <div className="container">
      <h1>Admin</h1>

      <div className="card">
        <h2>Pending kitchen approvals</h2>
        {pending.length === 0 && <p className="muted">Nothing pending.</p>}
        {pending.map((kitchen) => (
          <div key={kitchen.id} className="actions-row" style={{ marginBottom: 8, alignItems: "center" }}>
            <span>{kitchen.name} — {kitchen.ownerName} ({kitchen.area.name})</span>
            <form action={approveKitchenAction}>
              <input type="hidden" name="kitchenId" value={kitchen.id} />
              <button type="submit">Approve</button>
            </form>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Active kitchens ({active.length})</h2>
        {active.map((kitchen) => (
          <div key={kitchen.id} className="actions-row" style={{ marginBottom: 8, alignItems: "center" }}>
            <span>{kitchen.name} — {kitchen.ownerName} ({kitchen.area.name})</span>
            <form action={suspendKitchenAction}>
              <input type="hidden" name="kitchenId" value={kitchen.id} />
              <button className="danger" type="submit">Suspend</button>
            </form>
          </div>
        ))}
      </div>

      {suspended.length > 0 && (
        <div className="card">
          <h2>Suspended kitchens</h2>
          {suspended.map((kitchen) => (
            <div key={kitchen.id} className="actions-row" style={{ marginBottom: 8, alignItems: "center" }}>
              <span>{kitchen.name} — {kitchen.ownerName}</span>
              <form action={reactivateKitchenAction}>
                <input type="hidden" name="kitchenId" value={kitchen.id} />
                <button className="secondary" type="submit">Reactivate</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Daily order generation</h2>
        <p className="muted">Materializes tomorrow&apos;s orders across every active kitchen. Safe to run more than once.</p>
        <form action={runJobAction}>
          <button type="submit">Run daily job now</button>
        </form>
        {jobRun && (
          <p className="muted" style={{ marginTop: 8 }}>
            Tomorrow ({tomorrow.toISOString().slice(0, 10)}): <span className={jobRun.status === "success" ? "badge active" : "badge grace"}>{jobRun.status}</span>
            {jobRun.errorMessage && <span className="error"> — {jobRun.errorMessage}</span>}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Payouts</h2>
        <p className="muted">
          Settles every kitchen&apos;s successful payments not yet paid out into one payout each,
          minus platform commission.
        </p>
        <form action={generatePayoutsAction}>
          <button type="submit">Generate payouts</button>
        </form>
        {payouts.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Kitchen</th><th>Gross</th><th>Commission</th><th>Net</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{payout.kitchen.name}</td>
                  <td>{fmtMoney(payout.grossPaise)}</td>
                  <td>{fmtMoney(payout.commissionPaise)} ({(payout.commissionRateBps / 100).toFixed(1)}%)</td>
                  <td>{fmtMoney(payout.netPaise)}</td>
                  <td><span className={`badge ${payout.status === "paid" ? "active" : "paused"}`}>{payout.status}</span></td>
                  <td>
                    {payout.status !== "paid" && (
                      <form action={markPayoutPaidAction}>
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <button className="secondary" type="submit">Mark paid</button>
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
