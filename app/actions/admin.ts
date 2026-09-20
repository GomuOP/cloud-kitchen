"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminSession, clearAdminSession, isAdmin } from "@/lib/auth/session";
import { getAdminPasscode } from "@/lib/auth/passcodes";
import { approveKitchen, suspendKitchen, reactivateKitchen } from "@/lib/domain/kitchen/actions";
import { runDailyPipeline } from "@/lib/jobs/dailyPipeline";
import { generatePayouts, markPayoutPaid } from "@/lib/domain/payouts/generatePayouts";

async function requireAdmin() {
  if (!(await isAdmin())) {
    redirect("/admin/login");
  }
}

export type FormActionState = { error?: string };

// Returns { error } instead of throwing — see the comment on this same
// pattern in app/actions/kitchen.ts (Next.js redacts thrown Error messages
// from Server Actions in production; useActionState is the correct fix).
export async function loginAdmin(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const passcode = String(formData.get("passcode") ?? "");
  if (passcode !== getAdminPasscode()) {
    return { error: "Incorrect passcode" };
  }
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/");
}

export async function approveKitchenAction(formData: FormData) {
  await requireAdmin();
  await approveKitchen(String(formData.get("kitchenId")));
  revalidatePath("/admin");
}

export async function suspendKitchenAction(formData: FormData) {
  await requireAdmin();
  await suspendKitchen(String(formData.get("kitchenId")));
  revalidatePath("/admin");
}

export async function reactivateKitchenAction(formData: FormData) {
  await requireAdmin();
  await reactivateKitchen(String(formData.get("kitchenId")));
  revalidatePath("/admin");
}

export async function runJobAction() {
  await requireAdmin();
  await runDailyPipeline();
  revalidatePath("/admin");
  revalidatePath("/kitchen");
}

export async function generatePayoutsAction() {
  await requireAdmin();
  await generatePayouts();
  revalidatePath("/admin");
}

export async function markPayoutPaidAction(formData: FormData) {
  await requireAdmin();
  await markPayoutPaid(String(formData.get("payoutId")));
  revalidatePath("/admin");
}
