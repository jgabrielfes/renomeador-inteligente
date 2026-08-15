/**
 * Cofre de documentos — convites aos herdeiros.
 *
 * O advogado gera um link por herdeiro; o herdeiro abre o link, preenche um
 * formulário rápido de qualificação e anexa os documentos — que chegam já
 * renomeados pelo motor local do renomeador, rodando no navegador dele.
 * Aqui o advogado acompanha o que entrou e importa a qualificação para o caso.
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Herdeiro } from '@/lib/partilha/types';
import type { ConviteHerdeiro, QualificacaoHerdeiro } from '@/lib/portal/store';
import { registrarPortal } from './actions';

export function CofreView({
  herdeiros,
  nomeFalecido,
  casoId,
  convites,
  setConvites,
  onImportarQualificacao,
  irParaFamilia,
}: {
  herdeiros: Herdeiro[];
  nomeFalecido: string;
  casoId: string;
  convites: Record<string, ConviteHerdeiro>;
  setConvites: (c: Record<string, ConviteHerdeiro>) => void;
  onImportarQualificacao: (herdeiroId: string, q: QualificacaoHerdeiro) => void;
  irParaFamilia: () => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const gerarLink = async (h: Herdeiro) => {
    setOcupado(h.id);
    setErro(null);
    try {
      const r = await fetch('/api/portal/convite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          casoId,
          herdeiroId: h.id,
          nomeHerdeiro: h.nome,
          nomeFalecido,
          nomeAdvogado: '',
        }),
      });
      if (!r.ok) throw new Error('Falha ao gerar o convite.');
      const { token } = (await r.json()) as { token: string };
      const conviteR = await fetch(`/api/portal/${token}`);
      if (!conviteR.ok) throw new Error('Convite criado, mas não foi possível carregá-lo.');
      const convite = (await conviteR.json()) as ConviteHerdeiro;
      setConvites({ ...convites, [h.id]: convite });
      // Telemetria: link enviado ao herdeiro (sem nome — só a contagem).
      void registrarPortal({
        casoId,
        etapa: 'CONVITE',
        quantidade: convite.documentos.length,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao gerar o link.');
    } finally {
      setOcupado(null);
    }
  };

  const atualizar = async (h: Herdeiro, token: string) => {
    setOcupado(h.id);
    setErro(null);
    try {
      const r = await fetch(`/api/portal/${token}`);
      if (!r.ok) throw new Error('O convite não está mais disponível — gere um novo link.');
      setConvites({ ...convites, [h.id]: (await r.json()) as ConviteHerdeiro });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao atualizar.');
    } finally {
      setOcupado(null);
    }
  };

  const copiar = async (h: Herdeiro, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiado(h.id);
    setTimeout(() => setCopiado((c) => (c === h.id ? null : c)), 2000);
  };

  return (
    <>
      <h2>Cofre — convites aos herdeiros</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        O que mais atrasa é esperar papel de herdeiro. Envie um link para cada um: lá ele
        preenche a própria qualificação num formulário rápido e anexa os documentos — o
        renomeador roda no navegador dele e os arquivos já chegam nomeados e conferíveis.
      </p>

      {herdeiros.length === 0 && (
        <div className="nota">
          <h3>Sem herdeiros lançados</h3>
          <p>
            Cadastre os herdeiros no item I —{' '}
            <Button variant="ghost" size="sm" onClick={irParaFamilia}>
              ir para A família
            </Button>
          </p>
        </div>
      )}

      {erro && <p className="mono-alerta">{erro}</p>}

      <div className="check">
        {herdeiros.map((h) => {
          const convite = convites[h.id];
          const url = convite
            ? `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${convite.token}`
            : null;
          const enviados = convite
            ? convite.documentos.filter((d) => d.status !== 'PENDENTE').length
            : 0;
          return (
            <div className="check-item" key={h.id}>
              <span className="prio">{convite ? (convite.qualificacao ? '✓' : '…') : '·'}</span>
              <div>
                <h4>{h.nome}</h4>
                {!convite && <p>Nenhum link gerado ainda.</p>}
                {convite && url && (
                  <>
                    <p className="num" style={{ wordBreak: 'break-all' }}>{url}</p>
                    <p>
                      {convite.qualificacao
                        ? 'Formulário de qualificação preenchido. '
                        : 'Aguardando o formulário de qualificação. '}
                      {enviados} de {convite.documentos.length} documentos enviados.
                      {convite.envioConfirmadoEm && (
                        <span style={{ color: 'var(--verde-registro)' }}>
                          {' '}
                          Envio confirmado pelo herdeiro em{' '}
                          {new Date(convite.envioConfirmadoEm).toLocaleString('pt-BR')}.
                        </span>
                      )}
                    </p>
                    {convite.documentos
                      .filter((d) => d.nomeArquivo)
                      .map((d) => (
                        <p className="fund" key={d.id}>
                          {d.titulo}: {d.nomeArquivo}
                          {d.tipoDetectado ? ` (detectado: ${d.tipoDetectado})` : ''}
                        </p>
                      ))}
                  </>
                )}
              </div>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {!convite && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={ocupado === h.id}
                    onClick={() => gerarLink(h)}
                  >
                    Gerar link
                  </Button>
                )}
                {convite && url && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => copiar(h, url)}>
                      {copiado === h.id ? 'Copiado ✓' : 'Copiar link'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={ocupado === h.id}
                      onClick={() => atualizar(h, convite.token)}
                    >
                      atualizar status
                    </Button>
                    {convite.qualificacao && (
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--verde-registro)' }}
                        onClick={() => onImportarQualificacao(h.id, convite.qualificacao!)}
                      >
                        importar qualificação
                      </Button>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="fund" style={{ marginTop: 18 }}>
        Módulo em teste: os convites vivem na memória do servidor e podem expirar em nova
        implantação — gere o link e envie na hora. O conteúdo dos arquivos não sai do
        navegador do herdeiro; o cofre registra nomes e status para a conferência.
      </p>
    </>
  );
}
