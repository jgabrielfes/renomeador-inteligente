# Ferramentas do Cartório (Web)

Dois módulos, escolhidos no painel inicial (`/`):

1. **Renomeador Inteligente de Documentos** (`/renomeador`) — analisa imagens e PDFs **no navegador do usuário** e sugere nomes de arquivo com base no conteúdo (RG, CNH, certidões, matrículas, contratos etc.).
2. **Resolvedor de Notas Devolutivas** (`/notas`) — decompõe a nota de exigências do Registro de Imóveis em itens, classifica cada um numa via de resolução e prepara a minuta da peça correspondente (ver seção própria abaixo).

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

1. **Correção de perspectiva** ([lib/perspective.ts](lib/perspective.ts)): acha os quatro cantos da folha e a estica para um retângulo com amostragem bilinear. É esta etapa que tira a impressão de "foto de um papel em cima da mesa"; um recorte retangular apenas reenquadra, não desentorta.
2. **Equalização da iluminação** ([lib/image-enhance.ts](lib/image-enhance.ts)): estima o campo de luz e traz as regiões sombreadas ao nível do papel bem iluminado, o que apaga dobras e sombras.
3. **Níveis por percentil, nitidez e upscaling clássico** (interpolação, nunca generativo), com saída em ~200 dpi para impressão.

Quando a detecção dos cantos não é confiável, o pipeline cai para recorte por caixa + correção de inclinação, e no limite deixa a imagem como está — é preferível não enquadrar a arriscar cortar conteúdo.

### Como a dobra some sem o documento ser alterado

Esta é a parte mais difícil do pipeline, e as três primeiras versões falharam nela — sempre trocando uma coisa pela outra. O problema: um **vinco** e uma **mancha cinza-clara de conteúdo** (um fundo chapado, um carimbo grande) têm brilho parecido e área parecida. Quem quer apagar o vinco acaba clareando a mancha até o branco; quem quer proteger a mancha deixa o vinco na imagem.

Foi medido, não estimado. Com um documento de referência plano, um campo de iluminação sintético (painéis de dobra, vincos e sombra de canto) aplicado por multiplicação, e a saída comparada com o original:

| tentativa | papel amassado | dobras | tons do documento plano |
| --- | --- | --- | --- |
| máximo local + borrão (raio único) | 28 | 35 | fiel |
| limiar de papel + erosão | 28 | 13–20 | mancha clara estourava |
| tapar depressões rasas do campo | 41 | 20 | fiel |
| **crescimento a partir de sementes** | **1** | **9** | **fiel** |

(“papel” e “dobras” são o espalhamento p95−p5 da luminância numa área em branco: quanto menor, mais uniforme.)

O que resolveu foi trocar o critério. Nem brilho nem tamanho separam vinco de mancha — a **borda** separa: mancha de conteúdo tem contorno nítido, sombra e vinco são rampas suaves. Então o papel é definido por crescimento: parte-se das regiões mais claras (papel com certeza) e cresce-se aceitando vizinhos de brilho parecido. A rampa do vinco é atravessada e ele entra na medição da luz — por isso é corrigido; o degrau da mancha não é atravessado e ela fica de fora — por isso é preservada. É a mesma ideia da detecção de fundo em [lib/perspective.ts](lib/perspective.ts), aplicada agora dentro do documento.

Com o papel identificado, a luz é medida **só nele** (é o único lugar onde ela é observável, já que o papel tem refletância constante) e interpolada por cima da tinta e dos blocos de conteúdo, por convolução normalizada em vários raios: usa-se sempre o menor raio com papel suficiente por perto, o que mantém o vinco e atravessa uma foto 3x4.

### A regra que manda: não alterar o documento

O documento tem de sair **legível para impressão e com todo o conteúdo intacto**. Isso restringe o que o pipeline pode fazer, e duas versões anteriores erraram exatamente aqui:

- **O ponto de branco não pode ficar abaixo do nível do papel.** Uma versão colocava o branco a 90% do papel para "limpar" o resto da sombra — e com isso todo conteúdo cinza-claro (carimbo fraco, marca d'água, fundo de segurança, parte clara da foto 3x4) virava branco puro. Era estouro de luz e perda de informação. Hoje o branco fica no percentil 0.98, então só a franja mais clara do papel satura.
- **A remoção de sombra equaliza, não clareia.** Ela normalizava tudo para 255, e os níveis clareavam de novo logo depois: o clareamento em dose dupla estourava a imagem. Hoje o ganho é 1 na área mais bem iluminada e só sobe na sombra.
- **A curva de gama é 1.** Qualquer gama diferente de 1 desloca os meios-tons, ou seja, muda como o conteúdo aparece. O que se faz é apenas esticar o histograma entre preto e branco — transformação linear.

Essas três regras impedem o estouro, mas sozinhas não apagam dobra nenhuma — quem faz isso é a equalização descrita acima. O que resta na saída é a **linha fina do vinco**, que é o que também aparece num scan de verdade de um papel dobrado.

### O documento é o que não é fundo

A detecção de bordas procurava "a maior região clara" da foto. Isso quebra em qualquer documento com faixa escura no cabeçalho, foto 3x4 grande ou fundo colorido impresso: a região clara é só um PEDAÇO da folha, e esticar esse pedaço produzia o **"zoom no meio do documento"** que cortava o resto.

Hoje a lógica é inversa: a **mesa** é que encosta nas bordas da foto. Cresce-se uma região a partir das quatro bordas, aceitando vizinhos de cor parecida (o que acompanha o degradê de iluminação da mesa) e parando no contraste da beirada do papel. O que sobra é o documento inteiro, com faixa escura e tudo.

Duas travas fecham o caso:

- A tolerância de cor desse crescimento é **14**, calibrada por medição: com um documento de cabeçalho preto, o quadrilátero sai exato de 8 a 18 e passa a comer o cabeçalho a partir de 22 (no downscale, a transição faixa-escura/mesa fica suave o bastante para o fundo atravessar).
- Depois de achar o quadrilátero, mede-se quanto do documento ficaria **fora** dele; acima de 4%, o enquadramento é recusado. Essa medida é feita sobre a máscara do documento, e não por "pixel escuro" — a mesa costuma ser mais escura que o papel, e um limiar de tinta contaria o fundo inteiro como conteúdo perdido, recusando todo enquadramento (foi o que aconteceu na primeira versão desta trava).

### PDFs ([lib/pdf-enhance.ts](lib/pdf-enhance.ts))

PDFs digitalizados também são otimizados: cada página é renderizada, passa pelo mesmo pipeline e o resultado é remontado num PDF novo (com `pdf-lib`), preservando o tamanho de papel original.

**PDFs digitais não são otimizados, de propósito.** Se o PDF tem camada de texto de verdade (gerado por um sistema, não fotografado), rasterizá-lo destruiria o texto pesquisável e selecionável, engordaria o arquivo e não melhoraria nada visualmente. Nesses casos a pré-visualização recusa e explica o motivo, em vez de piorar o documento silenciosamente. A detecção reaproveita a mesma heurística de texto nativo que o OCR já usava (`meaningfulNativeText`), que ignora carimbos de assinatura digital e cabeçalhos federais.

Duas outras decisões: a imagem é encaixada na página **preservando a proporção** (o enquadramento por perspectiva muda a proporção, e esticar distorceria o texto), e há um teto de 30 páginas, já que o custo cresce por página e um PDF longo travaria a aba sem ganho proporcional.

A substituição é a única operação que descarta o original, então é sempre confirmada antes e o aviso muda conforme o modo: no modo pasta ela **grava por cima do arquivo no disco** (sem desfazer); no modo upload troca apenas o arquivo em memória, e o disco do usuário não é tocado. A escrita em disco aborta em caso de erro no meio do caminho, para nunca deixar o documento truncado.

## Separar PDFs que juntam vários documentos ([lib/pdf-split.ts](lib/pdf-split.ts))

É comum receber um único PDF com matrícula + RG + CNH + certidão dentro. O botão de tesoura na lista abre o separador: cada página é lida (texto nativo ou OCR), classificada como se fosse um documento à parte, e as páginas são agrupadas em documentos. O resultado aparece numa tabela com as páginas, o tipo e o nome sugerido — editável — antes de aplicar.

Cada documento mostra as **miniaturas das suas páginas**, e clicar numa delas abre a página ampliada, com navegação. Sem isso o usuário estaria confirmando no escuro: os nomes vêm de OCR e é olhando a página que ele confere se o corte ficou no lugar certo. As miniaturas são renderizadas antes da classificação, que é a parte lenta — assim já dá para ver o PDF enquanto o OCR ainda roda.

**A regra de agrupamento é o coração da coisa.** Uma página só abre um documento novo quando ela própria se identifica (tipo reconhecido) **e** essa identidade difere da do documento corrente. Páginas sem tipo reconhecido — o verso de um RG, a segunda folha de uma matrícula, a continuação de um contrato — são tratadas como continuação. Sem isso, todo documento de várias páginas seria estilhaçado numa penca de arquivos de uma página. A identidade compara tipo + nome proposto, então dois RGs seguidos de pessoas diferentes viram dois documentos, mas duas páginas do RG da mesma pessoa viram um só.

Ao aplicar, no modo pasta os PDFs individuais são gravados e o original é **apagado** (com confirmação); no modo upload o PDF original sai da lista e os novos entram no lugar, alimentando o `.zip` normalmente. As páginas são copiadas com `copyPages`, então um PDF digital continua digital — o texto não vira imagem.

Salvaguardas da escrita em disco, por ser destrutiva: os nomes são únicos contra o que já existe na pasta (nunca sobrescreve arquivo de terceiro), o original só é apagado **depois** que todos os novos foram gravados, e se algo falhar no meio os arquivos já criados são removidos — a pasta volta ao estado inicial, com o PDF de origem intacto. Há um teto de 40 páginas, já que a análise faz OCR página a página.

## Montagem do processo

Três opções, num painel junto dos botões de aplicar. Valem para os **dois** modos: a renomeação na pasta e o `.zip`.

### Organizar em subpastas por conjunto ([lib/categories.ts](lib/categories.ts))

Cada arquivo vai para uma subpasta conforme o tipo de documento — DOCUMENTOS PESSOAIS, DOCUMENTOS DO IMÓVEL, CONTRATOS, IMPOSTO DE TRANSMISSÃO, CERTIDÕES NEGATIVAS, COMPROVANTES E PAGAMENTOS, e OUTROS DOCUMENTOS para o que não se encaixar. Antes de aplicar, a tela mostra quais subpastas serão criadas e quantos arquivos vão para cada uma.

### Converter imagens em PDF ([lib/to-pdf.ts](lib/to-pdf.ts))

JPG, PNG, WEBP e BMP viram PDF de uma página. Quando o arquivo **já é JPEG ou PNG, os bytes originais são embutidos como estão** — recodificar seria perda de qualidade gratuita, já que o PDF é só um invólucro; só WEBP e BMP, que o PDF não suporta, passam pelo canvas e viram JPEG. A página é A4 na orientação da imagem, com a imagem encaixada preservando a proporção: um processo é feito para ser impresso e paginado, e página do tamanho exato de cada foto daria um documento com folhas de tamanhos diferentes.

No modo pasta, converter é criar um arquivo novo e apagar a imagem — não dá para "renomear" um JPG em PDF. O original só é removido depois que o PDF está gravado.

### Numerar os arquivos

Prefixo sequencial, para montar processo: `01 - RG - João.pdf`, `02 - CNH - Maria.pdf`. A largura vem do total (9 arquivos → `01`..`09`; 150 → `001`..`150`), o que faz a **ordem alfabética da pasta bater com a ordem do processo** — sem o zero à esquerda, "10" viria antes de "2".

A numeração é **por pasta**: cada subpasta é um conjunto do processo e recomeça em `01`. Sem subpastas há uma pasta só, então a sequência segue a ordem da lista. (Se preferir numeração contínua atravessando as subpastas, é uma linha de mudança.)

A classificação tem **duas camadas, e a segunda é o que a faz funcionar de verdade**: uma tabela de tipos exatos (os que o motor local produz) e, quando ela não bate, palavras-chave sobre o tipo normalizado. A segunda camada existe porque no modo IA o tipo vem do Gemini em texto livre — "Contrato de Cessão de Direitos Hereditários", "Guia de Recolhimento do ITBI" — e nunca bateria com uma tabela fixa. A ordem das palavras-chave importa: ITBI é testado antes de "guia", e "tributos imobiliários" antes de "negativa", senão cairiam na categoria errada. O que não se encaixa vai para OUTROS DOCUMENTOS em vez de ser espalhado em pastas erradas.

Cada subpasta tem seu próprio espaço de nomes, então "RG - João.pdf" pode existir em duas categorias sem virar "(2)".

## Dois modos de uso

1. **Selecionar pasta** (Chrome/Edge): o usuário escolhe uma pasta local, o app analisa tudo, mostra a prévia e — após confirmação — **renomeia os arquivos direto na pasta**, via File System Access API. Há um filtro opcional "somente arquivos com WhatsApp no nome".
2. **Upload + download**: em qualquer navegador, o usuário arrasta os arquivos, revisa os nomes sugeridos e baixa tudo num `.zip` já renomeado — com as mesmas subpastas, numeração e conversão em PDF do modo pasta.

Em ambos os modos a lista é revisável: cada nome sugerido pode ser editado e cada arquivo pode ser desmarcado antes de aplicar.

## Estrutura

- [lib/renamer.ts](lib/renamer.ts) — motor local de nomeação: tipo por pontuação de evidências (texto + nome do arquivo, com peso extra no título), extração de nome em camadas com validação palavra a palavra, identificadores (CPF com dígito verificador, matrícula, contribuinte) e fallback que preserva o nome original quando nada é confiável. Calibrado com documentos reais de escritório imobiliário.
- [lib/ocr.ts](lib/ocr.ts) — pipeline de extração de texto: pré-processamento da imagem (limpeza via `lib/image-enhance.ts` + escala de cinza, autocontraste, ampliação) + Tesseract; PDFs via pdf.js.
- [lib/perspective.ts](lib/perspective.ts) — detecção dos quatro cantos do documento e correção de perspectiva.
- [lib/pdf-enhance.ts](lib/pdf-enhance.ts) — otimização de PDFs digitalizados página a página; recusa PDFs digitais.
- [lib/pdf-split.ts](lib/pdf-split.ts) — separação de um PDF que junta vários documentos: classifica página a página, agrupa em documentos e renderiza as miniaturas.
- [lib/categories.ts](lib/categories.ts) — conjunto (subpasta) a que cada tipo de documento pertence.
- [lib/to-pdf.ts](lib/to-pdf.ts) — conversão de imagens em PDF A4.
- [components/pdf-split-dialog.tsx](components/pdf-split-dialog.tsx) — revisão dos documentos detectados, com miniaturas e página ampliada, antes de aplicar.
- [lib/image-enhance.ts](lib/image-enhance.ts) — acabamento de digitalização: remoção de sombra, denoise, níveis por percentil, nitidez e upscaling clássico.
- [lib/fs.ts](lib/fs.ts) — modo pasta (File System Access API): listar, renomear no lugar ou movendo para subpasta (`move()` com fallback de cópia+remoção), sobrescrever, criar e remover arquivos.
- [components/document-preview.tsx](components/document-preview.tsx) — pré-visualização com alternador Original/Otimizada e substituição do original.
- [app/page.tsx](app/page.tsx) — painel de escolha de módulo; [app/renomeador/page.tsx](app/renomeador/page.tsx) — interface do renomeador; [app/notas/page.tsx](app/notas/page.tsx) — interface do resolvedor de notas (Next.js + shadcn/ui).
- `lib/notas/` — núcleo do resolvedor de notas: [resolvedor.ts](lib/notas/resolvedor.ts) (decompõe e classifica), [traslado.ts](lib/notas/traslado.ts) (extrator de traslado), [qualificacao.ts](lib/notas/qualificacao.ts) (construtor de qualificação), [pecas.ts](lib/notas/pecas.ts) (dados das minutas), [docx.ts](lib/notas/docx.ts) (leitura e preenchimento de .docx via JSZip).

## Resolvedor de Notas Devolutivas

Três etapas na tela:

1. **Pasta do Caso** — recebe a pasta completa (arrastada inteira) e distribui os papéis automaticamente: quem é a nota devolutiva, quem é o traslado do ato (.docx preferencial) e o que é acervo, com detecção pelo nome e pelo conteúdo ([lib/notas/pasta.ts](lib/notas/pasta.ts)). A nota identificada aparece em **pré-visualização** (páginas do PDF, imagem ou texto), e o prazo, a prenotação e a serventia são lidos da própria nota.
2. **Exigências** — a nota decomposta e **sintetizada em lista**: cada item vira um apontamento objetivo ("Juntar: guia de ITBI", "Lavrar ata retificativa"…), com a via de resolução sugerida pelos **verbos de remédio** da nota (nunca pelos princípios registrários citados), as partes citadas e o cruzamento com a pasta (documento já presente ou faltante). O texto integral fica disponível por item; status e via são por item, não por nota.
3. **Resolvendo as Exigências** — para juntada, o documento identificado na pasta é trazido para a tela e baixado em **PDF/A** ([lib/notas/pdfa.ts](lib/notas/pdfa.ts): imagem vira PDF A4 com XMP `pdfaid` e OutputIntent sRGB; PDF existente é baixado intocado para não quebrar assinatura prévia), pronto para o [Assinador ONR](https://assinador.onr.org.br) e reingresso na ONR – RI Digital. Para as demais vias, a **minuta** (ata retificativa, requerimento ou rerratificação) é montada ali mesmo, com prévia do texto e download em .docx. O traslado alimenta as qualificações e a síntese por trás dos panos, sem card próprio. O botão **Redigir com IA** ([lib/gemini-notas.ts](lib/gemini-notas.ts), rota `/api/notas`) usa o Google Gemini para sugerir o conteúdo dos campos vazios (teor da retificação, blocos de lapso/correção, objeto do requerimento…) a partir da exigência, do traslado e dos documentos da pasta — os **templates não são alterados**, campo preenchido pelo operador não é sobrescrito e campo sem base no contexto fica em branco (placeholder visível).

Travas de segurança: a via sugerida precisa de **confirmação humana** antes de gerar; a ata só é gerada com **amparo documental** declarado; campos sem dado permanecem como `{{PLACEHOLDER}}` visível na minuta; e **nada é lavrado automaticamente** — a saída é sempre rascunho. O prazo da prenotação é lido na própria nota (nunca calculado) e fica em destaque na tela.

## Rodando localmente

```bash
npm install
npm run dev
```

## Deploy

Projeto pronto para a Vercel: `next build` gera as páginas estáticas e as funções serverless (`/api/rename`, `/api/notas`, `/api/auth`). Variáveis de ambiente necessárias (ver [.env.example](.env.example)): `GEMINI_API_KEY` (sem ela o app funciona só no modo local), `DATABASE_URL` + `DIRECT_URL` (Postgres do Supabase) e `AUTH_SECRET`.

## Login e contas

As ferramentas funcionam **sem login** — a conta (NextAuth v5 + Prisma no Supabase) existe para identidade e papéis. Qualquer pessoa pode criar conta em `/cadastro` (sem confirmação de e-mail por enquanto; contas não confirmadas ficam marcadas na interface). O login tem "Permanecer conectado" (marcado: sessão de 30 dias; desmarcado: 8 horas). `/login` e `/cadastro` só são acessíveis deslogado.

Configuração inicial:

```bash
# 1. cole as URLs do Supabase e o AUTH_SECRET no .env (ver .env.example)
# 2. crie as tabelas
yarn db:migrate
# 3. (opcional) promova um administrador
yarn user:create admin@exemplo.com.br suasenha "Seu Nome" --master
```

Usuários `MASTER` verão, futuramente, telas exclusivas de administração; os demais usam as ferramentas normalmente.

A Vercel está configurada para fazer deploy automático a cada commit na branch `main`. Por isso, o desenvolvimento do dia a dia acontece na branch `develop`: novas alterações vão para lá (diretamente ou via PR) e só sobem para `main` — disparando um novo deploy — quando estiverem prontas para produção.

## Tipos reconhecidos

RG, CNH, CPF, Passaporte, Certidões (nascimento, casamento, óbito, valor venal, tributos imobiliários, negativa de débitos, trabalhista, distribuição, protesto, ônus, vintenária), Matrícula de imóvel, IPTU, Guia de ITBI, Habite-se, Comprovantes (residência, pagamento), Boleto, Termo de quitação, Escritura, Procuração e Contratos (compra e venda, locação, prestação de serviços, honorários). As regras ficam em `DOC_RULES` em [lib/renamer.ts](lib/renamer.ts) e podem ser expandidas.
