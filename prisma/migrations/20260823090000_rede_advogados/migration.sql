-- CreateTable
CREATE TABLE "caso_advogados" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "advogadoUserId" TEXT NOT NULL,
    "convidadoPorUserId" TEXT NOT NULL,
    "indicadoPor" TEXT NOT NULL DEFAULT 'titular',
    "representaTokens" JSONB NOT NULL,
    "conviteToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caso_advogados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caso_advogado_mensagens" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "deUserId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caso_advogado_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caso_advogados_conviteToken_key" ON "caso_advogados"("conviteToken");

-- CreateIndex
CREATE INDEX "caso_advogados_advogadoUserId_status_idx" ON "caso_advogados"("advogadoUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "caso_advogados_casoId_advogadoUserId_key" ON "caso_advogados"("casoId", "advogadoUserId");

-- CreateIndex
CREATE INDEX "caso_advogado_mensagens_casoId_createdAt_idx" ON "caso_advogado_mensagens"("casoId", "createdAt");

