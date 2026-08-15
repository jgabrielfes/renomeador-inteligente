import type { MetadataRoute } from "next";

import { IDENTIDADE } from "@/lib/app";

// Um PWA por site: quem instala o Renomeador e quem instala o Sucessorista
// recebe nome, descrição e atalho próprios (lib/app.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: IDENTIDADE.nome,
    short_name: IDENTIDADE.nomeCurto,
    description: IDENTIDADE.descricao,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "pt-BR",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
