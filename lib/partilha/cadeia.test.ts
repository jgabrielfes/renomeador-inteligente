/**
 * Casos de teste da cadeia das sucessões cumuladas — regressão pelas
 * escrituras REAIS do balcão que calibraram o motor.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/cadeia.test.ts
 */

import { fracoesDaCadeia, fracaoDaCadeiaBonita } from './cadeia';

let ok = 0,
  fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else {
    fail++;
    console.error(
      `  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`,
    );
  }
}
const perto = (nome: string, a: number, e: number) => {
  if (Math.abs(a - e) < 1e-9) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}\n    esperado ${e}\n    obtido   ${a}`);
  }
};

console.log('\nCadeia das sucessões cumuladas\n');

/* CUTOLO: mãe (7 filhos, viúva — sem meação) → filho Ezequiel (herdeiro,
 * 1 filho) → ex-mulher Denice (mancomunheira de Ezequiel, 2 filhos).
 * Escritura real: monte 2ª = 1/7; mancomunhão/legítima da 2ª = 1/14 cada;
 * monte 3ª = 1/14; legítima da 3ª = 1/28 por filho. */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 7,
    meacaoNaPrincipal: false,
    sucessoes: [
      { id: 'ezequiel', vinculo: 'herdeiro', vinculoCom: 'PRINCIPAL', nHerdeiros: 1 },
      { id: 'denice', vinculo: 'mancomunheiro', vinculoCom: 'ezequiel', nHerdeiros: 2 },
    ],
  });
  perto('CUTOLO: monte do filho = 1/7', f.ezequiel.fracaoMonte, 1 / 7);
  perto('CUTOLO: legítima do filho = 1/14 (mancomunhão sai antes)', f.ezequiel.fracaoPorHerdeiro, 1 / 14);
  perto('CUTOLO: monte da mancomunheira = 1/14', f.denice.fracaoMonte, 1 / 14);
  perto('CUTOLO: por herdeiro da 3ª = 1/28', f.denice.fracaoPorHerdeiro, 1 / 28);
}

/* VALDOMIRO/NAIR (o padrão marido e mulher): marido (2 filhos, esposa meeira)
 * → esposa (meeira, mesmos 2 filhos). Monte 2ª = 50% dos bens comuns. */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 2,
    meacaoNaPrincipal: true,
    sucessoes: [{ id: 'nair', vinculo: 'meeiro', nHerdeiros: 2 }],
  });
  perto('VALDOMIRO: meação da esposa = 50%', f.nair.fracaoMonte, 0.5);
  perto('VALDOMIRO: por herdeiro da 2ª = 1/4', f.nair.fracaoPorHerdeiro, 0.25);
}

/* MOMBACH: mãe (2 filhos, marido meeiro) → pai (meeiro, 2 filhos) → filha
 * (herdeira do pai, 1 irmão colateral). A fração sugerida da 3ª sai 1/4 (o
 * herdado DO PAI); a escritura real somou 1/4 + 1/4 das duas sucessões — a
 * sugestão é editável e a UI avisa do acúmulo. */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 2,
    meacaoNaPrincipal: true,
    sucessoes: [
      { id: 'danilo', vinculo: 'meeiro', vinculoCom: 'PRINCIPAL', nHerdeiros: 2 },
      { id: 'eris', vinculo: 'herdeiro', vinculoCom: 'danilo', nHerdeiros: 1 },
    ],
  });
  perto('MOMBACH: meação do pai = 50%', f.danilo.fracaoMonte, 0.5);
  perto('MOMBACH: por herdeiro do pai = 1/4', f.danilo.fracaoPorHerdeiro, 0.25);
  perto('MOMBACH: fração sugerida da filha = 1/4 (herdada do pai)', f.eris.fracaoMonte, 0.25);
  perto('MOMBACH: por herdeiro da 3ª (irmão único) = 1/4', f.eris.fracaoPorHerdeiro, 0.25);
}

/* Vínculo padrão quando não escolhido = meeiro (marido e mulher). */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 3,
    meacaoNaPrincipal: true,
    sucessoes: [{ id: 'su1', nHerdeiros: 3 }],
  });
  perto('padrão: vínculo ausente vale meeiro (50%)', f.su1.fracaoMonte, 0.5);
}

/* Sem vínculo: nada transita (bens particulares). */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 2,
    meacaoNaPrincipal: false,
    sucessoes: [{ id: 'su1', vinculo: 'nenhum', nHerdeiros: 2 }],
  });
  perto('nenhum: fração 0', f.su1.fracaoMonte, 0);
}

/* vinculoCom ausente = elo imediatamente anterior. */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 4,
    meacaoNaPrincipal: false,
    sucessoes: [
      { id: 'a', vinculo: 'herdeiro', nHerdeiros: 2 },
      { id: 'b', vinculo: 'herdeiro', nHerdeiros: 2 },
    ],
  });
  perto('encadeado: a herda 1/4 da principal', f.a.fracaoMonte, 0.25);
  perto('encadeado: b herda 1/8 de a (1/4 ÷ 2)', f.b.fracaoMonte, 1 / 8);
}

/* Meeiro apontando para a PRINCIPAL sem flag: o partível dela também cai. */
{
  const f = fracoesDaCadeia({
    nHerdeirosPrincipal: 2,
    meacaoNaPrincipal: false,
    sucessoes: [
      { id: 'conj', vinculo: 'meeiro', vinculoCom: 'PRINCIPAL', nHerdeiros: 2 },
      { id: 'filho', vinculo: 'herdeiro', vinculoCom: 'PRINCIPAL', nHerdeiros: 1 },
    ],
  });
  perto('meeiro na cadeia derruba o partível da principal: filho herda 1/4', f.filho.fracaoMonte, 0.25);
}

/* Frações bonitas. */
eq('bonita: 1/7', fracaoDaCadeiaBonita(1 / 7), '1/7');
eq('bonita: 1/14', fracaoDaCadeiaBonita(1 / 14), '1/14');
eq('bonita: 50% vira 1/2', fracaoDaCadeiaBonita(0.5), '1/2');
eq('bonita: 100%', fracaoDaCadeiaBonita(1), '100%');
eq('bonita: 0', fracaoDaCadeiaBonita(0), '0%');

console.log(`\n${ok} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
