"use client";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, type CardData } from "./Card";
import { columnSwatch } from "./colors";

export interface ColumnData { id: string; name: string; cards: CardData[]; }

export function Column({
  column,
  onAdd,
  onOpen,
  onArchive,
  dragDisabled,
}: {
  column: ColumnData;
  onAdd: (columnId: string) => void;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  dragDisabled?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: column.id });
  const swatch = columnSwatch(column.name);

  return (
    <div className="flex w-[284px] shrink-0 flex-col gap-2.5 rounded-xl bg-muted/60 p-2">
      <div className="flex items-center gap-2 px-0.5">
        <Badge
          className="border-transparent font-semibold"
          style={{ background: swatch.bg, color: swatch.text }}
        >
          {column.name}
        </Badge>
        <span className="text-xs text-muted-foreground">{column.cards.length}</span>
      </div>
      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-2 flex-col gap-2">
          {column.cards.map((c) => (
            <Card key={c.id} card={c} statusName={column.name} statusSwatch={swatch} onOpen={onOpen} onArchive={onArchive} dragDisabled={dragDisabled} />
          ))}
        </div>
      </SortableContext>
      <button
        onClick={() => onAdd(column.id)}
        className="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-3.5" /> New page
      </button>
    </div>
  );
}
