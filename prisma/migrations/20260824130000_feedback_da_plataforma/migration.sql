-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "app" "Plataforma" NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pagina" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedbacks_app_createdAt_idx" ON "feedbacks"("app", "createdAt");

