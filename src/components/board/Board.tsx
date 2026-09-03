"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import {
  Column, ColumnChip, columnDragId, columnIdFromDragId, isColumnDragId,
  type ColumnActions, type ColumnData,
} from "./Column";
import { CardView } from "./Card";
import { columnSwatch } from "./colors";
import { applyView, canReorder, type ViewState } from "./view";
import { positionBetween } from "@/lib/positions";
import { toast } from "sonner";
import type { Subscriber } from "./column-subscribers";

function findCard(cols: ColumnData[], id: string) {
  for (const c of cols) { const card = c.cards.find((x) => x.id === id); if (card) return { col: c, card }; }
  return null;
}

// Cards e colunas convivem no mesmo DndContext. Arrastando uma coluna, só os
// droppables de coluna (id prefixado) entram na conta; arrastando um card, só
// os de card e as áreas de coluna. Sem isso o retângulo da coluna sortable
// roubaria o drop dos cards.
const collisionByKind: CollisionDetection = (args) => {
  const draggingColumn = isColumnDragId(String(args.active.id));
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (d) => isColumnDragId(String(d.id)) === draggingColumn,
    ),
  });
};

export function Board({ columns, setColumns, users, view, currentUser, onAdd, onOpen, onArchive, onDraggingChange, columnActions, onAddColumn }: {
  columns: ColumnData[];
  setColumns: (c: ColumnData[]) => void;
  users: Subscriber[];
  view: ViewState;
  currentUser?: { id: string; name: string; avatarUrl: string | null } | null;
  onAdd: (columnId: string) => void;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDraggingChange?: (dragging: boolean) => void;
  columnActions?: ColumnActions & { onMove: (id: string, position: number) => void };
  onAddColumn?: (name: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragDisabled = !canReorder(view);
  const display = useMemo(() => applyView(columns, view), [columns, view]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const active = activeId && !isColumnDragId(activeId) ? findCard(columns, activeId) : null;
  const activeColumn = activeId && isColumnDragId(activeId)
    ? columns.find((c) => c.id === columnIdFromDragId(activeId)) ?? null
    : null;

  // Barra de scroll horizontal sticky (sempre visível no rodapé da tela),
  // sincronizada com o container real das colunas. Colunas crescem livres
  // (sem scroll interno); a página rola na vertical normalmente.
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [contentWidth, setContentWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const overflow = contentWidth > clientWidth + 1;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContentWidth(el.scrollWidth);
    setClientWidth(el.clientWidth);
  }, []);

  useEffect(() => { measure(); }, [measure, display.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  // Sync bidirecional content↔barra (flag evita loop de eventos onScroll).
  function onContentScroll() {
    if (syncing.current) { syncing.current = false; return; }
    if (barRef.current && scrollRef.current) {
      syncing.current = true;
      barRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  }
  function onBarScroll() {
    if (syncing.current) { syncing.current = false; return; }
    if (barRef.current && scrollRef.current) {
      syncing.current = true;
      scrollRef.current.scrollLeft = barRef.current.scrollLeft;
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    onDraggingChange?.(true);
  }
  function endDrag() {
    setActiveId(null);
    onDraggingChange?.(false);
  }

  // Reorder de coluna: calcula a position entre os vizinhos do destino, na
  // ordem atual do board (colunas nunca são filtradas pela view).
  function onColumnDragEnd(activeDragId: string, overDragId: string) {
    if (!columnActions) return;
    const id = columnIdFromDragId(activeDragId);
    const overId = columnIdFromDragId(overDragId);
    if (id === overId) return;
    const others = columns.filter((c) => c.id !== id);
    const at = others.findIndex((c) => c.id === overId);
    if (at === -1) return;
    // Arrastando para a direita, o card cai DEPOIS do alvo; para a esquerda, antes.
    const from = columns.findIndex((c) => c.id === id);
    const to = columns.findIndex((c) => c.id === overId);
    const idx = from < to ? at + 1 : at;
    const position = positionBetween(
      others[idx - 1]?.position ?? null,
      others[idx]?.position ?? null,
    );
    // Otimista: reordena o cache e persiste. O refetch por versão corrige se falhar.
    const next = [...others];
    next.splice(idx, 0, { ...columns[from], position });
    setColumns(next);
    columnActions.onMove(id, position);
  }

  function commitNewColumn() {
    const name = (newColumn ?? "").trim();
    setNewColumn(null);
    if (name) onAddColumn?.(name);
  }

  async function onDragEnd(e: DragEndEvent) {
    endDrag();
    const { active, over } = e;
    if (!over) return;

    if (isColumnDragId(String(active.id))) {
      onColumnDragEnd(String(active.id), String(over.id));
      return;
    }

    const from = findCard(columns, String(active.id));
    if (!from) return;
    const overCol = columns.find((c) => c.id === over.id)
      ?? findCard(columns, String(over.id))?.col;
    if (!overCol) return;

    // Card em bloqueio que trava não muda de coluna (espelha o servidor).
    if (
      overCol.id !== from.col.id &&
      (from.card.blocker === "IMPEDIMENTO" || from.card.blocker === "AJUSTES")
    ) {
      toast.error(
        `Card em ${from.card.blocker === "IMPEDIMENTO" ? "Impedimento" : "Ajustes a Fazer"} não pode mudar de coluna`,
      );
      return;
    }

    const prev = columns;

    // O board é sempre agrupado por prioridade (ver applyView); o drag só reordena
    // DENTRO da mesma faixa. Calculamos a position entre os vizinhos de MESMA
    // prioridade em torno do ponto de drop (na ordem exibida = `display`).
    const dispCards = display.find((c) => c.id === overCol.id)?.cards ?? [];
    let overIdx = dispCards.findIndex((x) => x.id === over.id);
    if (overIdx === -1) overIdx = dispCards.length; // drop na coluna/fim
    const mp = from.card.priority ?? null;
    const band = dispCards
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.id !== String(active.id) && (x.priority ?? null) === mp);
    const p = [...band].reverse().find(({ i }) => i < overIdx)?.x.position ?? null;
    const n = band.find(({ i }) => i >= overIdx)?.x.position ?? null;
    let position: number;
    if (p == null && n == null) position = 1000;
    else if (p == null) position = n! - 1000;
    else if (n == null) position = p + 1000;
    else position = (p + n) / 2;

    // Arrastou p/ "Em Andamento" → o logado vira responsável (espelha o server).
    const assignSelf =
      !!currentUser &&
      /andamento/i.test(overCol.name) &&
      !from.card.assignees.some((a) => a.id === currentUser.id);
    const moved = {
      ...from.card,
      position,
      assignees: assignSelf ? [...from.card.assignees, currentUser!] : from.card.assignees,
    };

    // Estado otimista: remove o card de todas as colunas e o insere na coluna alvo
    // (a ordem final vem de applyView, que reordena por prioridade+position).
    const next = columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== active.id) }));
    next.find((c) => c.id === overCol.id)!.cards.push(moved);
    setColumns(next);

    const res = await fetch(`/api/cards/${active.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: overCol.id, position }),
    });
    if (!res.ok) setColumns(prev); // rollback
  }

  return (
    <DndContext
      id="board"
      sensors={sensors}
      collisionDetection={collisionByKind}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Board rola internamente (vertical + horizontal); scrollbar oculto.
            O scroll vertical interno é o que faz os títulos das colunas (sticky)
            fixarem logo abaixo do header principal. */}
        <div
          ref={scrollRef}
          onScroll={onContentScroll}
          className="min-h-0 flex-1 overflow-auto px-10 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max items-start gap-3.5">
            <SortableContext
              items={display.map((c) => columnDragId(c.id))}
              strategy={horizontalListSortingStrategy}
            >
              {display.map((c) => (
                <Column
                  key={c.id}
                  column={c}
                  users={users}
                  onAdd={onAdd}
                  onOpen={onOpen}
                  onArchive={onArchive}
                  dragDisabled={dragDisabled}
                  columnActions={columnActions}
                  totalCards={columns.find((raw) => raw.id === c.id)?.cards.length}
                />
              ))}
            </SortableContext>
            {onAddColumn && (
              newColumn === null ? (
                <button
                  onClick={() => setNewColumn("")}
                  className="flex w-[220px] shrink-0 items-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-3.5" /> Adicionar coluna
                </button>
              ) : (
                <input
                  autoFocus
                  value={newColumn}
                  placeholder="Nome da coluna"
                  onChange={(e) => setNewColumn(e.target.value)}
                  onBlur={() => { commitNewColumn(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitNewColumn(); }
                    if (e.key === "Escape") setNewColumn(null);
                  }}
                  aria-label="Nome da nova coluna"
                  className="w-[220px] shrink-0 rounded-xl border bg-background px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-ring"
                />
              )
            )}
          </div>
        </div>

        {/* Barra horizontal fixa no rodapé da tela (sempre visível), sincronizada. */}
        {overflow && (
          <div
            ref={barRef}
            onScroll={onBarScroll}
            className="fixed inset-x-0 bottom-0 z-30 overflow-x-scroll border-t bg-background/85 backdrop-blur [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/35 [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:bg-transparent"
          >
            <div style={{ width: contentWidth }} className="h-px" />
          </div>
        )}
      </div>
      <DragOverlay>
        {activeColumn ? (
          <div className="flex w-[284px] flex-col gap-1 rounded-xl bg-muted p-2 shadow-lg">
            <ColumnChip column={activeColumn} />
            <span className="px-0.5 text-xs text-muted-foreground">
              {activeColumn.cards.length} card(s)
            </span>
          </div>
        ) : active ? (
          <CardView
            card={active.card}
            statusName={active.col.name}
            statusSwatch={columnSwatch(active.col.name, active.col.color)}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
