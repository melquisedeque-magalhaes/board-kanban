export interface Subscriber {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export function toggleSubscriber(
  users: Subscriber[],
  user: Subscriber,
  checked: boolean,
) {
  if (!checked) return users.filter((item) => item.id !== user.id);
  if (users.some((item) => item.id === user.id)) return users;
  return [...users, user].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
