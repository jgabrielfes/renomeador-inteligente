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
| Folha de pesquisa (WIP, sem UI ainda) | — | `lib/categories.ts`, `lib/certidoes.ts`, `lib/qualificacao.ts` |

## Grupos de rota e acesso

O `app/` é organizado em **route groups por nível de acesso** (não mudam a URL). Toda página nova entra num deles:

| Grupo | Quem acessa | Rotas hoje | Gate |
| --- | --- | --- | --- |
| `(public)` | todo mundo | `/` (painel) | — |
| `(private)` | só logado | `/renomeador`, `/notas` | `requireSession("/rota")` no `page.tsx` (server) de CADA página — leva o caminho na URL de login (`/login?callbackUrl=…`) para voltar direto após entrar |
| `(protected)` | só DESLOGADO | `/login`, `/cadastro` | layout do grupo (`auth()` + redirect; limpa cookie morto) |
| `(master)` | só MASTER | `/admin/*` | layout do grupo (`requireMaster()` → 404) + repetido em páginas/actions (defesa em profundidade) |

- Página privada client-side ganha um `page.tsx` server fino com o gate + um `*-client.tsx` (ex.: `renomeador-client.tsx`) — o gate NUNCA fica só no client.
- O gate de `(private)` fica na página (não no layout) porque layout não conhece a URL da requisição — e o `callbackUrl` é obrigatório.
- As rotas de API dos recursos privados (`/api/rename`, `/api/notas`) também exigem sessão (401) — acompanham as páginas.

Módulo novo segue o padrão: página em `app/(grupo)/<modulo>/page.tsx`, lógica em `lib/<modulo>/`, card no painel da inicial.

## Branches e deploy

`main` tem **deploy automático na Vercel a cada commit**. O dia a dia acontece na `develop` (direto ou via PR); só mescle para `main` o que estiver pronto para produção. Agentes: nunca commitar direto na `main`.

## Autenticação e papéis

- Login por credenciais com **NextAuth v5** (`lib/auth.ts`, sessão JWT) + **Prisma 7** no Postgres do Supabase (`prisma/schema.prisma`; client gerado em `lib/generated/prisma` — não editar, regenerar com `npx prisma generate`; o acesso é sempre via singleton `prisma` de `lib/prisma.ts`).
- **A plataforma é aberta**: `/`, `/renomeador`, `/notas` e as APIs funcionam deslogado. Login existe para identidade/papéis, não para bloquear as ferramentas. **Rotas de convidado** (`/login`, `/cadastro`): só acessíveis deslogado — o gate é a **validação real** `auth()` na própria página (com redirect quando há sessão). **Nunca gatear por presença de cookie** (não há `proxy.ts` — já houve um e causou loop: cookie morto após reset do banco não é sessão). Cookie presente com sessão inválida é **removido**: as páginas de convidado renderizam `components/clear-stale-session.tsx`, que dispara `signOut({redirect:false})` para limpar (server component não escreve cookie; a rota do NextAuth escreve).
- **Cadastro público** em `/cadastro` (`app/cadastro/actions.ts` — server action valida com zod de novo no servidor). Sem confirmação de e-mail por enquanto: a conta nasce com `emailVerified = null` e a UI marca "E-mail não confirmado" (`session.user.emailVerified`).
- **Login com Google** (opcional, aparece só com `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` — `googleHabilitado()` de `lib/auth.ts`): primeiro acesso cria a conta local automaticamente com `emailVerified` preenchido (o Google atesta o e-mail) e `passwordHash = null` (conta Google não entra por senha — o authorize recusa). O vínculo com conta existente é por e-mail e **exige `email_verified === true` do Google** (sem isso seria sequestro de conta). O `token.id` é SEMPRE o id do nosso banco, nunca o id do perfil Google. Botão: `components/google-auth-button.tsx` (divisor "ou" + G oficial inline).
- **"Permanecer conectado"** (checkbox do login, marcado por padrão): controla o prazo REAL da sessão via `token.sessionExpires` (30 dias marcado × 8 horas desmarcado) — o jwt callback devolve `null` quando vence. O cookie em si dura 30 dias; o prazo que vale é o do token.
- **Papéis**: enum `Role` (`USER`/`MASTER`) na tabela `users`, exposto em `session.user.role`. Para gatear tela/ação de administrador use `isMaster(session)`/`requireMaster()` de `lib/auth.ts` — **a checagem vale no servidor** (página/rota), nunca só esconder botão no cliente.
- **O token nunca é fonte de verdade** (segurança em primeiro lugar): o callback `jwt` em `lib/auth.ts` revalida o usuário **no banco em toda requisição** — conta apagada derruba a sessão imediatamente, papel alterado (revogar/conceder master) vale na requisição seguinte, e falha de banco nega a sessão (fail-closed). Nunca otimizar isso para "confiar no token" nem cachear papel no cliente; o que o navegador guarda (cookie/JWT) é só identificação, jamais autorização.
- **Administração**: TODA página, server action e rota de API sob `/admin` começa com `await requireMaster()` — inclusive endpoints novos. Server action é endpoint público: botão escondido no cliente não protege nada. Quem não é master recebe **404** (`notFound()`), não redirect — a rota de administração "não existe" para quem não pode vê-la. O 404 amigável da plataforma é `app/not-found.tsx`.
- **Promover master**: `yarn user:create <email> <senha> "<nome>" --master` (upsert). Migrações: `yarn db:migrate` (usa a conexão direta do Supabase; o app usa o pooler).
- Redirecionamento pós-login/cadastro usa `useProgressRouter()` (convenção da barra de progresso).

## Fronteira de dados (privacidade — regra de ouro)

Documentos são sensíveis (RG, certidões, escrituras). O processamento é no navegador; conteúdo de documento só sai da máquina pelas **rotas internas** `/api/rename` (renomeador) e `/api/notas` (redação de peças), que chamam o Gemini **no servidor** com `GEMINI_API_KEY` de env — a chave nunca chega ao cliente. Todo fluxo com IA tem modo/fallback local. **Não** adicionar chamadas externas diretas do cliente nem novas superfícies de saída de dados fora desse desenho.

## PDF e arquivos do usuário

- **Ler/renderizar PDF**: `pdfjs-dist`, sempre via `loadPdfjs()` de `lib/ocr.ts`. **Montar/escrever PDF**: `pdf-lib`. OCR: `tesseract.js`.
- Escrita na pasta do usuário (File System Access) **só pelos helpers de `lib/fs.ts`**, que carregam as semânticas de segurança: confirmação antes de ação destrutiva, `abort()` para não truncar arquivo em falha, rollback do que a operação criou. Não escrever com `getFileHandle(create: true)` avulso.

## Resolvedor de notas: invariantes

- **A IA nunca toca nos templates** (`public/templates/notas/*.docx`): ela só redige campos variáveis, injetados por `fillDocxTemplate` nos placeholders. Campo sem base no contexto volta `null` e o `{{PLACEHOLDER}}` permanece visível na minuta — é trava de segurança, não bug.
- Toda saída é **rascunho para aprovação humana** — nada é protocolado/assinado automaticamente.
- O classificador de vias (`lib/notas/resolvedor.ts`) foi calibrado com notas devolutivas reais ancorando nos **verbos de remédio** do oficial. Mudanças ali (e no `DOC_RULES` do renomeador) devem ser validadas contra documentos reais, não só a olho.

# Convenções do projeto

## UI: somente shadcn/ui

- Toda a interface usa componentes do [shadcn/ui](https://ui.shadcn.com) em `components/ui/`. Não criar componentes visuais do zero nem instalar outras bibliotecas de UI.
- Antes de implementar qualquer elemento novo de interface, verificar se o registry do shadcn já tem um componente que resolve (dialog, sheet, tooltip, dropdown-menu, sonner etc.) e adicioná-lo com:

  ```bash
  npx shadcn add <componente>
  ```

- **Não copiar código de componente shadcn da memória/internet**: a versão deste projeto (estilo `base-nova`) é baseada em Base UI (`@base-ui/react`), não em Radix — a API difere (ex.: prop `render` no lugar de `asChild`). O CLI gera a versão correta.
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
- Telas de administração: `/admin` (resumo), `/admin/usuarios`, `/admin/renomeacoes`, `/admin/erros` — todas gateadas com `requireMaster()` de `lib/auth.ts` no topo (inclusive nas server actions). Telemetria alimenta as listagens — ambas de melhor-esforço; usuário null = registro antigo de quando a plataforma era aberta:
  - `rename_events`: registrado **no momento da ANÁLISE** (quando os arquivos selecionados são enviados para IA/OCR na fila do renomeador), um evento por **método** (`IA_ARQUIVO` | `IA_TEXTO` | `LOCAL` — enum `MetodoAnalise`) a cada rodada da fila, com **duração**, `itens` (a **tag de tipo** de cada documento + flags `baixado`/`otimizado`, atualizadas depois via `registrarDownloadDeItem`) e `desfecho` (`zip` baixado + opções de **montagem do processo**, via `registrarDesfecho`). As actions de atualização validam **ownership** (só o dono do evento atualiza — server action é endpoint público). Fallback conta como LOCAL; o gatilho é a análise, não a renomeação aplicada.
  - `error_events`: falhas das rotas de IA via `registrarErro` de `lib/error-log.ts`.
  - **Privacidade da telemetria (regra dura)**: NUNCA gravar conteúdo de documento **nem nomes de arquivo/pessoa** — houve uma versão que gravava nomes e ela foi revertida com limpeza do banco. Telemetria = tags de tipo, contagens, durações e flags de desfecho, nada além.

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
