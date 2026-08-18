-- Upload REAL do portal do herdeiro (opção A, decidida pelo escritório): o
-- arquivo enviado pelo link do convite passa a repousar no banco até o
-- advogado baixá-lo/anexá-lo ao caso. Um arquivo por pedido (reenvio
-- substitui); excluir o convite apaga os arquivos em cascata.
CREATE TABLE "portal_arquivos" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_arquivos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_arquivos_token_docId_key" ON "portal_arquivos"("token", "docId");

ALTER TABLE "portal_arquivos" ADD CONSTRAINT "portal_arquivos_token_fkey" FOREIGN KEY ("token") REFERENCES "portal_convites"("token") ON DELETE CASCADE ON UPDATE CASCADE;
