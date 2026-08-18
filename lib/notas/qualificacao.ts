// Construtor de qualificação.
//
// Descoberta do corpus: o bloco de qualificação é IDÊNTICO nas três peças
// (ata retificativa, requerimento e escritura de rerratificação). Mesma ordem
// de campos, mesma pontuação, mesmas fórmulas. Logo, é um só construtor
// alimentando os três geradores — não três implementações.
//
// Não confundir com lib/qualificacao.ts (folha de pesquisa), que EXTRAI dados
// de um RG/CNH; este aqui MONTA a prosa a partir dos dados.
//
// Ordem canônica na pessoa física (invariável nos 16 documentos analisados):
//   NOME, nacionalidade, [profissão], RG + órgão [(CNH/UF)] – inscrito no
//   CPF/MF sob nº, nascido aos, filho de X e de Y, [estado civil + regime +
//   data + cônjuge qualificado + fonte da certidão], residente e domiciliado
//   em ENDEREÇO (CEP. xxxxx-xxx)

export interface PessoaFisica {
  nome: string;
  sexo?: "M" | "F";
  nacionalidade?: string;
  profissao?: string;
  rg?: string;
  cnh?: string;
  cpf: string;
  nascimento?: string;
  pai?: string;
  mae?: string;
  estadoCivil?:
    | "casado"
    | "solteiro"
    | "divorciado"
    | "viuvo"
    | (string & {});
  regime?: string;
  dataCasamento?: string;
  conjuge?: PessoaFisica;
  certidaoCasamento?: string;
  declaraSemUniao?: boolean;
  deQuem?: string;
  endereco?: string;
  cep?: string;
  // advogado
  oab?: string;
  oabUf?: string;
  escritorio?: string;
}

export interface PessoaJuridica {
  razaoSocial: string;
  cnpj: string;
  sede: string;
  cep?: string;
  nire?: string;
  representantes?: PessoaFisica[];
  cargoRep?: string;
  mandato?: string;
}

export type Pessoa = PessoaFisica | PessoaJuridica;

function art(sexo: "M" | "F", m: string, f: string): string {
  return sexo === "M" ? m : f;
}

export function pessoaFisica(p: PessoaFisica, comTratamento = true): string {
  const sexo = p.sexo ?? "M";
  const out: string[] = [];

  if (comTratamento) out.push(art(sexo, "Sr.", "Sra.") + " ");
  out.push(p.nome.toUpperCase());
  out.push(", " + (p.nacionalidade ?? art(sexo, "brasileiro", "brasileira")));

  if (p.profissao) out.push(", " + p.profissao);

  if (p.rg) {
    const cnh = p.cnh ? ` (${p.cnh})` : "";
    out.push(`, RG. nº ${p.rg}${cnh} –`);
  }
  out.push(` ${art(sexo, "inscrito", "inscrita")} no CPF/MF sob nº ${p.cpf}`);

  if (p.nascimento) {
    out.push(`, ${art(sexo, "nascido", "nascida")} aos ${p.nascimento}`);
  }
  if (p.pai || p.mae) {
    out.push(
      `, ${art(sexo, "filho", "filha")} de ${p.pai ?? ""} e de ${p.mae ?? ""}`
    );
  }

  out.push(estadoCivil(p, sexo));

  if (p.endereco) {
    const cep = p.cep ? ` (CEP. ${p.cep})` : "";
    out.push(
      `, ${art(sexo, "residente e domiciliado", "residente e domiciliada")} ` +
        `na ${p.endereco}${cep}`
    );
  }
  return out.join("");
}

function estadoCivil(p: PessoaFisica, sexo: "M" | "F"): string {
  const ec = (p.estadoCivil ?? "").toLowerCase();

  if (ec === "casado") {
    let s = `, ${art(sexo, "casado", "casada")}`;
    if (p.regime) s += ` sob o regime da ${p.regime}`;
    if (p.dataCasamento) s += `, aos ${p.dataCasamento}`;
    if (p.conjuge) {
      s +=
        `, com ${art(sexo, "a Sra.", "o Sr.")} ` +
        pessoaFisica(p.conjuge, false);
    }
    if (p.certidaoCasamento) {
      s += `, conforme Certidão de Casamento ${p.certidaoCasamento}`;
    }
    return s;
  }

  if (ec === "solteiro") {
    let s = `, ${art(sexo, "solteiro", "solteira")}, conforme declarou, maior e capaz`;
    if (p.declaraSemUniao) {
      s += `, ${art(sexo, "o qual declara", "a qual declara")} não conviver em união estável`;
    }
    return s;
  }

  if (ec === "divorciado" || ec === "viuvo" || ec === "viúvo") {
    const base =
      ec === "divorciado"
        ? (["divorciado", "divorciada"] as const)
        : (["viúvo", "viúva"] as const);
    let s = `, ${art(sexo, base[0], base[1])}`;
    if (p.deQuem) s += ` de ${p.deQuem.toUpperCase()}`;
    if (p.certidaoCasamento) {
      s += ` - conforme averbação constante na Certidão de Casamento ${p.certidaoCasamento}`;
    }
    return s;
  }

  return ec ? `, ${ec}` : "";
}

export function advogado(p: PessoaFisica): string {
  const sexo = p.sexo ?? "M";
  let s =
    `${art(sexo, "Dr.", "Dra.")} ${p.nome.toUpperCase()}, ` +
    `${p.nacionalidade ?? art(sexo, "brasileiro", "brasileira")}, ` +
    `${p.estadoCivil ?? ""}, ` +
    `${art(sexo, "inscrito", "inscrita")} na OAB/${p.oabUf ?? "SP"} sob nº ${p.oab} ` +
    `e no CPF/MF sob nº ${p.cpf}`;
  if (p.nascimento) s += `, ${art(sexo, "nascido", "nascida")} aos ${p.nascimento}`;
  if (p.pai || p.mae) {
    s += `, ${art(sexo, "filho", "filha")} de ${p.pai ?? ""} e de ${p.mae ?? ""}`;
  }
  if (p.escritorio) {
    const cep = p.cep ? ` (CEP. ${p.cep})` : "";
    s += `, com escritório na ${p.escritorio}${cep}`;
  }
  return s;
}

export function pessoaJuridica(p: PessoaJuridica): string {
  const cep = p.cep ? ` (CEP. ${p.cep})` : "";
  let s = `${p.razaoSocial.toUpperCase()}, inscrita no CNPJ/MF sob nº ${p.cnpj}, com sede na ${p.sede}${cep}`;
  if (p.nire) {
    s +=
      ", com seus atos constitutivos registrados na Junta Comercial do Estado " +
      `de São Paulo – JUCESP, sob NIRE nº ${p.nire}`;
  }
  const reps = p.representantes ?? [];
  if (reps.length > 0) {
    s += `, neste ato representada por ${p.cargoRep ?? "seus representantes"}, `;
    s += reps.map((r) => pessoaFisica(r)).join("; e, ");
  }
  if (p.mandato) s += `, nos termos ${p.mandato}`;
  return s;
}

// Escolhe a forma pelo conteúdo, sem precisar de flag externa.
export function qualificar(p: Pessoa): string {
  if ("cnpj" in p || "razaoSocial" in p) return pessoaJuridica(p as PessoaJuridica);
  const pf = p as PessoaFisica;
  if (pf.oab) return advogado(pf);
  return pessoaFisica(pf);
}

// Encadeia várias partes. Numera quando são três ou mais, como no corpus.
export function lista(pessoas: Pessoa[], numerar?: boolean): string {
  const n = numerar ?? pessoas.length > 2;
  let blocos = pessoas.map(qualificar);
  if (n) blocos = blocos.map((b, i) => `${i + 1}) ${b}`);
  if (blocos.length === 1) return blocos[0];
  return blocos.slice(0, -1).join("; ") + "; e, " + blocos[blocos.length - 1];
}
