import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/cards", () => ({ releaseCardCode: vi.fn().mockResolvedValue(undefined) }));

import { requireUser } from "@/server/auth-guard";
import { releaseCardCode } from "@/server/cards";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/cards/release-code", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cards/release-code", () => {
  beforeEach(() => vi.clearAllMocks());

  it("libera a chave informada", async () => {
    const res = await POST(req({ code: "TI-18" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(releaseCardCode)).toHaveBeenCalledWith("TI-18");
  });

  it("não-autenticado: devolve a resposta de auth sem liberar", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const res = await POST(req({ code: "TI-18" }));
    expect(res.status).toBe(401);
    expect(vi.mocked(releaseCardCode)).not.toHaveBeenCalled();
  });

  it("sem code no body: não chama releaseCardCode", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(vi.mocked(releaseCardCode)).not.toHaveBeenCalled();
  });
});
