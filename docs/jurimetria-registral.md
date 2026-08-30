# Jurimetria Registral — pipeline de ingestão de entendimentos

Ferramenta da LexCausa (site `APP=sucessorista`) que transforma decisões de
dúvida registral, orientações publicadas por cartórios e — nas fases
seguintes — notas devolutivas dos usuários em **exigências estruturadas,
anonimizadas e classificadas**, vinculadas ao cartório e ao **registrador
titular na data do fato**.

Este documento cobre a **Fase 1 (Camada A — semente pública)**, implementada.
As Fases 2 (captura no fluxo do O Sucessorista) e 3 (parceiros e
reciprocidade) têm o desenho aprovado, mas não têm código ainda.

## Princípios não negociáveis (gravados no código)

1. **LGPD por construção.** O conteúdo bruto coletado vive SÓ na memória do
   runner efêmero da Action; o banco recebe hash de proveniência, URL de
   origem e o texto **já anonimizado** (`lib/jurimetria/anonimizar.ts`, dois
   passes sem LLM). Nada de dado pessoal sai para serviço externo — o Gemini
   recebe apenas o anonimizado. (Mais forte que o desenho original, que
   previa bruto criptografado por 30 dias: aqui o bruto simplesmente não
   persiste, e não há job de expurgo porque não há o que expurgar.)
2. **Entendimento pertence ao registrador.** Toda exigência resolve o
   `titular` vigente pela data (`titularDesde <= data`); sem cadastro, entra
   `titularPendente` e para na fila de revisão.
3. **Linguagem de histórico, nunca de garantia.** "Histórico de
   entendimentos", "exigência registrada em", "frequência observada".
   Proibido: "o cartório vai exigir", "aceita", "recomendado", "garantido".
   (Mesma disciplina do docs/etica-oab.md.)
4. **Rastreabilidade total.** Documento sem `hashConteudo` + origem é
   descartado; toda exigência aponta o documento e a versão do extrator.
5. **Scraping respeitoso.** robots.txt, 1 req/2s por host, User-Agent
   identificado, backoff exponencial, parada automática em 403/429/captcha
   (`FonteBloqueadaError` → fonte `bloqueada` no admin). Nunca contornar.
6. **Humano na alça.** Confiança < 0.8, titular pendente, cartório não
   resolvido ou possível dado pessoal → fila de revisão; 5% do publicável
   também cai na fila como `auditoria` (calibração do limiar).

## Mapa técnico

| Peça | Onde |
| --- | --- |
| Modelos (tabelas `jurimetria_*`) | `prisma/schema.prisma` + migração `jurimetria_semente_publica` (cria pg_trgm e SEMEIA 24 temas, 21 cartórios com aliases e as fontes) |
| Pipeline puro (com testes) | `lib/jurimetria/{anonimizar,extrair,resolver,encaminhar}.ts` + `pipeline.test.ts` (`npx tsx`) |
| Extração local (fallback) | reaproveita o `triar()` de `lib/notas/resolvedor.ts` (calibrado em notas reais) com confiança 0.5 — tudo vai à revisão |
| Extração por IA | `lib/jurimetria/gemini-exigencias.ts` (cadeia de modelos, JSON validado por Zod, retry único a temperatura 0) |
| Coletores | `lib/jurimetria/coletores/{datajud,cgj,irib,cartorio-site}.ts` sobre `http.ts` (respeitoso) |
| Worker | `scripts/jurimetria/worker.ts` — fila `jurimetria_jobs` com `FOR UPDATE SKIP LOCKED` |
| Agendamento | `.github/workflows/jurimetria-coleta.yml` (diário 03:00 BRT + manual) — padrão da varredura do Radar; NADA roda em função da Vercel |
| Admin | `/admin/jurimetria` (fontes), `/revisao` (fila com atalhos A/C/D), `/cobertura` (cartório × tema) — tudo atrás de `requireMaster()` |
| Dedupe | pg_trgm `similarity()` no MESMO cartório+tema (limiar 0.62, espelhado no motor puro) — decisão do escritório: SEM embeddings na Fase 1; pgvector fica como evolução se o trigram errar |

## Fontes da Camada A e estado

| Fonte | Estratégia | Estado |
| --- | --- | --- |
| Datajud (CNJ) — dúvidas nas VRPs | API pública oficial (`api-publica.datajud.cnj.jus.br` — com o `.jus`), filtro por classe+órgão; devolve METADADOS/movimentações (inteiro teor não vem — ver TODO 1) | ativa; requer segredo `DATAJUD_API_KEY` |
| e-SAJ CJPG — sentenças de dúvida (`coletores/cjpg.ts`) | GET público SEM captcha/login; o INTEIRO TEOR da sentença vem embutido na própria listagem (`div display:none` por linha — sonda de 2026-08-30), então o coletor lê SÓ a página 1 em ordem decrescente de data (página 2 exige sessão) e triagem por conteúdo (`pareceDuvidaRegistral`) — busca estadual, pois no interior a dúvida corre em vara cível comum; `config.coletor="cjpg"` escolhe o coletor quando o tipo é compartilhado | ativa (fonte `fonte-cjpg-vrp`, migração `fonte_cjpg_vrp`) |
| CGJ-SP | a consulta pública é o GECON (`esaj.tjsp.jus.br/gecon/publico/parecer/consulta`), mas é um app JavaScript — o HTML vem vazio; precisa mapear a API interna dele antes de ligar | **inativa** até mapear o GECON (TODO 2) |
| IRIB | Kollemata é restrita a associados → o coletor se bloqueia DE PROPÓSITO até `config.publico=true` após validação dos termos | bloqueia na 1ª execução (comportamento correto) |
| Sites dos RIs (18 Capital + Guarulhos + Itaquá) | coletor genérico HTML→texto, recoleta mensal; hash novo = documento novo (registra mudança de entendimento no tempo) | **inativas** até o admin cadastrar a URL de orientações de cada uma (tela Fontes) |

PDF sem camada de texto (scan) na Camada A: entra com `status=erro`
(`ocr fora do escopo da Fase 1`) — o OCR de verdade chega na Camada B, no
navegador do advogado, onde o tesseract.js da casa já roda.

## Segredos do worker (Settings → Secrets → Actions)

- `DIRECT_URL` (já existe — o mesmo da migração)
- `GEMINI_API_KEY` (opcional; sem ela, extrator local + tudo em revisão)
- `DATAJUD_API_KEY` (a chave pública do wiki do Datajud/CNJ)

## TODO_VALIDACAO (humanos, fora do código)

1. Datajud: cobertura das 1ª/2ª VRP da Capital e confirmação de que o
   inteiro teor não é retornado (o desenho já assume que não — o texto
   integral virá do parser do DJE, próxima iteração da Camada A).
2. Termos de uso: e-SAJ, DJE, IRIB/Kollemata e sites de cartórios; mapear
   `listaUrl`/`padraoLinks` da CGJ e as URLs de orientações dos 21 RIs.
3. Base legal LGPD (legítimo interesse × consentimento) e papel
   operador/controlador nos contratos de parceiro (Fase 3).
4. Texto de consentimento da Fase 2 e copy de reciprocidade da Fase 3 —
   revisão à luz do Provimento 205/2021 antes de qualquer tela.
5. Cadastro de `jurimetria_titulares` com `titularDesde` dos 18 RIs da
   Capital (sem isso tudo nasce `titularPendente` — a fila mostra).
6. Prazo padrão de cumprimento de exigência (20 dias úteis) contra a NSCGJ
   vigente (usado só na Fase 2).

## Fora do escopo por decisão

- Contornar captcha/login/bloqueio de qualquer fonte.
- Enviar texto NÃO anonimizado a serviço externo.
- Linguagem preditiva em qualquer tela ou campo.
- Segundo sistema de filas/cron (a fila é a tabela + a Action, como o resto
  do repo).
- Seletores/URLs de terceiros fora de `fontes.config`.
- Publicar exigência sem `cartorioId` resolvido (o action de revisão recusa).
