import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ peekCardCode: vi.fn().mockResolvedValue("TI-13") }));

import { requireUser } from "@/server/auth-guard";
import { peekCardCode } from "@/server/cards";
import { GET } from "./route";

describe("GET /api/cards/next-code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve a prévia da próxima chave", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "TI-13" });
  });

  it("não-autenticado: devolve a resposta de auth sem consultar a chave", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(vi.mocked(peekCardCode)).not.toHaveBeenCalled();
  });
});
