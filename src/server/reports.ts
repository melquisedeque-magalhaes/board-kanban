import { db } from "@/lib/db";
import type { Priority, CardType } from "./types";

// ── Classificação de colunas por nome ────────────────────────────────
// Não há flag isDone nem histórico de movimentação no schema: "entregue"
// é inferido pela coluna ATUAL do card (nome). Ver src/server/cards.ts.
const isDoneName = (name: string) => /(conclu|done)/i.test(name) && !isCancelName(name);
const isCancelName = (name: string) => /cancel/i.test(name);

export interface PersonStat {
  id: string;
  name: string;
  avatarUrl: string | null;
  delivered: number; // cards em coluna "Done/Concluído" (responsável)
  wip: number;       // cards ativos, fora de done/cancelado
  overdue: number;   // WIP vencidos (dueDate < agora)
}

export interface BreakdownRow<K extends string> {
  key: K;
  delivered: number;
  wip: number;
}

export interface OverdueCard {
  id: string;
  code: string | null;
  title: string;
  dueDate: string;
  columnName: string;
  assignees: { id: string; name: string }[];
}

export interface DeliveryReport {
  generatedAt: string;
  totals: {
    cards: number;        // total não-arquivado
    delivered: number;
    wip: number;
    overdue: number;
    unassignedWip: number;
  };
  perPerson: PersonStat[];
  byColumn: { id: string; name: string; count: number; done: boolean; cancel: boolean }[];
  byType: BreakdownRow<CardType | "SEM_TIPO">[];
  byPriority: BreakdownRow<Priority | "SEM_PRIORIDADE">[];
  overdueCards: OverdueCard[];
}

// Relatório de entregas por pessoa e distribuição do board.
// Considera cards arquivados como entregues se estavam numa coluna de conclusão.
export async function getDeliveryReport(): Promise<DeliveryReport> {
  const now = new Date();
  const [columns, users, cards] = await Promise.all([
    db.column.findMany({ orderBy: { position: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.card.findMany({
      include: {
        assignees: { select: { id: true, name: true } },
        column: { select: { id: true, name: true } },
      },
    }),
  ]);

  const doneCol = new Set(columns.filter((c) => isDoneName(c.name)).map((c) => c.id));
  const cancelCol = new Set(columns.filter((c) => isCancelName(c.name)).map((c) => c.id));

  // Acumuladores por pessoa (só usuários reais; assignados a ninguém contam nos totais).
  const person = new Map<string, PersonStat>(
    users.map((u) => [u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl, delivered: 0, wip: 0, overdue: 0 }]),
  );

  const typeAgg = new Map<string, BreakdownRow<CardType | "SEM_TIPO">>();
  const prioAgg = new Map<string, BreakdownRow<Priority | "SEM_PRIORIDADE">>();
  const colCount = new Map<string, number>();
  const bump = <K extends string>(m: Map<string, BreakdownRow<K>>, key: K, field: "delivered" | "wip") => {
    const row = m.get(key) ?? { key, delivered: 0, wip: 0 };
    row[field] += 1;
    m.set(key, row);
  };

  const totals = { cards: 0, delivered: 0, wip: 0, overdue: 0, unassignedWip: 0 };
  const overdueCards: OverdueCard[] = [];

  for (const c of cards) {
    const done = doneCol.has(c.columnId);
    const cancel = cancelCol.has(c.columnId);
    // Entregue = coluna de conclusão (arquivado ou não conta como entrega).
    if (done) {
      totals.delivered += 1;
      for (const a of c.assignees) person.get(a.id)!.delivered += 1;
      bump(typeAgg, c.type ?? "SEM_TIPO", "delivered");
      bump(prioAgg, c.priority ?? "SEM_PRIORIDADE", "delivered");
      continue;
    }
    // WIP = ativo (não arquivado) e fora de done/cancelado.
    if (c.archivedAt || cancel) continue;
    totals.cards += 1;
    totals.wip += 1;
    colCount.set(c.columnId, (colCount.get(c.columnId) ?? 0) + 1);
    bump(typeAgg, c.type ?? "SEM_TIPO", "wip");
    bump(prioAgg, c.priority ?? "SEM_PRIORIDADE", "wip");
    if (c.assignees.length === 0) totals.unassignedWip += 1;
    for (const a of c.assignees) person.get(a.id)!.wip += 1;

    const overdue = c.dueDate != null && c.dueDate < now;
    if (overdue) {
      totals.overdue += 1;
      for (const a of c.assignees) person.get(a.id)!.overdue += 1;
      overdueCards.push({
        id: c.id, code: c.code, title: c.title,
        dueDate: c.dueDate!.toISOString(), columnName: c.column.name,
        assignees: c.assignees,
      });
    }
  }
  totals.cards += totals.delivered; // total geral inclui entregues

  const typeOrder: (CardType | "SEM_TIPO")[] = ["FEATURE", "BUG", "TAREFA", "SUBTASK", "SEM_TIPO"];
  const prioOrder: (Priority | "SEM_PRIORIDADE")[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA", "SEM_PRIORIDADE"];

  return {
    generatedAt: now.toISOString(),
    totals,
    perPerson: [...person.values()]
      .filter((p) => p.delivered + p.wip > 0)
      .sort((a, b) => b.delivered - a.delivered || b.wip - a.wip),
    byColumn: columns.map((c) => ({
      id: c.id, name: c.name, count: colCount.get(c.id) ?? 0,
      done: doneCol.has(c.id), cancel: cancelCol.has(c.id),
    })),
    byType: typeOrder.map((k) => typeAgg.get(k) ?? { key: k, delivered: 0, wip: 0 })
      .filter((r) => r.delivered + r.wip > 0),
    byPriority: prioOrder.map((k) => prioAgg.get(k) ?? { key: k, delivered: 0, wip: 0 })
      .filter((r) => r.delivered + r.wip > 0),
    overdueCards: overdueCards.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  };
}
