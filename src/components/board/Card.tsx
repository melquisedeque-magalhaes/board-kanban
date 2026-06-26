"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./board.module.css";
import { PRIORITY, avatarColor, initials, type Swatch } from "./colors";

export interface CardData {
  id: string; code?: string | null; title: string;
  position: number;
  priority?: "ALTA" | "MEDIA" | "BAIXA" | null;
  assignees: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
}

export function Card({
  card,
  statusName,
  statusSwatch,
}: {
  card: CardData;
  statusName: string;
  statusSwatch: Swatch;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const pr = card.priority ? PRIORITY[card.priority] : null;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={styles.card}>
      <div className={styles.cardTitle}>
        {card.code ? <span className={styles.code}>{card.code} · </span> : null}
        {card.title}
      </div>

      <span
        className={styles.statusChip}
        style={{ background: statusSwatch.bg, color: statusSwatch.text }}
      >
        {statusName}
      </span>

      <div className={styles.cardMeta}>
        {card.assignees.length > 0 && (
          <div className={styles.avatars}>
            {card.assignees.map((a) => (
              <span
                key={a.id}
                className={styles.avatar}
                style={{ background: avatarColor(a.name) }}
                title={a.name}
              >
                {initials(a.name)}
              </span>
            ))}
          </div>
        )}
        {pr ? (
          <span className={styles.priority} style={{ background: pr.bg, color: pr.text }}>
            {pr.label}
          </span>
        ) : null}
        {card._count.comments > 0 ? (
          <span className={styles.comments}>💬 {card._count.comments}</span>
        ) : null}
      </div>
    </div>
  );
}
