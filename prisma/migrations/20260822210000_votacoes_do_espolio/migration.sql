-- CreateTable
CREATE TABLE "espolio_votacoes" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "encerradaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espolio_votacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espolio_votos" (
    "id" TEXT NOT NULL,
    "votacaoId" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "opcaoId" TEXT NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espolio_votos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "espolio_votacoes_casoId_createdAt_idx" ON "espolio_votacoes"("casoId", "createdAt");

-- CreateIndex
CREATE INDEX "espolio_votos_votacaoId_createdAt_idx" ON "espolio_votos"("votacaoId", "createdAt");

-- CreateIndex
CREATE INDEX "espolio_votos_casoId_createdAt_idx" ON "espolio_votos"("casoId", "createdAt");

