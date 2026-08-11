# Calibração do motor — ITCMD/SP

Parâmetros que o protótipo usa e a fonte de cada um. Tudo o que está em **negrito** é campo editável na aba V, porque muda de ano para ano ou depende de lei ainda não aprovada.

## Regra de ouro do motor
A lei aplicável é a **da data do óbito** (fato gerador), não a da data em que o inventário é aberto. Por isso o motor guarda a data do óbito como chave e escolhe a tabela por ela. Um óbito de 2026 continua a 4% mesmo que a partilha seja feita em 2028.

## Alíquota
- Hoje em SP: **4% fixos** sobre o valor transmitido — art. 16 da Lei estadual 10.705/2000.
- Base de cálculo: valor venal ou de mercado na data do óbito. O STJ (Tema 1.371) admite que o fisco reveja o valor declarado, mas só por procedimento formal e motivado — não pode trocar automaticamente o valor venal do IPTU por tabela de referência infralegal.
- Meação não é tributada. O imposto incide sobre o quinhão de cada herdeiro.

## Isenções aplicadas (art. 6º da Lei 10.705/2000)
- Imóvel residencial até 5.000 UFESPs, se os herdeiros nele residirem e não tiverem outro imóvel.
- Demais bens do espólio até 1.000 UFESPs no conjunto.
- **UFESP**: o protótipo usa R$ 38,42 para 2026, deduzido do limite anual de doação divulgado para o ano (R$ 96.050 = 2.500 UFESPs). Confirme no Comunicado da Sefaz antes de usar em produção, e guarde a UFESP de cada ano — casos antigos precisam do valor da época.

## Prazos, multa e juros
| Marco | Contagem | Efeito |
|---|---|---|
| 60 dias do óbito | art. 611 do CPC | abertura tempestiva |
| 61 a 180 dias | art. 21, I, da Lei 10.705/2000 | multa de 10% do imposto |
| acima de 180 dias | art. 21, I | multa de 20% do imposto |
| acima de 180 dias | art. 17, §1º c/c art. 20 | juros de mora sobre o imposto |

- **Taxa de juros**: divulgada mensalmente pela Sefaz (tabela prática). O protótipo usa 1% ao mês como padrão editável; o ideal é alimentar a tabela real por mês, já que o cálculo retroage.
- Dilação por justo motivo autorizada judicialmente afasta a penalidade (art. 17, §1º).
- Defesa que vale como alerta na tela: o TJSP tem afastado a multa em inventário extrajudicial quando a escritura de nomeação de inventariante foi lavrada dentro dos 60 dias, por entender que o rito não se confunde com o judicial. O motor já sinaliza isso quando a multa incide.

## Cenário da reforma
- A EC 132/2023 tornou a progressividade obrigatória e a LC 227/2026 (publicada em 13 de janeiro de 2026) fixou as normas gerais. A progressividade incide **em razão do valor do quinhão**, não do monte — por isso o comparativo é calculado herdeiro a herdeiro.
- A LC não é autoaplicável. Depende de lei de cada estado e, pelas anterioridades anual e nonagesimal, lei estadual publicada em 2026 só produz efeito a partir de 1º de janeiro de 2027. É esse o padrão do campo **vigência**.
- Em SP tramitam o PL 7/2024 (2% a 8%) e o PL 409/2025 (proposta mais leve, com teto em 4%). Nenhum está em vigor. As faixas na tela são editáveis justamente porque ainda são hipótese — mude a data de vigência e a tabela quando a lei sair e o motor passa a aplicá-la sozinha aos óbitos posteriores.
- Outras mudanças da LC 227/2026 que o checklist já sinaliza: quotas de sociedades não listadas passam a ter base a valor de mercado, com patrimônio líquido ajustado e fundo de comércio — o que encarece muito holdings patrimoniais com imóvel a custo histórico; e doações sucessivas entre as mesmas partes podem ser consolidadas para efeito de progressividade, conforme a lei estadual definir.

## O que ainda falta ligar
1. Tabela de juros mês a mês da Sefaz, em vez de taxa única.
2. UFESP por ano, para casos com óbito antigo.
3. Emolumentos do tabelionato e do registro de imóveis, para fechar o orçamento total do inventário.
4. Regras dos demais estados — o motor já separa alíquota, faixas e vigência, então cada estado é só um conjunto de parâmetros.

## Pendências jurídicas que o motor não decide sozinho
- Filiação híbrida: a reserva de 1/4 do art. 1.832 não é aplicada quando há filhos comuns e exclusivos, e a tela avisa. Decisão do advogado.
- Participação final nos aquestos: tratada como o regime parcial na concorrência, por analogia. Ponto controvertido.
- Imóvel situado em outro estado: o ITCMD daquele bem é devido ao estado onde ele está, e o motor apenas sinaliza — não calcula duas competências ainda.
