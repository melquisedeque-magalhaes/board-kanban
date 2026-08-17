import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const cardMocks = vi.hoisted(() => ({
  moveCard: vi.fn(),
  updateCard: vi.fn(),
  getCard: vi.fn().mockResolvedValue({ id: "card1" }),
  deleteCard: vi.fn(),
}));
vi.mock("@/server/cards", () => cardMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: "u1", name: "Giovanni", avatarUrl: null,
}));
vi.mock("@/server/users", () => ({ syncCurrentUser }));
vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/cards/[id]", () => {
  it("encaminha o usuário sincronizado ao mover e atualizar o card", async () => {
    const response = await PATCH(
      new Request("http://x/api/cards/card1", {
        method: "PATCH",
        body: JSON.stringify({ columnId: "c2", position: 1000, blocker: "AVISO" }),
      }),
      { params: Promise.resolve({ id: "card1" }) },
    );

    expect(response.status).toBe(200);
    expect(syncCurrentUser).toHaveBeenCalledOnce();
    expect(cardMocks.moveCard).toHaveBeenCalledWith("card1", "c2", 1000, "u1");
    expect(cardMocks.updateCard).toHaveBeenCalledWith(
      "card1", expect.objectContaining({ blocker: "AVISO" }), "u1",
    );
  });
});
