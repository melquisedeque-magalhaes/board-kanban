import { auth } from "@clerk/nextjs/server";

export async function requireAuthenticated(): Promise<Response | null> {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  return null;
}
