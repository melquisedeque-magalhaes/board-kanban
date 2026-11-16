import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/server/auth-guard";

export const dynamic = "force-dynamic";

// Gera o token para o navegador subir o anexo direto no Vercel Blob.
// O arquivo não passa por aqui: a função da Vercel recusa corpo acima de
// 4,5 MB. O registro do anexo é feito depois pelo POST ../attachments (JSON).
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

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`cards/${id}/`) || pathname.includes("..")) {
          throw new Error("Caminho fora do card");
        }
        return { addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
