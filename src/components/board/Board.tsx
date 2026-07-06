"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { Column, type ColumnData } from "./Column";
import { CardView } from "./Card";
import { columnSwatch } from "./colors";
import { applyView, isFiltering, type ViewState } from "./view";

function findCard(cols: ColumnData[], id: string) {
  for (const c of cols) { const card = c.cards.find((x) => x.id === id); if (card) return { col: c, card }; }
  return null;
}

export function Board({ columns, setColumns, view, currentUser, onAdd, onOpen, onArchive, onDraggingChange }: {
  columns: ColumnData[];
  setColumns: (c: ColumnData[]) => void;
  view: ViewState;
  currentUser?: { id: string; name: string; avatarUrl: string | null } | null;
  onAdd: (columnId: string) => void;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const filtering = isFiltering(view);
  const display = useMemo(() => applyView(columns, view), [columns, view]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? findCard(columns, activeId) : null;

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

  async function onDragEnd(e: DragEndEvent) {
    endDrag();
    const { active, over } = e;
    if (!over) return;
    const from = findCard(columns, String(active.id));
    if (!from) return;
    const overCol = columns.find((c) => c.id === over.id)
      ?? findCard(columns, String(over.id))?.col;
    if (!overCol) return;

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
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <div className="relative">
        {/* Colunas crescem livres; scrollbar nativo deste container fica oculto. */}
        <div
          ref={scrollRef}
          onScroll={onContentScroll}
          className="overflow-x-auto px-10 pb-6 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max items-start gap-3.5">
            {display.map((c) => <Column key={c.id} column={c} onAdd={onAdd} onOpen={onOpen} onArchive={onArchive} dragDisabled={filtering} />)}
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
        {active ? (
          <CardView card={active.card} statusName={active.col.name} statusSwatch={columnSwatch(active.col.name)} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
