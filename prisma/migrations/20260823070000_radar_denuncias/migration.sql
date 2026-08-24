-- CreateTable
CREATE TABLE "radar_denuncias" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "advogadoUserId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoEm" TIMESTAMP(3),

    CONSTRAINT "radar_denuncias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "radar_denuncias_status_createdAt_idx" ON "radar_denuncias"("status", "createdAt");

