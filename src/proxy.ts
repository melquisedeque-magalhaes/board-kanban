import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Rotas públicas (não exigem sessão Clerk).
// /api/mcp é público DE PROPÓSITO: os agentes do time autenticam por
// `Authorization: Bearer $MCP_TOKEN` no próprio handler, não por sessão Clerk.
const PUBLIC_PATTERNS = ["/sign-in(.*)", "/sign-up(.*)", "/api/mcp(.*)"];

// Helper puro espelhando os padrões públicos — testável sem subir o Clerk.
export function isPublicPath(path: string): boolean {
  return PUBLIC_PATTERNS.some((p) =>
    new RegExp("^" + p.replace(/\(\.\*\)/g, ".*") + "$").test(path),
  );
}

const isPublicRoute = createRouteMatcher(PUBLIC_PATTERNS);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
