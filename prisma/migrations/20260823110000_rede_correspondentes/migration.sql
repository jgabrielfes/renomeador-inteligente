-- CreateTable
CREATE TABLE "correspondente_perfis" (
    "userId" TEXT NOT NULL,
    "comarcas" JSONB NOT NULL,
    "tipos" JSONB NOT NULL,
    "prazoMedioDias" INTEGER NOT NULL DEFAULT 5,
    "raioKm" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correspondente_perfis_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "diligencias" (
    "id" TEXT NOT NULL,
    "solicitanteUserId" TEXT NOT NULL,
    "casoId" TEXT,
    "comarcaIbge" INTEGER NOT NULL,
    "municipio" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "prazoEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "correspondenteUserId" TEXT,
    "termoJson" JSONB,
    "justificativaAtraso" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diligencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diligencia_arquivos" (
    "id" TEXT NOT NULL,
    "diligenciaId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diligencia_arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diligencia_ofertas" (
    "id" TEXT NOT NULL,
    "diligenciaId" TEXT NOT NULL,
    "correspondenteUserId" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "prazoDias" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diligencia_ofertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diligencia_avaliacoes" (
    "id" TEXT NOT NULL,
    "diligenciaId" TEXT NOT NULL,
    "avaliadorUserId" TEXT NOT NULL,
    "avaliadoUserId" TEXT NOT NULL,
    "criterios" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diligencia_avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diligencias_status_uf_comarcaIbge_idx" ON "diligencias"("status", "uf", "comarcaIbge");

-- CreateIndex
CREATE INDEX "diligencias_solicitanteUserId_idx" ON "diligencias"("solicitanteUserId");

-- CreateIndex
CREATE INDEX "diligencias_correspondenteUserId_idx" ON "diligencias"("correspondenteUserId");

-- CreateIndex
CREATE INDEX "diligencia_arquivos_diligenciaId_idx" ON "diligencia_arquivos"("diligenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "diligencia_ofertas_diligenciaId_correspondenteUserId_key" ON "diligencia_ofertas"("diligenciaId", "correspondenteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "diligencia_avaliacoes_diligenciaId_avaliadorUserId_key" ON "diligencia_avaliacoes"("diligenciaId", "avaliadorUserId");

