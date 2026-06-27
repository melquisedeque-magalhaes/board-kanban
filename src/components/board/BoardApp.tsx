"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPusherClient, BOARD_CHANNEL, BOARD_CHANGED } from "@/lib/pusher-client";
import { Board } from "./Board";
import { Chrome, type UserLite } from "./Chrome";
import { CardDialog } from "./CardDialog";
import { CardDrawer } from "./CardDrawer";
import type { ColumnData } from "./Column";
import { EMPTY_VIEW, type ViewState } from "./view";

async function fetchColumns(): Promise<ColumnData[]> {
  const r = await fetch("/api/columns");
  if (!r.ok) throw new Error("columns");
  return r.json();
}

async function beatPresence(): Promise<UserLite[]> {
  const r = await fetch("/api/presence", { method: "POST" });
  if (!r.ok) return [];
  return (await r.json()).online ?? [];
}

export function BoardApp({ initialColumns, users }: {
  initialColumns: ColumnData[];
  users: UserLite[];
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [createCol, setCreateCol] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Pausa o polling/refocus quando há interação em andamento (não atropela).
  const busy = dragging || createCol !== null || openCard !== null;

  const { data: columns = initialColumns } = useQuery({
    queryKey: ["columns"],
    queryFn: fetchColumns,
    initialData: initialColumns,
    refetchInterval: busy ? false : 3_000,
    refetchOnWindowFocus: !busy,
  });

  const { data: online = [] } = useQuery({
    queryKey: ["presence"],
    queryFn: beatPresence,
    refetchInterval: 20_000,
  });

  // Otimista (drag): escreve direto no cache. Refetch: invalida.
  const setColumns = useCallback(
    (c: ColumnData[]) => qc.setQueryData(["columns"], c),
    [qc],
  );
  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["columns"] });
  }, [qc]);

  // Push real (Pusher): assina o canal e invalida na hora que alguém muda algo.
  // Se não houver chaves Pusher, getPusherClient() retorna null → fica só o polling.
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const ch = pusher.subscribe(BOARD_CHANNEL);
    const onChanged = () => {
      qc.invalidateQueries({ queryKey: ["columns"] });
      qc.invalidateQueries({ queryKey: ["card"] });
    };
    ch.bind(BOARD_CHANGED, onChanged);
    return () => { ch.unbind(BOARD_CHANGED, onChanged); pusher.unsubscribe(BOARD_CHANNEL); };
  }, [qc]);

  return (
    <>
      <Chrome
        view={view}
        setView={setView}
        users={users}
        online={online}
        onNew={() => setCreateCol(columns[0]?.id ?? null)}
      />
      <Board
        columns={columns}
        setColumns={setColumns}
        view={view}
        onAdd={setCreateCol}
        onOpen={setOpenCard}
        onDraggingChange={setDragging}
      />
      {createCol && (
        <CardDialog
          columns={columns}
          initialColumnId={createCol}
          onClose={() => setCreateCol(null)}
          onCreated={refetch}
        />
      )}
      <CardDrawer
        cardId={openCard}
        columns={columns}
        users={users}
        onClose={() => setOpenCard(null)}
        onChanged={refetch}
      />
    </>
  );
}
