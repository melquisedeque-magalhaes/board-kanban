---
sdd_version: brq-sdd@1.7.0
item: TI-669
size: Medium
status: done
gerado: 2026-09-14
atualizado: 2026-09-14
flags: []
---

# TI-669 — Workflows e histórico de atividades de IA

## Objetivo

Mostrar quais workflows estão atuando e quais já atuaram em cada card, identificando criação, análise, desenvolvimento, testes e code review. Permitir cadastrar novos workflows e medir sua participação nos relatórios de IA.

Card: https://board-kanban-blond.vercel.app/?card=cmu1ftjvm002d04l0qv86zza9

## Fase 0

READY_WITH_RISKS, registrado no card antes desta spec. Análise manual orientada pelas skills sdd e brq-sdd. Evidências: pedido do solicitante; `prisma/schema.prisma`; `src/server/ai-activities.ts`; `src/server/reports.ts`; spec anterior `2026-09-03-ai-activity-reports.md`; contrato compartilhado `Systems/Board Kanban — métricas de atividade da IA`.

Riscos: compatibilidade dos consumidores MCP, histórico incompleto dos registros antigos, execuções concorrentes e dupla contagem. O escopo é Medium porque envolve persistência, MCP, cadastro, card e relatórios.

## Comportamento proposto

### Cadastro de workflows

- Cada workflow tem identificador estável, nome, cor da tag e estado ativo/inativo. Um identificador externo opcional permite associar o cadastro aos IDs recebidos de integrações existentes.
- Usuários autenticados podem cadastrar, editar e desativar workflows, seguindo o acesso das configurações atuais do board.
- Novos workflows são dados do cadastro; não exigem alterar código ou publicar nova versão.
- Desativar impede novas execuções, mas permite encerrar execuções em andamento. Histórico e métricas permanecem acessíveis.
- Cadastro não configura nem dispara webhooks; o cadastro atual de triggers continua com sua função própria.

### Participação no card

- Uma participação identifica workflow, atividade, execução, início, término e resultado. Atividades iniciais: CREATED, ANALYZED, DEVELOPED, TESTED e REVIEWED.
- Estados: RUNNING, COMPLETED, FAILED e CANCELLED. Somente COMPLETED representa trabalho concluído para as métricas.
- O card aceita vários workflows e várias execuções do mesmo workflow, inclusive simultâneas.
- O resumo mostra tags dos workflows participantes, destacando os que estão em execução. Abrir o card mostra histórico cronológico com atividade, workflow, resultado e datas; o runId aparece quando disponível.
- Exemplos: “Criado por Triagem”, “Desenvolvido por Implementação”, “Testado por QA”, “Revisado por Code Review”. Os nomes vêm do cadastro.
- Tags são derivadas das participações registradas. Adicionar uma label comum ou ligar o robô não comprova conclusão de atividade.
- O indicador de operação fica ativo enquanto existir participação RUNNING ou o marcador manual legado `bot` estiver ligado. Encerrar uma execução não apaga a indicação de outra execução ativa.
- Renomear um workflow atualiza sua tag de cadastro; o histórico preserva o nome registrado na execução para manter a atribuição original.

### Registro e compatibilidade

- Workflows registram início e encerramento via MCP; a UI oferece registro manual de participação e resultado para workflows ainda não integrados.
- A tool existente `record_ai_activity` mantém os parâmetros atuais e continua registrando conclusão diretamente. Chamadas antigas sem cadastro continuam aceitas e identificadas como legado.
- Atividades antigas permanecem como concluídas, sem inventar início, nome de workflow ou vínculo externo ausente. Novos tipos são aditivos.
- Repetir a mesma operação com a mesma chave e payload retorna o registro existente. Reutilizar a chave para outro card, workflow ou atividade retorna conflito, sem alterar dados.
- Transições permitidas: RUNNING para COMPLETED, FAILED ou CANCELLED; repetir a mesma conclusão é idempotente. Uma nova tentativa usa nova identidade de execução. Resultado terminal não pode ser trocado por outro resultado.
- IDs desconhecidos no novo contrato e entradas inválidas são rejeitados. Falha de gravação não produz tag nem sucesso aparente; a UI mostra erro e permite tentar novamente.

### Relatórios de IA

- Exibir cards criados, analisados, desenvolvidos, testados e revisados por IA.
- Cada card conta uma vez por atividade concluída, mesmo que dois workflows a realizem ou existam várias tentativas.
- Exibir também total de cards únicos com alguma atividade concluída de IA e detalhamento por workflow e atividade.
- No detalhamento, um card pode contar uma vez para cada workflow que concluiu a atividade. A soma por workflow não representa cards únicos globais; a interface explicita isso.
- RUNNING, FAILED e CANCELLED ficam no histórico, mas não entram nos totais de conclusão.
- Preservar o universo atual das métricas de IA: todos os cards existentes, inclusive arquivados, independentemente da coluna. Sem filtro temporal nesta entrega.
- Registros sem workflow aparecem em “Workflow não informado”, preservando as contagens atuais.

## Critérios de aceite

1. Cadastrar um workflow o torna selecionável no card; cadastrar outro não exige alteração de código. Nome vazio, cor inválida e identificador externo duplicado são rejeitados.
2. Registrar criação por A, desenvolvimento por B, teste por C e revisão por D no mesmo card exibe os quatro workflows e quatro entradas de histórico com atividades e resultados corretos.
3. Duas participações RUNNING mantêm o indicador ativo; encerrar apenas uma mantém a outra ativa. Encerrar ambas desliga a indicação automática, preservando eventual marcador manual.
4. Desativar workflow preserva histórico e contagens, impede iniciar novas participações e permite finalizar as já iniciadas.
5. Repetir uma operação não duplica histórico ou métricas. Chave reutilizada com identidade diferente falha sem modificar o registro original.
6. Um card com dois desenvolvimentos COMPLETED soma 1 em desenvolvidos globalmente. Se realizados por workflows distintos, soma 1 no detalhamento de cada workflow.
7. Um card criado e desenvolvido por IA soma 1 em criados, 1 em desenvolvidos e 1 no total de cards únicos com IA. Tentativas somente FAILED ou RUNNING somam zero nos totais de conclusão.
8. Chamadas existentes de `record_ai_activity`, inclusive sem workflowId/runId, continuam funcionando. Registros antigos preservam seus totais e aparecem como concluídos no histórico.
9. REST sem sessão retorna 401; MCP sem credencial válida permanece recusado. Nome e atividade não autorizam acesso por si só.
10. UI, resposta de `get_delivery_report` e histórico retornam métricas consistentes; histórico permanece após desligar o robô ou arquivar o card.

## Premissas e limites

- Dono do requisito: Melqui. Spec aprovada em 2026-09-14 (resposta “ok”); implementação autorizada.
- Workflow é cadastro extensível; atividade é uma classificação estável para comparação nos relatórios. Tipos arbitrários de atividade não fazem parte desta entrega.
- A integração automática depende de cada workflow consumidor enviar os eventos. A entrega no board fornece os contratos e documenta o uso; não altera o repositório Fusion Agents nem workflows de produção.
- Sem inferir autoria histórica por responsável, coluna, comentário ou estado do robô; sem backfill especulativo.
- Sem métricas de custo, duração agregada ou produtividade humana; sem orquestrador novo.
- Nenhuma dependência externa adicional prevista. Persistência utiliza PostgreSQL/Prisma existente, com migração aditiva.
- Concorrência, idempotência, autenticação, falha parcial e retenção estão cobertas acima. Demais dimensões implícitas não se aplicam ao escopo.

## Contexto técnico e verificação prevista

Next.js App Router, React, TanStack Query, TypeScript, Prisma/PostgreSQL, Clerk e MCP existentes. Camada de domínio em `src/server`; REST/MCP em `src/app/api`; componentes em `src/components`.

Validação prevista: testes de comportamento para transições, idempotência, compatibilidade e contagem distinta; testes de autenticação dos endpoints; typecheck, lint e suite Vitest; validação visual no Microsoft Edge. Comandos existentes: `npm test`, `npm run lint`, `npx tsc --noEmit`. `npm run build` executa migrações, portanto build deve usar banco de teste isolado ou executar a compilação sem o wrapper de migração.

Branch de implementação deverá nascer da main, com destino main, conforme regras globais. Nenhuma branch, código de produto, migração ou implantação foi realizada nesta fase.

## Gate de transição

SPECIFY aprovada por Melqui em 2026-09-14. Plano e tasks em `2026-09-14-workflow-history-plan.md`; implementação e validação concluídas localmente. Evidências e limitações em `2026-09-14-workflow-history-validation.md`. Sem publicação ou deploy.
