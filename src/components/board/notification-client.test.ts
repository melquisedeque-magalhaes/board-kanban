import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNotificationBatchCoordinator,
  fetchNotificationPage,
  fetchNotificationVersion,
  markAllNotificationsRead,
  newItemsSince,
  notificationBadge,
  playNotificationChime,
  setNotificationRead,
  shouldPlayNotificationSound,
} from "./notification-client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const item = (id: string, cardId: string) => ({
  id,
  cardId,
  type: "COMMENT_ADDED" as const,
  message: id,
  readAt: null,
  createdAt: "2026-08-17T12:00:00.000Z",
  actor: null,
});

describe("notificationBadge", () => {
  it("limita badge em 99+", () => {
    expect(notificationBadge(0)).toBeNull();
    expect(notificationBadge(7)).toBe("7");
    expect(notificationBadge(100)).toBe("99+");
  });
});

describe("newItemsSince", () => {
  it("coleta itens até o último id conhecido", () => {
    expect(newItemsSince([item("n3", "c3"), item("n2", "c2"), item("n1", "c1")], "n1")
      .map((notification) => notification.id)).toEqual(["n3", "n2"]);
  });
});

describe("shouldPlayNotificationSound", () => {
  it("suprime som só quando todos são do card aberto com foco", () => {
    expect(shouldPlayNotificationSound([item("n2", "c1")], "c1", true)).toBe(false);
    expect(shouldPlayNotificationSound([item("n2", "c1"), item("n3", "c2")], "c1", true)).toBe(true);
    expect(shouldPlayNotificationSound([item("n2", "c1")], "c1", false)).toBe(true);
  });
});

describe("notification batch coordinator", () => {
  const version = (latestId: string | null, totalCount: number) => ({
    version: `${latestId ?? "none"}-${totalCount}-0`,
    unreadCount: 0,
    totalCount,
    latestId,
  });

  it("usa a primeira versão apenas como referência silenciosa", async () => {
    const loadPage = vi.fn();
    const coordinator = createNotificationBatchCoordinator();

    await expect(coordinator.process(version("n1", 1), loadPage)).resolves.toEqual([]);
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("descarta resposta obsoleta quando páginas sobrepostas terminam fora de ordem", async () => {
    const first = deferred<{ items: ReturnType<typeof item>[]; nextCursor: null; unreadCount: number }>();
    const second = deferred<{ items: ReturnType<typeof item>[]; nextCursor: null; unreadCount: number }>();
    const coordinator = createNotificationBatchCoordinator();
    await coordinator.process(version("n0", 1), vi.fn());

    const firstResult = coordinator.process(version("n1", 2), () => first.promise);
    const secondResult = coordinator.process(version("n2", 3), () => second.promise);

    second.resolve({ items: [item("n2", "c2"), item("n1", "c1"), item("n0", "c0")], nextCursor: null, unreadCount: 2 });
    await expect(secondResult).resolves.toEqual([item("n2", "c2"), item("n1", "c1")]);

    first.resolve({ items: [item("n1", "c1"), item("n0", "c0")], nextCursor: null, unreadCount: 1 });
    await expect(firstResult).resolves.toEqual([]);
  });

  it("avança até o latestId realmente processado para não repetir som", async () => {
    const coordinator = createNotificationBatchCoordinator();
    await coordinator.process(version("n0", 1), vi.fn());

    const racedPage = {
      items: [item("n2", "c2"), item("n1", "c1"), item("n0", "c0")],
      nextCursor: null,
      unreadCount: 2,
    };
    await expect(coordinator.process(version("n1", 2), () => Promise.resolve(racedPage)))
      .resolves.toEqual([item("n2", "c2"), item("n1", "c1")]);
    await expect(coordinator.process(version("n2", 3), () => Promise.resolve(racedPage)))
      .resolves.toEqual([]);
  });

  it("ignora uma versão com contagem mais antiga", async () => {
    const loadPage = vi.fn();
    const coordinator = createNotificationBatchCoordinator();
    await coordinator.process(version("n2", 3), vi.fn());

    await expect(coordinator.process(version("n1", 2), loadPage)).resolves.toEqual([]);
    expect(loadPage).not.toHaveBeenCalled();
  });
});

describe("notification fetchers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("busca a página seguinte usando o cursor opaco", async () => {
    const page = {
      items: [item("n1", "c1")],
      nextCursor: "n0",
      unreadCount: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchNotificationPage({ pageParam: "cursor/1" })).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications?cursor=cursor%2F1");
  });

  it("busca a versão leve das notificações", async () => {
    const version = { version: "n1-1-1", unreadCount: 1, totalCount: 1, latestId: "n1" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(version)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchNotificationVersion()).resolves.toEqual(version);
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/version");
  });

  it("marca uma notificação como lida", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(setNotificationRead("n/1", true)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n%2F1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
  });

  it("marca todas as notificações como lidas", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(markAllNotificationsRead()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", { method: "POST" });
  });

  it.each([
    ["page", () => fetchNotificationPage({ pageParam: undefined })],
    ["version", () => fetchNotificationVersion()],
    ["individual read", () => setNotificationRead("n1", true)],
    ["read all", () => markAllNotificationsRead()],
  ])("rejeita resposta não ok de %s", async (_name, request) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(request()).rejects.toThrow("notifications");
  });
});

describe("playNotificationChime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ignora navegadores sem Web Audio API", async () => {
    vi.stubGlobal("window", {});
    await expect(playNotificationChime()).resolves.toBeUndefined();
  });

  it("ignora bloqueio ao criar o contexto de áudio", async () => {
    class BlockedAudioContext {
      constructor() {
        throw new Error("audio blocked");
      }
    }
    vi.stubGlobal("window", { AudioContext: BlockedAudioContext });

    await expect(playNotificationChime()).resolves.toBeUndefined();
  });

  it("sintetiza um único toque curto", async () => {
    const frequency = { setValueAtTime: vi.fn() };
    const volume = {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    const gain = { gain: volume, connect: vi.fn() };
    const oscillator = {
      type: "square",
      frequency,
      connect: vi.fn().mockReturnValue(gain),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const context = {
      currentTime: 10,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockReturnValue(oscillator),
      createGain: vi.fn().mockReturnValue(gain),
      close: vi.fn().mockResolvedValue(undefined),
    };
    class AudioContextMock {
      constructor() {
        return context;
      }
    }
    vi.stubGlobal("window", { AudioContext: AudioContextMock });

    await playNotificationChime();

    expect(oscillator.type).toBe("sine");
    expect(frequency.setValueAtTime).toHaveBeenNthCalledWith(1, 660, 10);
    expect(frequency.setValueAtTime).toHaveBeenNthCalledWith(2, 880, 10.08);
    expect(oscillator.start).toHaveBeenCalledOnce();
    expect(oscillator.stop).toHaveBeenCalledWith(10.18);
    expect(oscillator.addEventListener).toHaveBeenCalledWith("ended", expect.any(Function), { once: true });
  });

  it("ignora rejeição ao fechar o contexto depois do toque", async () => {
    let ended: (() => void) | undefined;
    const catchCloseError = vi.fn().mockReturnValue(Promise.resolve());
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const oscillator = {
      type: "square",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn().mockReturnValue(gain),
      start: vi.fn(),
      stop: vi.fn(),
      addEventListener: vi.fn((_event, listener: () => void) => {
        ended = listener;
      }),
    };
    const context = {
      currentTime: 10,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn().mockReturnValue(oscillator),
      createGain: vi.fn().mockReturnValue(gain),
      close: vi.fn().mockReturnValue({ catch: catchCloseError }),
    };
    class AudioContextMock {
      constructor() {
        return context;
      }
    }
    vi.stubGlobal("window", { AudioContext: AudioContextMock });

    await playNotificationChime();
    ended?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.close).toHaveBeenCalledOnce();
    expect(catchCloseError).toHaveBeenCalledWith(expect.any(Function));
  });
});
