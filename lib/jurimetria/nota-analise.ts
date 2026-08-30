/**
 * Análise LOCAL de uma NOTA DEVOLUTIVA — o entregável que incentiva a
 * contribuição (Camada B da jurimetria).
 *
 * Roda NO NAVEGADOR: decompõe a nota pelo `triar()` do Resolvedor de Notas
 * (calibrado em notas reais), marca os temas registrais de cada exigência e
 * localiza o cartório mencionado. Nada daqui depende de servidor — a
 * consulta ao histórico e a contribuição anonimizada são passos separados.
 */

import { triar, type ItemClassificado } from '@/lib/notas/resolvedor';

import { detectarTemas, mencoesDeCartorio } from './temas-local';

export interface ExigenciaDaNota extends ItemClassificado {
  temas: string[];
}

export interface AnaliseNota {
  itens: ExigenciaDaNota[];
  /** Todos os temas presentes na nota (sem repetir, na ordem do catálogo). */
  temas: string[];
  mencoesCartorio: string[];
}

export function analisarNotaDevolutiva(texto: string): AnaliseNota {
  const itens = triar(texto).map((i) => ({ ...i, temas: detectarTemas(i.texto) }));
  const temas = [...new Set(itens.flatMap((i) => i.temas))];
  return { itens, temas, mencoesCartorio: mencoesDeCartorio(texto) };
}
