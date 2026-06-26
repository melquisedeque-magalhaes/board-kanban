import { describe, it, expect } from "vitest";
import { applyView, isFiltering, EMPTY_VIEW } from "./view";
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
  it("ordena por prioridade (ALTA→BAIXA) e por título", () => {
    expect(applyView(cols, { ...EMPTY_VIEW, sort: "priority" })[0].cards.map((c) => c.id)).toEqual(["1", "3", "2"]);
    expect(applyView(cols, { ...EMPTY_VIEW, sort: "title" })[0].cards.map((c) => c.title)).toEqual(["Ajuste CSS", "Bug no login", "Implementar Tool Search"]);
  });
  it("isFiltering reflete qualquer controle ativo", () => {
    expect(isFiltering(EMPTY_VIEW)).toBe(false);
    expect(isFiltering({ ...EMPTY_VIEW, query: "x" })).toBe(true);
    expect(isFiltering({ ...EMPTY_VIEW, sort: "title" })).toBe(true);
  });
});
