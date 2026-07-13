import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_test" }),
}));
const createCard = vi.fn().mockResolvedValue({ id: "new", title: "novo" });
vi.mock("@/server/cards", () => ({
  listCards: vi.fn().mockResolvedValue([{ id: "x", title: "t" }]),
  createCard: (...args: unknown[]) => createCard(...args),
}));
const syncCurrentUser = vi.fn().mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
vi.mock("@/server/users", () => ({ syncCurrentUser: () => syncCurrentUser() }));
import { GET, POST } from "./route";

beforeEach(() => {
  createCard.mockClear();
  syncCurrentUser.mockClear();
  syncCurrentUser.mockResolvedValue({ id: "me", name: "Eu", avatarUrl: null });
});

describe("GET /api/cards", () => {
  it("retorna cards", async () => {
    const res = await GET(new Request("http://x/api/cards"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "x", title: "t" }]);
  });
});
describe("POST /api/cards", () => {
  it("cria card", async () => {
    const res = await POST(new Request("http://x/api/cards", {
      method: "POST", body: JSON.stringify({ columnName: "A Fazer", title: "novo" }),
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "new" });
  });

  it("define o criador como 'Solicitado por' quando requestedBy não é informado", async () => {
    await POST(new Request("http://x/api/cards", {
      method: "POST", body: JSON.stringify({ columnName: "A Fazer", title: "novo" }),
    }));
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: "me" }));
  });

  it("respeita requestedBy explícito e não sobrescreve com o criador", async () => {
    await POST(new Request("http://x/api/cards", {
      method: "POST", body: JSON.stringify({ columnName: "A Fazer", title: "novo", requestedBy: "outro" }),
    }));
    expect(syncCurrentUser).not.toHaveBeenCalled();
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ requestedBy: "outro" }));
  });
});
