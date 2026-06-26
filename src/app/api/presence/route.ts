import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { requireUser } from "@/server/auth-guard";
import { touch, online } from "@/server/presence";

export const dynamic = "force-dynamic";

// POST = heartbeat: registra o logado e devolve quem está online agora.
export async function POST() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const u = await currentUser();
  if (u) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.id;
    touch({ id: u.id, name, avatarUrl: u.imageUrl || null }, Date.now());
  }
  return NextResponse.json({ online: online(Date.now()), me: u?.id ?? null });
}

// GET = só lê (sem marcar presença).
export async function GET() {
  const unauth = await requireUser();
  if (unauth) return unauth;
  return NextResponse.json({ online: online(Date.now()) });
}
