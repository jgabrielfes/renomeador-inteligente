# Radar de herdeiros — arquitetura e regras

A camada 3 do Sucessorista tem duas partes: a **área pública "Para famílias"**
(questionário → orientação gratuita) e o **Radar** (a família publica o caso
ANÔNIMO; advogados(as) respondem; a família escolhe). Este documento é o mapa
técnico; o dossiê ético está em [`etica-oab.md`](./etica-oab.md).

## Interruptores

- `RADAR_ATIVO=1` (`lib/radar/config.ts` → `radarAtivo()`) é a ÚNICA condição:
  sem ela nenhuma UI do Radar existe. A área `/familias` funciona sem o Radar.
  O `RESEND_API_KEY` deixou de ser exigido aqui quando a publicação passou a
  ser imediata: a família informa o e-mail (obrigatório, é o canal dela), mas
  publicar não espera envio nenhum — cada aviso é env-gated por conta própria
  e falha de e-mail nunca derruba a publicação.
- Tudo é exclusivo do site do Sucessorista (`requirePlataforma`/`foraDaPlataforma`).
- `CRON_SECRET` (opcional): liga a rota `POST /api/radar/varredura`, que a
  GitHub Action `varredura-radar.yml` chama uma vez por dia. Sem a env a rota
  **não existe** (404) e a varredura de 72h continua só no botão do
  `/admin/radar`.

## Fluxo, de ponta a ponta

1. **Questionário** (`/familias`, sem cadastro): até 12 perguntas, valores por
   FAIXA, nenhum dado sensível. Resultado na hora (triagem + estimativas +
   documentos — motores puros em `lib/familias/*`).
2. **Publicação** (opt-in, IMEDIATA): o convite "Pedir análise de advogados"
   aparece em DOIS lugares da folha de resultado — logo abaixo do resultado e
   no pé — com o mesmo estado (publicar num deles atualiza o outro). O clique
   abre o **diálogo de dupla confirmação**, que diz o que vai ao ar e o que
   nunca vai; o aceite É o consentimento e publica na hora
   (`consentimentoEm` + `publicadoEm`, status `publicado`). No fim do
   questionário, publicar salva o caso por baixo antes (`garantirToken`), para
   não obrigar a família a clicar em "Salvar" primeiro.
   O **e-mail é pedido NO diálogo e é OBRIGATÓRIO** — não como validação
   (nada é enviado para conferir o endereço), mas porque é o CANAL da
   família: é por ele que ela sabe que alguém respondeu, e é o que o aviso
   de 72h usa. Publicar sem canal deixaria a família tendo de voltar ao site
   por conta própria. O e-mail NÃO é publicado com o caso, e a folha oferece
   trocá-lo (errar o próprio endereço na pressa é comum); a mesma rota grava
   o novo sem republicar.
   A página `/familias/confirmar/[codigo]` continua de pé para os links já
   enviados na era da confirmação por e-mail.
3. **Advogado(a)** (`/radar`, logado): habilitação em três passos —
   inscrição na OAB (verificação **manual** no `/admin/radar`), quiz
   deontológico (10 de 10, `lib/radar/quiz.ts`) e assinatura **mensal** por UF
   (concedida à mão; nunca comissão por caso). Habilitado, vê os casos
   anônimos (`anonimizarIntake`, allowlist com testes anti-vazamento) das UFs
   assinadas, em **ordem única por data** — sem ranking. MASTER navega sem os
   passos (operação), mas não entra em conversa alheia.
4. **Resposta**: apresentação (600) + condução (800), **sem campo de
   honorários**, uma por advogado(a), teto de **2 por caso** (o marcador "X/2 advogados"; gate com o gancho do plano em `lib/radar/candidatura.ts`). A família é
   avisada por e-mail (melhor-esforço).
5. **Família** (`/familias/minha-solicitacao/[token]`): vê as respostas em
   **ordem aleatória FIXA** pelo token (`embaralharFixo` — determinística,
   sem re-sorteio), sempre com nome e OAB do profissional. "Quero conversar"
   abre o canal 1:1 com UM(A) por vez (`radar_mensagens`) e libera
   nome/e-mail SÓ para ele(a); "Encerrar" devolve o caso ao Radar (histórico
   permanece); **"Contratei"** gera o código de handoff, entrega-o na
   conversa e tira o caso do Radar. **Denunciar** abre a fila do admin.
6. **Handoff**: o(a) advogado(a) digita o código no Sucessorista ("Importar
   caso de família") — `intakeParaCaso` monta o `CasoSalvo` NO NAVEGADOR
   (local-first). Confirmada a importação, o servidor **poda** o intake
   (respostas/resultado zerados, status `contratado`).

## Regras de tempo

- **90 dias**: `expiraEm` — o intake e o resultado somem depois disso.
- **72 horas**: publicado sem NENHUMA resposta → a varredura envia UM aviso
  honesto ("ainda sem respostas") e carimba `aviso72hEm` (nunca repete). O
  motor é `lib/radar/varredura.ts`, com DOIS chamadores: o botão do
  `/admin/radar` (manual, sempre disponível) e a rota do cron
  (`/api/radar/varredura`, diária).
- **30 dias**: conversa aberta sem "Contratei" → reabre sozinha (na leitura,
  em `/radar` e na página da solicitação): status volta a `publicado` e o
  caso aceita outra escolha.
- **Retirar** (sempre disponível): apaga intake, handoffs, respostas e
  mensagens numa transação — nada fica.

## Tabelas

| Tabela | O que guarda |
| --- | --- |
| `familia_intakes` | respostas/resultado (Json), status (`rascunho→resultado→publicado→em_conversa→contratado`, `retirado`/`expirado`), tokens, consentimento, conversa (advogado escolhido + datas) |
| `intake_handoffs` | códigos de uso único do handoff |
| `advogado_perfis` | OAB/UF, situação (`pendente/aprovado/recusado/suspenso`), quiz, `aceitaPequenoValor` |
| `radar_assinaturas` | assinatura manual por (userId, UF) |
| `radar_respostas` | apresentação/condução — única por (intake, advogado) |
| `radar_mensagens` | canal 1:1 (autor `advogado`/`familia`) |
| `radar_denuncias` | denúncias da família; acatar = suspender o perfil |

## Privacidade (o que NUNCA circula)

- O caso publicado é o `CasoAnonimo` (allowlist testada em
  `lib/radar/anonimizar.test.ts`): UF/cidade, via, faixa leiga do acervo,
  nº de herdeiros e flags booleanas. Nome, e-mail, data do óbito, token e as
  **observações livres** jamais entram.
- O contato da família só chega ao(à) advogado(a) que ELA escolheu, enquanto
  a conversa durar.
- Nada do Radar aparece em `/admin` além de **contadores e cadastros**
  (funil, filas) — nunca o conteúdo de conversas.

## Remodelagem LexCausa (fase 3) — Radar Sucessório

O produto passou a se chamar **Radar Sucessório** (título, tela e atalhos;
a mecânica é a mesma). Do lado do(a) advogado(a):

- **Filtros de RECORTE** na lista (UF, via, recência) — a ordem por data
  nunca muda, e **filtro por valor não existe de propósito** (o porte só
  aparece como a faixa leiga que a família publicou). Avaliações públicas
  seguem fora.
- **Funil "Minhas respostas"** (`minhasRespostasRadar`): aguardando a
  família → em conversa → contratado → **encerrado** — rótulo NEUTRO de
  propósito: a escolha da família por outro caminho nunca circula.
- **"Converter em inventário"**: no estágio contratado, o botão leva a
  `/s?importar=<código do handoff>`; o client do Sucessorista resgata o
  intake, cria o caso no store ativo com a folha pré-preenchida
  (`intakeParaCaso`) e confirma a importação — o servidor PODA o intake,
  como no fluxo por código digitado.

## Cauda da remodelagem (fase 4) — vitrine, avisos e onboarding

- **Vitrine do advogado** (`areasAtuacao` até 200 + `experiencia` até 600,
  migração `vitrine_do_advogado`; action `salvarVitrineRadar`): cadastrada
  uma vez no Radar ("Minha vitrine") e exibida junto de TODA candidatura na
  tela da família ("Atua com:" / "Experiência:"). Sempre com nome+OAB, sem
  valores, sem promessa e sem avaliações — os trilhos de `docs/etica-oab.md`
  valem por inteiro.
- **Aviso de caso novo SEM e-mail** (decisão do escritório): o sino
  "Avisos" do shell conta os casos publicados desde
  `advogado_perfis.radarVistoEm` e o hub mostra a mesma contagem; visitar o
  Radar É ver (a visita atualiza o visto). Conversas abertas aguardando o(a)
  advogado(a) também entram no sino.
- **Tour de primeiro acesso** (3 passos dispensáveis, uma vez por
  navegador) e página **/ajuda/radar** ("Como funciona") — ambos citam o
  teto de candidaturas pela constante `TETO_CANDIDATURAS_POR_CASO`, nunca
  por número solto.
- **/config** mostra a situação do perfil no Radar (verificação da OAB +
  UFs assinadas) e o gancho do plano de assinatura ("em implantação") — a
  habilitação continua acontecendo no próprio Radar.

## Avisos por e-mail (`lib/radar/notificar.ts`)

Env-gated pelo `RESEND_API_KEY` como todo e-mail da plataforma; melhor-esforço
— falha de envio nunca derruba a ação de origem. **Caso novo não gera e-mail**
(decisão do escritório): descobre-se pelo sino e pela lista. O que os avisos
cobrem é o ciclo JÁ ABERTO e as decisões que a pessoa não tem como adivinhar:

| Gatilho | Quem recebe | Onde dispara |
| --- | --- | --- |
| mensagem nova na conversa 1:1 | o OUTRO lado (família ou advogado) | `radar-actions.ts#enviarMensagemRadar` e `POST /api/familias/conversa` |
| "Contratei" confirmado | advogado(a), **com o código do handoff** | `POST /api/familias/conversa` |
| verificação da OAB decidida (aprovado/recusado/suspenso) | advogado(a), com o motivo da equipe | `/admin/radar#decidirPerfil` e `#decidirDenuncia` (acatar) |
| assinatura de UF concedida | advogado(a) | `/admin/radar#concederAssinatura` |
| 72h sem resposta | família | varredura (botão + cron) |

Regras de conteúdo (trilhos de [`etica-oab.md`](./etica-oab.md)): o corpo do
e-mail **não repete o texto da conversa** — só avisa que chegou algo, e o
conteúdo fica na plataforma; nunca valores, ranking ou "indicação"; todo aviso
à família leva o rodapé "não intermedeia honorários nem indica advogados".

**Reativar** um perfil suspenso não avisa (volta ao estado normal). O motivo
de uma denúncia nunca circula — o e-mail de suspensão diz apenas que houve
suspensão e como pedir revisão.
