"use client";
import { useState } from "react";
import type { ColumnData } from "./Column";
import styles from "./board.module.css";

export function CardDialog({ columns, initialColumnId, onClose, onCreated }: {
  columns: ColumnData[];
  initialColumnId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [columnId, setColumnId] = useState(initialColumnId);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId, title, priority: priority || undefined }),
    });
    setSaving(false);
    if (!res.ok) { alert("Falha ao criar card"); return; }
    onCreated(); onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Novo card</h3>
        <input autoFocus className={styles.input} placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <select className={styles.input} value={columnId} onChange={(e) => setColumnId(e.target.value)}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Sem prioridade</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={save} disabled={saving}>Criar</button>
        </div>
      </div>
    </div>
  );
}
