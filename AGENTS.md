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

Módulo novo segue o padrão: página em `app/<modulo>/page.tsx`, lógica em `lib/<modulo>/`, card no painel da inicial.

## Branches e deploy

`main` tem **deploy automático na Vercel a cada commit**. O dia a dia acontece na `develop` (direto ou via PR); só mescle para `main` o que estiver pronto para produção. Agentes: nunca commitar direto na `main`.

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

## Cursor pointer em tudo que é clicável

Todo elemento interativo da plataforma (botões, links, checkboxes, radios, selects, labels clicáveis, itens de menu etc.) usa `cursor: pointer` — o Tailwind v4 deixou botões com `cursor: default` e este projeto reverte isso.

- A regra é **global**, em `app/globals.css` (`@layer base`): um seletor cobre elementos nativos e roles ARIA (`role="button"`, `role="radio"`, …, usados pelos componentes Base UI), excluindo estados desabilitados (`:disabled`, `[aria-disabled="true"]`, `[data-disabled]`).
- **Não** adicionar `cursor-pointer` classe por classe nos componentes — a regra global já cobre.
- Ao criar um elemento clicável novo que não seja `<button>`/`<a href>`, dar a ele um `role` interativo adequado (ex.: `role="button"`, como a área de drop em `app/page.tsx`) — isso o inclui na regra e melhora a acessibilidade. Se realmente não couber role, aí sim usar `cursor-pointer` pontual.

## Barra de progresso em toda navegação

Toda troca de rota mostra a barra linear no topo da página (estilo nprogress). A implementação é própria, em `components/navigation-progress.tsx`, montada no `app/layout.tsx` — **não instalar** `nprogress`/`nextjs-toploader` (o App Router não tem os eventos globais que essas libs esperam, e vale a regra de não adicionar libs de UI).

- **Cliques em `<Link>`/`<a>` internos e voltar/avançar**: cobertos automaticamente por listeners globais — nenhum código extra nos call sites.
- **Navegação programática** (ação de botão que redireciona — login, submit etc.): usar `useProgressRouter()` de `@/components/navigation-progress` no lugar do `useRouter` de `next/navigation`. Mesma API; `push`/`replace`/`back`/`forward` ligam a barra antes de navegar. Fora de componente/hook, chamar `startNavigationProgress()` antes do redirect.
- A barra aparece em **toda** navegação, mesmo instantânea: há um tempo mínimo visível (~200 ms), então rota pré-carregada mostra um flash rápido de 100% em vez de nada. Ela usa `bg-primary` e fica em `z-[60]` (acima dos dialogs, que usam `z-50`); overlays novos devem ficar abaixo disso.

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
