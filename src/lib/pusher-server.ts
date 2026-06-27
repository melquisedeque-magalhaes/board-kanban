import Pusher from "pusher";

// Cliente Pusher do servidor — só ativa se as env vars existirem.
// Sem chaves: broadcastBoardChanged() é no-op (cai no polling do React Query).
const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;

let pusher: Pusher | null = null;
if (PUSHER_APP_ID && PUSHER_KEY && PUSHER_SECRET && PUSHER_CLUSTER) {
  pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
}

export const BOARD_CHANNEL = "board";
export const BOARD_CHANGED = "changed";

// Avisa todos os clientes que o board mudou (criar/mover/editar/comentar/excluir).
export async function broadcastBoardChanged(): Promise<void> {
  if (!pusher) return;
  try {
    await pusher.trigger(BOARD_CHANNEL, BOARD_CHANGED, { at: Date.now() });
  } catch {
    /* falha de broadcast não pode quebrar a mutação */
  }
}
