import { db } from "@/lib/db";

// Colunas de um board novo quando ninguém pede para copiar de outro. Board de
// situação específica costuma nascer simples; o resto se ajusta pela gestão de
// colunas.
export const BASIC_COLUMNS = ["A Fazer", "Em Andamento", "Concluído"];

const COLUMN_STEP = 1000;

const boardSelect = {
  id: true, name: true, description: true, createdAt: true,
} as const;

export interface BoardLite {
  id: string;
  name: string;
  description: string | null;
}

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  /** Copia nome/cor/ordem das colunas deste board (id ou nome). */
  copyColumnsFrom?: string | null;
  /** Nomes das colunas, na ordem. Ignorado se copyColumnsFrom vier. */
  columns?: string[];
}

export interface UpdateBoardInput {
  name?: string;
  description?: string | null;
}

function normalizeName(name: string): string {
  const v = name.trim();
  if (!v) throw new Error("Nome do board é obrigatório");
  return v;
}

function normalizeDescription(d: string | null | undefined): string | null | undefined {
  if (d === undefined) return undefined;
  const v = d?.trim();
  return v ? v : null;
}

export function listBoards() {
  return db.board.findMany({ orderBy: { createdAt: "asc" }, select: boardSelect });
}

export function getBoard(id: string) {
  return db.board.findUnique({ where: { id }, select: boardSelect });
}

// O mais antigo é o default (o board original do time, criado pelo seed).
export async function defaultBoard(): Promise<BoardLite> {
  const board = await db.board.findFirst({ orderBy: { createdAt: "asc" }, select: boardSelect });
  if (!board) throw new Error("Nenhum board encontrado — rode o seed (npm run db:seed)");
  return board;
}

/**
 * Resolve o board por id ou nome. Sem ref, cai no default — é o que mantém
 * a API, o MCP e as telas que não conhecem board funcionando como antes.
 */
export async function resolveBoardId(ref?: string | null): Promise<string> {
  if (!ref?.trim()) return (await defaultBoard()).id;
  const v = ref.trim();
  const board = await db.board.findUnique({ where: { id: v }, select: { id: true } })
    ?? await db.board.findFirst({ where: { name: v }, select: { id: true } });
  if (!board) throw new Error(`Board não encontrado: ${v}`);
  return board.id;
}

export async function createBoard(input: CreateBoardInput) {
  const name = normalizeName(input.name);
  const clash = await db.board.findFirst({ where: { name }, select: { id: true } });
  // Nome é atalho de resolução (MCP aceita board pelo nome), então não repete.
  if (clash) throw new Error(`Já existe um board chamado "${name}"`);

  let columns: { name: string; color: string | null }[];
  if (input.copyColumnsFrom) {
    const sourceId = await resolveBoardId(input.copyColumnsFrom);
    columns = await db.column.findMany({
      where: { boardId: sourceId }, orderBy: { position: "asc" },
      select: { name: true, color: true },
    });
  } else {
    const names = (input.columns ?? BASIC_COLUMNS).map((c) => c.trim()).filter(Boolean);
    columns = [...new Set(names)].map((n) => ({ name: n, color: null }));
  }
  if (!columns.length) throw new Error("O board precisa de pelo menos uma coluna");

  return db.board.create({
    data: {
      name,
      description: normalizeDescription(input.description) ?? null,
      columns: {
        create: columns.map((c, i) => ({
          name: c.name, color: c.color, position: (i + 1) * COLUMN_STEP,
        })),
      },
    },
    select: boardSelect,
  });
}

export async function updateBoard(id: string, input: UpdateBoardInput) {
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  if (name) {
    const clash = await db.board.findFirst({ where: { name, id: { not: id } }, select: { id: true } });
    if (clash) throw new Error(`Já existe um board chamado "${name}"`);
  }
  return db.board.update({
    where: { id },
    data: { name, description: normalizeDescription(input.description) },
    select: boardSelect,
  });
}

// Mesma regra da coluna: Board → Column → Card é cascade, então apagar board
// com card apagaria os cards. Só sai board sem card (ativo ou arquivado), e o
// default nunca sai — é ele que `/` e os clientes sem board abrem.
export async function deleteBoard(id: string) {
  const board = await db.board.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!board) throw new Error(`Board não encontrado: ${id}`);
  if ((await defaultBoard()).id === id) throw new Error("O board principal não pode ser excluído");
  const cards = await db.card.count({ where: { column: { boardId: id } } });
  if (cards) {
    throw new Error(
      `Board "${board.name}" ainda tem ${cards} card(s), contando arquivados. Mova ou exclua antes.`,
    );
  }
  await db.board.delete({ where: { id } });
  return board;
}
