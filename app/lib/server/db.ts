import "server-only";
import { createPrismaClient } from "../../../lib/prisma-client";

const globalForPrisma = globalThis as unknown as {
  novelaiPrisma?: ReturnType<typeof createPrismaClient>;
};
export function getDb() {
  return (globalForPrisma.novelaiPrisma ??= createPrismaClient());
}
