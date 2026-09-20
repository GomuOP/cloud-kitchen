import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 no longer reads DATABASE_URL from the schema file — the driver
// adapter owns the connection. Keeping a single module-scoped instance
// avoids exhausting Postgres connections under Next.js dev-mode hot reload.
declare global {
  var __prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalThis.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
