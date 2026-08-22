'use client';

/** Casca client do resultado salvo: a mesma ResultadoView do questionário +
 *  o download em PDF (pdf-lib roda no navegador). */

import { useState } from 'react';

import '../../../(private)/sucessorista/sucessorista.css';

import type { RespostasFamilia } from '@/lib/familias/tipos';
import type { Triagem } from '@/lib/familias/triagem';
import type { EstimativaCompleta } from '@/lib/familias/estimativas';
import type { ItemChecklist } from '@/lib/familias/documentos';
import { montarResultadoPdf } from '@/lib/familias/resultado-pdf';
import { baixarBlob } from '@/lib/partilha/xlsx';
import { GerarCodigoAdvogado, ResultadoView } from '../../resultado-view';

export function ResultadoSalvoClient({
  token,
  r,
  triagem,
  estimativa,
  docs,
}: {
  token: string;
  r: RespostasFamilia;
  triagem: Triagem;
  estimativa: EstimativaCompleta;
  docs: ItemChecklist[];
}) {
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const baixarPdf = async () => {
    setGerandoPdf(true);
    try {
      const blob = await montarResultadoPdf({
        r,
        triagem,
        estimativa,
        docs,
        agora: new Date().toISOString(),
      });
      baixarBlob(blob, 'Por onde comecar o inventario.pdf');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <ResultadoView
          r={r}
          triagem={triagem}
          estimativa={estimativa}
          docs={docs}
          acoes={
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <button className="acao" type="button" disabled={gerandoPdf} onClick={() => void baixarPdf()}>
                  {gerandoPdf ? 'Gerando…' : 'Baixar em PDF'}
                </button>
              </div>
              <GerarCodigoAdvogado token={token} />
            </>
          }
        />
      </main>
    </div>
  );
}
