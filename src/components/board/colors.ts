// Paleta estilo Notion — chips de coluna, prioridade e avatares.

export interface Swatch {
  bg: string;
  text: string;
}

const DEFAULT_COLUMN: Swatch = { bg: "#e3e2e0", text: "#5f5e5b" };

// Cor do chip por nome de coluna (status). Fallback cinza.
const COLUMN_COLORS: Record<string, Swatch> = {
  "A Fazer": { bg: "#e3e2e0", text: "#5f5e5b" },
  "Em Andamento": { bg: "#d3e5ef", text: "#183347" },
  "Aguardando Teste": { bg: "#fdecc8", text: "#5c4413" },
  Teste: { bg: "#ffe2dd", text: "#5d2117" },
  "Aguardando Deploy": { bg: "#f5dce8", text: "#4c2238" },
  Done: { bg: "#e8deee", text: "#492f64" },
  Concluído: { bg: "#dbeddb", text: "#1c3829" },
  Cancelado: { bg: "#ffe2dd", text: "#5d2117" },
};

export function columnSwatch(name: string): Swatch {
  return COLUMN_COLORS[name] ?? DEFAULT_COLUMN;
}

export const PRIORITY: Record<string, Swatch & { label: string }> = {
  CRITICA: { label: "Crítica", bg: "#e5484d", text: "#ffffff" },
  ALTA: { label: "Alta", bg: "#ffe0db", text: "#b4453a" },
  MEDIA: { label: "Média", bg: "#fdecc8", text: "#9a6c16" },
  BAIXA: { label: "Baixa", bg: "#e3e2e0", text: "#5f5e5b" },
};

export const CARD_TYPE: Record<string, Swatch & { label: string }> = {
  BUG: { label: "Bug", bg: "#ffe2dd", text: "#5d2117" },
  FEATURE: { label: "Feature", bg: "#d3e5ef", text: "#183347" },
  TAREFA: { label: "Tarefa", bg: "#dbeddb", text: "#1c3829" },
};

// Cor do avatar derivada do nome (estável).
const AVATAR_PALETTE = [
  "#6b7cff", "#3aa675", "#e07a5f", "#5b8def",
  "#cdb4f6", "#8d6e63", "#d98c3f", "#4aa3b0",
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
