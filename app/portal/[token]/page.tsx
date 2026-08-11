'use client';

/**
 * Portal do herdeiro — a página que o advogado envia por link.
 * Sem login: o token do convite é a credencial. O herdeiro vê o que falta,
 * marca o que enviou e acompanha a revisão do advogado.
 */

import { use, useEffect, useState } from 'react';
import '../../sucessorista/sucessorista.css';

/** Alias estrutural — compatível com o ChangeEvent de input file. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };
import type { ConviteHerdeiro } from '@/lib/portal/store';

const ROTULO: Record<string, string> = {
  PENDENTE: 'Aguardando você',
  ENVIADO: 'Em revisão pelo advogado',
  APROVADO: 'Aprovado',
  REJEITADO: 'Precisa reenviar',
};

export default function PortalHerdeiro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [convite, setConvite] = useState<ConviteHerdeiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Convite não encontrado ou expirado.'))))
      .then(setConvite)
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  const marcarEnviado = async (docId: string, nomeArquivo: string) => {
    const r = await fetch(`/api/portal/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docId, status: 'ENVIADO', nomeArquivo }),
    });
    if (r.ok) setConvite(await r.json());
  };

  if (erro) {
    return (
      <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto' }}>
        <h1>Link indisponível</h1>
        <div className="nota exigencia">
          <p>{erro} Peça um novo link ao advogado responsável.</p>
        </div>
      </main>
      </div>
    );
  }

  if (!convite) {
    return (
      <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto' }}>
        <p className="subtitulo">Abrindo seu convite…</p>
      </main>
      </div>
    );
  }

  const feitos = convite.documentos.filter((d) => d.status === 'APROVADO').length;

  return (
    <div className="sucessorista">
    <main className="folha" style={{ margin: '0 auto' }}>
      <span className="eyebrow">Inventário de {convite.nomeFalecido}</span>
      <h1>Olá, {convite.nomeHerdeiro}</h1>
      <p className="subtitulo">
        {convite.nomeAdvogado} pediu os documentos abaixo para o inventário. Envie no seu
        tempo — cada item mostra o que é e por quê. Nada aqui é público: só você e o
        advogado veem esta página.
      </p>
      <p className="progresso num">
        {feitos} de {convite.documentos.length} documentos aprovados
      </p>

      <div className="check">
        {convite.documentos.map((d) => (
          <div className="check-item" key={d.id}>
            <span className="prio">{d.status === 'APROVADO' ? '✓' : '·'}</span>
            <div>
              <h4>{d.titulo}</h4>
              <p>{d.descricao}</p>
              <p className="fund">{ROTULO[d.status]}</p>
              {d.status === 'REJEITADO' && d.observacaoAdvogado && (
                <p className="alerta">Advogado: {d.observacaoAdvogado}</p>
              )}
              {(d.status === 'PENDENTE' || d.status === 'REJEITADO') && (
                <label className="campo" style={{ marginTop: 8, maxWidth: 340 }}>
                  Enviar arquivo
                  <input
                    type="file"
                    onChange={(e: Ev) => {
                      const f = e.target.files?.[0];
                      if (f) void marcarEnviado(d.id, f.name);
                    }}
                  />
                </label>
              )}
              {d.nomeArquivo && d.status !== 'PENDENTE' && (
                <p className="fund">Arquivo: {d.nomeArquivo}</p>
              )}
            </div>
            <span />
          </div>
        ))}
      </div>

      <p className="fund" style={{ marginTop: 24 }}>
        Dúvidas sobre algum documento? Fale direto com {convite.nomeAdvogado || 'o advogado responsável'}.
      </p>
    </main>
    </div>
  );
}
