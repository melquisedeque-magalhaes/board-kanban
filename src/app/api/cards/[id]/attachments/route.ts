import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { addAttachment, listAttachments } from "@/server/cards";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;
  return NextResponse.json(await listAttachments(id));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const unauth = await requireUser();
  if (unauth) return unauth;
  const { id } = await ctx.params;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "blob_not_configured", message: "BLOB_READ_WRITE_TOKEN ausente. Conecte um Blob store no Vercel." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("Arquivo ausente", { status: 400 });

  const blob = await put(`cards/${id}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });

  const att = await addAttachment({
    cardId: id,
    url: blob.url,
    name: file.name,
    contentType: file.type || null,
    size: file.size || null,
  });
  return NextResponse.json(att, { status: 201 });
}
