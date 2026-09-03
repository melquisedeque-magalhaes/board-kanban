import "dotenv/config";
import { defineConfig } from "prisma/config";

export function migrationUrl() {
  const configured = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  if (!configured) return configured;
  try {
    const url = new URL(configured);
    // Neon pooler does not preserve session advisory locks. Vercel environments
    // have historically supplied the pooled hostname in DIRECT_URL by mistake.
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
    return url.toString();
  } catch {
    return configured;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    // Migrações usam DIRECT_URL (conexão direta, sem pooler) quando disponível.
    // O pooler do Neon quebra o advisory lock do `migrate deploy` (locks de sessão
    // não sobrevivem ao transaction pooling → P1002 timeout). Runtime segue no
    // DATABASE_URL pooled (ver src/lib/db.ts). Fallback pro DATABASE_URL em dev/local.
    // process.env (não o env() estrito do Prisma) para não quebrar o
    // `prisma generate` no build da Vercel quando a URL ainda não está injetada.
    url: migrationUrl(),
  },
});
