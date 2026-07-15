import { describe, it, expect } from "vitest";
import { applyView, isFiltering, canReorder, EMPTY_VIEW } from "./view";
import type { ColumnData } from "./Column";

const card = (over: Partial<ColumnData["cards"][number]>) => ({
  id: "x", title: "t", position: 1, priority: null,
  assignees: [], labels: [], _count: { comments: 0 }, ...over,
}) as ColumnData["cards"][number];

const cols: ColumnData[] = [{
  id: "c1", name: "A Fazer", cards: [
    card({ id: "1", title: "Implementar Tool Search", code: "TI-1", priority: "ALTA", assignees: [{ id: "u1", name: "MS" }] }),
    card({ id: "2", title: "Bug no login", priority: "BAIXA" }),
    card({ id: "3", title: "Ajuste CSS", priority: "MEDIA" }),
  ],
}];

describe("applyView", () => {
  it("busca por título e código", () => {
    expect(applyView(cols, { ...EMPTY_VIEW, query: "tool" })[0].cards.map((c) => c.id)).toEqual(["1"]);
    expect(applyView(cols, { ...EMPTY_VIEW, query: "ti-1" })[0].cards.map((c) => c.id)).toEqual(["1"]);
  });
  it("filtra por prioridade e assignee", () => {
    expect(applyView(cols, { ...EMPTY_VIEW, priority: "ALTA" })[0].cards.map((c) => c.id)).toEqual(["1"]);
    expect(applyView(cols, { ...EMPTY_VIEW, assignee: "u1" })[0].cards.map((c) => c.id)).toEqual(["1"]);
  });
  it("ordena por prioridade (CRÍTICA→BAIXA) e por título", () => {
    expect(applyView(cols, { ...EMPTY_VIEW, sort: "priority" })[0].cards.map((c) => c.id)).toEqual(["1", "3", "2"]);
    expect(applyView(cols, { ...EMPTY_VIEW, sort: "title" })[0].cards.map((c) => c.title)).toEqual(["Ajuste CSS", "Bug no login", "Implementar Tool Search"]);
  });
  it("isFiltering reflete qualquer controle ativo (mas não o default agrupado)", () => {
    expect(isFiltering(EMPTY_VIEW)).toBe(false);
    expect(isFiltering({ ...EMPTY_VIEW, query: "x" })).toBe(true);
    expect(isFiltering({ ...EMPTY_VIEW, sort: "title" })).toBe(true);
    expect(isFiltering({ ...EMPTY_VIEW, sort: "priority" })).toBe(true);
  });

  it("canReorder libera drag com filtros/busca ativos e só trava sort que ignora position", () => {
    // default (manual) → pode arrastar
    expect(canReorder(EMPTY_VIEW)).toBe(true);
    // filtros de faceta e busca NÃO travam o drag (era o bug)
    expect(canReorder({ ...EMPTY_VIEW, query: "x" })).toBe(true);
    expect(canReorder({ ...EMPTY_VIEW, priority: "ALTA" })).toBe(true);
    expect(canReorder({ ...EMPTY_VIEW, type: "BUG" })).toBe(true);
    expect(canReorder({ ...EMPTY_VIEW, assignee: "u1" })).toBe(true);
    // sort por prioridade respeita position (desempate) → drag continua válido
    expect(canReorder({ ...EMPTY_VIEW, sort: "priority" })).toBe(true);
    // title/created ignoram position → reorder não gruda, drag travado
    expect(canReorder({ ...EMPTY_VIEW, sort: "title" })).toBe(false);
    expect(canReorder({ ...EMPTY_VIEW, sort: "created" })).toBe(false);
  });
});

describe("agrupamento fixo por prioridade (default global)", () => {
  it("o modo manual (default) sempre agrupa por prioridade, com position como desempate", () => {
    const c: ColumnData[] = [{
      id: "c1", name: "A Fazer", cards: [
        card({ id: "a", priority: "BAIXA", position: 1 }),
        card({ id: "b", priority: "CRITICA", position: 5 }),
        card({ id: "c", priority: "ALTA", position: 2 }),
        card({ id: "d", priority: "ALTA", position: 1 }),
        card({ id: "e", priority: null, position: 1 }),
        card({ id: "f", priority: "MEDIA", position: 1 }),
      ],
    }];
    // CRÍTICA → ALTA (por position) → MÉDIA → BAIXA → sem prioridade
    expect(applyView(c, EMPTY_VIEW)[0].cards.map((x) => x.id)).toEqual(["b", "d", "c", "f", "a", "e"]);
  });

  it("CRÍTICA fica acima de ALTA no sort explícito", () => {
    const c: ColumnData[] = [{
      id: "c1", name: "A Fazer", cards: [
        card({ id: "alta", priority: "ALTA" }),
        card({ id: "crit", priority: "CRITICA" }),
      ],
    }];
    expect(applyView(c, { ...EMPTY_VIEW, sort: "priority" })[0].cards.map((x) => x.id)).toEqual(["crit", "alta"]);
  });
});
