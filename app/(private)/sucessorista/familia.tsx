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

import { Controller, useForm } from 'react-hook-form';
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
import type { Herdeiro, Regime, Vinculo } from '@/lib/partilha/types';
import {
  composicaoFamiliar,
  nomeProprio,
  QUALIFICACAO_VAZIA,
  PERGUNTAS_ITCMD_VAZIAS,
  ROTULOS_PERGUNTAS_ITCMD,
  type DadosFalecido,
  type PerguntasItcmd,
  type Qualificacao,
} from '@/lib/partilha/familia';

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
}: {
  estado: EstadoFamilia;
  onChange: (e: EstadoFamilia) => void;
  avancar: () => void;
}) {
  const { falecido, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros } = estado;
  const composicao = composicaoFamiliar(falecido, temSobrevivente, vinculo, regime, herdeiros);

  const set = (patch: Partial<EstadoFamilia>) => onChange({ ...estado, ...patch });
  const setFalecido = (patch: Partial<DadosFalecido>) =>
    set({ falecido: { ...falecido, ...patch } });

  return (
    <section>
      <h1>A família</h1>
      <p className="subtitulo">
        O caso começa aqui: quem faleceu, quando, sob qual regime — e quem fica. Cada campo
        preenchido move um número no painel ao lado na hora; a qualificação alimenta a
        escritura, o espelho do ITCMD e o cofre de documentos.
      </p>

      <span className="eyebrow">Autor(a) da herança</span>
      <div className="grade c2" style={{ marginTop: 10 }}>
        <label className="campo">
          Nome completo
          <Input
            value={falecido.nome}
            onChange={(e) => setFalecido({ nome: e.target.value })}
            placeholder="Antonio"
          />
        </label>
        <label className="campo">
          CPF
          <Input
            value={falecido.cpf}
            onChange={(e) => setFalecido({ cpf: mascararCpf(e.target.value) })}
            inputMode="numeric"
            placeholder="123.456.789-00"
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
        <label className="campo">
          Último domicílio (cidade/UF)
          <Input
            value={falecido.ultimoDomicilio}
            onChange={(e) => setFalecido({ ultimoDomicilio: e.target.value })}
            placeholder="Guarulhos/SP"
          />
        </label>
        <label className="campo">
          Local do falecimento
          <Input
            value={falecido.localFalecimento ?? ''}
            onChange={(e) => setFalecido({ localFalecimento: e.target.value })}
            placeholder="Hospital Stella Maris, Guarulhos/SP"
          />
        </label>
        <label className="campo">
          Certidão de óbito (matrícula/ORCPN)
          <Input
            value={falecido.certidaoObito ?? ''}
            onChange={(e) => setFalecido({ certidaoObito: e.target.value })}
            placeholder="matrícula nº …, ORCPN do 1º Subdistrito — Guarulhos/SP"
          />
        </label>
        <label className="campo">
          Certidão de casamento (matrícula/ORCPN)
          <Input
            value={falecido.certidaoCasamento ?? ''}
            onChange={(e) => setFalecido({ certidaoCasamento: e.target.value })}
            placeholder="matrícula nº …, ORCPN do 1º Subdistrito — Guarulhos/SP"
          />
        </label>
      </div>

      {/* Ficha completa do "de cujus" (RG, nascimento, filiação, endereço…):
          qualifica o(a) falecido(a) na escritura e nas petições. A leitura da
          certidão de óbito preenche o que constar. */}
      <QualificacaoEditor
        titulo="Qualificação do(a) autor(a) da herança (para a escritura)"
        valor={estado.qualificacoes['__falecido__'] ?? QUALIFICACAO_VAZIA}
        onChange={(q) =>
          onChange({ ...estado, qualificacoes: { ...estado.qualificacoes, ['__falecido__']: q } })
        }
        comConjuge={false}
      />

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
        <>
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
                placeholder="Maria"
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
        </>
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

      <h2>Composição familiar</h2>
      <div className="nota">
        <p>
          {falecido.nome || 'O(a) autor(a) da herança'}
          {falecido.dataObito ? `, falecido(a) em ${formatarDataCurta(falecido.dataObito)}` : ''}
          {': '}
          {composicao.resumo}.
        </p>
      </div>

      <div className="rodape-acoes">
        <span />
        <Button onClick={avancar}>Avançar ao acervo</Button>
      </div>
    </section>
  );
}

function formatarDataCurta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/* ---------- herdeiros ---------- */

const esquemaHerdeiro = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do herdeiro.'),
  status: z.enum(['ATIVO', 'PRE_MORTO', 'RENUNCIANTE']),
  comum: z.boolean(),
  incapaz: z.boolean(),
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
    defaultValues: { nome: '', status: 'ATIVO', comum: true, incapaz: false },
  });

  const adicionar = (dados: NovoHerdeiro) => {
    const novo: Herdeiro = {
      id: uid('h'),
      nome: nomeProprio(dados.nome),
      classe: 'DESCENDENTE',
      grau: 1,
      status: dados.status,
      filhoDoSobrevivente: dados.comum,
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
              placeholder="Ana"
              aria-invalid={Boolean(errors.nome)}
              {...register('nome')}
            />
            <FieldError errors={[errors.nome]} />
          </Field>
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
          <Field>
            <FieldLabel>Condições</FieldLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
              {temSobrevivente && (
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
        </div>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            Adicionar herdeiro
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
                · {h.status === 'ATIVO' ? 'vivo(a)' : h.status === 'PRE_MORTO' ? 'pré-morto(a)' : 'renunciante'}
                {h.filhoDoSobrevivente === false ? ' · de outro relacionamento' : ''}
                {h.menorOuIncapaz ? ' · menor/incapaz' : ''}
              </span>
              {estado.inventarianteId === h.id && (
                <span className="fund" style={{ marginLeft: 6 }}>
                  ★ inventariante
                </span>
              )}
            </span>
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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
                    placeholder="Renata Pummer Carvalho"
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
              <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Perguntas da declaração do ITCMD</h3>
              {ROTULOS_PERGUNTAS_ITCMD.map(({ campo, texto }) => {
                const atual = estado.perguntas[h.id] ?? PERGUNTAS_ITCMD_VAZIAS;
                const marcar = (v: boolean) =>
                  onChange({
                    ...estado,
                    perguntas: { ...estado.perguntas, [h.id]: { ...atual, [campo]: v } },
                  });
                return (
                  <div key={campo} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 13, marginBottom: 5 }}>{texto}</p>
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
        Representação de pré-morto por netos, ascendentes e colaterais: disponíveis no motor —
        nesta tela simplificada, casos com essas classes seguem pelo caso completo.
      </p>
    </>
  );
}

/* ---------- qualificação ---------- */

interface CampoQualificacao {
  campo: keyof Qualificacao;
  rotulo: string;
  placeholder?: string;
}

/** Agrupada na ordem em que a qualificação é lida numa escritura. */
const GRUPOS_QUALIFICACAO: { rotulo: string; campos: CampoQualificacao[] }[] = [
  {
    rotulo: 'Identificação',
    campos: [
      { campo: 'cpf', rotulo: 'CPF', placeholder: '123.456.789-00' },
      { campo: 'rg', rotulo: 'RG' },
      { campo: 'dataNascimento', rotulo: 'Data de nascimento' },
      { campo: 'filiacao', rotulo: 'Filiação' },
    ],
  },
  {
    rotulo: 'Dados pessoais',
    campos: [
      { campo: 'nacionalidade', rotulo: 'Nacionalidade', placeholder: 'brasileiro(a)' },
      { campo: 'estadoCivil', rotulo: 'Estado civil' },
      { campo: 'profissao', rotulo: 'Profissão' },
      { campo: 'email', rotulo: 'E-mail', placeholder: 'parte@exemplo.com' },
    ],
  },
  {
    rotulo: 'Endereço',
    campos: [
      { campo: 'endereco', rotulo: 'Endereço (rua e número)' },
      { campo: 'complemento', rotulo: 'Complemento' },
      { campo: 'bairro', rotulo: 'Bairro' },
      { campo: 'cidade', rotulo: 'Cidade' },
      { campo: 'uf', rotulo: 'Estado (UF)' },
      { campo: 'cep', rotulo: 'CEP', placeholder: '00000-000' },
    ],
  },
];

/** Só para herdeiros — o viúvo(a) não tem "cônjuge do cônjuge". */
const GRUPO_CONJUGE: { rotulo: string; campos: CampoQualificacao[] } = {
  rotulo: 'Cônjuge do herdeiro (se casado) e casamento',
  campos: [
    { campo: 'conjugeNome', rotulo: 'Nome completo' },
    { campo: 'conjugeNacionalidade', rotulo: 'Nacionalidade', placeholder: 'brasileiro(a)' },
    { campo: 'conjugeCpf', rotulo: 'CPF', placeholder: '123.456.789-00' },
    { campo: 'conjugeRg', rotulo: 'RG' },
    { campo: 'conjugeDataNascimento', rotulo: 'Data de nascimento' },
    { campo: 'conjugeFiliacao', rotulo: 'Filiação' },
    { campo: 'conjugeProfissao', rotulo: 'Profissão' },
    { campo: 'conjugeEmail', rotulo: 'E-mail' },
    { campo: 'casamentoData', rotulo: 'Data do casamento' },
    { campo: 'casamentoRegime', rotulo: 'Regime de bens', placeholder: 'comunhão parcial de bens' },
    { campo: 'casamentoCertidao', rotulo: 'Certidão de casamento (matrícula/ORCPN)' },
  ],
};

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
  titulo: string;
  valor: Qualificacao;
  onChange: (q: Qualificacao) => void;
  /** false para o(a) sobrevivente: cônjuge do cônjuge não existe. */
  comConjuge?: boolean;
}) {
  const grupos = comConjuge ? [...GRUPOS_QUALIFICACAO, GRUPO_CONJUGE] : GRUPOS_QUALIFICACAO;
  return (
    <div style={{ marginTop: 14 }}>
      <span className="eyebrow">{titulo}</span>
      {grupos.map((grupo) => (
        <div key={grupo.rotulo} style={{ marginTop: 12 }}>
          <p className="q-grupo">{grupo.rotulo}</p>
          <div className="grade q-grid">
            {grupo.campos.map(({ campo, rotulo, placeholder }) => (
              <label className="campo" key={campo}>
                {rotulo}
                {CAMPOS_DE_DATA.has(campo) ? (
                  <DateInput
                    value={valor[campo]}
                    onChange={(iso) => onChange({ ...valor, [campo]: iso })}
                  />
                ) : (
                  <Input
                    value={valor[campo]}
                    placeholder={placeholder}
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
