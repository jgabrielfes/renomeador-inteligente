-- AlterTable
ALTER TABLE "familia_intakes" ADD COLUMN     "contratadoEm" TIMESTAMP(3),
ADD COLUMN     "conversaAbertaEm" TIMESTAMP(3),
ADD COLUMN     "conversaAdvogadoUserId" TEXT;

-- CreateTable
CREATE TABLE "advogado_perfis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oab" TEXT NOT NULL,
    "oabUf" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'pendente',
    "motivoRecusa" TEXT,
    "quizAprovadoEm" TIMESTAMP(3),
    "aceitaPequenoValor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advogado_perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_assinaturas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'assinante_manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_respostas" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "advogadoUserId" TEXT NOT NULL,
    "apresentacao" TEXT NOT NULL,
    "conducao" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_respostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_mensagens" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "advogadoUserId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advogado_perfis_userId_key" ON "advogado_perfis"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "radar_assinaturas_userId_uf_key" ON "radar_assinaturas"("userId", "uf");

-- CreateIndex
CREATE INDEX "radar_respostas_intakeId_createdAt_idx" ON "radar_respostas"("intakeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "radar_respostas_intakeId_advogadoUserId_key" ON "radar_respostas"("intakeId", "advogadoUserId");

-- CreateIndex
CREATE INDEX "radar_mensagens_intakeId_advogadoUserId_createdAt_idx" ON "radar_mensagens"("intakeId", "advogadoUserId", "createdAt");

