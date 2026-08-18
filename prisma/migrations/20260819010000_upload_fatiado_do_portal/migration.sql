-- Upload FATIADO do portal do herdeiro: arquivos até 25 MB sobem em fatias
-- de ~3,5 MB (limite de corpo por requisição na Vercel); a última fatia
-- remonta o arquivo em portal_arquivos e apaga as fatias. Fatias órfãs de
-- envios abandonados são varridas por melhor-esforço nos uploads seguintes.
CREATE TABLE "portal_arquivo_partes" (
    "envioId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_arquivo_partes_pkey" PRIMARY KEY ("envioId","indice")
);
