# TI-258 — Funcionalidade de Notificações no Board

**Data:** 2026-08-17

**Card:** TI-258 (FEATURE, prioridade MÉDIA)

**Status:** design aprovado pelo usuário

## Objetivo

Adicionar notificações in-app persistentes ao board para avisar responsáveis,
solicitantes e pessoas inscritas em colunas sobre eventos relevantes dos cards.
A solução deve preservar histórico, abrir diretamente o card relacionado e
seguir a arquitetura atual do produto, sem adicionar infraestrutura de tempo
real nesta entrega.

## Decisões aprovadas

- Persistência relacional no PostgreSQL com atualização por polling leve.
- Ações próprias não notificam o autor.
- Histórico com estado lida/não lida, badge de não lidas e ação em lote.
- Qualquer membro pode gerenciar os inscritos de qualquer coluna.
- Central em popover compacto no cabeçalho.
- Sino simples em contorno, sem fundo, tanto no cabeçalho quanto nas colunas.
- O primeiro carregamento não toca som; lotes novos tocam uma única vez.
- Se o card da notificação já estiver aberto e a aba estiver focada, o som é
  suprimido, mas a notificação continua sendo criada e exibida.

## Estado atual relevante

- Aplicação Next.js 16 com React 19, Clerk, Prisma 7 e PostgreSQL.
- `BoardApp` usa React Query e consulta `/api/board/version` a cada três segundos;
  o board completo só é recarregado quando a assinatura muda.
- Alterações de card passam principalmente por `moveCard`, `updateCard` e
  `addComment` em `src/server/cards.ts`.
- A interface web e o servidor MCP compartilham as funções de `src/server`.
- A coluna de liberação para teste chama-se exatamente `Aguardando Teste`.
- `Chrome.tsx` contém as ações globais do cabeçalho; `Column.tsx` renderiza o
  cabeçalho de cada coluna; `BoardApp.tsx` controla o card aberto.

## Alternativas consideradas

### 1. Persistência com polling leve — escolhida

Guarda notificações e inscrições no banco e consulta uma assinatura barata a
cada três segundos. Mantém histórico durante logout ou período offline, reutiliza
o padrão já existente e não exige nova infraestrutura.

### 2. Server-Sent Events

Entregaria menor latência, mas adicionaria conexões longas, reconexão e
complexidade operacional na Vercel sem benefício suficiente para o escopo atual.

### 3. Derivação no cliente por comparação do board

Evitaria modelos novos, porém perderia eventos enquanto o usuário estivesse
offline e não produziria um histórico confiável. Foi descartada.

## Modelo de dados

### `NotificationType`

- `CARD_READY_FOR_TEST`
- `CARD_ENTERED_COLUMN`
- `COMMENT_ADDED`
- `BLOCKER_ADDED`
- `BLOCKER_REMOVED`
- `BLOCKER_CHANGED`

### `Notification`

Campos:

- `id`: identificador CUID.
- `recipientId`: usuário que recebe a notificação.
- `actorId`: usuário que realizou a ação; nullable quando não identificável.
- `cardId`: card relacionado.
- `type`: enum `NotificationType`.
- `message`: texto congelado do evento, incluindo chave/título e contexto
  necessário para o histórico não mudar após edições posteriores do card.
- `readAt`: `DateTime?`; `null` significa não lida.
- `createdAt`: data do evento.

Relações:

- Destinatário obrigatório; apagar um usuário elimina suas notificações.
- Autor opcional com `onDelete: SetNull`.
- Card obrigatório com `onDelete: Cascade`; apagar definitivamente o card
  elimina suas notificações. Arquivar o card não altera o histórico.

Índices:

- `[recipientId, createdAt]` para paginação cronológica.
- `[recipientId, readAt, createdAt]` para contagem e busca de não lidas.
- `[cardId]` para limpeza e navegação relacionada.

### `ColumnSubscription`

Campos:

- `columnId`
- `userId`
- `createdAt`

A chave composta `[columnId, userId]` impede inscrições duplicadas. Excluir uma
coluna ou usuário remove suas inscrições por cascade.

## Serviço de domínio

Criar `src/server/notifications.ts` como limite único para:

- carregar os destinatários relevantes;
- unir e deduplicar responsáveis, solicitante e inscritos da coluna;
- remover o autor da lista;
- escolher o tipo mais específico quando a mesma pessoa teria dois avisos;
- persistir notificações com `createMany` dentro da transação da mutação;
- listar, contar, paginar e marcar notificações como lidas;
- adicionar, remover e listar inscrições por coluna;
- calcular a versão barata das notificações do usuário atual.

As regras recebem `actorId` quando disponível. As rotas web resolvem o autor pela
sessão Clerk. As tools MCP de mutação expõem `actor` opcional, resolvido por id,
nome ou e-mail. Se o MCP não informar um autor válido, nenhuma pessoa é suprimida.

## Regras de geração

### Comentário criado

- Destinatários: responsáveis e solicitante.
- Tipo: `COMMENT_ADDED`.
- Editar um comentário existente não gera novo aviso.
- O autor do comentário é suprimido.

### Bloqueio

- `null` para um valor: `BLOCKER_ADDED`.
- Um valor para `null`: `BLOCKER_REMOVED`.
- Um valor para outro valor: `BLOCKER_CHANGED`.
- Alterar somente `blockerReason` não gera aviso.
- Destinatários: responsáveis e solicitante.

### Movimento de coluna

- Reordenação dentro da mesma coluna não gera aviso.
- Ao entrar em qualquer coluna, os inscritos da coluna de destino recebem
  `CARD_ENTERED_COLUMN`.
- Ao entrar em `Aguardando Teste`, responsáveis e solicitante recebem
  `CARD_READY_FOR_TEST`.
- Se uma pessoa também estiver inscrita em `Aguardando Teste`, recebe somente
  `CARD_READY_FOR_TEST`, por ser o evento mais específico.
- O autor do movimento é suprimido em todos os grupos.

### Eventos fora do escopo

- Criação de card.
- Edições comuns de título, detalhes, documentação, prioridade ou prazo.
- Troca de responsáveis ou solicitante.
- Arquivamento, restauração ou exclusão.
- Alteração das próprias inscrições de coluna.

## Consistência transacional

Cada mutação relevante lê o estado anterior, aplica a mudança e persiste suas
notificações na mesma transação Prisma. Se a criação das notificações falhar, a
mutação correspondente também falha.

`moveCard` passa a receber o autor e concentra a autoatribuição ao entrar em
`Em Andamento`; a duplicação hoje existente na rota REST será removida.
`updateCard` recebe o autor para comparar o bloqueio anterior com o novo.
`addComment` já recebe o autor e passa a chamar o serviço de notificações antes
de confirmar a transação.

Quando um PATCH contiver movimento e alteração de bloqueio, cada mudança gera seu
evento próprio, mas cada evento individual deduplica seus destinatários.

## API REST

### Notificações

- `GET /api/notifications?cursor=<opaque>&limit=<n>`
  - retorna itens em ordem decrescente, `nextCursor` e `unreadCount`;
  - limite padrão 50 e máximo 100.
- `GET /api/notifications/version`
  - retorna uma assinatura barata baseada em criação, leitura e contagem das
    notificações do usuário atual.
- `PATCH /api/notifications/[id]` com `{ read: boolean }`
  - só altera uma notificação do usuário da sessão.
- `POST /api/notifications/read-all`
  - define `readAt` nas notificações ainda não lidas do usuário da sessão.

### Inscrições de coluna

- `GET /api/columns/[id]/subscribers`
- `POST /api/columns/[id]/subscribers/[userId]`
- `DELETE /api/columns/[id]/subscribers/[userId]`

As operações são incrementais para evitar que dois membros editando a mesma
lista sobrescrevam alterações alheias. Todas as rotas exigem sessão Clerk e
validam a existência da coluna e do usuário.

## Interface

### Central de notificações

Adicionar um `NotificationPopover` ao lado das ações globais de `Chrome.tsx`:

- sino em contorno, sem fundo permanente;
- badge com o total de não lidas, limitado visualmente a `99+`;
- lista com destaque discreto para não lidas;
- texto do evento, referência do card e horário relativo;
- botão `Marcar todas como lidas`;
- carregamento incremental do histórico;
- estado vazio explícito.

Ao clicar em uma notificação:

1. marcar a notificação como lida;
2. fechar o popover;
3. abrir o card por `BoardApp`, preservando o deep-link `?card=<id>`.

Abrir o popover não marca automaticamente os itens como lidos.

### Inscritos por coluna

Adicionar `ColumnSubscribersPopover` ao cabeçalho de `Column.tsx`:

- sino em contorno sem fundo;
- quantidade de inscritos somente quando maior que zero;
- lista de membros com avatar, nome e checkbox;
- qualquer membro pode adicionar ou remover qualquer pessoa;
- atualização otimista com rollback e toast em caso de erro.

### Polling e som

`BoardApp` mantém uma query separada para `/api/notifications/version` com o
mesmo intervalo de três segundos do board. Quando a versão muda, invalida a
query paginada de notificações.

Regras do som:

- o carregamento inicial estabelece a referência e nunca toca;
- um lote com uma ou mais notificações novas toca uma única vez;
- com a aba focada, o som é suprimido quando todas as notificações novas do lote
  pertencem ao card já aberto; se o lote também trouxer outro card, o som toca;
- falhas de autoplay ou reprodução são ignoradas sem toast;
- usar um áudio curto e local em `public`, sem dependência de rede.

O alerta visual e a persistência não dependem do sucesso do áudio.

## Segurança

- Todas as rotas REST usam `requireUser()`.
- O usuário atual é derivado da sessão; endpoints não aceitam `recipientId` para
  listagem ou contagem.
- Leitura individual usa filtro conjunto por `id` e `recipientId`.
- A API nunca retorna notificações de outra pessoa.
- As inscrições aceitam somente ids de usuários já materializados no board.
- Mensagens são renderizadas como texto, não HTML.

## Tratamento de falhas

- Falha de persistência de notificações desfaz a mutação relevante.
- Falha de polling mantém a última lista válida e tenta novamente no ciclo
  seguinte.
- Falha ao alterar inscrição reverte a seleção otimista e exibe toast.
- Notificação cujo card foi arquivado continua navegável pelo fluxo existente.
- A exclusão definitiva do card remove a notificação por cascade.
- Não há expiração automática do histórico nesta entrega.

## Estratégia de testes

### Serviço

- União e deduplicação de responsável, solicitante e inscritos.
- Supressão do autor em todos os eventos.
- Ausência de supressão quando o autor não é identificável.
- Adição, remoção e troca de bloqueio; mudança isolada do motivo não notifica.
- Movimento para `Aguardando Teste` prioriza `CARD_READY_FOR_TEST` sobre
  `CARD_ENTERED_COLUMN` para destinatários sobrepostos.
- Reordenação na mesma coluna não notifica.
- Comentário cria aviso; edição de comentário não cria.
- Inscrição composta é idempotente.
- Versão muda em criação e leitura.

### Rotas

- `401` sem sessão.
- Paginação e limite máximo.
- Isolamento por destinatário.
- Marcação individual e em lote.
- Validação de coluna e usuário nas inscrições.

### Interface e comportamento

- Badge mostra o total correto e aplica `99+`.
- Clique marca como lida e abre o card.
- Primeiro carregamento não toca som.
- Um lote toca somente uma vez.
- Card aberto com aba focada suprime o som.
- Erro de áudio não interrompe o polling.
- Alteração otimista de inscritos faz rollback quando a API falha.

### Regressão

- Movimento de card bloqueado continua rejeitado.
- Entrada em `Em Andamento` continua autoatribuindo o autor.
- Comentários com anexos continuam funcionando.
- Rotas REST e tools MCP geram os mesmos eventos.
- Polling do board continua independente do polling de notificações.

## Migração e implantação

- Criar uma migration Prisma contendo enum, modelos, relações e índices.
- Executar migrations de produção via `DIRECT_URL`, conforme a convenção do
  repositório.
- A migration não exige backfill: notificações começam a partir da implantação.
- Não há feature flag; a ausência de registros produz estado vazio seguro.

## Fora de escopo

- E-mail, Slack, Teams, push do navegador ou qualquer canal externo.
- Preferências individuais para mutar tipos de notificação.
- Exclusão manual ou expiração automática do histórico.
- WebSocket, SSE ou serviço externo de filas.
- Notificações para eventos além dos listados neste documento.

## Critérios de aceite rastreáveis

- O popover lista notificações e cada item abre o card relacionado.
- O badge e os estados lida/não lida persistem entre sessões.
- O som toca somente para lotes novos e respeita card aberto/foco.
- Liberação para teste, comentário e mudança de bloqueio notificam responsável e
  solicitante, com supressão do autor.
- O sino de cada coluna permite gerenciar inscritos.
- A entrada de um card notifica os inscritos da coluna de destino.
- Um usuário com múltiplos papéis recebe somente uma notificação por evento.
