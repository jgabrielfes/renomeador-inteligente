-- EQUIPES de trabalho do Sucessorista: contas INDIVIDUAIS vinculadas por
-- convite do chefe (nada de login compartilhado — auditoria preservada):
--   * o chefe cria a equipe e gera CÓDIGOS de convite de uso único;
--   * o membro entra com a própria conta colando o código;
--   * papel CHEFE gere (convida/remove); MEMBRO faz tudo, exceto gerir;
--   * os CASOS seguem na pasta compartilhada do Drive/OneDrive (guarda de
--     conflito já existente) — a equipe governa pessoas, não arquivos.

CREATE TYPE "PapelEquipe" AS ENUM ('CHEFE', 'MEMBRO');

CREATE TABLE "equipes" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "app" "Plataforma" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "equipe_convites" (
  "token" TEXT NOT NULL,
  "equipeId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usadoEm" TIMESTAMP(3),
  "usadoPorId" TEXT,

  CONSTRAINT "equipe_convites_pkey" PRIMARY KEY ("token")
);

ALTER TABLE "equipe_convites"
  ADD CONSTRAINT "equipe_convites_equipeId_fkey"
  FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "equipeId" TEXT;
ALTER TABLE "users" ADD COLUMN "papelEquipe" "PapelEquipe";

ALTER TABLE "users"
  ADD CONSTRAINT "users_equipeId_fkey"
  FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
