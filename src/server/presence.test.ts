import { describe, it, expect } from "vitest";
import { touch, online } from "./presence";

describe("presence", () => {
  it("inclui quem deu heartbeat dentro da janela e expira o resto", () => {
    const t0 = 1_000_000;
    touch({ id: "a", name: "Ana", avatarUrl: null }, t0);
    touch({ id: "b", name: "Bia", avatarUrl: "x" }, t0);

    // 30s depois: ambos online
    expect(online(t0 + 30_000).map((u) => u.id).sort()).toEqual(["a", "b"]);

    // 'a' renova; 50s depois do t0 só 'a' fica (b expirou aos 45s)
    touch({ id: "a", name: "Ana", avatarUrl: null }, t0 + 40_000);
    expect(online(t0 + 50_000).map((u) => u.id)).toEqual(["a"]);
  });
});
