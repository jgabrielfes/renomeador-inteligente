# Renomeador Inteligente de Documentos (Web)

Versão web do renomeador de documentos: analisa imagens e PDFs **no navegador do usuário** e sugere nomes de arquivo com base no conteúdo (RG, CNH, certidões, matrículas, contratos etc.).

Exemplos:

```
WhatsApp Image 2026-08-07 at 10.15.30.jpeg  ->  RG - Guilherme Munhato.jpeg
WhatsApp Image 2026-08-07 at 10.18.12.jpeg  ->  CNH - João da Silva.jpeg
WhatsApp Document 2026-08-07 at 10.22.01.pdf ->  Matrícula 54821.pdf
```

## Análise: IA ou local

Há três modos de análise, configuráveis no próprio app (a escolha fica no navegador):

1. **IA — arquivo inteiro** (padrão): o documento é enviado ao [Google Gemini](https://ai.google.dev) para identificar tipo e nome. É o modo mais preciso. Arquivos acima de ~4 MB caem automaticamente no modo texto (limite de corpo das funções serverless).
2. **IA — somente texto**: o OCR roda localmente e apenas o texto extraído é enviado ao Gemini.
3. **Somente local**: nada sai do navegador — OCR + heurísticas locais ([lib/renamer.ts](lib/renamer.ts)).

A chamada à IA passa pela rota interna [`POST /api/rename`](app/api/rename/route.ts) — a chave do Gemini fica **apenas no servidor**, na variável de ambiente `GEMINI_API_KEY` (veja [.env.example](.env.example); na Vercel, configure em Settings → Environment Variables). Sem chave configurada, ou em qualquer falha da API (rede, cota), a análise local entra automaticamente como fallback.

> **Privacidade**: nos modos com IA, o conteúdo dos documentos é enviado à Google — e no free tier do Gemini os dados enviados podem ser usados para melhorar os modelos. Para documentos sensíveis de terceiros, use o modo "Somente local", que mantém a promessa original do projeto: **nenhum documento sai da máquina**.

Fora a rota de IA (uma função serverless), a infraestrutura continua estática, sem banco de dados:

- OCR com [Tesseract.js](https://github.com/naptha/tesseract.js) (WebAssembly, idiomas por+eng) — na primeira análise o navegador baixa o motor (~15 MB) de um CDN; depois fica em cache;
- Leitura de PDFs com [pdf.js](https://mozilla.github.io/pdf.js/) — usa o texto nativo do PDF quando existe e faz OCR da página renderizada em PDFs escaneados ou digitais cujos dados estão em imagem (ex.: CNH-e).

## Melhoria de imagem (foto de documento)

Fotos de documento tiradas com celular (torta, com sombra, fundo da mesa aparecendo) passam por um pipeline de limpeza em [lib/image-enhance.ts](lib/image-enhance.ts) antes do OCR: recorte automático das bordas, correção de inclinação (deskew), remoção de sombra/iluminação irregular, redução leve de ruído e upscaling clássico (interpolação, não generativo) para fotos tiradas de longe. Tudo roda em Canvas no navegador, sem dependências novas.

Nenhuma etapa altera o conteúdo do documento nem sobrescreve o arquivo original — o pipeline só produz cópias. Por padrão essa limpeza roda apenas internamente, para melhorar a precisão do OCR; o usuário também pode baixar a própria versão otimizada (botão de varinha em cada linha, ou o checkbox "incluir versão otimizada" ao baixar o `.zip`), sempre mantendo o arquivo original disponível para download.

## Dois modos de uso

1. **Selecionar pasta** (Chrome/Edge): o usuário escolhe uma pasta local, o app analisa tudo, mostra a prévia e — após confirmação — **renomeia os arquivos direto na pasta**, via File System Access API. Há um filtro opcional "somente arquivos com WhatsApp no nome".
2. **Upload + download**: em qualquer navegador, o usuário arrasta os arquivos, revisa os nomes sugeridos e baixa tudo num `.zip` já renomeado.

Em ambos os modos a lista é revisável: cada nome sugerido pode ser editado e cada arquivo pode ser desmarcado antes de aplicar.

## Estrutura

- [lib/renamer.ts](lib/renamer.ts) — motor local de nomeação: tipo por pontuação de evidências (texto + nome do arquivo, com peso extra no título), extração de nome em camadas com validação palavra a palavra, identificadores (CPF com dígito verificador, matrícula, contribuinte) e fallback que preserva o nome original quando nada é confiável. Calibrado com documentos reais de escritório imobiliário.
- [lib/ocr.ts](lib/ocr.ts) — pipeline de extração de texto: pré-processamento da imagem (limpeza via `lib/image-enhance.ts` + escala de cinza, autocontraste, ampliação) + Tesseract; PDFs via pdf.js.
- [lib/image-enhance.ts](lib/image-enhance.ts) — melhoria de fotos de documento: recorte automático, deskew, remoção de sombra, denoise leve e upscaling clássico.
- [lib/fs.ts](lib/fs.ts) — modo pasta (File System Access API): listar, e renomear no lugar com `move()` ou cópia+remoção.
- [app/page.tsx](app/page.tsx) — interface (Next.js + shadcn/ui).

## Rodando localmente

```bash
npm install
npm run dev
```

## Deploy

Projeto pronto para a Vercel: `next build` gera as páginas estáticas e a função serverless de `/api/rename`. Única configuração: a variável de ambiente `GEMINI_API_KEY` (sem ela o app funciona só no modo local).

## Tipos reconhecidos

RG, CNH, CPF, Passaporte, Certidões (nascimento, casamento, óbito, valor venal, tributos imobiliários, negativa de débitos, trabalhista, distribuição, protesto, ônus, vintenária), Matrícula de imóvel, IPTU, Guia de ITBI, Habite-se, Comprovantes (residência, pagamento), Boleto, Termo de quitação, Escritura, Procuração e Contratos (compra e venda, locação, prestação de serviços, honorários). As regras ficam em `DOC_RULES` em [lib/renamer.ts](lib/renamer.ts) e podem ser expandidas.
