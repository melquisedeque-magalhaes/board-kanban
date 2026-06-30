"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { avatarColor, initials } from "./colors";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p) { setName(p.name ?? ""); setAvatarUrl(p.avatarUrl ?? null); } })
      .finally(() => setLoading(false));
  }, [open]);

  async function uploadAvatar(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/users/me/avatar", { method: "POST", body: fd });
      if (!res.ok) {
        toast.error(res.status === 503 ? "Configure o Vercel Blob (BLOB_READ_WRITE_TOKEN)" : "Falha no upload");
        return;
      }
      setAvatarUrl((await res.json()).url);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/users/me", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), avatarUrl }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Falha ao salvar perfil"); return; }
    toast.success("Perfil atualizado");
    // Atualiza avatares/nomes em todo o board: server components (membros) + queries vivas.
    qc.invalidateQueries({ queryKey: ["columns"] });
    qc.invalidateQueries({ queryKey: ["presence"] });
    router.refresh();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar perfil</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} className="object-cover" /> : null}
                <AvatarFallback className="text-lg font-semibold text-white" style={{ background: avatarColor(name || "?") }}>
                  {initials(name || "?")}
                </AvatarFallback>
              </Avatar>
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
              />
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Trocar foto
              </Button>
            </div>

            <Field>
              <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
              <Input
                id="profile-name" autoFocus value={name}
                placeholder="Seu nome"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              />
            </Field>

            <p className="text-xs text-muted-foreground">
              Nome e foto exibidos no board (separados da sua conta de login).
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || uploading || !name.trim()}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
