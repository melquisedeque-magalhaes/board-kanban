"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { avatarColor, initials } from "./colors";
import { toggleSubscriber, type Subscriber } from "./column-subscribers";
import { useState } from "react";

async function fetchSubscribers(columnId: string): Promise<Subscriber[]> {
  const response = await fetch(`/api/columns/${encodeURIComponent(columnId)}/subscribers`);
  if (!response.ok) throw new Error("Falha ao carregar inscritos");
  const subscribers = await response.json() as Subscriber[];
  return subscribers.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function updateSubscriber(
  columnId: string,
  userId: string,
  checked: boolean,
) {
  const response = await fetch(
    `/api/columns/${encodeURIComponent(columnId)}/subscribers/${encodeURIComponent(userId)}`,
    { method: checked ? "POST" : "DELETE" },
  );
  if (!response.ok) throw new Error("Falha ao atualizar inscritos");
}

export function ColumnSubscribersPopover({
  columnId,
  users,
  initialCount,
}: {
  columnId: string;
  users: Subscriber[];
  initialCount: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ["column-subscribers", columnId] as const;
  const { data: subscribers, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => fetchSubscribers(columnId),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: ({ user, checked }: { user: Subscriber; checked: boolean }) =>
      updateSubscriber(columnId, user.id, checked),
    onMutate: async ({ user, checked }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Subscriber[]>(queryKey);
      queryClient.setQueryData<Subscriber[]>(
        queryKey,
        (current = []) => toggleSubscriber(current, user, checked),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous === undefined) {
        queryClient.removeQueries({ queryKey, exact: true });
      } else {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error("Falha ao atualizar inscritos");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["columns"] }),
      ]);
    },
  });

  const subscribedIds = new Set(subscribers?.map((subscriber) => subscriber.id));
  const count = subscribers?.length ?? initialCount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto px-1.5"
          title="Gerenciar inscritos"
          aria-label={count > 0 ? `Gerenciar inscritos, ${count} inscritos` : "Gerenciar inscritos"}
        >
          <Bell />
          {count > 0 && <span className="text-[11px] tabular-nums">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-1 p-1.5">
        <div className="px-2 py-1.5 text-sm font-semibold">Inscritos na coluna</div>
        {isPending ? (
          <p className="px-2 py-5 text-center text-xs text-muted-foreground">Carregando…</p>
        ) : isError ? (
          <p className="px-2 py-5 text-center text-xs text-destructive">Falha ao carregar inscritos</p>
        ) : (
          <div className="flex max-h-72 flex-col overflow-y-auto">
            {users.map((user) => {
              const checked = subscribedIds.has(user.id);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Avatar className="size-6">
                    {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
                    <AvatarFallback
                      className="text-[9px] font-semibold text-white"
                      style={{ background: avatarColor(user.name) }}
                    >
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    disabled={mutation.isPending}
                    onChange={(event) => mutation.mutate({ user, checked: event.target.checked })}
                    aria-label={`Inscrever ${user.name}`}
                  />
                </label>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
