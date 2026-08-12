/*
  Warnings:

  - Added the required column `updatedAt` to the `sucessorista_events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "sucessorista_events" ADD COLUMN     "casoId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "sucessorista_events_casoId_acao_idx" ON "sucessorista_events"("casoId", "acao");
