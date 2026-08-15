-- Separação da plataforma em DOIS sites (Renomeador e Sucessorista) servidos
-- pelo mesmo repositório e pelo mesmo banco (variável de ambiente APP).
--
-- O que muda para os dados:
--   * a conta passa a ser POR PLATAFORMA — o par (e-mail, app) é o que precisa
--     ser único, não o e-mail sozinho;
--   * quem já tinha conta ganha uma cópia no outro site (mesma senha, mesmo
--     papel, mesmas regras do escritório), para ninguém perder acesso na
--     virada;
--   * telemetria de renomeação e erros passam a saber de qual site vieram.

CREATE TYPE "Plataforma" AS ENUM ('RENOMEADOR', 'SUCESSORISTA');

-- ---------------------------------------------------------------- contas ---

-- O DEFAULT existe só para carimbar as linhas atuais; sai no fim da migração
-- (daqui em diante a plataforma é sempre explícita, escrita por quem cria).
ALTER TABLE "users" ADD COLUMN "app" "Plataforma" NOT NULL DEFAULT 'RENOMEADOR';

DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_app_key" ON "users"("email", "app");

-- Cada conta existente ganha uma gêmea no Sucessorista. São contas
-- INDEPENDENTES a partir daqui: trocar a senha em um site não mexe no outro.
-- O id novo é um uuid (o cuid() do Prisma não existe no Postgres); o app só
-- exige que seja único, e as contas criadas pela plataforma seguem com cuid.
INSERT INTO "users" (
  "id", "name", "email", "app", "emailVerified", "passwordHash", "role",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, "name", "email", 'SUCESSORISTA', "emailVerified",
  "passwordHash", "role", "createdAt", NOW()
FROM "users"
WHERE "app" = 'RENOMEADOR';

-- As "Regras do escritório" e as correções aprendidas acompanham a cópia: o
-- cofre do Sucessorista embute o Renomeador e abre com essas lições. São
-- dados do próprio usuário — a cópia fica na conta dele, no outro site.
INSERT INTO "renamer_lessons" ("userId", "regras", "correcoes", "updatedAt")
SELECT novo."id", licoes."regras", licoes."correcoes", NOW()
FROM "renamer_lessons" licoes
JOIN "users" antigo
  ON antigo."id" = licoes."userId" AND antigo."app" = 'RENOMEADOR'
JOIN "users" novo
  ON novo."email" = antigo."email" AND novo."app" = 'SUCESSORISTA';

ALTER TABLE "users" ALTER COLUMN "app" DROP DEFAULT;

-- ----------------------------------------------------------- telemetria ---

ALTER TABLE "error_events" ADD COLUMN "app" "Plataforma";
ALTER TABLE "rename_events" ADD COLUMN "app" "Plataforma";

-- Histórico da era "plataforma única": em vez de deixar em branco (e sumir
-- dos dois painéis), cada registro é atribuído ao site a que corresponde.
UPDATE "error_events"
SET "app" = CASE
  WHEN "origem" LIKE 'api/sucessorista%' THEN 'SUCESSORISTA'::"Plataforma"
  ELSE 'RENOMEADOR'::"Plataforma"
END;

-- O Renomeador embutido no cofre é recente; todo o histórico é do site do
-- Renomeador.
UPDATE "rename_events" SET "app" = 'RENOMEADOR';
