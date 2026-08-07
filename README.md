# Renomeador Inteligente de Documentos (Web)

Versão web do renomeador de documentos: analisa imagens e PDFs **no navegador do usuário** e sugere nomes de arquivo com base no conteúdo (RG, CNH, certidões, matrículas, contratos etc.).

Exemplos:

```
WhatsApp Image 2026-08-07 at 10.15.30.jpeg  ->  RG - Guilherme Munhato.jpeg
WhatsApp Image 2026-08-07 at 10.18.12.jpeg  ->  CNH - João da Silva.jpeg
WhatsApp Document 2026-08-07 at 10.22.01.pdf ->  Matrícula 54821.pdf
```

## Privacidade

Todo o processamento é **100% local, no navegador**:

- OCR com [Tesseract.js](https://github.com/naptha/tesseract.js) (WebAssembly, idiomas por+eng);
- Leitura de PDFs com [pdf.js](https://mozilla.github.io/pdf.js/) — usa o texto nativo do PDF quando existe e só faz OCR em PDFs escaneados.

Os documentos **nunca são enviados a nenhum servidor**. O deploy é um site estático (sem backend, sem banco de dados). Na primeira análise o navegador baixa o motor de OCR (~15 MB) de um CDN; depois disso fica em cache.

## Dois modos de uso

1. **Selecionar pasta** (Chrome/Edge): o usuário escolhe uma pasta local, o app analisa tudo, mostra a prévia e — após confirmação — **renomeia os arquivos direto na pasta**, via File System Access API. Há um filtro opcional "somente arquivos com WhatsApp no nome".
2. **Upload + download**: em qualquer navegador, o usuário arrasta os arquivos, revisa os nomes sugeridos e baixa tudo num `.zip` já renomeado.

Em ambos os modos a lista é revisável: cada nome sugerido pode ser editado e cada arquivo pode ser desmarcado antes de aplicar.

## Estrutura

- [lib/renamer.ts](lib/renamer.ts) — lógica de nomeação (detecção do tipo de documento, extração de nome/CPF/matrícula). Port fiel do script Python original (`renomeador_documentos.py`).
- [lib/ocr.ts](lib/ocr.ts) — pipeline de extração de texto: pré-processamento da imagem (escala de cinza, autocontraste, ampliação) + Tesseract; PDFs via pdf.js.
- [lib/fs.ts](lib/fs.ts) — modo pasta (File System Access API): listar, e renomear no lugar com `move()` ou cópia+remoção.
- [app/page.tsx](app/page.tsx) — interface (Next.js + shadcn/ui).

## Rodando localmente

```bash
npm install
npm run dev
```

## Deploy

Projeto pronto para a Vercel: `next build` gera páginas estáticas, sem configuração adicional.

## Tipos reconhecidos

RG, CNH, CPF, Passaporte, Certidão de nascimento/casamento/óbito, Comprovante de residência, Matrícula de imóvel, IPTU, ITBI, Escritura, Procuração e Contrato. As regras ficam em `DOC_RULES` em [lib/renamer.ts](lib/renamer.ts) e podem ser expandidas.
