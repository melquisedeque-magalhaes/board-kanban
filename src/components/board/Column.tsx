"use client";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Card, type CardData } from "./Card";
import styles from "./board.module.css";

export interface ColumnData { id: string; name: string; cards: CardData[]; }

export function Column({ column }: { column: ColumnData }) {
  const { setNodeRef } = useDroppable({ id: column.id });
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>{column.name}</div>
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={styles.cardList}>
          {column.cards.map((c) => <Card key={c.id} card={c} />)}
        </div>
      </SortableContext>
    </div>
  );
}
