# Espaço do Espólio — como funciona (camada 2 do portal)

O **Espaço do Espólio** é o ambiente COMPARTILHADO do caso: enquanto o Painel
do Cliente (camada 1) mostra a cada herdeiro só o próprio recorte, o espaço do
espólio mostra a TODOS os convidados os MESMOS fatos e números — o mesmo
acervo, as mesmas dívidas, os mesmos cálculos, as mesmas propostas. A aposta é
de pacificação: a maior parte dos conflitos de inventário nasce de cada um ver
um número diferente.

Princípios (os mesmos do Painel do Cliente):

- **Nada sobe sozinho** — o advogado liga o espaço, escolhe o que libera e
  clica Publicar; o caso completo nunca sai da máquina dele.
- **Allowlist por construção** — o que circula é montado campo a campo
  (`lib/portal/espolio.ts`, com testes anti-vazamento): honorários, anotações
  internas, matrículas e CONTATOS dos herdeiros entre si ficam fora.
- **Imutável e auditável** — o que a família registra (comentário, sugestão,
  despesa, adesão, voto, mensagem de mural) nunca é editado nem apagado;
  corrigir é registrar algo novo, e a decisão do escritório só muda
  status/motivo. Tudo vira evento no registro de atendimento.
- **Um motor, dois públicos** — a conta dos cenários é a MESMA da seção III
  (`lib/partilha/cenario.ts`): o que a família vê é o que o advogado calcula.

## Matriz papel × recurso

| Recurso | Advogado(a) / equipe | Herdeiro(a) convidado(a) | Mediador(a) convidado(a) |
| --- | --- | --- | --- |
| Ver números do espólio (bens, dívidas, quinhões liberados) | monta e publica | vê (igual para todos) | vê (igual para todos) |
| Comentar / sugerir valor de bem | decide (aceita e aplica × recusa com motivo) | registra | registra |
| Despesa adiantada (com comprovante) | reconhece (ressarcir × compensar) ou recusa com motivo | registra | — (403) |
| Cenários de divisão | propõe da seção III, congela/reabre/retira, leva o consenso para a partilha | responde aceito · não aceito · quero conversar | acompanha (não conta para consenso) |
| Votações formais | abre (pergunta + opções) e encerra (apuração + termo em PDF) | vota (vale o voto mais recente) | acompanha (não vota) |
| Mural da família | modera (publica × não publica com motivo) | escreve; vê as aprovadas + as próprias | escreve; vê as aprovadas + as próprias |
| Resumo por e-mail (digest) | envia com um clique | recebe (conforme preferência) | recebe (conforme preferência) |
| Documentos / qualificação / quinhão individual | pede e confere | envia e acompanha | — (não tem) |
| Advogado(a) próprio(a) | vê a indicação no card e copia o(a) colega | informa pelo portal | — |
| Tentativas de contato (herdeiro ausente) | registra (prova de diligência) | — | — |
| Encerrar compartilhamento | apaga TUDO do servidor numa transação | — | — |

Regras transversais:

- **Consenso é dos herdeiros**: um cenário congela sozinho quando a resposta
  mais recente de TODO convite ativo de herdeiro é "aceito" — mediador e
  convites revogados ficam fora da conta.
- **O token dos outros nunca sai do servidor**: os fatos compartilhados levam
  o NOME do autor; o link (credencial) de cada convite é só dele.
- **Motivos de recusa são para o autor**: recusa de sugestão/despesa e mural
  não publicado carregam o motivo que só o autor lê.

## O caso.json transporta configuração E consenso

O snapshot do caso (`caso.json`, CaseStore) leva o `painelFamilia` inteiro —
fase marcada, visibilidades do painel e do espólio, contatos — e o
`consensoAplicado` ({titulo, em}) gravado quando o advogado clica "levar para
a partilha" num cenário congelado. Abrir o caso em outra máquina (pasta,
nuvem, Drive/OneDrive/Dropbox) restaura a configuração e mostra qual cenário a
família fechou e quando ele virou a matriz da seção III. Os fatos vivos
(notas, despesas, adesões, votos, mural) vivem no SERVIDOR, não no .json — são
da família, não da máquina.

## Duas etapas de deliberação e as provas em papel

- **Votação**: abrir (aviso por e-mail a todos) → família vota pelo portal →
  encerrar (apuração + aviso do resultado). O **termo de deliberação em PDF**
  (`lib/portal/termo-votacao-pdf.ts`) traz a questão, a apuração, os votos
  válidos com data/hora e o histórico integral dos votos substituídos.
- **Relatório de comunicação** (`lib/portal/relatorio-pdf.ts`): todos os
  eventos do caso — convites, acessos, fatos do espólio, moderações,
  tentativas de contato — com data e hora.

Ambos carregam o rodapé deontológico: a deliberação da família orienta o
trabalho do escritório; o ato formal continua sendo a escritura pública, o
formal de partilha ou a decisão judicial, e cada herdeiro pode constituir
advogado(a) próprio(a) a qualquer momento (Provimento 205/2021 da OAB).

## Banco de dados (todas sem FK; quem apaga é o Encerrar)

| Tabela | O que guarda | Mutabilidade |
| --- | --- | --- |
| `portal_paineis.espolio` | o snapshot compartilhado publicado (null = fechado) | republicável |
| `espolio_notas` | comentário/sugestão de valor por bem | decisão só muda status/motivo |
| `espolio_despesas` | despesa adiantada (comprovante = pedido `despesa-<id>`) | decisão só muda status/tratamento/motivo |
| `espolio_cenarios` | cenário proposto (dados leigos + alocacoes) | editável só em `proposto`; congelado/retirado trava |
| `espolio_adesoes` | respostas aos cenários | append-only (a mais recente vale) |
| `espolio_votacoes` | pergunta + opções; aberta/encerrada | encerrada não reabre |
| `espolio_votos` | votos | append-only (o mais recente vale) |
| `espolio_mural` | mensagens do mural | moderação só muda status/motivo |
| `portal_eventos` | o registro de atendimento de tudo | append-only |

"Encerrar compartilhamento" apaga painel, convites, arquivos, eventos e TODAS
as tabelas acima numa única transação — o "apagar tudo do servidor" prometido
à família. Nada disso aparece em `/admin` (dado do escritório e da família,
nunca telemetria).
