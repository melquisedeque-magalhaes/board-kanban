"use client";
import { useState } from "react";
import NextLink from "next/link";
import {
  Users, Table, Columns3, Funnel, ArrowUpDown, Zap, Search,
  SlidersHorizontal, ChevronDown, X, Check, Link as LinkIcon, Archive, UserPen, ArrowUp, ArrowDown, BarChart3,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { ProfileDialog } from "./ProfileDialog";
import { avatarColor, initials } from "./colors";
import { activeFilterCount, type ViewState, type SortMode } from "./view";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface UserLite { id: string; name: string; avatarUrl?: string | null; }

function UserAvatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return (
    <Avatar className={className ?? "size-[26px] border-2 border-background"} title={name}>
      {url ? <AvatarImage src={url} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="text-[10px] font-semibold text-white" style={{ background: avatarColor(name) }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function Chrome({ view, setView, users, online, onNew, onOpenArchived }: {
  view: ViewState;
  setView: (v: ViewState) => void;
  users: UserLite[];
  online: UserLite[];
  onNew: () => void;
  onOpenArchived: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const fcount = activeFilterCount(view);
  const shown = online.slice(0, 3);
  const extra = online.length - shown.length;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard bloqueado */ }
  }

  return (
    <header className="flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">🤖 Time de IA</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium">Board Time de IA</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {online.length > 0 ? `${online.length} online` : "Ninguém online"}
          </span>
          {shown.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {shown.map((a) => <UserAvatar key={a.id} name={a.name} url={a.avatarUrl} />)}
            </div>
          )}
          {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Users data-icon="inline-start" /> Share</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" className="justify-start" onClick={copyLink}>
                  {copied ? <Check data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
                  {copied ? "Link copiado!" : "Copiar link do board"}
                </Button>
                <div className="px-2 pt-2 text-xs font-medium text-muted-foreground">Membros ({users.length})</div>
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  {users.map((u) => {
                    const isOn = online.some((o) => o.name === u.name);
                    return (
                      <div key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                        <UserAvatar name={u.name} url={u.avatarUrl} className="size-[22px]" />
                        <span className="flex-1 truncate">{u.name}</span>
                        {isOn && <span className="size-2 rounded-full bg-emerald-500" title="online" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button asChild variant="outline" size="sm">
            <NextLink href="/relatorios"><BarChart3 data-icon="inline-start" /> Relatórios</NextLink>
          </Button>
          <ThemeToggle />
          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Action
                label="Editar perfil no board"
                labelIcon={<UserPen className="size-4" />}
                onClick={() => setProfileOpen(true)}
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Title */}
      <div className="flex flex-col gap-1 px-10 pb-1 pt-4">
        <h1 className="text-3xl font-bold tracking-tight">Board Time de IA</h1>
        <p className="text-sm text-muted-foreground">Kanban de tarefas do time de IA</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-10 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground">
            <Table className="size-4" /> Default view
          </span>
          <span className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-sm font-medium">
            <Columns3 className="size-4" /> Kanban
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Filtro */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={fcount ? "secondary" : "ghost"} size="icon" title="Filtrar" className="relative">
                <Funnel />
                {fcount > 0 && (
                  <Badge className="absolute -right-1 -top-1 size-4 justify-center rounded-full p-0 text-[10px]">{fcount}</Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-60 flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
                <Select value={view.priority ?? "all"}
                  onValueChange={(v) => setView({ ...view, priority: (v === "all" ? null : v) as ViewState["priority"] })}>
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="ALTA">Alta</SelectItem>
                      <SelectItem value="MEDIA">Média</SelectItem>
                      <SelectItem value="BAIXA">Baixa</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                <Select value={view.type ?? "all"}
                  onValueChange={(v) => setView({ ...view, type: (v === "all" ? null : v) as ViewState["type"] })}>
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="BUG">Bug</SelectItem>
                      <SelectItem value="FEATURE">Feature</SelectItem>
                      <SelectItem value="TAREFA">Tarefa</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Responsável</span>
                <Select value={view.assignee ?? "all"}
                  onValueChange={(v) => setView({ ...view, assignee: v === "all" ? null : v })}>
                  <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Todos</SelectItem>
                      {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {fcount > 0 && (
                <Button variant="ghost" size="sm" className="justify-start"
                  onClick={() => setView({ ...view, priority: null, type: null, assignee: null })}>
                  <X data-icon="inline-start" /> Limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {/* Ordenar */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={view.sort !== "manual" ? "secondary" : "ghost"} size="icon" title="Ordenar">
                <ArrowUpDown />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-44 flex-col gap-0.5">
              {([["manual", "Manual"], ["priority", "Prioridade"], ["title", "Título"], ["created", "Data de criação"]] as [SortMode, string][])
                .map(([k, label]) => (
                  <Button key={k} variant="ghost" size="sm" className="justify-start"
                    onClick={() => setView({ ...view, sort: k })}>
                    {view.sort === k ? <Check data-icon="inline-start" /> : <span className="size-4" />}
                    {label}
                  </Button>
                ))}
              <div className="my-1 h-px bg-border" />
              <Button
                variant="ghost" size="sm" className="justify-start"
                disabled={view.sort === "manual"}
                onClick={() => setView({ ...view, sortDir: view.sortDir === "asc" ? "desc" : "asc" })}
              >
                {view.sortDir === "asc"
                  ? <><ArrowUp data-icon="inline-start" /> Crescente (A→Z, antigo→novo)</>
                  : <><ArrowDown data-icon="inline-start" /> Decrescente (Z→A, novo→antigo)</>}
              </Button>
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" title="Automações"><Zap /></Button>
          <Button variant="ghost" size="icon" title="Arquivados" onClick={onOpenArchived}><Archive /></Button>

          {/* Busca */}
          {searchOpen ? (
            <Input
              autoFocus className="h-8 w-44" placeholder="Buscar card…"
              value={view.query}
              onChange={(e) => setView({ ...view, query: e.target.value })}
              onBlur={() => { if (!view.query) setSearchOpen(false); }}
              onKeyDown={(e) => { if (e.key === "Escape") { setView({ ...view, query: "" }); setSearchOpen(false); } }}
            />
          ) : (
            <Button variant={view.query ? "secondary" : "ghost"} size="icon" title="Buscar"
              onClick={() => setSearchOpen(true)}>
              <Search />
            </Button>
          )}

          <Button variant="ghost" size="icon" title="Opções"><SlidersHorizontal /></Button>
          <Button size="sm" onClick={onNew} className="bg-[#2383e2] text-white hover:bg-[#1a6fc4]">
            New <ChevronDown data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </header>
  );
}
