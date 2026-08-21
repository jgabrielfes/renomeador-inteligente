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
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import '../../(private)/sucessorista/sucessorista.css';
import { LupaPreview } from '../../(private)/sucessorista/preview';

/** Alias estrutural — compatível com o ChangeEvent de input file. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };
import { mascararCpf } from '@/lib/cpf';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import type { PainelHerdeiro } from '@/lib/portal/painel';

/** O GET do portal devolve o convite + o recorte do Painel do Cliente deste
 *  token (null enquanto o advogado não publicar). */
type ConviteComPainel = ConviteHerdeiro & { painel?: PainelHerdeiro | null };

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
  const [erro, setErro] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState<string | null>(null);
  const [dicaQualidade, setDicaQualidade] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
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

  /** Respostas de PATCH/upload trazem só o convite — preserva o painel. */
  const atualizarConvite = (novo: ConviteHerdeiro) =>
    setConvite((prev) => ({ ...novo, painel: prev?.painel ?? null }));

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
        Para o inventário andar, precisamos de duas coisas suas: os dados abaixo (2 minutos)
        e os documentos da lista. Nada aqui é público: só você e {advogado} veem esta página.
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

      {/* ---------- o que falta de você ---------- */}
      <h2>O que falta de você</h2>
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
          <Campo rotulo="Cidade" erro={errors.cidade?.message}>
            <input type="text" aria-invalid={!!errors.cidade} {...register('cidade')} />
          </Campo>
          <Campo rotulo="Estado (UF)" erro={errors.uf?.message}>
            <input type="text" maxLength={2} aria-invalid={!!errors.uf} {...register('uf')} />
          </Campo>
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
              {(d.status === 'PENDENTE' || d.status === 'REJEITADO') && (
                <label className="campo" style={{ marginTop: 8, maxWidth: 340 }}>
                  Enviar arquivo
                  <input
                    type="file"
                    disabled={analisando !== null}
                    onChange={(e: Ev) => {
                      const f = e.target.files?.[0];
                      if (f) void enviarDocumento(d.id, f);
                    }}
                  />
                </label>
              )}
              {d.nomeArquivo && d.status !== 'PENDENTE' && (
                <p className="fund">
                  Arquivo: {d.nomeArquivo}
                  {d.tipoDetectado ? ` · lido como ${d.tipoDetectado}` : ''}
                  {arquivos[d.id] && (
                    <button
                      type="button"
                      className="lupa"
                      title={`Pré-visualizar ${d.nomeArquivo}`}
                      aria-label={`Pré-visualizar ${d.nomeArquivo}`}
                      onClick={() => setPreview(arquivos[d.id])}
                    >
                      🔍
                    </button>
                  )}
                </p>
              )}
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

      <p className="fund" style={{ marginTop: 24 }}>
        Dúvidas sobre algum documento? Fale direto com {advogado}.
      </p>

      {/* Aviso deontológico permanente (Provimento 205/2021 da OAB): o
          herdeiro sempre sabe quem conduz e que pode ter advogado próprio. */}
      <footer className="rodape-etico">
        {advogado} conduz este inventário. Você pode constituir advogado(a) próprio(a) a
        qualquer momento.
      </footer>

      <LupaPreview file={preview} onClose={() => setPreview(null)} />
    </main>
    </div>
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
