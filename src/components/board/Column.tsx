"use client";
import { useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card, type CardData } from "./Card";
import { columnSwatch, COLUMN_PALETTE } from "./colors";
import { ColumnSubscribersPopover } from "./ColumnSubscribersPopover";
import type { Subscriber } from "./column-subscribers";

export interface ColumnData {
  id: string;
  name: string;
  color?: string | null;
  position: number;
  cards: CardData[];
  _count?: { subscriptions: number };
}

// A coluna arrastável entra no DndContext com o id prefixado, e a área de drop
// dos cards continua registrada com o id cru. Sem o prefixo os dois droppables
// colidiriam pelo mesmo id (ver collisionDetection em Board.tsx).
export const COLUMN_DRAG_PREFIX = "col:";
export const columnDragId = (id: string) => `${COLUMN_DRAG_PREFIX}${id}`;
export const isColumnDragId = (id: string) => id.startsWith(COLUMN_DRAG_PREFIX);
export const columnIdFromDragId = (id: string) => id.slice(COLUMN_DRAG_PREFIX.length);

export interface ColumnActions {
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string | null) => void;
  onDelete: (id: string) => void;
}

// Chip do título — reusado pelo header e pelo DragOverlay da coluna.
export function ColumnChip({ column }: { column: ColumnData }) {
  const swatch = columnSwatch(column.name, column.color);
  return (
    <Badge
      className="border-transparent font-semibold"
      style={{ background: swatch.bg, color: swatch.text }}
    >
      {column.name}
    </Badge>
  );
}

export function Column({
  column,
  users,
  onAdd,
  onOpen,
  onArchive,
  dragDisabled,
  columnActions,
  columnDragDisabled,
  totalCards,
}: {
  column: ColumnData;
  users: Subscriber[];
  onAdd: (columnId: string) => void;
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  dragDisabled?: boolean;
  columnActions?: ColumnActions;
  columnDragDisabled?: boolean;
  // Total real de cards da coluna, ignorando os filtros da view: `column.cards`
  // já vem filtrado, e uma coluna que parece vazia por causa do filtro não pode
  // oferecer exclusão (o servidor recusaria).
  totalCards?: number;
}) {
  const { setNodeRef: setCardsRef } = useDroppable({ id: column.id });
  const swatch = columnSwatch(column.name, column.color);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cardCount = totalCards ?? column.cards.length;

  // Reorder da coluna: o nó inteiro se move, mas só o grip inicia o arraste —
  // assim clicar num card não sai arrastando a coluna junto.
  const {
    setNodeRef: setColumnRef, attributes, listeners, transform, transition, isDragging,
  } = useSortable({ id: columnDragId(column.id), disabled: columnDragDisabled });

  function startRename() {
    setDraft(column.name);
    setRenaming(true);
  }
  function commitRename() {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== column.name) columnActions?.onRename(column.id, name);
  }

  return (
    <div
      ref={setColumnRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={
        "flex w-[284px] shrink-0 flex-col gap-2.5 rounded-xl bg-muted p-2 " +
        (isDragging ? "opacity-40" : "")
      }
    >
      <div className="sticky top-0 z-20 -mx-2 -mt-2 flex items-center gap-1.5 rounded-t-xl bg-muted px-2.5 pb-1.5 pt-2.5">
        {columnActions && !columnDragDisabled && (
          <button
            {...attributes}
            {...listeners}
            aria-label={`Mover coluna ${column.name}`}
            className="-ml-1 cursor-grab rounded p-0.5 text-muted-foreground/60 hover:bg-accent hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}

        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitRename(); }
              if (e.key === "Escape") setRenaming(false);
            }}
            aria-label="Nome da coluna"
            className="min-w-0 flex-1 rounded-md bg-background px-1.5 py-0.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <>
            <ColumnChip column={column} />
            <span className="text-xs text-muted-foreground">{column.cards.length}</span>
          </>
        )}

        {/* Ações da coluna encostadas na direita: inscritos e menu num só
            grupo, para os ícones não flutuarem no meio do header. */}
        {!renaming && (
          <div className="ml-auto flex items-center gap-0.5">
            <ColumnSubscribersPopover
              columnId={column.id}
              users={users}
              initialCount={column._count?.subscriptions ?? 0}
            />
            {columnActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Ações da coluna ${column.name}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={startRename}>
                  <Pencil className="size-4" /> Renomear
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <Palette className="size-3.5" /> Cor da coluna
                </DropdownMenuLabel>
                <div className="grid grid-cols-4 gap-1 px-2 pb-1.5">
                  {COLUMN_PALETTE.map((c) => (
                    <button
                      key={c.value}
                      title={c.label}
                      aria-label={`Cor ${c.label}`}
                      onClick={() => columnActions.onRecolor(column.id, c.value)}
                      className={
                        "h-6 rounded-md border-2 " +
                        (column.color === c.value ? "border-foreground" : "border-transparent")
                      }
                      style={{ background: c.value }}
                    />
                  ))}
                </div>
                {column.color && (
                  <DropdownMenuItem onSelect={() => columnActions.onRecolor(column.id, null)}>
                    Usar cor padrão
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  <Trash2 className="size-4" /> Excluir coluna
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {/* Excluir coluna é irreversível → confirmação inline. Coluna com card é
          recusada pelo servidor, então avisamos o motivo em vez de oferecer um
          botão que só vai falhar. */}
      {confirmingDelete && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-background p-2.5 text-xs">
          {cardCount > 0 ? (
            <>
              <span>
                Esta coluna tem {cardCount} card(s). Mova ou arquive antes de excluir.
              </span>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="self-end rounded-md px-2 py-1 hover:bg-accent"
              >
                Entendi
              </button>
            </>
          ) : (
            <>
              <span>Excluir a coluna &ldquo;{column.name}&rdquo;?</span>
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-md px-2 py-1 hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmingDelete(false); columnActions?.onDelete(column.id); }}
                  className="rounded-md bg-destructive px-2 py-1 font-medium text-white hover:opacity-90"
                >
                  Excluir
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setCardsRef} className="flex min-h-2 flex-col gap-2">
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
