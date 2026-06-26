import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    // process.env (não o env() estrito do Prisma) para não quebrar o
    // `prisma generate` no build da Vercel quando DATABASE_URL ainda não está injetada.
    url: process.env.DATABASE_URL ?? "",
  },
});
