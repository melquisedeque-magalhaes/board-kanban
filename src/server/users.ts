import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

// Sync lazy: materializa o usuário Clerk logado na tabela User do board
// (por clerkId). Chamado no load do board → o logado vira assignee/autor real.
export async function syncCurrentUser(): Promise<{ id: string; name: string; avatarUrl: string | null } | null> {
  const u = await currentUser();
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
  const email = u.primaryEmailAddress?.emailAddress;
  const avatarUrl = u.imageUrl || null;
  return db.user.upsert({
    where: { clerkId: u.id },
    create: { clerkId: u.id, name, email, avatarUrl },
    update: { name, email, avatarUrl },
    select: { id: true, name: true, avatarUrl: true },
  });
}
