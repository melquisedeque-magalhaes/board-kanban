"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Board } from "./Board";
import { Chrome, type UserLite } from "./Chrome";
import { CardDialog } from "./CardDialog";
import { CardDrawer } from "./CardDrawer";
import { ArchivedDrawer } from "./ArchivedDrawer";
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

// Assinatura barata do board (ts + contadores). Pollamos ISSO a cada 3s em vez
// do board inteiro; só refetchamos /api/columns quando a versão muda.
async function fetchBoardVersion(): Promise<string> {
  const r = await fetch("/api/board/version");
  if (!r.ok) throw new Error("version");
  return (await r.json()).version as string;
}

export function BoardApp({ initialColumns, users, currentUser }: {
  initialColumns: ColumnData[];
  users: UserLite[];
  currentUser: { id: string; name: string; avatarUrl: string | null } | null;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [createCol, setCreateCol] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Deep-link: ?card=<id> abre o card no load e espelha o card aberto na URL.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("card");
    if (id) setOpenCard(id);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openCard) url.searchParams.set("card", openCard);
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, [openCard]);

  // Pausa o polling/refocus quando há interação em andamento (não atropela).
  const busy = dragging || createCol !== null || openCard !== null || archivedOpen;

  const { data: columns = initialColumns } = useQuery({
    queryKey: ["columns"],
    queryFn: fetchColumns,
    initialData: initialColumns,
    // Sem polling direto: o board pesado só é refetchado quando a versão muda.
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  // Poll barato da versão; ao mudar, invalida o board (dispara 1 refetch pesado).
  const prevVersion = useRef<string | undefined>(undefined);
  useQuery({
    queryKey: ["board-version"],
    queryFn: async () => {
      const v = await fetchBoardVersion();
      if (prevVersion.current !== undefined && prevVersion.current !== v) {
        qc.invalidateQueries({ queryKey: ["columns"] });
      }
      prevVersion.current = v;
      return v;
    },
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

  const setArchived = useCallback(async (id: string, archived: boolean) => {
    const res = await fetch(`/api/cards/${id}/archive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) { toast.error(archived ? "Falha ao arquivar" : "Falha ao restaurar"); return false; }
    refetch();
    qc.invalidateQueries({ queryKey: ["archived"] });
    return true;
  }, [qc, refetch]);

  // Arquivar é reversível → ação imediata + toast com "Desfazer".
  const archiveCard = useCallback(async (id: string) => {
    if (openCard === id) setOpenCard(null);
    const ok = await setArchived(id, true);
    if (ok) toast.success("Card arquivado", { action: { label: "Desfazer", onClick: () => setArchived(id, false) } });
  }, [openCard, setArchived]);

  // Mutação de coluna: em erro mostra a mensagem do servidor (ela explica o
  // motivo — nome duplicado, coluna com card) e refaz o fetch p/ desfazer o
  // estado otimista do drag.
  const mutateColumn = useCallback(async (
    input: RequestInfo, init: RequestInit, fallback: string,
  ) => {
    const res = await fetch(input, init);
    if (!res.ok) {
      toast.error((await res.text()) || fallback);
      refetch();
      return false;
    }
    refetch();
    return true;
  }, [refetch]);

  const addColumn = useCallback(async (name: string) => {
    await mutateColumn("/api/columns", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }, "Falha ao criar coluna");
  }, [mutateColumn]);

  const patchColumn = useCallback((id: string, data: Record<string, unknown>, fallback: string) =>
    mutateColumn(`/api/columns/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }, fallback), [mutateColumn]);

  const columnActions = useMemo(() => ({
    onRename: (id: string, name: string) => { patchColumn(id, { name }, "Falha ao renomear coluna"); },
    onRecolor: (id: string, color: string | null) => { patchColumn(id, { color }, "Falha ao trocar a cor"); },
    onMove: (id: string, position: number) => { patchColumn(id, { position }, "Falha ao mover coluna"); },
    onDelete: async (id: string) => {
      const ok = await mutateColumn(`/api/columns/${id}`, { method: "DELETE" }, "Falha ao excluir coluna");
      if (ok) toast.success("Coluna excluída");
    },
  }), [mutateColumn, patchColumn]);

  return (
    <>
      <Chrome
        view={view}
        setView={setView}
        users={users}
        online={online}
        openCardId={openCard}
        onOpenCard={setOpenCard}
        onNew={() => setCreateCol(columns[0]?.id ?? null)}
        onOpenArchived={() => setArchivedOpen(true)}
      />
      <Board
        columns={columns}
        setColumns={setColumns}
        users={users}
        view={view}
        currentUser={currentUser}
        onAdd={setCreateCol}
        onOpen={setOpenCard}
        onArchive={archiveCard}
        onDraggingChange={setDragging}
        columnActions={columnActions}
        onAddColumn={addColumn}
      />
      {createCol && (
        <CardDialog
          columns={columns}
          users={users}
          initialColumnId={createCol}
          onClose={() => setCreateCol(null)}
          onCreated={(id) => { setOpenCard(id); refetch(); }}
        />
      )}
      <CardDrawer
        cardId={openCard}
        columns={columns}
        users={users}
        currentUser={currentUser}
        onClose={() => setOpenCard(null)}
        onChanged={refetch}
        onArchive={archiveCard}
        onOpen={setOpenCard}
      />
      <ArchivedDrawer
        open={archivedOpen}
        onClose={() => setArchivedOpen(false)}
        onChanged={refetch}
      />
    </>
  );
}
