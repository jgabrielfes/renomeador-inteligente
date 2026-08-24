-- AlterTable
ALTER TABLE "familia_intakes" ADD COLUMN     "aviso72hEm" TIMESTAMP(3),
ADD COLUMN     "confirmacaoToken" TEXT,
ADD COLUMN     "publicadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "familia_intakes_confirmacaoToken_key" ON "familia_intakes"("confirmacaoToken");

