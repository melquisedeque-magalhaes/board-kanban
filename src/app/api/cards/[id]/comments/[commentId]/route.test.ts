import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth-guard", () => ({ requireUser: vi.fn().mockResolvedValue(null) }));
const cardMocks = vi.hoisted(() => ({
  getComment: vi.fn(),
  updateComment: vi.fn().mockResolvedValue({ id: "cm1" }),
  deleteComment: vi.fn().mockResolvedValue({ urls: [] }),
  getCard: vi.fn().mockResolvedValue({ id: "card1", comments: [] }),
}));
vi.mock("@/server/cards", () => cardMocks);
const purgeBlobs = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/server/blobs", () => ({ purgeBlobs }));
const syncCurrentUser = vi.hoisted(() => vi.fn().mockResolvedValue({
  id: "u1", name: "Giovanni", avatarUrl: null,
}));
vi.mock("@/server/users", () => ({ syncCurrentUser }));

import { DELETE } from "./route";

const call = (cardId = "card1", commentId = "cm1") =>
  DELETE(new Request(`http://x/api/cards/${cardId}/comments/${commentId}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: cardId, commentId }),
  });

beforeEach(() => vi.clearAllMocks());

describe("DELETE /api/cards/[id]/comments/[commentId]", () => {
  it("o autor exclui o próprio comentário e recebe o card atualizado", async () => {
    cardMocks.getComment.mockResolvedValue({ id: "cm1", cardId: "card1", authorId: "u1" });
    cardMocks.deleteComment.mockResolvedValue({ urls: ["https://x.blob.vercel-storage.com/a.png"] });

    const response = await call();

    expect(response.status).toBe(200);
    expect(cardMocks.deleteComment).toHaveBeenCalledWith("cm1");
    expect(purgeBlobs).toHaveBeenCalledWith(["https://x.blob.vercel-storage.com/a.png"]);
    expect(await response.json()).toEqual({ id: "card1", comments: [] });
  });

  it("403 para quem não é o autor", async () => {
    cardMocks.getComment.mockResolvedValue({ id: "cm1", cardId: "card1", authorId: "outro" });

    expect((await call()).status).toBe(403);
    expect(cardMocks.deleteComment).not.toHaveBeenCalled();
  });

  it("comentário legado sem autor pode ser excluído", async () => {
    cardMocks.getComment.mockResolvedValue({ id: "cm1", cardId: "card1", authorId: null });

    expect((await call()).status).toBe(200);
    expect(cardMocks.deleteComment).toHaveBeenCalledWith("cm1");
  });

  it("404 quando o comentário é de outro card", async () => {
    cardMocks.getComment.mockResolvedValue({ id: "cm1", cardId: "outroCard", authorId: "u1" });

    expect((await call()).status).toBe(404);
    expect(cardMocks.deleteComment).not.toHaveBeenCalled();
  });

  it("404 quando o comentário não existe", async () => {
    cardMocks.getComment.mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });
});
