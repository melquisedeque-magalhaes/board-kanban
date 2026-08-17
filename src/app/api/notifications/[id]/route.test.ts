import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const notificationMocks = vi.hoisted(() => ({
  setNotificationRead: vi.fn(),
}));
vi.mock("@/server/notifications", () => notificationMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { requireUser } from "@/server/auth-guard";
import { PATCH } from "./route";

const context = { params: Promise.resolve({ id: "n1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(null);
  syncCurrentUser.mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
  notificationMocks.setNotificationRead.mockResolvedValue({ ok: true });
});

describe("PATCH /api/notifications/[id]", () => {
  it("atualiza a leitura para o usuário sincronizado", async () => {
    const res = await PATCH(
      new Request("http://x/api/notifications/n1", {
        method: "PATCH",
        body: JSON.stringify({ read: true, recipientId: "não-usar" }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(notificationMocks.setNotificationRead).toHaveBeenCalledWith("me", "n1", true);
  });

  it("encaminha read falso para marcar a notificação como não lida", async () => {
    const res = await PATCH(
      new Request("http://x/api/notifications/n1", {
        method: "PATCH",
        body: JSON.stringify({ read: false }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(notificationMocks.setNotificationRead).toHaveBeenCalledWith("me", "n1", false);
  });

  it("rejeita read que não é boolean", async () => {
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ read: "sim" }) }),
      context,
    );

    expect(res.status).toBe(400);
    expect(notificationMocks.setNotificationRead).not.toHaveBeenCalled();
  });

  it("rejeita JSON malformado", async () => {
    const res = await PATCH(
      new Request("http://x", { method: "PATCH", body: "{ read: true" }),
      context,
    );

    expect(res.status).toBe(400);
    expect(notificationMocks.setNotificationRead).not.toHaveBeenCalled();
  });

  it("devolve exatamente a resposta de autenticação", async () => {
    const unauth = new Response("Sessão expirada", { status: 401 });
    vi.mocked(requireUser).mockResolvedValueOnce(unauth);

    const res = await PATCH(
      new Request("http://x/api/notifications/n1", { method: "PATCH", body: JSON.stringify({ read: true }) }),
      context,
    );

    expect(res).toBe(unauth);
    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(notificationMocks.setNotificationRead).not.toHaveBeenCalled();
  });

  it("rejeita quando o usuário autenticado não pôde ser sincronizado", async () => {
    syncCurrentUser.mockResolvedValueOnce(null);

    const res = await PATCH(
      new Request("http://x/api/notifications/n1", { method: "PATCH", body: JSON.stringify({ read: true }) }),
      context,
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
    expect(notificationMocks.setNotificationRead).not.toHaveBeenCalled();
  });

  it("converte notificação ausente em 404", async () => {
    notificationMocks.setNotificationRead.mockRejectedValueOnce(new Error("Notificação não encontrada"));

    const res = await PATCH(
      new Request("http://x/api/notifications/n1", { method: "PATCH", body: JSON.stringify({ read: true }) }),
      context,
    );

    expect(res.status).toBe(404);
  });

  it("propaga falhas de domínio diferentes de notificação ausente", async () => {
    const failure = new Error("Banco indisponível");
    notificationMocks.setNotificationRead.mockRejectedValueOnce(failure);

    await expect(PATCH(
      new Request("http://x/api/notifications/n1", { method: "PATCH", body: JSON.stringify({ read: true }) }),
      context,
    )).rejects.toBe(failure);
  });
});
