import { listColumns } from "@/server/cards";
import { Board } from "@/components/board/Board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const columns = await listColumns();
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Board Time de IA</h1>
      <p style={{ color: "#6b7280", marginBottom: 20 }}>Kanban de tarefas do time de IA</p>
      <Board initialColumns={JSON.parse(JSON.stringify(columns))} />
    </main>
  );
}
