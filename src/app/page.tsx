import { listColumns } from "@/server/cards";
import { syncCurrentUser } from "@/server/users";
import { Board } from "@/components/board/Board";
import { Chrome } from "@/components/board/Chrome";

export const dynamic = "force-dynamic";

export default async function Home() {
  await syncCurrentUser();
  const columns = await listColumns();
  return (
    <main>
      <Chrome />
      <Board initialColumns={JSON.parse(JSON.stringify(columns))} />
    </main>
  );
}
