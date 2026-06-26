import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/mcp/server", () => ({
  buildMcpServer: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { POST } from "./route";

const originalToken = process.env.MCP_TOKEN;

function makeRequest(authHeader?: string): Request {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: authHeader ? { Authorization: authHeader } : {},
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("MCP route — auth gate", () => {
  beforeEach(() => {
    process.env.MCP_TOKEN = "test-secret-token";
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.MCP_TOKEN;
    } else {
      process.env.MCP_TOKEN = originalToken;
    }
  });

  it("A: sem Authorization header retorna 401", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("B: Bearer token errado retorna 401", async () => {
    const res = await POST(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
  });

  it("C: MCP_TOKEN ausente retorna 401 mesmo com Bearer válido (closed-by-default)", async () => {
    delete process.env.MCP_TOKEN;
    const res = await POST(makeRequest("Bearer some-token"));
    expect(res.status).toBe(401);
  });
});
