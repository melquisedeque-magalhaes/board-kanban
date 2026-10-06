import { notFound, redirect } from "next/navigation";
import { defaultBoard, getBoard } from "@/server/boards";
import { BoardScreen } from "@/components/board/BoardScreen";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params, searchParams }: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { boardId } = await params;
  const board = await getBoard(boardId);
  if (!board) notFound();
  // O principal tem um endereço só: `/` (mantém os links antigos válidos).
  if ((await defaultBoard()).id === board.id) {
    const card = (await searchParams).card;
    redirect(typeof card === "string" ? `/?card=${encodeURIComponent(card)}` : "/");
  }
  return <BoardScreen boardId={board.id} />;
}
