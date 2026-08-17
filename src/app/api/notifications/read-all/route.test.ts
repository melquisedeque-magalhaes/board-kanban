import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const notificationMocks = vi.hoisted(() => ({
  markAllNotificationsRead: vi.fn(),
}));
vi.mock("@/server/notifications", () => notificationMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { requireUser } from "@/server/auth-guard";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  syncCurrentUser.mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
  notificationMocks.markAllNotificationsRead.mockResolvedValue({ ok: true });
});

describe("POST /api/notifications/read-all", () => {
  it("marca todas as notificações do usuário sincronizado como lidas", async () => {
    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(notificationMocks.markAllNotificationsRead).toHaveBeenCalledWith("me");
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await POST();

    expect(res).toBe(unauth);
    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(notificationMocks.markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("rejeita quando o usuário autenticado não pôde ser sincronizado", async () => {
    syncCurrentUser.mockResolvedValueOnce(null);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(notificationMocks.markAllNotificationsRead).not.toHaveBeenCalled();
  });
});
