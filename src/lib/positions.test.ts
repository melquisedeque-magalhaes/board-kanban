import { describe, it, expect } from "vitest";
import { positionBetween } from "./positions";

describe("positionBetween", () => {
  it("retorna 1000 quando lista vazia", () => {
    expect(positionBetween(null, null)).toBe(1000);
  });
  it("início da lista = primeiro - 1000", () => {
    expect(positionBetween(null, 1000)).toBe(0);
  });
  it("fim da lista = último + 1000", () => {
    expect(positionBetween(1000, null)).toBe(2000);
  });
  it("meio = média dos vizinhos", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
  });
});
