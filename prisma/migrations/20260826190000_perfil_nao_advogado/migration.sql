-- O perfil de uso deixa de distinguir "Escrevente Notarial": passa a ser
-- Advogado × Não Advogado (decisão do escritório). RENAME VALUE preserva as
-- linhas existentes — quem era ESCREVENTE vira NAO_ADVOGADO sem perda.
ALTER TYPE "PerfilSucessorista" RENAME VALUE 'ESCREVENTE' TO 'NAO_ADVOGADO';
