"use client";
import { useEffect, useRef, useState } from "react";
import {
  Users, Table, Columns3, Funnel, ArrowUpDown, Zap, Sun, Search,
  SlidersHorizontal, ChevronDown, X, Check, Link as LinkIcon,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { avatarColor, initials } from "./colors";
import { activeFilterCount, type ViewState, type SortMode } from "./view";
import styles from "./chrome.module.css";

export interface UserLite { id: string; name: string; avatarUrl?: string | null; }

function Avatar({ name, url, size = 26 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar externo do Clerk; next/image exigiria remotePatterns
      <img
        src={url} alt={name} title={name}
        className={styles.topAvatar}
        style={{ width: size, height: size, objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      className={styles.topAvatar} title={name}
      style={{ width: size, height: size, background: avatarColor(name), color: "#fff", fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

export function Chrome({ view, setView, users, online, onNew }: {
  view: ViewState;
  setView: (v: ViewState) => void;
  users: UserLite[];
  online: UserLite[];
  onNew: () => void;
}) {
  const [pop, setPop] = useState<"filter" | "sort" | "share" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setPop(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (p: typeof pop) => setPop((cur) => (cur === p ? null : p));
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
    <header className={styles.chrome} ref={ref}>
      <div className={styles.topbar}>
        <div className={styles.crumb}>
          <span className={styles.workspace}>🤖 Time de IA</span>
          <span className={styles.sep}>/</span>
          <span className={styles.doc}>Board Time de IA</span>
        </div>
        <div className={styles.topRight}>
          <span className={styles.edited}>
            {online.length > 0 ? `${online.length} online` : "Ninguém online"}
          </span>
          {shown.length > 0 && (
            <div className={styles.avatarStack}>
              {shown.map((a) => <Avatar key={a.id} name={a.name} url={a.avatarUrl} />)}
            </div>
          )}
          {extra > 0 && <span className={styles.more}>+{extra}</span>}
          <div className={styles.popWrap}>
            <button className={styles.share} onClick={() => toggle("share")}>
              <Users size={14} /> Share
            </button>
            {pop === "share" && (
              <div className={styles.popover}>
                <button className={styles.popAction} onClick={copyLink}>
                  {copied ? <Check size={15} /> : <LinkIcon size={15} />}
                  {copied ? "Link copiado!" : "Copiar link do board"}
                </button>
                <div className={styles.popLabel}>Membros ({users.length})</div>
                <div className={styles.memberList}>
                  {users.map((u) => {
                    const isOn = online.some((o) => o.name === u.name);
                    return (
                      <div key={u.id} className={styles.member}>
                        <Avatar name={u.name} url={u.avatarUrl} size={22} />
                        <span>{u.name}</span>
                        {isOn && <span className={styles.onlineDot} title="online" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <UserButton />
        </div>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Board Time de IA</h1>
        <p className={styles.subtitle}>Kanban de tarefas do time de IA</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <span className={styles.tab}><Table size={15} /> Default view</span>
          <span className={`${styles.tab} ${styles.tabActive}`}><Columns3 size={15} /> Kanban</span>
        </div>
        <div className={styles.toolRight}>
          {/* Filtro */}
          <div className={styles.popWrap}>
            <button
              className={`${styles.iconBtn} ${fcount ? styles.iconActive : ""}`}
              onClick={() => toggle("filter")} title="Filtrar"
            >
              <Funnel size={16} />
              {fcount > 0 && <span className={styles.badge}>{fcount}</span>}
            </button>
            {pop === "filter" && (
              <div className={styles.popover}>
                <div className={styles.popLabel}>Prioridade</div>
                <select className={styles.popSelect} value={view.priority ?? ""}
                  onChange={(e) => setView({ ...view, priority: (e.target.value || null) as ViewState["priority"] })}>
                  <option value="">Todas</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Média</option>
                  <option value="BAIXA">Baixa</option>
                </select>
                <div className={styles.popLabel}>Responsável</div>
                <select className={styles.popSelect} value={view.assignee ?? ""}
                  onChange={(e) => setView({ ...view, assignee: e.target.value || null })}>
                  <option value="">Todos</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                {fcount > 0 && (
                  <button className={styles.popAction}
                    onClick={() => setView({ ...view, priority: null, assignee: null })}>
                    <X size={14} /> Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Ordenar */}
          <div className={styles.popWrap}>
            <button
              className={`${styles.iconBtn} ${view.sort !== "manual" ? styles.iconActive : ""}`}
              onClick={() => toggle("sort")} title="Ordenar"
            >
              <ArrowUpDown size={16} />
            </button>
            {pop === "sort" && (
              <div className={styles.popover}>
                {([["manual", "Manual"], ["priority", "Prioridade"], ["title", "Título (A–Z)"]] as [SortMode, string][])
                  .map(([k, label]) => (
                    <button key={k} className={styles.popAction}
                      onClick={() => { setView({ ...view, sort: k }); setPop(null); }}>
                      {view.sort === k ? <Check size={15} /> : <span style={{ width: 15 }} />}
                      {label}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <Zap size={16} className={styles.toolIcon} />
          <Sun size={16} className={styles.toolIcon} />

          {/* Busca */}
          <div className={styles.searchWrap}>
            {searchOpen ? (
              <input
                autoFocus className={styles.searchInput} placeholder="Buscar card…"
                value={view.query}
                onChange={(e) => setView({ ...view, query: e.target.value })}
                onBlur={() => { if (!view.query) setSearchOpen(false); }}
                onKeyDown={(e) => { if (e.key === "Escape") { setView({ ...view, query: "" }); setSearchOpen(false); } }}
              />
            ) : (
              <button className={`${styles.iconBtn} ${view.query ? styles.iconActive : ""}`}
                onClick={() => setSearchOpen(true)} title="Buscar">
                <Search size={16} />
              </button>
            )}
          </div>

          <SlidersHorizontal size={16} className={styles.toolIcon} />
          <button className={styles.newBtn} onClick={onNew}>
            New <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
