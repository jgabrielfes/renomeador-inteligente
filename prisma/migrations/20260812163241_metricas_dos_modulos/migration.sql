-- CreateEnum
CREATE TYPE "Modulo" AS ENUM ('RENOMEADOR', 'NOTAS', 'SUCESSORISTA');

-- CreateEnum
CREATE TYPE "AcaoSucessorista" AS ENUM ('LEITURA_COFRE', 'CALCULO', 'DOCUMENTO', 'PORTAL');

-- CreateTable
CREATE TABLE "module_accesses" (
    "id" TEXT NOT NULL,
    "modulo" "Modulo" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_events" (
    "id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "fonte" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "arquivos" INTEGER NOT NULL DEFAULT 0,
    "duracaoPasta" INTEGER,
    "duracaoMs" INTEGER,
    "itens" JSONB,
    "desfecho" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucessorista_events" (
    "id" TEXT NOT NULL,
    "acao" "AcaoSucessorista" NOT NULL,
    "perfil" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "duracaoMs" INTEGER,
    "dados" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucessorista_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_accesses_userId_modulo_idx" ON "module_accesses"("userId", "modulo");

-- AddForeignKey
ALTER TABLE "module_accesses" ADD CONSTRAINT "module_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_events" ADD CONSTRAINT "notas_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucessorista_events" ADD CONSTRAINT "sucessorista_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
