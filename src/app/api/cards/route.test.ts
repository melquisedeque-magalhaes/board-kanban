import { describe, it, expect, vi } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk_test" }),
}));
vi.mock("@/server/cards", () => ({
  listCards: vi.fn().mockResolvedValue([{ id: "x", title: "t" }]),
  createCard: vi.fn().mockResolvedValue({ id: "new", title: "novo" }),
}));
import { GET, POST } from "./route";

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
});
