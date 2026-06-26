import "dotenv/config";
import { PrismaClient, Priority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const COLUMNS = [
  "A Fazer", "Em Andamento", "Aguardando Teste", "Teste",
  "Aguardando Deploy", "Done", "Concluído", "Cancelado",
];

async function main() {
  await db.comment.deleteMany();
  await db.card.deleteMany();
  await db.column.deleteMany();
  await db.label.deleteMany();
  await db.user.deleteMany();
  await db.board.deleteMany();

  const board = await db.board.create({ data: { name: "Board Time de IA" } });

  const cols: Record<string, string> = {};
  for (let i = 0; i < COLUMNS.length; i++) {
    const c = await db.column.create({
      data: { boardId: board.id, name: COLUMNS[i], position: (i + 1) * 1000 },
    });
    cols[COLUMNS[i]] = c.id;
  }

  const melqui = await db.user.create({ data: { name: "Melqui Sodré" } });
  const lucas = await db.user.create({ data: { name: "Lucas Vinicius Cardoso" } });

  const alta = await db.label.create({ data: { name: "Alta", color: "#f87171" } });
  const media = await db.label.create({ data: { name: "Média", color: "#fbbf24" } });

  await db.card.create({
    data: {
      columnId: cols["A Fazer"], title: "Implementar Tool Search",
      priority: Priority.ALTA, position: 1000,
      assignees: { connect: [{ id: melqui.id }] }, labels: { connect: [{ id: alta.id }] },
    },
  });
  await db.card.create({
    data: {
      columnId: cols["Em Andamento"], code: "TI-2", title: "DS Gol Web",
      priority: Priority.ALTA, position: 1000,
      assignees: { connect: [{ id: lucas.id }] }, labels: { connect: [{ id: alta.id }] },
    },
  });
  await db.card.create({
    data: {
      columnId: cols["Aguardando Teste"], code: "TI-13", title: "MCP do Falcon",
      priority: Priority.MEDIA, position: 1000,
      assignees: { connect: [{ id: melqui.id }] }, labels: { connect: [{ id: media.id }] },
    },
  });

  console.log("seed ok");
}
main().finally(() => db.$disconnect());
