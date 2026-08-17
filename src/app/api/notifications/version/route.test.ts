import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const notificationMocks = vi.hoisted(() => ({
  notificationVersion: vi.fn(),
}));
vi.mock("@/server/notifications", () => notificationMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { requireUser } from "@/server/auth-guard";
import { GET } from "./route";

const version = {
  version: "n1-2026-08-17T12:00:00.000Z-3-2",
  unreadCount: 2,
  totalCount: 3,
  latestId: "n1",
  latestCreatedAt: "2026-08-17T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  syncCurrentUser.mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
  notificationMocks.notificationVersion.mockResolvedValue(version);
});

describe("GET /api/notifications/version", () => {
  it("retorna a versão completa das notificações do usuário sincronizado", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(version);
    expect(notificationMocks.notificationVersion).toHaveBeenCalledWith("me");
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await GET();

    expect(res).toBe(unauth);
    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(notificationMocks.notificationVersion).not.toHaveBeenCalled();
  });

  it("rejeita quando o usuário autenticado não pôde ser sincronizado", async () => {
    syncCurrentUser.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(notificationMocks.notificationVersion).not.toHaveBeenCalled();
  });
});
