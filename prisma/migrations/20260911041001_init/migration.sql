-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'paused', 'grace', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "dietary_category" AS ENUM ('veg', 'jain', 'no_onion_garlic');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('scheduled', 'preparing', 'out_for_delivery', 'delivered', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "kitchen_status" AS ENUM ('pending_approval', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'paid');

-- CreateTable
CREATE TABLE "meal_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_areas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchens" (
    "id" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "area_id" TEXT NOT NULL,
    "status" "kitchen_status" NOT NULL DEFAULT 'pending_approval',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(3),

    CONSTRAINT "kitchens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "meals_per_week" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "area_id" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "dietary_preference" "dietary_category" NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "status_since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_cycle_start" TIMESTAMPTZ(3) NOT NULL,
    "current_cycle_end" TIMESTAMPTZ(3) NOT NULL,
    "next_billing_date" TIMESTAMPTZ(3) NOT NULL,
    "grace_expires_at" TIMESTAMPTZ(3),
    "past_due_expires_at" TIMESTAMPTZ(3),
    "cancel_requested_at" TIMESTAMPTZ(3),
    "cancel_effective_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_status_history" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "from_status" "subscription_status",
    "to_status" "subscription_status" NOT NULL,
    "reason" TEXT,
    "actor" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_pauses" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "paused_at" TIMESTAMPTZ(3) NOT NULL,
    "resume_at" TIMESTAMPTZ(3),
    "resumed_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_skips" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "skip_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_skips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dietary_category" "dietary_category" NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_capacity" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "max_capacity" INTEGER NOT NULL,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "kitchen_capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "delivery_date" DATE NOT NULL,
    "meal_type_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'scheduled',
    "amount_paise" INTEGER NOT NULL,
    "substituted_from" "dietary_category",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "billing_period_start" DATE NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "provider_ref" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "payout_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "kitchen_id" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "gross_paise" INTEGER NOT NULL,
    "commission_rate_bps" INTEGER NOT NULL,
    "commission_paise" INTEGER NOT NULL,
    "net_paise" INTEGER NOT NULL,
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "status" "job_status" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "error_message" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meal_types_code_key" ON "meal_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_areas_code_key" ON "delivery_areas"("code");

-- CreateIndex
CREATE UNIQUE INDEX "kitchens_email_key" ON "kitchens"("email");

-- CreateIndex
CREATE INDEX "plans_kitchen_id_idx" ON "plans"("kitchen_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_kitchen_id_idx" ON "subscriptions"("kitchen_id");

-- CreateIndex
CREATE INDEX "subscription_status_history_subscription_id_idx" ON "subscription_status_history"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_pauses_subscription_id_idx" ON "subscription_pauses"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_skips_subscription_id_skip_date_key" ON "daily_skips"("subscription_id", "skip_date");

-- CreateIndex
CREATE UNIQUE INDEX "menus_date_kitchen_id_meal_type_id_key" ON "menus"("date", "kitchen_id", "meal_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_menu_id_dietary_category_key" ON "menu_items"("menu_id", "dietary_category");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_capacity_date_kitchen_id_meal_type_id_key" ON "kitchen_capacity"("date", "kitchen_id", "meal_type_id");

-- CreateIndex
CREATE INDEX "orders_delivery_date_kitchen_id_idx" ON "orders"("delivery_date", "kitchen_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_subscription_id_delivery_date_meal_type_id_key" ON "orders"("subscription_id", "delivery_date", "meal_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_kitchen_id_payout_id_idx" ON "payments"("kitchen_id", "payout_id");

-- CreateIndex
CREATE INDEX "payouts_kitchen_id_idx" ON "payouts"("kitchen_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_name_run_date_key" ON "job_runs"("job_name", "run_date");

-- AddForeignKey
ALTER TABLE "kitchens" ADD CONSTRAINT "kitchens_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "delivery_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "delivery_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_pauses" ADD CONSTRAINT "subscription_pauses_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_skips" ADD CONSTRAINT "daily_skips_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_capacity" ADD CONSTRAINT "kitchen_capacity_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_capacity" ADD CONSTRAINT "kitchen_capacity_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_meal_type_id_fkey" FOREIGN KEY ("meal_type_id") REFERENCES "meal_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_kitchen_id_fkey" FOREIGN KEY ("kitchen_id") REFERENCES "kitchens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
