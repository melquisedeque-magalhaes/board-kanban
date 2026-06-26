"use client";
import { useState } from "react";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { Column, type ColumnData } from "./Column";
import { CardDialog } from "./CardDialog";
import styles from "./board.module.css";

function findCard(cols: ColumnData[], id: string) {
  for (const c of cols) { const card = c.cards.find((x) => x.id === id); if (card) return { col: c, card }; }
  return null;
}

export function Board({ initialColumns }: { initialColumns: ColumnData[] }) {
  const [columns, setColumns] = useState<ColumnData[]>(initialColumns);
  const [addTo, setAddTo] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function refetch() {
    const r = await fetch("/api/columns");
    setColumns(await r.json());
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const from = findCard(columns, String(active.id));
    if (!from) return;
    const overCol = columns.find((c) => c.id === over.id)
      ?? findCard(columns, String(over.id))?.col;
    if (!overCol) return;

    const prev = columns;
    // novo estado otimista
    const next = columns.map((c) => ({ ...c, cards: c.cards.filter((x) => x.id !== active.id) }));
    const target = next.find((c) => c.id === overCol.id)!;
    const overIdx = target.cards.findIndex((x) => x.id === over.id);
    const insertAt = overIdx === -1 ? target.cards.length : overIdx;
    target.cards.splice(insertAt, 0, from.card);
    setColumns(next);

    // position no cliente: meio dos vizinhos (nunca usa o próprio card como vizinho)
    const before = target.cards[insertAt - 1]?.id;
    const after = target.cards[insertAt + 1]?.id;
    const posOf = (id?: string) =>
      id && id !== String(active.id)
        ? prev.flatMap((c) => c.cards).find((x) => x.id === id)
        : undefined;
    const p = posOf(before)?.position ?? null;
    const n = posOf(after)?.position ?? null;
    let position: number;
    if (p == null && n == null) position = 1000;
    else if (p == null) position = n! - 1000;
    else if (n == null) position = p + 1000;
    else position = (p + n) / 2;

    const res = await fetch(`/api/cards/${active.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: overCol.id, position }),
    });
    if (!res.ok) setColumns(prev); // rollback
  }

  return (
    <DndContext id="board" sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className={styles.board}>
        {columns.map((c) => <Column key={c.id} column={c} onAdd={setAddTo} />)}
      </div>
      {addTo && <CardDialog columnId={addTo} onClose={() => setAddTo(null)} onCreated={refetch} />}
    </DndContext>
  );
}
