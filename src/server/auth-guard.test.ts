import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

import { requireUser } from "./auth-guard";

beforeEach(() => vi.clearAllMocks());

describe("requireUser", () => {
  it("retorna 401 sem sessão (userId null)", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await requireUser();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("retorna null quando há userId (deixa passar)", async () => {
    authMock.mockResolvedValue({ userId: "clerk_123" });
    expect(await requireUser()).toBeNull();
  });
});
