"use client";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageCircle, MoreHorizontal, Link2, Archive } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PRIORITY, CARD_TYPE, avatarColor, initials, type Swatch } from "./colors";

export function cardLink(id: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/?card=${id}`;
}

export interface CardData {
  id: string; code?: string | null; title: string;
  position: number;
  priority?: "ALTA" | "MEDIA" | "BAIXA" | null;
  type?: "BUG" | "FEATURE" | "TAREFA" | null;
  version?: string | null;
  assignees: { id: string; name: string; avatarUrl?: string | null }[];
  labels: { id: string; name: string; color: string }[];
  _count: { comments: number };
}

// Visual puro do card — reusado pela versão sortable e pelo DragOverlay.
export function CardView({
  card,
  statusName,
  statusSwatch,
  dragging,
}: {
  card: CardData;
  statusName: string;
  statusSwatch: Swatch;
  dragging?: boolean;
}) {
  const pr = card.priority ? PRIORITY[card.priority] : null;
  const ty = card.type ? CARD_TYPE[card.type] : null;
  return (
    <div
      className={
        "flex flex-col gap-2.5 rounded-lg border bg-card p-3 text-card-foreground hover:border-foreground/20 " +
        (dragging ? "shadow-lg" : "shadow-sm")
      }
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
        {ty ? (
          <Badge
            variant="secondary"
            className="border-transparent font-medium"
            style={{ background: ty.bg, color: ty.text }}
          >
            {ty.label}
          </Badge>
        ) : null}
        {pr ? (
          <Badge
            variant="secondary"
            className="border-transparent font-medium"
            style={{ background: pr.bg, color: pr.text }}
          >
            {pr.label}
          </Badge>
        ) : null}
        {card.version ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            v{card.version}
          </span>
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

export function Card({
  card,
  statusName,
  statusSwatch,
  onOpen,
  onArchive,
}: {
  card: CardData;
  statusName: string;
  statusSwatch: Swatch;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  // Enquanto arrasta: o card "real" sobe pro DragOverlay (segue o cursor);
  // aqui fica só a sombra/placeholder tracejado mostrando onde vai cair.
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="h-20 rounded-lg border-2 border-dashed border-foreground/20 bg-muted/40"
      />
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(cardLink(card.id));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen?.(card.id)}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      className="group/card relative cursor-grab active:cursor-grabbing"
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Ações do card"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-1.5 top-1.5 z-10 hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground group-hover/card:block data-[state=open]:block"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={copyLink}>
            <Link2 className="size-4" /> Copiar link
          </DropdownMenuItem>
          {onArchive && (
            <DropdownMenuItem onClick={() => onArchive(card.id)}>
              <Archive className="size-4" /> Arquivar card
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CardView card={card} statusName={statusName} statusSwatch={statusSwatch} />
    </div>
  );
}
