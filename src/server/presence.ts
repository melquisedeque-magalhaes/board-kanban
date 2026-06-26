// Presença online — store em memória (por instância). Suficiente pra um time
// pequeno; em serverless cada instância tem seu mapa, então é "melhor esforço".
// v1 sem Redis: heartbeat a cada ~20s, janela de 45s pra considerar online.

export interface Presence {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeen: number;
}

const ONLINE_WINDOW_MS = 45_000;
const store = new Map<string, Presence>();

export function touch(u: { id: string; name: string; avatarUrl: string | null }, now: number): void {
  store.set(u.id, { ...u, lastSeen: now });
}

export function online(now: number): Omit<Presence, "lastSeen">[] {
  const out: Omit<Presence, "lastSeen">[] = [];
  for (const [id, p] of store) {
    if (now - p.lastSeen > ONLINE_WINDOW_MS) { store.delete(id); continue; }
    out.push({ id: p.id, name: p.name, avatarUrl: p.avatarUrl });
  }
  return out;
}
