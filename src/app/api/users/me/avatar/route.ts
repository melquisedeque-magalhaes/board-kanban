import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "blob_not_configured", message: "BLOB_READ_WRITE_TOKEN ausente. Conecte um Blob store no Vercel." },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("Arquivo ausente", { status: 400 });
  if (!file.type.startsWith("image/")) return new Response("Envie uma imagem", { status: 400 });

  const blob = await put(`avatars/${userId}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return NextResponse.json({ url: blob.url }, { status: 201 });
}
