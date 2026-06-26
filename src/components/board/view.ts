import type { ColumnData } from "./Column";

export type SortMode = "manual" | "priority" | "title";

export interface ViewState {
  query: string;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  assignee: string | null; // user id
  sort: SortMode;
}

export const EMPTY_VIEW: ViewState = { query: "", priority: null, assignee: null, sort: "manual" };

const PRIORITY_RANK: Record<string, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };

// Filtra (busca + prioridade + assignee) e ordena os cards de cada coluna.
export function applyView(columns: ColumnData[], v: ViewState): ColumnData[] {
  const q = v.query.trim().toLowerCase();
  return columns.map((col) => {
    let cards = col.cards.filter((c) => {
      if (q && !`${c.code ?? ""} ${c.title}`.toLowerCase().includes(q)) return false;
      if (v.priority && c.priority !== v.priority) return false;
      if (v.assignee && !c.assignees.some((a) => a.id === v.assignee)) return false;
      return true;
    });
    if (v.sort === "priority") {
      cards = [...cards].sort(
        (a, b) => (PRIORITY_RANK[a.priority ?? ""] ?? 9) - (PRIORITY_RANK[b.priority ?? ""] ?? 9),
      );
    } else if (v.sort === "title") {
      cards = [...cards].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    }
    return { ...col, cards };
  });
}

// Drag manual só faz sentido sem filtro/ordenação ativos.
export function isFiltering(v: ViewState): boolean {
  return !!(v.query.trim() || v.priority || v.assignee || v.sort !== "manual");
}

export function activeFilterCount(v: ViewState): number {
  return (v.priority ? 1 : 0) + (v.assignee ? 1 : 0);
}
