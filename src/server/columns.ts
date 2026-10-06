import { db } from "@/lib/db";
import { positionBetween } from "@/lib/positions";
import { resolveBoardId } from "./boards";

export interface CreateColumnInput {
  name: string;
  color?: string | null;
  /** id ou nome do board; sem ele, o board default. */
  board?: string | null;
}

export interface UpdateColumnInput {
  name?: string;
  color?: string | null;
}

// Cor do chip: hex de 6 dígitos, ou null p/ voltar ao default por nome.
const HEX = /^#[0-9a-f]{6}$/i;

function normalizeColor(color: string | null | undefined): string | null | undefined {
  if (color === undefined) return undefined;
  if (color === null) return null;
  const v = color.trim();
  if (!v) return null;
  if (!HEX.test(v)) throw new Error(`Cor inválida: ${color} (use hex, ex.: #d3e5ef)`);
  return v.toLowerCase();
}

function normalizeName(name: string): string {
  const v = name.trim();
  if (!v) throw new Error("Nome da coluna é obrigatório");
  return v;
}

export async function listColumnsPlain(board?: string | null) {
  const boardId = await resolveBoardId(board);
  return db.column.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, color: true, position: true },
  });
}

// Cria a coluna no fim do board. Nome duplicado NO MESMO board é rejeitado
// porque resolveColumnId/listCards localizam coluna por nome dentro do board —
// dois nomes iguais tornariam esse atalho ambíguo. Boards diferentes podem
// repetir ("A Fazer" existe em todos).
export async function createColumn(input: CreateColumnInput) {
  const name = normalizeName(input.name);
  const color = normalizeColor(input.color) ?? null;
  const boardId = await resolveBoardId(input.board);
  const clash = await db.column.findFirst({ where: { boardId, name } });
  if (clash) throw new Error(`Já existe uma coluna chamada "${name}"`);
  const last = await db.column.findMany({
    where: { boardId }, orderBy: { position: "desc" }, take: 1,
  });
  return db.column.create({
    data: { boardId, name, color, position: positionBetween(last[0]?.position ?? null, null) },
    select: { id: true, name: true, color: true, position: true },
  });
}

export async function updateColumn(id: string, input: UpdateColumnInput) {
  const name = input.name === undefined ? undefined : normalizeName(input.name);
  const color = normalizeColor(input.color);
  if (name) {
    const current = await db.column.findUnique({ where: { id }, select: { boardId: true } });
    if (!current) throw new Error(`Coluna não encontrada: ${id}`);
    const clash = await db.column.findFirst({
      where: { boardId: current.boardId, name, id: { not: id } },
    });
    if (clash) throw new Error(`Já existe uma coluna chamada "${name}"`);
  }
  return db.column.update({
    where: { id },
    data: { name, color },
    select: { id: true, name: true, color: true, position: true },
  });
}

// Reordena a coluna. `position` é a posição fracionária já calculada (o board
// faz isso no drag); `index` é o destino 0-based na ordem atual, para quem não
// quer calcular nada (MCP). Um dos dois é obrigatório.
export async function moveColumn(
  id: string,
  target: { position?: number; index?: number },
) {
  if (target.position != null) {
    return db.column.update({
      where: { id }, data: { position: target.position },
      select: { id: true, name: true, color: true, position: true },
    });
  }
  if (target.index == null) throw new Error("Informe position ou index");

  const column = await db.column.findUnique({ where: { id }, select: { boardId: true } });
  if (!column) throw new Error(`Coluna não encontrada: ${id}`);
  // O índice é relativo às colunas do próprio board.
  const all = await db.column.findMany({
    where: { boardId: column.boardId },
    orderBy: { position: "asc" }, select: { id: true, position: true },
  });
  const others = all.filter((c) => c.id !== id);
  if (others.length === all.length) throw new Error(`Coluna não encontrada: ${id}`);
  const at = Math.min(Math.max(Math.trunc(target.index), 0), others.length);
  const position = positionBetween(
    others[at - 1]?.position ?? null,
    others[at]?.position ?? null,
  );
  return db.column.update({
    where: { id }, data: { position },
    select: { id: true, name: true, color: true, position: true },
  });
}

// Só coluna vazia é excluída. Card (inclusive arquivado) referencia columnId com
// onDelete: Cascade — apagar a coluna apagaria os cards de verdade, então
// barramos antes em vez de arriscar perda silenciosa.
export async function deleteColumn(id: string) {
  const column = await db.column.findUnique({
    where: { id }, select: { id: true, name: true },
  });
  if (!column) throw new Error(`Coluna não encontrada: ${id}`);

  const [active, archived] = await Promise.all([
    db.card.count({ where: { columnId: id, archivedAt: null } }),
    db.card.count({ where: { columnId: id, archivedAt: { not: null } } }),
  ]);
  if (active || archived) {
    const parts = [
      active ? `${active} card(s)` : null,
      archived ? `${archived} arquivado(s)` : null,
    ].filter(Boolean).join(" e ");
    throw new Error(
      `Coluna "${column.name}" ainda tem ${parts}. Mova ou exclua antes de remover a coluna.`,
    );
  }

  await db.column.delete({ where: { id } });
  return { id, name: column.name };
}
