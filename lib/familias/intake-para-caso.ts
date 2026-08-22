/**
 * Do questionário público ao CASO do Sucessorista — MOTOR PURO, client-safe.
 *
 * O intake NUNCA vira caso no servidor (o módulo é local-first): esta função
 * roda no NAVEGADOR DO ADVOGADO na hora da importação e monta o snapshot
 * `CasoSalvo` (v1, o MESMO formato do botão "Importar" do módulo), com as
 * seções 0/I/II pré-preenchidas a partir das faixas do questionário:
 *
 *  - Falecido SEM nome (o questionário não coleta — o advogado completa);
 *  - Vínculo/regime; N fichas de herdeiro em branco ("Herdeiro(a) 1…");
 *  - Bens por classe com o PONTO MÉDIO da faixa como valor de partida,
 *    claramente marcados "(faixa aproximada — confirmar)";
 *  - Rito sugerido, notas com TODAS as flags do questionário e o contato
 *    que o herdeiro deixou (quando deixou).
 *
 * Pureza: ids e datas entram por parâmetro (o cliente passa
 * crypto.randomUUID e o agora; os testes passam geradores determinísticos).
 */

import { FAIXAS_PL7_2024 } from '@/lib/partilha/itcmd';
import { LIMITES_FAIXA, ROTULO_FAIXA, type FaixaValor, type RespostasFamilia } from './tipos';
import { classificarVia } from './triagem';

/* Tipos ESTRUTURAIS do CasoSalvo (o real vive no client component e não pode
   ser importado por um motor puro — o formato é o contrato v1 do Importar). */
interface HerdeiroCaso {
  id: string;
  nome: string;
  classe: 'DESCENDENTE' | 'ASCENDENTE' | 'COLATERAL';
  grau: number;
  status: 'ATIVO';
  menorOuIncapaz?: boolean;
}

interface BemCaso {
  id: string;
  descricao: string;
  valor: string;
  natureza: 'COMUM' | 'PARTICULAR';
  tipo?: 'IMOVEL' | 'VEICULO' | 'FINANCEIRO' | 'QUOTAS' | 'OUTRO';
}

export interface CasoDeIntake {
  v: 1;
  familia: {
    falecido: {
      nome: string;
      cpf: string;
      dataObito: string;
      dataCasamento: string;
      ultimoDomicilio: string;
    };
    temSobrevivente: boolean;
    vinculo: 'CASAMENTO' | 'UNIAO_ESTAVEL';
    regime:
      | 'COMUNHAO_PARCIAL'
      | 'COMUNHAO_UNIVERSAL'
      | 'SEPARACAO_CONVENCIONAL'
      | 'SEPARACAO_OBRIGATORIA';
    nomeSobrev: string;
    herdeiros: HerdeiroCaso[];
    qualificacoes: Record<string, never>;
    perguntas: Record<string, never>;
    inventarianteId: null;
  };
  bens: BemCaso[];
  dividasEspolio: string;
  statusAcervo: Record<string, never>;
  fiscal: {
    isencoesRecusadas: string[];
    vigencia: string;
    faixas: typeof FAIXAS_PL7_2024;
    inventarioAberto: boolean;
    dataProtocolo: string;
    itcmdSituacao: 'PENDENTE';
    itcmdQuitadoEm: string;
    issPct: string;
    sucessoes: never[];
    rito: 'AUTO' | 'JUDICIAL';
  };
  passo: number;
  titulo: 'GRATUITO';
  casoId: string;
  convites: Record<string, never>;
  notas: string;
}

const meioDaFaixa = (f: FaixaValor): string =>
  (Math.round((LIMITES_FAIXA[f].min + LIMITES_FAIXA[f].max) / 2)).toFixed(2);

export function intakeParaCaso(
  r: RespostasFamilia,
  opts: { casoId: string; gerarId: (prefixo: string) => string },
): CasoDeIntake {
  const triagem = classificarVia(r);
  const temSobrevivente = r.vinculo !== 'nao';
  const regime =
    r.regime === 'comunhao-universal'
      ? ('COMUNHAO_UNIVERSAL' as const)
      : r.regime === 'separacao'
        ? ('SEPARACAO_CONVENCIONAL' as const)
        : ('COMUNHAO_PARCIAL' as const);
  // Sem certeza do regime, a natureza fica PARTICULAR (não presumimos meação
  // — o advogado ajusta com os documentos; presumir COMUM esconderia imposto).
  const natureza: 'COMUM' | 'PARTICULAR' =
    temSobrevivente && regime !== 'SEPARACAO_CONVENCIONAL' && r.regime !== '' && r.regime !== 'nao-sei'
      ? 'COMUM'
      : 'PARTICULAR';

  const herdeiros: HerdeiroCaso[] = Array.from({ length: r.qtdHerdeiros }, (_, i) => ({
    id: opts.gerarId('h'),
    nome: `Herdeiro(a) ${i + 1} — completar nome`,
    classe: 'DESCENDENTE',
    grau: 1,
    status: 'ATIVO',
  }));

  const bens: BemCaso[] = [];
  if (r.bens.imoveis) {
    const ufs = r.bens.imoveisUfs.length > 0 ? r.bens.imoveisUfs : [r.ufFalecido];
    const valorPorUf = (
      (LIMITES_FAIXA[r.bens.imoveis].min + LIMITES_FAIXA[r.bens.imoveis].max) / 2 / ufs.length
    ).toFixed(2);
    for (const uf of ufs) {
      bens.push({
        id: opts.gerarId('bem'),
        descricao: `Imóvel em ${uf} (faixa aproximada ${ROTULO_FAIXA[r.bens.imoveis]} — confirmar matrícula e valores)`,
        valor: valorPorUf,
        natureza,
        tipo: 'IMOVEL',
      });
    }
  }
  if (r.bens.veiculos) {
    bens.push({
      id: opts.gerarId('bem'),
      descricao: `Veículo(s) (faixa aproximada ${ROTULO_FAIXA[r.bens.veiculos]} — confirmar CRLV/Fipe)`,
      valor: meioDaFaixa(r.bens.veiculos),
      natureza,
      tipo: 'VEICULO',
    });
  }
  if (r.bens.financeiro) {
    bens.push({
      id: opts.gerarId('bem'),
      descricao: `Saldos, investimentos e valores a receber (faixa aproximada ${ROTULO_FAIXA[r.bens.financeiro]} — confirmar extratos na data do óbito)`,
      valor: meioDaFaixa(r.bens.financeiro),
      natureza,
      tipo: 'FINANCEIRO',
    });
  }
  if (r.bens.empresa) {
    bens.push({
      id: opts.gerarId('bem'),
      descricao: 'Participação societária (apurar valor pelo contrato social e balanço)',
      valor: '0.00',
      natureza,
      tipo: 'QUOTAS',
    });
  }
  if (r.bens.outros) {
    bens.push({
      id: opts.gerarId('bem'),
      descricao: `Outros bens (faixa aproximada ${ROTULO_FAIXA[r.bens.outros]} — detalhar)`,
      valor: meioDaFaixa(r.bens.outros),
      natureza,
      tipo: 'OUTRO',
    });
  }

  const flags: string[] = [
    `Caso importado do questionário "Para famílias" — valores por FAIXA (confirmar tudo com documentos).`,
    `Via indicada na triagem: ${triagem.via}.`,
  ];
  if (r.testamento === 'sim') flags.push('Família informou TESTAMENTO.');
  if (r.testamento === 'nao-sei') flags.push('Família não sabe se há testamento — pedir certidão de busca.');
  if (r.menorOuIncapaz === 'sim') flags.push('Há herdeiro MENOR/INCAPAZ (marcar na ficha ao qualificar).');
  if (r.consenso === 'nao') flags.push('SEM consenso entre os herdeiros.');
  if (r.consenso === 'nao-conversamos') flags.push('Família ainda não conversou sobre a divisão.');
  if (r.herdeiroExterior === 'sim') flags.push('Herdeiro no EXTERIOR/difícil de localizar (procuração consular).');
  if (r.dividas === 'sim') flags.push('Família informou DÍVIDAS relevantes (lançar no passivo).');
  if (r.regime === '' || r.regime === 'nao-sei') {
    if (temSobrevivente) flags.push('Regime de bens NÃO informado — bens lançados como PARTICULARES até a certidão de casamento.');
  }
  flags.push(
    `Família em ${r.cidade || '(cidade não informada)'}/${r.ufFamilia || r.ufFalecido}.` +
      (r.nome || r.email ? ` Contato de quem respondeu: ${[r.nome, r.email].filter(Boolean).join(' · ')}.` : ''),
  );

  return {
    v: 1,
    familia: {
      falecido: {
        nome: '',
        cpf: '',
        dataObito: r.dataObito,
        dataCasamento: '',
        ultimoDomicilio: `${r.ufFalecido}`,
      },
      temSobrevivente,
      vinculo: r.vinculo === 'uniao-estavel' ? 'UNIAO_ESTAVEL' : 'CASAMENTO',
      regime,
      nomeSobrev: '',
      herdeiros,
      qualificacoes: {},
      perguntas: {},
      inventarianteId: null,
    },
    bens,
    dividasEspolio: '',
    statusAcervo: {},
    fiscal: {
      isencoesRecusadas: [],
      vigencia: '2027-01-01',
      faixas: FAIXAS_PL7_2024.map((f) => ({ ...f })),
      inventarioAberto: false,
      dataProtocolo: '',
      itcmdSituacao: 'PENDENTE',
      itcmdQuitadoEm: '',
      issPct: '5',
      sucessoes: [],
      rito: triagem.via === 'JUDICIAL' ? 'JUDICIAL' : 'AUTO',
    },
    passo: 1,
    titulo: 'GRATUITO',
    casoId: opts.casoId,
    convites: {},
    notas: flags.join('\n'),
  };
}
