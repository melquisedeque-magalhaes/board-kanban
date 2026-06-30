import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

// Nome de exibição a partir do Clerk. Magic-link costuma não ter first/last name
// → cai pra username, depois local-part do email; NUNCA usa o clerkId (vira "user_<hash>").
export function displayName(u: ClerkUser): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  if (full) return full;
  if (u.username) return u.username;
  const email = u.primaryEmailAddress?.emailAddress;
  if (email) return email.split("@")[0];
  return "Usuário";
}

// Sync lazy: materializa o usuário Clerk logado na tabela User do board (por clerkId).
// Se o usuário já editou o perfil no board (profileCustomized), não sobrescreve
// name/avatar com os dados do Clerk — só mantém o email em dia (identidade).
export async function syncCurrentUser(): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
  const u = await currentUser();
  if (!u) return null;
  const name = displayName(u);
  const email = u.primaryEmailAddress?.emailAddress;
  const avatarUrl = u.imageUrl || null;
  const existing = await db.user.findUnique({
    where: { clerkId: u.id },
    select: { profileCustomized: true },
  });
  return db.user.upsert({
    where: { clerkId: u.id },
    create: { clerkId: u.id, name, email, avatarUrl },
    update: existing?.profileCustomized ? { email } : { name, email, avatarUrl },
    select: { id: true, name: true, avatarUrl: true },
  });
}

export function getProfileByClerkId(clerkId: string) {
  return db.user.findUnique({
    where: { clerkId },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
}

// Edição manual do perfil no board → marca profileCustomized pra não ser
// sobrescrito pelo resync do Clerk no próximo load.
export async function updateProfileByClerkId(
  clerkId: string,
  input: { name?: string; avatarUrl?: string | null },
) {
  const data: { name?: string; avatarUrl?: string | null; profileCustomized: boolean } = {
    profileCustomized: true,
  };
  if (input.name !== undefined && input.name.trim()) data.name = input.name.trim();
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  return db.user.update({
    where: { clerkId },
    data,
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
}
