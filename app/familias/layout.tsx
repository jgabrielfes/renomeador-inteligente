// Layout da ÁREA PARA FAMÍLIAS (remodelagem LexCausa): toda tela pública de
// família — questionário, resultado, guias, confirmação e "minha
// solicitação" — ganha a marca no topo (Radar Sucessório · para famílias) e
// a VESTE de leitura calma (.veste-familias no sucessorista.css): corpo um
// degrau acima, mais respiro, alvos maiores. Público frequentemente
// enlutado: nada de urgência, cor agressiva ou gamificação.

import Link from "next/link";

import "@/app/lexcausa.css";

import { MarcaLexCausa } from "@/components/lexcausa/marca";
import { gateStandby } from "@/lib/standby";

export default async function FamiliasLayout({ children }: { children: React.ReactNode }) {
  // A porta pública das famílias é o lado do Radar — em standby, todo o
  // /familias/* responde 404 (o gate no layout cobre a subárvore inteira).
  await gateStandby("familias");
  return (
    <div className="veste-familias">
      <div className="lexcausa" style={{ minHeight: 0 }}>
        <header className="lc-topo" style={{ paddingBlock: 10 }}>
          <MarcaLexCausa href="/" sub="Radar Sucessório · para famílias" />
          <nav aria-label="Ajuda">
            <Link className="lc-fund" href="/familias/guias" style={{ textDecoration: 'none' }}>
              Guias
            </Link>
          </nav>
        </header>
      </div>
      {children}
    </div>
  );
}
