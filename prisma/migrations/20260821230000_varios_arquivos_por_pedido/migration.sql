-- DropIndex
DROP INDEX "portal_arquivos_token_docId_key";

-- CreateIndex
CREATE INDEX "portal_arquivos_token_docId_idx" ON "portal_arquivos"("token", "docId");

