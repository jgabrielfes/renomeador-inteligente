# Radar de herdeiros — arquitetura e regras

A camada 3 do Sucessorista tem duas partes: a **área pública "Para famílias"**
(questionário → orientação gratuita) e o **Radar** (a família publica o caso
ANÔNIMO; advogados(as) respondem; a família escolhe). Este documento é o mapa
técnico; o dossiê ético está em [`etica-oab.md`](./etica-oab.md).

## Interruptores

- `RADAR_ATIVO=1` **e** `RESEND_API_KEY` presentes (`lib/radar/config.ts` →
  `radarAtivo()`): sem os dois, nenhuma UI do Radar existe (o desenho exige
  e-mail confirmado para publicar). A área `/familias` funciona sem o Radar.
- Tudo é exclusivo do site do Sucessorista (`requirePlataforma`/`foraDaPlataforma`).

## Fluxo, de ponta a ponta

1. **Questionário** (`/familias`, sem cadastro): até 12 perguntas, valores por
   FAIXA, nenhum dado sensível. Resultado na hora (triagem + estimativas +
   documentos — motores puros em `lib/familias/*`).
2. **Publicação** (opt-in): o herdeiro pede análise → informa e-mail e marca o
   consentimento específico → link de confirmação de USO ÚNICO
   (`/familias/confirmar/[codigo]`) carimba `emailConfirmadoEm`,
   `consentimentoEm` e `publicadoEm` (status `publicado`).
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
- **72 horas**: publicado sem NENHUMA resposta → a varredura do
  `/admin/radar` envia UM aviso honesto ("ainda sem respostas") e carimba
  `aviso72hEm` (nunca repete).
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
