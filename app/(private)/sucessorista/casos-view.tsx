/**
 * Painel "Meus casos" — a tela inicial do módulo.
 *
 * Pinta primeiro do cache de resumos (nunca tela vazia esperando I/O) e
 * revalida em segundo plano. Ordenação por URGÊNCIA do prazo do art. 611
 * (dias desde o óbito, decrescente) — é o que diferencia o painel de uma
 * lista de arquivos. Nada daqui trafega para servidor — exceto, opt-in, a
 * NUVEM (conta ou equipe): cards com modo 'nuvem' vêm do espelho no servidor
 * (folha do caso; documentos nunca sobem).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ResumoCaso } from '@/lib/partilha/caso-store';
import { faixaDoPrazo, rotuloDoPrazo } from '@/lib/partilha/prazo';

export type EstadoPainel =
  | 'carregando'
  | 'drive' // Google Drive conectado — os casos vivem na conta Google
  | 'onedrive' // OneDrive conectado — os casos vivem na conta Microsoft
  | 'dropbox' // Dropbox conectado — os casos vivem na conta Dropbox
  | 'sem-raiz' // nunca escolheu a pasta (modo pasta disponível)
  | 'pasta-bloqueada' // raiz salva, permissão em "prompt" — exige clique
  | 'pasta'
  | 'portatil';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function diasDesde(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00`).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

function alteradoHa(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia(s)`;
}

const esquemaNovo = z.object({
  titulo: z.string().trim().min(1, 'Dê um nome ao caso — ex.: "Silva, João - 2019".'),
});

export function CasosView({
  radarHref = null,
  estado,
  resumos,
  comNuvem = false,
  onEnviarNuvem = null,
  drive = null,
  onDesconectarDrive = null,
  oneDrive = null,
  onDesconectarOneDrive = null,
  dropbox = null,
  onDesconectarDropbox = null,
  linkNuvem = null,
  onAbrirPasta = null,
  dispositivo,
  temRascunhoLegado,
  onEscolherPasta,
  onTrocarPasta = null,
  pastaAtual = '',
  onDesbloquear,
  onAbrir,
  onCriar,
  onDuplicar,
  onExportar,
  onArquivar,
  onRemoverNuvem = null,
  onRestaurarBackup,
  onImportar,
  onMigrarRascunho,
}: {
  /** Rota do Radar de famílias quando ligado (env) — atalho no cabeçalho. */
  radarHref?: string | null;
  estado: EstadoPainel;
  /** null = cache ainda não pintou. */
  resumos: ResumoCaso[] | null;
  /** Nuvem da equipe ativa (o subtítulo deixa de prometer "nada sai da máquina"). */
  comNuvem?: boolean;
  /** Envia os casos locais para a nuvem de uma vez (carga inicial manual). */
  onEnviarNuvem?: (() => Promise<void>) | null;
  /** Google Drive: null = indisponível neste deploy (sem envs do Google). */
  drive?: { disponivel: boolean; conectado: boolean; email: string | null } | null;
  onDesconectarDrive?: (() => void) | null;
  /** OneDrive: null = indisponível neste deploy (sem envs da Microsoft). */
  oneDrive?: { disponivel: boolean; conectado: boolean; email: string | null } | null;
  onDesconectarOneDrive?: (() => void) | null;
  /** Dropbox: null = indisponível neste deploy (sem envs do Dropbox). */
  dropbox?: { disponivel: boolean; conectado: boolean; email: string | null } | null;
  onDesconectarDropbox?: (() => void) | null;
  /** Link da pasta-raiz no SITE da nuvem de arquivos conectada. */
  linkNuvem?: string | null;
  /** Abre a PASTA DO CASO no site da nuvem (cards drive/onedrive/dropbox). */
  onAbrirPasta?: ((caseId: string) => void) | null;
  dispositivo: string;
  temRascunhoLegado: boolean;
  onEscolherPasta: (nomeDispositivo: string) => void;
  /** Troca a pasta-raiz DEPOIS de configurada (cada conta tem a sua). */
  onTrocarPasta?: (() => void) | null;
  /** Nome da pasta-raiz ativa — aparece no seletor do topo do painel. */
  pastaAtual?: string;
  onDesbloquear: () => void;
  onAbrir: (caseId: string) => void;
  onCriar: (titulo: string) => void;
  onDuplicar: (caseId: string) => void;
  onExportar: (caseId: string) => void;
  onArquivar: (caseId: string) => void;
  /** Remove o ESPELHO do caso na nuvem da conta/equipe (cards "na nuvem"). */
  onRemoverNuvem?: ((caseId: string) => Promise<void>) | null;
  onRestaurarBackup: (caseId: string) => void;
  onImportar: (file: File) => void;
  onMigrarRascunho: () => void;
}) {
  const [dialogoNovo, setDialogoNovo] = useState(false);
  const [enviandoNuvem, setEnviandoNuvem] = useState(false);
  const [arquivando, setArquivando] = useState<ResumoCaso | null>(null);
  /** Card "na nuvem" aguardando confirmação de remoção do espelho. */
  const [removendoNuvem, setRemovendoNuvem] = useState<ResumoCaso | null>(null);
  const [removendoNuvemBusy, setRemovendoNuvemBusy] = useState(false);
  /** Dialog "Escolha o seu drive" (Google Drive · OneDrive · Dropbox). */
  const [dialogoNuvemArquivos, setDialogoNuvemArquivos] = useState(false);
  const [nomeDisp, setNomeDisp] = useState(dispositivo || 'Meu computador');
  // Visualização (cards × lista) e ordenação — preferências do navegador.
  // Restauradas num efeito diferido (não no initializer) para o HTML do
  // servidor e o primeiro render do cliente coincidirem (hidratação).
  const [visual, setVisual] = useState<'cards' | 'lista'>('cards');
  const [ordem, setOrdem] = useState<'prazo' | 'alfabetica' | 'atualizacao' | 'custo'>('prazo');
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem('sucessorista-casos-visual') === 'lista') setVisual('lista');
        const v = localStorage.getItem('sucessorista-casos-ordem');
        if (v === 'alfabetica' || v === 'atualizacao' || v === 'custo') setOrdem(v);
      } catch {
        // modo restrito
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const mudarVisual = (v: 'cards' | 'lista') => {
    setVisual(v);
    try {
      localStorage.setItem('sucessorista-casos-visual', v);
    } catch {
      // modo restrito
    }
  };
  const mudarOrdem = (v: typeof ordem) => {
    setOrdem(v);
    try {
      localStorage.setItem('sucessorista-casos-ordem', v);
    } catch {
      // modo restrito
    }
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaNovo>>({
    resolver: zodResolver(esquemaNovo),
    defaultValues: { titulo: '' },
  });

  const ordenados = [...(resumos ?? [])].sort((a, b) => {
    switch (ordem) {
      case 'alfabetica': {
        const na = a.cabecalho.titulo || a.cabecalho.autorDaHeranca || '';
        const nb = b.cabecalho.titulo || b.cabecalho.autorDaHeranca || '';
        return na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
      }
      case 'atualizacao':
        return (b.cabecalho.atualizadoEm ?? '').localeCompare(a.cabecalho.atualizadoEm ?? '');
      case 'custo':
        return (b.cabecalho.custoProjetado ?? -1) - (a.cabecalho.custoProjetado ?? -1);
      default: {
        // urgência do art. 611: mais dias desde o óbito primeiro
        const da = diasDesde(a.cabecalho.dataObito) ?? -1;
        const db = diasDesde(b.cabecalho.dataObito) ?? -1;
        return db - da;
      }
    }
  });

  return (
    <div className="casos">
      <header className="casos-topo">
        <div>
          <h1>Meus casos</h1>
          <p className="subtitulo" style={{ marginBottom: 0 }}>
            {estado === 'drive'
              ? `Seus inventários no SEU Google Drive${drive?.email ? ` (${drive.email})` : ''} — casos e documentos acessíveis de qualquer dispositivo com o seu login.`
              : estado === 'onedrive'
                ? `Seus inventários no SEU OneDrive${oneDrive?.email ? ` (${oneDrive.email})` : ''} — casos e documentos acessíveis de qualquer dispositivo com o seu login.`
                : estado === 'dropbox'
                  ? `Seus inventários no SEU Dropbox${dropbox?.email ? ` (${dropbox.email})` : ''} — casos e documentos acessíveis de qualquer dispositivo com o seu login.`
                  : comNuvem
                  ? 'Seus inventários, sincronizados pela nuvem da sua conta — em qualquer computador, o login puxa os casos; os documentos nunca saem desta máquina.'
                  : 'Seus inventários, direto da pasta do processo — nada sai desta máquina.'}
          </p>
        </div>
        {(estado === 'pasta' || estado === 'portatil' || estado === 'drive' || estado === 'onedrive' || estado === 'dropbox') && (
          <div className="escolha">
            {radarHref && (
              <Button variant="outline" render={<Link href={radarHref} />} nativeButton={false}>
                Radar de famílias
              </Button>
            )}
            {onEnviarNuvem && (
              <Button
                variant="outline"
                loading={enviandoNuvem}
                onClick={() => {
                  setEnviandoNuvem(true);
                  void onEnviarNuvem().finally(() => setEnviandoNuvem(false));
                }}
              >
                Enviar casos para a nuvem
              </Button>
            )}
            <Button onClick={() => setDialogoNovo(true)}>Novo caso</Button>
          </div>
        )}
      </header>

      {/* SELETOR DA PASTA DOS CASOS — sempre visível antes de entrar em
          qualquer caso: mostra a pasta-raiz ATIVA desta conta e troca num
          clique (cada login tem a própria pasta; trocar não apaga nada — os
          casos continuam nas pastas, o painel só passa a olhar a nova). */}
      {estado === 'drive' && (
        <div className="seletor-pasta">
          <span>
            ☁️ Google Drive conectado{drive?.email ? `: ` : ''}
            <strong>{drive?.email ?? ''}</strong> — pasta &quot;O Sucessorista&quot; no seu
            Drive. Não é a conta certa? Desconecte e conecte de novo — o seletor de
            contas do Google abre para escolher.
          </span>
          {linkNuvem && (
            <Button
              size="sm"
              variant="outline"
              render={<a href={linkNuvem} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              Abrir no Drive ↗
            </Button>
          )}
          {onDesconectarDrive && (
            <Button size="sm" variant="outline" onClick={onDesconectarDrive}>
              Desconectar
            </Button>
          )}
        </div>
      )}

      {estado === 'onedrive' && (
        <div className="seletor-pasta">
          <span>
            ☁️ OneDrive conectado{oneDrive?.email ? `: ` : ''}
            <strong>{oneDrive?.email ?? ''}</strong> — pasta &quot;Apps/O Sucessorista&quot;
            no seu OneDrive
          </span>
          {linkNuvem && (
            <Button
              size="sm"
              variant="outline"
              render={<a href={linkNuvem} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              Abrir no OneDrive ↗
            </Button>
          )}
          {onDesconectarOneDrive && (
            <Button size="sm" variant="outline" onClick={onDesconectarOneDrive}>
              Desconectar
            </Button>
          )}
        </div>
      )}

      {estado === 'dropbox' && (
        <div className="seletor-pasta">
          <span>
            ☁️ Dropbox conectado{dropbox?.email ? `: ` : ''}
            <strong>{dropbox?.email ?? ''}</strong> — pasta &quot;Apps/O Sucessorista&quot;
            no seu Dropbox
          </span>
          {linkNuvem && (
            <Button
              size="sm"
              variant="outline"
              render={<a href={linkNuvem} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              Abrir no Dropbox ↗
            </Button>
          )}
          {onDesconectarDropbox && (
            <Button size="sm" variant="outline" onClick={onDesconectarDropbox}>
              Desconectar
            </Button>
          )}
        </div>
      )}

      {/* UMA faixa só para as nuvens de arquivos: o dialog "Escolha o seu
          drive" lista os provedores disponíveis neste deploy. */}
      {estado !== 'drive' && estado !== 'onedrive' && estado !== 'dropbox' && estado !== 'carregando' &&
        (drive?.disponivel || oneDrive?.disponivel || dropbox?.disponivel) && (
          <div className="seletor-pasta">
            <span>
              ☁️ <strong>Conectar uma nuvem de arquivos</strong> — os casos e documentos
              passam a viver na SUA conta, acessíveis de qualquer dispositivo (sem
              escolher pasta no computador).
            </span>
            <Button size="sm" onClick={() => setDialogoNuvemArquivos(true)}>
              Escolher meu drive
            </Button>
          </div>
        )}

      {estado === 'pasta' && onTrocarPasta && (
        <div className="seletor-pasta">
          <span>
            📁 Pasta dos casos desta conta:{' '}
            <strong>{pastaAtual || 'pasta escolhida'}</strong>
          </span>
          <Button size="sm" variant="outline" onClick={onTrocarPasta}>
            Trocar pasta
          </Button>
        </div>
      )}

      {temRascunhoLegado && estado !== 'carregando' && (
        <div className="nota" style={{ marginBottom: 14 }}>
          <p>
            Você tem um rascunho salvo neste navegador (da versão anterior).{' '}
            <Button size="sm" variant="outline" onClick={onMigrarRascunho}>
              Guardar como caso
            </Button>
          </p>
        </div>
      )}

      {estado === 'portatil' && (
        <p className="fund" style={{ marginBottom: 14 }}>
          Neste navegador o app funciona em modo portátil: o caso vai num arquivo{' '}
          <code>.json</code> que você guarda na pasta do processo. Para salvamento
          automático direto na pasta, use o Chrome ou o Edge.
        </p>
      )}

      {estado === 'sem-raiz' && (
        <div className="nota" style={{ maxWidth: 560 }}>
          <span className="eyebrow">Primeiro acesso</span>
          <h3>Onde guardar seus casos?</h3>
          <p>
            Escolha UMA pasta-raiz (ex.: <code>Inventários</code>) — cada caso vira uma
            subpasta com o <code>caso.json</code> dentro, junto dos documentos do processo.
          </p>
          <p className="fund">
            Dica: escolha uma pasta dentro do seu Google Drive ou OneDrive do computador.
            Assim seus casos ficam com backup e acessíveis em outro computador, sem que
            nada passe por nós.
          </p>
          <label className="campo" style={{ maxWidth: 300, marginTop: 8 }}>
            Como chamar este computador?
            <Input value={nomeDisp} onChange={(e) => setNomeDisp(e.target.value)} />
          </label>
          <div className="escolha" style={{ marginTop: 12 }}>
            <Button onClick={() => onEscolherPasta(nomeDisp.trim() || 'Meu computador')}>
              Escolher a pasta dos casos
            </Button>
          </div>
        </div>
      )}

      {estado === 'pasta-bloqueada' && (
        <div className="nota" style={{ maxWidth: 560, marginBottom: 14 }}>
          <p>
            Seus casos continuam na pasta escolhida — o navegador só pede um clique para
            reabrir o acesso.
          </p>
          <div className="escolha" style={{ marginTop: 10 }}>
            <Button onClick={onDesbloquear}>Abrir meus casos</Button>
            {onTrocarPasta && (
              <Button variant="outline" onClick={onTrocarPasta}>
                Escolher outra pasta
              </Button>
            )}
          </div>
        </div>
      )}

      {estado !== 'sem-raiz' && resumos !== null && ordenados.length === 0 && (
        <p className="vazio">Nenhum caso ainda — comece pelo botão “Novo caso”.</p>
      )}

      {ordenados.length > 1 && (
        <div className="casos-controles">
          <label className="campo" style={{ maxWidth: 260 }}>
            <span>Ordenar por</span>
            <select
              className="seletor"
              value={ordem}
              onChange={(e) => mudarOrdem(e.target.value as typeof ordem)}
            >
              <option value="prazo">Prioridade de prazo (art. 611)</option>
              <option value="alfabetica">Ordem alfabética (A–Z)</option>
              <option value="atualizacao">Alterados recentemente</option>
              <option value="custo">Maior custo projetado</option>
            </select>
          </label>
          <div className="tema-alternador" role="radiogroup" aria-label="Visualização dos casos">
            <button
              type="button"
              role="radio"
              aria-checked={visual === 'cards'}
              className={visual === 'cards' ? 'ativo' : ''}
              onClick={() => mudarVisual('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={visual === 'lista'}
              className={visual === 'lista' ? 'ativo' : ''}
              onClick={() => mudarVisual('lista')}
            >
              Lista
            </button>
          </div>
        </div>
      )}

      <div className={`casos-grade${visual === 'lista' ? ' lista' : ''}`}>
        {ordenados.map((r) => {
          const dias = diasDesde(r.cabecalho.dataObito);
          const faixa = dias === null ? '' : faixaDoPrazo(dias);
          return (
            <div key={r.cabecalho.caseId} className="caso-cartao">
              <button className="abrir" onClick={() => onAbrir(r.cabecalho.caseId)}>
                <h3>{r.cabecalho.titulo || 'Caso sem título'}</h3>
                <p className="autor">
                  {r.cabecalho.autorDaHeranca || 'Autor da herança não informado'}
                  {r.cabecalho.dataObito ? ` · óbito em ${r.cabecalho.dataObito.split('-').reverse().join('/')}` : ''}
                </p>
                <p className={`prazo num ${faixa}`}>
                  {dias === null
                    ? 'Sem data do óbito'
                    : `${dias} dia(s) do óbito — ${rotuloDoPrazo(dias)}`}
                </p>
                <p className="linha num">
                  {r.cabecalho.custoProjetado !== null ? `Custo projetado ${brl(r.cabecalho.custoProjetado)} · ` : ''}
                  {r.cabecalho.qtdDocumentos} documento(s)
                </p>
                <p className="linha fund">
                  Alterado {alteradoHa(r.cabecalho.atualizadoEm)}
                  {r.cabecalho.atualizadoPor ? ` por ${r.cabecalho.atualizadoPor}` : ''}
                  {r.modo === 'drive'
                    ? ' · no seu Google Drive'
                    : r.modo === 'onedrive'
                      ? ' · no seu OneDrive'
                      : r.modo === 'dropbox'
                        ? ' · no seu Dropbox'
                        : r.modo === 'nuvem'
                        ? ' · na nuvem'
                        : r.caminhoPasta
                          ? ` · pasta: ${r.caminhoPasta}`
                          : ' · neste navegador'}
                </p>
              </button>
              <div className="acoes">
                {(r.modo === 'drive' || r.modo === 'onedrive' || r.modo === 'dropbox') && onAbrirPasta && (
                  <Button size="sm" variant="ghost" onClick={() => onAbrirPasta(r.cabecalho.caseId)}>
                    abrir pasta ↗
                  </Button>
                )}
                {r.modo !== 'nuvem' && (
                  <Button size="sm" variant="ghost" onClick={() => onDuplicar(r.cabecalho.caseId)}>
                    duplicar
                  </Button>
                )}
                {r.modo !== 'nuvem' && (
                  <Button size="sm" variant="ghost" onClick={() => onExportar(r.cabecalho.caseId)}>
                    exportar .json
                  </Button>
                )}
                {r.modo === 'pasta' && (
                  <Button size="sm" variant="ghost" onClick={() => onRestaurarBackup(r.cabecalho.caseId)}>
                    restaurar backup
                  </Button>
                )}
                {(r.modo === 'pasta' || r.modo === 'drive' || r.modo === 'onedrive' || r.modo === 'dropbox') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setArquivando(r)}
                  >
                    arquivar
                  </Button>
                )}
                {r.modo === 'nuvem' && onRemoverNuvem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setRemovendoNuvem(r)}
                  >
                    remover da nuvem
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {estado === 'portatil' && (
        <label className="campo" style={{ marginTop: 18, maxWidth: 420 }}>
          Importar um Arquivo do caso (.json)
          <Input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportar(f);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {/* novo caso */}
      <Dialog open={dialogoNovo} onOpenChange={(aberto) => !aberto && setDialogoNovo(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo caso</DialogTitle>
            <DialogDescription>
              O nome vira a pasta do processo (ex.: “Silva, João - 2019”).
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={handleSubmit((dados) => {
              setDialogoNovo(false);
              reset();
              onCriar(dados.titulo);
            })}
          >
            <Field data-invalid={Boolean(errors.titulo)}>
              <FieldLabel htmlFor="novo-caso-titulo">Nome do caso</FieldLabel>
              <Input id="novo-caso-titulo" autoFocus aria-invalid={Boolean(errors.titulo)} {...register('titulo')} />
              <FieldError errors={[errors.titulo]} />
            </Field>
            <DialogFooter style={{ marginTop: 14 }}>
              <Button type="button" variant="outline" onClick={() => setDialogoNovo(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Criar e abrir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* arquivar (única operação que move pasta — confirmação explícita) */}
      <Dialog open={arquivando !== null} onOpenChange={(aberto) => !aberto && setArquivando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar o caso?</DialogTitle>
            <DialogDescription>
              A pasta “{arquivando?.caminhoPasta}” será movida para “_Arquivados/” dentro da
              raiz — com todos os documentos. É a única operação que move pasta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArquivando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (arquivando) onArquivar(arquivando.cabecalho.caseId);
                setArquivando(null);
              }}
            >
              Arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* escolha do drive — um card por provedor disponível */}
      <Dialog open={dialogoNuvemArquivos} onOpenChange={(aberto) => !aberto && setDialogoNuvemArquivos(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escolha o seu drive</DialogTitle>
            <DialogDescription>
              Conecte UMA vez: a pasta &quot;O Sucessorista&quot; é criada na sua conta e a
              aplicação só enxerga ela — nada além. Os casos e documentos ficam acessíveis
              de qualquer dispositivo com o seu login, e dá para desconectar quando quiser.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'grid', gap: 8 }}>
            {drive?.disponivel && (
              <Button
                variant="outline"
                render={<a href="/api/drive/conectar" />}
                nativeButton={false}
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '12px 16px', textAlign: 'left', whiteSpace: 'normal' }}
              >
                <span>
                  <strong>Google Drive</strong>
                  <br />
                  <small>Conta Google — o seletor de contas abre para você escolher a do escritório.</small>
                </span>
              </Button>
            )}
            {oneDrive?.disponivel && (
              <Button
                variant="outline"
                render={<a href="/api/onedrive/conectar" />}
                nativeButton={false}
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '12px 16px', textAlign: 'left', whiteSpace: 'normal' }}
              >
                <span>
                  <strong>OneDrive</strong>
                  <br />
                  <small>Conta Microsoft — pasta de app &quot;Apps/O Sucessorista&quot;.</small>
                </span>
              </Button>
            )}
            {dropbox?.disponivel && (
              <Button
                variant="outline"
                render={<a href="/api/dropbox/conectar" />}
                nativeButton={false}
                style={{ justifyContent: 'flex-start', height: 'auto', padding: '12px 16px', textAlign: 'left', whiteSpace: 'normal' }}
              >
                <span>
                  <strong>Dropbox</strong>
                  <br />
                  <small>Conta Dropbox — pasta de app &quot;Apps/O Sucessorista&quot;.</small>
                </span>
              </Button>
            )}
          </div>
          <p className="fund" style={{ marginTop: 4 }}>
            Usuário Apple: o iCloud não tem API pública — use o modo pasta apontando para a
            pasta sincronizada do iCloud Drive no computador.
          </p>
        </DialogContent>
      </Dialog>

      {/* remover da nuvem (cards espelhados de outros computadores) */}
      <Dialog
        open={removendoNuvem !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !removendoNuvemBusy) setRemovendoNuvem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover “{removendoNuvem?.cabecalho.titulo}” da nuvem?</DialogTitle>
            <DialogDescription>
              O card sai do painel em TODOS os seus computadores, mas o caso NÃO é apagado:
              ele continua salvo na máquina (pasta ou nuvem de arquivos) onde vive — e volta
              a aparecer aqui se aquela máquina abrir o painel e espelhar de novo. Para sumir
              de vez, ARQUIVE o caso na máquina onde ele está.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={removendoNuvemBusy} onClick={() => setRemovendoNuvem(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={removendoNuvemBusy}
              onClick={() => {
                if (!removendoNuvem || !onRemoverNuvem) return;
                setRemovendoNuvemBusy(true);
                void onRemoverNuvem(removendoNuvem.cabecalho.caseId).finally(() => {
                  setRemovendoNuvemBusy(false);
                  setRemovendoNuvem(null);
                });
              }}
            >
              Remover da nuvem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
