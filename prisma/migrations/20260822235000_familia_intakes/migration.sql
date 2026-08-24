-- CreateTable
CREATE TABLE "familia_intakes" (
    "id" TEXT NOT NULL,
    "respostas" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "nome" TEXT,
    "email" TEXT,
    "emailConfirmadoEm" TIMESTAMP(3),
    "consentimentoEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'resultado',
    "uf" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "pequenoValor" BOOLEAN NOT NULL DEFAULT false,
    "tokenGestao" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "familia_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "familia_intakes_tokenGestao_key" ON "familia_intakes"("tokenGestao");

-- CreateIndex
CREATE INDEX "familia_intakes_status_uf_createdAt_idx" ON "familia_intakes"("status", "uf", "createdAt");

