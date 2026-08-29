/**
 * Item I — A família.
 *
 * Abre o caso: dados do falecido (óbito, vínculo, regime, data do casamento),
 * herdeiros com qualificação completa (planilha do escritório) e as respostas
 * das perguntas da declaração do ITCMD-SP, que alimentam o item V.
 *
 * A folha é edição inline contínua (cada tecla move o painel ao lado), por
 * isso os campos do falecido/qualificação são controlados; react-hook-form
 * entra onde há SUBMISSÃO com validação — o formulário de adicionar herdeiro.
 */

import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/date-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

import { mascararCpf } from '@/lib/cpf';
import { SeletorMunicipio, SeletorMunicipioTexto } from '@/components/seletor-municipio';
import type { Herdeiro, Regime, Vinculo } from '@/lib/partilha/types';
import {
  formatarData,
  nomeProprio,
  QUALIFICACAO_VAZIA,
  PERGUNTAS_ITCMD_VAZIAS,
  ROTULOS_PERGUNTAS_ITCMD,
  type DadosFalecido,
  type PerguntasItcmd,
  type Qualificacao,
} from '@/lib/partilha/familia';
import type { CertidaoCivilLida, DivergenciaConferencia } from '@/lib/partilha/conferencia';
import {
  fracaoDaCadeiaBonita,
  ID_PRINCIPAL,
  ROTULOS_VINCULO,
  type FracaoDaCadeia,
  type VinculoSucessao,
} from '@/lib/partilha/cadeia';
import type { SucessaoCumulada } from './itcmd-view';
import { Doutrina } from './doutrina';

// Aleatório (não sequencial): o caso volta do sessionStorage e um contador
// zerado no reload geraria ids que colidem com os herdeiros restaurados.
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

const REGIMES: { v: Regime; t: string }[] = [
  { v: 'COMUNHAO_PARCIAL', t: 'Comunhão parcial' },
  { v: 'COMUNHAO_UNIVERSAL', t: 'Comunhão universal' },
  { v: 'SEPARACAO_CONVENCIONAL', t: 'Separação convencional' },
  { v: 'SEPARACAO_OBRIGATORIA', t: 'Separação obrigatória' },
];

export interface EstadoFamilia {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  vinculo: Vinculo;
  regime: Regime;
  nomeSobrev: string;
  herdeiros: Herdeiro[];
  /** Qualificação por parte: 'falecido', '__sobrevivente__' ou id do herdeiro. */
  qualificacoes: Record<string, Qualificacao>;
  /** Respostas das perguntas do ITCMD por herdeiro. */
  perguntas: Record<string, PerguntasItcmd>;
  /** Inventariante indicado: '__sobrevivente__', id de herdeiro ou null. */
  inventarianteId: string | null;
  /** Filhos/herdeiros DECLARADOS na certidão de óbito (para alertar falta). */
  herdeirosDeclarados?: string[];
  /** Certidões do registro civil LIDAS pelo cofre — alimentam o conferidor
   *  de qualificação cruzada (divergências viram alerta vermelho). */
  certidoesCivis?: CertidaoCivilLida[];
  /**
   * União estável do(a) convivente: já FORMALIZADA (escritura/contrato
   * anterior) ou a RECONHECER dentro do próprio inventário — o
   * reconhecimento soma UM ato sem valor declarado nas custas.
   * null/undefined = ainda não respondido.
   */
  uniaoEstavelFormalizada?: 'ESCRITURA' | 'RECONHECER' | null;
}

/** Pílula de escolha (Sim/Não, vínculo, regime) sobre o Button do shadcn. */
export function Pilula({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={ativo ? 'default' : 'outline'}
      aria-pressed={ativo}
      onClick={onClick}
      className="rounded-full"
    >
      {children}
    </Button>
  );
}

export function FamiliaView({
  estado,
  onChange,
  avancar,
  sucessoes,
  setSucessoes,
  basesSucessoes = {},
  fracoesSucessoes = {},
  divergencias = [],
}: {
  estado: EstadoFamilia;
  onChange: (e: EstadoFamilia) => void;
  avancar: () => void;
  /** Sucessões CUMULADAS no mesmo inventário (CPC, art. 672) — vivem no
   *  estado fiscal, mas a família é o lugar natural de lançá-las. */
  sucessoes: SucessaoCumulada[];
  setSucessoes: (s: SucessaoCumulada[]) => void;
  /** Monte partível apurado por sucessão (id → R$), para exibir na lista. */
  basesSucessoes?: Record<string, number>;
  /** Frações sugeridas pela cadeia (lib/partilha/cadeia), por id de sucessão. */
  fracoesSucessoes?: Record<string, FracaoDaCadeia>;
  /** Divergências do conferidor de qualificação cruzada (folha × certidões). */
  divergencias?: DivergenciaConferencia[];
}) {
  const { falecido, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros } = estado;

  // O bloco das sucessões cumuladas fica ESCONDIDO atrás da pergunta —
  // responder "Sim" abre o formulário; com sucessão já lançada, fica aberto
  // (há dado dentro — remova as sucessões para fechar).
  const [maisDeUmObito, setMaisDeUmObito] = useState(false);
  const sucessoesAbertas = sucessoes.length > 0 || maisDeUmObito;

  const set = (patch: Partial<EstadoFamilia>) => onChange({ ...estado, ...patch });
  const setFalecido = (patch: Partial<DadosFalecido>) =>
    set({ falecido: { ...falecido, ...patch } });

  return (
    <section>
      <h1>A família</h1>
      <Doutrina id="familia" resumo="Quem faleceu, quando, sob qual regime — e quem fica.">
        Cada campo preenchido move um número no painel ao lado na hora; a qualificação
        alimenta a escritura, o espelho do ITCMD e o cofre de documentos.
      </Doutrina>

      {/* Conferidor de qualificação cruzada: folha × certidões do registro
          civil lidas pelo cofre. Divergência ALTA (vermelho) trava a
          escritura — pedir a correção antes de seguir. */}
      {divergencias.length > 0 && (
        <div className="nota exigencia" style={{ marginBottom: 14 }}>
          <span className="eyebrow" style={{ color: 'var(--lacre)' }}>
            Conferência com as certidões: {divergencias.length} divergência(s)
          </span>
          {divergencias.map((d, i) => (
            <p
              key={i}
              style={{
                margin: '6px 0 0',
                color: d.nivel === 'ALTA' ? 'var(--lacre)' : undefined,
              }}
            >
              <strong>
                {d.nivel === 'ALTA' ? '● ' : '○ '}
                {d.pessoa}:
              </strong>{' '}
              {d.mensagem} <span className="fund">{d.acao}</span>
            </p>
          ))}
        </div>
      )}

      <div className="cartao">
      <span className="eyebrow">Autor(a) da herança</span>
      <div className="grade c2" style={{ marginTop: 10 }}>
        <label className="campo">
          Nome completo
          <Input
            value={falecido.nome}
            onChange={(e) => setFalecido({ nome: e.target.value })}
          />
        </label>
        <label className="campo">
          CPF
          <Input
            value={falecido.cpf}
            onChange={(e) => setFalecido({ cpf: mascararCpf(e.target.value) })}
            inputMode="numeric"
          />
        </label>
        <label className="campo">
          {/* Num flex-col, texto solto + span viram itens separados (a dica
              quebrava linha e desalinhava o input) — rótulo e dica juntos. */}
          <span>
            Data do óbito <span className="dica">— fato gerador do ITCMD</span>
          </span>
          <DateInput
            value={falecido.dataObito}
            onChange={(iso) => setFalecido({ dataObito: iso })}
          />
        </label>
        {/* Último domicílio: escolha (UF → município), gravada como a MESMA
            linha "Cidade/UF" que a escritura e as petições já consomem. */}
        <SeletorMunicipioTexto
          valor={falecido.ultimoDomicilio}
          rotuloMunicipio="Último domicílio (município)"
          onChange={(v) => setFalecido({ ultimoDomicilio: v })}
        />
        {/* Campos de texto LONGO ocupam a linha inteira do grid (T5): local
            do falecimento e as matrículas de certidão cortavam o valor sem
            forma de ver o conteúdo — e o title guarda o texto completo. */}
        <label className="campo campo-longo">
          Local do falecimento
          <Input
            value={falecido.localFalecimento ?? ''}
            title={falecido.localFalecimento ?? ''}
            onChange={(e) => setFalecido({ localFalecimento: e.target.value })}
          />
        </label>
        <label className="campo campo-longo">
          Certidão de óbito (matrícula/ORCPN)
          <Input
            value={falecido.certidaoObito ?? ''}
            title={falecido.certidaoObito ?? ''}
            onChange={(e) => setFalecido({ certidaoObito: e.target.value })}
          />
        </label>
        <label className="campo campo-longo">
          Certidão de casamento (matrícula/ORCPN)
          <Input
            value={falecido.certidaoCasamento ?? ''}
            title={falecido.certidaoCasamento ?? ''}
            onChange={(e) => setFalecido({ certidaoCasamento: e.target.value })}
          />
        </label>
      </div>

      {/* Ficha completa do "de cujus" (RG, nascimento, filiação, endereço…):
          qualifica o(a) falecido(a) na escritura e nas petições. A leitura da
          certidão de óbito preenche o que constar. */}
      <QualificacaoEditor
        valor={estado.qualificacoes['__falecido__'] ?? QUALIFICACAO_VAZIA}
        onChange={(q) =>
          onChange({ ...estado, qualificacoes: { ...estado.qualificacoes, ['__falecido__']: q } })
        }
        comConjuge={false}
      />
      </div>

      <h2>Havia cônjuge ou companheiro(a)?</h2>
      <div className="escolha">
        <Pilula ativo={temSobrevivente} onClick={() => set({ temSobrevivente: true })}>
          Sim
        </Pilula>
        <Pilula ativo={!temSobrevivente} onClick={() => set({ temSobrevivente: false })}>
          Não
        </Pilula>
      </div>

      {temSobrevivente && (
        <div className="cartao">
          <h2>Vínculo e regime de bens</h2>
          <div className="escolha">
            <Pilula ativo={vinculo === 'CASAMENTO'} onClick={() => set({ vinculo: 'CASAMENTO' })}>
              Casamento
            </Pilula>
            <Pilula
              ativo={vinculo === 'UNIAO_ESTAVEL'}
              onClick={() => set({ vinculo: 'UNIAO_ESTAVEL' })}
            >
              União estável
            </Pilula>
          </div>

          {/* União estável: já formalizada × reconhecer no próprio inventário
              (o reconhecimento soma UM ato sem valor declarado no item V). */}
          {vinculo === 'UNIAO_ESTAVEL' && (
            <div style={{ marginTop: 10 }}>
              <span className="eyebrow">A união estável já está formalizada?</span>
              <div className="escolha" style={{ marginTop: 6 }}>
                <Pilula
                  ativo={estado.uniaoEstavelFormalizada === 'ESCRITURA'}
                  onClick={() => set({ uniaoEstavelFormalizada: 'ESCRITURA' })}
                >
                  Já há escritura/contrato de união estável
                </Pilula>
                <Pilula
                  ativo={estado.uniaoEstavelFormalizada === 'RECONHECER'}
                  onClick={() => set({ uniaoEstavelFormalizada: 'RECONHECER' })}
                >
                  Reconhecer dentro do inventário
                </Pilula>
              </div>
              <p className="fund" style={{ margin: '6px 0 0' }}>
                {estado.uniaoEstavelFormalizada === 'RECONHECER'
                  ? 'O reconhecimento post mortem entra na própria escritura como UM ato sem valor declarado — já somado na projeção de custos (item V). Todos os herdeiros precisam anuir.'
                  : estado.uniaoEstavelFormalizada === 'ESCRITURA'
                    ? 'Anexe a escritura/contrato no cofre de documentos — ela comprova o vínculo e o regime.'
                    : 'Responda para a projeção de custos considerar (ou não) o ato de reconhecimento.'}
              </p>
            </div>
          )}
          <div className="escolha" style={{ marginTop: 8 }}>
            {REGIMES.map((r) => (
              <Pilula key={r.v} ativo={regime === r.v} onClick={() => set({ regime: r.v })}>
                {r.t}
              </Pilula>
            ))}
          </div>
          <div className="grade c2" style={{ marginTop: 14 }}>
            <label className="campo">
              Nome do(a) sobrevivente
              <Input
                value={nomeSobrev}
                onChange={(e) => set({ nomeSobrev: e.target.value })}
                  />
            </label>
            <label className="campo">
              Data do casamento / início da união
              <DateInput
                value={falecido.dataCasamento}
                onChange={(iso) => setFalecido({ dataCasamento: iso })}
              />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="marcar" style={{ margin: 0 }}>
              <Checkbox
                checked={estado.inventarianteId === '__sobrevivente__'}
                onCheckedChange={(v) =>
                  set({ inventarianteId: v === true ? '__sobrevivente__' : null })
                }
              />
              É o(a) inventariante indicado(a) — preferência legal do cônjuge/companheiro
              (CPC, art. 617, I)
            </label>
          </div>
          <QualificacaoEditor
            titulo={`Qualificação — ${nomeSobrev || 'viúvo(a)'}`}
            valor={estado.qualificacoes['__sobrevivente__'] ?? QUALIFICACAO_VAZIA}
            comConjuge={false}
            onChange={(q) =>
              set({ qualificacoes: { ...estado.qualificacoes, __sobrevivente__: q } })
            }
          />
        </div>
      )}

      <h2>Herdeiros</h2>
      <p className="subtitulo" style={{ marginBottom: 14 }}>
        Marque quem é filho(a) também do sobrevivente — em filiação híbrida a lei diverge e
        o espelho da partilha mostrará os dois cenários. Herdeiro menor ou incapaz muda o
        rito no painel: a via extrajudicial passa a exigir parecer favorável do Ministério
        Público (Res. CNJ 571/2024). As três perguntas de cada herdeiro são
        as da declaração do ITCMD e entram prontas no item V.
      </p>
      <EditorHerdeiros estado={estado} onChange={onChange} />

      {/* O resumo "Composição familiar" foi EXCLUÍDO (pedido do escritório):
          o painel do caso já conta a mesma história em números. */}

      {/* Sucessões cumuladas FECHAM a aba (pedido do escritório): a pergunta
          só faz sentido depois de a família principal estar lançada — e o
          formulário fica atrás dela: só quem responde "Sim" vê o bloco. */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Há mais de um falecimento neste inventário?</h2>
        <p className="subtitulo" style={{ marginBottom: 8 }}>
          Inventário conjunto (cônjuge pré-morto, herdeiro falecido depois…) na forma do
          art. 672 do CPC — cada sucessão tem o próprio fato gerador, monte partível e
          legítima.
        </p>
        <div className="escolha">
          <Pilula ativo={sucessoesAbertas} onClick={() => setMaisDeUmObito(true)}>
            Sim
          </Pilula>
          <Pilula
            ativo={!sucessoesAbertas}
            onClick={() => {
              // Com sucessão já lançada o bloco não fecha — remova-as antes.
              if (sucessoes.length === 0) setMaisDeUmObito(false);
            }}
          >
            Não
          </Pilula>
        </div>

        {sucessoesAbertas && (
          <div style={{ marginTop: 12 }}>
            <span className="eyebrow">Sucessões cumuladas (CPC, art. 672)</span>
            <p className="subtitulo" style={{ margin: '4px 0 10px' }}>
              Cada sucessão tem o PRÓPRIO fato gerador — ITCMD, prazos, atos de escritura e
              registro pela data do óbito respectiva. O que define o MONTE da sucessão
              seguinte é o VÍNCULO do(a) novo(a) falecido(a) com a cadeia: cônjuge
              meeiro(a) leva a meação de 50% dos bens comuns; herdeiro(a) leva a fração
              que herdou (ex.: 1/7); ex-cônjuge em mancomunhão leva metade dela. A fração
              sugerida preenche o acervo sozinha — e pode ser ajustada bem a bem.
            </p>
            <EditorSucessoes
              herdeiros={herdeiros}
              sucessoes={sucessoes}
              setSucessoes={setSucessoes}
              basesSucessoes={basesSucessoes}
              fracoesSucessoes={fracoesSucessoes}
              autorPrincipal={falecido.nome}
              qualificacoes={estado.qualificacoes}
              onQualificacao={(id, q) => {
                const qualificacoes = { ...estado.qualificacoes };
                if (q === null) delete qualificacoes[id];
                else qualificacoes[id] = q;
                onChange({ ...estado, qualificacoes });
              }}
            />
          </div>
        )}
      </div>

      <div className="rodape-acoes">
        <span />
        <Button onClick={avancar}>Avançar ao acervo</Button>
      </div>
    </section>
  );
}

/* ---------- herdeiros ---------- */

/**
 * Parentescos lançáveis — destravam TODOS os incisos do art. 1.829 que o
 * motor já calcula: sem descendentes a herança vai aos ASCENDENTES (inciso
 * II, em concorrência com o cônjuge — art. 1.837), sem ascendentes ao
 * cônjuge sozinho (III) e, por fim, aos COLATERAIS até o 4º grau (IV).
 * Grau mais próximo exclui o mais remoto (art. 1.836, §1º); avós dividem
 * por LINHAS paterna/materna (art. 1.836, §2º) — por isso a linha é pedida.
 */
const PARENTESCOS = [
  { v: 'FILHO', t: 'Filho(a)', classe: 'DESCENDENTE', grau: 1 },
  { v: 'NETO', t: 'Neto(a)', classe: 'DESCENDENTE', grau: 2 },
  { v: 'PAI_MAE', t: 'Pai/Mãe', classe: 'ASCENDENTE', grau: 1 },
  { v: 'AVO', t: 'Avô/Avó', classe: 'ASCENDENTE', grau: 2 },
  { v: 'IRMAO', t: 'Irmão/Irmã', classe: 'COLATERAL', grau: 2 },
  { v: 'SOBRINHO', t: 'Sobrinho(a)', classe: 'COLATERAL', grau: 3 },
  { v: 'TIO', t: 'Tio(a)', classe: 'COLATERAL', grau: 3 },
  { v: 'PRIMO', t: 'Primo(a)', classe: 'COLATERAL', grau: 4 },
] as const;

type ParentescoId = (typeof PARENTESCOS)[number]['v'];

/** Rótulo do parentesco de um herdeiro já lançado (classe + grau + linha). */
export function rotuloParentesco(h: Herdeiro): string {
  if (h.classe === 'DESCENDENTE') return h.grau >= 2 ? 'neto(a)' : 'filho(a)';
  if (h.classe === 'ASCENDENTE') {
    const linha = h.linha === 'PATERNA' ? ' (linha paterna)' : h.linha === 'MATERNA' ? ' (linha materna)' : '';
    return h.grau >= 2 ? `avô/avó${linha}` : 'pai/mãe';
  }
  if (h.grau === 2) return h.vinculoIrmao === 'UNILATERAL' ? 'irmão/irmã unilateral' : 'irmão/irmã';
  if (h.grau === 4) return 'primo(a)';
  return 'sobrinho(a)/tio(a)';
}

const esquemaHerdeiro = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome do herdeiro.'),
    // 'CONJUGE' NÃO vira linha de herdeiro: a escolha liga o bloco próprio
    // "Havia cônjuge ou companheiro(a)?" (meação e concorrência são do motor).
    parentesco: z.enum([...PARENTESCOS.map((p) => p.v), 'CONJUGE'] as unknown as [
      ParentescoId | 'CONJUGE',
      ...(ParentescoId | 'CONJUGE')[],
    ]),
    linha: z.enum(['', 'PATERNA', 'MATERNA']),
    vinculoIrmao: z.enum(['BILATERAL', 'UNILATERAL']),
    status: z.enum(['ATIVO', 'PRE_MORTO', 'RENUNCIANTE']),
    comum: z.boolean(),
    incapaz: z.boolean(),
  })
  .refine((d) => d.parentesco !== 'AVO' || d.linha !== '', {
    path: ['linha'],
    message: 'Para avô/avó, informe a linha (paterna × materna) — art. 1.836, §2º.',
  });

type NovoHerdeiro = z.infer<typeof esquemaHerdeiro>;

function EditorHerdeiros({
  estado,
  onChange,
}: {
  estado: EstadoFamilia;
  onChange: (e: EstadoFamilia) => void;
}) {
  const { herdeiros, temSobrevivente } = estado;
  const [aberto, setAberto] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovoHerdeiro>({
    resolver: zodResolver(esquemaHerdeiro),
    defaultValues: {
      nome: '',
      parentesco: 'FILHO',
      linha: '',
      vinculoIrmao: 'BILATERAL',
      status: 'ATIVO',
      comum: true,
      incapaz: false,
    },
  });
  const parentescoEscolhido = useWatch({ control, name: 'parentesco' });

  const adicionar = (dados: NovoHerdeiro) => {
    // Cônjuge/convivente não entra na lista de herdeiros: o direito dele(a)
    // (meação + concorrência do art. 1.829/1.832, ou herança sozinho no
    // inciso III) sai do bloco "Havia cônjuge ou companheiro(a)?" — a escolha
    // aqui só liga o bloco e leva o nome; a qualificação completa abre lá.
    if (dados.parentesco === 'CONJUGE') {
      onChange({ ...estado, temSobrevivente: true, nomeSobrev: nomeProprio(dados.nome) });
      reset();
      return;
    }
    const p = PARENTESCOS.find((x) => x.v === dados.parentesco) ?? PARENTESCOS[0];
    const novo: Herdeiro = {
      id: uid('h'),
      nome: nomeProprio(dados.nome),
      classe: p.classe,
      grau: p.grau,
      status: dados.status,
      // Linha das avós/avôs (divisão por linhas — art. 1.836, §2º).
      ...(p.v === 'AVO' && dados.linha ? { linha: dados.linha as 'PATERNA' | 'MATERNA' } : {}),
      // Irmão bilateral × unilateral (quota dobrada — art. 1.841).
      ...(p.v === 'IRMAO' ? { vinculoIrmao: dados.vinculoIrmao } : {}),
      ...(p.classe === 'DESCENDENTE' ? { filhoDoSobrevivente: dados.comum } : {}),
      menorOuIncapaz: dados.incapaz,
    };
    onChange({
      ...estado,
      herdeiros: [...herdeiros, novo],
      qualificacoes: { ...estado.qualificacoes, [novo.id]: QUALIFICACAO_VAZIA },
      perguntas: { ...estado.perguntas, [novo.id]: PERGUNTAS_ITCMD_VAZIAS },
    });
    reset();
    setAberto(novo.id);
  };

  const patchHerdeiro = (id: string, patch: Partial<Herdeiro>) =>
    onChange({
      ...estado,
      herdeiros: herdeiros.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    });

  const remover = (id: string) => {
    const qualificacoes = { ...estado.qualificacoes };
    const perguntas = { ...estado.perguntas };
    delete qualificacoes[id];
    delete perguntas[id];
    onChange({
      ...estado,
      herdeiros: herdeiros.filter((x) => x.id !== id),
      qualificacoes,
      perguntas,
      inventarianteId: estado.inventarianteId === id ? null : estado.inventarianteId,
    });
  };

  return (
    <>
      <form noValidate onSubmit={handleSubmit(adicionar)}>
        <div className="grade c3">
          <Field data-invalid={Boolean(errors.nome)}>
            <FieldLabel htmlFor="herdeiro-nome">Nome</FieldLabel>
            <Input
              id="herdeiro-nome"
                aria-invalid={Boolean(errors.nome)}
              {...register('nome')}
            />
            <FieldError errors={[errors.nome]} />
          </Field>
          <Field>
            <FieldLabel>Parentesco</FieldLabel>
            <Controller
              control={control}
              name="parentesco"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(String(v))}
                >
                  <SelectTrigger aria-label="Parentesco com o(a) falecido(a)">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENTESCOS.map((p) => (
                      <SelectItem key={p.v} value={p.v}>
                        {p.t}
                      </SelectItem>
                    ))}
                    <SelectItem value="CONJUGE">Cônjuge/Convivente</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {parentescoEscolhido !== 'CONJUGE' && (
          <Field>
            <FieldLabel>Situação</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => v && field.onChange(String(v))}
                >
                  <SelectTrigger aria-label="Situação do herdeiro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVO">Vivo(a)</SelectItem>
                    <SelectItem value="PRE_MORTO">Pré-morto(a)</SelectItem>
                    <SelectItem value="RENUNCIANTE">Renunciante</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          )}
          {parentescoEscolhido === 'AVO' && (
            <Field data-invalid={Boolean(errors.linha)}>
              <FieldLabel>Linha (art. 1.836, §2º)</FieldLabel>
              <Controller
                control={control}
                name="linha"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(String(v))}
                  >
                    <SelectTrigger aria-label="Linha paterna ou materna">
                      <SelectValue placeholder="Paterna × materna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PATERNA">Linha paterna</SelectItem>
                      <SelectItem value="MATERNA">Linha materna</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.linha]} />
            </Field>
          )}
          {parentescoEscolhido === 'IRMAO' && (
            <Field>
              <FieldLabel>Vínculo (art. 1.841)</FieldLabel>
              <Controller
                control={control}
                name="vinculoIrmao"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(String(v))}
                  >
                    <SelectTrigger aria-label="Irmão bilateral ou unilateral">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BILATERAL">Bilateral (mesmo pai e mãe)</SelectItem>
                      <SelectItem value="UNILATERAL">Unilateral (só pai OU só mãe)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          )}
          {parentescoEscolhido !== 'CONJUGE' && (
          <Field>
            <FieldLabel>Condições</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
              {temSobrevivente && (parentescoEscolhido === 'FILHO' || parentescoEscolhido === 'NETO') && (
                <Controller
                  control={control}
                  name="comum"
                  render={({ field }) => (
                    <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                      Filho(a) também do sobrevivente
                    </label>
                  )}
                />
              )}
              <Controller
                control={control}
                name="incapaz"
                render={({ field }) => (
                  <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                    Menor ou incapaz
                  </label>
                )}
              />
            </div>
          </Field>
          )}
        </div>
        {parentescoEscolhido === 'CONJUGE' && (
          <p className="fund" style={{ margin: '8px 0 0' }}>
            Cônjuge/convivente não entra na lista de herdeiros: ao adicionar, o nome liga o
            bloco &quot;Havia cônjuge ou companheiro(a)?&quot; acima — lá se escolhem o
            vínculo e o regime, abre a qualificação completa, e o motor calcula meação e
            concorrência (CC, arts. 1.829 e 1.832) sozinho.
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            {parentescoEscolhido === 'CONJUGE' ? 'Adicionar cônjuge/convivente' : 'Adicionar herdeiro'}
          </Button>
        </div>
      </form>

      {herdeiros.map((h) => (
        <div key={h.id}>
          <div className="linha-item">
            <span>
              <strong>{h.nome}</strong>
              <span className="fracao">
                {' '}
                · {rotuloParentesco(h)}
                {' '}· {h.status === 'ATIVO' ? 'vivo(a)' : h.status === 'PRE_MORTO' ? 'pré-morto(a)' : 'renunciante'}
                {h.classe === 'DESCENDENTE' && h.filhoDoSobrevivente === false ? ' · de outro relacionamento' : ''}
                {h.menorOuIncapaz ? ' · menor/incapaz' : ''}
              </span>
              {estado.inventarianteId === h.id && (
                <span className="fund" style={{ marginLeft: 6 }}>
                  ★ inventariante
                </span>
              )}
            </span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Renúncia ABDICATIVA (pura e simples): a quota acresce aos
                  demais da classe e o item V soma UM ato sem valor declarado
                  por renunciante (Tabela de Notas, item 6.2). */}
              {h.status !== 'PRE_MORTO' && (
                <label className="marcar" style={{ margin: 0, fontWeight: 400, fontSize: 'var(--t-xs)' }}>
                  <Checkbox
                    checked={h.status === 'RENUNCIANTE'}
                    onCheckedChange={(v) =>
                      patchHerdeiro(h.id, { status: v === true ? 'RENUNCIANTE' : 'ATIVO' })
                    }
                  />
                  renúncia abdicativa
                </label>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                style={
                  estado.inventarianteId === h.id ? { color: 'var(--verde-registro)' } : undefined
                }
                onClick={() =>
                  onChange({
                    ...estado,
                    inventarianteId: estado.inventarianteId === h.id ? null : h.id,
                  })
                }
              >
                {estado.inventarianteId === h.id ? 'inventariante ✓' : 'tornar inventariante'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAberto(aberto === h.id ? null : h.id)}
              >
                {aberto === h.id ? 'fechar ficha' : 'editar ficha'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => remover(h.id)}
              >
                remover
              </Button>
            </span>
          </div>

          {aberto === h.id && (
            <div className="ficha">
              <div className="grade c2" style={{ marginBottom: 10 }}>
                <label className="campo">
                  Nome completo (como consta no documento)
                  <Input
                    value={h.nome}
                            onChange={(e) => patchHerdeiro(h.id, { nome: e.target.value })}
                  />
                </label>
              </div>
              <div className="escolha" style={{ marginBottom: 6 }}>
                <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                  <Checkbox
                    checked={h.menorOuIncapaz === true}
                    onCheckedChange={(v) => patchHerdeiro(h.id, { menorOuIncapaz: v === true })}
                  />
                  Menor ou incapaz (extrajudicial só com parecer favorável do MP — Res. CNJ 571/2024)
                </label>
              </div>
              <QualificacaoEditor
                titulo={`Qualificação — ${h.nome}`}
                valor={estado.qualificacoes[h.id] ?? QUALIFICACAO_VAZIA}
                onChange={(q) =>
                  onChange({ ...estado, qualificacoes: { ...estado.qualificacoes, [h.id]: q } })
                }
              />
              <h3 style={{ margin: '18px 0 8px', fontSize: 'var(--t-sm)' }}>Perguntas da declaração do ITCMD</h3>
              {ROTULOS_PERGUNTAS_ITCMD.map(({ campo, texto }) => {
                const atual = estado.perguntas[h.id] ?? PERGUNTAS_ITCMD_VAZIAS;
                const marcar = (v: boolean) =>
                  onChange({
                    ...estado,
                    perguntas: { ...estado.perguntas, [h.id]: { ...atual, [campo]: v } },
                  });
                return (
                  <div key={campo} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 'var(--t-sm)', marginBottom: 5 }}>{texto}</p>
                    <div className="escolha">
                      <Pilula ativo={atual[campo] === true} onClick={() => marcar(true)}>
                        Sim
                      </Pilula>
                      <Pilula ativo={atual[campo] === false} onClick={() => marcar(false)}>
                        Não
                      </Pilula>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <p className="fund" style={{ marginTop: 10 }}>
        Sem descendentes, lance os ASCENDENTES (pai/mãe; mortos os dois, avós por linha) e o
        motor segue os incisos do art. 1.829 — grau mais próximo exclui o mais remoto, o
        cônjuge concorre com os ascendentes (art. 1.837) e, sem ascendentes, herda sozinho;
        por fim os colaterais até o 4º grau. Ascendente já falecido: lance com a situação
        &quot;pré-morto(a)&quot; (na linha ascendente NÃO há representação — art. 1.852) ou
        simplesmente lance só quem está vivo.
      </p>
    </>
  );
}

/* ---------- sucessões cumuladas (CPC, art. 672) ---------- */

// SEM base transmitida nem contagem de imóveis (pedido do escritório): a
// base e os imóveis da sucessão saem dos BENS lançados no acervo — aqui só
// nasce a PESSOA (nome + fato gerador), e a ficha abre para qualificar.
const esquemaSucessao = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do(a) autor(a) desta sucessão.'),
  dataObito: z.string().min(1, 'Informe a data do óbito — é o fato gerador desta sucessão.'),
  vinculo: z.enum(['meeiro', 'herdeiro', 'mancomunheiro', 'nenhum'] as unknown as [
    VinculoSucessao,
    ...VinculoSucessao[],
  ]),
  mesmosHerdeiros: z.boolean(),
  mesmosBens: z.boolean(),
});

/** Explicação curta de cada vínculo, mostrada sob as pílulas. */
const DICAS_VINCULO: Record<VinculoSucessao, string> = {
  meeiro:
    'O padrão marido e mulher: transita a MEAÇÃO — 50% de cada bem comum do casal.',
  herdeiro:
    'Pai e filho: transita a fração que ele(a) HERDOU no falecimento anterior (ex.: 1/7 com sete herdeiros).',
  mancomunheiro:
    'Divórcio sem partilha dos bens: transita METADE do quinhão do falecimento anterior (1/7 vira 1/14).',
  nenhum:
    'Sem vínculo patrimonial com a cadeia — a sucessão vive só de bens particulares, lançados à parte no acervo.',
};

type NovaSucessao = z.infer<typeof esquemaSucessao>;

const brlSucessao = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function EditorSucessoes({
  herdeiros,
  sucessoes,
  setSucessoes,
  basesSucessoes = {},
  fracoesSucessoes = {},
  autorPrincipal = '',
  qualificacoes,
  onQualificacao,
}: {
  herdeiros: Herdeiro[];
  sucessoes: SucessaoCumulada[];
  setSucessoes: (s: SucessaoCumulada[]) => void;
  basesSucessoes?: Record<string, number>;
  /** Frações sugeridas pela cadeia (lib/partilha/cadeia), por id de sucessão. */
  fracoesSucessoes?: Record<string, FracaoDaCadeia>;
  /** Nome do(a) autor(a) do 1º falecimento — rotula a cadeia. */
  autorPrincipal?: string;
  /** Qualificação COMPLETA do(a) autor(a) de cada sucessão, guardada no MESMO
   *  registro das demais partes (chave = id da sucessão) — alimenta o bloco
   *  "º FALECIMENTO" da escritura de dois óbitos. */
  qualificacoes: Record<string, Qualificacao>;
  onQualificacao: (id: string, q: Qualificacao | null) => void;
}) {
  // Ficha aberta de UMA sucessão por vez (como o "editar" dos herdeiros).
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovaSucessao>({
    resolver: zodResolver(esquemaSucessao),
    defaultValues: {
      nome: '',
      dataObito: '',
      vinculo: 'meeiro',
      mesmosHerdeiros: true,
      mesmosBens: true,
    },
  });

  const lancar = (dados: NovaSucessao) => {
    const novo: SucessaoCumulada = {
      id: uid('su'),
      nome: nomeProprio(dados.nome),
      dataObito: dados.dataObito,
      vinculo: dados.vinculo,
      // O vínculo refere-se ao elo IMEDIATAMENTE anterior por padrão
      // (ajustável na ficha quando a cadeia tem mais elos).
      vinculoCom: sucessoes.length > 0 ? sucessoes[sucessoes.length - 1].id : ID_PRINCIPAL,
      // Legado zerado: a base/imóveis efetivos saem do acervo.
      base: '0.00',
      qtdImoveis: 0,
      mesmosHerdeiros: dados.mesmosHerdeiros,
      // Sem vínculo patrimonial nada transita: a sucessão nasce de bens
      // particulares — coerência que evita o monte zerado "misterioso".
      mesmosBens: dados.vinculo === 'nenhum' ? false : dados.mesmosBens,
    };
    setSucessoes([...sucessoes, novo]);
    // A ficha abre NA HORA: qualificar o(a) autor(a) desta sucessão como o
    // primeiro, e decidir os herdeiros dela — pedido do escritório.
    setFichaAberta(novo.id);
    reset();
  };

  const patchSucessao = (id: string, patch: Partial<SucessaoCumulada>) =>
    setSucessoes(sucessoes.map((su) => (su.id === id ? { ...su, ...patch } : su)));

  const alternarMesmosBens = (id: string) =>
    setSucessoes(
      sucessoes.map((su) =>
        su.id === id ? { ...su, mesmosBens: !(su.mesmosBens ?? true) } : su,
      ),
    );

  return (
    <div className="cartao">
      {sucessoes.map((su, indiceSu) => {
        const usaMesmosBens = su.mesmosBens ?? true;
        const monte = basesSucessoes[su.id];
        const fichaDesta = fichaAberta === su.id;
        const fracao = fracoesSucessoes[su.id];
        const vinculoSu: VinculoSucessao = su.vinculo ?? 'meeiro';
        const nomeDoElo = (id: string | undefined) => {
          const alvo =
            id ?? (indiceSu === 0 ? ID_PRINCIPAL : sucessoes[indiceSu - 1]?.id);
          if (alvo === ID_PRINCIPAL) return autorPrincipal || '1º falecimento';
          return sucessoes.find((x) => x.id === alvo)?.nome || 'sucessão anterior';
        };
        const nHerdeirosSu =
          (su.mesmosHerdeiros
            ? su.participantes
              ? su.participantes.length
              : herdeiros.length
            : 0) + (su.herdeirosProprios?.length ?? 0);
        return (
        <div key={su.id}>
        <div className="linha-item">
          <span>
            <strong>{su.nome}</strong>
            <span className="fracao num">
              {' '}
              · óbito em {su.dataObito ? formatarData(su.dataObito) : '—'} · monte partível{' '}
              {brlSucessao(monte !== undefined ? monte : Number(su.base))}
            </span>
            <span className="fund" style={{ display: 'block', marginTop: 2 }}>
              {ROTULOS_VINCULO[vinculoSu].toLowerCase()} de {nomeDoElo(su.vinculoCom)}
              {fracao && fracao.fracaoMonte > 0 && usaMesmosBens
                ? ` — transita ${fracaoDaCadeiaBonita(fracao.fracaoMonte)} de cada bem comum`
                : ''}
              {!usaMesmosBens ? ' — bens particulares, lançados à parte no acervo' : ''}
              {' · '}
              {nHerdeirosSu > 0
                ? `${nHerdeirosSu} herdeiro(s) nesta sucessão — partilha própria no item III`
                : 'defina os herdeiros dela na ficha'}
            </span>
            {(monte ?? Number(su.base) ?? 0) === 0 && (
              <span className="fund" style={{ display: 'block' }}>
                (o monte sai dos bens do acervo — lance-os no item II)
              </span>
            )}
          </span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              style={usaMesmosBens ? { color: 'var(--verde-registro)' } : { color: 'var(--bronze)' }}
              onClick={() => alternarMesmosBens(su.id)}
            >
              {usaMesmosBens ? 'mesmos bens ✓' : 'bens particulares'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={fichaDesta}
              onClick={() => setFichaAberta(fichaDesta ? null : su.id)}
            >
              {fichaDesta ? 'fechar ficha' : 'qualificação e herdeiros'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                setSucessoes(sucessoes.filter((x) => x.id !== su.id));
                // A ficha viaja com a sucessão: remover uma apaga a outra.
                onQualificacao(su.id, null);
                if (fichaDesta) setFichaAberta(null);
              }}
            >
              remover
            </Button>
          </span>
        </div>
        {fichaDesta && (
          <div className="ficha" style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 10 }}>
              <span className="eyebrow">Quem era {su.nome || 'o(a) autor(a)'} na cadeia?</span>
              <div className="escolha" style={{ marginTop: 6 }}>
                {(Object.keys(ROTULOS_VINCULO) as VinculoSucessao[]).map((v) => (
                  <Pilula
                    key={v}
                    ativo={vinculoSu === v}
                    onClick={() =>
                      patchSucessao(su.id, {
                        vinculo: v,
                        // Coerência do lançamento: sem vínculo, nada transita.
                        ...(v === 'nenhum' ? { mesmosBens: false } : {}),
                      })
                    }
                  >
                    {ROTULOS_VINCULO[v]}
                  </Pilula>
                ))}
              </div>
              <p className="fund" style={{ margin: '6px 0 0' }}>
                {DICAS_VINCULO[vinculoSu]}
                {fracao && fracao.fracaoMonte > 0 && usaMesmosBens
                  ? ` Fração sugerida: ${fracaoDaCadeiaBonita(fracao.fracaoMonte)} de cada bem comum — ajustável bem a bem no acervo. Quem herdou em MAIS de uma sucessão anterior acumula frações: confira e some no acervo.`
                  : ''}
              </p>
              {(indiceSu > 0 || sucessoes.length > 1) && vinculoSu !== 'nenhum' && (
                <label className="campo" style={{ marginTop: 8, maxWidth: 360 }}>
                  <span>Vínculo em relação a</span>
                  <select
                    className="seletor"
                    value={su.vinculoCom ?? (indiceSu === 0 ? ID_PRINCIPAL : sucessoes[indiceSu - 1].id)}
                    onChange={(e) => patchSucessao(su.id, { vinculoCom: e.target.value })}
                  >
                    <option value={ID_PRINCIPAL}>
                      {autorPrincipal || '1º falecimento'} (1ª sucessão)
                    </option>
                    {sucessoes
                      .filter((x, i) => i < indiceSu)
                      .map((x, i) => (
                        <option key={x.id} value={x.id}>
                          {x.nome || 'Sucessão'} ({i + 2}ª sucessão)
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <QualificacaoEditor
              titulo={`Qualificação — ${su.nome || 'autor(a) da sucessão'}`}
              valor={qualificacoes[su.id] ?? QUALIFICACAO_VAZIA}
              comConjuge={false}
              onChange={(q) => onQualificacao(su.id, q)}
            />
            <p className="fund" style={{ margin: '8px 0 0' }}>
              A ficha qualifica o(a) autor(a) desta sucessão no bloco &quot;
              {sucessoes.findIndex((x) => x.id === su.id) + 2}º FALECIMENTO&quot; da
              escritura de dois (ou mais) óbitos — campo vazio vira lacuna para o balcão.
            </p>
            <HerdeirosDaSucessao
              sucessao={su}
              herdeiros={herdeiros}
              onPatch={(patch) => patchSucessao(su.id, patch)}
              qualificacoes={qualificacoes}
              onQualificacao={onQualificacao}
            />
          </div>
        )}
        </div>
        );
      })}

      {sucessoes.length > 0 && (
        <div className="nota" style={{ marginTop: 10 }}>
          <span className="eyebrow">A cadeia deste inventário</span>
          <p style={{ margin: '4px 0 0' }}>
            {[
              `1ª sucessão — ${autorPrincipal || 'autor(a) da herança'} (${herdeiros.length} herdeiro(s))`,
              ...sucessoes.map((su, i) => {
                const f = fracoesSucessoes[su.id];
                const detalhe =
                  (su.mesmosBens ?? true) && f && f.fracaoMonte > 0
                    ? `transita ${fracaoDaCadeiaBonita(f.fracaoMonte)}`
                    : 'bens particulares';
                return `${i + 2}ª — ${su.nome || '(sem nome)'} (${detalhe}${
                  basesSucessoes[su.id] ? ` · monte ${brlSucessao(basesSucessoes[su.id])}` : ''
                })`;
              }),
            ].join('  →  ')}
          </p>
          <p className="fund" style={{ margin: '4px 0 0' }}>
            Cada elo gera a própria declaração de ITCMD, os próprios atos de escritura e
            registro e a própria partilha no item III — tudo somado no orçamento do caso.
          </p>
        </div>
      )}

      <form noValidate onSubmit={handleSubmit(lancar)}>
        <div className="grade c2" style={{ marginTop: sucessoes.length > 0 ? 12 : 0 }}>
          <Field data-invalid={Boolean(errors.nome)}>
            <FieldLabel htmlFor="sucessao-nome">Autor(a) da sucessão cumulada</FieldLabel>
            <Input id="sucessao-nome" aria-invalid={Boolean(errors.nome)} {...register('nome')} />
            <FieldError errors={[errors.nome]} />
          </Field>
          <Field data-invalid={Boolean(errors.dataObito)}>
            <FieldLabel>Data do óbito (fato gerador)</FieldLabel>
            <Controller
              control={control}
              name="dataObito"
              render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />}
            />
            <FieldError errors={[errors.dataObito]} />
          </Field>
        </div>
        {/* Base transmitida e contagem de imóveis SAÍRAM do formulário
            (pedido do escritório): esses números são derivados dos bens do
            acervo — comum às sucessões ou exclusivo desta — nunca digitados. */}
        <div style={{ marginTop: 10 }}>
          <span className="fund" style={{ display: 'block', marginBottom: 6 }}>
            Quem era essa pessoa em relação ao falecimento anterior? (define a fração dos
            bens que transita — ajustável depois)
          </span>
          <Controller
            control={control}
            name="vinculo"
            render={({ field }) => (
              <div className="escolha">
                {(Object.keys(ROTULOS_VINCULO) as VinculoSucessao[]).map((v) => (
                  <Pilula key={v} ativo={field.value === v} onClick={() => field.onChange(v)}>
                    {ROTULOS_VINCULO[v]}
                  </Pilula>
                ))}
              </div>
            )}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Controller
            control={control}
            name="mesmosBens"
            render={({ field }) => (
              <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                Usar os MESMOS bens do 1º falecimento — no acervo, cada bem abre um campo de
                valor de avaliação para esta data de óbito (desmarque para lançar BENS
                PARTICULARES desta sucessão à parte)
              </label>
            )}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Controller
            control={control}
            name="mesmosHerdeiros"
            render={({ field }) => (
              <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                Usar os herdeiros deste inventário nesta sucessão (todos, ou só alguns —
                o recorte e os herdeiros PRÓPRIOS dela ficam na ficha, sem requalificar
                ninguém) — o item III ganha uma partilha própria para ela
                {herdeiros.length === 0 ? ' (lance os herdeiros abaixo)' : ''}
              </label>
            )}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            Adicionar sucessão
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ---------- herdeiros de UMA sucessão cumulada ---------- */

const esquemaHerdeiroSucessao = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do herdeiro desta sucessão.'),
  parentesco: z.enum(PARENTESCOS.map((p) => p.v) as [ParentescoId, ...ParentescoId[]]),
  incapaz: z.boolean(),
});

type NovoHerdeiroSucessao = z.infer<typeof esquemaHerdeiroSucessao>;

/**
 * Quem herda NESTA sucessão: os herdeiros do inventário principal (todos, ou
 * só alguns — sem requalificar ninguém) + herdeiros PRÓPRIOS dela (ex.: filho
 * de outro leito do(a) 2º falecido(a)), com ficha completa por herdeiro.
 * O parentesco dos próprios é relativo ao(à) autor(a) DESTA sucessão.
 */
function HerdeirosDaSucessao({
  sucessao,
  herdeiros,
  onPatch,
  qualificacoes,
  onQualificacao,
}: {
  sucessao: SucessaoCumulada;
  herdeiros: Herdeiro[];
  onPatch: (patch: Partial<SucessaoCumulada>) => void;
  qualificacoes: Record<string, Qualificacao>;
  onQualificacao: (id: string, q: Qualificacao | null) => void;
}) {
  const [fichaPropria, setFichaPropria] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovoHerdeiroSucessao>({
    resolver: zodResolver(esquemaHerdeiroSucessao),
    defaultValues: { nome: '', parentesco: 'FILHO', incapaz: false },
  });

  const proprios = sucessao.herdeirosProprios ?? [];
  const usaTodos = sucessao.mesmosHerdeiros !== false && sucessao.participantes === undefined;
  const usaAlguns = sucessao.mesmosHerdeiros !== false && sucessao.participantes !== undefined;

  const adicionarProprio = (dados: NovoHerdeiroSucessao) => {
    const p = PARENTESCOS.find((x) => x.v === dados.parentesco) ?? PARENTESCOS[0];
    const novo: Herdeiro = {
      id: uid('hs'),
      nome: nomeProprio(dados.nome),
      classe: p.classe,
      grau: p.grau,
      status: 'ATIVO',
      menorOuIncapaz: dados.incapaz,
    };
    onPatch({ herdeirosProprios: [...proprios, novo] });
    reset();
    setFichaPropria(novo.id);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <span className="eyebrow">Herdeiros desta sucessão</span>
      <p className="fund" style={{ margin: '4px 0 8px' }}>
        Os herdeiros do 1º falecimento entram SEM requalificar — escolha todos ou só
        alguns. Herdeiro que só existe nesta sucessão entra como PRÓPRIO dela, com ficha
        completa (o parentesco é em relação a {sucessao.nome || 'este(a) autor(a)'}).
      </p>
      <div className="escolha">
        <Pilula
          ativo={usaTodos}
          onClick={() => onPatch({ mesmosHerdeiros: true, participantes: undefined })}
        >
          Todos os do 1º falecimento
        </Pilula>
        <Pilula
          ativo={usaAlguns}
          onClick={() =>
            onPatch({ mesmosHerdeiros: true, participantes: herdeiros.map((h) => h.id) })
          }
        >
          Alguns deles
        </Pilula>
        <Pilula
          ativo={sucessao.mesmosHerdeiros === false}
          onClick={() => onPatch({ mesmosHerdeiros: false, participantes: undefined })}
        >
          Nenhum (só herdeiros próprios)
        </Pilula>
      </div>

      {usaAlguns && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {herdeiros.length === 0 && (
            <p className="fund" style={{ margin: 0 }}>
              Lance os herdeiros do inventário principal abaixo para escolher aqui.
            </p>
          )}
          {herdeiros.map((h) => {
            const marcado = (sucessao.participantes ?? []).includes(h.id);
            return (
              <label key={h.id} className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                <Checkbox
                  checked={marcado}
                  onCheckedChange={(v) => {
                    const atual = sucessao.participantes ?? [];
                    onPatch({
                      participantes:
                        v === true ? [...atual, h.id] : atual.filter((x) => x !== h.id),
                    });
                  }}
                />
                {h.nome} <span className="fracao">({rotuloParentesco(h)} do 1º falecimento)</span>
              </label>
            );
          })}
        </div>
      )}

      {proprios.map((h) => (
        <div key={h.id}>
          <div className="linha-item">
            <span>
              <strong>{h.nome}</strong>
              <span className="fracao"> · {rotuloParentesco(h)} desta sucessão</span>
              {h.menorOuIncapaz && <span className="fracao"> · menor/incapaz</span>}
            </span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={fichaPropria === h.id}
                onClick={() => setFichaPropria(fichaPropria === h.id ? null : h.id)}
              >
                {fichaPropria === h.id ? 'fechar qualificação' : 'qualificação'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  onPatch({ herdeirosProprios: proprios.filter((x) => x.id !== h.id) });
                  onQualificacao(h.id, null);
                  if (fichaPropria === h.id) setFichaPropria(null);
                }}
              >
                remover
              </Button>
            </span>
          </div>
          {fichaPropria === h.id && (
            <div className="ficha" style={{ marginTop: 8 }}>
              <QualificacaoEditor
                titulo={`Qualificação — ${h.nome}`}
                valor={qualificacoes[h.id] ?? QUALIFICACAO_VAZIA}
                onChange={(q) => onQualificacao(h.id, q)}
              />
            </div>
          )}
        </div>
      ))}

      <form noValidate onSubmit={handleSubmit(adicionarProprio)}>
        <div className="grade c3" style={{ marginTop: 10 }}>
          <Field data-invalid={Boolean(errors.nome)}>
            <FieldLabel htmlFor={`hs-nome-${sucessao.id}`}>Herdeiro próprio desta sucessão</FieldLabel>
            <Input
              id={`hs-nome-${sucessao.id}`}
              aria-invalid={Boolean(errors.nome)}
              {...register('nome')}
            />
            <FieldError errors={[errors.nome]} />
          </Field>
          <Field>
            <FieldLabel>Parentesco (com este(a) autor(a))</FieldLabel>
            <Controller
              control={control}
              name="parentesco"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v && field.onChange(String(v))}>
                  <SelectTrigger aria-label="Parentesco com o(a) autor(a) desta sucessão">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARENTESCOS.map((p) => (
                      <SelectItem key={p.v} value={p.v}>
                        {p.t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field>
            <FieldLabel>Condições</FieldLabel>
            <div style={{ paddingTop: 4 }}>
              <Controller
                control={control}
                name="incapaz"
                render={({ field }) => (
                  <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                    Menor ou incapaz
                  </label>
                )}
              />
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button type="submit" variant="outline" size="sm">
            Adicionar herdeiro próprio
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ---------- qualificação ---------- */

/**
 * Marcador do PAR estado→município dentro da lista de campos.
 *
 * O editor renderiza os campos por um loop genérico (um <label> por chave da
 * Qualificacao), e cidade+UF deixaram de ser dois campos independentes: viraram
 * um controle só, em que escolher a UF carrega a lista daquele estado. Em vez
 * de quebrar o loop em dois, a lista carrega este marcador na POSIÇÃO em que o
 * par deve aparecer (entre bairro e CEP) e o loop o troca pelo seletor.
 */
const PAR_MUNICIPIO = '__municipio__' as const;

interface CampoQualificacao {
  campo: keyof Qualificacao | typeof PAR_MUNICIPIO;
  rotulo: string;
}

/** Agrupada na ordem em que a qualificação é lida numa escritura. A antiga
 *  divisão "Identificação" × "Dados pessoais" foi UNIFICADA num grupo só
 *  (pedido do escritório): a ficha fica mais curta, com mais campos por
 *  linha, sem perder nenhum campo. */
const GRUPOS_QUALIFICACAO: { rotulo: string; campos: CampoQualificacao[] }[] = [
  {
    rotulo: 'Identificação',
    campos: [
      { campo: 'cpf', rotulo: 'CPF' },
      { campo: 'rg', rotulo: 'RG' },
      { campo: 'dataNascimento', rotulo: 'Data de nascimento' },
      { campo: 'filiacao', rotulo: 'Filiação' },
      { campo: 'nacionalidade', rotulo: 'Nacionalidade' },
      { campo: 'estadoCivil', rotulo: 'Estado civil' },
      { campo: 'profissao', rotulo: 'Profissão' },
      { campo: 'email', rotulo: 'E-mail' },
    ],
  },
  {
    rotulo: 'Endereço',
    campos: [
      { campo: 'endereco', rotulo: 'Endereço (rua e número)' },
      { campo: 'complemento', rotulo: 'Complemento' },
      { campo: 'bairro', rotulo: 'Bairro' },
      { campo: PAR_MUNICIPIO, rotulo: 'Cidade' },
      { campo: 'cep', rotulo: 'CEP' },
    ],
  },
];

/** Estados civis da escolha fechada — união estável NÃO entra (não é estado
 *  civil; ela é a caixa própria ao lado, e o convivente mantém o seu). */
const ESTADOS_CIVIS = ['solteiro(a)', 'casado(a)', 'divorciado(a)', 'viúvo(a)'] as const;

/** Só para herdeiros — o viúvo(a) não tem "cônjuge do cônjuge". */
const GRUPO_CONJUGE: { rotulo: string; campos: CampoQualificacao[] } = {
  rotulo: 'Cônjuge do herdeiro (se casado) e casamento',
  campos: [
    { campo: 'conjugeNome', rotulo: 'Nome completo' },
    { campo: 'conjugeNacionalidade', rotulo: 'Nacionalidade' },
    { campo: 'conjugeCpf', rotulo: 'CPF' },
    { campo: 'conjugeRg', rotulo: 'RG' },
    { campo: 'conjugeDataNascimento', rotulo: 'Data de nascimento' },
    { campo: 'conjugeFiliacao', rotulo: 'Filiação' },
    { campo: 'conjugeProfissao', rotulo: 'Profissão' },
    { campo: 'conjugeEmail', rotulo: 'E-mail' },
    { campo: 'casamentoData', rotulo: 'Data do casamento' },
    { campo: 'casamentoRegime', rotulo: 'Regime de bens' },
    { campo: 'casamentoCertidao', rotulo: 'Certidão de casamento (matrícula/ORCPN)' },
  ],
};

/** Campos de texto LONGO (T5): ocupam a linha inteira do grid — filiação,
 *  endereço e matrículas de certidão cortavam o valor sem forma de vê-lo. */
const CAMPOS_LONGOS = new Set<keyof Qualificacao>([
  'filiacao',
  'endereco',
  'conjugeFiliacao',
  'casamentoCertidao',
]);

/** Campos de data da ficha — entram com o DateInput, não com Input livre. */
const CAMPOS_DE_DATA = new Set<keyof Qualificacao>([
  'dataNascimento',
  'conjugeDataNascimento',
  'casamentoData',
]);

export function QualificacaoEditor({
  titulo,
  valor,
  onChange,
  comConjuge = true,
}: {
  /** Omitido = campos direto, sem divisão própria (ficha do falecido). */
  titulo?: string;
  valor: Qualificacao;
  onChange: (q: Qualificacao) => void;
  /** false para o(a) sobrevivente: cônjuge do cônjuge não existe. */
  comConjuge?: boolean;
}) {
  const casado = (valor.estadoCivil ?? '').toLowerCase().includes('casad');
  const convivente = valor.uniaoEstavel === true;
  // O bloco do cônjuge/convivente só abre quando existe um: casado OU em
  // união estável — pedido do escritório (e o rótulo acompanha o vínculo).
  const grupos =
    comConjuge && (casado || convivente)
      ? [
          ...GRUPOS_QUALIFICACAO,
          {
            ...GRUPO_CONJUGE,
            rotulo: casado
              ? 'Cônjuge do herdeiro e casamento'
              : 'Convivente (união estável) — o(a) convivente mantém o próprio estado civil',
          },
        ]
      : GRUPOS_QUALIFICACAO;

  const rotuloConjuge = (rotulo: string) =>
    casado
      ? rotulo
      : rotulo
          .replace('Data do casamento', 'Data do início da união')
          .replace('Regime de bens', 'Regime de bens (contrato/escritura da união)')
          .replace('Certidão de casamento (matrícula/ORCPN)', 'Escritura/registro da união estável');

  return (
    <div style={{ marginTop: 14 }}>
      {titulo && <span className="eyebrow">{titulo}</span>}
      {grupos.map((grupo) => (
        <div key={grupo.rotulo} style={{ marginTop: 12 }}>
          <p className="q-grupo">{grupo.rotulo}</p>
          <div className="grade q-grid">
            {grupo.campos.map(({ campo, rotulo }) =>
              // O par estado→município é um controle só e traz os próprios
              // rótulos — fica FORA do <label> genérico (label dentro de label
              // é HTML inválido e rouba o clique do controle de dentro).
              campo === PAR_MUNICIPIO ? (
                <SeletorMunicipio
                  key={campo}
                  uf={valor.uf}
                  municipio={valor.cidade}
                  rotuloMunicipio={rotulo}
                  onChange={({ uf, municipio }) =>
                    onChange({ ...valor, uf, cidade: municipio })
                  }
                />
              ) : (
              <label
                className={`campo${CAMPOS_LONGOS.has(campo) ? ' campo-longo' : ''}`}
                key={campo}
              >
                {grupo === GRUPOS_QUALIFICACAO[0] || casado ? rotulo : rotuloConjuge(rotulo)}
                {campo === 'estadoCivil' ? (
                  // Escolha FECHADA (pedido do escritório): solteiro · casado ·
                  // divorciado · viúvo. Valor legado fora da lista vira opção
                  // extra para não sumir da ficha.
                  <select
                    className="seletor"
                    value={valor.estadoCivil}
                    onChange={(e) => onChange({ ...valor, estadoCivil: e.target.value })}
                  >
                    <option value="">—</option>
                    {ESTADOS_CIVIS.map((ec) => (
                      <option key={ec} value={ec}>
                        {ec}
                      </option>
                    ))}
                    {valor.estadoCivil &&
                      !(ESTADOS_CIVIS as readonly string[]).includes(valor.estadoCivil) && (
                        <option value={valor.estadoCivil}>{valor.estadoCivil}</option>
                      )}
                  </select>
                ) : CAMPOS_DE_DATA.has(campo) ? (
                  <DateInput
                    value={valor[campo] as string}
                    onChange={(iso) => onChange({ ...valor, [campo]: iso })}
                  />
                ) : (
                  <Input
                    value={valor[campo] as string}
                    title={CAMPOS_LONGOS.has(campo) ? ((valor[campo] as string) ?? '') : undefined}
                    inputMode={campo === 'cpf' || campo === 'conjugeCpf' ? 'numeric' : undefined}
                    onChange={(e) =>
                      onChange({
                        ...valor,
                        [campo]:
                          campo === 'cpf' || campo === 'conjugeCpf'
                            ? mascararCpf(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </label>
              ),
            )}
            {grupo === GRUPOS_QUALIFICACAO[0] && (
              <label className="marcar" style={{ margin: 0, fontWeight: 400, alignSelf: 'end' }}>
                <Checkbox
                  checked={convivente}
                  onCheckedChange={(v) => onChange({ ...valor, uniaoEstavel: v === true })}
                />
                Convive em união estável
              </label>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
