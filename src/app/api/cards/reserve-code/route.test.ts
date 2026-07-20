import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ nextCardCode: vi.fn().mockResolvedValue("TI-131") }));

import { requireUser } from "@/server/auth-guard";
import { nextCardCode } from "@/server/cards";
import { POST } from "./route";

describe("POST /api/cards/reserve-code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reserva e devolve o próximo code", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "TI-131" });
  });

  it("não-autenticado: devolve a resposta de auth sem reservar código", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const res = await POST();
    expect(res.status).toBe(401);
    expect(vi.mocked(nextCardCode)).not.toHaveBeenCalled();
  });
});
