"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Porteiro do app: quando o servidor tem APP_PASSWORD configurada e este
// navegador ainda não tem sessão válida, pede a senha de acesso uma vez.
// O cookie de sessão (HttpOnly) fica válido por 30 dias.
//
// O diálogo pode ser fechado sem senha: as ferramentas locais (análise no
// navegador) continuam funcionando — só as chamadas à IA respondem 401.
export function AuthGate() {
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((status) => {
        if (!cancelled && status.authRequired && !status.authenticated) {
          setOpen(true);
        }
      })
      .catch(() => {
        // sem rede/servidor não há o que autenticar — o app segue no modo local
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Falha no acesso (HTTP ${res.status}).`);
        return;
      }
      setOpen(false);
    } catch {
      setError("Não foi possível verificar a senha — confira a conexão.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader className="items-center pt-6 text-center">
            <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-muted ring-1 ring-foreground/10">
              <Lock className="size-6" />
            </div>
            <DialogTitle className="text-lg">Senha de acesso</DialogTitle>
            <DialogDescription className="text-center text-balance">
              A análise com IA é restrita à equipe. Informe a senha de acesso
              para liberar este navegador — as ferramentas locais funcionam
              mesmo sem ela.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="senha-acesso">Senha</Label>
            <Input
              id="senha-acesso"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setOpen(false)}
            >
              Usar só o modo local
            </Button>
            <Button type="submit" size="lg" disabled={!password || sending}>
              {sending && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
