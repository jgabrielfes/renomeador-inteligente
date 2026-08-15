<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DOIS SITES, UM REPOSITÓRIO

Este repositório publica **dois sites independentes**, um por ferramenta. O que os diferencia é a variável de ambiente **`APP`** (`lib/app.ts`), configurada no projeto da Vercel:

| `APP` | URL | O que `/` é | O que existe |
| --- | --- | --- | --- |
| `renomeador` | `renomeador-inteligente.vercel.app` | o Renomeador | `/`, `/login`, `/cadastro`, `/admin`, `/admin/usuarios`, `/admin/renomeacoes`, `/admin/erros`, `/api/rename` |
| `sucessorista` | `osucessorista.vercel.app` | o Sucessorista | tudo acima **+** `/admin/sucessorista`, `/portal/[token]`, `/api/sucessorista`, `/api/partilha`, `/api/portal/*`, `/api/noticias` |

Regras que valem para qualquer mudança:

- **`lib/app.ts` é a fonte da verdade.** `APP` (a plataforma), `EH_RENOMEADOR`/`EH_SUCESSORISTA`, `IDENTIDADE` (nome/descrição/módulo de telemetria), `requirePlataforma()` (página → 404) e `foraDaPlataforma()` (rota de API → 404). Sem a env a aplicação **não sobe** — de propósito.
- **`process.env.APP` é só do servidor.** O cliente recebe a plataforma por prop, vinda de um server component. Nunca criar um `NEXT_PUBLIC_APP` paralelo.
- **A raiz é o módulo.** Não existe mais painel de ferramentas nem as rotas `/renomeador` e `/sucessorista` — quem chegar nelas cai no 404. Módulo novo entra como um `if` em `app/(private)/page.tsx`, com `await import()` (o outro client não pode entrar no payload da rota).
- **Rota que é só de um lado começa com o gate**: `await requirePlataforma("SUCESSORISTA")` em página/server action, `foraDaPlataforma("SUCESSORISTA")` em route handler. Vale inclusive para server action — endpoint público.
- **O Renomeador roda embutido no cofre do Sucessorista**, então `/api/rename` e `lib/ai.ts` são dos DOIS sites; só a rota `/renomeador` é que não existe lá.
- **O banco é um só, mas nada cruza a fronteira**: `users`, `error_events` e `rename_events` carregam a coluna `app`, e toda consulta do `/admin` filtra por ela.

# Mapa do projeto

Cada ferramenta é um site (tabela acima); o código continua organizado por módulo:

| Módulo | Código |
| --- | --- |
| Renomeador Inteligente | `lib/renamer.ts` (motor local), `lib/ai.ts` + `app/api/rename` (IA), `lib/ocr.ts`, `lib/image-enhance.ts`/`lib/perspective.ts` (otimização), `lib/pdf-split.ts` (separador), `lib/to-pdf.ts`, `app/(private)/renomeador/*` (client + actions) |
| O Sucessorista (em teste) | `lib/partilha/*` (motor de partilha/ITCMD, puro e com testes), `lib/gemini-sucessorista.ts` + `app/api/sucessorista` (leitura do cofre), `lib/portal/*` + `app/portal/[token]` + `app/api/portal` (portal do herdeiro), `app/api/partilha` (motor via API), `app/(private)/sucessorista/*` |
| Folha de pesquisa (WIP, sem UI ainda) | `lib/categories.ts`, `lib/certidoes.ts`, `lib/qualificacao.ts` |

## Grupos de rota e acesso

O `app/` é organizado em **route groups por nível de acesso** (não mudam a URL). Toda página nova entra num deles:

| Grupo | Quem acessa | Rotas hoje | Gate |
| --- | --- | --- | --- |
| `(private)` | só logado | `/` (a ferramenta deste site) | `requireSession("/")` no `page.tsx` (server) — leva o caminho na URL de login (`/login?callbackUrl=…`) para voltar direto após entrar |
| `(protected)` | só DESLOGADO | `/login`, `/cadastro` | layout do grupo (`auth()` + redirect; limpa cookie morto) |
| `(master)` | só MASTER | `/admin/*` | layout do grupo (`requireMaster()` → 404) + repetido em páginas/actions (defesa em profundidade) |

- **Não há mais grupo `(public)`**: a raiz é a ferramenta e exige sessão. Por isso as telas de login/cadastro **não** têm link "voltar para `/`" — seria um laço de volta ao próprio login.
- Página privada client-side ganha um `page.tsx` server fino com o gate + um `*-client.tsx` (ex.: `renomeador-client.tsx`, `portal-client.tsx`) — o gate NUNCA fica só no client.
- O gate de `(private)` fica na página (não no layout) porque layout não conhece a URL da requisição — e o `callbackUrl` é obrigatório.
- **A faixa de sessão (`components/user-menu.tsx`) vive DENTRO do módulo**, passada como prop `menu` de `app/(private)/page.tsx` (server component como prop de client component). Era o painel de ferramentas que a hospedava; sem ela não há caminho para `/admin` nem para sair.
- As rotas de API dos recursos privados (`/api/rename`, `/api/sucessorista`, `/api/partilha`, `/api/portal/convite`, `/api/noticias`) exigem sessão (401) — acompanham as páginas; as do Sucessorista somam o gate de plataforma (404 no outro site). Exceção deliberada: `app/portal/[token]` e `GET/POST /api/portal/[token]` são acessíveis **pelo token** — o herdeiro convidado não tem login; o token é a credencial.

## Branches e deploy

O dia a dia acontece na `develop` (direto ou via PR); só mescle para `main` o que estiver pronto para produção. Agentes: nunca commitar direto na `main`.

- **Preview**: toda branch que não é a `main` publica preview automaticamente na Vercel, como antes — nos DOIS projetos.
- **Produção**: a `main` NÃO tem auto-deploy (`vercel.json` → `git.deploymentEnabled.main = false`). Quem publica é a GitHub Action `.github/workflows/deploy-producao.yml`, que roda a CLI da Vercel com o `VERCEL_TOKEN` do dono da conta. Motivo: no plano Hobby a Vercel BLOQUEIA o deploy de produção quando o autor do commit não é o dono da conta — com a action, o deploy é atribuído ao dono e sai normalmente, venha o merge de quem vier. Se o auto-deploy da `main` for reativado no painel, haverá deploy duplicado (um deles bloqueado).
- **A action publica os DOIS sites** por uma `matrix` (`fail-fast: false` — um site quebrado não impede o outro). Cada job precisa do `projectId` do seu projeto: secrets `VERCEL_PROJECT_ID_RENOMEADOR` e `VERCEL_PROJECT_ID_SUCESSORISTA` (o `VERCEL_ORG_ID` é o mesmo). O `APP` de cada site **não** está no workflow: vem do `vercel pull`, que traz as envs do projeto — é o painel da Vercel que define quem é quem.

## Autenticação e papéis

- Login por credenciais com **NextAuth v5** (`lib/auth.ts`, sessão JWT) + **Prisma 7** no Postgres do Supabase (`prisma/schema.prisma`; client gerado em `lib/generated/prisma` — não editar, regenerar com `npx prisma generate`; o acesso é sempre via singleton `prisma` de `lib/prisma.ts`).
- **A CONTA É POR SITE.** A chave do usuário é o par `(email, app)` — `@@unique([email, app])`, não mais `email @unique`. Quem tem conta no Renomeador **não** entra no Sucessorista com ela; cria uma lá. Toda consulta de usuário usa `where: { email_app: { email, app: APP } }`, e o callback `jwt` derruba a sessão se `usuario.app !== APP` (os cookies já são separados por domínio; a checagem é o que torna a separação real). O `yarn user:create` cria nos DOIS sites por padrão — restrinja com `--app=renomeador|sucessorista`.
- **A ferramenta exige login**: `/` e as APIs (`/api/rename`, `/api/sucessorista` → 401) só funcionam logado — ver a tabela de grupos de rota acima; não há mais tela pública. **Rotas de convidado** (`/login`, `/cadastro`): só acessíveis deslogado — o gate é a **validação real** `auth()` na própria página (com redirect quando há sessão). **Nunca gatear por presença de cookie** (não há `proxy.ts` — já houve um e causou loop: cookie morto após reset do banco não é sessão). Cookie presente com sessão inválida é **removido**: as páginas de convidado renderizam `components/clear-stale-session.tsx`, que dispara `signOut({redirect:false})` para limpar (server component não escreve cookie; a rota do NextAuth escreve).
- **Cadastro público** em `/cadastro` (`app/cadastro/actions.ts` — server action valida com zod de novo no servidor). Sem confirmação de e-mail por enquanto: a conta nasce com `emailVerified = null` e a UI marca "E-mail não confirmado" (`session.user.emailConfirmed`).
- **Login com Google** (opcional, aparece só com `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` — `googleHabilitado()` de `lib/auth.ts`): primeiro acesso cria a conta local automaticamente com `emailVerified` preenchido (o Google atesta o e-mail) e `passwordHash = null` (conta Google não entra por senha — o authorize recusa). **Um cliente OAuth por site** (envs próprias em cada projeto da Vercel), com callback `https://<dominio>/api/auth/callback/google` — o upsert é da conta daquela plataforma. O vínculo com conta existente é por e-mail e **exige `email_verified === true` do Google** (sem isso seria sequestro de conta). O `token.id` é SEMPRE o id do nosso banco, nunca o id do perfil Google. Botão: `components/google-auth-button.tsx` (divisor "ou" + G oficial inline).
- **"Permanecer conectado"** (checkbox do login, marcado por padrão): controla o prazo REAL da sessão via `token.sessionExpires` (30 dias marcado × 8 horas desmarcado) — o jwt callback devolve `null` quando vence. O cookie em si dura 30 dias; o prazo que vale é o do token.
- **Papéis**: enum `Role` (`USER`/`MASTER`) na tabela `users`, exposto em `session.user.role`. Para gatear tela/ação de administrador use `isMaster(session)`/`requireMaster()` de `lib/auth.ts` — **a checagem vale no servidor** (página/rota), nunca só esconder botão no cliente.
- **O token nunca é fonte de verdade** (segurança em primeiro lugar): o callback `jwt` em `lib/auth.ts` revalida o usuário **no banco em toda requisição** — conta apagada derruba a sessão imediatamente, papel alterado (revogar/conceder master) vale na requisição seguinte, e falha de banco nega a sessão (fail-closed). Nunca otimizar isso para "confiar no token" nem cachear papel no cliente; o que o navegador guarda (cookie/JWT) é só identificação, jamais autorização.
- **Administração**: TODA página, server action e rota de API sob `/admin` começa com `await requireMaster()` — inclusive endpoints novos. Server action é endpoint público: botão escondido no cliente não protege nada. Quem não é master recebe **404** (`notFound()`), não redirect — a rota de administração "não existe" para quem não pode vê-la. O 404 amigável da plataforma é `app/not-found.tsx`.
- **Promover master**: `yarn user:create <email> <senha> "<nome>" --master` (upsert). Migrações: `yarn db:migrate` (usa a conexão direta do Supabase; o app usa o pooler).
- Redirecionamento pós-login/cadastro usa `useProgressRouter()` (convenção da barra de progresso).

## Fronteira de dados (privacidade — regra de ouro)

Documentos são sensíveis (RG, certidões, escrituras). O processamento é no navegador; conteúdo de documento só sai da máquina pelas **rotas internas** `/api/rename` (renomeador) e `/api/sucessorista` (leitura do cofre do inventário), que chamam o Gemini **no servidor** com `GEMINI_API_KEY` de env — a chave nunca chega ao cliente. Todo fluxo com IA tem modo/fallback local. **Não** adicionar chamadas externas diretas do cliente nem novas superfícies de saída de dados fora desse desenho.

**Aprendizado do escritório no banco, POR CONTA**: as "Regras do escritório" e as correções aprendidas do renomeador ficam em `renamer_lessons` (uma linha por usuário), via server actions de `app/(private)/renomeador/licoes-actions.ts` — cada action valida a sessão e grava só a linha do próprio usuário, com gravações **parciais** (salvar regras não toca nas correções e vice-versa). O estado reativo continua em `lib/lessons.ts` (useSyncExternalStore): o snapshot inicial vem do servidor (`page.tsx` → `initLessons`), regras salvam com debounce (+ flush no blur do textarea), correções na hora; quem tinha dados da era localStorage é migrado uma única vez (`migrateLegacyLessons` — só quando a conta está vazia e o carregamento inicial funcionou). Isto é dado do PRÓPRIO usuário (as correções contêm nomes que ele digitou), não telemetria: **nunca exibir em `/admin`**.

## PDF e arquivos do usuário

- **Ler/renderizar PDF**: `pdfjs-dist`, sempre via `loadPdfjs()` de `lib/ocr.ts`. **Montar/escrever PDF**: `pdf-lib`. OCR: `tesseract.js`.
- Escrita na pasta do usuário (File System Access) **só pelos helpers de `lib/fs.ts`**, que carregam as semânticas de segurança: confirmação antes de ação destrutiva, `abort()` para não truncar arquivo em falha, rollback do que a operação criou. Não escrever com `getFileHandle(create: true)` avulso.

> O módulo "Resolvedor de Notas Devolutivas" foi REMOVIDO da plataforma. O enum `Modulo` do banco mantém `NOTAS` e a tabela `notas_events` permanece no schema apenas pelos registros históricos — nenhum código novo deve referenciá-los. Vale lembrar a lição que ele deixou: mudanças em classificadores calibrados (como o `DOC_RULES` do renomeador) devem ser validadas contra documentos reais, não só a olho; e toda saída de IA é **rascunho para aprovação humana**.

## Sucessorista: invariantes

- **Esqueleto do módulo**: entrada pelo cofre (etapa 0 — leitura real dos documentos via `/api/sucessorista`), navegação LIVRE entre as abas (nada bloqueia nada) e o **painel do caso fixo à direita** (`painel-caso.tsx`) — todo campo digitado move um número lá na hora. O estado fiscal (isenções do art. 6º, faixas da reforma, protocolo) vive no `sucessorista-client.tsx` e alimenta o painel E a aba V com os MESMOS números — não recalcular em views separadas. A aba 0 ("O caso") é um **dashboard em cards** (relógio vivo, novidades da plataforma, cofre, arquivo do caso, início rápido) com o **alternador de tema claro × escuro** (localStorage `sucessorista-tema`; o escuro é a classe `.tema-escuro` que só re-mapeia as variáveis da paleta — nunca cor solta).
- **Base da escritura pelo Enunciado nº 7 do CNB/SP** (`baseDeEmolumentosDaEscritura` em `lib/partilha/custas.ts`): os emolumentos do inventário saem pela legítima no **MAIOR entre o valor atribuído pelas partes e o venal na data da LAVRATURA** (venal ATUAL, não o do óbito — art. 7º da Lei 11.331/2002), excluída a meação; o maior é apurado bem a bem.
- **O Renomeador COMPLETO é embutível**: `renomeador-client.tsx` aceita `embutido` (esconde a faixa de sessão) e `regrasExtras` (calibração do módulo hospedeiro somada às Regras do escritório em cada lote de IA, nunca persistida). O cofre do Sucessorista abre a ferramenta inteira num Dialog (`caso-view.tsx` — import dinâmico sem SSR, `REGRAS_RENOMEADOR_SUCESSOES` calibrando os nomes para inventário/família/sucessões); as lições da conta chegam pelo `page.tsx` do Sucessorista (`carregarLicoes`).
- **Extração do cofre é apoio, nunca verdade**: campo sem base clara no documento volta `null` e a folha fica em branco para o advogado preencher (`lib/gemini-sucessorista.ts`); a mesclagem só preenche campo VAZIO e deduplica herdeiros/bens por nome. A UI repete que é para CONFERIR.
- **Identidade "livro de notas" por cima do shadcn**: os componentes são os de `components/ui/` (convenção geral), e a identidade (papel/serifa/bronze/lacre) entra pelo `sucessorista.css`, que **re-mapeia as variáveis de tema do shadcn** (`--background`, `--primary`, `--border`…) dentro do escopo `.sucessorista`. Não estilizar elemento cru nem criar componente visual próprio — vestir o shadcn pelo tema escopado.
- **Folha = edição inline contínua** (o painel reage a cada tecla): os campos do caso são inputs controlados (a exceção prevista na convenção de formulários); react-hook-form + zod entram nos formulários de ADIÇÃO com validação (adicionar herdeiro, lançar bem, início rápido).
- O motor (`lib/partilha/*`) é puro, com testes — mudanças ali acompanham os `.test.ts`, e cálculo jurídico novo entra com fundamento legal na saída (padrão `fundamento`/`precedente` dos quinhões).
- **Estado sobrevive ao F5, a fechar o navegador e vive na PASTA DO PROCESSO**: a etapa ativa segue na URL (`?etapa=…`, lista fechada, `history.replaceState`), mas a persistência do caso agora é o **CaseStore** (`lib/partilha/caso-store.ts` — schema `caso.json` v1 com cabeçalho primeiro, hash determinístico de `dados` e manifesto de documentos): a tela inicial do módulo é o painel **"Meus casos"** (`casos-view.tsx`, pinta do cache e revalida em segundo plano, ordenado pela urgência do art. 611). Dois modos atrás da MESMA interface — o wizard não sabe qual está ativo: **pasta** (`store-pasta.ts`, File System Access; raiz escolhida uma vez e guardada no IndexedDB; cada subpasta com `caso.json` é um caso; o app SÓ escreve `caso.json` e `.sucessorista/**` — jamais toca documento do usuário; backups rotativos de 10; **guarda de conflito** por `atualizadoEm`+`atualizadoPor` com três saídas — manter/recarregar/salvar como cópia — o que torna seguro usar a raiz dentro de Google Drive/OneDrive) e **portátil** (`store-portatil.ts`, IndexedDB + arquivo `.sucessorista.json` — Firefox/Safari/permissão negada). **Salvamento automático**: debounce de 1s + flush em `visibilitychange`/`blur`/`beforeunload`, com indicador na lombada (salvando…/salvo às/erro/somente leitura). **Manifesto por hash** (`manifesto.ts` + `sha256.ts`, SHA-256 incremental em blocos de 8 MB): religa documentos por caminho→metadados→hash (religado/alterado/movido/novo/faltando) e reanexa nas caixas do processo; no portátil o religamento acontece ao rearrastar a pasta. Rascunho legado (`rascunho.ts`, banco agora aberto por `idb.ts` v2) migra pelo banner do painel e NÃO é apagado. Arquivos (`File`) continuam fora do JSON. Ids de herdeiro/bem são **aleatórios** (`crypto.randomUUID`), nunca contador sequencial — o contador zera no reload e colidiria com os ids restaurados.
- **Perfis de uso**: alternador Advogado(a) × Escrevente Notarial na lombada (localStorage `sucessorista-perfil`). Advogado tem as abas VII Honorários e VIII Minutas (minuta ao Tabelionato + petição inicial judicial com redação por IA e fallback local em `lib/partilha/peticao-judicial.ts`); escrevente tem a aba VII Escritura (`lib/partilha/escritura.ts` — determinística, NA FORMATAÇÃO do modelo do balcão via `montarDocxRico`: Tahoma, títulos centralizados, negrito/sublinhado, tabela-resumo e partilha em tabelas Patrimônio·Proporção·Valor; tabelionato/escrevente/tabelião SEMPRE em lacunas; cláusulas condicionais: modalidade presencial/videoconferência/híbrida, Detran só com veículo, parágrafo bancário do art. 168 CP só com crédito bancário, tributo pago × isento; qualificação completa das partes com casamento/cônjuge/certidão e detalhes de imóvel/veículo extraídos pela leitura). O **Analisador de Matrícula** e as **Fontes de Pesquisa patrimonial** (`fontes-view.tsx` — o checklist saiu do Acervo) fecham a lombada nos dois perfis (IX/X no advogado, VIII/IX no escrevente). O radar do Migalhas aparece SÓ na aba 0.
- **Analisador de Matrícula** (aba `matricula`, `matricula-view.tsx`): relatório completo de situação dominial de certidões de matrícula — matrículas avulsas (arraste) OU as anexadas ao item "matricula-imovel" do caso. Extração em `lib/gemini-matricula.ts` via `/api/sucessorista` (multipart com campo `tipo=MATRICULA` — mesma rota e fronteira de dados do cofre; matrícula acima de ~3,6 MB vira UMA IMAGEM POR PÁGINA no navegador via `lib/envio-imagens.ts`, e a rota aceita até 60 itens nesse modo); o relatório traz identificação, **Tabela Consolidada de Situação Dominial** (tabela de verdade: Nome · Fração · Participação % · Tipo de Domínio · Origens · Status Cônjuge), ônus ativos, alertas `[ALTA]`/`[BAIXA]` com ação recomendada, resumo booleano, análise jurídica da cadeia dominial, pontos de atenção e índice de confiabilidade — e baixa em **PDF nas cores do módulo** (`lib/partilha/matricula-pdf.ts`, pdf-lib no navegador). Telemetria: `ANALISE_MATRICULA`/`ANALISE_MATRICULA_PDF` (contagens, nunca conteúdo).
- **Sucessões cumuladas moram no item I (A família)** (`EditorSucessoes` em `familia.tsx`; o dado segue no estado fiscal `fiscal.sucessoes`): cada sucessão tem fato gerador próprio (ITCMD pela UFESP/prazos do óbito respectivo + atos próprios de escritura e registro no motor de custas). Com a flag `mesmosHerdeiros`, o item III mostra **uma partilha POR sucessão** (`PartilhasSucessoes` no client — caso sintético com a base transmitida rodando o MESMO motor `partilhar`). A aba V (Custos) só REFLETE as sucessões; o lançamento é na Família. **O acervo abre colunas por sucessão** (`FaixaSucessoesDoBem` em `acervo-view.tsx`; dados em `Bem.sucessoes`/`Bem.sucessaoExclusiva` de `lib/partilha/types.ts`): cada bem pode ter valor no fato gerador respectivo + fração daquele de cujus, e pode ser EXCLUSIVO de uma sucessão (fora do rol das demais — inclusive do inventário principal); a base de cada sucessão passa a ser calculada dali (`basesSucessoes` no client; sem coluna preenchida vale a base manual).
- **Economia não é "quadrada"**: o card do usufruto (`lib/partilha/economia.ts`) calcula a **torna da reserva** (parte do direito do sobrevivente não compensável com os bens não-imóveis) contra a isenção de doação de 2.500 UFESPs × herdeiros — torna isenta = economia integral; excesso = o card avisa do **ITCMD inter vivos antecipado**, mostra a conta líquida e sugere limitar/escalonar (só some quando a líquida não é positiva). Demais oportunidades: prazos dos arts. 17/21, defesa da multa de abertura no extrajudicial após 180 dias (precedentes TJSP), escolha do valor de transmissão no IR (art. 23 da Lei 9.532/97 — card sempre presente com bens lançados) e sobrepartilha de bens morosos (CPC, art. 669, com QUOTAS no acervo).
- **Isenções do art. 6º, I, "a"/"b" são interpretadas automaticamente** (`analisarIsencoesPorBem` em `lib/partilha/itcmd.ts` + `RespostasFichaIsencao`): a alínea "b" (único imóvel ≤ 2.500 UFESPs) sai do próprio acervo; a alínea "a" (≤ 5.000 UFESPs) é decidida pelas respostas "possui outro imóvel?" da ficha dos herdeiros (item I) — algum SIM derruba a hipótese, todos NÃO confirmam o requisito (resta só a residência), ficha incompleta mantém a condição pedindo as respostas.
- **Portal do herdeiro tem botão "Salvar"** (`envioConfirmadoEm` no convite, PATCH `{confirmarEnvio:true}`, telemetria `PORTAL/CONFIRMACAO` sem usuário) e os envios do cofre aparecem **dentro do card correlato** da aba Documentos (`CATALOGO_DO_PEDIDO_PORTAL` em `documentos.tsx`) — só nome proposto/tipo/status: o ARQUIVO permanece no navegador do herdeiro (fronteira de dados).
- **Módulos fiscais e pré-inventário** (aba XI/`fiscal`, `fiscal-view.tsx`): quatro MOTORES PUROS com testes, todos consumindo os dados que já existem no caso (bens da etapa II, herdeiros/quinhões da III), com disclaimer de estimativa de apoio. Os valores de referência ficam em `lib/partilha/parametros-fiscais.ts` (tabela VERSIONADA, como as UFESP/Selic do ITCMD): (1) **Ganho de capital do espólio** (`ganho-capital.ts`) — declarado × mercado bem a bem, reduções art. 18/FR1/FR2, isenções (único imóvel ≤ 440k, pequeno valor), alíquotas progressivas da L13.259, recomendação `ATUALIZAR_SEM_CUSTO`/`ATUALIZAR_COMPENSA`/`MANTER_DECLARADO`, DARF 4600; (2) **Declaração Final de Espólio** (`declaracao-final.ts`) — datas inicial/intermediárias/final (último dia útil de abril), status OK/PENDENTE/ATRASADO, herdeiros/quinhões para a DIRPF; (3) **Detector de Alvará da Lei 6.858/80** (`alvara.ts`) — dispensa total × alvará simplificado × inventário, teto 500 OTN configurável por comarca, mini-parecer; (4) **Radar de bens fora do inventário** (`radar-bens.ts`) — VGBL/PGBL/seguro fora do ITCMD (STF Tema 1214, art. 794 CC), conta conjunta 50%, verbas 6.858, com economia de ITCMD estimada. Estado extra persistido em `EstadoModulosFiscais` (campo `modulosFiscais` do snapshot v1, opcional/retrocompatível).

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
- **Busca textual: no BANCO, com o termo na query string** (`?busca=`), lida por `parseBusca` de `lib/admin.ts`. O componente é o `SearchFilter` (`components/admin/search-filter.tsx`): **sem botão e sem Enter** — a digitação vira navegação por debounce (350 ms), voltando à página 1. Referência: `/admin/usuarios?busca=` (nome OU e-mail). A busca é indiferente a **caixa e a ACENTO** ("tais" acha "Taís"): o `mode: "insensitive"` do Prisma só resolve a caixa, então a comparação sem acento usa `unaccent` do Postgres (extensão criada na migração `busca_sem_acento`) — `idsDaBuscaDeUsuarios` de `lib/admin.ts` devolve os ids num SQL cru com o termo **parametrizado**, e o `findMany` normal mantém ordenação, paginação e `_count`. Três regras que fazem a digitação ficar fluida (não desfazer):
  - o **estado local é a única fonte da verdade** do campo — re-derivar do valor da URL faz o texto sumir e voltar a cada busca, porque enquanto o servidor responde a prop ainda traz o termo antigo;
  - `router.replace` + `useTransition` (**exceção consciente** ao `useProgressRouter`): a barra global piscaria a cada pausa da digitação, então o progresso aparece no próprio campo (a lupa vira spinner) e o histórico não ganha um item por tecla;
  - `type="text"`, não `type="search"` — o tipo search desenha um X nativo e ficariam dois botões de limpar.
- **Todo filtro preserva os outros**: `queryDaTabela` (`lib/admin.ts`) monta a query com período + busca + paginação + ordenação, e `PeriodFilter`/`SearchFilter`/`SortableHeader` recebem essa query para trocar só a sua dimensão (os filtros que mudam o recorte voltam à página 1).
- **Ordenação das tabelas: no BANCO, com a coluna na query string** (`?ordenar=<coluna>&direcao=asc|desc`). A página lê com `parseOrdenacao` de `lib/admin.ts`, que valida a coluna contra a **lista fechada** daquela tabela (nome de coluna vem do usuário e entra no `orderBy` do Prisma — a lista é o que impede pedir ordem por campo indevido) e traduz para o `orderBy` num `switch` explícito. O cabeçalho é o `SortableHeader` (`components/admin/sortable-header.tsx`): Link com seta, inverte a direção na coluna ativa e **volta à página 1**. Nunca ordenar no cliente.
- Telas de administração: `/admin` (resumo), `/admin/usuarios`, `/admin/renomeacoes`, `/admin/erros` nos dois sites + `/admin/sucessorista` só no Sucessorista — todas gateadas com `requireMaster()` de `lib/auth.ts` no topo (inclusive nas server actions). **Cada painel mostra só o próprio site**: `users`/`error_events`/`rename_events` filtram por `app: APP`, `module_accesses` por `modulo: IDENTIDADE.modulo`, e `alternarMaster` recusa conta de outra plataforma. `sucessorista_events` não precisa de filtro — a tabela inteira é de lá. Telemetria alimenta as listagens — ambas de melhor-esforço; usuário null = registro antigo de quando a plataforma era aberta:
  - `rename_events`: registrado **no momento da ANÁLISE** (quando os arquivos selecionados são enviados para IA/OCR na fila do renomeador), um evento por **método** (`IA_ARQUIVO` | `IA_TEXTO` | `LOCAL` — enum `MetodoAnalise`) a cada rodada da fila, com **duração**, `app` (o site onde o lote nasceu — o Renomeador roda embutido no cofre, e o que é feito lá conta para o painel do Sucessorista), `itens` (a **tag de tipo** de cada documento + flags `baixado`/`otimizado`, atualizadas depois via `registrarDownloadDeItem`) e `desfecho` (`zip` baixado + opções de **montagem do processo**, via `registrarDesfecho`). As actions de atualização validam **ownership** (só o dono do evento atualiza — server action é endpoint público). Fallback conta como LOCAL; o gatilho é a análise, não a renomeação aplicada.
  - `error_events`: falhas das rotas de IA via `registrarErro` de `lib/error-log.ts` — e o fallback do renomeador no CLIENTE (origem `renomeador/fallback-local`, via server action `registrarErroDeAnalise` com sessão obrigatória): registrado junto do toast "IA indisponível", cobre falhas que nunca chegam à rota (rede, timeout, resposta inválida).
  - `sucessorista_events`: quatro ações (`AcaoSucessorista`) via `app/(private)/sucessorista/actions.ts` — `LEITURA_COFRE` (documentos lidos pela IA na etapa 0, com tipos detectados e falhas), `CALCULO` (**retrato estrutural do caso**: herdeiros, bens e seus tipos, regime, rito, faixa de porte, divergências, isenções, parcelas do ITCMD), `DOCUMENTO` (minuta/planilha/processo gerado, com `comIa` — em `PETICAO_JUDICIAL`, `comIa: false` significa que a IA falhou e valeu o fallback local) e `PORTAL` (convite gerado pelo advogado e resposta do herdeiro; a resposta vem da rota do portal e fica **sem usuário**, pois o herdeiro não tem login). Chave de correlação: `casoId` — id **aleatório** gerado no cliente, sem dado pessoal. `CALCULO` é **upsert por casoId** (o motor recalcula a cada tecla; o envio é debounced em 15s) — uma linha por inventário com o estado mais recente, então contar `CALCULO` conta CASOS, não recálculos.
  - `module_accesses`: **abertura de módulo**, não login. O `AccessTracker` (`components/access-tracker.tsx`) monta no `page.tsx` de cada ferramenta e registra **uma vez por sessão do navegador por módulo** (flag no sessionStorage, marcada ANTES do envio para o efeito duplo do modo estrito não contar duas vezes). Ir e voltar entre módulos não infla; nova aba/dia conta de novo. Alimenta a coluna "Acessos" de `/admin/usuarios` (ordenável por `_count` da relação) e o dialog com o detalhamento por ferramenta.
  - **Privacidade da telemetria (regra dura)**: NUNCA gravar conteúdo de documento **nem nomes de arquivo/pessoa** — houve uma versão que gravava nomes e ela foi revertida com limpeza do banco. Telemetria = tags de tipo, contagens, durações e flags de desfecho, nada além. No Sucessorista isso inclui **valor de acervo**: o porte do caso entra como **FAIXA** (`lib/porte.ts` — `porteDoAcervo` converte no cliente; o número nunca sai do navegador), e nada de CPF, texto de instruções à IA ou snapshot da folha.

## Cursor pointer em tudo que é clicável

Todo elemento interativo da plataforma (botões, links, checkboxes, radios, selects, labels clicáveis, itens de menu etc.) usa `cursor: pointer` — o Tailwind v4 deixou botões com `cursor: default` e este projeto reverte isso.

- A regra é **global**, em `app/globals.css` (`@layer base`): um seletor cobre elementos nativos e roles ARIA (`role="button"`, `role="radio"`, …, usados pelos componentes Base UI), excluindo estados desabilitados (`:disabled`, `[aria-disabled="true"]`, `[data-disabled]`).
- **Não** adicionar `cursor-pointer` classe por classe nos componentes — a regra global já cobre.
- Ao criar um elemento clicável novo que não seja `<button>`/`<a href>`, dar a ele um `role` interativo adequado (ex.: `role="button"`, como a área de drop do renomeador) — isso o inclui na regra e melhora a acessibilidade. Se realmente não couber role, aí sim usar `cursor-pointer` pontual.

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
