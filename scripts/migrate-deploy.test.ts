import { describe, expect, it } from "vitest";
import { isAdvisoryLockTimeout } from "./migrate-deploy-lib.mjs";

describe("migrate deploy retry detection", () => {
  it("retries Prisma advisory lock timeout", () => {
    expect(isAdvisoryLockTimeout("Error: P1002 The database server was reached but timed out")).toBe(true);
  });

  it("does not retry unrelated migration errors", () => {
    expect(isAdvisoryLockTimeout("Error: P3018 migration failed because a column exists")).toBe(false);
  });
});
