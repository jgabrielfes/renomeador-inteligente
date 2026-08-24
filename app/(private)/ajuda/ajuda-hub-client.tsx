'use client';

/**
 * Miolo CLIENT do hub de ajuda: busca (filtro local), áreas na lateral e a
 * "Trilha de partida" com progresso — artigo lido = círculo marcado, no
 * localStorage `lexcausa-trilha-v1` (restaurado em efeito diferido, pela
 * convenção de hidratação). Cada artigo abre no próprio hub (<details>).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Artigo {
  id: string;
  area: string;
  titulo: string;
  resumo: string;
  corpo: string[];
  /** Leitura longa relacionada (página "Como funciona"). */
  guia?: string;
}

const ARTIGOS: Artigo[] = [
  {
    id: 'visao-geral',
    area: 'LexCausa',
    titulo: 'Visão geral da LexCausa',
    resumo: 'O hub, os produtos e como circular entre eles.',
    corpo: [
      'A LexCausa é a marca-mãe: ao entrar, o HUB mostra os produtos da sua conta — O Sucessorista (gestão de inventários) e o Radar Sucessório (prospecção ética). O clique na marca, no topo, sempre volta ao hub.',
      'A paleta de comandos (Ctrl+K ou ⌘K) busca e navega para qualquer tela. O sino "Avisos" reúne o que aguarda você; os botões Reportar e Sugestão falam com a equipe sem sair da tela.',
    ],
  },
  {
    id: 'meus-casos',
    area: 'O Sucessorista',
    titulo: 'Criar e gerenciar casos',
    resumo: 'Meus casos, pasta do processo, nuvens e o Novos negócios.',
    corpo: [
      'Cada inventário é um CASO, guardado na SUA pasta (modo pasta), neste navegador (portátil) ou na SUA nuvem (Google Drive, OneDrive ou Dropbox — conecte na faixa do painel). Tudo se salva sozinho enquanto você digita.',
      'A faixa "Novos negócios" importa um cliente prospectado: cole o código gerado pela família (questionário público ou contratação no Radar) e o caso nasce pronto para conferir.',
    ],
    guia: '/ajuda/sucessorista',
  },
  {
    id: 'cofre',
    area: 'O Sucessorista',
    titulo: 'Enviar documentos e leitura por IA',
    resumo: 'O cofre lê certidões e matrículas; você confere.',
    corpo: [
      'Solte a pasta do caso (ou fotografe, no celular) no cofre da Página Inicial: certidões, matrículas e venais são lidos e viram campos preenchidos. Campo sem base clara fica em branco — a leitura é apoio, nunca verdade.',
      'Na aba Documentos, cada item do catálogo mostra o que está anexado e o que falta; dá para pedir documentos diretamente à família pelo portal.',
    ],
    guia: '/ajuda/sucessorista',
  },
  {
    id: 'fases',
    area: 'O Sucessorista',
    titulo: 'As 5 fases do inventário',
    resumo: 'Composição → acervo → quinhões → cofre → espelho ITCMD.',
    corpo: [
      'A barra do dashboard mostra as cinco fases e leva à aba certa com um clique. A navegação é sempre livre — nada bloqueia nada — e o painel do caso, à direita, reage a cada tecla.',
    ],
    guia: '/ajuda/sucessorista',
  },
  {
    id: 'custos',
    area: 'O Sucessorista',
    titulo: 'Custos, ITCMD e comparações',
    resumo: 'Provisões calibradas e a linguagem "menor custo tributário".',
    corpo: [
      'A aba Custos projeta emolumentos, registros e o ITCMD-SP com fundamento legal em cada linha. As comparações apontam sempre o MENOR CUSTO TRIBUTÁRIO — nunca "recomendação": a decisão jurídica é sua, e o disclaimer está na própria tela.',
    ],
  },
  {
    id: 'minutas',
    area: 'O Sucessorista',
    titulo: 'Minutas, escritura e petições',
    resumo: 'Documentos do balcão e do foro, com seus modelos.',
    corpo: [
      'O perfil Advogado(a) gera honorários, minuta ao Tabelionato e petição inicial; o perfil Escrevente gera a escritura calibrada por atos reais. "Meus modelos de minuta" guarda os padrões do seu escritório e a redação por IA segue o modelo ativo — sempre como rascunho para a sua aprovação.',
    ],
  },
  {
    id: 'portal',
    area: 'O Sucessorista',
    titulo: 'Portal da família e Espaço do Espólio',
    resumo: 'Convites por link, documentos que chegam sozinhos, deliberações.',
    corpo: [
      'O card "Painel da família" cria convites por link: cada herdeiro preenche a própria qualificação e envia documentos, que caem direto no caso. O Espaço do Espólio registra sugestões, despesas, cenários de divisão e votações — tudo vira histórico com prova em PDF.',
    ],
    guia: '/ajuda/sucessorista',
  },
  {
    id: 'radar',
    area: 'Radar Sucessório',
    titulo: 'Prospecção pelo Radar Sucessório',
    resumo: 'Casos anônimos, candidatura com teto e conversão em inventário.',
    corpo: [
      'Famílias publicam o caso ANÔNIMO; advogados(as) habilitados(as) (OAB verificada + questionário + assinatura da UF) veem os casos da sua região em ordem única por data e se candidatam — até dois por caso, sem ranking e sem preço.',
      'A família escolhe com quem conversar; fechou, o funil "Minhas respostas" converte a contratação em inventário com um clique.',
    ],
    guia: '/ajuda/radar',
  },
  {
    id: 'diligencias',
    area: 'Diligências',
    titulo: 'Diligências entre advogados',
    resumo: 'Correspondentes por comarca, termo de referência e pasta isolada.',
    corpo: [
      'Peça um ato a distância (audiência, cópia, protocolo) escolhendo a comarca: correspondentes verificados ofertam, o termo de referência registra escopo/prazo/valor em texto livre e a pasta isolada leva só os arquivos que você selecionar. O relatório entregue volta direto ao caso.',
    ],
  },
  {
    id: 'conta',
    area: 'Conta e equipe',
    titulo: 'Perfil, equipe e configurações',
    resumo: 'Foto e contatos, senha, equipe e produto de entrada.',
    corpo: [
      'No avatar (canto do topo) → "Perfil e preferências" você edita foto, apresentação, endereço e contatos, altera a senha e escolhe o produto que abre ao entrar. A equipe é criada no card "Minha equipe" de um caso — contas individuais por convite, nunca login compartilhado.',
    ],
  },
];

const AREAS = ['Todas', ...Array.from(new Set(ARTIGOS.map((a) => a.area)))];
const CHAVE = 'lexcausa-trilha-v1';

export function AjudaHub() {
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('Todas');
  const [lidos, setLidos] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setLidos(JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as string[]);
      } catch {
        /* sem armazenamento: a trilha só não lembra o progresso */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const marcarLido = (id: string) => {
    setLidos((atual) => {
      if (atual.includes(id)) return atual;
      const novo = [...atual, id];
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
      } catch {
        /* melhor-esforço */
      }
      return novo;
    });
  };

  const termo = busca.trim().toLowerCase();
  const visiveis = ARTIGOS.filter(
    (a) =>
      (area === 'Todas' || a.area === area) &&
      (termo === '' ||
        `${a.titulo} ${a.resumo} ${a.corpo.join(' ')}`.toLowerCase().includes(termo)),
  );
  const concluidos = ARTIGOS.filter((a) => lidos.includes(a.id)).length;
  const pct = Math.round((concluidos / ARTIGOS.length) * 100);

  return (
    <div style={{ display: 'grid', gap: 'var(--e-4)' }}>
      <input
        type="text"
        value={busca}
        placeholder="🔎 Buscar no manual…"
        aria-label="Buscar no manual"
        onChange={(e) => setBusca(e.target.value)}
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--lc-fio)',
          background: 'var(--lc-alto)',
          color: 'var(--lc-tinta)',
          fontSize: 'var(--t-base)',
          maxWidth: 480,
        }}
      />
      <div className="lc-ajuda-grade">
        <nav aria-label="Áreas do manual" style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
          <span className="lc-eyebrow">Áreas</span>
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              aria-pressed={area === a}
              style={{
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: 'var(--radius)',
                border: '1px solid transparent',
                background: area === a ? 'var(--accent)' : 'transparent',
                color: area === a ? 'var(--accent-foreground)' : 'var(--lc-tinta-media)',
                fontSize: 'var(--t-sm)',
                fontWeight: area === a ? 600 : 400,
              }}
            >
              {a}
            </button>
          ))}
        </nav>
        <section className="lc-cartao" style={{ display: 'grid', gap: 'var(--e-3)' }}>
          <div>
            <h2 style={{ margin: 0 }}>Trilha de partida</h2>
            <p className="lc-fund" style={{ margin: 0 }}>
              {concluidos} de {ARTIGOS.length} concluídos ({pct}%)
            </p>
          </div>
          {visiveis.length === 0 && (
            <p className="lc-fund" style={{ margin: 0 }}>
              Nada encontrado para essa busca — tente outra palavra, ou abra os guias
              completos abaixo.
            </p>
          )}
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {visiveis.map((a) => {
              const lido = lidos.includes(a.id);
              const numero = ARTIGOS.indexOf(a) + 1;
              return (
                <li key={a.id}>
                  <details
                    onToggle={(e) => {
                      if ((e.target as HTMLDetailsElement).open) marcarLido(a.id);
                    }}
                    style={{ borderBottom: '1px solid var(--lc-fio)', paddingBottom: 6 }}
                  >
                    <summary
                      style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '6px 0' }}
                    >
                      <span aria-hidden style={{ color: lido ? 'var(--lc-acento)' : 'var(--lc-tinta-media)' }}>
                        {lido ? '●' : '○'}
                      </span>
                      <span className="num lc-fund">{numero}</span>
                      <span style={{ display: 'grid', gap: 2 }}>
                        <strong>{a.titulo}</strong>
                        <span className="lc-fund">{a.resumo} · {a.area}</span>
                      </span>
                    </summary>
                    <div style={{ display: 'grid', gap: 8, padding: '4px 0 4px 28px' }}>
                      {a.corpo.map((p, i) => (
                        <p key={i} style={{ margin: 0 }}>
                          {p}
                        </p>
                      ))}
                      {a.guia && (
                        <p style={{ margin: 0 }}>
                          <Link href={a.guia}>Ler o guia completo →</Link>
                        </p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          <p className="lc-fund" style={{ margin: 0 }}>
            Guias completos: <Link href="/ajuda/sucessorista">O Sucessorista</Link> ·{' '}
            <Link href="/ajuda/radar">Radar Sucessório</Link>. Não achou? Use o botão
            &ldquo;Reportar&rdquo; ou &ldquo;Sugestão&rdquo; no topo.
          </p>
        </section>
      </div>
    </div>
  );
}
