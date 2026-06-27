"use client";
import PusherClient from "pusher-js";

// Constantes do canal (espelham o pusher-server). Mantidas aqui sem deps de server.
export const BOARD_CHANNEL = "board";
export const BOARD_CHANGED = "changed";

const KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

let client: PusherClient | null = null;

// Retorna o client Pusher do browser, ou null se as env públicas não existirem
// (aí o app cai no polling do React Query, sem quebrar).
export function getPusherClient(): PusherClient | null {
  if (!KEY || !CLUSTER) return null;
  if (!client) client = new PusherClient(KEY, { cluster: CLUSTER });
  return client;
}
