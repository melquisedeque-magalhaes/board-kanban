"use client";
import { useState } from "react";
import { X } from "lucide-react";
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
        <div className={styles.dialogHead}>
          <h3 className={styles.dialogTitle}>Novo card</h3>
          <button className={styles.dialogClose} onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Título</span>
          <input autoFocus className={styles.input} placeholder="Ex.: Corrigir bug do login"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Coluna</span>
          <select className={styles.input} value={columnId} onChange={(e) => setColumnId(e.target.value)}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Prioridade</span>
          <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Sem prioridade</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </label>

        <div className={styles.dialogFooter}>
          <button className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          <button className={styles.btnPrimary} onClick={save} disabled={saving}>
            {saving ? "Criando…" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
