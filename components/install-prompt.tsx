"use client";

import * as React from "react";
import Image from "next/image";
import { Download, Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "renomeador-install-prompt";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function alreadyInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean(navigator.standalone))
  );
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS se identifica como Mac, mas Macs não têm multi-toque
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const subscribeNoop = () => () => {};

export function InstallPrompt() {
  const [open, setOpen] = React.useState(false);
  const promptRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const isIOS = React.useSyncExternalStore(
    subscribeNoop,
    isIOSDevice,
    () => false
  );

  React.useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) || alreadyInstalled()) return;

    if (isIOS) {
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setOpen(true);
    };
    const onInstalled = () => {
      localStorage.setItem(STORAGE_KEY, "installed");
      setOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isIOS]);

  const dismiss = React.useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "dismissed");
    setOpen(false);
  }, []);

  const install = React.useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return dismiss();
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    localStorage.setItem(STORAGE_KEY, outcome);
    promptRef.current = null;
    setOpen(false);
  }, [dismiss]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center pt-6 text-center">
          <Image
            src="/icon-192.png"
            alt=""
            width={64}
            height={64}
            className="mb-2 rounded-2xl ring-1 ring-foreground/10"
          />
          <DialogTitle className="text-lg">Instale o aplicativo</DialogTitle>
          <DialogDescription className="text-center text-balance">
            Adicione o Renomeador Inteligente à tela inicial: abre em tela
            cheia, carrega mais rápido e fica a um toque de distância. Seus
            documentos continuam sendo processados só no seu aparelho.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 border-t px-6 pt-4 text-center text-sm text-muted-foreground">
          {isIOS ? (
            <>
              Toque em{" "}
              <span className="font-semibold text-foreground">
                Compartilhar
                <Share className="mx-1 inline size-4 align-text-bottom" />
              </span>
              e depois em{" "}
              <span className="font-semibold text-foreground">
                Adicionar à Tela de Início
                <SquarePlus className="mx-1 inline size-4 align-text-bottom" />
              </span>
            </>
          ) : (
            <>
              Toque em{" "}
              <span className="font-semibold text-foreground">
                Instalar aplicativo
              </span>{" "}
              e confirme na janela do navegador.
            </>
          )}
        </div>
        <DialogFooter>
          {isIOS ? (
            <Button size="lg" onClick={dismiss}>
              Entendi
            </Button>
          ) : (
            <>
              <Button variant="outline" size="lg" onClick={dismiss}>
                Agora não
              </Button>
              <Button size="lg" onClick={install}>
                <Download className="size-4" />
                Instalar aplicativo
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
