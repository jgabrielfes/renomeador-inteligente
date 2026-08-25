'use client';

/**
 * Portal do herdeiro — a página que o advogado envia por link.
 * Sem login: o token do convite é a credencial. O herdeiro preenche um
 * formulário rápido de qualificação (isso costuma atrasar o processo) e
 * anexa os documentos — o motor LOCAL do renomeador roda aqui no navegador
 * e propõe o nome correto antes do envio; o conteúdo do arquivo não sai
 * da máquina (fronteira de dados do projeto).
 */

import { use, useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import '../../(private)/sucessorista/sucessorista.css';
import { LupaPreview } from '../../(private)/sucessorista/preview';

/** Alias estrutural — compatível com o ChangeEvent de input file. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };
import { SeletorMunicipio } from '@/components/seletor-municipio';
import { mascararCpf } from '@/lib/cpf';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import type { PainelHerdeiro } from '@/lib/portal/painel';
import type {
  CenarioCompartilhado,
  EspolioCompartilhado,
  VotacaoDados,
} from '@/lib/portal/espolio';

/** O GET do portal devolve o convite + o recorte do Painel do Cliente deste
 *  token (null enquanto o advogado não publicar) + a flag de e-mail ativo
 *  no deploy (env-gated no servidor). */
/** Fato do espólio como o GET devolve: compartilhado com TODA a família
 *  (autor + conteúdo), com `minha` marcando o que saiu deste token. */
interface NotaEspolioPortal {
  id: string;
  autor: string;
  bemId: string;
  tipo: string; // 'comentario' | 'sugestao_valor'
  texto: string;
  valorSugerido: string | null;
  status: string; // 'pendente' | 'aceita' | 'recusada'
  motivo: string | null;
  criadaEm: string;
  minha: boolean;
}

interface DespesaEspolioPortal {
  id: string;
  autor: string;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
  status: string; // 'pendente' | 'reconhecida' | 'nao_reconhecida'
  motivo: string | null;
  tratamento: string; // 'ressarcir' | 'compensar'
  criadaEm: string;
  minha: boolean;
}

interface AdesaoPortal {
  autor: string;
  resposta: string; // aceito | nao_aceito | conversar
  comentario: string | null;
  em: string;
  /** true = é a resposta mais recente daquele herdeiro (a que vale). */
  atual: boolean;
  minha: boolean;
}

interface CenarioEspolioPortal {
  id: string;
  status: string; // proposto | congelado
  dados: CenarioCompartilhado;
  adesoes: AdesaoPortal[];
  minhaResposta: string | null;
}

interface VotoPortal {
  autor: string;
  opcaoId: string;
  comentario: string | null;
  em: string;
  atual: boolean;
  minha: boolean;
}

interface VotacaoEspolioPortal {
  id: string;
  status: string; // aberta | encerrada
  dados: VotacaoDados;
  encerradaEm: string | null;
  votos: VotoPortal[];
  meuVoto: string | null;
}

interface MensagemMuralPortal {
  id: string;
  autor: string;
  texto: string;
  status: string; // pendente | aprovada | recusada
  /** Motivo da não-publicação — só o AUTOR recebe. */
  motivo: string | null;
  criadaEm: string;
  minha: boolean;
}

type ConviteComPainel = ConviteHerdeiro & {
  painel?: PainelHerdeiro | null;
  /** Espaço do Espólio: o snapshot COMPARTILHADO — igual para todos. */
  espolio?: EspolioCompartilhado | null;
  espolioNotas?: NotaEspolioPortal[];
  espolioDespesas?: DespesaEspolioPortal[];
  espolioCenarios?: CenarioEspolioPortal[];
  espolioVotacoes?: VotacaoEspolioPortal[];
  espolioMural?: MensagemMuralPortal[];
  /** Camada 4 — advogados constituídos: visíveis a todos (transparência). */
  advogadosDoCaso?: { nome: string; oab: string; representa: string[] }[];
  /** Convite de ADVOGADO(A): painéis dos herdeiros representados. */
  paineisRepresentados?: { nome: string; painel: PainelHerdeiro }[];
  emailAtivo?: boolean;
};

const CATEGORIAS_DESPESA_PORTAL: { valor: string; rotulo: string }[] = [
  { valor: 'funeral', rotulo: 'Funeral' },
  { valor: 'iptu', rotulo: 'IPTU' },
  { valor: 'condominio', rotulo: 'Condomínio' },
  { valor: 'itcmd', rotulo: 'Imposto (ITCMD)' },
  { valor: 'honorarios', rotulo: 'Honorários' },
  { valor: 'certidoes', rotulo: 'Certidões' },
  { valor: 'outra', rotulo: 'Outra despesa' },
];

const rotuloCategoria = (c: string) =>
  CATEGORIAS_DESPESA_PORTAL.find((x) => x.valor === c)?.rotulo ?? c;

/** "350.000,00" / "350000" → "350000.00" (o decimal que a rota valida). */
const valorParaDecimal = (texto: string): string | null => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
};

const ROTULO: Record<string, string> = {
  PENDENTE: 'Aguardando você',
  ENVIADO: 'Em revisão pelo advogado',
  APROVADO: 'Aprovado',
  REJEITADO: 'Precisa reenviar',
};

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dataLonga = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

const MESES_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * Data de EMISSÃO provável do documento: a data MAIS RECENTE que não seja
 * futura encontrada no texto lido (numa certidão, as demais datas — óbito,
 * casamento, nascimento — são sempre anteriores à emissão). Devolve ISO
 * yyyy-mm-dd ou null quando não dá para validar.
 */
function extrairDataEmissao(texto: string): string | null {
  const hoje = Date.now();
  let melhor = 0;
  const considerar = (dia: number, mes: number, ano: number) => {
    if (ano < 1990 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return;
    const ts = new Date(ano, mes - 1, dia, 12).getTime();
    if (Number.isNaN(ts) || ts > hoje) return;
    if (ts > melhor) melhor = ts;
  };
  for (const m of texto.matchAll(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/g)) {
    considerar(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  for (const m of texto.matchAll(/(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/gi)) {
    const mes = MESES_PT[m[2].toLowerCase()];
    if (mes) considerar(Number(m[1]), mes, Number(m[3]));
  }
  if (melhor === 0) return null;
  const d = new Date(melhor);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIAS_VALIDADE_CERTIDAO = 90;

const idadeEmDias = (iso: string): number =>
  Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000);

/** União estável NÃO é estado civil: a escolha é fechada e a união é a
 *  caixinha própria — marcada (ou casado), abre a qualificação do cônjuge/
 *  convivente e a juntada dos documentos dele em "Outros documentos". */
const esquemaQualificacao = z
  .object({
    cpf: z
      .string()
      .trim()
      .min(1, 'Informe seu CPF.')
      .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido — use 000.000.000-00.'),
    rg: z.string().trim(),
    dataNascimento: z.string().min(1, 'Informe sua data de nascimento.'),
    profissao: z.string().trim().min(1, 'Informe sua profissão.'),
    estadoCivil: z.string().min(1, 'Informe seu estado civil.'),
    uniaoEstavel: z.boolean(),
    email: z.string().trim().min(1, 'Informe seu e-mail.').pipe(z.email('E-mail inválido.')),
    endereco: z.string().trim().min(1, 'Informe seu endereço (rua e número).'),
    complemento: z.string().trim(),
    bairro: z.string().trim(),
    cidade: z.string().trim().min(1, 'Informe a cidade.'),
    uf: z.string().trim().min(2, 'Informe o estado (UF).'),
    cep: z.string().trim().min(1, 'Informe o CEP.'),
    conjugeNome: z.string().trim(),
    conjugeCpf: z.string().trim(),
    conjugeRg: z.string().trim(),
    conjugeDataNascimento: z.string().trim(),
    conjugeProfissao: z.string().trim(),
    casamentoData: z.string().trim(),
    casamentoRegime: z.string().trim(),
  })
  .superRefine((dados, ctx) => {
    const temVinculo = dados.estadoCivil === 'Casado(a)' || dados.uniaoEstavel;
    if (temVinculo && !dados.conjugeNome.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['conjugeNome'],
        message: dados.uniaoEstavel && dados.estadoCivil !== 'Casado(a)'
          ? 'Informe o nome do(a) convivente.'
          : 'Informe o nome do(a) cônjuge.',
      });
    }
  });

type Qualificacao = z.infer<typeof esquemaQualificacao>;

export default function PortalHerdeiro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [convite, setConvite] = useState<ConviteComPainel | null>(null);
  /* Canal entre advogados (camada 4) — só o convite de papel 'advogado'. */
  const [canalMsgs, setCanalMsgs] = useState<
    { autor: string; texto: string; em: string; minha: boolean }[]
  >([]);
  const [msgCanal, setMsgCanal] = useState('');
  const [enviandoCanal, setEnviandoCanal] = useState(false);
  const papelDoConviteAtual = convite?.papelConvite;
  useEffect(() => {
    if (papelDoConviteAtual !== 'advogado') return;
    let vivo = true;
    void fetch(`/api/portal/${token}/canal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { mensagens?: typeof canalMsgs } | null) => {
        if (vivo && c) setCanalMsgs(c.mensagens ?? []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [token, papelDoConviteAtual]);
  const [erro, setErro] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [dicaQualidade, setDicaQualidade] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  /** Arquivos anexados nesta visita, por documento — permitem a lupa local. */
  const [arquivos, setArquivos] = useState<Record<string, File>>({});
  const [preview, setPreview] = useState<File | null>(null);

  useEffect(() => {
    // ?visita=1 carimba o acesso do herdeiro (1º/último) para o advogado —
    // só a página do portal manda; a revalidação do advogado não conta.
    fetch(`/api/portal/${token}?visita=1`)
      .then((r) => {
        if (r.status === 410)
          return Promise.reject(new Error('Este convite foi encerrado pelo advogado.'));
        return r.ok ? r.json() : Promise.reject(new Error('Convite não encontrado ou expirado.'));
      })
      .then(setConvite)
      .catch((e: Error) => setErro(e.message));
  }, [token]);

  /** Respostas de PATCH/upload trazem só o convite — preserva o painel e a
   *  flag de e-mail do carregamento inicial. */
  const atualizarConvite = (novo: ConviteHerdeiro) =>
    setConvite((prev) => ({
      ...novo,
      painel: prev?.painel ?? null,
      espolio: prev?.espolio ?? null,
      espolioNotas: prev?.espolioNotas ?? [],
      espolioDespesas: prev?.espolioDespesas ?? [],
      espolioCenarios: prev?.espolioCenarios ?? [],
      espolioVotacoes: prev?.espolioVotacoes ?? [],
      espolioMural: prev?.espolioMural ?? [],
      advogadosDoCaso: prev?.advogadosDoCaso ?? [],
      paineisRepresentados: prev?.paineisRepresentados ?? [],
      emailAtivo: prev?.emailAtivo ?? false,
    }));

  /** Fato novo do espólio criado nesta visita — entra na lista local na hora
   *  (o GET seguinte traz o consolidado com os dos outros herdeiros). */
  const registrarNotaLocal = (n: NotaEspolioPortal) =>
    setConvite((prev) =>
      prev ? { ...prev, espolioNotas: [...(prev.espolioNotas ?? []), n] } : prev,
    );
  const registrarDespesaLocal = (d: DespesaEspolioPortal) =>
    setConvite((prev) =>
      prev ? { ...prev, espolioDespesas: [...(prev.espolioDespesas ?? []), d] } : prev,
    );
  const registrarMuralLocal = (m: MensagemMuralPortal) =>
    setConvite((prev) =>
      prev ? { ...prev, espolioMural: [...(prev.espolioMural ?? []), m] } : prev,
    );

  /** Voto enviado nesta visita — atualiza a votação local (vale o mais recente). */
  const registrarVotoLocal = (votacaoId: string, opcaoId: string, comentario: string) =>
    setConvite((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        espolioVotacoes: (prev.espolioVotacoes ?? []).map((v) => {
          if (v.id !== votacaoId) return v;
          const votos = v.votos.map((x) => (x.minha ? { ...x, atual: false } : x));
          votos.push({
            autor: prev.nomeHerdeiro,
            opcaoId,
            comentario: comentario === '' ? null : comentario,
            em: '',
            atual: true,
            minha: true,
          });
          return { ...v, votos, meuVoto: opcaoId };
        }),
      };
    });

  /** Resposta a um cenário enviada nesta visita — atualiza a lista local;
   *  com consenso, o cenário já aparece congelado. */
  const registrarAdesaoLocal = (
    cenarioId: string,
    resposta: string,
    comentario: string,
    consenso: boolean,
  ) =>
    setConvite((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        espolioCenarios: (prev.espolioCenarios ?? []).map((c) => {
          if (c.id !== cenarioId) return c;
          const adesoes = c.adesoes.map((a) => (a.minha ? { ...a, atual: false } : a));
          adesoes.push({
            autor: prev.nomeHerdeiro,
            resposta,
            comentario: comentario === '' ? null : comentario,
            em: '',
            atual: true,
            minha: true,
          });
          return {
            ...c,
            adesoes,
            minhaResposta: resposta,
            status: consenso ? 'congelado' : c.status,
          };
        }),
      };
    });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Qualificacao>({
    resolver: zodResolver(esquemaQualificacao),
    defaultValues: {
      cpf: '', rg: '', dataNascimento: '', profissao: '', estadoCivil: '', uniaoEstavel: false,
      email: '', endereco: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '',
      conjugeNome: '', conjugeCpf: '', conjugeRg: '', conjugeDataNascimento: '',
      conjugeProfissao: '', casamentoData: '', casamentoRegime: '',
    },
  });
  // Casado(a) OU convivente em união estável: abre o bloco do cônjuge.
  const estadoCivilAtual = useWatch({ control, name: 'estadoCivil' });
  const convivente = useWatch({ control, name: 'uniaoEstavel' });
  const temVinculo = estadoCivilAtual === 'Casado(a)' || convivente;
  const rotuloParceiro = estadoCivilAtual === 'Casado(a)' ? 'cônjuge' : 'convivente';

  const enviarQualificacao = async (dados: Qualificacao) => {
    const r = await fetch(`/api/portal/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // uniaoEstavel vai como texto ('sim' | '') — o transporte do portal é
      // todo de strings; a folha do advogado converte para a caixinha.
      body: JSON.stringify({
        qualificacao: { ...dados, uniaoEstavel: dados.uniaoEstavel ? 'sim' : '' },
      }),
    });
    if (r.ok) atualizarConvite((await r.json()) as ConviteHerdeiro);
  };

  /**
   * Envio com teto de 25 MB: até ~3,5 MB o arquivo vai inteiro numa chamada;
   * acima disso o navegador corta em FATIAS de 3,5 MB (o limite de corpo por
   * requisição na Vercel é ~4,5 MB) e a última remonta no servidor.
   */
  const FATIA_ENVIO = 3.5 * 1024 * 1024;
  const MAX_ENVIO = 25 * 1024 * 1024;

  /**
   * Foto de celular passa fácil de 4 MB: reduz no navegador — o documento
   * continua legível para o cartório e o envio fica leve. PDF não é reduzido
   * (viraria outro documento); grande demais cai no registro sem arquivo.
   */
  const reduzirImagem = async (file: File): Promise<File> => {
    if (!/^image\//.test(file.type) || file.size <= FATIA_ENVIO) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return file;
    }
  };

  /**
   * Envio de documento: o renomeador LOCAL lê o arquivo aqui no navegador
   * (OCR quando preciso), detecta o tipo e propõe o nome padronizado — e o
   * ARQUIVO segue com segurança para o escritório (rota do portal, teto de
   * 4 MB). Se o envio do arquivo falhar, o registro (nome/tipo) vai mesmo
   * assim e a página avisa para entregar por outro canal.
   */
  const enviarDocumento = async (docId: string, original: File) => {
    setAnalisando(docId);
    setDicaQualidade(null);
    const file = await reduzirImagem(original);
    setArquivos((a) => ({ ...a, [docId]: file }));
    let nome = file.name;
    let tipo: string | undefined;
    let texto = '';
    try {
      const [{ readDocument }, { proposeName }] = await Promise.all([
        import('@/lib/ocr'),
        import('@/lib/renamer'),
      ]);
      texto = await readDocument(file);
      if (texto.trim().length < 40) {
        setDicaQualidade(
          'O documento ficou pouco legível na leitura automática. Se for foto, tente de novo com boa iluminação, sem corte e sem inclinação — isso evita idas e vindas com o cartório.',
        );
      }
      const proposta = proposeName(file.name, texto);
      nome = proposta.name;
      tipo = proposta.docType !== 'Documento' ? proposta.docType : undefined;
    } catch {
      // Sem leitura local (formato não suportado etc.): segue com o nome original.
    }

    // Validade de certidão (comum: 90 dias): a data de emissão sai da mesma
    // leitura local. Vencida ou na dúvida, o envio segue valendo — quem
    // decide é o advogado; aqui é só o aviso que evita ida e volta.
    let emitidaEm: string | undefined;
    const ehCertidao = docId === 'certidao-estado-civil' || /certid/i.test(tipo ?? '');
    if (ehCertidao && texto) {
      emitidaEm = extrairDataEmissao(texto) ?? undefined;
      if (emitidaEm) {
        const idadeDias = idadeEmDias(emitidaEm);
        if (idadeDias > DIAS_VALIDADE_CERTIDAO) {
          setDicaQualidade(
            `Esta certidão parece ter sido emitida em ${dataLonga(emitidaEm)} — pode estar vencida (a validade comum para cartório é de 90 dias). Você pode enviá-la mesmo assim; se tiver uma via mais recente, prefira-a.`,
          );
        }
      }
    }

    // 1º: o arquivo em si, pela rota de upload do portal — inteiro numa
    // chamada ou em fatias sequenciais (a última devolve o convite).
    if (file.size <= MAX_ENVIO) {
      try {
        const total = Math.max(1, Math.ceil(file.size / FATIA_ENVIO));
        const envioId = crypto.randomUUID();
        let resposta: Response | null = null;
        for (let i = 0; i < total; i += 1) {
          const form = new FormData();
          form.set('docId', docId);
          form.set('arquivo', file.slice(i * FATIA_ENVIO, (i + 1) * FATIA_ENVIO));
          form.set('nome', file.name);
          form.set('mime', file.type || 'application/octet-stream');
          form.set('nomeArquivo', nome);
          if (tipo) form.set('tipoDetectado', tipo);
          if (emitidaEm) form.set('emitidaEm', emitidaEm);
          if (total > 1) {
            form.set('envioId', envioId);
            form.set('indice', String(i));
            form.set('total', String(total));
          }
          resposta = await fetch(`/api/portal/${token}/arquivo`, { method: 'POST', body: form });
          if (!resposta.ok) break;
        }
        if (resposta?.ok) {
          atualizarConvite((await resposta.json()) as ConviteHerdeiro);
          setAnalisando(null);
          return;
        }
      } catch {
        // rede caiu no meio — cai no registro sem arquivo, abaixo
      }
    }

    // Fallback: só o registro (nome/tipo), como era antes do upload real.
    setDicaQualidade(
      'O arquivo não pôde ser transmitido (tamanho acima de 25 MB ou falha momentânea). O registro foi enviado — entregue este documento ao escritório por outro canal, como WhatsApp ou e-mail.',
    );
    const r = await fetch(`/api/portal/${token}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docId, status: 'ENVIADO', nomeArquivo: nome, tipoDetectado: tipo, emitidaEm }),
    });
    if (r.ok) atualizarConvite((await r.json()) as ConviteHerdeiro);
    setAnalisando(null);
  };

  /** Apaga um envio SEU (mandou errado, quer trocar) — some do caso na hora.
   *  Pedido já aprovado não se apaga; fale com o escritório. */
  const apagarArquivo = async (arquivoId: string) => {
    setApagando(arquivoId);
    setDicaQualidade(null);
    try {
      const r = await fetch(`/api/portal/${token}/arquivo?arquivo=${encodeURIComponent(arquivoId)}`, {
        method: 'DELETE',
      });
      if (r.ok) atualizarConvite((await r.json()) as ConviteHerdeiro);
      else {
        const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
        setDicaQualidade(corpo?.erro ?? 'Não foi possível apagar agora — tente de novo.');
      }
    } finally {
      setApagando(null);
    }
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
  const painel = convite.painel ?? null;
  const advogado = painel?.advogado.nome || convite.nomeAdvogado || 'o advogado responsável';
  /** MEDIADOR(A): acompanha tudo e conversa, mas não delibera — sem
   *  formulário, sem documentos, sem voto/adesão/despesa. */
  const ehMediador = convite.papelConvite === 'mediador';
  /** ADVOGADO(A) constituído(a) (camada 4): lê tudo, comenta e junta
   *  documentos — não delibera (matriz em lib/rede/escopo.ts). */
  const ehAdvogado = convite.papelConvite === 'advogado';

  return (
    <div className="sucessorista">
    <main className="folha" style={{ margin: '0 auto' }}>
      <span className="eyebrow">Inventário de {painel?.nomeFalecido || convite.nomeFalecido}</span>
      <h1>Olá, {convite.nomeHerdeiro}</h1>
      {painel && (painel.advogado.telefone || painel.advogado.email) && (
        <p className="contato-advogado">
          Conduzido por <strong>{advogado}</strong>
          {painel.advogado.telefone && (
            <>
              {' · '}
              <a href={`tel:${painel.advogado.telefone.replace(/\D/g, '')}`}>
                {painel.advogado.telefone}
              </a>
            </>
          )}
          {painel.advogado.email && (
            <>
              {' · '}
              <a href={`mailto:${painel.advogado.email}`}>{painel.advogado.email}</a>
            </>
          )}
        </p>
      )}
      <p className="subtitulo">
        {ehMediador
          ? `Você acompanha este inventário como mediador(a), a convite de ${advogado}. Nada aqui é público: só quem recebeu um link vê estas informações.`
          : ehAdvogado
            ? `Você acompanha este inventário como advogado(a) constituído(a)${(convite.representa?.length ?? 0) > 0 ? ` de ${convite.representa!.join(' e ')}` : ''}, a convite de ${advogado}. Nada aqui é público: só quem recebeu um link vê estas informações.`
            : `Para o inventário andar, precisamos de duas coisas suas: os dados abaixo (2 minutos) e os documentos da lista. Nada aqui é público: só você e ${advogado} veem esta página.`}
      </p>

      {/* ---------- onde estamos (Painel do Cliente publicado) ---------- */}
      {painel && (
        <>
          <h2>Onde estamos</h2>
          <ol className="fase-lista">
            {painel.fases.map((f, i) => (
              <li
                key={f.id}
                className={`fase-item${f.atual ? ' atual' : ''}${f.concluida ? ' feita' : ''}`}
              >
                <span className="fase-ponto num" aria-hidden>
                  {f.concluida ? '✓' : i + 1}
                </span>
                <span>
                  <strong>{f.titulo}</strong>
                  {f.atual && <em className="fase-agora"> — estamos aqui</em>}
                  {f.atual && <span className="fase-descricao">{f.descricao}</span>}
                </span>
              </li>
            ))}
          </ol>
          {painel.proximoPasso && (
            <div className="nota" style={{ marginTop: 10 }}>
              <span className="eyebrow">Próximo passo</span>
              <p>{painel.proximoPasso.texto}</p>
              {painel.proximoPasso.dataEstimada && (
                <p className="fund" style={{ marginTop: 4 }}>
                  Estimativa: {dataLonga(painel.proximoPasso.dataEstimada)} — prazos de
                  inventário dependem de cartórios e órgãos públicos e podem mudar.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {(convite.advogadosDoCaso?.length ?? 0) > 0 && (
        <p className="fund" style={{ marginTop: 6 }}>
          {convite.advogadosDoCaso!
            .map(
              (a) =>
                `${a.nome}${a.oab ? ` (${a.oab})` : ''} representa ${a.representa.length > 0 ? a.representa.join(', ') : 'herdeiro(s) do caso'}`,
            )
            .join(' · ')}
          {' — '}os demais herdeiros seguem representados por {advogado}.
        </p>
      )}

      {ehAdvogado && (
        <div className="nota" style={{ marginTop: 10 }}>
          <span className="eyebrow">Você acompanha como advogado(a) constituído(a)</span>
          <p>
            Este acesso mostra o espaço do espólio e o painel dos seus representados, e
            permite comentar e juntar documentos (procuração, substabelecimento,
            petições). Adesões, votos e despesas são atos dos herdeiros; honorários,
            anotações e documentos internos do escritório titular não passam por aqui.
          </p>
        </div>
      )}

      {ehAdvogado && (convite.paineisRepresentados?.length ?? 0) > 0 && (
        <>
          <h2>Seus representados</h2>
          {convite.paineisRepresentados!.map((r) => {
            const atual = r.painel.fases.find((f) => f.atual);
            return (
              <div className="nota" key={r.nome} style={{ marginTop: 8 }}>
                <span className="eyebrow">{r.nome}</span>
                <p style={{ margin: 0 }}>
                  Fase atual: <strong>{atual?.titulo ?? '—'}</strong>
                  {r.painel.proximoPasso ? ` · próximo passo: ${r.painel.proximoPasso.texto}` : ''}
                </p>
                {(r.painel.custos?.length ?? 0) > 0 && (
                  <ul className="custos-portal" style={{ marginTop: 6 }}>
                    {r.painel.custos!.map((c, i) => (
                      <li key={i}>
                        <span>
                          {c.rotulo}
                          <span className="fracao"> · {c.situacao === 'PAGO' ? 'pago' : 'previsto'}</span>
                        </span>
                        <span className="num">{brl(c.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.painel.quinhao && (
                  <p className="fund" style={{ marginTop: 6 }}>
                    Quinhão liberado ao herdeiro: {brl(r.painel.quinhao.valor)}
                    {r.painel.quinhao.fracao ? ` (${r.painel.quinhao.fracao})` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}

      {ehAdvogado && (
        <>
          <h2>Conversa com o escritório titular</h2>
          <p className="fund" style={{ marginBottom: 4 }}>
            Canal registrado entre os advogados do caso — nada daqui aparece para a
            família. Honorários de cada um são tratados com os próprios clientes, fora
            da plataforma.
          </p>
          <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {canalMsgs.length === 0 && (
              <p className="fund" style={{ margin: 0 }}>Sem mensagens ainda.</p>
            )}
            {canalMsgs.map((m, i) => (
              <p key={i} className="fund" style={{ margin: 0 }}>
                <strong>{m.minha ? 'Você' : m.autor}</strong>: {m.texto}
              </p>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              type="text"
              value={msgCanal}
              placeholder="Mensagem ao escritório…"
              onChange={(e) => setMsgCanal(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="acao"
              type="button"
              disabled={enviandoCanal || !msgCanal.trim()}
              onClick={() => {
                setEnviandoCanal(true);
                void fetch(`/api/portal/${token}/canal`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ texto: msgCanal }),
                })
                  .then(async (r) => {
                    if (!r.ok) return;
                    setMsgCanal('');
                    const c = await fetch(`/api/portal/${token}/canal`).then((x) =>
                      x.ok ? x.json() : null,
                    );
                    if (c) setCanalMsgs(c.mensagens ?? []);
                  })
                  .finally(() => setEnviandoCanal(false));
              }}
            >
              {enviandoCanal ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </>
      )}

      {ehMediador && (
        <div className="nota" style={{ marginTop: 10 }}>
          <span className="eyebrow">Você acompanha como mediador(a)</span>
          <p>
            Este acesso mostra a você o mesmo que a família vê — números, cenários,
            votações e mural — e permite comentar. Decisões (votos e adesões) são dos
            herdeiros; o seu papel aqui é ajudar a conversa.
          </p>
        </div>
      )}

      {/* ---------- o que falta de você (só herdeiro) ---------- */}
      {!ehMediador && (
      <>
      <h2>{ehAdvogado ? 'Seus documentos no caso' : 'O que falta de você'}</h2>
      {!ehAdvogado && (
      <>
      <h3 style={{ marginTop: 8 }}>Seus dados (2 minutos)</h3>
      {convite.qualificacao ? (
        <div className="nota registro">
          <span className="eyebrow">Recebido</span>
          <p>
            Seus dados foram enviados{convite.qualificacaoEnviadaEm ? ` em ${new Date(convite.qualificacaoEnviadaEm).toLocaleDateString('pt-BR')}` : ''}.
            Precisa corrigir algo? Preencha e envie de novo — a versão mais recente vale.
          </p>
        </div>
      ) : null}
      <form noValidate onSubmit={handleSubmit(enviarQualificacao)}>
        <div className="grade q-grid" style={{ marginTop: 8 }}>
          <Campo rotulo="CPF" erro={errors.cpf?.message}>
            <input
              type="text"
              inputMode="numeric"
             
              aria-invalid={!!errors.cpf}
              {...register('cpf', {
                // Máscara progressiva no padrão 123.456.789-00 — o valor é
                // reescrito no próprio evento antes de o react-hook-form ler.
                onChange: (e: { target: { value: string } }) => {
                  e.target.value = mascararCpf(e.target.value);
                },
              })}
            />
          </Campo>
          <Campo rotulo="RG (opcional)" erro={errors.rg?.message}>
            <input type="text" {...register('rg')} />
          </Campo>
          <Campo rotulo="Data de nascimento" erro={errors.dataNascimento?.message}>
            <input type="date" aria-invalid={!!errors.dataNascimento} {...register('dataNascimento')} />
          </Campo>
          <Campo rotulo="Profissão" erro={errors.profissao?.message}>
            <input type="text" aria-invalid={!!errors.profissao} {...register('profissao')} />
          </Campo>
          <Campo rotulo="Estado civil" erro={errors.estadoCivil?.message}>
            {/* União estável NÃO é estado civil — ela é a caixinha abaixo. */}
            <select aria-invalid={!!errors.estadoCivil} {...register('estadoCivil')}>
              <option value="">Selecione…</option>
              <option>Solteiro(a)</option>
              <option>Casado(a)</option>
              <option>Divorciado(a)</option>
              <option>Viúvo(a)</option>
            </select>
          </Campo>
          <Campo rotulo="E-mail" erro={errors.email?.message}>
            <input type="text" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
          </Campo>
          <Campo rotulo="Endereço (rua e número)" erro={errors.endereco?.message}>
            <input type="text" aria-invalid={!!errors.endereco} {...register('endereco')} />
          </Campo>
          <Campo rotulo="Complemento (opcional)" erro={errors.complemento?.message}>
            <input type="text" {...register('complemento')} />
          </Campo>
          <Campo rotulo="Bairro (opcional)" erro={errors.bairro?.message}>
            <input type="text" {...register('bairro')} />
          </Campo>
          {/* Estado primeiro, município da lista — o herdeiro não digita (nem
              erra) o nome da cidade. Controller porque o par é um controle
              só: trocar a UF zera o município. */}
          <Controller
            control={control}
            name="uf"
            render={({ field: campoUf }) => (
              <Controller
                control={control}
                name="cidade"
                render={({ field: campoCidade }) => (
                  <SeletorMunicipio
                    uf={campoUf.value ?? ''}
                    municipio={campoCidade.value ?? ''}
                    onChange={({ uf, municipio }) => {
                      campoUf.onChange(uf);
                      campoCidade.onChange(municipio);
                    }}
                    rotuloMunicipio="Cidade"
                    ariaInvalidUf={!!errors.uf}
                    ariaInvalidMunicipio={!!errors.cidade}
                    erroUf={errors.uf?.message}
                    erroMunicipio={errors.cidade?.message}
                  />
                )}
              />
            )}
          />
          <Campo rotulo="CEP" erro={errors.cep?.message}>
            <input type="text" inputMode="numeric" aria-invalid={!!errors.cep} {...register('cep')} />
          </Campo>
        </div>

        <label className="marcar" style={{ marginTop: 10, fontWeight: 400 }}>
          <input type="checkbox" {...register('uniaoEstavel')} />
          Convivo em união estável (união estável não é estado civil — mantenha o seu acima)
        </label>

        {/* Casado(a) ou em união estável: o ato também qualifica o(a)
            cônjuge/convivente — e os documentos dele(a) podem ser anexados
            em "Outros documentos", na lista abaixo. */}
        {temVinculo && (
          <>
            <h3 style={{ marginTop: 16 }}>
              Dados do(a) {rotuloParceiro}
            </h3>
            <p className="fund" style={{ margin: '2px 0 6px' }}>
              {estadoCivilAtual === 'Casado(a)'
                ? 'A escritura qualifica também o seu cônjuge e o casamento.'
                : 'O(a) convivente mantém o próprio estado civil; a união entra pela declaração/escritura.'}{' '}
              Os documentos dele(a) (RG/CPF{estadoCivilAtual === 'Casado(a)' ? ', certidão de casamento' : ', escritura/declaração da união'}) podem ser anexados em “Outros documentos”.
            </p>
            <div className="grade q-grid">
              <Campo rotulo={`Nome completo do(a) ${rotuloParceiro}`} erro={errors.conjugeNome?.message}>
                <input type="text" aria-invalid={!!errors.conjugeNome} {...register('conjugeNome')} />
              </Campo>
              <Campo rotulo="CPF (opcional)" erro={errors.conjugeCpf?.message}>
                <input
                  type="text"
                  inputMode="numeric"
                  {...register('conjugeCpf', {
                    onChange: (e: { target: { value: string } }) => {
                      e.target.value = mascararCpf(e.target.value);
                    },
                  })}
                />
              </Campo>
              <Campo rotulo="RG (opcional)" erro={errors.conjugeRg?.message}>
                <input type="text" {...register('conjugeRg')} />
              </Campo>
              <Campo rotulo="Data de nascimento (opcional)" erro={errors.conjugeDataNascimento?.message}>
                <input type="date" {...register('conjugeDataNascimento')} />
              </Campo>
              <Campo rotulo="Profissão (opcional)" erro={errors.conjugeProfissao?.message}>
                <input type="text" {...register('conjugeProfissao')} />
              </Campo>
              <Campo
                rotulo={estadoCivilAtual === 'Casado(a)' ? 'Data do casamento (opcional)' : 'Início da união (opcional)'}
                erro={errors.casamentoData?.message}
              >
                <input type="date" {...register('casamentoData')} />
              </Campo>
              <Campo rotulo="Regime de bens (opcional)" erro={errors.casamentoRegime?.message}>
                <select {...register('casamentoRegime')}>
                  <option value="">Selecione…</option>
                  <option>Comunhão parcial de bens</option>
                  <option>Comunhão universal de bens</option>
                  <option>Separação convencional de bens</option>
                  <option>Separação obrigatória de bens</option>
                  <option>Participação final nos aquestos</option>
                </select>
              </Campo>
            </div>
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button className="acao" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : convite.qualificacao ? 'Reenviar meus dados' : 'Enviar meus dados'}
          </button>
        </div>
      </form>
      </>
      )}

      {/* ---------- documentos ---------- */}
      <h3 style={{ marginTop: 20 }}>Seus documentos</h3>
      <p className="progresso num">
        {feitos} de {convite.documentos.length} documentos aprovados
      </p>
      <p className="fund" style={{ marginBottom: 8 }}>
        Ao anexar, o documento é lido aqui no seu navegador, renomeado automaticamente no
        padrão do cartório e enviado com segurança ao escritório. Prefira PDF ou foto
        nítida, inteira e sem sombra.
      </p>
      {dicaQualidade && <p className="mono-alerta">{dicaQualidade}</p>}

      <div className="check">
        {convite.documentos.map((d) => (
          <div className="check-item" key={d.id}>
            <span className="prio">{d.status === 'APROVADO' ? '✓' : '·'}</span>
            <div>
              <h4>{d.titulo}</h4>
              <p>{d.descricao}</p>
              <p className="fund">{analisando === d.id ? 'Lendo o documento…' : ROTULO[d.status]}</p>
              {d.status === 'REJEITADO' && d.observacaoAdvogado && (
                <p className="alerta">Advogado: {d.observacaoAdvogado}</p>
              )}
              {(() => {
                /* Envios REAIS deste pedido (frente/verso/correlatos). O
                   registro antigo de arquivo único vira uma lista de um. */
                const enviados =
                  d.arquivos ??
                  (d.arquivoId && d.nomeArquivo
                    ? [
                        {
                          arquivoId: d.arquivoId,
                          nome: d.nomeArquivo,
                          tamanho: d.arquivoTamanho ?? 0,
                          tipoDetectado: d.tipoDetectado,
                        },
                      ]
                    : []);
                return (
                  <>
                    {enviados.map((a) => (
                      <p className="fund" key={a.arquivoId}>
                        Enviado: {a.nome}
                        {a.tipoDetectado ? ` · lido como ${a.tipoDetectado}` : ''}
                        {arquivos[d.id]?.name === a.nome && (
                          <button
                            type="button"
                            className="lupa"
                            title={`Pré-visualizar ${a.nome}`}
                            aria-label={`Pré-visualizar ${a.nome}`}
                            onClick={() => setPreview(arquivos[d.id])}
                          >
                            🔍
                          </button>
                        )}
                        {d.status !== 'APROVADO' && (
                          <button
                            type="button"
                            className="apagar-arquivo"
                            disabled={apagando !== null}
                            onClick={() => void apagarArquivo(a.arquivoId)}
                          >
                            {apagando === a.arquivoId ? 'apagando…' : 'apagar arquivo'}
                          </button>
                        )}
                      </p>
                    ))}
                    {enviados.length === 0 && d.nomeArquivo && d.status !== 'PENDENTE' && (
                      <p className="fund">
                        Arquivo: {d.nomeArquivo}
                        {d.tipoDetectado ? ` · lido como ${d.tipoDetectado}` : ''}
                      </p>
                    )}
                    {/* O seletor fica SEMPRE disponível fora do aprovado:
                        primeiro envio, o verso ou um correlato — escolher o
                        arquivo já dispara o envio. */}
                    {d.status !== 'APROVADO' && (
                      <label className="campo" style={{ marginTop: 8, maxWidth: 340 }}>
                        <input
                          type="file"
                          aria-label={`Escolher arquivo para ${d.titulo}`}
                          disabled={analisando !== null}
                          onChange={(e: Ev) => {
                            const f = e.target.files?.[0];
                            if (f) void enviarDocumento(d.id, f);
                          }}
                        />
                      </label>
                    )}
                  </>
                );
              })()}
            </div>
            <span />
          </div>
        ))}
      </div>

      {/* ---------- salvar: a confirmação que o herdeiro entende ---------- */}
      <h2>Salvar</h2>
      <p className="fund" style={{ marginBottom: 8 }}>
        Cada dado e documento acima já entra na folha do inventário assim que você envia.
        O botão abaixo fecha a visita: registra que você terminou e confirma que está tudo
        salvo com {advogado}.
      </p>
      {convite.envioConfirmadoEm && (
        <div className="nota registro">
          <span className="eyebrow">Salvo na folha do inventário</span>
          <p>
            Suas informações e a lista de documentos foram recebidas por {advogado} —
            confirmação registrada em{' '}
            {new Date(convite.envioConfirmadoEm).toLocaleString('pt-BR')}. Precisando
            corrigir algo, envie de novo e clique em Salvar outra vez.
          </p>
        </div>
      )}
      <button
        className="acao"
        type="button"
        disabled={salvando}
        onClick={() => {
          void (async () => {
            setSalvando(true);
            try {
              const r = await fetch(`/api/portal/${token}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ confirmarEnvio: true }),
              });
              if (r.ok) atualizarConvite((await r.json()) as ConviteHerdeiro);
            } finally {
              setSalvando(false);
            }
          })();
        }}
      >
        {salvando
          ? 'Salvando…'
          : convite.envioConfirmadoEm
            ? 'Salvar de novo'
            : 'Salvar — confirmar meu envio'}
      </button>
      </>
      )}

      {/* ---------- avisos por e-mail (env-gated no servidor) ---------- */}
      {convite.emailAtivo && (
        <AvisosEmail
          key={convite.token}
          token={token}
          emailInicial={convite.emailNotificacao ?? convite.qualificacao?.email ?? ''}
          prefInicial={convite.notificacoes ?? 'tudo'}
          onAtualizado={atualizarConvite}
        />
      )}

      {/* ---------- custos (só o que o advogado marcou como visível) ---------- */}
      {painel?.custos && painel.custos.length > 0 && (
        <>
          <h2>Custos do inventário</h2>
          <p className="fund" style={{ marginBottom: 6 }}>
            Valores do processo como um todo (impostos, cartório e despesas) — honorários
            não entram nesta lista. São previsões: o valor final sai nas guias oficiais.
          </p>
          <ul className="custos-portal">
            {painel.custos.map((c, i) => (
              <li key={i}>
                <span>{c.rotulo}</span>
                <span className="num">
                  {brl(c.valor)}{' '}
                  <em className={`selo-custo${c.situacao === 'PAGO' ? ' pago' : ''}`}>
                    {c.situacao === 'PAGO' ? 'pago' : 'previsto'}
                  </em>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------- quinhão (só quando o advogado liberar) ---------- */}
      {painel?.quinhao && (
        <>
          <h2>Seu quinhão</h2>
          <div className="nota registro">
            <p>
              Pela divisão em estudo, a sua parte na herança é de{' '}
              <strong className="num">{brl(painel.quinhao.valor)}</strong>
              {painel.quinhao.fracao ? (
                <> ({painel.quinhao.fracao} da herança)</>
              ) : null}
              .
            </p>
            <p className="fund" style={{ marginTop: 4 }}>
              {painel.quinhao.aviso}
            </p>
          </div>
        </>
      )}

      {/* ---------- histórico de atualizações ---------- */}
      {painel && painel.historico.length > 0 && (
        <>
          <h2>Atualizações do caso</h2>
          <ul className="historico-portal">
            {painel.historico.map((e, i) => (
              <li key={i}>
                <span className="num">{dataLonga(e.data)}</span> — {e.texto}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---------- Espaço do Espólio: a MESMA visão para toda a família ---------- */}
      {convite.espolio && (
        <>
          <h2>O espólio — visão da família</h2>
          <p className="fund" style={{ marginBottom: 8 }}>
            Todos os herdeiros convidados veem exatamente esta mesma seção: os mesmos
            bens, as mesmas dívidas e os mesmos cálculos. {convite.espolio.aviso}
          </p>

          <h3 style={{ marginTop: 10 }}>Quem participa da sucessão</h3>
          <ul className="custos-portal">
            {convite.espolio.participantes.map((p, i) => (
              <li key={i}>
                <span>{p.nome}</span>
                <span className="selo-custo">{p.papel}</span>
              </li>
            ))}
          </ul>

          {convite.espolio.bens && (
            <>
              <h3 style={{ marginTop: 14 }}>Bens do espólio</h3>
              <ul className="custos-portal">
                {convite.espolio.bens.map((b) => (
                  <li key={b.id}>
                    <span>
                      {b.descricao}
                      <span className="fase-descricao">fonte do valor: {b.fonteAvaliacao}</span>
                    </span>
                    <span className="num">{brl(b.valor)}</span>
                  </li>
                ))}
                {convite.espolio.totalAcervo && (
                  <li>
                    <span>
                      <strong>Total do acervo</strong>
                    </span>
                    <span className="num">
                      <strong>{brl(convite.espolio.totalAcervo)}</strong>
                    </span>
                  </li>
                )}
              </ul>

              {/* Comentários e sugestões de valor, POR BEM — todos veem;
                  nada muda no inventário sem a conferência do escritório. */}
              <h3 style={{ marginTop: 14 }}>Comentar os bens</h3>
              <p className="fund" style={{ marginBottom: 4 }}>
                Viu um valor diferente do que você conhece, ou tem algo a dizer sobre um
                bem? Escreva aqui — toda a família e o escritório veem, e um valor
                sugerido só entra no inventário depois que o advogado conferir e aceitar.
              </p>
              {convite.espolio.bens.map((b) => (
                <NotasDoBem
                  key={b.id}
                  token={token}
                  bemId={b.id}
                  descricao={b.descricao}
                  notas={(convite.espolioNotas ?? []).filter((n) => n.bemId === b.id)}
                  onNova={registrarNotaLocal}
                />
              ))}
            </>
          )}

          {convite.espolio.dividas && convite.espolio.dividas.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Dívidas do espólio</h3>
              <p className="fund" style={{ marginBottom: 4 }}>
                As dívidas são pagas antes da divisão — por isso reduzem o quinhão de
                todos, na mesma proporção.
              </p>
              <ul className="custos-portal">
                {convite.espolio.dividas.map((d, i) => (
                  <li key={i}>
                    <span>{d.descricao}</span>
                    <span className="num">{brl(d.valor)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {convite.espolio.quinhoes && (
            <>
              <h3 style={{ marginTop: 14 }}>O que cabe a cada um, pela lei</h3>
              <p className="fund" style={{ marginBottom: 4 }}>
                O cálculo é o da lei aplicado aos valores acima — não é a opinião de
                ninguém da família.
              </p>
              <ul className="custos-portal">
                {convite.espolio.quinhoes.map((q, i) => (
                  <li key={i}>
                    <span>
                      {q.nome}
                      {q.fracao ? <span className="fase-descricao">{q.fracao}</span> : null}
                    </span>
                    <span className="num">{brl(q.valor)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ---------- despesas adiantadas (com comprovante obrigatório) ---------- */}
          <h3 style={{ marginTop: 14 }}>Despesas adiantadas</h3>
          <p className="fund" style={{ marginBottom: 4 }}>
            Pagou algo do espólio do próprio bolso — funeral, IPTU, condomínio? Registre
            aqui com o comprovante. O escritório confere e decide como a despesa entra
            no acerto da família; todos veem os registros.
          </p>
          {(convite.espolioDespesas ?? []).length > 0 && (
            <ul className="custos-portal">
              {(convite.espolioDespesas ?? []).map((d) => (
                <li key={d.id}>
                  <span>
                    {d.autor}
                    {d.minha ? ' (você)' : ''} — {rotuloCategoria(d.categoria)} · {d.descricao}
                    <span className="fase-descricao">
                      pago em {dataLonga(d.data)} ·{' '}
                      {d.status === 'pendente'
                        ? 'aguardando conferência do escritório'
                        : d.status === 'reconhecida'
                          ? d.tratamento === 'compensar'
                            ? 'reconhecida — será compensada no quinhão de quem pagou'
                            : 'reconhecida — será ressarcida pelo espólio'
                          : `não reconhecida${d.motivo ? `: ${d.motivo}` : ''}`}
                    </span>
                  </span>
                  <span className="num">{brl(d.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          {!ehMediador && !ehAdvogado && (
            <DespesaEspolioForm
              token={token}
              onRegistrada={(d, conviteNovo) => {
                atualizarConvite(conviteNovo);
                registrarDespesaLocal(d);
              }}
              enviarComprovante={enviarDocumento}
            />
          )}

          {/* ---------- cenários de divisão propostos ---------- */}
          {(convite.espolioCenarios ?? []).length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Cenários de divisão propostos</h3>
              <p className="fund" style={{ marginBottom: 4 }}>
                O escritório montou uma ou mais formas possíveis de dividir os bens —
                os números abaixo são os mesmos para toda a família. Responda cada
                proposta; quando todos aceitam a mesma, ela fecha como consenso.
                Nenhum cenário é definitivo: a partilha final é a do ato lavrado ou
                homologado.
              </p>
              {(convite.espolioCenarios ?? []).map((c) => (
                <CenarioDoEspolio
                  key={c.id}
                  token={token}
                  cenario={c}
                  somenteAcompanha={ehMediador || ehAdvogado}
                  onRespondida={registrarAdesaoLocal}
                />
              ))}
              {(convite.espolioCenarios ?? []).length > 1 && (
                <ComparacaoCenarios cenarios={convite.espolioCenarios ?? []} />
              )}
            </>
          )}

          {/* ---------- votações formais da família ---------- */}
          {(convite.espolioVotacoes ?? []).length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Votações da família</h3>
              <p className="fund" style={{ marginBottom: 4 }}>
                Decisões práticas do inventário postas em votação pelo escritório. Seu
                voto fica registrado com data — você pode mudá-lo enquanto a votação
                estiver aberta (vale o mais recente) — e o resultado é apurado para
                todos verem.
              </p>
              {(convite.espolioVotacoes ?? []).map((v) => (
                <VotacaoDoEspolio
                  key={v.id}
                  token={token}
                  votacao={v}
                  somenteAcompanha={ehMediador || ehAdvogado}
                  onVotou={registrarVotoLocal}
                />
              ))}
            </>
          )}

          {/* ---------- mural da família (moderação prévia) ---------- */}
          <h3 style={{ marginTop: 14 }}>Mural da família</h3>
          <p className="fund" style={{ marginBottom: 4 }}>
            Recados sobre o andamento do inventário, visíveis a toda a família. Toda
            mensagem passa antes pelo escritório — publicada, não pode ser editada nem
            apagada; para corrigir, escreva outra.
          </p>
          <MuralDoEspolio
            token={token}
            mensagens={convite.espolioMural ?? []}
            onNova={registrarMuralLocal}
          />
        </>
      )}

      <p className="fund" style={{ marginTop: 24 }}>
        Dúvidas sobre algum documento? Fale direto com {advogado}.
      </p>

      {/* Advogado(a) próprio(a): o herdeiro informa e o escritório passa a
          copiar o(a) colega — direito do Provimento 205/2021, sem burocracia. */}
      {!ehMediador && !ehAdvogado && (
        <AdvogadoProprioForm
          token={token}
          atual={convite.advogadoProprio ?? null}
          onAtualizado={atualizarConvite}
        />
      )}

      {/* Aviso deontológico permanente (Provimento 205/2021 da OAB): o
          herdeiro sempre sabe quem conduz e que pode ter advogado próprio. */}
      <footer className="rodape-etico">
        {advogado} conduz este inventário. Você pode constituir advogado(a) próprio(a) a
        qualquer momento.{' '}
        <a href="/portal/privacidade" target="_blank" rel="noopener noreferrer">
          Como seus dados são tratados
        </a>
        .
      </footer>

      <LupaPreview file={preview} onClose={() => setPreview(null)} />
    </main>
    </div>
  );
}

/** Avisos por e-mail: o herdeiro escolhe o quanto quer saber sem perguntar
 *  ao advogado — tudo, só as mudanças de fase, ou nada. */
function AvisosEmail({
  token,
  emailInicial,
  prefInicial,
  onAtualizado,
}: {
  token: string;
  emailInicial: string;
  prefInicial: 'tudo' | 'fases' | 'nada';
  onAtualizado: (c: ConviteHerdeiro) => void;
}) {
  const [email, setEmail] = useState(emailInicial);
  const [pref, setPref] = useState<'tudo' | 'fases' | 'nada'>(prefInicial);
  const [salvandoPref, setSalvandoPref] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erroPref, setErroPref] = useState<string | null>(null);

  const salvar = async () => {
    setSalvandoPref(true);
    setErroPref(null);
    setFeito(false);
    try {
      const r = await fetch(`/api/portal/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferencias: { email: email.trim(), notificacoes: pref } }),
      });
      if (r.ok) {
        onAtualizado((await r.json()) as ConviteHerdeiro);
        setFeito(true);
      } else {
        const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErroPref(corpo?.erro ?? 'Não foi possível salvar — tente de novo.');
      }
    } finally {
      setSalvandoPref(false);
    }
  };

  return (
    <>
      <h2>Avisos por e-mail</h2>
      <p className="fund" style={{ marginBottom: 8 }}>
        Receba um e-mail quando o inventário mudar de fase, quando um documento seu for
        conferido ou quando algo novo for pedido a você — sem precisar perguntar.
      </p>
      <div className="grade q-grid">
        <label className="campo">
          Seu e-mail para os avisos
          <input
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="campo">
          O que você quer receber
          <select value={pref} onChange={(e) => setPref(e.target.value as typeof pref)}>
            <option value="tudo">Tudo (fases, documentos e pedidos)</option>
            <option value="fases">Só as mudanças de fase</option>
            <option value="nada">Nada por e-mail</option>
          </select>
        </label>
      </div>
      {erroPref && <p className="mono-alerta">{erroPref}</p>}
      <div style={{ marginTop: 10 }}>
        <button className="acao" type="button" disabled={salvandoPref} onClick={() => void salvar()}>
          {salvandoPref ? 'Salvando…' : feito ? 'Preferências salvas ✓' : 'Salvar preferências'}
        </button>
      </div>
    </>
  );
}

/** Texto leigo do status de uma nota/sugestão do espólio. */
const statusDaNota = (n: NotaEspolioPortal): string =>
  n.status === 'pendente'
    ? 'aguardando o escritório'
    : n.status === 'aceita'
      ? n.tipo === 'sugestao_valor'
        ? 'aceita pelo escritório'
        : 'lida pelo escritório'
      : `recusada${n.motivo ? `: ${n.motivo}` : ''}`;

/**
 * Conversa sobre UM bem do espólio: os comentários/sugestões de toda a
 * família (imutáveis — corrigir é escrever de novo) + o mini-form de envio.
 */
function NotasDoBem({
  token,
  bemId,
  descricao,
  notas,
  onNova,
}: {
  token: string;
  bemId: string;
  descricao: string;
  notas: NotaEspolioPortal[];
  onNova: (n: NotaEspolioPortal) => void;
}) {
  const [tipo, setTipo] = useState<'comentario' | 'sugestao_valor'>('comentario');
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const enviar = async () => {
    setErroEnvio(null);
    if (texto.trim() === '') {
      setErroEnvio('Escreva o comentário antes de enviar.');
      return;
    }
    const valorSugerido = tipo === 'sugestao_valor' ? valorParaDecimal(valor) : null;
    if (tipo === 'sugestao_valor' && !valorSugerido) {
      setErroEnvio('Informe o valor sugerido (ex.: 350.000,00).');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/${token}/espolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nota: { bemId, tipo, texto: texto.trim(), valorSugerido: valorSugerido ?? undefined },
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { nota?: NotaEspolioPortal; erro?: string }
        | null;
      if (r.ok && corpo?.nota) {
        onNova({ ...corpo.nota, minha: true, criadaEm: corpo.nota.criadaEm ?? '' });
        setTexto('');
        setValor('');
        setTipo('comentario');
      } else {
        setErroEnvio(corpo?.erro ?? 'Não foi possível enviar — tente de novo.');
      }
    } catch {
      setErroEnvio('Não foi possível enviar — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <details className="nota" style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer' }}>
        {descricao}
        {notas.length > 0 ? ` — ${notas.length} comentário(s)` : ' — comentar ou sugerir valor'}
      </summary>
      {notas.map((n) => (
        <p key={n.id} style={{ margin: '6px 0 0' }}>
          <strong>
            {n.autor}
            {n.minha ? ' (você)' : ''}
          </strong>
          {n.tipo === 'sugestao_valor' && n.valorSugerido
            ? ` sugeriu ${brl(n.valorSugerido)}`
            : ' comentou'}
          : “{n.texto}”<span className="fase-descricao">{statusDaNota(n)}</span>
        </p>
      ))}
      <div className="grade q-grid" style={{ marginTop: 8 }}>
        <Campo rotulo="O que você quer fazer">
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value === 'sugestao_valor' ? 'sugestao_valor' : 'comentario')
            }
          >
            <option value="comentario">Só comentar</option>
            <option value="sugestao_valor">Sugerir outro valor para este bem</option>
          </select>
        </Campo>
        {tipo === 'sugestao_valor' && (
          <Campo rotulo="Valor sugerido (R$)">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex.: 350.000,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Campo>
        )}
      </div>
      <Campo
        rotulo={tipo === 'sugestao_valor' ? 'De onde vem esse valor?' : 'Seu comentário'}
      >
        <textarea
          rows={2}
          maxLength={600}
          placeholder={
            tipo === 'sugestao_valor'
              ? 'Ex.: Tenho uma avaliação de corretor de março deste ano.'
              : 'Ex.: Esse carro está na garagem da minha casa desde o falecimento.'
          }
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </Campo>
      {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
      <div style={{ marginTop: 8 }}>
        <button className="acao" type="button" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar para a família e o escritório'}
        </button>
      </div>
      <p className="fund" style={{ marginTop: 6 }}>
        O que você enviar fica registrado e não pode ser editado — para corrigir,
        escreva um novo comentário. Um valor sugerido só muda o inventário se o
        advogado aceitar.
      </p>
    </details>
  );
}

/**
 * Registro de despesa adiantada — comprovante OBRIGATÓRIO: a despesa cria um
 * pedido próprio no seu convite e o arquivo sobe pelo mesmo fluxo seguro dos
 * outros documentos (aparece na lista "O que falta de você" e no escritório).
 */
function DespesaEspolioForm({
  token,
  onRegistrada,
  enviarComprovante,
}: {
  token: string;
  onRegistrada: (d: DespesaEspolioPortal, convite: ConviteHerdeiro) => void;
  enviarComprovante: (docId: string, file: File) => Promise<void>;
}) {
  const [categoria, setCategoria] = useState('funeral');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [descricao, setDescricao] = useState('');
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  const enviar = async () => {
    setErroEnvio(null);
    setFeito(false);
    const valorDecimal = valorParaDecimal(valor);
    if (!valorDecimal) {
      setErroEnvio('Informe o valor pago (ex.: 1.250,00).');
      return;
    }
    if (!data) {
      setErroEnvio('Informe a data do pagamento.');
      return;
    }
    if (descricao.trim() === '') {
      setErroEnvio('Descreva a despesa (ex.: "IPTU 2026 do apartamento — parcela única").');
      return;
    }
    if (!comprovante) {
      setErroEnvio('Anexe o comprovante — sem ele o escritório não consegue conferir.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/${token}/espolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          despesa: { categoria, valor: valorDecimal, data, descricao: descricao.trim() },
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { despesa?: DespesaEspolioPortal; convite?: ConviteHerdeiro; erro?: string }
        | null;
      if (!r.ok || !corpo?.despesa || !corpo.convite) {
        setErroEnvio(corpo?.erro ?? 'Não foi possível registrar — tente de novo.');
        return;
      }
      onRegistrada({ ...corpo.despesa, minha: true }, corpo.convite);
      // O comprovante segue pelo pedido recém-criado no seu convite.
      await enviarComprovante(`despesa-${corpo.despesa.id}`, comprovante);
      setValor('');
      setData('');
      setDescricao('');
      setComprovante(null);
      setFeito(true);
    } catch {
      setErroEnvio('Não foi possível registrar — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <details className="nota" style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer' }}>Registrar uma despesa que você adiantou</summary>
      <div className="grade q-grid" style={{ marginTop: 8 }}>
        <Campo rotulo="Tipo de despesa">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS_DESPESA_PORTAL.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Valor pago (R$)">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Ex.: 1.250,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Data do pagamento">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Comprovante (obrigatório)">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e: Ev) => setComprovante(e.target.files?.[0] ?? null)}
          />
        </Campo>
      </div>
      <Campo rotulo="Descreva a despesa">
        <input
          type="text"
          maxLength={300}
          placeholder='Ex.: "IPTU 2026 do apartamento — parcela única"'
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </Campo>
      {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
      {feito && (
        <p className="fund" style={{ marginTop: 6 }}>
          Despesa registrada e comprovante enviado — o escritório vai conferir e a
          decisão aparece aqui para toda a família.
        </p>
      )}
      <div style={{ marginTop: 8 }}>
        <button className="acao" type="button" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Registrando…' : 'Registrar despesa com comprovante'}
        </button>
      </div>
    </details>
  );
}

const ROTULO_RESPOSTA: Record<string, string> = {
  aceito: 'aceitou',
  nao_aceito: 'não aceitou',
  conversar: 'quer conversar',
};

/**
 * UM cenário de divisão: quem fica com o quê, a conta leiga por pessoa, as
 * respostas de todos e a SUA resposta (aceito · não aceito · quero conversar).
 * Congelado = consenso fechado; a resposta não muda mais.
 */
function CenarioDoEspolio({
  token,
  cenario,
  somenteAcompanha = false,
  onRespondida,
}: {
  token: string;
  cenario: CenarioEspolioPortal;
  /** Mediador(a): vê tudo, não responde (a resposta é dos herdeiros). */
  somenteAcompanha?: boolean;
  onRespondida: (cenarioId: string, resposta: string, comentario: string, consenso: boolean) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const atuais = cenario.adesoes.filter((a) => a.atual);
  const brlNum = (v: number) =>
    `R$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const responder = async (resposta: 'aceito' | 'nao_aceito' | 'conversar') => {
    setErroEnvio(null);
    setEnviando(resposta);
    try {
      const r = await fetch(`/api/portal/${token}/espolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          adesao: { cenarioId: cenario.id, resposta, comentario: comentario.trim() },
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { consenso?: boolean; erro?: string }
        | null;
      if (r.ok) {
        onRespondida(cenario.id, resposta, comentario.trim(), corpo?.consenso === true);
        setComentario('');
      } else {
        setErroEnvio(corpo?.erro ?? 'Não foi possível responder — tente de novo.');
      }
    } catch {
      setErroEnvio('Não foi possível responder — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className={`nota ${cenario.status === 'congelado' ? 'registro' : ''}`} style={{ marginTop: 8 }}>
      <span className="eyebrow">
        {cenario.status === 'congelado' ? 'Consenso fechado' : 'Em conversa'}
      </span>
      <h3 style={{ marginTop: 2 }}>{cenario.dados.titulo}</h3>
      {cenario.dados.autor && (
        <p className="fund" style={{ margin: '0 0 4px' }}>
          Proposto por {cenario.dados.autor}
        </p>
      )}
      {cenario.dados.descricao && <p className="fund">{cenario.dados.descricao}</p>}

      <p style={{ margin: '8px 0 2px' }}>
        <strong>Quem fica com o quê</strong>
      </p>
      <ul className="custos-portal">
        {cenario.dados.mapaBens.map((m, i) => (
          <li key={i}>
            <span>{m.bem}</span>
            <span>{m.destino}</span>
          </li>
        ))}
      </ul>

      <p style={{ margin: '10px 0 2px' }}>
        <strong>A conta de cada um</strong>
      </p>
      <ul className="custos-portal">
        {cenario.dados.linhas.map((l, i) => (
          <li key={i}>
            <span>
              {l.nome}
              <span className="fase-descricao">
                direito de {brlNum(l.direito)} · recebe {brlNum(l.recebeEmBens)} em bens
                {l.acertoEmDinheiro !== 0 &&
                  ` · ${l.acertoEmDinheiro > 0 ? 'recebe' : 'paga'} ${brlNum(l.acertoEmDinheiro)} em dinheiro`}
                {l.efeitoDespesas !== 0 &&
                  ` · despesas adiantadas: ${l.efeitoDespesas > 0 ? '+' : '−'}${brlNum(l.efeitoDespesas)}`}
              </span>
            </span>
            <span className="num">{brlNum(l.total)}</span>
          </li>
        ))}
      </ul>
      {cenario.dados.resumo.map((f, i) => (
        <p key={i} className="fund" style={{ marginTop: 4 }}>
          {f}
        </p>
      ))}

      {atuais.length > 0 && (
        <>
          <p style={{ margin: '10px 0 2px' }}>
            <strong>Como cada um respondeu</strong>
          </p>
          <ul className="custos-portal">
            {atuais.map((a, i) => (
              <li key={i}>
                <span>
                  {a.autor}
                  {a.minha ? ' (você)' : ''}
                  {a.comentario && <span className="fase-descricao">“{a.comentario}”</span>}
                </span>
                <span>{ROTULO_RESPOSTA[a.resposta] ?? a.resposta}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {cenario.status === 'congelado' ? (
        <p className="fund" style={{ marginTop: 8 }}>
          Este cenário fechou como consenso da família — o escritório dá sequência a
          partir dele.
        </p>
      ) : somenteAcompanha ? (
        <p className="fund" style={{ marginTop: 8 }}>
          Como mediador(a), você acompanha as respostas — a decisão é dos herdeiros.
        </p>
      ) : (
        <>
          <p style={{ margin: '10px 0 2px' }}>
            <strong>
              {cenario.minhaResposta
                ? `Sua resposta atual: ${ROTULO_RESPOSTA[cenario.minhaResposta] ?? cenario.minhaResposta} — mudou de ideia? Responda de novo.`
                : 'Sua resposta'}
            </strong>
          </p>
          <Campo rotulo="Comentário (opcional — a família e o escritório leem)">
            <input
              type="text"
              maxLength={400}
              placeholder="Ex.: Aceito, desde que o carro fique comigo."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </Campo>
          {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button
              className="acao"
              type="button"
              disabled={enviando !== null}
              onClick={() => void responder('aceito')}
            >
              {enviando === 'aceito' ? 'Enviando…' : 'Aceito'}
            </button>
            <button
              className="acao secundaria"
              type="button"
              disabled={enviando !== null}
              onClick={() => void responder('conversar')}
            >
              {enviando === 'conversar' ? 'Enviando…' : 'Quero conversar'}
            </button>
            <button
              className="acao secundaria"
              type="button"
              disabled={enviando !== null}
              onClick={() => void responder('nao_aceito')}
            >
              {enviando === 'nao_aceito' ? 'Enviando…' : 'Não aceito'}
            </button>
          </div>
          <p className="fund" style={{ marginTop: 6 }}>
            Cada resposta fica registrada; vale a mais recente. Quando todos aceitam,
            o cenário fecha como consenso.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * UMA votação formal: pergunta, opções, o quadro de votos válidos e o SEU
 * voto (mutável enquanto aberta — vale o mais recente). Encerrada mostra a
 * apuração final.
 */
function VotacaoDoEspolio({
  token,
  votacao,
  somenteAcompanha = false,
  onVotou,
}: {
  token: string;
  votacao: VotacaoEspolioPortal;
  /** Mediador(a): vê a apuração, não vota. */
  somenteAcompanha?: boolean;
  onVotou: (votacaoId: string, opcaoId: string, comentario: string) => void;
}) {
  const [opcao, setOpcao] = useState(votacao.meuVoto ?? '');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const validos = votacao.votos.filter((v) => v.atual);
  const textoDaOpcao = (id: string) =>
    votacao.dados.opcoes.find((o) => o.id === id)?.texto ?? id;

  const votar = async () => {
    setErroEnvio(null);
    if (!opcao) {
      setErroEnvio('Escolha uma opção antes de votar.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/${token}/espolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voto: { votacaoId: votacao.id, opcaoId: opcao, comentario: comentario.trim() },
        }),
      });
      const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
      if (r.ok) {
        onVotou(votacao.id, opcao, comentario.trim());
        setComentario('');
      } else {
        setErroEnvio(corpo?.erro ?? 'Não foi possível votar — tente de novo.');
      }
    } catch {
      setErroEnvio('Não foi possível votar — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={`nota ${votacao.status === 'encerrada' ? 'registro' : ''}`} style={{ marginTop: 8 }}>
      <span className="eyebrow">
        {votacao.status === 'encerrada'
          ? `Votação encerrada${votacao.encerradaEm ? ` em ${dataLonga(votacao.encerradaEm)}` : ''}`
          : 'Votação aberta'}
      </span>
      <h3 style={{ marginTop: 2 }}>{votacao.dados.pergunta}</h3>
      {votacao.dados.descricao && <p className="fund">{votacao.dados.descricao}</p>}

      <p style={{ margin: '8px 0 2px' }}>
        <strong>{votacao.status === 'encerrada' ? 'Resultado apurado' : 'Votos até agora'}</strong>
      </p>
      <ul className="custos-portal">
        {votacao.dados.opcoes.map((o) => (
          <li key={o.id}>
            <span>{o.texto}</span>
            <span className="num">
              {validos.filter((v) => v.opcaoId === o.id).length} voto(s)
            </span>
          </li>
        ))}
      </ul>
      {validos.length > 0 && (
        <ul className="custos-portal" style={{ marginTop: 4 }}>
          {validos.map((v, i) => (
            <li key={i}>
              <span>
                {v.autor}
                {v.minha ? ' (você)' : ''}
                {v.comentario && <span className="fase-descricao">“{v.comentario}”</span>}
              </span>
              <span>{textoDaOpcao(v.opcaoId)}</span>
            </li>
          ))}
        </ul>
      )}

      {votacao.status === 'aberta' && somenteAcompanha && (
        <p className="fund" style={{ marginTop: 8 }}>
          Como mediador(a), você acompanha a votação — o voto é dos herdeiros.
        </p>
      )}
      {votacao.status === 'aberta' && !somenteAcompanha && (
        <>
          <p style={{ margin: '10px 0 2px' }}>
            <strong>
              {votacao.meuVoto
                ? `Seu voto atual: "${textoDaOpcao(votacao.meuVoto)}" — mudou de ideia? Vote de novo.`
                : 'Seu voto'}
            </strong>
          </p>
          {votacao.dados.opcoes.map((o) => (
            <label className="marcar" key={o.id} style={{ fontWeight: 400, display: 'block' }}>
              <input
                type="radio"
                name={`votacao-${votacao.id}`}
                checked={opcao === o.id}
                onChange={() => setOpcao(o.id)}
              />{' '}
              {o.texto}
            </label>
          ))}
          <Campo rotulo="Comentário (opcional — a família e o escritório leem)">
            <input
              type="text"
              maxLength={400}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          </Campo>
          {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
          <div style={{ marginTop: 8 }}>
            <button className="acao" type="button" disabled={enviando} onClick={() => void votar()}>
              {enviando ? 'Registrando…' : votacao.meuVoto ? 'Registrar novo voto' : 'Registrar meu voto'}
            </button>
          </div>
        </>
      )}
      {votacao.status === 'encerrada' && (
        <p className="fund" style={{ marginTop: 8 }}>
          A deliberação orienta o trabalho do escritório; o ato formal continua sendo a
          escritura ou a decisão judicial, com a assinatura de todos.
        </p>
      )}
    </div>
  );
}

/**
 * Mural da família: mensagens APROVADAS de todos + as SUAS pendentes ou não
 * publicadas (com o motivo, que só você vê) + o envio de mensagem nova.
 */
function MuralDoEspolio({
  token,
  mensagens,
  onNova,
}: {
  token: string;
  mensagens: MensagemMuralPortal[];
  onNova: (m: MensagemMuralPortal) => void;
}) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const enviar = async () => {
    setErroEnvio(null);
    if (texto.trim() === '') {
      setErroEnvio('Escreva a mensagem antes de enviar.');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/${token}/espolio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mural: { texto: texto.trim() } }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { mural?: MensagemMuralPortal; erro?: string }
        | null;
      if (r.ok && corpo?.mural) {
        onNova({ ...corpo.mural, minha: true });
        setTexto('');
      } else {
        setErroEnvio(corpo?.erro ?? 'Não foi possível enviar — tente de novo.');
      }
    } catch {
      setErroEnvio('Não foi possível enviar — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {mensagens.length > 0 && (
        <ul className="custos-portal">
          {mensagens.map((m) => (
            <li key={m.id}>
              <span>
                <strong>
                  {m.autor}
                  {m.minha ? ' (você)' : ''}
                </strong>{' '}
                — “{m.texto}”
                <span className="fase-descricao">
                  {dataLonga(m.criadaEm)}
                  {m.status === 'pendente' && ' · aguardando o escritório publicar'}
                  {m.status === 'recusada' &&
                    ` · não publicada${m.motivo ? `: ${m.motivo}` : ''} (só você vê este recado)`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Campo rotulo="Escrever no mural (o escritório publica antes de todos verem)">
        <textarea
          rows={2}
          maxLength={600}
          placeholder="Ex.: Consegui a chave do apartamento — está comigo para as visitas de avaliação."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </Campo>
      {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
      <div style={{ marginTop: 8 }}>
        <button className="acao" type="button" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : 'Enviar ao mural'}
        </button>
      </div>
    </>
  );
}

/** Comparação lado a lado: com quanto cada um sai em cada cenário proposto. */
function ComparacaoCenarios({ cenarios }: { cenarios: CenarioEspolioPortal[] }) {
  const nomes = Array.from(
    new Set(cenarios.flatMap((c) => c.dados.linhas.map((l) => l.nome))),
  );
  const brlNum = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <>
      <h3 style={{ marginTop: 14 }}>Comparando os cenários</h3>
      <p className="fund" style={{ marginBottom: 4 }}>
        Com quanto cada um sai, em cada proposta (bens + acertos em dinheiro +
        despesas reconhecidas):
      </p>
      <ul className="custos-portal">
        {nomes.map((nome) => (
          <li key={nome}>
            <span>{nome}</span>
            <span>
              {cenarios
                .map((c) => {
                  const linha = c.dados.linhas.find((l) => l.nome === nome);
                  return `${c.dados.titulo}: ${linha ? brlNum(linha.total) : '—'}`;
                })
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * "Tenho advogado(a) próprio(a)": o herdeiro informa nome/OAB/contato e o
 * escritório passa a copiar o(a) colega nas comunicações. Só estrutura —
 * nenhum acesso novo nasce daqui, e o contato não circula entre os demais.
 */
function AdvogadoProprioForm({
  token,
  atual,
  onAtualizado,
}: {
  token: string;
  atual: { nome: string; oab?: string; contato?: string; informadoEm?: string } | null;
  onAtualizado: (c: ConviteHerdeiro) => void;
}) {
  const [nome, setNome] = useState('');
  const [oab, setOab] = useState('');
  const [contato, setContato] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const enviar = async () => {
    setErroEnvio(null);
    if (nome.trim() === '') {
      setErroEnvio('Informe o nome do(a) advogado(a).');
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/portal/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advogadoProprio: { nome: nome.trim(), oab, contato } }),
      });
      const corpo = (await r.json().catch(() => null)) as ConviteHerdeiro | { erro?: string } | null;
      if (r.ok && corpo && 'token' in (corpo as ConviteHerdeiro)) {
        onAtualizado(corpo as ConviteHerdeiro);
        setNome('');
        setOab('');
        setContato('');
      } else {
        setErroEnvio((corpo as { erro?: string } | null)?.erro ?? 'Não foi possível salvar — tente de novo.');
      }
    } catch {
      setErroEnvio('Não foi possível salvar — verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <details className="nota" style={{ marginTop: 16 }}>
      <summary style={{ cursor: 'pointer' }}>
        {atual
          ? `Advogado(a) próprio(a) informado(a): ${atual.nome}${atual.oab ? ` (OAB ${atual.oab})` : ''} — atualizar`
          : 'Tenho advogado(a) próprio(a) — informar ao escritório'}
      </summary>
      <p className="fund" style={{ margin: '6px 0 4px' }}>
        Você pode constituir advogado(a) próprio(a) a qualquer momento. Informando aqui,
        o escritório que conduz o inventário passa a se comunicar também com quem você
        indicou. Esta informação não aparece para os outros herdeiros.
      </p>
      <div className="grade q-grid">
        <Campo rotulo="Nome do(a) advogado(a)">
          <input type="text" maxLength={160} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="OAB (opcional)">
          <input type="text" maxLength={40} placeholder="Ex.: 123.456/SP" value={oab} onChange={(e) => setOab(e.target.value)} />
        </Campo>
        <Campo rotulo="Contato (opcional)">
          <input
            type="text"
            maxLength={200}
            placeholder="Telefone ou e-mail"
            value={contato}
            onChange={(e) => setContato(e.target.value)}
          />
        </Campo>
      </div>
      {erroEnvio && <p className="mono-alerta">{erroEnvio}</p>}
      <div style={{ marginTop: 8 }}>
        <button className="acao" type="button" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Salvando…' : atual ? 'Atualizar indicação' : 'Informar ao escritório'}
        </button>
      </div>
    </details>
  );
}

/** Campo do formulário com erro amigável, na identidade visual do módulo. */
function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="campo">
      {rotulo}
      {children}
      {erro && <span className="erro-campo">{erro}</span>}
    </label>
  );
}
