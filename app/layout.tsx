import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { Suspense } from "react";

import { InstallPrompt } from "@/components/install-prompt";
import { NavigationProgress } from "@/components/navigation-progress";
import { Toaster } from "@/components/ui/sonner";
import { EH_SUCESSORISTA, IDENTIDADE } from "@/lib/app";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Título e descrição vêm da plataforma DESTE deploy (lib/app.ts): o mesmo
// repositório publica dois sites, e cada um se apresenta com o próprio nome.
export const metadata: Metadata = {
  title: IDENTIDADE.nome,
  description: IDENTIDADE.descricao,
  appleWebApp: {
    capable: true,
    title: IDENTIDADE.nomeCurto,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // A cor da moldura do navegador acompanha o site: o Sucessorista abre no
  // papel da identidade (mesma cor do manifest), o Renomeador no branco.
  themeColor: EH_SUCESSORISTA ? "#f6f4ee" : "#ffffff",
  // PWA no celular: a área útil vai até o fim da tela (safe-area cuidada
  // no CSS com env(safe-area-inset-bottom)).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* useSearchParams (usado pela barra) exige um limite de Suspense */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <InstallPrompt />
        {/* O app não tem modo escuro; sem o theme fixo, o sonner seguiria o
            tema do sistema operacional e destoaria da interface. Toast some
            sozinho em 4s e só UM fica visível — aviso não pode virar
            cortina sobre o painel (V3 da auditoria visual). */}
        <Toaster richColors theme="light" duration={4000} visibleToasts={1} />
      </body>
    </html>
  );
}
