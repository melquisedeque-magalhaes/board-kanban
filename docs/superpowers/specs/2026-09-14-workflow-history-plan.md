# TI-669 — Plano e tasks

Spec aprovada por Melqui em 2026-09-14. Fase 0 registrada no card. Implementação isolada em `/private/tmp/board-kanban-ti-669`, branch `feat/ti-669-workflow-history`, originada da main.

## Plano técnico

Ampliar AiActivity com status (legado COMPLETED), startedAt/finishedAt opcionais, relação opcional com Workflow e snapshot de nome. Manter workflowId externo e idempotencyKey existentes. Cadastro Workflow contém id, name, color, active e externalId único opcional. Transações serializáveis protegem início/desativação; encerramento usa atualização condicional e retry idempotente. Card.updatedAt sinaliza mudanças no polling existente.

Interface: cadastro /workflows; histórico e registro manual no drawer; tags compactas na listagem. REST autenticado com Clerk; MCP com autenticação Bearer existente. Relatórios preservam campos antigos e adicionam criados, revisados, total único e detalhamento por workflow.

Validação cruzada: frentes de interface e integração revisam o contrato enquanto a frente de domínio implementa. Revisor independente valida diff e critérios ao final.

## Tasks e gates

1. Persistência e domínio: migração aditiva, cadastro, início/conclusão, compatibilidade, concorrência. Testes Vitest de regras e estado persistido; Prisma generate e typecheck.
2. Interface: cadastro, histórico, tags e registro manual; verificação de renderização e smoke no Edge.
3. Integração: REST e MCP, relatórios e documentação; testes de auth/validação e contagens distintas.
4. Integração final: suite, lint, typecheck, build sem migração de produção; revisão independente e sensor de discriminação.

## Matriz de validação

- Domínio: src/server/*.test.ts; `npm test`; transições, duplicação, workflow inativo e métricas.
- REST/MCP: testes de rotas e contrato; `npm test`; 401, 400, 404, 409 e compatibilidade.
- UI: renderização e smoke no Edge; cadastro e jornada de participação, histórico e layout.
- Configuração: Prisma validate/generate, `npx tsc --noEmit`, `npm run lint`, `npx next build`.

## Estado

PLAN/TASKS fechados com escopo aprovado; quatro tasks implementadas e verificadas. IMPLEMENT concluído localmente com 269 testes, build, typecheck, lint dos arquivos alterados, PostgreSQL real e smoke no Edge. Lint global possui quatro falhas preexistentes, reproduzidas na main. Sem push, PR ou deploy. Banco de produção não foi usado na validação.
