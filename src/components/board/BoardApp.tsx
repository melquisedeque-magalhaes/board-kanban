"use client";
import { useCallback, useEffect, useState } from "react";
import { Board } from "./Board";
import { Chrome, type UserLite } from "./Chrome";
import { CardDialog } from "./CardDialog";
import type { ColumnData } from "./Column";
import { EMPTY_VIEW, type ViewState } from "./view";

export function BoardApp({ initialColumns, users }: {
  initialColumns: ColumnData[];
  users: UserLite[];
}) {
  const [columns, setColumns] = useState<ColumnData[]>(initialColumns);
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [createCol, setCreateCol] = useState<string | null>(null);
  const [online, setOnline] = useState<UserLite[]>([]);

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

  return (
    <>
      <Chrome
        view={view}
        setView={setView}
        users={users}
        online={online}
        onNew={() => setCreateCol(columns[0]?.id ?? null)}
      />
      <Board columns={columns} setColumns={setColumns} view={view} onAdd={setCreateCol} />
      {createCol && (
        <CardDialog
          columns={columns}
          initialColumnId={createCol}
          onClose={() => setCreateCol(null)}
          onCreated={refetch}
        />
      )}
    </>
  );
}
