import { describe, it, expect } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("/api/mcp é público (agentes usam Bearer token, não sessão Clerk)", () => {
    expect(isPublicPath("/api/mcp")).toBe(true);
    expect(isPublicPath("/api/mcp/anything")).toBe(true);
  });
  it("/sign-in e /sign-up são públicos", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/sign-in/factor-one")).toBe(true);
    expect(isPublicPath("/sign-up")).toBe(true);
  });
  it("board e REST são protegidos", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/cards")).toBe(false);
    expect(isPublicPath("/api/columns")).toBe(false);
  });
});
