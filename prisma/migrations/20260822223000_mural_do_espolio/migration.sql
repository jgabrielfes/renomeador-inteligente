-- CreateTable
CREATE TABLE "espolio_mural" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "motivo" TEXT,
    "decididaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espolio_mural_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "espolio_mural_casoId_createdAt_idx" ON "espolio_mural"("casoId", "createdAt");

