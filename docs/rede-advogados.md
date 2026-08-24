# Rede advogado-advogado (camada 4) — mapa técnico

A camada 4 conecta ADVOGADOS entre si em dois pilares construídos: **A** — o
segundo advogado dentro do caso (convidado pelo titular ou indicado por um
herdeiro) e **B** — correspondentes por comarca para diligências a distância.
O pilar **C** (base colaborativa de exigências) ficou FORA desta programação
por decisão do escritório. Fundamentos éticos e o checklist de UI:
**docs/etica-oab.md** (seção "Rede advogado-advogado").

## Pilar A — segundo advogado no caso

- **Convite** pelo card "Painel da família" (bloco "Advogados constituídos"):
  o titular informa o E-MAIL da conta do(a) colega — que precisa existir
  neste site e ter **OAB aprovada** (`advogado_perfis.situacao = aprovado`)
  — e marca quais herdeiros ele(a) representa. O convite do herdeiro com
  `advogadoProprio` ganha o atalho "convidar para o caso"
  (`indicadoPor: 'herdeiro'`).
- **Mecânica**: convite-espelho no portal com token `adv-<token>` e papel
  `advogado` (`ConviteHerdeiro.papelConvite`), + linha em `caso_advogados`
  (única por `casoId + advogadoUserId`; revogar o convite marca `removido` e
  gera o evento ADVOGADO_REMOVIDO).
- **Escopo pelo motor puro `lib/rede/escopo.ts`** (testes em
  `escopo.test.ts`): o advogado convidado **vê** o espólio compartilhado e
  os painéis dos SEUS representados (recorte por nome, nunca o token dos
  outros), **junta documentos** (pedido único `docs-advogado` → card próprio
  do catálogo na aba Documentos) e **comenta** (nota/mural) — mas **não
  delibera**: adesão, voto e despesa respondem 403; consenso e votações
  contam só herdeiros (`deliberaNoEspolio`). Honorários, anotações e
  documentos internos do titular NUNCA aparecem (allowlists testadas).
- **Transparência**: todo portal do caso mostra o banner "advogados com
  acesso" (`advogadosDoCaso` no GET); cenário proposto carrega o AUTOR; o
  termo de deliberação em PDF ganha o bloco "ciência dos advogados
  constituídos".
- **Canal entre advogados**: `caso_advogado_mensagens` —
  `GET/POST /api/portal/[token]/canal` do lado do convidado (papel advogado,
  vínculo ativo) e actions `canalAdvogados`/`enviarMensagemCanal` do lado do
  titular (`podeGerirCaso`).

## Pilar B — correspondentes por comarca

Rota **`/diligencias`** (site do Sucessorista, logado; atalho "Diligências"
no painel Meus casos para perfil Advogado/master).

- **Base de comarcas**: `lib/rede/municipios.ts` — 5.587 municípios (IBGE de
  6 dígitos, UF derivada), estática NO SERVIDOR; o cliente pergunta via
  action `buscarComarcas` (autocomplete `comarca-autocomplete.tsx` — fora de
  `<label>`, ver comentário no arquivo).
- **Perfil de correspondente** (`correspondente_perfis`): comarcas + tipos
  atendidos + prazo médio + raio + ativo. Salvar e aparecer nas buscas exige
  o SELO (OAB aprovada + quiz — o mesmo da camada 3).
- **Ciclo da diligência** (`diligencias`, status
  `aberta → aceita → em_execucao → relatorio_entregue → concluida`
  | `cancelada`): o solicitante publica (avulsa no hub OU **de dentro do
  caso**, na aba Documentos — seção "Diligências a distância", com a comarca
  pré-preenchida pelo município do imóvel); correspondentes da comarca/UF
  veem a lista em ordem de DATA e respondem "Estou disponível" (sem
  valores); o solicitante vê as ofertas em ordem de CHEGADA e registra o
  **termo de referência** (`termoJson`: escopo, prazo, valor em texto livre
  — a plataforma NÃO processa pagamento); o(a) correspondente confirma o
  termo, executa e entrega o relatório; o solicitante conclui e os DOIS se
  avaliam por critérios objetivos (`diligencia_avaliacoes`, nota agregada só
  a assinantes; atraso sem justificativa pesa — `mediaAgregada`).
- **Pasta isolada** (`diligencia_arquivos`, origem `pasta` | `relatorio`):
  só os anexos SELECIONADOS pelo solicitante circulam
  (`conteudoDaPasta`, motor testado); download em stream por
  `GET /api/diligencias/[id]/arquivo` (solicitante e correspondente
  escolhido, mais ninguém). O relatório entregue volta à aba Documentos com
  **nome padronizado** ("AAAA-MM-DD - Tipo - Município-UF",
  `nomePadronizadoRelatorio`) e cai no card certo pelo classificador do
  arraste.
- **Limite desta rodada**: 3,5 MB por arquivo e 10 por pasta (teto de
  requisição da Vercel). O fatiamento do portal do herdeiro
  (`portal_arquivo_partes`) pode ser portado depois se o balcão pedir
  arquivos maiores.

## Tabelas

`caso_advogados`, `caso_advogado_mensagens` (migração `rede_advogados`);
`correspondente_perfis`, `diligencias`, `diligencia_arquivos`,
`diligencia_ofertas`, `diligencia_avaliacoes` (migração
`rede_correspondentes`).

## O que NUNCA acontece

- Comissão, split ou processamento de honorários de diligência.
- Indicação/ranking de correspondente (ordem neutra; nota agregada nunca
  ordena nada).
- Correspondente enxergando o caso além da pasta; segundo advogado
  enxergando honorários/anotações do titular ou painel de herdeiro que não
  representa.
- Conteúdo de diligência, canal ou pasta em `/admin`.
