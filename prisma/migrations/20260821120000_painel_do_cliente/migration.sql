-- CreateTable
CREATE TABLE "portal_paineis" (
    "casoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "visibilidade" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_paineis_pkey" PRIMARY KEY ("casoId")
);

-- CreateTable
CREATE TABLE "portal_eventos" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "token" TEXT,
    "tipo" TEXT NOT NULL,
    "detalhe" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_eventos_casoId_createdAt_idx" ON "portal_eventos"("casoId", "createdAt");

-- AddForeignKey
ALTER TABLE "portal_eventos" ADD CONSTRAINT "portal_eventos_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "portal_paineis"("casoId") ON DELETE CASCADE ON UPDATE CASCADE;

