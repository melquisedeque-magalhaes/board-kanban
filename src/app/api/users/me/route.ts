import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProfileByClerkId, updateProfileByClerkId } from "@/server/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const profile = await getProfileByClerkId(userId);
  if (!profile) return new Response("Not found", { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name : undefined;
  const avatarUrl =
    body.avatarUrl === null || typeof body.avatarUrl === "string" ? body.avatarUrl : undefined;
  if ((name === undefined || !name.trim()) && avatarUrl === undefined) {
    return new Response("Nada para atualizar", { status: 400 });
  }
  return NextResponse.json(await updateProfileByClerkId(userId, { name, avatarUrl }));
}
