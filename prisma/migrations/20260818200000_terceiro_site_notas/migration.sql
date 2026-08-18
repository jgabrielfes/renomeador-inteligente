-- Terceiro site da plataforma: o Resolvedor de Notas Devolutivas volta ao ar
-- como site próprio (APP=notas). As contas são por site (par email+app), então
-- o enum Plataforma ganha o valor NOTAS — nada destrutivo: as linhas atuais
-- de users/error_events/rename_events seguem como estão.
ALTER TYPE "Plataforma" ADD VALUE IF NOT EXISTS 'NOTAS';
