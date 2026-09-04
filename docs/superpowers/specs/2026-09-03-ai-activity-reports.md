---
sdd_version: brq-sdd@1.1.1
item: board-kanban-ai-activity-reports
release: dev
flags: []
status: implement
gerado: 2026-09-03
atualizado: 2026-09-03
---

# Spec: métricas de atividades da IA nos relatórios

## 1. Objetivo

Permitir que workflows registrem atividades concluídas pela IA e exibir nos relatórios quantos cards foram analisados, desenvolvidos e testados.

## 2. Escopo

- Persistir atividades `ANALYZED`, `DEVELOPED` e `TESTED` vinculadas ao card.
- Garantir idempotência por chave externa do workflow.
- Expor registro pelo MCP para consumo do Fusion Agents.
- Exibir totais das atividades no `/relatorios` e na resposta de `get_delivery_report`.

## 3. Contrato

`record_ai_activity` recebe `cardId`, `type`, `idempotencyKey` e, opcionalmente, `workflowId`/`runId`. Repetição da mesma chave retorna o registro existente sem incrementar contagem.

## 4. Fora de escopo

- Inferir atividade da IA apenas pela coluna atual ou pelo campo `bot`.
- Backfill de cards antigos.
- Métricas de duração, custo ou taxa de sucesso.

## 5. Critérios de sucesso

1. Cada atividade registrada aparece na contagem correspondente do relatório.
2. Repetição da mesma `idempotencyKey` não duplica a atividade.
3. Card inexistente e tipo inválido são rejeitados.
4. A resposta MCP e a tela `/relatorios` exibem os três totais.
5. Testes existentes e novos passam.
