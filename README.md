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

> O pdf.js 6 usa `Map.prototype.getOrInsertComputed` ao renderizar páginas — método novíssimo, ausente no Chrome ≤141, no Firefox e no Safari atuais. Sem um shim, renderizar qualquer PDF escaneado estoura com `getOrInsertComputed is not a function`. O shim fica em `loadPdfjs()` ([lib/ocr.ts](lib/ocr.ts)) e cobre tanto o OCR quanto a otimização de PDFs.

## Otimização automática (foto de documento)

Fotos tiradas com celular — tortas, com sombra, papel amassado, fundo da mesa aparecendo — passam por um pipeline que as transforma em algo parecido com uma página digitalizada:

1. **Correção de perspectiva** ([lib/perspective.ts](lib/perspective.ts)): acha os quatro cantos da folha (limiar de Otsu → maior componente conexa → casco convexo → maior quadrilátero inscrito) e a estica para um retângulo com amostragem bilinear. É esta etapa que tira a impressão de "foto de um papel em cima da mesa"; um recorte retangular apenas reenquadra, não desentorta.
2. **Remoção de sombra** ([lib/image-enhance.ts](lib/image-enhance.ts)): estima o campo de iluminação por máximo local + borrão e normaliza a imagem por ele, apagando sombras e vincos.
3. **Níveis por percentil, nitidez e upscaling clássico** (interpolação, nunca generativo).

Quando a detecção dos cantos não é confiável, o pipeline cai para recorte por caixa + correção de inclinação, e no limite deixa a imagem como está — é preferível não enquadrar a arriscar cortar conteúdo.

Nenhuma etapa altera o conteúdo do documento — o pipeline só produz cópias. Por padrão a limpeza roda apenas internamente, para melhorar a precisão do OCR.

A versão otimizada fica concentrada num único lugar: a **pré-visualização**. Nela há um alternador **Original / Otimizada** para comparar as duas antes de decidir e, a partir daí, **baixar a otimizada** ou **substituir o original** por ela. Não há atalho para baixá-la direto da lista nem opção de incluí-la no `.zip` — a ideia é que o usuário só a leve embora depois de ter olhado o resultado.

### PDFs ([lib/pdf-enhance.ts](lib/pdf-enhance.ts))

PDFs digitalizados também são otimizados: cada página é renderizada, passa pelo mesmo pipeline e o resultado é remontado num PDF novo (com `pdf-lib`), preservando o tamanho de papel original.

**PDFs digitais não são otimizados, de propósito.** Se o PDF tem camada de texto de verdade (gerado por um sistema, não fotografado), rasterizá-lo destruiria o texto pesquisável e selecionável, engordaria o arquivo e não melhoraria nada visualmente. Nesses casos a pré-visualização recusa e explica o motivo, em vez de piorar o documento silenciosamente. A detecção reaproveita a mesma heurística de texto nativo que o OCR já usava (`meaningfulNativeText`), que ignora carimbos de assinatura digital e cabeçalhos federais.

Duas outras decisões: a imagem é encaixada na página **preservando a proporção** (o enquadramento por perspectiva muda a proporção, e esticar distorceria o texto), e há um teto de 30 páginas, já que o custo cresce por página e um PDF longo travaria a aba sem ganho proporcional.

A substituição é a única operação que descarta o original, então é sempre confirmada antes e o aviso muda conforme o modo: no modo pasta ela **grava por cima do arquivo no disco** (sem desfazer); no modo upload troca apenas o arquivo em memória, e o disco do usuário não é tocado. A escrita em disco aborta em caso de erro no meio do caminho, para nunca deixar o documento truncado.

### Salvaguardas (e o que elas custam)

O maior risco de um pipeline desses é destruir conteúdo legítimo. Três travas foram calibradas contra casos de teste (foto em ângulo, papel amassado, documento com foto 3x4 e carimbo claro, digitalização já limpa):

- O campo de iluminação é **borrado** depois do máximo local. Sem isso, dentro de uma foto 3x4 o máximo local é a própria foto, a normalização a divide por ela mesma e ela sai estourada em branco.
- Pixels abaixo de ~72% do nível do papel são tratados como **conteúdo, não sombra** (`SHADOW_FLOOR_RATIO`), o que impede que fotos e fundos escuros impressos sejam apagados. Em troca, vincos muito escuros ficam levemente visíveis — preferimos preservar conteúdo.
- O ponto de preto dos níveis é **limitado por cima**: num documento com pouquíssima tinta, o percentil baixo cairia sobre o próprio papel e a página inteira sairia preta.

## Separar PDFs que juntam vários documentos ([lib/pdf-split.ts](lib/pdf-split.ts))

É comum receber um único PDF com matrícula + RG + CNH + certidão dentro. O botão de tesoura na lista abre o separador: cada página é lida (texto nativo ou OCR), classificada como se fosse um documento à parte, e as páginas são agrupadas em documentos. O resultado aparece numa tabela com as páginas, o tipo e o nome sugerido — editável — antes de aplicar.

**A regra de agrupamento é o coração da coisa.** Uma página só abre um documento novo quando ela própria se identifica (tipo reconhecido) **e** essa identidade difere da do documento corrente. Páginas sem tipo reconhecido — o verso de um RG, a segunda folha de uma matrícula, a continuação de um contrato — são tratadas como continuação. Sem isso, todo documento de várias páginas seria estilhaçado numa penca de arquivos de uma página. A identidade compara tipo + nome proposto, então dois RGs seguidos de pessoas diferentes viram dois documentos, mas duas páginas do RG da mesma pessoa viram um só.

Ao aplicar, no modo pasta os PDFs individuais são gravados e o original é **apagado** (com confirmação); no modo upload o PDF original sai da lista e os novos entram no lugar, alimentando o `.zip` normalmente. As páginas são copiadas com `copyPages`, então um PDF digital continua digital — o texto não vira imagem.

Salvaguardas da escrita em disco, por ser destrutiva: os nomes são únicos contra o que já existe na pasta (nunca sobrescreve arquivo de terceiro), o original só é apagado **depois** que todos os novos foram gravados, e se algo falhar no meio os arquivos já criados são removidos — a pasta volta ao estado inicial, com o PDF de origem intacto. Há um teto de 40 páginas, já que a análise faz OCR página a página.

## Dois modos de uso

1. **Selecionar pasta** (Chrome/Edge): o usuário escolhe uma pasta local, o app analisa tudo, mostra a prévia e — após confirmação — **renomeia os arquivos direto na pasta**, via File System Access API. Há um filtro opcional "somente arquivos com WhatsApp no nome".
2. **Upload + download**: em qualquer navegador, o usuário arrasta os arquivos, revisa os nomes sugeridos e baixa tudo num `.zip` já renomeado.

Em ambos os modos a lista é revisável: cada nome sugerido pode ser editado e cada arquivo pode ser desmarcado antes de aplicar.

## Estrutura

- [lib/renamer.ts](lib/renamer.ts) — motor local de nomeação: tipo por pontuação de evidências (texto + nome do arquivo, com peso extra no título), extração de nome em camadas com validação palavra a palavra, identificadores (CPF com dígito verificador, matrícula, contribuinte) e fallback que preserva o nome original quando nada é confiável. Calibrado com documentos reais de escritório imobiliário.
- [lib/ocr.ts](lib/ocr.ts) — pipeline de extração de texto: pré-processamento da imagem (limpeza via `lib/image-enhance.ts` + escala de cinza, autocontraste, ampliação) + Tesseract; PDFs via pdf.js.
- [lib/perspective.ts](lib/perspective.ts) — detecção dos quatro cantos do documento e correção de perspectiva.
- [lib/pdf-enhance.ts](lib/pdf-enhance.ts) — otimização de PDFs digitalizados página a página; recusa PDFs digitais.
- [lib/pdf-split.ts](lib/pdf-split.ts) — separação de um PDF que junta vários documentos: classifica página a página e agrupa em documentos.
- [components/pdf-split-dialog.tsx](components/pdf-split-dialog.tsx) — revisão dos documentos detectados antes de aplicar.
- [lib/image-enhance.ts](lib/image-enhance.ts) — acabamento de digitalização: remoção de sombra, denoise, níveis por percentil, nitidez e upscaling clássico.
- [lib/fs.ts](lib/fs.ts) — modo pasta (File System Access API): listar, renomear no lugar com `move()` ou cópia+remoção, sobrescrever, criar e remover arquivos.
- [components/document-preview.tsx](components/document-preview.tsx) — pré-visualização com alternador Original/Otimizada e substituição do original.
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
