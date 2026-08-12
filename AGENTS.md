<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mapa do projeto

O app deixou de ser só o renomeador: é uma **suíte de ferramentas para cartórios/escritórios imobiliários**. A página inicial (`app/page.tsx`) é o painel "Ferramentas"; cada módulo tem rota própria:

| Módulo | Rota | Código |
| --- | --- | --- |
| Renomeador Inteligente | `/renomeador` | `lib/renamer.ts` (motor local), `lib/ai.ts` + `app/api/rename` (IA), `lib/ocr.ts`, `lib/image-enhance.ts`/`lib/perspective.ts` (otimização), `lib/pdf-split.ts` (separador), `lib/to-pdf.ts` |
| Resolvedor de Notas Devolutivas (em teste) | `/notas` | `lib/notas/*` + `app/api/notas` + `lib/gemini-notas.ts` |
| O Sucessorista (em teste) | `/sucessorista` | `lib/partilha/*` (motor de partilha/ITCMD, puro e com testes), `lib/gemini-sucessorista.ts` + `app/api/sucessorista` (leitura do cofre), `lib/portal/*` + `app/portal/[token]` + `app/api/portal` (portal do herdeiro), `app/api/partilha` (motor via API) |
| Folha de pesquisa (WIP, sem UI ainda) | — | `lib/categories.ts`, `lib/certidoes.ts`, `lib/qualificacao.ts` |

## Grupos de rota e acesso

O `app/` é organizado em **route groups por nível de acesso** (não mudam a URL). Toda página nova entra num deles:

| Grupo | Quem acessa | Rotas hoje | Gate |
| --- | --- | --- | --- |
| `(public)` | todo mundo | `/` (painel) | — |
| `(private)` | só logado | `/renomeador`, `/notas`, `/sucessorista` | `requireSession("/rota")` no `page.tsx` (server) de CADA página — leva o caminho na URL de login (`/login?callbackUrl=…`) para voltar direto após entrar |
| `(protected)` | só DESLOGADO | `/login`, `/cadastro` | layout do grupo (`auth()` + redirect; limpa cookie morto) |
| `(master)` | só MASTER | `/admin/*` | layout do grupo (`requireMaster()` → 404) + repetido em páginas/actions (defesa em profundidade) |

- Página privada client-side ganha um `page.tsx` server fino com o gate + um `*-client.tsx` (ex.: `renomeador-client.tsx`) — o gate NUNCA fica só no client.
- O gate de `(private)` fica na página (não no layout) porque layout não conhece a URL da requisição — e o `callbackUrl` é obrigatório.
- As rotas de API dos recursos privados (`/api/rename`, `/api/notas`, `/api/sucessorista`, `/api/partilha`, `/api/portal/convite`) também exigem sessão (401) — acompanham as páginas. Exceção deliberada: `app/portal/[token]` e `GET/POST /api/portal/[token]` são acessíveis **pelo token** — o herdeiro convidado não tem login; o token é a credencial.

Módulo novo segue o padrão: página em `app/(grupo)/<modulo>/page.tsx`, lógica em `lib/<modulo>/`, card no painel da inicial.

## Branches e deploy

`main` tem **deploy automático na Vercel a cada commit**. O dia a dia acontece na `develop` (direto ou via PR); só mescle para `main` o que estiver pronto para produção. Agentes: nunca commitar direto na `main`.

## Autenticação e papéis

- Login por credenciais com **NextAuth v5** (`lib/auth.ts`, sessão JWT) + **Prisma 7** no Postgres do Supabase (`prisma/schema.prisma`; client gerado em `lib/generated/prisma` — não editar, regenerar com `npx prisma generate`; o acesso é sempre via singleton `prisma` de `lib/prisma.ts`).
- **Ferramentas exigem login**: `/renomeador`, `/notas` e as APIs delas (`/api/rename`, `/api/notas` → 401) só funcionam logado — ver a tabela de grupos de rota acima; só o painel `/` é público. **Rotas de convidado** (`/login`, `/cadastro`): só acessíveis deslogado — o gate é a **validação real** `auth()` na própria página (com redirect quando há sessão). **Nunca gatear por presença de cookie** (não há `proxy.ts` — já houve um e causou loop: cookie morto após reset do banco não é sessão). Cookie presente com sessão inválida é **removido**: as páginas de convidado renderizam `components/clear-stale-session.tsx`, que dispara `signOut({redirect:false})` para limpar (server component não escreve cookie; a rota do NextAuth escreve).
- **Cadastro público** em `/cadastro` (`app/cadastro/actions.ts` — server action valida com zod de novo no servidor). Sem confirmação de e-mail por enquanto: a conta nasce com `emailVerified = null` e a UI marca "E-mail não confirmado" (`session.user.emailConfirmed`).
- **Login com Google** (opcional, aparece só com `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` — `googleHabilitado()` de `lib/auth.ts`): primeiro acesso cria a conta local automaticamente com `emailVerified` preenchido (o Google atesta o e-mail) e `passwordHash = null` (conta Google não entra por senha — o authorize recusa). O vínculo com conta existente é por e-mail e **exige `email_verified === true` do Google** (sem isso seria sequestro de conta). O `token.id` é SEMPRE o id do nosso banco, nunca o id do perfil Google. Botão: `components/google-auth-button.tsx` (divisor "ou" + G oficial inline).
- **"Permanecer conectado"** (checkbox do login, marcado por padrão): controla o prazo REAL da sessão via `token.sessionExpires` (30 dias marcado × 8 horas desmarcado) — o jwt callback devolve `null` quando vence. O cookie em si dura 30 dias; o prazo que vale é o do token.
- **Papéis**: enum `Role` (`USER`/`MASTER`) na tabela `users`, exposto em `session.user.role`. Para gatear tela/ação de administrador use `isMaster(session)`/`requireMaster()` de `lib/auth.ts` — **a checagem vale no servidor** (página/rota), nunca só esconder botão no cliente.
- **O token nunca é fonte de verdade** (segurança em primeiro lugar): o callback `jwt` em `lib/auth.ts` revalida o usuário **no banco em toda requisição** — conta apagada derruba a sessão imediatamente, papel alterado (revogar/conceder master) vale na requisição seguinte, e falha de banco nega a sessão (fail-closed). Nunca otimizar isso para "confiar no token" nem cachear papel no cliente; o que o navegador guarda (cookie/JWT) é só identificação, jamais autorização.
- **Administração**: TODA página, server action e rota de API sob `/admin` começa com `await requireMaster()` — inclusive endpoints novos. Server action é endpoint público: botão escondido no cliente não protege nada. Quem não é master recebe **404** (`notFound()`), não redirect — a rota de administração "não existe" para quem não pode vê-la. O 404 amigável da plataforma é `app/not-found.tsx`.
- **Promover master**: `yarn user:create <email> <senha> "<nome>" --master` (upsert). Migrações: `yarn db:migrate` (usa a conexão direta do Supabase; o app usa o pooler).
- Redirecionamento pós-login/cadastro usa `useProgressRouter()` (convenção da barra de progresso).

## Fronteira de dados (privacidade — regra de ouro)

Documentos são sensíveis (RG, certidões, escrituras). O processamento é no navegador; conteúdo de documento só sai da máquina pelas **rotas internas** `/api/rename` (renomeador), `/api/notas` (redação de peças) e `/api/sucessorista` (leitura do cofre do inventário), que chamam o Gemini **no servidor** com `GEMINI_API_KEY` de env — a chave nunca chega ao cliente. Todo fluxo com IA tem modo/fallback local. **Não** adicionar chamadas externas diretas do cliente nem novas superfícies de saída de dados fora desse desenho.

**Aprendizado do escritório no banco, POR CONTA**: as "Regras do escritório" e as correções aprendidas do renomeador ficam em `renamer_lessons` (uma linha por usuário), via server actions de `app/(private)/renomeador/licoes-actions.ts` — cada action valida a sessão e grava só a linha do próprio usuário, com gravações **parciais** (salvar regras não toca nas correções e vice-versa). O estado reativo continua em `lib/lessons.ts` (useSyncExternalStore): o snapshot inicial vem do servidor (`page.tsx` → `initLessons`), regras salvam com debounce (+ flush no blur do textarea), correções na hora; quem tinha dados da era localStorage é migrado uma única vez (`migrateLegacyLessons` — só quando a conta está vazia e o carregamento inicial funcionou). Isto é dado do PRÓPRIO usuário (as correções contêm nomes que ele digitou), não telemetria: **nunca exibir em `/admin`**.

## PDF e arquivos do usuário

- **Ler/renderizar PDF**: `pdfjs-dist`, sempre via `loadPdfjs()` de `lib/ocr.ts`. **Montar/escrever PDF**: `pdf-lib`. OCR: `tesseract.js`.
- Escrita na pasta do usuário (File System Access) **só pelos helpers de `lib/fs.ts`**, que carregam as semânticas de segurança: confirmação antes de ação destrutiva, `abort()` para não truncar arquivo em falha, rollback do que a operação criou. Não escrever com `getFileHandle(create: true)` avulso.

## Resolvedor de notas: invariantes

- **A IA nunca toca nos templates** (`public/templates/notas/*.docx`): ela só redige campos variáveis, injetados por `fillDocxTemplate` nos placeholders. Campo sem base no contexto volta `null` e o `{{PLACEHOLDER}}` permanece visível na minuta — é trava de segurança, não bug.
- Toda saída é **rascunho para aprovação humana** — nada é protocolado/assinado automaticamente.
- O classificador de vias (`lib/notas/resolvedor.ts`) foi calibrado com notas devolutivas reais ancorando nos **verbos de remédio** do oficial. Mudanças ali (e no `DOC_RULES` do renomeador) devem ser validadas contra documentos reais, não só a olho.

## Sucessorista: invariantes

- **Esqueleto do módulo**: entrada pelo cofre (etapa 0 — leitura real dos documentos via `/api/sucessorista`), navegação LIVRE entre as abas (nada bloqueia nada) e o **painel do caso fixo à direita** (`painel-caso.tsx`) — todo campo digitado move um número lá na hora. O estado fiscal (isenções do art. 6º, faixas da reforma, protocolo) vive no `sucessorista-client.tsx` e alimenta o painel E a aba V com os MESMOS números — não recalcular em views separadas.
- **Extração do cofre é apoio, nunca verdade**: campo sem base clara no documento volta `null` e a folha fica em branco para o advogado preencher (`lib/gemini-sucessorista.ts`); a mesclagem só preenche campo VAZIO e deduplica herdeiros/bens por nome. A UI repete que é para CONFERIR.
- **Identidade "livro de notas" por cima do shadcn**: os componentes são os de `components/ui/` (convenção geral), e a identidade (papel/serifa/bronze/lacre) entra pelo `sucessorista.css`, que **re-mapeia as variáveis de tema do shadcn** (`--background`, `--primary`, `--border`…) dentro do escopo `.sucessorista`. Não estilizar elemento cru nem criar componente visual próprio — vestir o shadcn pelo tema escopado.
- **Folha = edição inline contínua** (o painel reage a cada tecla): os campos do caso são inputs controlados (a exceção prevista na convenção de formulários); react-hook-form + zod entram nos formulários de ADIÇÃO com validação (adicionar herdeiro, lançar bem, início rápido).
- O motor (`lib/partilha/*`) é puro, com testes — mudanças ali acompanham os `.test.ts`, e cálculo jurídico novo entra com fundamento legal na saída (padrão `fundamento`/`precedente` dos quinhões).
- **Estado sobrevive ao F5 e a fechar o navegador**: a etapa ativa vive na URL (`?etapa=caso|familia|acervo|partilha|itcmd|documentos|honorarios|minutas|escritura` — as três últimas por perfil, validadas contra lista fechada, trocada com `history.replaceState` — atualização rasa, sem round-trip nem barra de progresso por clique de aba) e a folha inteira vive como **rascunho local no IndexedDB** (`lib/partilha/rascunho.ts`; salvo com debounce de 600ms, restaurado uma vez no mount com o efeito de salvar esperando a flag — senão o estado vazio gravaria por cima; snapshot legado do sessionStorage `sucessorista-caso` é migrado quando não há rascunho). O caso também exporta/importa como **Arquivo do caso** (`.sucessorista.json`, mesmo formato `CasoSalvo`) para guardar na pasta do processo. Arquivos (`File`) não são serializáveis: anexos precisam ser reanexados após reabrir. Ids de herdeiro/bem são **aleatórios** (`crypto.randomUUID`), nunca contador sequencial — o contador zera no reload e colidiria com os ids restaurados.
- **Perfis de uso**: alternador Advogado(a) × Escrevente Notarial na lombada (localStorage `sucessorista-perfil`). Advogado tem as abas VI Honorários e VII Minutas (minuta ao Tabelionato + petição inicial judicial com redação por IA e fallback local em `lib/partilha/peticao-judicial.ts`); escrevente tem a aba VI Escritura (`lib/partilha/escritura.ts` — determinística, NA FORMATAÇÃO do modelo do balcão via `montarDocxRico`: Tahoma, títulos centralizados, negrito/sublinhado, tabela-resumo e partilha em tabelas Patrimônio·Proporção·Valor; tabelionato/escrevente/tabelião SEMPRE em lacunas; cláusulas condicionais: modalidade presencial/videoconferência/híbrida, Detran só com veículo, parágrafo bancário do art. 168 CP só com crédito bancário, tributo pago × isento; qualificação completa das partes com casamento/cônjuge/certidão e detalhes de imóvel/veículo extraídos pela leitura).

# Convenções do projeto

## UI: somente shadcn/ui

- Toda a interface usa componentes do [shadcn/ui](https://ui.shadcn.com) em `components/ui/`. Não criar componentes visuais do zero nem instalar outras bibliotecas de UI.
- Antes de implementar qualquer elemento novo de interface, verificar se o registry do shadcn já tem um componente que resolve (dialog, sheet, tooltip, dropdown-menu, sonner etc.) e adicioná-lo com:

  ```bash
  npx shadcn add <componente>
  ```

- **Não copiar código de componente shadcn da memória/internet**: a versão deste projeto (estilo `base-nova`) é baseada em Base UI (`@base-ui/react`), não em Radix — a API difere (ex.: prop `render` no lugar de `asChild`). O CLI gera a versão correta.
- **Rolagem = ScrollArea do shadcn, nunca `overflow-*` cru**: o container do `Table` (`components/ui/table.tsx`) já É um `ScrollArea` horizontal — TODA tabela ganha a barra estilizada sem wrapper nenhum no call site (customização proposital; não reverter ao atualizar pelo CLI). O `scroll-area.tsx` ganhou a prop `orientation` (`"vertical"` padrão | `"horizontal"` | `"both"`) e o Viewport dimensionado por **flex** (grow + basis-auto + min-h-0, no lugar do `size-full` original — altura percentual não resolve dentro de `max-h`/`flex-1` e o conteúdo vazava do dialog) — manter as duas customizações. Lista alta dentro de dialog: `DialogContent` com `flex max-h-[…] flex-col` + `<ScrollArea className="min-h-0 flex-1">`. Área com rolagem própria (lista alta dentro de dialog etc.) usa `<ScrollArea>` no lugar de `div` com `overflow-auto`.
- Componentes próprios (compostos a partir dos de `components/ui/`) ficam em `components/`, como `components/install-prompt.tsx`.

## Botões: efeito e estado assíncrono

- **Sem transform**: botões não se movem no clique (o `translate-y` do estilo original foi removido de propósito em `components/ui/button.tsx` — não reintroduzir ao atualizar o componente pelo CLI). O feedback é só de **cor**: entrar em hover/active muda a cor instantaneamente (`hover:duration-0 active:duration-0`), soltar volta com transição leve (`duration-150`).
- **Ação assíncrona = prop `loading`**: todo botão que dispara trabalho assíncrono usa `<Button loading={pendente}>` — o Spinner (`components/ui/spinner.tsx`) substitui **todo** o conteúdo (o texto não aparece durante a ação) e o botão fica desabilitado. Nunca montar spinner + texto manualmente no call site.
- **Ação destrutiva pede confirmação**: Dialog com o botão de confirmar em `variant="destructive"` e `loading` durante a execução — referência: `components/logout-button.tsx` (Sair).
- Botão que vira link (`render={<Link/>}`) precisa de `nativeButton={false}` (exigência do Base UI).

## Filtros via query string

Todo filtro de listagem/painel vive na **query string da URL**, nunca em estado local — o recorte fica compartilhável, sobrevive ao recarregar e ao botão voltar. Referência: `/admin?periodo=semana|mes|ano|tudo`.

- Página lê com `searchParams` (server component) e **valida contra uma lista fechada**, com default explícito para valor ausente/inválido. Helpers em `lib/admin.ts` (`parsePeriodo`, `filtroDeData`, `parsePaginacao`).
- **Padrão visual das telas /admin** (referências: `components/admin/period-filter.tsx` e `components/admin/query-pagination.tsx`):
  - **Filtro de período = Tabs com fundo** (`Tabs`/`TabsList`/`TabsTrigger` do shadcn, variante default com `bg-muted`): cada aba é `render={<Link/>}` com `nativeButton={false}`, e o `value` ativo vem da URL — nada de estado local.
  - **Itens por página = Select** do shadcn (client component; troca via `useProgressRouter().push`, sempre voltando à página 1).
  - **Navegação de páginas = componente `Pagination` do shadcn** (números + reticências + anterior/próxima). O `PaginationLink` foi ajustado para renderizar `<Link>` do Next (era `<a>` puro = full reload — não reverter ao atualizar pelo CLI). Anterior/próxima desabilitado é `<Button disabled>` puro, nunca Link.
  - **Largura padrão**: TODA tela `/admin` usa `max-w-4xl` no `<main>` — resumo e listagens, sem exceção.
- **Paginação também é query string**: `?pagina=N&porPagina=10|25|50|100` (default 1 e 10).
- Filtros novos seguem o mesmo padrão: um parâmetro por dimensão (`?periodo=…&pagina=…`), nomes em português, valores curtos e estáveis.
- **Busca textual: no BANCO, com o termo na query string** (`?busca=`), lida por `parseBusca` de `lib/admin.ts`. O componente é o `SearchFilter` (`components/admin/search-filter.tsx`): **sem botão e sem Enter** — a digitação vira navegação por debounce (350 ms), voltando à página 1. Referência: `/admin/usuarios?busca=` (nome OU e-mail, `mode: "insensitive"`). Três regras que fazem a digitação ficar fluida (não desfazer):
  - o **estado local é a única fonte da verdade** do campo — re-derivar do valor da URL faz o texto sumir e voltar a cada busca, porque enquanto o servidor responde a prop ainda traz o termo antigo;
  - `router.replace` + `useTransition` (**exceção consciente** ao `useProgressRouter`): a barra global piscaria a cada pausa da digitação, então o progresso aparece no próprio campo (a lupa vira spinner) e o histórico não ganha um item por tecla;
  - `type="text"`, não `type="search"` — o tipo search desenha um X nativo e ficariam dois botões de limpar.
- **Todo filtro preserva os outros**: `queryDaTabela` (`lib/admin.ts`) monta a query com período + busca + paginação + ordenação, e `PeriodFilter`/`SearchFilter`/`SortableHeader` recebem essa query para trocar só a sua dimensão (os filtros que mudam o recorte voltam à página 1).
- **Ordenação das tabelas: no BANCO, com a coluna na query string** (`?ordenar=<coluna>&direcao=asc|desc`). A página lê com `parseOrdenacao` de `lib/admin.ts`, que valida a coluna contra a **lista fechada** daquela tabela (nome de coluna vem do usuário e entra no `orderBy` do Prisma — a lista é o que impede pedir ordem por campo indevido) e traduz para o `orderBy` num `switch` explícito. O cabeçalho é o `SortableHeader` (`components/admin/sortable-header.tsx`): Link com seta, inverte a direção na coluna ativa e **volta à página 1**. Nunca ordenar no cliente.
- Telas de administração: `/admin` (resumo), `/admin/usuarios`, `/admin/renomeacoes`, `/admin/notas`, `/admin/sucessorista`, `/admin/erros` — todas gateadas com `requireMaster()` de `lib/auth.ts` no topo (inclusive nas server actions). Telemetria alimenta as listagens — ambas de melhor-esforço; usuário null = registro antigo de quando a plataforma era aberta:
  - `rename_events`: registrado **no momento da ANÁLISE** (quando os arquivos selecionados são enviados para IA/OCR na fila do renomeador), um evento por **método** (`IA_ARQUIVO` | `IA_TEXTO` | `LOCAL` — enum `MetodoAnalise`) a cada rodada da fila, com **duração**, `itens` (a **tag de tipo** de cada documento + flags `baixado`/`otimizado`, atualizadas depois via `registrarDownloadDeItem`) e `desfecho` (`zip` baixado + opções de **montagem do processo**, via `registrarDesfecho`). As actions de atualização validam **ownership** (só o dono do evento atualiza — server action é endpoint público). Fallback conta como LOCAL; o gatilho é a análise, não a renomeação aplicada.
  - `error_events`: falhas das rotas de IA via `registrarErro` de `lib/error-log.ts` — e o fallback do renomeador no CLIENTE (origem `renomeador/fallback-local`, via server action `registrarErroDeAnalise` com sessão obrigatória): registrado junto do toast "IA indisponível", cobre falhas que nunca chegam à rota (rede, timeout, resposta inválida).
  - `notas_events`: um evento por **TRIAGEM** de nota devolutiva (`registrarTriagem` de `app/(private)/notas/actions.ts`), com `fonte` do texto, flag `manual` (colado à mão × lido da pasta), `arquivos` da pasta, durações e `itens` = uma entrada por exigência com a **via sugerida**, os `alvos` (tags de documento), `temGatilho` (o classificador casou regra local?) e a **contagem** de pessoas citadas. Os desfechos entram depois por índice (`atualizarItemDaNota`, com ownership): `viaFinal` (via corrigida pelo humano — é a métrica de precisão do classificador), `status`, `peca`, `comIa`/`camposIa`, `faltando` e os downloads.
  - `sucessorista_events`: quatro ações (`AcaoSucessorista`) via `app/(private)/sucessorista/actions.ts` — `LEITURA_COFRE` (documentos lidos pela IA na etapa 0, com tipos detectados e falhas), `CALCULO` (**retrato estrutural do caso**: herdeiros, bens e seus tipos, regime, rito, faixa de porte, divergências, isenções, parcelas do ITCMD), `DOCUMENTO` (minuta/planilha/processo gerado, com `comIa` — em `PETICAO_JUDICIAL`, `comIa: false` significa que a IA falhou e valeu o fallback local) e `PORTAL` (convite gerado pelo advogado e resposta do herdeiro; a resposta vem da rota do portal e fica **sem usuário**, pois o herdeiro não tem login). Chave de correlação: `casoId` — id **aleatório** gerado no cliente, sem dado pessoal. `CALCULO` é **upsert por casoId** (o motor recalcula a cada tecla; o envio é debounced em 15s) — uma linha por inventário com o estado mais recente, então contar `CALCULO` conta CASOS, não recálculos.
  - `module_accesses`: **abertura de módulo**, não login. O `AccessTracker` (`components/access-tracker.tsx`) monta no `page.tsx` de cada ferramenta e registra **uma vez por sessão do navegador por módulo** (flag no sessionStorage, marcada ANTES do envio para o efeito duplo do modo estrito não contar duas vezes). Ir e voltar entre módulos não infla; nova aba/dia conta de novo. Alimenta a coluna "Acessos" de `/admin/usuarios` (ordenável por `_count` da relação) e o dialog com o detalhamento por ferramenta.
  - **Privacidade da telemetria (regra dura)**: NUNCA gravar conteúdo de documento **nem nomes de arquivo/pessoa** — houve uma versão que gravava nomes e ela foi revertida com limpeza do banco. Telemetria = tags de tipo, contagens, durações e flags de desfecho, nada além. No Sucessorista isso inclui **valor de acervo**: o porte do caso entra como **FAIXA** (`lib/porte.ts` — `porteDoAcervo` converte no cliente; o número nunca sai do navegador), e nada de CPF, texto de instruções à IA ou snapshot da folha.

## Cursor pointer em tudo que é clicável

Todo elemento interativo da plataforma (botões, links, checkboxes, radios, selects, labels clicáveis, itens de menu etc.) usa `cursor: pointer` — o Tailwind v4 deixou botões com `cursor: default` e este projeto reverte isso.

- A regra é **global**, em `app/globals.css` (`@layer base`): um seletor cobre elementos nativos e roles ARIA (`role="button"`, `role="radio"`, …, usados pelos componentes Base UI), excluindo estados desabilitados (`:disabled`, `[aria-disabled="true"]`, `[data-disabled]`).
- **Não** adicionar `cursor-pointer` classe por classe nos componentes — a regra global já cobre.
- Ao criar um elemento clicável novo que não seja `<button>`/`<a href>`, dar a ele um `role` interativo adequado (ex.: `role="button"`, como a área de drop em `app/page.tsx`) — isso o inclui na regra e melhora a acessibilidade. Se realmente não couber role, aí sim usar `cursor-pointer` pontual.

## Formulários: react-hook-form + zod, sem exceção

Todo formulário de entrada de dados usa **react-hook-form** com schema **zod** (`zodResolver`) — nunca a validação nativa do navegador. Referência viva: `components/login-form.tsx`.

- **`noValidate` no `<form>` sempre** e **nenhum atributo nativo de validação** (`required`, `minLength`, `pattern`) nos inputs — os balões do navegador ("Preencha este campo") não devem aparecer nunca.
- Campos usam os componentes `Field`/`FieldLabel`/`FieldError` de `components/ui/field.tsx` (o item `form` clássico do registry não é compatível com o estilo base-nova; use `field`). O erro do react-hook-form pluga direto: `<FieldError errors={[errors.campo]} />`, com `data-invalid` no `Field` e `aria-invalid` no input.
- **Toda regra tem mensagem amigável em português** no schema — obrigatório é no mínimo `z.string().min(1, "Informe …")`; nunca deixar a mensagem padrão da lib. E-mail no zod v4: `z.string().trim().min(1, "…").pipe(z.email("…"))` (duas mensagens: vazio × inválido).
- Estado de envio vem de `formState.isSubmitting` (desabilita o botão); erros de servidor viram toast, erros de campo ficam no `FieldError`.
- O que **não** é formulário: edição inline de valores em tabelas (nomes sugeridos, segmentos do split) e pickers de arquivo. Nesses casos, validação ad-hoc continua ok.
- **Campo monetário = `components/currency-input.tsx`** (máscara automática de `lib/moeda.ts`, portada do calcarios-polar-app: dígitos são centavos — "1234" → "12,34" — com ponto de milhar sozinho; valor exposto é o TEXTO mascarado, `moedaParaNumero` dá o número). **Campo de data = `components/date-input.tsx`** (digitação manual dd/mm/aaaa com barras automáticas + ícone que abre o date picker do shadcn — Calendar/Popover, `captionLayout="dropdown"`; o valor exposto é SEMPRE ISO `yyyy-mm-dd` ou vazio). Não usar `<input type="date">` nem máscara manual em call site; com react-hook-form, os dois entram via `<Controller>`.

## Barra de progresso em toda navegação

Toda troca de rota mostra a barra linear no topo da página (estilo nprogress). A implementação é própria, em `components/navigation-progress.tsx`, montada no `app/layout.tsx` — **não instalar** `nprogress`/`nextjs-toploader` (o App Router não tem os eventos globais que essas libs esperam, e vale a regra de não adicionar libs de UI).

- **Cliques em `<Link>`/`<a>` internos e voltar/avançar**: cobertos automaticamente por listeners globais — nenhum código extra nos call sites.
- **Navegação programática** (ação de botão que redireciona — login, submit etc.): usar `useProgressRouter()` de `@/components/navigation-progress` no lugar do `useRouter` de `next/navigation`. Mesma API; `push`/`replace`/`back`/`forward` ligam a barra antes de navegar. Fora de componente/hook, chamar `startNavigationProgress()` antes do redirect.
- A barra aparece em **toda** navegação, mesmo instantânea: há um tempo mínimo visível (~200 ms), então rota pré-carregada mostra um flash rápido de 100% em vez de nada. Ela usa `bg-primary` e fica em `z-60` (acima dos dialogs, que usam `z-50`); overlays novos devem ficar abaixo disso.

## Commits: Conventional Commits

Todas as mensagens de commit seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
<tipo>(escopo opcional): descrição no imperativo
```

Tipos aceitos:

| Tipo | Uso |
| --- | --- |
| `feat` | nova funcionalidade |
| `fix` | correção de bug |
| `chore` | manutenção que não altera comportamento (deps, config) |
| `docs` | apenas documentação |
| `refactor` | mudança de código sem alterar comportamento |
| `style` | formatação, sem mudança de lógica |
| `perf` | melhoria de performance |
| `test` | criação ou ajuste de testes |
| `build` | build, dependências, CI |

Exemplos: `feat: adiciona prompt de instalação do PWA`, `fix(ocr): corrige rotação de PDFs escaneados`, `docs: atualiza README com modos de uso`.
