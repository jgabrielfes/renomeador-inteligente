// Portais de certidões gratuitas usados na folha de pesquisa.
//
// Nenhum deles aceita os dados por URL nem expõe API: a emissão é manual, com
// login/captcha em vários. Por isso o app não emite nada sozinho — ele abre o
// portal, oferece os campos para colar e, quando a certidão sai, grava o
// arquivo na pasta já numerado na ordem desta lista.

export interface Portal {
  id: string;
  nome: string;
  descricao: string;
  url: string;
  /** Portal que exige login próprio — o usuário precisa abrir já logado. */
  login?: boolean;
  /** Base do nome do arquivo quando a certidão for salva na pasta. */
  arquivo: string;
}

export const PORTAIS: Portal[] = [
  {
    id: "rfb-pf",
    nome: "Receita Federal — CND pessoa física",
    descricao: "Débitos federais e dívida ativa da União",
    url: "https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cpf",
    arquivo: "Certidão Negativa Receita Federal (PF)",
  },
  {
    id: "rfb-pj",
    nome: "Receita Federal — CND pessoa jurídica",
    descricao: "Mesma certidão, para parte com CNPJ",
    url: "https://servicos.receitafederal.gov.br/servico/certidoes/#/home/cnpj",
    arquivo: "Certidão Negativa Receita Federal (PJ)",
  },
  {
    id: "tst",
    nome: "TST — CNDT",
    descricao: "Certidão negativa de débitos trabalhistas, âmbito nacional",
    url: "https://www.tst.jus.br/certidao1",
    arquivo: "Certidão Negativa de Débitos Trabalhistas (CNDT)",
  },
  {
    id: "trt2",
    nome: "TRT 2ª Região — ações trabalhistas",
    descricao: "Certidão trabalhista eletrônica, sistema anterior",
    url: "https://aplicacoes9.trt2.jus.br/certidao_trabalhista_eletronica/public/index.php/index/solicitacao",
    arquivo: "Certidão Trabalhista TRT2",
  },
  {
    id: "trt2-pje",
    nome: "TRT 2ª Região — PJe",
    descricao: "Certidão trabalhista dos processos eletrônicos",
    url: "https://pje.trt2.jus.br/certidoes/trabalhista/emissao",
    arquivo: "Certidão Trabalhista TRT2 (PJe)",
  },
  {
    id: "trf3",
    nome: "TRF 3ª Região",
    descricao: "Distribuição cível, criminal e eleitoral na Justiça Federal",
    url: "https://web.trf3.jus.br/certidao-regional/CertidaoCivelEleitoralCriminal/SolicitarDadosCertidao",
    arquivo: "Certidão de Distribuição TRF3",
  },
  {
    id: "tjsp-cadastro",
    nome: "TJSP — distribuidor de 1ª instância",
    descricao: "Cadastro do pedido no eSAJ",
    url: "https://esaj.tjsp.jus.br/sco/abrirCadastro.do",
    arquivo: "Certidão de Distribuição TJSP",
  },
  {
    id: "tjsp-certidoes",
    nome: "TJSP — portal de certidões",
    descricao: "Acompanhamento e retirada das certidões pedidas",
    url: "https://certidoes.tjsp.jus.br/",
    arquivo: "Certidão TJSP (retirada)",
  },
  {
    id: "cenprot",
    nome: "CENPROT SP — protestos",
    descricao: "Certidão de protestos no estado de São Paulo",
    url: "https://protestosp.com.br/Home/LoginIIS",
    login: true,
    arquivo: "Certidão de Protesto CENPROT",
  },
];
