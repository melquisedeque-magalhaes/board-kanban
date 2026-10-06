import { listColumns, listUsers } from "@/server/cards";
import { listBoards } from "@/server/boards";
import { syncCurrentUser } from "@/server/users";
import { BoardApp } from "./BoardApp";

// Tela do board, server-side. `/` passa o principal, /b/[boardId] o pedido.
export async function BoardScreen({ boardId }: { boardId: string }) {
  const me = await syncCurrentUser();
  const [boards, columns, users] = await Promise.all([
    listBoards(), listColumns(boardId), listUsers(),
  ]);
  const board = boards.find((b) => b.id === boardId)!;
  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <BoardApp
        // key: navegar entre boards remonta o app (filtros, drawer e polling zerados).
        key={board.id}
        board={{ id: board.id, name: board.name, description: board.description }}
        boards={boards.map((b) => ({ id: b.id, name: b.name, description: b.description }))}
        initialColumns={JSON.parse(JSON.stringify(columns))}
        users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
        currentUser={me}
      />
    </main>
  );
}
