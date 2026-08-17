import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const subscriberMocks = vi.hoisted(() => ({
  listColumnSubscribers: vi.fn(),
}));
vi.mock("@/server/notifications", () => subscriberMocks);

import { requireUser } from "@/server/auth-guard";
import { GET } from "./route";

const context = { params: Promise.resolve({ id: "col1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  subscriberMocks.listColumnSubscribers.mockResolvedValue([
    { user: { id: "u1", name: "Ana", avatarUrl: "ana.png" }, columnId: "col1", userId: "u1" },
    { user: { id: "u2", name: "Bia", avatarUrl: null }, columnId: "col1", userId: "u2" },
  ]);
});

describe("GET /api/columns/[id]/subscribers", () => {
  it("retorna inscritos ordenados no payload enxuto", async () => {
    const res = await GET(new Request("http://x/api/columns/col1/subscribers"), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "u1", name: "Ana", avatarUrl: "ana.png" },
      { id: "u2", name: "Bia", avatarUrl: null },
    ]);
    expect(subscriberMocks.listColumnSubscribers).toHaveBeenCalledWith("col1");
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await GET(new Request("http://x/api/columns/col1/subscribers"), context);

    expect(res).toBe(unauth);
    expect(subscriberMocks.listColumnSubscribers).not.toHaveBeenCalled();
  });

  it("converte coluna ausente em 404", async () => {
    subscriberMocks.listColumnSubscribers.mockRejectedValueOnce(new Error("Coluna não encontrada"));

    const res = await GET(new Request("http://x/api/columns/missing/subscribers"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });
});
