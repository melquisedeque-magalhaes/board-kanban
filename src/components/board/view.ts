import type { ColumnData } from "./Column";

export type SortMode = "manual" | "priority" | "title";

export interface ViewState {
  query: string;
  priority: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | null;
  type: "BUG" | "FEATURE" | "TAREFA" | null;
  assignee: string | null; // user id
  sort: SortMode;
}

export const EMPTY_VIEW: ViewState = { query: "", priority: null, type: null, assignee: null, sort: "manual" };

const PRIORITY_RANK: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
export const priorityRank = (p?: string | null) => PRIORITY_RANK[p ?? ""] ?? 9;

// Filtra (busca + prioridade + assignee) e ordena os cards de cada coluna.
// Default global: os cards ficam sempre AGRUPADOS por prioridade (Crítica→Alta→
// Média→Baixa→sem), com `position` como desempate — assim o drag reordena dentro
// da mesma faixa. O sort "title" é a única ordenação que ignora a prioridade.
export function applyView(columns: ColumnData[], v: ViewState): ColumnData[] {
  const q = v.query.trim().toLowerCase();
  return columns.map((col) => {
    const cards = col.cards.filter((c) => {
      if (q && !`${c.code ?? ""} ${c.title}`.toLowerCase().includes(q)) return false;
      if (v.priority && c.priority !== v.priority) return false;
      if (v.type && c.type !== v.type) return false;
      if (v.assignee && !c.assignees.some((a) => a.id === v.assignee)) return false;
      return true;
    });
    const sorted = [...cards];
    if (v.sort === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    } else {
      // "manual" (default) e "priority": agrupa por prioridade, desempata por position.
      sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.position - b.position);
    }
    return { ...col, cards: sorted };
  });
}

// Drag manual só faz sentido sem filtro/ordenação ativos.
export function isFiltering(v: ViewState): boolean {
  return !!(v.query.trim() || v.priority || v.type || v.assignee || v.sort !== "manual");
}

export function activeFilterCount(v: ViewState): number {
  return (v.priority ? 1 : 0) + (v.type ? 1 : 0) + (v.assignee ? 1 : 0);
}
