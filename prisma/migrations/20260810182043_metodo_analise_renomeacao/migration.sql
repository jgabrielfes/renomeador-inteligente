-- CreateEnum
CREATE TYPE "MetodoAnalise" AS ENUM ('IA_ARQUIVO', 'IA_TEXTO', 'LOCAL');

-- AlterTable
ALTER TABLE "rename_events" ADD COLUMN     "metodo" "MetodoAnalise" NOT NULL DEFAULT 'LOCAL';
