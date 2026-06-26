"use client";
import { useState } from "react";
import styles from "./board.module.css";

export function CardDialog({ columnId, onClose, onCreated }: {
  columnId: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/cards", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId, title, priority: priority || undefined }),
    });
    setSaving(false); onCreated(); onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12 }}>Novo card</h3>
        <input autoFocus className={styles.input} placeholder="Título"
          value={title} onChange={(e) => setTitle(e.target.value)} />
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
