'use server';

/**
 * A lista de municípios de uma UF, servida ao navegador sob demanda.
 *
 * Existe para que TODO campo de município da plataforma possa ser "escolha a
 * UF e pegue da lista", em vez de um campo de texto onde cada pessoa grafa o
 * nome de um jeito ("Guarulhos", "guarulhos", "Guarulhos-SP"). A base dos
 * 5.587 municípios mora no servidor (`lib/rede/municipios.ts`) e continua
 * fora do bundle: o cliente pede só o estado que interessa.
 *
 * Server action é ENDPOINT PÚBLICO — e aqui isso é proposital, sem gate de
 * sessão: quem consome inclui as telas SEM login (o questionário `/familias`
 * e o portal do herdeiro, que entra por token). O dado é a divisão político-
 * administrativa do IBGE: público por natureza, nada a proteger.
 */

import { municipiosDaUf, type Municipio } from './municipios';

export async function listarMunicipiosDaUf(uf: string): Promise<Municipio[]> {
  return municipiosDaUf(String(uf ?? '').slice(0, 2));
}
