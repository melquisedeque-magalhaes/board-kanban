"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchNotificationPage,
  fetchNotificationVersion,
  markAllNotificationsRead,
  newItemsSince,
  notificationBadge,
  playNotificationChime,
  setNotificationRead,
  shouldPlayNotificationSound,
  type NotificationItem,
  type NotificationVersion,
} from "./notification-client";

const relativeTime = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatRelativeTime(createdAt: string) {
  const deltaSeconds = (new Date(createdAt).getTime() - Date.now()) / 1_000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  if (absoluteSeconds < 60) return relativeTime.format(Math.round(deltaSeconds), "second");
  if (absoluteSeconds < 3_600) return relativeTime.format(Math.round(deltaSeconds / 60), "minute");
  if (absoluteSeconds < 86_400) return relativeTime.format(Math.round(deltaSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000) return relativeTime.format(Math.round(deltaSeconds / 86_400), "day");
  return relativeTime.format(Math.round(deltaSeconds / 2_592_000), "month");
}

export function NotificationCenter({
  openCardId,
  onOpenCard,
}: {
  openCardId: string | null;
  onOpenCard: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const previousVersion = useRef<NotificationVersion | null>(null);

  const { data: version } = useQuery({
    queryKey: ["notification-version"],
    queryFn: fetchNotificationVersion,
    refetchInterval: 3_000,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) => fetchNotificationPage({ pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open,
  });

  useEffect(() => {
    if (!version) return;
    const previous = previousVersion.current;
    previousVersion.current = version;
    if (!previous) return;

    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (version.totalCount <= previous.totalCount) return;

    void fetchNotificationPage({ pageParam: undefined })
      .then((page) => {
        const fresh = newItemsSince(page.items, previous.latestId);
        if (shouldPlayNotificationSound(fresh, openCardId, document.hasFocus())) {
          void playNotificationChime();
        }
      })
      .catch(() => undefined);
  }, [version, openCardId, queryClient]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const badge = notificationBadge(version?.unreadCount ?? 0);

  async function invalidateNotificationQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notification-version"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  }

  async function handleOpenNotification(item: NotificationItem) {
    try {
      if (!item.readAt) await setNotificationRead(item.id, true);
    } catch {
      // A navegação continua disponível se a atualização de leitura falhar.
    } finally {
      setOpen(false);
      onOpenCard(item.cardId);
      await invalidateNotificationQueries();
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } catch {
      // O próximo polling mantém a central sincronizada mesmo após falha transitória.
    } finally {
      await invalidateNotificationQueries();
      setMarkingAll(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          title="Notificações"
          aria-label={badge ? `Notificações, ${badge} não lidas` : "Notificações"}
        >
          <Bell />
          {badge && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="font-semibold">Notificações</span>
          <Button
            variant="ghost"
            size="xs"
            disabled={markingAll || (version?.unreadCount ?? 0) === 0}
            onClick={() => void handleMarkAllRead()}
          >
            Marcar todas como lidas
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto p-1.5">
          {isPending ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent ${
                    item.readAt == null ? "bg-accent/50" : ""
                  }`}
                  onClick={() => void handleOpenNotification(item)}
                >
                  <span className="block text-sm leading-snug">{item.message}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {item.actor?.name && <span className="truncate">{item.actor.name}</span>}
                    {item.actor?.name && <span aria-hidden="true">·</span>}
                    <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {hasNextPage && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
