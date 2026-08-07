<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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
