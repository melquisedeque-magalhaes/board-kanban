import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const cardMocks = vi.hoisted(() => ({
  addComment: vi.fn().mockResolvedValue({ id: "comment1" }),
  getCard: vi.fn().mockResolvedValue({ id: "card1" }),
}));
vi.mock("@/server/cards", () => cardMocks);
const syncCurrentUser = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: "u1", name: "Giovanni", avatarUrl: null,
}));
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/cards/[id]/comments", () => {
  it("encaminha o id do autor sincronizado ao criar comentário", async () => {
    const response = await POST(
      new Request("http://x/api/cards/card1/comments", {
        method: "POST",
        body: JSON.stringify({ body: "Comentário", attachmentIds: ["a1"] }),
      }),
      { params: Promise.resolve({ id: "card1" }) },
    );

    expect(response.status).toBe(201);
    expect(cardMocks.addComment).toHaveBeenCalledWith(
      "card1", "Comentário", "u1", ["a1"],
    );
  });
});
