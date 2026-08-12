"use client";

// Detalhes de uma ação do Sucessorista. Sem nome de parte, CPF, nome de
// arquivo ou valor de acervo: o porte do caso aparece como FAIXA e o resto é
// contagem, tag de enum ou flag.

import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ROTULO_ACAO, ROTULO_DOCUMENTO, ROTULO_ETAPA_PORTAL } from "@/lib/sucessorista-rotulos";
import { rotuloDoPorte } from "@/lib/porte";

export interface DetalhesSucessorista {
  data: string;
  usuario: string;
  acao: string;
  perfil: string | null;
  quantidade: number;
  duracaoMs: number | null;
  casoId: string | null;
  dados: Record<string, unknown> | null;
}

function duracao(ms: number | null): string {
  if (ms === null || ms === 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

const REGIMES: Record<string, string> = {
  COMUNHAO_PARCIAL: "Comunhão parcial",
  COMUNHAO_UNIVERSAL: "Comunhão universal",
  SEPARACAO_CONVENCIONAL: "Separação convencional",
  SEPARACAO_OBRIGATORIA: "Separação obrigatória",
  PARTICIPACAO_FINAL_AQUESTOS: "Participação final nos aquestos",
};

const TIPOS_BEM: Record<string, string> = {
  IMOVEL: "imóvel",
  VEICULO: "veículo",
  FINANCEIRO: "conta/aplicação",
  QUOTAS: "quotas/ações",
  OUTRO: "outro",
};

export function SucessoristaEventDetails({
  evento,
}: {
  evento: DetalhesSucessorista;
}) {
  const d = evento.dados ?? {};
  const num = (chave: string): number | null =>
    typeof d[chave] === "number" ? (d[chave] as number) : null;
  const texto = (chave: string): string | null =>
    typeof d[chave] === "string" ? (d[chave] as string) : null;
  const lista = (chave: string): string[] =>
    Array.isArray(d[chave]) ? (d[chave] as unknown[]).filter((v): v is string => typeof v === "string") : [];
  const flag = (chave: string): boolean => d[chave] === true;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Ver detalhes do caso" />
        }
      >
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ROTULO_ACAO[evento.acao] ?? evento.acao}</DialogTitle>
          <DialogDescription>
            {evento.data} · {evento.usuario}
            {evento.perfil ? ` · perfil ${evento.perfil.toLowerCase()}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          {evento.acao === "LEITURA_COFRE" && (
            <>
              <Linha rotulo="Documentos lidos pela IA">{evento.quantidade}</Linha>
              <Linha rotulo="Arquivos selecionados">{num("selecionados") ?? "—"}</Linha>
              <Linha rotulo="Sem leitura (formato/tamanho)">
                {num("inelegiveis") ?? 0}
              </Linha>
              <Linha rotulo="Lotes que falharam">{num("lotesFalhos") ?? 0}</Linha>
              <Linha rotulo="Duração">{duracao(evento.duracaoMs)}</Linha>
              <Linha rotulo="Identificou o falecido">
                {flag("identificouFalecido") ? "sim" : "não"}
              </Linha>
              <Linha rotulo="Herdeiros extraídos">{num("herdeirosLidos") ?? 0}</Linha>
              <Linha rotulo="Bens extraídos">{num("bensLidos") ?? 0}</Linha>
              {(num("outrosObitos") ?? 0) > 0 && (
                <Linha rotulo="Outros óbitos detectados">
                  {num("outrosObitos")}
                </Linha>
              )}
              {lista("tipos").length > 0 && (
                <div className="pt-2">
                  <p className="text-muted-foreground">Tipos reconhecidos</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lista("tipos").map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {evento.acao === "CALCULO" && (
            <>
              <Linha rotulo="Herdeiros">{evento.quantidade}</Linha>
              <Linha rotulo="Bens">{num("bens") ?? 0}</Linha>
              <Linha rotulo="Porte do acervo">{rotuloDoPorte(d.porte)}</Linha>
              <Linha rotulo="Rito provável">
                {texto("rito") === "JUDICIAL" ? (
                  <Badge className="bg-amber-100 text-amber-800">Judicial</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    Extrajudicial
                  </Badge>
                )}
              </Linha>
              <Linha rotulo="Cônjuge/companheiro(a)">
                {flag("temSobrevivente") ? "sim" : "não"}
              </Linha>
              {flag("temSobrevivente") && (
                <>
                  <Linha rotulo="Vínculo">
                    {texto("vinculo") === "UNIAO_ESTAVEL"
                      ? "União estável"
                      : "Casamento"}
                  </Linha>
                  <Linha rotulo="Regime">
                    {REGIMES[texto("regime") ?? ""] ?? "—"}
                  </Linha>
                </>
              )}
              <Linha rotulo="Menores/incapazes">{num("incapazes") ?? 0}</Linha>
              <Linha rotulo="Partilha diferenciada">
                {flag("diferenciada") ? (flag("torna") ? "sim, com torna" : "sim") : "não"}
              </Linha>
              <Linha rotulo="Isenções do art. 6º aplicadas">
                {num("isencoes") ?? 0}
              </Linha>
              <Linha rotulo="Cenário da reforma">
                {flag("progressivo") ? "tabela progressiva" : "alíquota fixa"}
              </Linha>
              {lista("tiposBem").length > 0 && (
                <div className="pt-2">
                  <p className="text-muted-foreground">Tipos de bem no acervo</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lista("tiposBem").map((t) => (
                      <Badge key={t} variant="secondary">
                        {TIPOS_BEM[t] ?? t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {lista("parcelasItcmd").length > 0 && (
                <div className="pt-2">
                  <p className="text-muted-foreground">Parcelas do ITCMD</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {lista("parcelasItcmd").map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className={
                          p.startsWith("multa") || p === "juros"
                            ? "border-destructive/40 text-destructive"
                            : undefined
                        }
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {lista("temasDivergencia").length > 0 && (
                <div className="pt-2">
                  <p className="text-muted-foreground">
                    Divergências doutrinárias apontadas
                  </p>
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {lista("temasDivergencia").map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {evento.acao === "DOCUMENTO" && (
            <>
              <Linha rotulo="Documento">
                <Badge variant="secondary">
                  {ROTULO_DOCUMENTO[texto("documento") ?? ""] ??
                    texto("documento") ??
                    "—"}
                </Badge>
              </Linha>
              <Linha rotulo="Redação">
                {flag("comIa") ? "IA" : "padrão local"}
              </Linha>
              <Linha rotulo="Instruções livres à IA">
                {flag("comInstrucoes") ? "sim" : "não"}
              </Linha>
              {texto("modalidade") && (
                <Linha rotulo="Modalidade do ato">
                  {texto("modalidade")?.toLowerCase()}
                </Linha>
              )}
              {evento.quantidade > 0 && (
                <Linha rotulo="Itens no documento">{evento.quantidade}</Linha>
              )}
            </>
          )}

          {evento.acao === "PORTAL" && (
            <>
              <Linha rotulo="Etapa">
                {ROTULO_ETAPA_PORTAL[texto("etapa") ?? ""] ?? texto("etapa") ?? "—"}
              </Linha>
              <Linha rotulo="Quantidade">{evento.quantidade}</Linha>
              {texto("tipoDetectado") && (
                <Linha rotulo="Tipo detectado">{texto("tipoDetectado")}</Linha>
              )}
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Nenhum nome, CPF, nome de arquivo ou valor de acervo é registrado — o
          porte é sempre uma faixa. Caso: {evento.casoId?.slice(0, 12) ?? "—"}…
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{children}</span>
    </p>
  );
}
