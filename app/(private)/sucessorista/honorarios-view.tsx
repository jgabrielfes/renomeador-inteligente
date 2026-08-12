/**
 * Aba VI — Honorários: proposta e contrato em DOCX com a qualificação das
 * partes já pronta (vem da folha), sugestão de precificação por complexidade
 * do caso e marca branca do escritório (logo + identificação no topo).
 *
 * A redação do corpo pode ser a sugerida pela IA (rota interna
 * /api/sucessorista — com fallback na redação padrão local) ou seguir o
 * MODELO anexado pelo próprio escritório. Os números nunca vêm da IA: o
 * quadro-resumo é determinístico, montado das condições digitadas aqui.
 *
 * Persistência: os dados do escritório (inclusive logo e modelos) valem para
 * TODOS os casos e ficam no localStorage deste navegador; as condições de
 * honorários são do caso e seguem no snapshot da folha (sessionStorage).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/currency-input';

import type { Bem, Resultado } from '@/lib/partilha/types';
import type { Qualificacao } from '@/lib/partilha/familia';
import {
  avaliarComplexidade,
  sugerirHonorarios,
  valorContratado,
  ROTULO_NIVEL,
  type CondicoesHonorarios,
} from '@/lib/partilha/honorarios';
import { ESCRITORIO_VAZIO, type DadosEscritorio, type SecaoRedigida } from '@/lib/partilha/honorarios-docx';
import { baixarBlob } from '@/lib/partilha/xlsx';
import type { EstadoFamilia } from './familia';
import { Pilula } from './familia';
import { paraDecimal } from './acervo-view';

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Perfil do escritório no localStorage — vale para todos os casos. */
const CHAVE_ESCRITORIO = 'sucessorista-escritorio';

interface ModeloEscritorio {
  nome: string;
  texto: string;
}

interface PerfilEscritorio {
  v: 1;
  escritorio: DadosEscritorio;
  modeloProposta: ModeloEscritorio | null;
  modeloContrato: ModeloEscritorio | null;
  usarIa: boolean;
}

type TipoDoc = 'PROPOSTA' | 'CONTRATO';

export function HonorariosView({
  familia,
  bens,
  dividas,
  resultado,
  temPartilhaDiferenciada,
  condicoes,
  setCondicoes,
}: {
  familia: EstadoFamilia;
  bens: Bem[];
  dividas: string;
  resultado: Resultado | null;
  temPartilhaDiferenciada: boolean;
  condicoes: CondicoesHonorarios;
  setCondicoes: (c: CondicoesHonorarios) => void;
}) {
  const { falecido, temSobrevivente, nomeSobrev, herdeiros, qualificacoes } = familia;

  /* --- perfil do escritório (marca branca) --- */
  const [escritorio, setEscritorio] = useState<DadosEscritorio>(ESCRITORIO_VAZIO);
  const [modeloProposta, setModeloProposta] = useState<ModeloEscritorio | null>(null);
  const [modeloContrato, setModeloContrato] = useState<ModeloEscritorio | null>(null);
  const [usarIa, setUsarIa] = useState(true);

  // Restaura uma vez (diferido — mesmo padrão do snapshot da folha) e só
  // então libera a gravação, para não sobrescrever o perfil com o vazio.
  const restauradoRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const bruto = localStorage.getItem(CHAVE_ESCRITORIO);
        if (bruto) {
          const salvo = JSON.parse(bruto) as PerfilEscritorio;
          if (salvo?.v === 1) {
            if (salvo.escritorio) setEscritorio({ ...ESCRITORIO_VAZIO, ...salvo.escritorio });
            if (salvo.modeloProposta) setModeloProposta(salvo.modeloProposta);
            if (salvo.modeloContrato) setModeloContrato(salvo.modeloContrato);
            if (typeof salvo.usarIa === 'boolean') setUsarIa(salvo.usarIa);
          }
        }
      } catch {
        // perfil corrompido: recomeça em branco
      }
      restauradoRef.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      const perfil: PerfilEscritorio = {
        v: 1,
        escritorio,
        modeloProposta,
        modeloContrato,
        usarIa,
      };
      localStorage.setItem(CHAVE_ESCRITORIO, JSON.stringify(perfil));
    } catch {
      // sem espaço (logo grande) ou modo restrito: o perfil é conforto
    }
  }, [escritorio, modeloProposta, modeloContrato, usarIa]);

  const setE = (patch: Partial<DadosEscritorio>) => setEscritorio({ ...escritorio, ...patch });

  /* --- complexidade e sugestão --- */
  const monteMor =
    resultado && resultado.bloqueios.length === 0 ? Number(resultado.acervo.massaPartilhavel) : null;

  const avaliacao = useMemo(
    () =>
      avaliarComplexidade({
        qtdHerdeiros: herdeiros.length,
        temPreMorto: herdeiros.some((h) => h.status === 'PRE_MORTO'),
        temRenunciante: herdeiros.some((h) => h.status === 'RENUNCIANTE'),
        temMenorOuIncapaz: herdeiros.some((h) => h.menorOuIncapaz === true),
        temSobrevivente,
        qtdBens: bens.length,
        qtdImoveis: bens.filter((b) => b.tipo === 'IMOVEL').length,
        temQuotasSocietarias: bens.some((b) => b.tipo === 'QUOTAS'),
        temDividas: Number(dividas.replace(/\./g, '').replace(',', '.')) > 0,
        temPartilhaDiferenciada,
        monteMor,
      }),
    [herdeiros, temSobrevivente, bens, dividas, temPartilhaDiferenciada, monteMor],
  );

  const sugestao = useMemo(() => sugerirHonorarios(avaliacao, monteMor), [avaliacao, monteMor]);

  const valorAtual = valorContratado(condicoes, monteMor);

  /* --- contratantes --- */
  const [contratante, setContratante] = useState<string>('TODOS');
  const opcoesContratante = useMemo(() => {
    const lista: { id: string; nome: string }[] = [
      { id: 'TODOS', nome: 'Todas as partes (sobrevivente e herdeiros)' },
    ];
    if (temSobrevivente && nomeSobrev.trim())
      lista.push({ id: '__sobrevivente__', nome: nomeSobrev.trim() });
    for (const h of herdeiros) lista.push({ id: h.id, nome: h.nome });
    return lista;
  }, [temSobrevivente, nomeSobrev, herdeiros]);

  const montarContratantes = (): { nome: string; qualificacao?: Qualificacao }[] => {
    const todos: { nome: string; qualificacao?: Qualificacao }[] = [];
    if (temSobrevivente && nomeSobrev.trim())
      todos.push({ nome: nomeSobrev.trim(), qualificacao: qualificacoes['__sobrevivente__'] });
    for (const h of herdeiros) todos.push({ nome: h.nome, qualificacao: qualificacoes[h.id] });
    if (contratante === 'TODOS') return todos;
    if (contratante === '__sobrevivente__')
      return todos.filter((c) => c.nome === nomeSobrev.trim()).slice(0, 1);
    const h = herdeiros.find((x) => x.id === contratante);
    return h ? [{ nome: h.nome, qualificacao: qualificacoes[h.id] }] : todos;
  };

  /* --- logo (marca branca) --- */
  const inputLogoRef = useRef<HTMLInputElement>(null);
  const carregarLogo = (file: File) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast.error('Logo em PNG ou JPG.');
      return;
    }
    if (file.size > 1_000_000) {
      toast.error('Logo até 1 MB — reduza a imagem.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () =>
        setEscritorio((prev) => ({
          ...prev,
          logoDataUrl: dataUrl,
          logoLarguraPx: img.naturalWidth,
          logoAlturaPx: img.naturalHeight,
        }));
      img.onerror = () => toast.error('Não foi possível ler a imagem.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  /* --- modelos do escritório --- */
  const carregarModelo = async (tipo: TipoDoc, file: File) => {
    try {
      let texto = '';
      if (/\.docx$/i.test(file.name)) {
        const { extrairTextoOffice } = await import('@/lib/office-texto');
        texto = await extrairTextoOffice(file);
      } else if (/\.txt$/i.test(file.name)) {
        texto = await file.text();
      } else if (/\.pdf$/i.test(file.name)) {
        const { readDocument } = await import('@/lib/ocr');
        texto = await readDocument(file);
      } else {
        toast.error('Modelo em .docx, .pdf ou .txt.');
        return;
      }
      texto = texto.trim().slice(0, 40_000);
      if (texto.length < 200) {
        toast.warning('O modelo ficou com pouco texto legível — a redação pode não conseguir segui-lo.');
      }
      const modelo = { nome: file.name, texto };
      if (tipo === 'PROPOSTA') setModeloProposta(modelo);
      else setModeloContrato(modelo);
      toast.success(`Modelo de ${tipo === 'PROPOSTA' ? 'proposta' : 'contrato'} carregado — a redação vai segui-lo.`);
    } catch {
      toast.error('Não foi possível ler o modelo.');
    }
  };

  /* --- geração --- */
  const [gerando, setGerando] = useState<TipoDoc | null>(null);

  const montarContexto = (tipo: TipoDoc): string => {
    const linhas: string[] = [];
    linhas.push(`Documento: ${tipo === 'PROPOSTA' ? 'proposta de honorários' : 'contrato de honorários'}.`);
    linhas.push(
      `Inventário de ${falecido.nome || '(nome não informado)'}${falecido.dataObito ? `, óbito em ${falecido.dataObito}` : ''}${falecido.ultimoDomicilio ? `, último domicílio ${falecido.ultimoDomicilio}` : ''}.`,
    );
    linhas.push(
      `Via provável: ${avaliacao.viaJudicial ? 'JUDICIAL (há herdeiro menor ou incapaz — CPC, art. 610)' : 'extrajudicial (CPC, art. 610, § 1º)'}.`,
    );
    linhas.push(
      `Partes: ${temSobrevivente && nomeSobrev.trim() ? `cônjuge/companheiro(a) sobrevivente ${nomeSobrev.trim()}; ` : ''}${herdeiros.length} herdeiro(s): ${herdeiros.map((h) => h.nome).join(', ') || '(nenhum lançado)'}.`,
    );
    linhas.push(
      `Acervo: ${bens.length} bem(ns)${monteMor !== null ? `; monte-mor ${brl(monteMor)}` : ' (espelho ainda não calculado)'}.`,
    );
    linhas.push(
      `Complexidade avaliada: ${ROTULO_NIVEL[avaliacao.nivel].toUpperCase()} (${avaliacao.pontos} ponto(s)). Fatores: ${avaliacao.fatores.map((f) => f.rotulo).join('; ') || 'nenhum'}.`,
    );
    linhas.push(
      `Honorários: ${
        condicoes.forma === 'PERCENTUAL'
          ? `${condicoes.percentual || '(percentual não informado)'}% sobre o monte-mor`
          : 'valor fixo'
      }${valorAtual !== null ? `, correspondente a ${brl(valorAtual)}` : ''}. Condições de pagamento: ${condicoes.condicoesPagamento.trim() || '(a definir)'}.`,
    );
    linhas.push(
      `Escritório contratado: ${escritorio.escritorio || escritorio.advogado || '(não informado)'}${escritorio.oab ? `, OAB ${escritorio.oab}` : ''}${escritorio.cidadeUf ? `, ${escritorio.cidadeUf}` : ''}.`,
    );
    return linhas.join('\n');
  };

  const gerar = async (tipo: TipoDoc) => {
    setGerando(tipo);
    try {
      let secoes: SecaoRedigida[] | null = null;
      if (usarIa) {
        try {
          const modelo = tipo === 'PROPOSTA' ? modeloProposta : modeloContrato;
          const r = await fetch('/api/sucessorista', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              tipo,
              contexto: montarContexto(tipo),
              modeloEscritorio: modelo?.texto ?? null,
            }),
          });
          const corpo = (await r.json().catch(() => null)) as { secoes?: SecaoRedigida[]; error?: string } | null;
          if (!r.ok || !corpo?.secoes?.length) {
            throw new Error(corpo?.error ?? `Falha na redação (HTTP ${r.status}).`);
          }
          secoes = corpo.secoes;
        } catch (e) {
          toast.warning('Redação por IA indisponível — saiu com a redação padrão local.', {
            description: e instanceof Error ? e.message : undefined,
          });
        }
      }

      const { montarHonorariosDocx } = await import('@/lib/partilha/honorarios-docx');
      const blob = await montarHonorariosDocx({
        tipo,
        escritorio,
        contratantes: montarContratantes(),
        falecido,
        qtdHerdeiros: herdeiros.length,
        qtdBens: bens.length,
        monteMor: monteMor !== null ? monteMor.toFixed(2) : null,
        avaliacao,
        condicoes,
        valorContratado: valorAtual,
        secoes,
      });
      const rotulo = tipo === 'PROPOSTA' ? 'Proposta de honorarios' : 'Contrato de honorarios';
      baixarBlob(blob, `${rotulo}${falecido.nome ? ` - Inventario de ${falecido.nome}` : ''}.docx`);
    } catch (e) {
      toast.error('Falha ao gerar o documento.', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGerando(null);
    }
  };

  /* ---------- render ---------- */

  return (
    <section>
      <h1>Honorários</h1>
      <p className="subtitulo">
        Proposta e contrato saem em DOCX com a qualificação das partes já pronta e a marca do
        seu escritório. A precificação sugerida acompanha a complexidade do caso — ajuste
        livre. Tudo é minuta: revisão e assinatura do(a) advogado(a) são obrigatórias.
      </p>

      <span className="eyebrow">O escritório (marca branca)</span>
      <p className="fund" style={{ margin: '4px 0 10px' }}>
        Estes dados (e o logo) valem para todos os casos e ficam só neste navegador.
      </p>
      <div className="grade c2">
        <label className="campo">
          Nome do escritório
          <Input value={escritorio.escritorio} onChange={(e) => setE({ escritorio: e.target.value })} placeholder="Silva & Associados Advocacia" />
        </label>
        <label className="campo">
          Advogado(a) responsável
          <Input value={escritorio.advogado} onChange={(e) => setE({ advogado: e.target.value })} />
        </label>
        <label className="campo">
          OAB (nº/UF)
          <Input value={escritorio.oab} onChange={(e) => setE({ oab: e.target.value })} placeholder="123.456/SP" />
        </label>
        <label className="campo">
          CPF/CNPJ
          <Input value={escritorio.cpfCnpj} onChange={(e) => setE({ cpfCnpj: e.target.value })} />
        </label>
        <label className="campo">
          Endereço profissional
          <Input value={escritorio.endereco} onChange={(e) => setE({ endereco: e.target.value })} />
        </label>
        <label className="campo">
          Cidade/UF
          <Input value={escritorio.cidadeUf} onChange={(e) => setE({ cidadeUf: e.target.value })} placeholder="Guarulhos/SP" />
        </label>
        <label className="campo">
          E-mail
          <Input value={escritorio.email} onChange={(e) => setE({ email: e.target.value })} />
        </label>
        <label className="campo">
          Telefone
          <Input value={escritorio.telefone} onChange={(e) => setE({ telefone: e.target.value })} />
        </label>
      </div>
      <div className="logo-marca">
        {escritorio.logoDataUrl ? (
          <>
            {/* Data URL local (marca branca) — next/image não se aplica aqui. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={escritorio.logoDataUrl} alt="Logo do escritório" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setE({ logoDataUrl: null, logoLarguraPx: null, logoAlturaPx: null })}
            >
              remover logo
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => inputLogoRef.current?.click()}>
            + logo do escritório (PNG/JPG)
          </Button>
        )}
        <input
          ref={inputLogoRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) carregarLogo(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </div>

      <h2>Complexidade do caso</h2>
      <div className="nota">
        <span className="eyebrow">Avaliação automática da folha</span>
        <h3>
          Complexidade {ROTULO_NIVEL[avaliacao.nivel]} · <span className="num">{avaliacao.pontos}</span> ponto(s)
          {avaliacao.viaJudicial ? ' · via judicial' : ''}
        </h3>
        {avaliacao.fatores.length === 0 ? (
          <p>Nenhum fator de agravamento identificado — caso de rotina pelo que a folha mostra.</p>
        ) : (
          avaliacao.fatores.map((f) => (
            <p key={f.rotulo}>
              +{f.pontos} · {f.rotulo}
            </p>
          ))
        )}
        {sugestao ? (
          <p style={{ marginTop: 8 }}>
            <strong>
              Sugestão: {sugestao.percentual}% sobre o monte-mor = {brl(sugestao.valor)}
            </strong>
            {sugestao.pisoAplicado ? ' (piso sugerido aplicado)' : ''} — ponto de partida; confira
            o piso da tabela de honorários da seccional da OAB.
          </p>
        ) : (
          <p style={{ marginTop: 8 }}>
            Calcule o espelho (itens I e II preenchidos) para a sugestão de valor — o percentual
            de partida do nível é {avaliacao.percentualSugerido}%.
          </p>
        )}
        {sugestao && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            style={{ marginTop: 6 }}
            onClick={() =>
              setCondicoes({
                ...condicoes,
                forma: 'PERCENTUAL',
                percentual: String(sugestao.percentual),
              })
            }
          >
            Usar a sugestão
          </Button>
        )}
      </div>

      <h2>Honorários e condições</h2>
      <div className="escolha">
        <Pilula ativo={condicoes.forma === 'PERCENTUAL'} onClick={() => setCondicoes({ ...condicoes, forma: 'PERCENTUAL' })}>
          Percentual sobre o monte-mor
        </Pilula>
        <Pilula ativo={condicoes.forma === 'FIXO'} onClick={() => setCondicoes({ ...condicoes, forma: 'FIXO' })}>
          Valor fixo
        </Pilula>
      </div>
      <div className="grade c2" style={{ marginTop: 10 }}>
        {condicoes.forma === 'PERCENTUAL' ? (
          <label className="campo">
            Percentual (%)
            <Input
              value={condicoes.percentual}
              inputMode="decimal"
              placeholder={String(avaliacao.percentualSugerido)}
              onChange={(e) => setCondicoes({ ...condicoes, percentual: e.target.value.replace(/[^\d.,]/g, '').slice(0, 5) })}
            />
          </label>
        ) : (
          <label className="campo">
            Valor fixo (R$)
            <CurrencyInput
              value={condicoes.valorFixo ? Number(condicoes.valorFixo).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}
              onChange={(mascarado) => setCondicoes({ ...condicoes, valorFixo: mascarado ? paraDecimal(mascarado) : '' })}
            />
          </label>
        )}
        <label className="campo">
          Condições de pagamento
          <Input
            value={condicoes.condicoesPagamento}
            placeholder="50% na contratação e o saldo em 3 parcelas mensais"
            onChange={(e) => setCondicoes({ ...condicoes, condicoesPagamento: e.target.value })}
          />
        </label>
      </div>
      <p className="fund num">
        {valorAtual !== null
          ? `Valor resultante: ${brl(valorAtual)}${condicoes.forma === 'PERCENTUAL' && monteMor !== null ? ` (${condicoes.percentual}% de ${brl(monteMor)})` : ''}`
          : 'Preencha o percentual (com o espelho calculado) ou o valor fixo para fechar o número.'}
      </p>

      <h2>Contratante(s)</h2>
      <p className="fund" style={{ marginBottom: 6 }}>
        Quem assina — a qualificação vem pronta do item I.
      </p>
      <select
        className="seletor"
        value={contratante}
        aria-label="Quem contrata os serviços"
        onChange={(e) => setContratante(e.target.value)}
      >
        {opcoesContratante.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>

      <h2>Redação</h2>
      <div className="escolha">
        <Pilula ativo={usarIa} onClick={() => setUsarIa(true)}>
          Sugerida pela IA
        </Pilula>
        <Pilula ativo={!usarIa} onClick={() => setUsarIa(false)}>
          Padrão local (sem IA)
        </Pilula>
      </div>
      <p className="fund" style={{ margin: '6px 0 10px' }}>
        Com IA, só o RESUMO do caso (nomes, números e condições) segue pela rota interna — os
        documentos do cofre não são reenviados. Anexe o modelo do seu escritório para a redação
        seguir a estrutura e o estilo dele; sem modelo, sai a redação eficiente sugerida.
      </p>
      {(
        [
          ['PROPOSTA', 'proposta', modeloProposta, setModeloProposta],
          ['CONTRATO', 'contrato', modeloContrato, setModeloContrato],
        ] as const
      ).map(([tipo, rotulo, modelo, setModelo]) => (
        <ModeloLinha
          key={tipo}
          rotulo={rotulo}
          modelo={modelo}
          onArquivo={(f) => carregarModelo(tipo, f)}
          onRemover={() => setModelo(null)}
        />
      ))}

      <h2>Gerar</h2>
      <div className="escolha">
        <Button loading={gerando === 'PROPOSTA'} disabled={gerando !== null} onClick={() => gerar('PROPOSTA')}>
          Baixar proposta de honorários (DOCX)
        </Button>
        <Button
          variant="outline"
          loading={gerando === 'CONTRATO'}
          disabled={gerando !== null}
          onClick={() => gerar('CONTRATO')}
        >
          Baixar contrato de honorários (DOCX)
        </Button>
      </div>
      <p className="fund" style={{ marginTop: 8 }}>
        Saída em minuta editável: cabeçalho com a marca do escritório, qualificação pronta,
        corpo redigido e quadro-resumo com os números exatos digitados aqui.
      </p>
    </section>
  );
}

function ModeloLinha({
  rotulo,
  modelo,
  onArquivo,
  onRemover,
}: {
  rotulo: string;
  modelo: { nome: string } | null;
  onArquivo: (f: File) => void;
  onRemover: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <p className="anexo-linha">
      <span>Modelo de {rotulo}:</span>
      {modelo ? (
        <>
          <span className="num">{modelo.nome}</span>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemover}>
            remover
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => ref.current?.click()}>
          + anexar modelo (.docx/.pdf/.txt)
        </Button>
      )}
      <input
        ref={ref}
        type="file"
        accept=".docx,.pdf,.txt"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) onArquivo(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </p>
  );
}
