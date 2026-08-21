# Painel do Cliente (herdeiro)

A janela FILTRADA do caso para a família: o advogado decide o que aparece,
clica **Publicar** e cada herdeiro convidado enxerga — pelo link do próprio
convite — a fase do inventário em linguagem leiga, o próximo passo, o que
falta dele, os custos visíveis e (se liberado) o próprio quinhão. Nada sobe
sozinho; o caso completo nunca sai da máquina do advogado.

## Arquitetura: espelho publicado

O Sucessorista é local-first (a folha do caso vive no navegador/pasta/nuvem
do advogado). O painel segue a **opção A** do desenho original — *espelho
publicado*:

1. O navegador do advogado monta o snapshot com `montarPaineisDoCaso`
   (`lib/portal/painel.ts`, motor puro com testes anti-vazamento em
   `painel.test.ts`): construção por **allowlist campo a campo**, um painel
   por convite/token. Honorários, notas internas, folha de partilha, análises
   e os demais herdeiros ficam fora **por construção** — o motor não conhece
   esses campos.
2. A server action `publicarPainel` (`painel-actions.ts`) valida sessão e
   dono (ou colega da mesma equipe) e grava o JSON pequeno em
   `portal_paineis`. Republicar substitui; comparar snapshots detecta a
   mudança de FASE e a liberação do quinhão (eventos + e-mails).
3. O herdeiro abre `/portal/<token>` — o token do convite é a credencial
   (não há login de herdeiro). O GET devolve o convite + o recorte `painel`
   daquele token + o histórico leigo ao vivo.

Sem provedor novo: tudo no Postgres (Supabase) que o repositório já usa,
com criptografia em repouso do próprio provedor. Os arquivos enviados pelos
herdeiros também ficam lá (`portal_arquivos`, teto de 25 MB, upload fatiado)
— não há Vercel Blob/S3.

## O que é persistido, e por quanto tempo

| Tabela | Conteúdo | Vida |
| --- | --- | --- |
| `portal_convites` | convite (nome, pedidos, status, qualificação enviada, acessos, preferências de aviso) | até revogar (o registro fica; o acesso morre — 410) ou **Encerrar compartilhamento** |
| `portal_arquivos` | arquivos REAIS enviados pelo herdeiro (vários por pedido) | até o herdeiro apagar (pedido não aprovado), o advogado excluir o convite ou o Encerrar |
| `portal_arquivo_partes` | fatias temporárias de upload | remontadas na última fatia; órfãs varridas em ~24 h |
| `portal_paineis` | o espelho publicado (snapshot filtrado + visibilidade) | até o Encerrar |
| `portal_eventos` | registro de atendimento (rótulos, nomes, motivos — nunca conteúdo de documento) | até o Encerrar (deleteMany explícito — sem FK desde `registro_de_atendimento`) |

**Encerrar compartilhamento** (card "Painel da família") apaga tudo acima do
caso numa transação — é o "apagar tudo do servidor" prometido à família.
NUNCA exibir nada dessas tabelas em `/admin` (dado do escritório, não
telemetria).

## Variáveis de ambiente novas

| Env | Efeito |
| --- | --- |
| `RESEND_API_KEY` | liga os avisos por e-mail e o "perdi o link" (`/portal`). Ausente = o recurso **não existe** (nenhuma UI aparece; a rota responde 404). |
| `EMAIL_FROM` | remetente com domínio verificado no Resend, ex.: `O Sucessorista <avisos@dominio.com.br>`. Sem ela vale o remetente de teste do Resend (entrega só para a própria conta). |

Notificações: mudança de fase (preferências `tudo` e `fases`), quinhão
liberado, documento aprovado/devolvido com motivo e pendência nova (só
`tudo`). O herdeiro salva e-mail e preferência na seção "Avisos por e-mail"
do portal. Fallback sem e-mail: botão **copiar aviso (WhatsApp)** no card.

## Mapa rápido dos arquivos

- Motor do espelho: `lib/portal/painel.ts` (+ `painel.test.ts`)
- Actions do advogado: `app/(private)/sucessorista/painel-actions.ts`
- Card do advogado: `app/(private)/sucessorista/painel-familia-card.tsx`
  (primeiro bloco da Página Inicial, recolhível)
- Tela do herdeiro: `app/portal/[token]/portal-client.tsx`
- Rotas do portal: `app/api/portal/[token]` (GET/PATCH), `.../arquivo`
  (POST/DELETE), `app/api/portal/recuperar` (perdi o link),
  `app/api/portal/arquivo/[id]` (download do advogado, com sessão)
- Registro de atendimento: `lib/portal/eventos.ts` (tipos/rótulos, cliente)
  + `eventos-server.ts` (gravação) + `lib/portal/relatorio-pdf.ts` (PDF)
- E-mail: `lib/portal/email.ts` + `lib/portal/notificar.ts`
- Privacidade (herdeiro): `app/portal/privacidade/page.tsx`
- Conferência e coluna Responsável: `app/(private)/sucessorista/documentos.tsx`

## LGPD, em uma linha

O advogado é o **controlador**; a plataforma, **operadora** (base legal:
execução de contrato + legítimo interesse). A página
`/portal/privacidade` explica tudo ao herdeiro em linguagem simples, e o
rodapé deontológico permanente (Provimento 205/2021 da OAB) lembra que ele
pode constituir advogado próprio.

## Rodar localmente

```bash
yarn install
APP=sucessorista yarn dev          # o site do Sucessorista
yarn db:deploy                     # aplica as migrações (DIRECT_URL no .env)
npx tsx lib/portal/painel.test.ts  # testes do motor do espelho
```

Fluxo de teste manual: criar caso → aba Documentos → gerar convite → card
"Painel da família" → escolher fase e Publicar → abrir o link do convite em
aba anônima. Com `RESEND_API_KEY` no ambiente, salvar um e-mail em "Avisos
por e-mail" e recusar um documento dispara o aviso.
