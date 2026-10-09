import "dotenv/config";
import { defineConfig } from "prisma/config";
import { databaseUrl } from "./lib/database-config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun run scripts/seed-tags.ts",
  },
  datasource: process.env.DATABASE_URL ? { url: databaseUrl() } : undefined,
});
