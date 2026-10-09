import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DATABASE_SCHEMA, databaseUrl } from "./database-config";

export function createPrismaClient() {
  const adapter = new PrismaPg(
    {
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 8_000,
      max: 5,
      maxUses: 1,
    },
    { schema: DATABASE_SCHEMA },
  );
  return new PrismaClient({ adapter });
}
