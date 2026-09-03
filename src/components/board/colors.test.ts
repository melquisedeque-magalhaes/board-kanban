import { describe, expect, it } from "vitest";
import { columnSwatch, swatchFromColor, COLUMN_PALETTE } from "./colors";

describe("columnSwatch", () => {
  it("a cor salva na coluna ganha do mapa por nome", () => {
    expect(columnSwatch("A Fazer", "#d3e5ef").bg).toBe("#d3e5ef");
  });

  it("sem cor salva, usa o mapa por nome das colunas do seed", () => {
    expect(columnSwatch("Em Andamento").bg).toBe("#d3e5ef");
  });

  it("coluna nova sem cor cai no cinza default em vez de ficar sem chip", () => {
    expect(columnSwatch("Code Review").bg).toBe("#e3e2e0");
  });

  it("cor malformada é ignorada (não vira style quebrado)", () => {
    expect(columnSwatch("Code Review", "azul").bg).toBe("#e3e2e0");
    expect(columnSwatch("Code Review", "#fff").bg).toBe("#e3e2e0");
  });
});

describe("swatchFromColor", () => {
  it("fundo claro recebe texto escuro do mesmo matiz", () => {
    const sw = swatchFromColor("#d3e5ef");
    expect(sw.text).not.toBe("#ffffff");
    expect(sw.text).toBe("#3b4043");
  });

  it("fundo escuro recebe texto branco", () => {
    expect(swatchFromColor("#183347").text).toBe("#ffffff");
  });

  it("toda a paleta oferecida gera contraste legível", () => {
    for (const c of COLUMN_PALETTE) {
      const sw = swatchFromColor(c.value);
      expect(sw.bg).toBe(c.value);
      expect(sw.text).not.toBe(c.value);
    }
  });
});
