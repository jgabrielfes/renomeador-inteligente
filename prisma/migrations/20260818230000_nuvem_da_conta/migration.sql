-- Nuvem da CONTA: espelho do caso.json por usuário, sem exigir equipe — o
-- login passa a "puxar" os casos em qualquer computador. Chave composta
-- (userId, id): contas que dividem a mesma pasta no Drive podem espelhar o
-- mesmo caseId sem colisão. Documento nunca sobe; nada disso vai a /admin.
CREATE TABLE "conta_casos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cabecalho" JSONB NOT NULL,
    "arquivo" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conta_casos_pkey" PRIMARY KEY ("userId","id")
);

ALTER TABLE "conta_casos" ADD CONSTRAINT "conta_casos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
