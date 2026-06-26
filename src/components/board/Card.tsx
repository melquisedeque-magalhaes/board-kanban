"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./board.module.css";

export interface CardData {
  id: string; code?: string | null; title: string;
  position: number;
  priority?: "ALTA" | "MEDIA" | "BAIXA" | null;
  assignees: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
}

const prLabel = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

export function Card({ card }: { card: CardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={styles.card}>
      <div className={styles.cardTitle}>
        {card.code ? <span className={styles.code}>{card.code} · </span> : null}
        {card.title}
      </div>
      <div className={styles.cardMeta}>
        {card.assignees.map((a) => (
          <span key={a.id} className={styles.avatar} title={a.name}>
            {a.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
        ))}
        {card.priority ? <span className={styles.priority}>{prLabel[card.priority]}</span> : null}
        {card._count.comments > 0 ? <span className={styles.comments}>💬 {card._count.comments}</span> : null}
      </div>
    </div>
  );
}
