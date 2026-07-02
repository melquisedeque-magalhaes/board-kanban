# Board Kanban + MCP

Uma aplicação Kanban moderna construída com Next.js 16, TypeScript, Prisma 7 e PostgreSQL. Oferece uma interface drag-and-drop intuitiva para gerenciar colunas e cards, além de um servidor MCP (Model Context Protocol) totalmente funcional para integração com clientes MCP.

## Stack Tecnológico

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript
- **Banco de Dados**: PostgreSQL 16 (via Docker)
- **ORM**: Prisma 7 com adaptador PrismaPg
- **Drag & Drop**: dnd-kit
- **MCP Server**: @modelcontextprotocol/sdk
- **UI**: Lucide React (ícones)
- **Validação**: Zod
- **Testes**: Vitest

## Requisitos

- Node.js 18+
- Docker & Docker Compose
- npm 9+

## Instalação Local

### 1. Clonar o repositório

```bash
git clone <repo-url>
cd board-kanban
```

### 2. Instalar dependências

```bash
npm install
```

O script `postinstall` executa automaticamente `prisma generate`.

### 3. Iniciar o banco de dados

```bash
npm run db:up
```

Isso inicia um contêiner PostgreSQL na porta 5432 com credenciais padrão:
- Usuário: `kanban`
- Senha: `kanban`
- Banco: `kanban`

### 4. Configurar variáveis de ambiente

Crie um arquivo `.env` (baseado em `.env.example`):

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```bash
DATABASE_URL="postgresql://kanban:kanban@localhost:5432/kanban?schema=public"
MCP_TOKEN="seu-token-mcp-aqui"
```

Para gerar um `MCP_TOKEN` seguro (recomendado para produção):

```bash
openssl rand -hex 24
```

### 5. Executar migrações

```bash
npm run db:migrate
```

### 6. Seed do banco (dados iniciais)

```bash
npm run db:seed
```

Popula o banco com um board padrão, colunas, cards de exemplo, usuários e labels.

### 7. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) em seu navegador.

## Scripts npm

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento (Next.js) |
| `npm run build` | Cria uma build otimizada para produção |
| `npm start` | Inicia o servidor em modo produção |
| `npm run lint` | Executa ESLint no código |
| `npm test` | Executa a suite de testes (Vitest) |
| `npm run db:up` | Inicia o contêiner PostgreSQL (Docker Compose) |
| `npm run db:migrate` | Executa migrações Prisma pendentes |
| `npm run db:seed` | Popula o banco com dados iniciais |

## Arquitetura

### Camadas

- **UI** (`src/app/`): Página Next.js com React Server Components e Client Components
- **API REST** (`src/app/api/`): Rotas CRUD para colunas, cards e comentários
- **MCP Server** (`src/mcp/`): Servidor MCP com 9 ferramentas
- **Domain** (`src/server/`): Lógica compartilhada consumida por REST e MCP
- **Database** (`src/lib/db.ts`): Cliente Prisma com adaptador PrismaPg
- **Lib** (`src/lib/`): Utilitários (posicionamento, tipos, etc.)

### Fluxo de Dados

```
Cliente (UI/MCP)
  ↓
REST API ou MCP Server
  ↓
Domain Layer (src/server/cards.ts)
  ↓
Prisma ORM
  ↓
PostgreSQL
```

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DATABASE_URL` | String de conexão PostgreSQL | `postgresql://user:pass@localhost:5432/kanban?schema=public` |
| `MCP_TOKEN` | Token Bearer para autenticação MCP | `abc123def456...` (gerar com `openssl rand -hex 24`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Chave pública do Clerk | `pk_test_...` (dashboard Clerk) |
| `CLERK_SECRET_KEY` | Chave secreta do Clerk | `sk_test_...` (dashboard Clerk) |

## Autenticação (Clerk)

O board e a REST API ficam **atrás de login** (Clerk). O `/api/mcp` **NÃO** — os agentes autenticam por `Authorization: Bearer $MCP_TOKEN`, não por sessão Clerk (o `src/proxy.ts` marca `/api/mcp` como rota pública).

**Setup:**
1. Criar app no [dashboard do Clerk](https://dashboard.clerk.com) (ou `npx clerk@latest init`, que já cria o app e preenche o `.env`).
2. Habilitar os métodos de login: **Email** (marcar **"Email verification link"** para magic link de verdade, não código) + **Google** (Social Connections).
3. Setar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` e `CLERK_SECRET_KEY` (local em `.env`, e na Vercel).

**Rotas:** `/sign-in`, `/sign-up` (componentes Clerk). Não-logado é redirecionado pro `/sign-in`. O `<UserButton>` na top bar faz logout/perfil.

**Sync de usuário:** no primeiro acesso logado, `syncCurrentUser()` (`src/server/users.ts`) faz upsert do usuário Clerk na tabela `User` (por `clerkId`) → o logado vira assignee/autor real.

## Modelo de Dados

### Entidades Principais

- **Board**: Agrupamento top-level de colunas
- **Column**: Coluna do kanban com cards
- **Card**: Tarefa/item com título, descrição, prioridade, assignees, labels e comentários
- **User**: Usuário que pode ser assignee ou autor de comentários
- **Label**: Tag para categorizar cards
- **Comment**: Comentário em um card

### Enums

- **Priority**: `ALTA`, `MEDIA`, `BAIXA`

## MCP Server

O servidor MCP está disponível em `POST|GET|DELETE /api/mcp` e protegido por autenticação Bearer.

### Autenticação

```
Authorization: Bearer <MCP_TOKEN>
```

### Ferramentas Disponíveis

| Ferramenta | Descrição |
|-----------|-----------|
| `list_columns` | Lista todas as colunas com seus cards |
| `list_cards` | Lista cards filtrando por coluna, assignee ou prioridade |
| `get_card` | Obtém detalhes completos de um card (com comentários) |
| `create_card` | Cria um novo card em uma coluna |
| `update_card` | Atualiza campos de um card |
| `move_card` | Move um card para outra coluna/posição |
| `add_comment` | Adiciona um comentário a um card |
| `list_users` | Lista todos os usuários |
| `list_labels` | Lista todas as labels |

### Exemplo de Configuração de Cliente MCP

Se você usa uma ferramenta que suporta MCP (como Claude Code), adicione a seguinte configuração ao seu `~/.claude/settings.json` ou arquivo de config MCP:

```json
{
  "mcpServers": {
    "board-kanban": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN" }
    }
  }
}
```

Para deploy em produção:

```json
{
  "mcpServers": {
    "board-kanban": {
      "type": "http",
      "url": "https://<seu-dominio>/api/mcp",
      "headers": { "Authorization": "Bearer SEU_MCP_TOKEN_PRODUCTION" }
    }
  }
}
```

### Exemplos de Uso

#### List columns
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_columns"}}'
```

#### Create card
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer <MCP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"tools/call",
    "params":{
      "name":"create_card",
      "arguments":{
        "columnName":"A Fazer",
        "title":"Nova tarefa",
        "priority":"ALTA"
      }
    }
  }'
```

## Deployment na Vercel

### Pré-requisitos

1. **Database Gerenciado**: Configure um banco PostgreSQL (Vercel Storage, Neon, Railway, etc.)
2. **Environment Variables**: Defina no painel da Vercel

### Passos

1. **Push para GitHub**:
   ```bash
   git push origin main
   ```

2. **Conectar ao Vercel**: [https://vercel.com/new](https://vercel.com/new)

3. **Configurar Environment Variables** no painel da Vercel:
   - `DATABASE_URL`: Sua string de conexão PostgreSQL gerenciada
   - `MCP_TOKEN`: Gere com `openssl rand -hex 24`

4. **Deploy automático**: Vercel detecciona a mudança e deploya automaticamente

5. **Configuração Post-Deploy**:
   - O script `postinstall` executa `prisma generate` automaticamente
   - Você pode executar migrações manualmente via Vercel CLI:
     ```bash
     vercel env pull
     npm run db:migrate
     ```

### Considerações

- A variável `NODE_ENV` é definida como `production` automaticamente pelo Vercel
- Prisma Client é gerado durante o build
- Certifique-se de que a DATABASE_URL aponta para um banco acessível publicamente

## Testes

Execute a suite completa de testes:

```bash
npm test
```

### Cobertura

- ✅ Testes de posicionamento (`src/lib/positions.test.ts`)
- ✅ Testes da camada de domínio (`src/server/cards.test.ts`)
- ✅ Testes de MCP (`src/mcp/server.test.ts`)
- ✅ Testes de REST API (`src/app/api/cards/route.test.ts`)
- ✅ Testes de autenticação MCP (`src/app/api/mcp/route.test.ts`)

Os testes usam **Vitest** com TypeScript suporte integrado.

## Desenvolvimento

### Estrutura de Arquivos

```
board-kanban/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Página principal com UI
│   │   └── api/               # Rotas API (REST + MCP)
│   ├── server/                # Domain layer
│   │   ├── cards.ts           # Lógica compartilhada
│   │   ├── cards.test.ts      # Testes da camada
│   │   └── types.ts           # Tipos de input/output
│   ├── mcp/                   # MCP Server
│   │   ├── server.ts          # Construtor do MCP
│   │   └── server.test.ts     # Testes MCP
│   └── lib/                   # Utilitários
│       ├── db.ts              # Cliente Prisma
│       ├── positions.ts       # Lógica de posicionamento
│       └── positions.test.ts  # Testes de util
├── prisma/
│   ├── schema.prisma          # Definição do schema
│   ├── migrations/            # Histórico de migrações
│   └── seed.ts                # Script de seed
├── docker-compose.yml         # Definição do banco local
├── prisma.config.ts           # Config do Prisma 7
└── package.json               # Dependências e scripts

```

### Adicionar uma Nova Coluna/Campo

1. **Atualizar schema** (`prisma/schema.prisma`)
2. **Criar migração**: `npm run db:migrate`
3. **Atualizar tipos** (`src/server/types.ts`)
4. **Atualizar domain layer** (`src/server/cards.ts`)
5. **Atualizar MCP tools** (`src/mcp/server.ts`)
6. **Atualizar UI** conforme necessário
7. **Atualizar testes** para cobrir o novo comportamento

## Troubleshooting

### Erro: "Coluna não encontrada"

Verifique se o board existe no banco:
```bash
npm run db:seed
```

### Erro: "MCP_TOKEN é obrigatório"

Defina a variável de ambiente:
```bash
export MCP_TOKEN="seu-token"
```

### Erro ao conectar com PostgreSQL

Verifique se o contêiner está rodando:
```bash
docker ps | grep postgres
npm run db:up  # Se não estiver rodando
```

### Build falha em produção

Certifique-se de que `DATABASE_URL` está configurado:
```bash
vercel env ls  # Verificar variáveis
```

## Contribuindo

1. Criar uma branch: `git checkout -b feat/sua-feature`
2. Fazer commits atômicos com mensagens claras
3. Executar testes: `npm test`
4. Executar linter: `npm run lint`
5. Push e abrir um PR

## Licença

MIT

## Contato

Para dúvidas ou problemas, abra uma issue no repositório
