import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cards from "@/server/cards";

const priority = z.enum(["ALTA", "MEDIA", "BAIXA"]);
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function buildMcpServer() {
  const s = new McpServer({ name: "board-kanban", version: "1.0.0" });

  s.registerTool(
    "list_columns",
    { description: "Lista colunas do board com seus cards", inputSchema: {} },
    async () => json(await cards.listColumns()),
  );

  s.registerTool(
    "list_cards",
    {
      description: "Lista cards filtrando por coluna, assignee ou prioridade",
      inputSchema: {
        columnId: z.string().optional(),
        columnName: z.string().optional(),
        assignee: z.string().optional(),
        priority: priority.optional(),
      },
    },
    async (a) => json(await cards.listCards(a as cards.CardFilter)),
  );

  s.registerTool(
    "get_card",
    {
      description: "Detalhe de um card com comentários",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await cards.getCard(id)),
  );

  s.registerTool(
    "create_card",
    {
      description: "Cria um card numa coluna",
      inputSchema: {
        columnId: z.string().optional(),
        columnName: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        priority: priority.optional(),
        code: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async (a) => json(await cards.createCard(a as cards.CreateCardInput)),
  );

  s.registerTool(
    "update_card",
    {
      description: "Atualiza campos de um card",
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: priority.optional(),
        code: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...rest }) =>
      json(await cards.updateCard(id, rest as cards.UpdateCardInput)),
  );

  s.registerTool(
    "move_card",
    {
      description: "Move um card para outra coluna/posição",
      inputSchema: {
        id: z.string(),
        columnId: z.string().optional(),
        columnName: z.string().optional(),
        position: z.number().optional(),
      },
    },
    async ({ id, columnId, columnName, position }) => {
      const ref = columnId ?? columnName;
      if (!ref) throw new Error("columnId ou columnName é obrigatório");
      return json(await cards.moveCard(id, ref, position));
    },
  );

  s.registerTool(
    "add_comment",
    {
      description: "Adiciona comentário a um card",
      inputSchema: {
        cardId: z.string(),
        body: z.string(),
        actor: z.string().optional(),
      },
    },
    async ({ cardId, body, actor }) => {
      const ids = actor ? await cards.resolveUserIds([actor]) : [];
      return json(await cards.addComment(cardId, body, ids[0]));
    },
  );

  s.registerTool(
    "list_users",
    { description: "Lista usuários", inputSchema: {} },
    async () => json(await cards.listUsers()),
  );

  s.registerTool(
    "list_labels",
    { description: "Lista labels", inputSchema: {} },
    async () => json(await cards.listLabels()),
  );

  return s;
}
