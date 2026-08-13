/**
 * Tipos de bens e direitos do sistema da DECLARAÇÃO DO ITCMD-SP — a mesma
 * lista (código + rótulo) que o declarante encontra na Sefaz, para o
 * lançamento do acervo falar a língua da declaração. Cada código mapeia para
 * o TipoBem interno do motor (que decide meação, isenções, Detran, cláusula
 * bancária etc.). Lista é DADO revisável — acompanhar o sistema da Sefaz.
 */

import type { TipoBem } from './types';

export interface TipoBemItcmd {
  codigo: string;
  rotulo: string;
  tipo: TipoBem;
}

export const TIPOS_BEM_ITCMD: TipoBemItcmd[] = [
  { codigo: '101', rotulo: 'Imóvel Urbano', tipo: 'IMOVEL' },
  { codigo: '102', rotulo: 'Imóvel Urbano em construção', tipo: 'IMOVEL' },
  { codigo: '103', rotulo: 'Imóvel Urbano com alienação fiduciária', tipo: 'IMOVEL' },
  { codigo: '104', rotulo: 'Imóvel Urbano compromissado à venda - Promitente vendedor', tipo: 'IMOVEL' },
  { codigo: '105', rotulo: 'Imóvel Urbano compromissado à venda - Promitente comprador', tipo: 'IMOVEL' },
  { codigo: '106', rotulo: 'Imóvel Urbano - Domínio Útil (enfiteuse)', tipo: 'IMOVEL' },
  { codigo: '107', rotulo: 'Imóvel Urbano - Domínio Direto (enfiteuse)', tipo: 'IMOVEL' },
  { codigo: '121', rotulo: 'Imóvel Rural', tipo: 'IMOVEL' },
  { codigo: '122', rotulo: 'Imóvel Rural com alienação fiduciária', tipo: 'IMOVEL' },
  { codigo: '123', rotulo: 'Imóvel Rural compromissado à venda - Promitente vendedor', tipo: 'IMOVEL' },
  { codigo: '124', rotulo: 'Imóvel Rural compromissado à venda - Promitente comprador', tipo: 'IMOVEL' },
  { codigo: '125', rotulo: 'Imóvel Rural - Domínio Útil (enfiteuse)', tipo: 'IMOVEL' },
  { codigo: '126', rotulo: 'Imóvel Rural - Domínio Direto (enfiteuse)', tipo: 'IMOVEL' },
  { codigo: '141', rotulo: 'Veículo Automotor Terrestre: caminhão, automóvel, moto, etc.', tipo: 'VEICULO' },
  { codigo: '142', rotulo: 'Veículo Automotor Terrestre: caminhão, automóvel, moto, etc. com alienação fiduciária', tipo: 'VEICULO' },
  { codigo: '143', rotulo: 'Aeronave', tipo: 'OUTRO' },
  { codigo: '144', rotulo: 'Embarcação', tipo: 'OUTRO' },
  { codigo: '145', rotulo: 'Jóia, quadro, objeto de arte, de coleção, antiguidade, etc', tipo: 'OUTRO' },
  { codigo: '146', rotulo: 'Rebanho animal', tipo: 'OUTRO' },
  { codigo: '147', rotulo: 'Ferramentas ou Máquinas e equipamentos agrícolas de uso manual', tipo: 'OUTRO' },
  { codigo: '148', rotulo: 'Outras máquinas e equipamentos agrícolas', tipo: 'OUTRO' },
  { codigo: '149', rotulo: 'Máquinas e equipamentos industriais ou comerciais', tipo: 'OUTRO' },
  { codigo: '150', rotulo: 'Roupas', tipo: 'OUTRO' },
  { codigo: '151', rotulo: 'Aparelhos de uso doméstico', tipo: 'OUTRO' },
  { codigo: '152', rotulo: 'Outros bens móveis', tipo: 'OUTRO' },
  { codigo: '161', rotulo: 'Participações societárias negociadas em bolsa de valores', tipo: 'QUOTAS' },
  { codigo: '162', rotulo: 'Participações societárias não negociadas em bolsa de valores', tipo: 'QUOTAS' },
  { codigo: '163', rotulo: 'Fundo Imobiliário', tipo: 'FINANCEIRO' },
  { codigo: '171', rotulo: 'Depósitos Bancários ou Aplicações Financeiras em moeda nacional', tipo: 'FINANCEIRO' },
  { codigo: '172', rotulo: 'Depósitos Bancários ou Aplicações Financeiras em moeda estrangeira', tipo: 'FINANCEIRO' },
  { codigo: '173', rotulo: 'Ouro, ativo financeiro', tipo: 'FINANCEIRO' },
  { codigo: '174', rotulo: 'Mercados futuros, de opções e a termo', tipo: 'FINANCEIRO' },
  { codigo: '175', rotulo: 'Crédito decorrente de empréstimo ou alienação', tipo: 'OUTRO' },
  { codigo: '176', rotulo: 'Dinheiro em espécie - moeda nacional', tipo: 'OUTRO' },
  { codigo: '177', rotulo: 'Dinheiro em espécie - moeda estrangeira', tipo: 'OUTRO' },
  { codigo: '178', rotulo: 'Quantia devida pelo empregador ao empregado', tipo: 'OUTRO' },
  { codigo: '179', rotulo: 'Quantia devida por institutos de Seguro Social e Previdência Públicos', tipo: 'OUTRO' },
  { codigo: '180', rotulo: 'Quantia devida por institutos de Seguro Social e Previdência Privados', tipo: 'OUTRO' },
  { codigo: '181', rotulo: 'Verbas de caráter alimentar decorrentes de decisão judicial em processo próprio', tipo: 'OUTRO' },
  { codigo: '182', rotulo: 'Valores em contas de FGTS ou PIS-PASEP', tipo: 'OUTRO' },
  { codigo: '183', rotulo: 'Outras aplicações e investimentos', tipo: 'FINANCEIRO' },
  { codigo: '191', rotulo: 'Licença e concessão especiais', tipo: 'OUTRO' },
  { codigo: '192', rotulo: 'Título de clube e assemelhado', tipo: 'OUTRO' },
  { codigo: '193', rotulo: 'Direito de autor, de inventor e patente', tipo: 'OUTRO' },
  { codigo: '194', rotulo: 'Direito de lavra e assemelhado', tipo: 'OUTRO' },
  { codigo: '195', rotulo: 'Consórcio não contemplado', tipo: 'OUTRO' },
  { codigo: '199', rotulo: 'Outros bens e direitos - outras informações', tipo: 'OUTRO' },
];

export function tipoBemItcmd(codigo: string | undefined): TipoBemItcmd | undefined {
  return TIPOS_BEM_ITCMD.find((t) => t.codigo === codigo);
}
