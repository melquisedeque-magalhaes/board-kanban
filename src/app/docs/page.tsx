"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, ArrowLeft, Terminal, FileJson, KeyRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const TOOLS: [string, string][] = [
  ["list_columns", "Lista as colunas do board com seus cards."],
  ["list_cards", "Lista cards filtrando por coluna, responsável ou prioridade."],
  ["get_card", "Detalha um card específico (com comentários)."],
  ["create_card", "Cria um card numa coluna."],
  ["update_card", "Edita título, descrição, prioridade, código, responsáveis e labels."],
  ["move_card", "Move um card entre colunas e/ou reordena."],
  ["add_comment", "Adiciona um comentário a um card."],
  ["list_users", "Lista os usuários do board."],
  ["list_labels", "Lista as labels disponíveis."],
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard bloqueado */ }
  }
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        variant="outline" size="icon"
        className="absolute right-2 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={copy} title="Copiar"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DocsPage() {
  const [origin, setOrigin] = useState("https://seu-deploy.vercel.app");
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const mcpUrl = `${origin}/api/mcp`;
  const cliCmd = `claude mcp add --transport http board-kanban ${mcpUrl} \\
  --header "Authorization: Bearer SEU_MCP_TOKEN"`;
  const jsonCfg = `{
  "mcpServers": {
    "board-kanban": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer SEU_MCP_TOKEN"
      }
    }
  }
}`;
  const curlCmd = `curl -s -X POST ${mcpUrl} \\
  -H "Authorization: Bearer SEU_MCP_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-3">
        <Link href="/" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar ao board
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Conectar o MCP</h1>
        <p className="text-muted-foreground">
          O <strong>Board Time de IA</strong> expõe um servidor <strong>MCP</strong> (Model Context Protocol)
          remoto. Conecte um agente (Claude Code, Cursor, Claude Desktop…) e deixe ele ler e
          escrever cards do board direto, em linguagem natural.
        </p>
      </header>

      <Section icon={<KeyRound className="size-5" />} title="1. Pegue o token">
        <p className="text-sm text-muted-foreground">
          O endpoint é protegido por <strong>Bearer token</strong> (variável <code className="rounded bg-muted px-1.5 py-0.5 text-xs">MCP_TOKEN</code>).
          Pegue o valor com quem administra o deploy. Sem ele, o servidor responde <code className="rounded bg-muted px-1.5 py-0.5 text-xs">401</code>.
        </p>
        <p className="text-sm text-muted-foreground">Endpoint:</p>
        <CodeBlock code={mcpUrl} />
      </Section>

      <Section icon={<Terminal className="size-5" />} title="2a. Claude Code (CLI)">
        <p className="text-sm text-muted-foreground">Um comando — troque <code className="rounded bg-muted px-1.5 py-0.5 text-xs">SEU_MCP_TOKEN</code>:</p>
        <CodeBlock code={cliCmd} />
      </Section>

      <Section icon={<FileJson className="size-5" />} title="2b. Cursor / Claude Desktop (JSON)">
        <p className="text-sm text-muted-foreground">
          Adicione ao seu arquivo de config de MCP (ex.: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">~/.cursor/mcp.json</code> ou o config do Claude Desktop):
        </p>
        <CodeBlock code={jsonCfg} />
      </Section>

      <Section icon={<Wrench className="size-5" />} title="3. Teste rápido (curl)">
        <p className="text-sm text-muted-foreground">Lista as ferramentas disponíveis:</p>
        <CodeBlock code={curlCmd} />
      </Section>

      <Section icon={<Wrench className="size-5" />} title="Ferramentas disponíveis">
        <div className="overflow-hidden rounded-lg border">
          {TOOLS.map(([name, desc], i) => (
            <div
              key={name}
              className={`flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${i % 2 ? "bg-muted/30" : ""}`}
            >
              <code className="shrink-0 font-mono text-sm font-medium text-foreground sm:w-40">{name}</code>
              <span className="text-sm text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Coluna e responsável podem ser referenciados por <strong>nome ou id</strong> — o servidor resolve.
        </p>
      </Section>
    </main>
  );
}
