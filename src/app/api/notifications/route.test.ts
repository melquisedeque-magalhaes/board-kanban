import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const notificationMocks = vi.hoisted(() => ({
  listNotifications: vi.fn(),
}));
vi.mock("@/server/notifications", () => notificationMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { requireUser } from "@/server/auth-guard";
import { GET } from "./route";

const page = {
  items: [{ id: "n1", sequence: "1", message: "Há uma atualização" }],
  nextCursor: null,
  unreadCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  syncCurrentUser.mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
  notificationMocks.listNotifications.mockResolvedValue(page);
});

describe("GET /api/notifications", () => {
  it("retorna a página solicitada para o usuário sincronizado", async () => {
    const res = await GET(new Request("http://x/api/notifications?cursor=n0&limit=3"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(notificationMocks.listNotifications).toHaveBeenCalledWith("me", { cursor: "n0", limit: 3 });
  });

  it("limita a página a 100", async () => {
    await GET(new Request("http://x/api/notifications?limit=999"));

    expect(notificationMocks.listNotifications).toHaveBeenCalledWith("me", { cursor: undefined, limit: 100 });
  });

  it("normaliza limites inválidos para uma página válida", async () => {
    await GET(new Request("http://x/api/notifications?limit=0"));

    expect(notificationMocks.listNotifications).toHaveBeenCalledWith("me", { cursor: undefined, limit: 1 });
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await GET(new Request("http://x/api/notifications"));

    expect(res).toBe(unauth);
    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(notificationMocks.listNotifications).not.toHaveBeenCalled();
  });

  it("rejeita quando o usuário autenticado não pôde ser sincronizado", async () => {
    syncCurrentUser.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://x/api/notifications"));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(notificationMocks.listNotifications).not.toHaveBeenCalled();
  });
});
