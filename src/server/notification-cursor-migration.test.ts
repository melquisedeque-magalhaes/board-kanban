import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("migration de revisões por destinatário", () => {
  it("serializa a revisão no BEFORE INSERT e preserva o maior sequence existente", () => {
    const migration = join(
      process.cwd(),
      "prisma/migrations/20260817201500_ti258_notification_cursor/migration.sql",
    );

    expect(existsSync(migration)).toBe(true);
    if (!existsSync(migration)) return;

    const sql = readFileSync(migration, "utf8");
    expect(sql).toMatch(/CREATE TABLE "NotificationCursor"/);
    expect(sql).toMatch(/MAX\("sequence"\)/);
    expect(sql).toMatch(/ALTER COLUMN "sequence" DROP DEFAULT/);
    expect(sql).toMatch(/BEFORE INSERT ON "Notification"/);
    expect(sql).toMatch(/ON CONFLICT \("recipientId"\)[\s\S]*DO UPDATE[\s\S]*"revision" \+ 1/);
    expect(sql).toMatch(/REFERENCES "User"\("id"\) ON DELETE CASCADE/);
  });
});
