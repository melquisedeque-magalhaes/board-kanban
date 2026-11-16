import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@/server/auth-guard", () => ({ requireUser }));
const handleUpload = vi.hoisted(() => vi.fn().mockResolvedValue({ type: "blob.generate-client-token", clientToken: "tok" }));
vi.mock("@vercel/blob/client", () => ({ handleUpload }));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "card1" }) };
const req = () => new Request("http://x/api/cards/card1/attachments/upload", {
  method: "POST",
  body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "cards/card1/a.png" } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "t";
});

describe("POST /api/cards/[id]/attachments/upload", () => {
  it("gera token de upload direto ao Blob", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "blob.generate-client-token", clientToken: "tok" });
  });

  it("só autoriza caminho dentro do próprio card", async () => {
    await POST(req(), ctx);
    const { onBeforeGenerateToken } = handleUpload.mock.calls[0][0];
    await expect(onBeforeGenerateToken("cards/card1/a.png", null, false)).resolves.toMatchObject({ addRandomSuffix: true });
    await expect(onBeforeGenerateToken("cards/card2/a.png", null, false)).rejects.toThrow();
    await expect(onBeforeGenerateToken("cards/card1/../card2/a.png", null, false)).rejects.toThrow();
  });

  it("exige login antes de gerar token", async () => {
    requireUser.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it("responde 503 sem Blob configurado", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const res = await POST(req(), ctx);
    expect(res.status).toBe(503);
  });
});
