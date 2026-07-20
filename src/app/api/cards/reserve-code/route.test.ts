import { describe, it, expect, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ nextCardCode: vi.fn().mockResolvedValue("TI-131") }));

import { POST } from "./route";

describe("POST /api/cards/reserve-code", () => {
  it("reserva e devolve o próximo code", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "TI-131" });
  });
});
