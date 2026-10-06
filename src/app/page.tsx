import { defaultBoard } from "@/server/boards";
import { BoardScreen } from "@/components/board/BoardScreen";

export const dynamic = "force-dynamic";

export default async function Home() {
  const board = await defaultBoard();
  return <BoardScreen boardId={board.id} />;
}
