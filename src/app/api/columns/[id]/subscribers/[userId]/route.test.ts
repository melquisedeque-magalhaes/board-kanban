import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const subscriberMocks = vi.hoisted(() => ({
  subscribeToColumn: vi.fn(),
  unsubscribeFromColumn: vi.fn(),
}));
vi.mock("@/server/notifications", () => subscriberMocks);

import { requireUser } from "@/server/auth-guard";
import { DELETE, POST } from "./route";

const context = { params: Promise.resolve({ id: "col1", userId: "u1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  subscriberMocks.subscribeToColumn.mockResolvedValue({ columnId: "col1", userId: "u1" });
  subscriberMocks.unsubscribeFromColumn.mockResolvedValue({ ok: true });
});

describe("POST /api/columns/[id]/subscribers/[userId]", () => {
  it("adiciona incrementalmente e retorna 201", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), context);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(subscriberMocks.subscribeToColumn).toHaveBeenCalledWith("col1", "u1");
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await POST(new Request("http://x", { method: "POST" }), context);

    expect(res).toBe(unauth);
    expect(subscriberMocks.subscribeToColumn).not.toHaveBeenCalled();
  });

  it.each(["Coluna não encontrada", "Usuário não encontrado"])(
    "converte %s em 404",
    async (message) => {
      subscriberMocks.subscribeToColumn.mockRejectedValueOnce(new Error(message));

      const res = await POST(new Request("http://x", { method: "POST" }), context);

      expect(res.status).toBe(404);
    },
  );
});

describe("DELETE /api/columns/[id]/subscribers/[userId]", () => {
  it("remove incrementalmente e retorna 200", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), context);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(subscriberMocks.unsubscribeFromColumn).toHaveBeenCalledWith("col1", "u1");
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await DELETE(new Request("http://x", { method: "DELETE" }), context);

    expect(res).toBe(unauth);
    expect(subscriberMocks.unsubscribeFromColumn).not.toHaveBeenCalled();
  });

  it.each(["Coluna não encontrada", "Usuário não encontrado"])(
    "converte %s em 404",
    async (message) => {
      subscriberMocks.unsubscribeFromColumn.mockRejectedValueOnce(new Error(message));

      const res = await DELETE(new Request("http://x", { method: "DELETE" }), context);

      expect(res.status).toBe(404);
    },
  );
});
