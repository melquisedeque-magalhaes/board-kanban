"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import { Chrome, type UserLite } from "./Chrome";
import { CardDialog } from "./CardDialog";
import { CardDrawer } from "./CardDrawer";
import type { ColumnData } from "./Column";
import { EMPTY_VIEW, type ViewState } from "./view";

export function BoardApp({ initialColumns, users }: {
  initialColumns: ColumnData[];
  users: UserLite[];
}) {
  const [columns, setColumns] = useState<ColumnData[]>(initialColumns);
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [createCol, setCreateCol] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [online, setOnline] = useState<UserLite[]>([]);
  const [dragging, setDragging] = useState(false);

  const lastVersion = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    const r = await fetch("/api/columns");
    if (r.ok) setColumns(await r.json());
  }, []);

  // Heartbeat de presença: marca o logado e lê quem está online a cada 20s.
  useEffect(() => {
    let alive = true;
    const beat = async () => {
      try {
        const r = await fetch("/api/presence", { method: "POST" });
        if (alive && r.ok) setOnline((await r.json()).online ?? []);
      } catch { /* offline */ }
    };
    beat();
    const t = setInterval(beat, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Tempo real (polling): a cada 3s checa a versão do board; só refaz fetch
  // quando muda. Pausa durante drag ou com dialog/drawer aberto (não atropela).
  const busy = dragging || createCol !== null || openCard !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (busyRef.current) return;
      try {
        const r = await fetch("/api/board/version");
        if (!alive || !r.ok) return;
        const { version } = await r.json();
        if (lastVersion.current === null) { lastVersion.current = version; return; }
        if (version !== lastVersion.current) {
          lastVersion.current = version;
          await refetch();
        }
      } catch { /* offline */ }
    };
    const t = setInterval(poll, 3_000);
    return () => { alive = false; clearInterval(t); };
  }, [refetch]);

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
