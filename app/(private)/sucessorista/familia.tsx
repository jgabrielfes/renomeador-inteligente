/**
 * Item I — A família.
 *
 * Abre o caso: dados do falecido (óbito, vínculo, regime, data do casamento),
 * herdeiros com qualificação completa (planilha do escritório) e as respostas
 * das perguntas da declaração do ITCMD-SP, que alimentam o item V.
 */

import { useState } from 'react';
import type { Herdeiro, Regime, Vinculo } from '@/lib/partilha/types';
import {
  composicaoFamiliar,
  QUALIFICACAO_VAZIA,
  PERGUNTAS_ITCMD_VAZIAS,
  ROTULOS_PERGUNTAS_ITCMD,
  type DadosFalecido,
  type PerguntasItcmd,
  type Qualificacao,
} from '@/lib/partilha/familia';

/** Alias estrutural — compatível com o ChangeEvent de input, select e checkbox. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };

let seq = 0;
const uid = (p: string) => `${p}${(seq += 1)}`;

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
        O caso começa aqui: quem faleceu, quando, sob qual regime — e quem fica. A
        qualificação preenchida nesta folha alimenta a escritura, o espelho do ITCMD e o
        cofre de documentos.
      </p>

      <span className="eyebrow">Autor(a) da herança</span>
      <div className="grade c2" style={{ marginTop: 10 }}>
        <label className="campo">
          Nome completo
          <input
            type="text"
            value={falecido.nome}
            onChange={(e: Ev) => setFalecido({ nome: e.target.value })}
            placeholder="Antonio"
          />
        </label>
        <label className="campo">
          CPF
          <input
            type="text"
            value={falecido.cpf}
            onChange={(e: Ev) => setFalecido({ cpf: e.target.value })}
            placeholder="000.000.000-00"
          />
        </label>
        <label className="campo">
          Data do óbito (fato gerador do ITCMD)
          <input
            type="date"
            value={falecido.dataObito}
            onChange={(e: Ev) => setFalecido({ dataObito: e.target.value })}
          />
        </label>
        <label className="campo">
          Último domicílio (cidade/UF)
          <input
            type="text"
            value={falecido.ultimoDomicilio}
            onChange={(e: Ev) => setFalecido({ ultimoDomicilio: e.target.value })}
            placeholder="Guarulhos/SP"
          />
        </label>
      </div>

      <h2>Havia cônjuge ou companheiro(a)?</h2>
      <div className="escolha">
        <button aria-pressed={temSobrevivente} onClick={() => set({ temSobrevivente: true })}>
          Sim
        </button>
        <button aria-pressed={!temSobrevivente} onClick={() => set({ temSobrevivente: false })}>
          Não
        </button>
      </div>

      {temSobrevivente && (
        <>
          <h2>Vínculo e regime de bens</h2>
          <div className="escolha">
            <button aria-pressed={vinculo === 'CASAMENTO'} onClick={() => set({ vinculo: 'CASAMENTO' })}>
              Casamento
            </button>
            <button
              aria-pressed={vinculo === 'UNIAO_ESTAVEL'}
              onClick={() => set({ vinculo: 'UNIAO_ESTAVEL' })}
            >
              União estável
            </button>
          </div>
          <div className="escolha" style={{ marginTop: 8 }}>
            {REGIMES.map((r) => (
              <button key={r.v} aria-pressed={regime === r.v} onClick={() => set({ regime: r.v })}>
                {r.t}
              </button>
            ))}
          </div>
          <div className="grade c2" style={{ marginTop: 14 }}>
            <label className="campo">
              Nome do(a) sobrevivente
              <input
                type="text"
                value={nomeSobrev}
                onChange={(e: Ev) => set({ nomeSobrev: e.target.value })}
                placeholder="Maria"
              />
            </label>
            <label className="campo">
              Data do casamento / início da união
              <input
                type="date"
                value={falecido.dataCasamento}
                onChange={(e: Ev) => setFalecido({ dataCasamento: e.target.value })}
              />
            </label>
          </div>
          <QualificacaoEditor
            titulo={`Qualificação — ${nomeSobrev || 'viúvo(a)'}`}
            valor={estado.qualificacoes['__sobrevivente__'] ?? QUALIFICACAO_VAZIA}
            onChange={(q) =>
              set({ qualificacoes: { ...estado.qualificacoes, __sobrevivente__: q } })
            }
          />
        </>
      )}

      <h2>Herdeiros</h2>
      <p className="subtitulo" style={{ marginBottom: 14 }}>
        Marque quem é filho(a) também do sobrevivente — em filiação híbrida a lei diverge e
        o espelho da partilha mostrará os dois cenários. As três perguntas de cada herdeiro
        são as da declaração do ITCMD e entram prontas no item V.
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
        <button className="acao" onClick={avancar}>
          Avançar ao acervo
        </button>
      </div>
    </section>
  );
}

function formatarDataCurta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/* ---------- herdeiros ---------- */

function EditorHerdeiros({
  estado,
  onChange,
}: {
  estado: EstadoFamilia;
  onChange: (e: EstadoFamilia) => void;
}) {
  const { herdeiros, temSobrevivente } = estado;
  const [nome, setNome] = useState('');
  const [status, setStatus] = useState<Herdeiro['status']>('ATIVO');
  const [comum, setComum] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const adicionar = () => {
    if (!nome.trim()) return;
    const novo: Herdeiro = {
      id: uid('h'),
      nome: nome.trim(),
      classe: 'DESCENDENTE',
      grau: 1,
      status,
      filhoDoSobrevivente: comum,
    };
    onChange({
      ...estado,
      herdeiros: [...herdeiros, novo],
      qualificacoes: { ...estado.qualificacoes, [novo.id]: QUALIFICACAO_VAZIA },
      perguntas: { ...estado.perguntas, [novo.id]: PERGUNTAS_ITCMD_VAZIAS },
    });
    setNome('');
    setStatus('ATIVO');
    setComum(true);
    setAberto(novo.id);
  };

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
    });
  };

  return (
    <>
      <div className="grade c3">
        <label className="campo">
          Nome
          <input type="text" value={nome} onChange={(e: Ev) => setNome(e.target.value)} placeholder="Ana" />
        </label>
        <label className="campo">
          Situação
          <select value={status} onChange={(e: Ev) => setStatus(e.target.value as Herdeiro['status'])}>
            <option value="ATIVO">Vivo(a)</option>
            <option value="PRE_MORTO">Pré-morto(a)</option>
            <option value="RENUNCIANTE">Renunciante</option>
          </select>
        </label>
        {temSobrevivente && (
          <label className="campo">
            Filho(a) do sobrevivente?
            <select value={comum ? 's' : 'n'} onChange={(e: Ev) => setComum(e.target.value === 's')}>
              <option value="s">Sim</option>
              <option value="n">Não</option>
            </select>
          </label>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="acao fantasma" onClick={adicionar}>
          Adicionar herdeiro
        </button>
      </div>

      {herdeiros.map((h) => (
        <div key={h.id}>
          <div className="linha-item">
            <span>
              <strong>{h.nome}</strong>
              <span className="fracao">
                {' '}
                · {h.status === 'ATIVO' ? 'vivo(a)' : h.status === 'PRE_MORTO' ? 'pré-morto(a)' : 'renunciante'}
                {h.filhoDoSobrevivente === false ? ' · de outro relacionamento' : ''}
              </span>
            </span>
            <span>
              <button
                className="remover"
                style={{ color: 'var(--bronze)' }}
                onClick={() => setAberto(aberto === h.id ? null : h.id)}
              >
                {aberto === h.id ? 'fechar ficha' : 'qualificação e ITCMD'}
              </button>
              <button className="remover" onClick={() => remover(h.id)}>
                remover
              </button>
            </span>
          </div>

          {aberto === h.id && (
            <div className="ficha">
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
                      <button aria-pressed={atual[campo] === true} onClick={() => marcar(true)}>
                        Sim
                      </button>
                      <button aria-pressed={atual[campo] === false} onClick={() => marcar(false)}>
                        Não
                      </button>
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

const CAMPOS_QUALIFICACAO: { campo: keyof Qualificacao; rotulo: string; placeholder?: string }[] = [
  { campo: 'rg', rotulo: 'RG' },
  { campo: 'cpf', rotulo: 'CPF', placeholder: '000.000.000-00' },
  { campo: 'dataNascimento', rotulo: 'Data de nascimento' },
  { campo: 'filiacao', rotulo: 'Filiação' },
  { campo: 'profissao', rotulo: 'Profissão' },
  { campo: 'estadoCivil', rotulo: 'Estado civil' },
  { campo: 'email', rotulo: 'E-mail' },
  { campo: 'endereco', rotulo: 'Endereço' },
  { campo: 'complemento', rotulo: 'Complemento' },
  { campo: 'bairro', rotulo: 'Bairro' },
  { campo: 'cidade', rotulo: 'Cidade' },
  { campo: 'uf', rotulo: 'Estado' },
  { campo: 'cep', rotulo: 'CEP' },
  { campo: 'conjugeNome', rotulo: 'Cônjuge — nome' },
  { campo: 'conjugeRg', rotulo: 'Cônjuge — RG' },
  { campo: 'conjugeCpf', rotulo: 'Cônjuge — CPF' },
  { campo: 'conjugeProfissao', rotulo: 'Cônjuge — profissão' },
  { campo: 'conjugeEmail', rotulo: 'Cônjuge — e-mail' },
];

export function QualificacaoEditor({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: Qualificacao;
  onChange: (q: Qualificacao) => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <span className="eyebrow">{titulo}</span>
      <div className="grade q-grid" style={{ marginTop: 8 }}>
        {CAMPOS_QUALIFICACAO.map(({ campo, rotulo, placeholder }) => (
          <label className="campo" key={campo}>
            {rotulo}
            <input
              type={campo === 'dataNascimento' ? 'date' : 'text'}
              value={valor[campo]}
              placeholder={placeholder}
              onChange={(e: Ev) => onChange({ ...valor, [campo]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
