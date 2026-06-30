import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cards from "@/server/cards";

const priority = z.enum(["ALTA", "MEDIA", "BAIXA"]);
const cardType = z.enum(["BUG", "FEATURE", "TAREFA"]);
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
      description: "Lista cards filtrando por coluna, assignee ou prioridade. Para 'todos os cards do usuário X', passe assignee com o id, nome ou e-mail dele.",
      inputSchema: {
        columnId: z.string().optional(),
        columnName: z.string().optional(),
        assignee: z.string().optional().describe("id, nome ou e-mail do responsável"),
        priority: priority.optional(),
        type: cardType.optional(),
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
        description: z.string().optional().describe("(legado) cai em details — use details"),
        details: z.string().optional().describe("Descrição rica em markdown"),
        priority: priority.optional(),
        type: cardType.optional().describe("Tipo do card: BUG, FEATURE ou TAREFA"),
        version: z.string().optional().describe("Versão (ex.: 2.3.1)"),
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
        description: z.string().optional().describe("(legado) cai em details — use details"),
        details: z.string().nullable().optional().describe("Descrição rica em markdown"),
        priority: priority.optional(),
        type: cardType.nullable().optional().describe("Tipo do card: BUG, FEATURE ou TAREFA"),
        version: z.string().nullable().optional().describe("Versão (ex.: 2.3.1)"),
        code: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...rest }) =>
      json(await cards.updateCard(id, rest as cards.UpdateCardInput)),
  );

  s.registerTool(
    "archive_card",
    {
      description: "Arquiva um card (some do board, reversível). Use unarchive_card p/ restaurar.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await cards.archiveCard(id)),
  );

  s.registerTool(
    "unarchive_card",
    {
      description: "Restaura um card arquivado de volta pro board",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await cards.unarchiveCard(id)),
  );

  s.registerTool(
    "list_archived_cards",
    { description: "Lista os cards arquivados", inputSchema: {} },
    async () => json(await cards.listArchivedCards()),
  );

  s.registerTool(
    "assign_card",
    {
      description: "Adiciona responsável(is) a um card sem remover os demais",
      inputSchema: {
        id: z.string(),
        assignees: z.array(z.string()).describe("ids, nomes ou e-mails"),
      },
    },
    async ({ id, assignees }) => json(await cards.assignCard(id, assignees)),
  );

  s.registerTool(
    "unassign_card",
    {
      description: "Remove responsável(is) de um card sem mexer nos demais",
      inputSchema: {
        id: z.string(),
        assignees: z.array(z.string()).describe("ids, nomes ou e-mails"),
      },
    },
    async ({ id, assignees }) => json(await cards.unassignCard(id, assignees)),
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
        actor: z.string().optional().describe("Quem move (nome ou id) — vira responsável ao mover p/ Em Andamento"),
      },
    },
    async ({ id, columnId, columnName, position, actor }) => {
      const ref = columnId ?? columnName;
      if (!ref) throw new Error("columnId ou columnName é obrigatório");
      return json(await cards.moveCard(id, ref, position, actor));
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
    "add_attachment",
    {
      description: "Anexa um arquivo/imagem (por URL) a um card ou comentário. Use a URL no markdown do campo details para exibir imagens.",
      inputSchema: {
        cardId: z.string(),
        url: z.string().describe("URL pública do arquivo/imagem"),
        name: z.string().describe("Nome do arquivo (ex.: print.png)"),
        contentType: z.string().optional(),
        size: z.number().optional(),
        commentId: z.string().optional().describe("Anexa ao comentário em vez do card"),
      },
    },
    async ({ cardId, url, name, contentType, size, commentId }) =>
      json(await cards.addAttachment({ cardId, url, name, contentType, size, commentId })),
  );

  s.registerTool(
    "list_attachments",
    {
      description: "Lista anexos de um card",
      inputSchema: { cardId: z.string() },
    },
    async ({ cardId }) => json(await cards.listAttachments(cardId)),
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
