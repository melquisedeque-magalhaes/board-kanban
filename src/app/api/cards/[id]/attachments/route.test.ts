import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/server/auth-guard", () => ({ requireUser }));
const cardMocks = vi.hoisted(() => ({
  addAttachment: vi.fn().mockResolvedValue({ id: "att1" }),
  listAttachments: vi.fn(),
}));
vi.mock("@/server/cards", () => cardMocks);
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "card1" }) };
const BLOB = "https://abc.public.blob.vercel-storage.com/cards/card1/video-x1y2.mp4";

function jsonReq(body: unknown) {
  return new Request("http://x/api/cards/card1/attachments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "t";
});

describe("POST /api/cards/[id]/attachments com JSON (arquivo já no Blob)", () => {
  it("registra o anexo sem receber o arquivo", async () => {
    const res = await POST(jsonReq({ url: BLOB, name: "video.mp4", contentType: "video/mp4", size: 20_000_000 }), ctx);
    expect(res.status).toBe(201);
    expect(cardMocks.addAttachment).toHaveBeenCalledWith({
      cardId: "card1", url: BLOB, name: "video.mp4", contentType: "video/mp4", size: 20_000_000,
    });
  });

  it("recusa URL fora do Blob do card", async () => {
    const res = await POST(jsonReq({ url: "https://evil.com/x.png", name: "x.png" }), ctx);
    expect(res.status).toBe(400);
    expect(cardMocks.addAttachment).not.toHaveBeenCalled();
  });

  it("recusa URL do Blob de outro card", async () => {
    const res = await POST(jsonReq({ url: BLOB.replace("card1", "card2"), name: "x.png" }), ctx);
    expect(res.status).toBe(400);
  });

  it("exige login", async () => {
    requireUser.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const res = await POST(jsonReq({ url: BLOB, name: "v.mp4" }), ctx);
    expect(res.status).toBe(401);
  });
});
