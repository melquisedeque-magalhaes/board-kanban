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

  // Caminho principal: o navegador já subiu o arquivo direto pro Blob
  // (ver ./upload) e só manda os metadados. Assim o arquivo não passa pela
  // função, que na Vercel recusa corpo acima de 4,5 MB (413).
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as {
      url?: unknown; name?: unknown; contentType?: unknown; size?: unknown;
    } | null;
    if (!body || typeof body.url !== "string" || typeof body.name !== "string" || !body.name) {
      return new Response("Anexo inválido", { status: 400 });
    }
    if (!isCardBlobUrl(body.url, id)) return new Response("URL fora do Blob do card", { status: 400 });
    const att = await addAttachment({
      cardId: id,
      url: body.url,
      name: body.name,
      contentType: typeof body.contentType === "string" && body.contentType ? body.contentType : null,
      size: typeof body.size === "number" ? body.size : null,
    });
    return NextResponse.json(att, { status: 201 });
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

// Só aceita arquivo do nosso Blob e na pasta do próprio card.
function isCardBlobUrl(raw: string, cardId: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:"
      && u.hostname.endsWith(".blob.vercel-storage.com")
      && u.pathname.startsWith(`/cards/${cardId}/`)
      && !u.pathname.includes("..");
  } catch {
    return false;
  }
}
