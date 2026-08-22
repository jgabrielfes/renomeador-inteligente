-- CreateTable
CREATE TABLE "espolio_cenarios" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espolio_cenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "espolio_adesoes" (
    "id" TEXT NOT NULL,
    "cenarioId" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "espolio_adesoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "espolio_cenarios_casoId_createdAt_idx" ON "espolio_cenarios"("casoId", "createdAt");

-- CreateIndex
CREATE INDEX "espolio_adesoes_cenarioId_createdAt_idx" ON "espolio_adesoes"("cenarioId", "createdAt");

-- CreateIndex
CREATE INDEX "espolio_adesoes_casoId_createdAt_idx" ON "espolio_adesoes"("casoId", "createdAt");

