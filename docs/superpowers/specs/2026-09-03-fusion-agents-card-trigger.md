---
sdd_version: brq-sdd@1.1.1
item: board-kanban-fusion-agents-card-trigger
itens_relacionados: [Fusion Agents workflow 84]
design: chat approval 2026-09-03
release: dev
flags: []
status: implement
gerado: 2026-09-03
atualizado: 2026-09-03
---

# Spec: identidade e trigger do Fusion Agents no Board Kanban

## 1. Objetivo

Criar o usuário técnico `fusion-agents` e disparar automaticamente a Fase 0 do workflow de análise quando um card for criado. O disparo manual por ID, código ou URL permanece disponível.

## 2. Escopo

- Usuário técnico persistido por seed/migration, resolvível pelo MCP como `fusion-agents`.
- Comentários do agente publicados com `actor: fusion-agents`.
- Evento interno `card.created` após commit da criação do card.
- Webhook configurável para encaminhar o evento ao trigger do Fusion Agents.
- Configuração DEV para o projeto 129 e workflow V2 84.
- Testes unitários do usuário, evento, payload, timeout e falha externa.

## 3. Fora de escopo

- Alterar ou remover workflows existentes.
- Mover cards, alterar campos ou criar branches.
- Disparar análise para cards antigos retroativamente.
- Criar autenticação nova no Board Kanban; o endpoint do Fusion usa token opaco.

## 4. Contrato

O evento envia `cardId`, `code`, `title`, `details`, `columnId`, `columnName` e `createdAt`. O trigger do Fusion recebe `card` com o ID do card. O envio é best-effort após a criação: erro do Fusion é registrado e não desfaz o card.

## 5. Idempotência e segurança

O endpoint será configurado com o token do trigger. O payload inclui `eventId` determinístico por criação para diagnóstico. O Board não repete automaticamente nesta primeira versão; timeout e erro são logados. O workflow mantém sua própria idempotência pelo marcador da Fase 0.

## 6. Critérios de sucesso

1. `fusion-agents` aparece como autor de comentário quando o MCP recebe `actor: fusion-agents`.
2. Criar card dispara uma requisição para o endpoint configurado com `card` igual ao ID criado.
3. Falha ou timeout do endpoint não causa rollback da criação.
4. O workflow manual continua aceitando `card`.
5. Testes existentes e novos passam.
