import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const COLUMNS = [
  "A Fazer", "Em Andamento", "Aguardando Teste", "Teste",
  "Aguardando Deploy", "Done", "Concluído", "Cancelado",
];

// Seed só de ESTRUTURA (board + colunas). Sem dados mocados (cards/users/labels).
// Idempotente e seguro: NÃO apaga nada — se o board já existe, não recria.
async function main() {
  const existing = await db.board.findFirst();
  if (existing) {
    console.log("seed: board já existe, nada a fazer");
    return;
  }

  const board = await db.board.create({ data: { name: "Board Time de IA" } });
  for (let i = 0; i < COLUMNS.length; i++) {
    await db.column.create({
      data: { boardId: board.id, name: COLUMNS[i], position: (i + 1) * 1000 },
    });
  }
  console.log(`seed ok: board + ${COLUMNS.length} colunas`);
}

main().finally(() => db.$disconnect());
