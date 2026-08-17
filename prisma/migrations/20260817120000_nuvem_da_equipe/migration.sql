-- NUVEM DA EQUIPE: o chefe pode gerar convite de ACESSO TOTAL — quem entra
-- com ele enxerga todos os casos do chefe pela nuvem (espelho do caso.json
-- no banco; documentos NUNCA sobem), continuando sem poder gerir a equipe.
--   * equipe_convites.acessoCasos marca o tipo do convite;
--   * users.acessoCasosEquipe é gravado ao resgatar o convite;
--   * equipe_casos guarda o arquivo do caso (cabecalho em coluna própria
--     para a listagem não carregar o arquivo inteiro).

ALTER TABLE "equipe_convites" ADD COLUMN "acessoCasos" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users" ADD COLUMN "acessoCasosEquipe" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "equipe_casos" (
  "id" TEXT NOT NULL,
  "equipeId" TEXT NOT NULL,
  "cabecalho" JSONB NOT NULL,
  "arquivo" JSONB NOT NULL,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  "atualizadoPor" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "equipe_casos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "equipe_casos_equipeId_idx" ON "equipe_casos"("equipeId");

ALTER TABLE "equipe_casos"
  ADD CONSTRAINT "equipe_casos_equipeId_fkey"
  FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
