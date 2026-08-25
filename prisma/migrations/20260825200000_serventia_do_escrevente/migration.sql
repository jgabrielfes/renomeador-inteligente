-- Escrevente Notarial: a serventia onde trabalha (qualificação do primeiro
-- acesso). Nullable — contas de advogado e contas antigas seguem sem valor.
ALTER TABLE "users" ADD COLUMN "serventia" TEXT;
