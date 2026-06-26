import { auth } from "@clerk/nextjs/server";

// Defesa em profundidade nas rotas REST: 401 sem sessão Clerk.
// (O proxy/middleware já protege, mas o guard garante mesmo se o matcher mudar.)
// NÃO usar em /api/mcp — esse autentica por Bearer token, não por sessão.
export async function requireUser(): Promise<Response | null> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  return null;
}
