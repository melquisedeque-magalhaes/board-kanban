import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({ user: { upsert: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: dbMock }));
const currentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ currentUser: () => currentUserMock() }));

import { syncCurrentUser } from "./users";

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.user.findUnique.mockResolvedValue(null); // usuário ainda não existe por padrão
});

describe("syncCurrentUser", () => {
  it("retorna null se não há usuário logado", async () => {
    currentUserMock.mockResolvedValue(null);
    expect(await syncCurrentUser()).toBeNull();
    expect(dbMock.user.upsert).not.toHaveBeenCalled();
  });

  it("faz upsert por clerkId com nome/email/avatar", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_123",
      firstName: "Melqui",
      lastName: "Sodré",
      imageUrl: "http://img/a.png",
      primaryEmailAddress: { emailAddress: "m@brq.com" },
    });
    dbMock.user.upsert.mockResolvedValue({ id: "u1" });
    const r = await syncCurrentUser();
    expect(r).toEqual({ id: "u1" });
    const arg = dbMock.user.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ clerkId: "clerk_123" });
    expect(arg.create).toMatchObject({ clerkId: "clerk_123", name: "Melqui Sodré", email: "m@brq.com", avatarUrl: "http://img/a.png" });
    expect(arg.update).toMatchObject({ name: "Melqui Sodré", email: "m@brq.com", avatarUrl: "http://img/a.png" });
  });

  it("cai pro local-part do email quando não há firstName/lastName (magic-link)", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_x", imageUrl: "", primaryEmailAddress: { emailAddress: "ubirajarapelli@brq.com" },
    });
    dbMock.user.upsert.mockResolvedValue({ id: "u2" });
    await syncCurrentUser();
    expect(dbMock.user.upsert.mock.calls[0][0].create.name).toBe("ubirajarapelli");
  });

  it("não há nome nem email → 'Usuário' (nunca o clerkId)", async () => {
    currentUserMock.mockResolvedValue({ id: "clerk_y", imageUrl: "", primaryEmailAddress: null });
    dbMock.user.upsert.mockResolvedValue({ id: "u3" });
    await syncCurrentUser();
    expect(dbMock.user.upsert.mock.calls[0][0].create.name).toBe("Usuário");
  });

  it("não sobrescreve name/avatar se profileCustomized (só email)", async () => {
    currentUserMock.mockResolvedValue({
      id: "clerk_z", firstName: "Clerk", lastName: "Name",
      imageUrl: "http://img/clerk.png", primaryEmailAddress: { emailAddress: "z@brq.com" },
    });
    dbMock.user.findUnique.mockResolvedValue({ profileCustomized: true });
    dbMock.user.upsert.mockResolvedValue({ id: "u4" });
    await syncCurrentUser();
    const arg = dbMock.user.upsert.mock.calls[0][0];
    expect(arg.update).toEqual({ email: "z@brq.com" });
  });
});
