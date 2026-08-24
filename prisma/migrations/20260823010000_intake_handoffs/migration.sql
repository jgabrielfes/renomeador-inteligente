-- CreateTable
CREATE TABLE "intake_handoffs" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "advogadoUserId" TEXT,
    "importadoEm" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_handoffs_codigo_key" ON "intake_handoffs"("codigo");

-- CreateIndex
CREATE INDEX "intake_handoffs_intakeId_idx" ON "intake_handoffs"("intakeId");

