export type NotificationItem = {
  id: string;
  sequence: string;
  cardId: string;
  type:
    | "COMMENT_ADDED"
    | "CARD_READY_FOR_TEST"
    | "CARD_ENTERED_COLUMN"
    | "BLOCKER_ADDED"
    | "BLOCKER_REMOVED"
    | "BLOCKER_CHANGED";
  message: string;
  readAt: string | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
};

export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
};

export type NotificationVersion = {
  version: string;
  unreadCount: number;
  totalCount: number;
  latestId: string | null;
  latestCreatedAt: string | null;
  latestSequence: string | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("notifications");
  return response.json() as Promise<T>;
}

export async function fetchNotificationPage({
  pageParam,
}: {
  pageParam?: string;
}): Promise<NotificationPage> {
  const cursor = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : "";
  return responseJson<NotificationPage>(await fetch(`/api/notifications${cursor}`));
}

export async function fetchNotificationVersion(): Promise<NotificationVersion> {
  return responseJson<NotificationVersion>(await fetch("/api/notifications/version"));
}

export async function setNotificationRead(id: string, read: boolean): Promise<{ ok: true }> {
  return responseJson<{ ok: true }>(await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ read }),
  }));
}

export async function markAllNotificationsRead(): Promise<{ ok: true }> {
  return responseJson<{ ok: true }>(await fetch("/api/notifications/read-all", { method: "POST" }));
}

export const notificationBadge = (count: number) => (
  count <= 0 ? null : count > 99 ? "99+" : String(count)
);

export function newItemsSince(items: NotificationItem[], latestId: string | null) {
  if (!latestId) return items;
  const index = items.findIndex((item) => item.id === latestId);
  return index === -1 ? items : items.slice(0, index);
}

export function shouldPlayNotificationSound(
  items: NotificationItem[],
  openCardId: string | null,
  focused: boolean,
) {
  if (!items.length) return false;
  return !(focused && openCardId && items.every((item) => item.cardId === openCardId));
}

export function createNotificationBatchCoordinator() {
  type BatchResult = { changed: boolean; fresh: NotificationItem[] };

  const noChange = (): BatchResult => ({ changed: false, fresh: [] });
  const sequenceFromVersion = (version: NotificationVersion) => (
    version.latestSequence == null ? null : BigInt(version.latestSequence)
  );
  const newestSequence = (current: bigint | null, candidate: bigint | null) => (
    candidate != null && (current == null || candidate > current) ? candidate : current
  );
  const freshAfter = (items: NotificationItem[], sequence: bigint | null) => (
    sequence == null ? items : items.filter((item) => BigInt(item.sequence) > sequence)
  );

  let confirmedVersion: NotificationVersion | null = null;
  let creationWatermark: bigint | null = null;
  let newestRequest = 0;
  const pendingVersions = new Map<string, number>();

  return {
    async process(
      version: NotificationVersion,
      loadPage: () => Promise<NotificationPage>,
    ): Promise<BatchResult> {
      if (!confirmedVersion) {
        confirmedVersion = version;
        creationWatermark = sequenceFromVersion(version);
        return noChange();
      }
      if (version.version === confirmedVersion.version) {
        if (pendingVersions.size) {
          newestRequest += 1;
          pendingVersions.clear();
        }
        return noChange();
      }
      if (pendingVersions.has(version.version)) {
        return noChange();
      }

      const latest = sequenceFromVersion(version);
      const hasCreation = Boolean(
        latest != null && (creationWatermark == null || latest > creationWatermark),
      );

      if (!hasCreation) {
        newestRequest += 1;
        pendingVersions.clear();
        confirmedVersion = version;
        return { changed: true, fresh: [] };
      }

      const request = ++newestRequest;
      pendingVersions.clear();
      pendingVersions.set(version.version, request);
      try {
        const page = await loadPage();
        if (request !== newestRequest) return noChange();

        const fresh = freshAfter(page.items, creationWatermark);
        confirmedVersion = version;
        creationWatermark = newestSequence(creationWatermark, sequenceFromVersion(version));
        creationWatermark = page.items.reduce(
          (watermark, item) => newestSequence(watermark, BigInt(item.sequence)),
          creationWatermark,
        );
        return { changed: true, fresh };
      } finally {
        if (pendingVersions.get(version.version) === request) {
          pendingVersions.delete(version.version);
        }
      }
    },
  };
}

export async function playNotificationChime() {
  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  let context: AudioContext | undefined;
  try {
    context = new AudioContextCtor();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.setValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    oscillator.addEventListener(
      "ended",
      () => void context?.close().catch(() => undefined),
      { once: true },
    );
  } catch {
    await context?.close().catch(() => undefined);
  }
}
