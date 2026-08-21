-- CreateTable
CREATE TABLE "espolio_notas" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "bemId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "valorSugerido" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espolio_notas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espolio_despesas" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "herdeiroId" TEXT,
    "categoria" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "tratamento" TEXT NOT NULL DEFAULT 'ressarcir',
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espolio_despesas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "espolio_notas_casoId_createdAt_idx" ON "espolio_notas"("casoId", "createdAt");

-- CreateIndex
CREATE INDEX "espolio_despesas_casoId_createdAt_idx" ON "espolio_despesas"("casoId", "createdAt");

