'use client';

/**
 * ESTADO PRIMEIRO, MUNICÍPIO DEPOIS — o par de campos que substitui, em toda
 * a plataforma, o antigo "digite a cidade".
 *
 * Por que: cidade digitada à mão vira cinco grafias do mesmo lugar
 * ("Guarulhos", "guarulhos", "Guarulhos-SP", "Guarulhos/SP"), e a UF pedida
 * depois obriga a pessoa a lembrar de duas coisas para responder uma. Com a
 * UF na frente, a lista do estado desce pronta e a escolha é um clique — o
 * mesmo caminho de quem preenche um formulário de cartório.
 *
 * A base dos 5.587 municípios NÃO entra no bundle: o cliente pede ao servidor
 * a lista do estado escolhido (`listarMunicipiosDaUf`), como já fazia o
 * autocomplete de comarcas das diligências.
 *
 * COMPATIBILIDADE COM O QUE JÁ ESTÁ GRAVADO: caso o valor atual não exista na
 * lista da UF (texto livre da era anterior, ou município de outro estado), ele
 * entra como uma opção a mais, marcada. Um seletor que não sabe representar o
 * valor que recebeu o APAGARIA no primeiro salvamento — e o que se perderia
 * seria dado de caso do usuário.
 */

import * as React from 'react';

import { listarMunicipiosDaUf } from '@/lib/rede/municipios-actions';
import type { Municipio } from '@/lib/rede/municipios';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/**
 * A mesma escolha, para os campos que guardam UM texto "Cidade/UF".
 *
 * Existem lugares em que o valor gravado é a linha pronta — o último domicílio
 * do falecido, o Cidade/UF do escritório — porque é assim que ela entra na
 * escritura e na proposta. Trocar o formato de armazenamento obrigaria a mexer
 * em todos os geradores de documento; aqui o par escolhe e devolve a linha no
 * MESMO formato de antes. O que muda é só como a pessoa preenche.
 */
export function SeletorMunicipioTexto({
  valor,
  onChange,
  rotuloMunicipio = 'Município',
}: {
  /** "Guarulhos/SP" — ou o texto livre que já estava gravado. */
  valor: string;
  onChange: (v: string) => void;
  rotuloMunicipio?: string;
}) {
  // "Guarulhos/SP" e "Guarulhos - SP" viram { municipio, uf }; qualquer outra
  // coisa fica inteira no município (e o seletor a preserva como opção extra).
  const corte = valor.match(/^(.*?)\s*[/\-–]\s*([A-Za-z]{2})\s*$/);
  const municipio = (corte ? corte[1] : valor).trim();
  const uf = corte ? corte[2].toUpperCase() : '';

  return (
    <SeletorMunicipio
      uf={uf}
      municipio={municipio}
      rotuloMunicipio={rotuloMunicipio}
      onChange={(v) => onChange(v.municipio && v.uf ? `${v.municipio}/${v.uf}` : v.municipio)}
    />
  );
}

export function SeletorMunicipio({
  uf,
  municipio,
  onChange,
  rotuloUf = 'Estado (UF)',
  rotuloMunicipio = 'Município',
  ariaInvalidUf,
  ariaInvalidMunicipio,
  erroUf,
  erroMunicipio,
}: {
  uf: string;
  municipio: string;
  /** Trocar a UF SEMPRE zera o município — o antigo não pertence ao novo estado. */
  onChange: (v: { uf: string; municipio: string }) => void;
  rotuloUf?: string;
  rotuloMunicipio?: string;
  ariaInvalidUf?: boolean;
  ariaInvalidMunicipio?: boolean;
  /** Mensagens já formatadas por quem chama (react-hook-form, zod…). */
  erroUf?: string;
  erroMunicipio?: string;
}) {
  const alvo = uf.trim().toUpperCase();
  // O cache guarda a UF a que a lista pertence, e "carregando" é DERIVADO
  // disso. Guardar só os itens obrigaria a limpá-los na troca de UF — um
  // setState síncrono dentro do efeito, que dispara renderização em cascata.
  const [cache, setCache] = React.useState<{ uf: string; itens: Municipio[] } | null>(null);
  const daUfAtual = cache?.uf === alvo;
  const lista = daUfAtual ? (cache?.itens ?? []) : [];
  const carregando = alvo.length === 2 && !daUfAtual;

  React.useEffect(() => {
    if (alvo.length !== 2) return;
    let vivo = true;
    void listarMunicipiosDaUf(alvo)
      .then((m) => {
        if (vivo) setCache({ uf: alvo, itens: m });
      })
      .catch(() => {
        // Rede fora: a lista fica vazia, mas o valor já escolhido continua
        // marcado (ver a opção extra abaixo) — nunca apagar o que estava lá.
        if (vivo) setCache({ uf: alvo, itens: [] });
      });
    return () => {
      vivo = false;
    };
  }, [alvo]);

  const semLista = daUfAtual && lista.length === 0;
  const atualForaDaLista =
    municipio.trim() !== '' && !lista.some((m) => m.nome === municipio);

  return (
    <>
      <label className="campo">
        {rotuloUf}
        <select
          value={uf}
          aria-invalid={ariaInvalidUf}
          onChange={(e) => onChange({ uf: e.target.value, municipio: '' })}
        >
          <option value="">Selecione…</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {erroUf && <span className="mono-alerta">{erroUf}</span>}
      </label>
      <label className="campo">
        {rotuloMunicipio}
        <select
          value={municipio}
          aria-invalid={ariaInvalidMunicipio}
          disabled={alvo.length !== 2}
          onChange={(e) => onChange({ uf, municipio: e.target.value })}
        >
          <option value="">
            {alvo.length !== 2
              ? 'Escolha o estado primeiro'
              : carregando
                ? 'Carregando…'
                : semLista
                  ? 'Não foi possível carregar — tente de novo'
                  : 'Selecione…'}
          </option>
          {/* O valor gravado que não consta da lista (texto livre antigo)
              continua selecionável — ver o cabeçalho deste arquivo. */}
          {atualForaDaLista && <option value={municipio}>{municipio}</option>}
          {lista.map((m) => (
            <option key={m.ibge} value={m.nome}>
              {m.nome}
            </option>
          ))}
        </select>
        {erroMunicipio && <span className="mono-alerta">{erroMunicipio}</span>}
      </label>
    </>
  );
}
