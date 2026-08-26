-- Créditos do Radar: a assinatura do aplicativo concede créditos e cada
-- candidatura consome 1 — o uso deixa de ser restrito à UF assinada.
-- (radar_assinaturas fica no banco como histórico; a aplicação não a lê mais.)
ALTER TABLE "advogado_perfis" ADD COLUMN "creditosRadar" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "radar_creditos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "intakeId" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_creditos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "radar_creditos_userId_idx" ON "radar_creditos"("userId");
