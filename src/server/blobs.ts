import { del } from "@vercel/blob";

// Remove do Vercel Blob os arquivos que ficaram órfãos depois de apagar card,
// comentário ou anexo. Best-effort de propósito: o registro no banco já foi,
// e falha aqui (arquivo já removido, URL externa, token ausente) não deve
// derrubar a operação que o usuário pediu.
export async function purgeBlobs(urls: string[]): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const blobs = urls.filter((u) => u.includes("blob.vercel-storage.com"));
  if (!blobs.length) return;
  try {
    await del(blobs);
  } catch {
    /* já removidos ou fora do nosso Blob */
  }
}
