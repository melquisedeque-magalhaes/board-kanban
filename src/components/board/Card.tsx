"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PRIORITY, avatarColor, initials, type Swatch } from "./colors";

export interface CardData {
  id: string; code?: string | null; title: string;
  position: number;
  priority?: "ALTA" | "MEDIA" | "BAIXA" | null;
  assignees: { id: string; name: string; avatarUrl?: string | null }[];
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
}

export function Card({
  card,
  statusName,
  statusSwatch,
  onOpen,
}: {
  card: CardData;
  statusName: string;
  statusSwatch: Swatch;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const pr = card.priority ? PRIORITY[card.priority] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(card.id)}
      className="flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-card-foreground shadow-sm cursor-grab active:cursor-grabbing hover:border-foreground/20"
    >
      <div className="text-sm leading-snug">
        {card.code ? <span className="font-medium text-muted-foreground">{card.code} · </span> : null}
        {card.title}
      </div>

      <Badge
        variant="secondary"
        className="self-start border-transparent font-medium"
        style={{ background: statusSwatch.bg, color: statusSwatch.text }}
      >
        {statusName}
      </Badge>

      <div className="flex flex-wrap items-center gap-2">
        {card.assignees.length > 0 && (
          <div className="flex items-center gap-1">
            {card.assignees.map((a) => (
              <Avatar key={a.id} className="size-[18px]" title={a.name}>
                {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                <AvatarFallback
                  className="text-[9px] font-bold text-white"
                  style={{ background: avatarColor(a.name) }}
                >
                  {initials(a.name)}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
        {pr ? (
          <Badge
            variant="secondary"
            className="border-transparent font-medium"
            style={{ background: pr.bg, color: pr.text }}
          >
            {pr.label}
          </Badge>
        ) : null}
        {card._count.comments > 0 ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageCircle className="size-3" /> {card._count.comments}
          </span>
        ) : null}
      </div>
    </div>
  );
}
