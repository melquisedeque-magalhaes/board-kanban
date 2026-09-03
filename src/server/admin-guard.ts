import { auth } from "@clerk/nextjs/server";

export async function requireAdmin(): Promise<Response | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const configured = (process.env.TRIGGERS_ADMIN_CLERK_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const metadata = (sessionClaims?.metadata ?? {}) as { role?: string };
  if (!configured.includes(userId) && !["admin", "owner"].includes(metadata.role ?? "")) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
