-- Add password_hash as nullable first, backfill existing rows, then require
-- it — additive/non-destructive, unlike a plain NOT NULL add against
-- non-empty tables. The backfilled hash is scrypt("tiffin123") in this
-- project's lib/auth/password.ts format ("<salt-hex>:<hash-hex>"), matching
-- the DEMO_PASSWORD every seeded account uses going forward (see
-- prisma/seed.ts) — existing local demo rows keep working with the same
-- documented demo password rather than being silently locked out.

-- AlterTable
ALTER TABLE "kitchens" ADD COLUMN     "password_hash" TEXT;
UPDATE "kitchens" SET "password_hash" = '68c3ade158095385df4393388d484f36:797d56bda726368e149b7eb6c1abc8422b60fcf93074b5d87746ea668ae483a53e7a4f88e75950fc1f0bd4048c80371a9f921aa1e14108c3e6b4a26d47204718' WHERE "password_hash" IS NULL;
ALTER TABLE "kitchens" ALTER COLUMN "password_hash" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT;
UPDATE "users" SET "password_hash" = '68c3ade158095385df4393388d484f36:797d56bda726368e149b7eb6c1abc8422b60fcf93074b5d87746ea668ae483a53e7a4f88e75950fc1f0bd4048c80371a9f921aa1e14108c3e6b4a26d47204718' WHERE "password_hash" IS NULL;
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;
