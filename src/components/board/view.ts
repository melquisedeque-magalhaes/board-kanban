import type { ColumnData } from "./Column";

export type SortMode = "manual" | "priority" | "title" | "created";
export type SortDir = "asc" | "desc";

export interface ViewState {
  query: string;
  priority: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | null;
  type: "BUG" | "FEATURE" | "TAREFA" | null;
  assignee: string | null; // user id
  sort: SortMode;
  sortDir: SortDir;
}

export const EMPTY_VIEW: ViewState = { query: "", priority: null, type: null, assignee: null, sort: "manual", sortDir: "asc" };

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
    const dir = v.sortDir === "desc" ? -1 : 1;
    if (v.sort === "title") {
      sorted.sort((a, b) => dir * a.title.localeCompare(b.title, "pt-BR"));
    } else if (v.sort === "created") {
      // asc = mais antigos primeiro; desc = mais recentes primeiro.
      sorted.sort((a, b) => dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    } else if (v.sort === "priority") {
      // asc = Crítica→Baixa; desc = Baixa→Crítica. Desempata por position.
      sorted.sort((a, b) => dir * (priorityRank(a.priority) - priorityRank(b.priority)) || a.position - b.position);
    } else {
      // "manual" (default): agrupa por prioridade, desempata por position.
      sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.position - b.position);
    }
    return { ...col, cards: sorted };
  });
}

// Indica se há qualquer controle de view ativo (busca, faceta ou ordenação).
// Usado para hints de UI — NÃO para travar o drag (ver canReorder).
export function isFiltering(v: ViewState): boolean {
  return !!(v.query.trim() || v.priority || v.type || v.assignee || v.sort !== "manual");
}

// O drag reordena/move dentro de `display` (a view já filtrada) e persiste a
// nova `position`. Filtros de faceta e busca NÃO invalidam isso — mover cards
// entre colunas e reordenar dentro da faixa de prioridade continua valendo.
// Só travamos quando a ordenação IGNORA `position` (title/created): aí um
// reorder manual não gruda (o applyView re-ordena) e o drag confundiria.
export function canReorder(v: ViewState): boolean {
  return v.sort === "manual" || v.sort === "priority";
}

export function activeFilterCount(v: ViewState): number {
  return (v.priority ? 1 : 0) + (v.type ? 1 : 0) + (v.assignee ? 1 : 0);
}
