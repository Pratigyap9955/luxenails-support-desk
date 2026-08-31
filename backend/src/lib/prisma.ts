import { PrismaClient } from "@prisma/client";

/**
 * A single PrismaClient, cached on globalThis.
 *
 * On serverless (Vercel) the module is re-evaluated on cold starts but warm
 * invocations reuse the same process — without this cache each invocation would
 * open a new connection pool and quickly exhaust the database's connection
 * limit. The same cache also prevents duplicate clients under dev hot-reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
