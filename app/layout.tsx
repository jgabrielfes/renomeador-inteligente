import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { InstallPrompt } from "@/components/install-prompt";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Renomeador Inteligente de Documentos",
  description:
    "Analisa imagens e PDFs no seu navegador e sugere nomes de arquivo com base no conteúdo do documento. Nada é enviado para servidores.",
  appleWebApp: {
    capable: true,
    title: "Renomeador",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <InstallPrompt />
        {/* O app não tem modo escuro; sem o theme fixo, o sonner seguiria o
            tema do sistema operacional e destoaria da interface. */}
        <Toaster richColors theme="light" />
      </body>
    </html>
  );
}
