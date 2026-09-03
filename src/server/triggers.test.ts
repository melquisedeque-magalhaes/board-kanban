import { describe, expect, it } from "vitest";
import { validateWebhookUrl } from "./triggers";

describe("validateWebhookUrl", () => {
  it("aceita somente webhook HTTPS oficial do Fusion", () => {
    expect(validateWebhookUrl("https://fusion-agents-dev.brq.com/api/hooks/abc123")).toBe(true);
    expect(validateWebhookUrl("https://fusion-agents.brq.com/api/hooks/abc123")).toBe(true);
  });

  it("recusa destinos fora do endpoint permitido", () => {
    expect(validateWebhookUrl("http://fusion-agents-dev.brq.com/api/hooks/abc123")).toBe(false);
    expect(validateWebhookUrl("https://example.com/api/hooks/abc123")).toBe(false);
    expect(validateWebhookUrl("https://fusion-agents-dev.brq.com/api/hooks/")).toBe(false);
  });
});
