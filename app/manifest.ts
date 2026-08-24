import type { MetadataRoute } from "next";

import { EH_SUCESSORISTA, IDENTIDADE } from "@/lib/app";

// Um PWA por site: quem instala o Renomeador e quem instala o Sucessorista
// recebe nome, descrição, atalho e CORES próprios (o Sucessorista abre no
// papel da identidade, não num flash branco).
export default function manifest(): MetadataRoute.Manifest {
  // Papel da LexCausa no site do Sucessorista (o PWA abre no hub).
  const cor = EH_SUCESSORISTA ? "#f4f3ef" : "#ffffff";
  return {
    name: IDENTIDADE.nome,
    short_name: IDENTIDADE.nomeCurto,
    description: IDENTIDADE.descricao,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: cor,
    theme_color: cor,
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
