import { listColumns, listUsers } from "@/server/cards";
import { syncCurrentUser } from "@/server/users";
import { BoardApp } from "@/components/board/BoardApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const me = await syncCurrentUser();
  const [columns, users] = await Promise.all([listColumns(), listUsers()]);
  return (
    <main>
      <BoardApp
        initialColumns={JSON.parse(JSON.stringify(columns))}
        users={users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))}
        currentUser={me}
      />
    </main>
  );
}
