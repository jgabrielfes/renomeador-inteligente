# Ética OAB no Radar de herdeiros — fundamentos e checklist de UI

O Radar conecta famílias a advogados(as) SEM virar captação de clientela nem
mercantilização da advocacia. Este documento fixa os fundamentos e o
**checklist obrigatório de revisão de UI** — toda tela nova que toque o Radar
passa por ele antes do merge.

## Fundamentos

- **EOAB (Lei 8.906/94), art. 34, IV**: constitui infração angariar ou captar
  causas, com ou sem intermediários. → O herdeiro SOLICITA; advogados
  respondem. Nunca o contrário; nenhum contato nasce do lado profissional.
- **Código de Ética e Disciplina, arts. 5º e 7º**: o exercício da advocacia é
  incompatível com qualquer procedimento de mercantilização; é vedada a
  intermediação de honorários. → Assinatura **mensal** por UF, marcada à mão;
  **nunca** comissão por caso fechado; honorários tratados fora da
  plataforma, sem campo para valores em resposta ou chat.
- **Provimento 205/2021 (CFOAB)** — publicidade ativa e passiva: informação
  sóbria, sem promessa de resultado, sem comparação, com identificação do(a)
  profissional. → Resposta = apresentação + condução técnica, sempre com nome
  e OAB; quiz deontológico (10/10) antes da primeira resposta.
- **Escolha do cliente é inviolável**: a plataforma não indica, não ranqueia
  e não destaca. → Ordem da lista do advogado é ÚNICA (data); ordem das
  respostas para a família é ALEATÓRIA E FIXA por token; teto de DUAS candidaturas
  por caso — o marcador "X/2 advogados" (a família não é leiloada); a
  candidatura consome 1 CRÉDITO da assinatura do aplicativo (gate no motor
  puro lib/radar/candidatura.ts — o plano em desenvolvimento entra ali).
- **LGPD**: a plataforma é CONTROLADORA dos dados do intake; publicação exige
  **consentimento específico**, colhido no diálogo de dupla confirmação que
  descreve exatamente o que vai ao ar e o que nunca vai (a validação por link
  de e-mail saiu — deixava solicitações paradas para sempre. O e-mail continua
  obrigatório, mas como CANAL da família, não como validação: nada é enviado
  para conferir o endereço, e ele não é publicado com o caso); retirar
  apaga tudo; retenção máxima de 90 dias; pós-importação o servidor poda o
  conteúdo.

## Texto legal fixo

> **Esta plataforma não intermedeia honorários nem indica advogados.**

Aparece em: `/radar` (topo e rodapé), "Minha solicitação" (rodapé ético),
e-mails do Radar e na confirmação de publicação.

## Checklist de revisão de UI (obrigatório)

Antes de aprovar qualquer tela/e-mail que toque o Radar, conferir:

- [ ] **Sem ranking**: nenhuma ordenação por "melhor", avaliação, estrelas,
      contagem de contratações ou destaque pago. Lista do advogado por data;
      respostas para a família em ordem aleatória fixa.
- [ ] **Sem preço**: nenhum campo, filtro ou exibição de honorários,
      "a partir de", faixa de preço ou comparação de custo entre profissionais.
- [ ] **Sem promessa**: placeholders e textos de apoio não induzem a garantia
      de resultado ou prazo.
- [ ] **Identificação do profissional**: nome + OAB/UF visíveis em toda
      resposta; anonimato é SÓ da família.
- [ ] **Anonimato da família**: nada identificável antes do "Quero conversar" —
      nome, e-mail, telefone, nome do falecido e o DIA exato do óbito nunca
      atravessam (do falecimento sai só mês/ano + tempo decorrido, porque dia
      exato somado à cidade é chave de busca em obituário e cartório).
      **Exceção consentida**: as observações livres da família passaram a ser
      publicadas por decisão do escritório — e só valem assim porque a família
      é avisada ANTES de escrever (texto de apoio do campo) e DE NOVO no
      diálogo de publicação. Mexeu numa dessas telas, confira se o aviso
      continua lá: sem ele, isto vira vazamento.
- [ ] **Iniciativa da família**: nenhum botão/fluxo permite ao(à) advogado(a)
      iniciar contato; um(a) por vez; encerrar/denunciar sempre à mão.
- [ ] **Texto legal fixo** presente na tela.
- [ ] **Assinatura ≠ comissão**: nenhuma menção a cobrança por caso, êxito ou
      percentual. O modelo é CRÉDITO DE USO da assinatura do aplicativo:
      cada candidatura consome 1 crédito, tenha ou não retorno da família —
      o preço remunera o uso da plataforma, nunca o êxito, e não há
      restrição por UF (o mural inteiro é de todo(a) habilitado(a)).
- [ ] **Honestidade**: estados vazios dizem a verdade ("ainda sem respostas");
      prazos e avisos (72h/30 dias/90 dias) explícitos.
- [ ] **Lucratividade invisível**: nenhuma UI mostra ao(à) advogado(a) valor
      potencial do caso além da faixa leiga que a própria família publicou.

## O que o admin vê (e o que não vê)

`/admin/radar` opera **cadastros e contadores**: fila da OAB, créditos,
funil por status/UF, varredura de 72h, denúncias e a **moderação do mural**
(retirar publicação com motivo + e-mail à família). NUNCA o conteúdo das
conversas, das respostas ou dos intakes — as exceções são o MOTIVO da
denúncia, escrito pela própria família para a moderação, e o **card anônimo
publicado** (o mesmo que os advogados veem, observações incluídas): moderar o
que está no ar exige ver o que está no ar.

## Rede advogado-advogado (camada 4) — decisões que valem as mesmas regras

A rede de correspondentes e o segundo advogado no caso
(**docs/rede-advogados.md**) herdam os fundamentos acima entre PARES:

- **A plataforma não participa dos honorários da diligência** (EOAB art. 34;
  CED arts. 26–27): o combinado financeiro é ENTRE os advogados; a
  plataforma só registra o **termo de referência** (escopo, prazo e o valor
  em texto livre) — sem processamento de pagamento, sem comissão, sem split.
  O acesso do correspondente às buscas vem da MESMA assinatura do
  Radar; nunca de taxa por diligência fechada.
- **Ordem NEUTRA de correspondentes**: comarca exata → mesma UF → data de
  cadastro (`ordenarCorrespondentes`, motor puro testado); ofertas exibidas
  em ordem de CHEGADA. Nunca por preço, nunca por nota.
- **Selo de verificação obrigatório**: aparecer nas buscas e ofertar exigem
  OAB aprovada + quiz deontológico (o selo da camada 3) e perfil ativo.
- **Avaliações só por critérios objetivos** (prazo/relatório/comunicação,
  1–5, mútuas, após a conclusão): a **nota agregada** só aparece a
  assinantes logados; atraso sem justificativa pesa na média pelo motor.
- **Pasta isolada da diligência**: o(a) correspondente vê SÓ o que o
  solicitante colocou na pasta (`conteudoDaPasta`, testado) — nunca o caso.
- **Texto legal fixo das telas da rede**: "A correspondência é combinada
  ENTRE os advogados — a plataforma não participa dos honorários da
  diligência, não processa pagamento e não indica correspondente: a lista
  segue ordem neutra."
