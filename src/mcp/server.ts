import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cards from "@/server/cards";
import * as columns from "@/server/columns";
import { getDeliveryReport } from "@/server/reports";
import { purgeBlobs } from "@/server/blobs";
import { recordAiActivity, startAiActivity, finishAiActivity, listAiActivities } from "@/server/ai-activities";
import { listWorkflows, createWorkflow, updateWorkflow } from "@/server/workflows";

const priority = z.enum(["CRITICA", "ALTA", "MEDIA", "BAIXA"]);
const cardType = z.enum(["BUG", "FEATURE", "TAREFA", "SUBTASK"]);
const blocker = z.enum(["IMPEDIMENTO", "AVISO", "AJUSTES"]);
const activityType = z.enum(["CREATED", "ANALYZED", "DEVELOPED", "TESTED", "REVIEWED"]);
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export function buildMcpServer() {
  const s = new McpServer({ name: "board-kanban", version: "1.0.0" });

  // Devolve a CONTAGEM de cards, não os cards. Antes chamava cards.listColumns()
  // — a query da UI, que embute todo card com details — e o resultado eram
  // 1.531.643 caracteres (~383k tokens) com 578 cards no board: acima do corte
  // de tool result do SDK do Claude e da janela do modelo no harness codex.
  s.registerTool(
    "list_columns",
    {
      description:
        "Lista as colunas do board com a contagem de cards não arquivados de cada uma. " +
        "NÃO traz os cards — para eles use list_cards (paginado) ou get_card/get_card_by_code.",
      inputSchema: {},
    },
    async () => json(await cards.listColumnsSummary()),
  );

  s.registerTool(
    "create_column",
    {
      description: "Cria uma coluna no fim do board",
      inputSchema: {
        name: z.string().describe("Nome da coluna (não pode repetir uma existente)"),
        color: z.string().optional().describe("Cor do chip em hex, ex.: #d3e5ef"),
      },
    },
    async ({ name, color }) => json(await columns.createColumn({ name, color })),
  );

  s.registerTool(
    "update_column",
    {
      description: "Renomeia e/ou troca a cor de uma coluna",
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        color: z.string().nullable().optional().describe("Hex, ex.: #d3e5ef (null volta pra cor default)"),
      },
    },
    async ({ id, name, color }) => json(await columns.updateColumn(id, { name, color })),
  );

  s.registerTool(
    "move_column",
    {
      description: "Reordena uma coluna no board. Use index (posição 0-based na ordem atual).",
      inputSchema: {
        id: z.string(),
        index: z.number().int().optional().describe("Destino 0-based: 0 = primeira coluna"),
        position: z.number().optional().describe("Position fracionária crua (uso interno do board)"),
      },
    },
    async ({ id, index, position }) => {
      if (index == null && position == null) throw new Error("index ou position é obrigatório");
      return json(await columns.moveColumn(id, { index, position }));
    },
  );

  s.registerTool(
    "delete_column",
    {
      description: "Exclui uma coluna. Só funciona se ela estiver vazia — coluna com card (mesmo arquivado) é recusada.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => json(await columns.deleteColumn(id)),
  );

  // Resumo paginado: sem `details`/`documentation` e com responsáveis/labels em
  // nomes. A forma completa da UI custava 1.424.036 caracteres (~356k tokens)
  // numa única chamada sem filtro.
  s.registerTool(
    "list_cards",
    {
      description:
        "Lista cards em RESUMO e paginado, filtrando por coluna, assignee, prioridade ou tipo. " +
        "Para 'todos os cards do usuário X', passe assignee com o id, nome ou e-mail dele. " +
        "O resumo não inclui a descrição (details) nem a documentação do card — para o corpo " +
        `use get_card ou get_card_by_code. Resposta: { total, offset, limit, hasMore, cards }. ` +
        `Padrão de ${cards.MCP_LIST_DEFAULT_LIMIT} cards por página, máximo ${cards.MCP_LIST_MAX_LIMIT}; ` +
        "quando hasMore for true, avance o offset em vez de concluir sobre a página parcial.",
      inputSchema: {
        columnId: z.string().optional(),
        columnName: z.string().optional(),
        assignee: z.string().optional().describe("id, nome ou e-mail do responsável"),
        priority: priority.optional(),
        type: cardType.optional(),
        limit: z.number().int().optional().describe(
          `Cards por página (padrão ${cards.MCP_LIST_DEFAULT_LIMIT}, máximo ${cards.MCP_LIST_MAX_LIMIT})`,
        ),
        offset: z.number().int().optional().describe("Quantos cards pular (padrão 0)"),
      },
    },
    async ({ limit, offset, ...filter }) =>
      json(await cards.listCardsSummary(filter as cards.CardFilter, { limit, offset })),
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
    "get_card_by_code",
    {
      description: "Detalhe de um card pela CHAVE (ex.: TI-282), com comentários. Use esta quando tiver a chave; get_card espera o id (cuid).",
      inputSchema: {
        code: z.string().describe("Chave do card: TI-282, ti-282 ou só 282"),
      },
    },
    async ({ code }) => {
      const card = await cards.getCardByCode(code);
      if (!card) throw new Error(`Card não encontrado: ${cards.normalizeCardCode(code)}`);
      return json(card);
    },
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
        documentation: z.string().optional().describe("Links e documentação do card (markdown)"),
        priority: priority.optional(),
        type: cardType.optional().describe("Tipo: BUG, FEATURE, TAREFA ou SUBTASK"),
        version: z.string().optional().describe("Versão (ex.: 2.3.1)"),
        branchUrl: z.string().optional().describe("Link da branch/MR (ex.: URL do GitLab/GitHub)"),
        requestedBy: z.string().optional().describe("Quem solicitou — id, nome ou e-mail do usuário"),
        code: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
        createdBy: z.string().optional().describe(
          "Quem cria — id, nome ou e-mail. Vira 'Solicitado por' se requestedBy não for informado",
        ),
        parentId: z.string().optional().describe("id do card pai (torna este card uma subtarefa)"),
        blocker: blocker.optional().describe("Impedimento, Aviso ou Ajustes a Fazer"),
        blockerReason: z.string().optional().describe("Motivo do impedimento/aviso"),
        bot: z.boolean().optional().describe("Marca o card como em operação por um robô"),
      },
    },
    async ({ createdBy, ...rest }) => {
      const input = rest as cards.CreateCardInput;
      // Espelha a rota web: quem cria vira "Solicitado por" por padrão, salvo escolha explícita.
      if (!input.requestedBy && createdBy) input.requestedBy = createdBy;
      return json(await cards.createCard(input));
    },
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
        documentation: z.string().nullable().optional().describe("Links e documentação (markdown; null limpa)"),
        priority: priority.optional(),
        type: cardType.nullable().optional().describe("Tipo do card: BUG, FEATURE, TAREFA ou SUBTASK"),
        version: z.string().nullable().optional().describe("Versão (ex.: 2.3.1)"),
        branchUrl: z.string().nullable().optional().describe("Link da branch/MR (null limpa)"),
        requestedBy: z.string().nullable().optional().describe("Quem solicitou — id, nome ou e-mail (null limpa)"),
        code: z.string().optional(),
        assignees: z.array(z.string()).optional(),
        labels: z.array(z.string()).optional(),
        parentId: z.string().nullable().optional().describe("id do card pai (null desvincula)"),
        blocker: blocker.nullable().optional().describe("Impedimento/Aviso/Ajustes a Fazer (null limpa)"),
        blockerReason: z.string().nullable().optional().describe("Motivo (null limpa)"),
        bot: z.boolean().optional().describe("Marca/desmarca o card como em operação por um robô"),
        actor: z.string().optional().describe("Quem executa a alteração — id, nome ou e-mail"),
      },
    },
    async ({ id, actor, ...rest }) =>
      json(await cards.updateCard(id, rest as cards.UpdateCardInput, actor)),
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
    {
      description:
        "Lista os cards arquivados em RESUMO e paginado (sem details/documentation). " +
        `Resposta: { total, offset, limit, hasMore, cards }. Padrão de ${cards.MCP_LIST_DEFAULT_LIMIT} ` +
        `por página, máximo ${cards.MCP_LIST_MAX_LIMIT}.`,
      inputSchema: {
        limit: z.number().int().optional().describe(
          `Cards por página (padrão ${cards.MCP_LIST_DEFAULT_LIMIT}, máximo ${cards.MCP_LIST_MAX_LIMIT})`,
        ),
        offset: z.number().int().optional().describe("Quantos cards pular (padrão 0)"),
      },
    },
    async ({ limit, offset }) => json(await cards.listArchivedCardsSummary({ limit, offset })),
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
    "set_card_bot",
    {
      description:
        "Liga/desliga o marcador manual de robô. Participações RUNNING também mantêm o indicador ativo; desligar o marcador manual não encerra essas execuções. Use start_ai_activity e finish_ai_activity para registrar workflow e histórico.",
      inputSchema: {
        id: z.string(),
        bot: z.boolean().describe("true marca como em operação; false desmarca"),
      },
    },
    async ({ id, bot }) => json(await cards.setCardBot(id, bot)),
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
      description: "Adiciona comentário a um card. Use actor='fusion-agents' para atribuir o comentário ao agente técnico.",
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
    "update_comment",
    {
      description: "Edita o texto de um comentário existente",
      inputSchema: { commentId: z.string(), body: z.string() },
    },
    async ({ commentId, body }) => json(await cards.updateComment(commentId, body)),
  );

  s.registerTool(
    "delete_comment",
    {
      description: "Exclui um comentário de vez (junto com os anexos dele). Não é reversível.",
      inputSchema: { commentId: z.string() },
    },
    async ({ commentId }) => {
      const result = await cards.deleteComment(commentId);
      if (!result) throw new Error(`Comentário não encontrado: ${commentId}`);
      await purgeBlobs(result.urls);
      return json({ ok: true, deletedAttachments: result.urls.length });
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

  s.registerTool(
    "get_delivery_report",
    {
      description:
        "Relatório de entregas do time e IA: cards criados/analisados/desenvolvidos/testados/revisados, total de cards únicos com IA e aiByWorkflow. IA conta somente COMPLETED, incluindo arquivados, sem filtro temporal. Um card conta uma vez por atividade globalmente e por workflow; a soma por workflow não representa cards únicos globais. Entregue = coluna Done/Concluído; WIP = ativo fora de done/cancelado.",
      inputSchema: {},
    },
    async () => json(await getDeliveryReport()),
  );

  s.registerTool(
    "record_ai_activity",
    {
      description: "Registra atividade concluída pela IA em um card, sem duplicar a mesma operação",
      inputSchema: {
        cardId: z.string(),
        type: activityType,
        idempotencyKey: z.string().describe("Chave única da atividade no workflow/run"),
        workflowId: z.string().optional(),
        runId: z.string().optional(),
      },
    },
    async ({ cardId, type, idempotencyKey, workflowId, runId }) =>
      json(await recordAiActivity({ cardId, type, idempotencyKey, workflowId, runId })),
  );

  s.registerTool("list_workflows", {
    description: "Lista o cadastro de workflows, incluindo inativos e seus identificadores externos.", inputSchema: {},
  }, async () => json(await listWorkflows()));

  s.registerTool("create_workflow", {
    description: "Cadastra um workflow para atribuir atividades e tags aos cards; não dispara automações.",
    inputSchema: { name: z.string(), color: z.string(), active: z.boolean().optional(), externalId: z.string().nullable().optional() },
  }, async (input) => json(await createWorkflow(input)));

  s.registerTool("update_workflow", {
    description: "Edita nome, cor ou identificador externo; desativar impede novos inícios e preserva histórico e encerramentos.",
    inputSchema: { id: z.string(), name: z.string().optional(), color: z.string().optional(), active: z.boolean().optional(), externalId: z.string().nullable().optional() },
  }, async ({ id, ...input }) => json(await updateWorkflow(id, input)));

  s.registerTool("start_ai_activity", {
    description: "Inicia participação de workflow cadastrado (RUNNING), ou registra conclusão direta com status COMPLETED. Repetição com mesma chave/payload é idempotente; nova tentativa exige nova chave.",
    inputSchema: { cardId: z.string(), workflowTagId: z.string().describe("ID do cadastro de workflows, não o identificador externo"), type: activityType, idempotencyKey: z.string(), runId: z.string().optional(), status: z.enum(["RUNNING", "COMPLETED"]).optional() },
  }, async (input) => json(await startAiActivity(input)));

  s.registerTool("finish_ai_activity", {
    description: "Encerra participação RUNNING. Repetir o mesmo resultado é idempotente; trocar resultado terminal é conflito. Somente COMPLETED conta nos relatórios.",
    inputSchema: { cardId: z.string(), activityId: z.string(), status: z.enum(["COMPLETED", "FAILED", "CANCELLED"]) },
  }, async ({ cardId, activityId, status }) => json(await finishAiActivity(cardId, activityId, status)));

  s.registerTool("list_ai_activities", {
    description: "Histórico de participações de IA no card, incluindo execuções ativas, falhas, canceladas e registros legados.",
    inputSchema: { cardId: z.string() },
  }, async ({ cardId }) => json(await listAiActivities(cardId)));

  return s;
}
