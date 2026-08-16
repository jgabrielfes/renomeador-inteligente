-- Perfil de uso do Sucessorista (Advogado(a) × Escrevente Notarial) passa a
-- ser VINCULADO À CONTA, não mais ao navegador (localStorage):
--   * escolhido UMA única vez, no primeiro acesso ao módulo;
--   * usuário comum não circula pelos dois perfis — só MASTER;
--   * null = conta que ainda não escolheu (o módulo pergunta ao abrir).

CREATE TYPE "PerfilSucessorista" AS ENUM ('ADVOGADO', 'ESCREVENTE');

ALTER TABLE "users" ADD COLUMN "perfilSucessorista" "PerfilSucessorista";
