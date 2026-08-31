/**
 * Casos de teste do pipeline da jurimetria registral — fixtures SINTÉTICAS
 * (nenhum dado real de pessoa).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/jurimetria/pipeline.test.ts
 */

import { anonimizar } from './anonimizar';
import { linhasDoCjpg, pareceDuvidaRegistral, documentoDaLinha } from './coletores/cjpg';
import { detectarAtoTipo, detectarTemas, mencoesDeCartorio, TEMAS_LOCAIS } from './temas-local';
import { extrairExigenciasLocal, esquemaExtracao, daRespostaLLM } from './extrair';
import { cartorioDaMencao, normalizarNomeCartorio, resolverCartorio, resolverTitular } from './resolver';
import { ehTextoCru, ementaDoDocumento, formatarNumeroCNJ, origemDoProcesso } from './origem';
import { similaridadeTexto, ehDuplicata, encaminhar } from './encaminhar';

let ok = 0,
  fail = 0;
function afirmar(nome: string, cond: boolean, extra?: unknown) {
  if (cond) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}`, extra ?? '');
  }
}

console.log('\nJurimetria — pipeline (anonimizar, extrair, resolver, dedupe, encaminhar)\n');

/* ---------- anonimizar: nota sintética com 3 herdeiros e 2 matrículas ---------- */
{
  const nota = [
    'NOTA DE DEVOLUÇÃO. Título prenotado sob nº 123.456.',
    'Interessados: Fulano Dativo Silva, CPF 123.456.789-09, nascido em 01/02/1960,',
    'Beltrana Sicrana de Souza, RG nº 12.345.678-9, e Terceiro Herdeiro Santos,',
    'residentes na Rua das Figueiras Altas, nº 1000, casa 2, CEP 07000-000.',
    'Contato: exemplo@teste.com, telefone (11) 91234-5678.',
    'Referente à matrícula nº 12.345 e à matrícula nº 67.890 deste Registro.',
    '1- Apresentar certidão de casamento atualizada do primeiro interessado.',
  ].join('\n');
  const r = anonimizar(nota);
  afirmar('nota: nenhum CPF sobrevive', !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(r.texto));
  afirmar('nota: nomes dos 3 herdeiros saem', !/Dativo|Sicrana|Terceiro Herdeiro/.test(r.texto), r.texto);
  afirmar('nota: matrículas viram token', (r.texto.match(/\[MATRICULA\]/g) ?? []).length === 2);
  afirmar('nota: protocolo vira token', r.texto.includes('[PROTOCOLO]'));
  afirmar('nota: endereço vira token', r.texto.includes('[ENDERECO]'));
  afirmar('nota: e-mail e telefone saem', !r.texto.includes('exemplo@teste.com') && !r.texto.includes('91234'));
  afirmar('nota: nascimento vira token preservando o anúncio', /nascido em \[NASCIMENTO\]/.test(r.texto));
  afirmar('nota: ocorrências registradas', r.ocorrencias.length >= 8, r.ocorrencias.length);
  afirmar(
    'nota: a exigência em si permanece legível',
    r.texto.includes('Apresentar certidão de casamento atualizada'),
  );
}

/* ---------- anonimizar: decisão citando registrador (PRESERVAR) ---------- */
{
  const decisao = [
    'Processo de Dúvida. Suscitante: o Oficial Joaquim Registrador Exemplar, do 2º Oficial de',
    'Registro de Imóveis de São Paulo. Suscitada: Maria Requerente Teste, CPF 987.654.321-00.',
    'A exigência de apresentar a certidão de inteiro teor foi mantida pelo juízo.',
  ].join('\n');
  const r = anonimizar(decisao, ['Joaquim Registrador Exemplar']);
  afirmar('decisão: nome do registrador PRESERVADO (allowlist)', r.texto.includes('Joaquim Registrador Exemplar'));
  afirmar('decisão: nome da parte sai', !r.texto.includes('Maria Requerente Teste'));
  afirmar('decisão: instituição preservada', /Registro de Imóveis de São Paulo/.test(r.texto));
  afirmar('decisão: CPF sai', !r.texto.includes('987.654.321-00'));
}

/* ---------- anonimizar: título de agente público preserva sem allowlist ---------- */
{
  const r = anonimizar('Decidiu a Juíza Ana Julgadora Modelo pela manutenção da exigência.');
  afirmar('título "Juíza" antes do nome preserva', r.texto.includes('Ana Julgadora Modelo'), r.texto);
}

/* ---------- anonimizar: nomes em CAIXA ALTA viram iniciais ---------- */
{
  const sentenca =
    'SENTENÇA Vistos. LUCINÉIA DE CÁSSIA GARCIA FILGUEIRAS propôs ação de adjudicação compulsória em face de JOSÉ ROBERTO DOS SANTOS. Juiz de Direito: Dr. APARECIDO CESAR MACHADO. JULGO PROCEDENTE o pedido.';
  const r = anonimizar(sentenca);
  afirmar('caps: nome da autora sai', !r.texto.includes('LUCINÉIA'), r.texto);
  afirmar('caps: vira iniciais L.C.G.F.', r.texto.includes('L.C.G.F.'), r.texto);
  afirmar('caps: nome do réu vira J.R.S.', r.texto.includes('J.R.S.') && !r.texto.includes('ROBERTO'));
  afirmar('caps: juiz com Dr. antes é preservado', r.texto.includes('APARECIDO CESAR MACHADO'));
  afirmar('caps: gritos jurídicos ficam', r.texto.includes('SENTENÇA') && r.texto.includes('JULGO PROCEDENTE'));
  afirmar(
    'caps: título de documento não vira nome',
    anonimizar('ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA lavrada nesta data.').texto.includes('ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA'),
  );
  const misto = anonimizar('A requerente Maria da Silva Santos juntou documentos.');
  afirmar('iniciais também no passe capitalizado', misto.texto.includes('M.S.S.') && !misto.texto.includes('Maria'), misto.texto);
}

/* ---------- origem: número CNJ, links do e-SAJ e ementa ---------- */
{
  const cjpg = origemDoProcesso('cjpg:1007991-18.2019.8.26.0269:ABC-1--2');
  afirmar('origem cjpg: número preservado', cjpg.numeroCNJ === '1007991-18.2019.8.26.0269');
  afirmar('origem cjpg: link da sentença no CJPG', cjpg.linkSentenca?.includes('cjpg/pesquisar.do') === true);
  afirmar('origem cjpg: link do processo no CPOPG', cjpg.linkProcesso?.includes('cpopg/search.do') === true);
  const dj = origemDoProcesso('datajud:10130679820268260100');
  afirmar('origem datajud: número formatado', dj.numeroCNJ === '1013067-98.2026.8.26.0100', dj.numeroCNJ);
  afirmar('origem: url desconhecida = vazio', origemDoProcesso('usuario:ri-sp-01').numeroCNJ === null);
  afirmar('formatarNumeroCNJ: curto demais = null', formatarNumeroCNJ('123') === null);

  const docCjpg = 'Sentença — CJPG/TJSP (inteiro teor público)\nNúmero CNJ: 1\nClasse: Procedimento Comum Cível\nVara: 2ª Vara Cível\nComarca: Itapetininga\n\nVistos.';
  afirmar('ementa cjpg: classe + vara + comarca', ementaDoDocumento(docCjpg) === 'Sentença em Procedimento Comum Cível — 2ª Vara Cível, Comarca de Itapetininga', ementaDoDocumento(docCjpg));
  const docDj = 'Processo de Dúvida — 01 REGISTROS PUBLICOS DE CENTRAL\nNúmero CNJ: 1\nAssuntos (tabela CNJ): Registro de Imóveis\n\nMovimentações:';
  afirmar('ementa datajud: VRP legível + assuntos', ementaDoDocumento(docDj) === 'Dúvida — 1ª Vara de Registros Públicos da Capital · Assuntos: Registro de Imóveis', ementaDoDocumento(docDj));
  afirmar('texto cru detectado', ehTextoCru('Sentença — CJPG/TJSP (inteiro teor público) Número CNJ: 1'));
  afirmar('frase impessoal não é crua', !ehTextoCru('Apresentar certidão de casamento atualizada.'));
}

/* ---------- cadastro de serventia com VALIDADOR de município ---------- */
{
  const base = new Map([
    ['americana', 'Americana'],
    ['sorocaba', 'Sorocaba'],
    ['tatui', 'Tatuí'],
  ]);
  const valida = (c: string) =>
    base.get(c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) ?? null;
  const aparado = cartorioDaMencao('Oficial de Registro de Imóveis de Americana suscitou a pressente', valida);
  afirmar('validador: cauda engolida é aparada até o município', aparado?.cidade === 'Americana' && aparado.id === 'ri-americana', aparado);
  afirmar('validador: cidade inexistente derruba o cadastro', cartorioDaMencao('Registro de Imóveis de Tamabu', valida) === null);
  afirmar('validador: grafia canônica da base vence', cartorioDaMencao('Registro de Imóveis de Tatui suscita', valida)?.cidade === 'Tatuí');
}

/* ---------- anonimizar: texto sem dado pessoal fica intacto ---------- */
{
  const texto =
    'Para o registro do formal de partilha, apresentar a guia do ITCMD e a certidão de casamento.';
  const r = anonimizar(texto);
  afirmar('sem dado pessoal: zero ocorrências', r.ocorrencias.length === 0, r.ocorrencias);
  afirmar('sem dado pessoal: texto idêntico', r.texto === texto);
}

/* ---------- extrair (fallback local pelo triar do Resolvedor) ---------- */
{
  const texto = [
    '1- Apresentar certidão de casamento atualizada, expedida há menos de 90 dias, para a devida averbação.',
    '2- Recolher o ITCMD e apresentar a respectiva guia com o comprovante correspondente.',
  ].join('\n');
  const r = extrairExigenciasLocal(texto, 'CARTORIO_SITE');
  afirmar('local: extrai 2 itens', r.exigencias.length === 2, r.exigencias.length);
  afirmar('local: confiança 0.5 (vai à revisão)', r.confianca === 0.5);
  afirmar('local: sem_julgamento', r.exigencias.every((e) => e.resultado === 'sem_julgamento'));
}

/* ---------- contrato do LLM (Zod) ---------- */
{
  const bruto = {
    cartorio_mencionado: '2º RI da Capital',
    registrador_mencionado: null,
    data_documento: '2025-03-10',
    ato_tipo: 'inventario',
    exigencias: [
      {
        texto_normalizado: 'Apresentar certidão negativa de débitos do ITCMD.',
        fundamentacao: ['Lei 10.705/2000, art. 15'],
        resultado: 'mantida',
        trecho_origem: 'mantida a exigência de quitação do imposto',
        tema: 'itcmd-recolhimento',
      },
    ],
  };
  const v = esquemaExtracao.safeParse(bruto);
  afirmar('zod: resposta válida passa', v.success);
  if (v.success) {
    const e = daRespostaLLM(v.data);
    afirmar('llm→interno: confiança 0.85', e.confianca === 0.85);
    afirmar('llm→interno: tema por exigência', e.temas?.[0] === 'itcmd-recolhimento');
  }
  afirmar(
    'zod: resultado inválido reprova',
    !esquemaExtracao.safeParse({ ...bruto, exigencias: [{ ...bruto.exigencias[0], resultado: 'aceita' }] }).success,
  );
}

/* ---------- resolver cartório ---------- */
{
  const cartorios = [
    { id: 'ri-sp-02', nome: '2º Oficial de Registro de Imóveis de São Paulo/SP', aliases: ['2º RI da Capital', '2º ORI-SP'] },
    { id: 'ri-guarulhos-01', nome: '1º Oficial de Registro de Imóveis de Guarulhos/SP', aliases: ['1º RI de Guarulhos'] },
  ];
  afirmar('resolve alias exato', resolverCartorio('2º RI da Capital', cartorios) === 'ri-sp-02');
  afirmar(
    'resolve por extenso',
    resolverCartorio('Segundo Oficial de Registro de Imóveis de São Paulo', cartorios) === 'ri-sp-02',
  );
  afirmar('resolve sigla ORI', resolverCartorio('2º ORI-SP', cartorios) === 'ri-sp-02');
  afirmar('resolve Guarulhos sem confundir', resolverCartorio('1º RI de Guarulhos', cartorios) === 'ri-guarulhos-01');
  afirmar('não resolve o desconhecido', resolverCartorio('RI de Atlântida', cartorios) === null);
  afirmar('normaliza ordinal por extenso', normalizarNomeCartorio('Décimo Oitavo Registro de Imóveis da Capital').startsWith('18 ri'));
}

/* ---------- resolver titular pela data ---------- */
{
  const titulares = [
    { id: 't-antigo', cartorioId: 'ri-sp-02', titularDesde: new Date('2000-01-01') },
    { id: 't-novo', cartorioId: 'ri-sp-02', titularDesde: new Date('2020-06-01') },
  ];
  afirmar('titular vigente na data recente', resolverTitular(titulares, 'ri-sp-02', new Date('2024-01-01')).titularId === 't-novo');
  afirmar('titular vigente na data antiga', resolverTitular(titulares, 'ri-sp-02', new Date('2010-01-01')).titularId === 't-antigo');
  const sem = resolverTitular(titulares, 'ri-sp-02', new Date('1990-01-01'));
  afirmar('sem titular na data → pendente', sem.titularId === null && sem.titularPendente);
  afirmar('cartório sem titular → pendente', resolverTitular(titulares, 'ri-sp-99', new Date('2024-01-01')).titularPendente);
}

/* ---------- dedupe ---------- */
{
  const a = 'Apresentar certidão negativa de débitos do ITCMD com data posterior à escritura.';
  const b = 'Apresentar a certidão negativa de débitos do ITCMD em data posterior à escritura.';
  const c = 'Promover a averbação prévia do divórcio na matrícula do imóvel.';
  afirmar('quase idênticas ≥ limiar', similaridadeTexto(a, b) >= 0.62, similaridadeTexto(a, b));
  afirmar('diferentes < limiar', similaridadeTexto(a, c) < 0.62, similaridadeTexto(a, c));
  afirmar(
    'duplicata só no MESMO cartório+tema',
    ehDuplicata(
      { textoNormalizado: a, cartorioId: 'x', temaId: 't' },
      { textoNormalizado: b, cartorioId: 'x', temaId: 't' },
    ) &&
      !ehDuplicata(
        { textoNormalizado: a, cartorioId: 'x', temaId: 't' },
        { textoNormalizado: b, cartorioId: 'y', temaId: 't' },
      ),
  );
}

/* ---------- encaminhar (publicação automática — decisão do escritório) ---------- */
{
  const base = { confianca: 0.9, cartorioId: 'x', titularPendente: false };
  afirmar('publica com tudo certo', encaminhar(base).destino === 'publicado');
  const baixa = encaminhar({ ...base, confianca: 0.7 });
  afirmar('confiança baixa PUBLICA com o motivo anotado', baixa.destino === 'publicado' && baixa.motivos.includes('baixa_confianca'));
  const semCartorio = encaminhar({ ...base, cartorioId: null });
  afirmar('sem cartório PUBLICA com o motivo anotado', semCartorio.destino === 'publicado' && semCartorio.motivos.includes('cartorio_nao_identificado'));
  const pendente = encaminhar({ ...base, titularPendente: true });
  afirmar('titular pendente PUBLICA com o motivo anotado', pendente.destino === 'publicado' && pendente.motivos.includes('titular_pendente'));
  const lgpd = encaminhar({ ...base, possivelDadoPessoal: true });
  afirmar(
    'possível dado pessoal é a ÚNICA trava (revisão)',
    lgpd.destino === 'revisao' && lgpd.motivos.includes('possivel_dado_pessoal'),
  );
}

/* ---------- CJPG: parser da listagem (fixture na anatomia real do e-SAJ) ---------- */
{
  const linhaCjpg = (numero: string, id: string, vara: string, teor: string) => `
			<tr class="fundocinza1">
				<td width="40" align="left" valign="top" class="fonte"><strong>1&nbsp;-</strong></td>
				<td valign="top"><table cellspacing="0" cellpadding="0" width="100%">
					<tr class="fonte"><td colspan="2" align="left">
						<a style="vertical-align: top" title="Visualizar Inteiro Teor" name="${id}" >
							<span class="fonteNegrito"> ${numero} </span></a>
					</td></tr>
					<tr class="fonte"><td align="left"><strong> Classe: </strong> Dúvida</td></tr>
					<tr class="fonte"><td align="left"><strong> Magistrado: </strong> Julgador Sintético</td></tr>
					<tr class="fonte"><td align="left"><strong> Comarca: </strong> Guarulhos</td></tr>
					<tr class="fonte"><td align="left"><strong> Vara: </strong> ${vara}</td></tr>
					<tr class="fonte"><td align="left"><strong> Data de Disponibilização: </strong> 18/12/2025</td></tr>
					<tr><td><div align="justify"><span>resumo…</span><img class="mostrarOcultarConteudo" src="x"/></div>
					<div align="justify" style="display: none;"><span>${teor}</span><img class="mostrarOcultarConteudo" src="y"/></div></td></tr>
				</table></td></tr>`;
  const teorDuvida =
    'SENTENÇA Vistos. Trata-se de <em>dúvida</em> suscitada pelo Oficial de Registro de Imóveis ' +
    'quanto à exigência de certidão para a matrícula. '.repeat(3) +
    'JULGO PROCEDENTE a dúvida, mantendo a exigência. PRI';
  const teorCivel =
    'SENTENÇA Vistos. Ação de cobrança de aluguel entre as partes, sem relação nenhuma com o tema. '.repeat(4);
  const html =
    linhaCjpg('1011074-24.2024.8.26.0477', 'D9000LTF80000-477--93237390', '6ª Vara Cível', teorDuvida) +
    linhaCjpg('1000001-11.2025.8.26.0100', 'A1B2C3-100--111', '10ª Vara Cível', teorCivel);
  const linhas = linhasDoCjpg(html);
  afirmar('cjpg: duas linhas parseadas', linhas.length === 2, linhas.length);
  afirmar('cjpg: número CNJ e id do documento', linhas[0]?.numeroCNJ === '1011074-24.2024.8.26.0477' && linhas[0]?.idDocumento === 'D9000LTF80000-477--93237390');
  afirmar('cjpg: campos da linha', linhas[0]?.vara === '6ª Vara Cível' && linhas[0]?.comarca === 'Guarulhos' && linhas[0]?.data === '2025-12-18');
  afirmar('cjpg: teor sem HTML e completo', /JULGO PROCEDENTE/.test(linhas[0]?.texto ?? '') && !/<em>/.test(linhas[0]?.texto ?? ''));
  afirmar('cjpg: triagem aceita a dúvida registral', pareceDuvidaRegistral(linhas[0]!.texto));
  afirmar('cjpg: triagem recusa a cobrança de aluguel', !pareceDuvidaRegistral(linhas[1]!.texto));
  const doc = documentoDaLinha(linhas[0]!);
  afirmar('cjpg: documento leva cabeçalho + teor', /Número CNJ: 1011074/.test(doc) && /Comarca: Guarulhos/.test(doc) && /JULGO PROCEDENTE/.test(doc));
}

/* ---------- temas-local: detecção no navegador (modo "arrastar o título") ---------- */
{
  const minuta = [
    'ESCRITURA PÚBLICA DE INVENTÁRIO E PARTILHA. Falecido em… certidão de óbito anexa.',
    'Meação da viúva meeira sobre os bens comuns; regime da comunhão parcial de bens,',
    'conforme certidão de casamento. Imóvel da matrícula do 5º Oficial de Registro de',
    'Imóveis de São Paulo, com valor venal de referência apurado. Herdeiro menor',
    'representado, com intervenção do Ministério Público. ITCMD recolhido por guia.',
  ].join('\n');
  const ts = detectarTemas(minuta);
  afirmar('temas-local: detecta os temas presentes', ['certidao-obito', 'meacao-conjuge', 'certidao-casamento-regime', 'valor-venal-avaliacao', 'menor-incapaz-mp', 'itcmd-recolhimento'].every((t) => ts.includes(t)), ts);
  afirmar('temas-local: não inventa imóvel rural', !ts.includes('imovel-rural'));
  afirmar('temas-local: ato = inventário', detectarAtoTipo(minuta) === 'inventario');
  afirmar('temas-local: ids batem com o catálogo semeado (nenhum fora)', TEMAS_LOCAIS.every((t) => /^[a-z0-9-]+$/.test(t.id)));
  const mencoes = mencoesDeCartorio(minuta);
  afirmar('temas-local: acha a menção ao 5º RI', mencoes.some((m) => /5.*registro de im[óo]veis/i.test(m)), mencoes);
  afirmar('temas-local: texto sem serventia = sem menção', mencoesDeCartorio('contrato de compra e venda simples').length === 0);
}

/* ---------- temas do registro imobiliário geral (foco do escritório) ---------- */
{
  const contrato = [
    'Instrumento particular com força de escritura pública de alienação fiduciária',
    'em garantia (Lei nº 9.514/97), com consolidação da propriedade em favor do',
    'credor fiduciário. Empreendimento com memorial de incorporação registrado e',
    'patrimônio de afetação constituído.',
  ].join('\n');
  const tsContrato = detectarTemas(contrato);
  afirmar('temas-local: detecta alienação fiduciária', tsContrato.includes('alienacao-fiduciaria'), tsContrato);
  afirmar('temas-local: detecta incorporação imobiliária', tsContrato.includes('incorporacao-imobiliaria'));

  const requerimento = [
    'Requerimento de retificação de área da matrícula, com levantamento topográfico',
    'e planta assinada, seguido de desmembramento do imóvel e unificação de matrículas',
    'remanescentes (englobamento). Pedido de adjudicação compulsória extrajudicial e',
    'ata notarial para usucapião extrajudicial do art. 216-A da LRP.',
  ].join('\n');
  const tsReq = detectarTemas(requerimento);
  for (const id of ['retificacao-area', 'desmembramento', 'englobamento', 'adjudicacao-compulsoria', 'usucapiao-extrajudicial'])
    afirmar(`temas-local: detecta ${id}`, tsReq.includes(id), tsReq);

  afirmar(
    'cjpg: triagem aceita usucapião extrajudicial sem a palavra dúvida',
    pareceDuvidaRegistral('Pedido de usucapião extrajudicial rejeitado pelo oficial de registro de imóveis; prenotação cancelada.'),
  );
  afirmar(
    'cjpg: triagem aceita pedido de providências registral',
    pareceDuvidaRegistral('Pedido de providências em face do Oficial de Registro de Imóveis quanto à averbação da construção na matrícula.'),
  );
  afirmar(
    'cjpg: triagem segue recusando matéria não registral',
    !pareceDuvidaRegistral('Ação de cobrança de aluguel julgada procedente, com juros e correção monetária.'),
  );
}

/* ---------- cadastro automático de serventia (cartorioDaMencao) ---------- */
{
  const sorocaba = cartorioDaMencao('Oficial de Registro de Imóveis de Sorocaba');
  afirmar('cadastro: RI de Sorocaba vira cadastro canônico', sorocaba?.id === 'ri-sorocaba' && sorocaba.cidade === 'Sorocaba', sorocaba);
  afirmar('cadastro: nome padronizado com /SP', sorocaba?.nome === 'Oficial de Registro de Imóveis de Sorocaba/SP');

  const rioPreto = cartorioDaMencao('1º Oficial de Registro de Imóveis da Comarca de São José do Rio Preto');
  afirmar('cadastro: número + comarca composta', rioPreto?.id === 'ri-sao-jose-do-rio-preto-01' && rioPreto.cidade === 'São José do Rio Preto', rioPreto);

  const santos = cartorioDaMencao('Segundo Oficial de Registro de Imóveis de Santos/SP');
  afirmar('cadastro: ordinal por extenso e /SP aparado', santos?.id === 'ri-santos-02' && santos.nome.startsWith('2º '), santos);

  const capital = cartorioDaMencao('3º Oficial de Registro de Imóveis de São Paulo');
  afirmar('cadastro: Capital com número reaproveita o id da semente', capital?.id === 'ri-sp-03', capital);
  afirmar('cadastro: Capital SEM número é ambígua (18 RIs) → null', cartorioDaMencao('Registro de Imóveis de São Paulo') === null);
  afirmar('cadastro: menção sem município é vaga → null', cartorioDaMencao('registro de imóveis') === null);
  afirmar('cadastro: texto não registral → null', cartorioDaMencao('cartório de notas de Campinas') === null);
}

console.log(`\n${ok} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
