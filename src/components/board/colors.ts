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

// Paleta oferecida ao escolher a cor de uma coluna (mesma família dos chips).
export const COLUMN_PALETTE: { label: string; value: string }[] = [
  { label: "Cinza", value: "#e3e2e0" },
  { label: "Azul", value: "#d3e5ef" },
  { label: "Amarelo", value: "#fdecc8" },
  { label: "Vermelho", value: "#ffe2dd" },
  { label: "Rosa", value: "#f5dce8" },
  { label: "Roxo", value: "#e8deee" },
  { label: "Verde", value: "#dbeddb" },
  { label: "Laranja", value: "#fae3d0" },
];

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Luminância relativa (WCAG) — decide se o texto do chip vai claro ou escuro.
function luminance(hex: string): number {
  const lin = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Escurece a própria cor de fundo p/ virar o texto: mantém o matiz do chip
// (mesmo efeito visual da paleta fixa) em vez de jogar um cinza genérico.
function darken(hex: string, amount: number): string {
  const out = channels(hex)
    .map((c) => Math.round(c * (1 - amount)).toString(16).padStart(2, "0"))
    .join("");
  return `#${out}`;
}

// Swatch derivado de uma cor livre (coluna criada pelo usuário).
export function swatchFromColor(color: string): Swatch {
  return luminance(color) < 0.5
    ? { bg: color, text: "#ffffff" }
    : { bg: color, text: darken(color, 0.72) };
}

// Cor do chip da coluna. Precedência: cor salva na coluna → mapa por nome
// (colunas do seed) → cinza default. Assim coluna nova nunca fica sem cor.
export function columnSwatch(name: string, color?: string | null): Swatch {
  if (color && HEX.test(color)) return swatchFromColor(color);
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
  SUBTASK: { label: "Subtask", bg: "#e8e3f7", text: "#4b2e83" },
};

// Bloqueio do card: impedimento (vermelho, trava) vs aviso (âmbar, atenção).
export const BLOCKER: Record<string, Swatch & { label: string; border: string }> = {
  IMPEDIMENTO: { label: "Impedimento", bg: "#ffe2dd", text: "#a3231a", border: "#e5484d" },
  AVISO: { label: "Aviso", bg: "#fdecc8", text: "#9a6c16", border: "#e8a72f" },
  AJUSTES: { label: "Ajustes a Fazer", bg: "#d3e5ef", text: "#183347", border: "#4a90d9" },
};

// Card em operação por um agente: chip + contorno tracejado. Matiz teal para
// não colidir com tipo, prioridade nem bloqueio (ver os mapas acima) — um card
// pode estar marcado E impedido, e as duas marcas precisam se distinguir.
export const BOT: Swatch & { label: string; border: string } = {
  label: "Robô", bg: "#d6f0ee", text: "#14504b", border: "#2fa39b",
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
