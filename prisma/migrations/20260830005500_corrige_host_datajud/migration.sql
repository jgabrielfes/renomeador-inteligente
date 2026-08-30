-- Correção de DADO da semente: o host da API pública do Datajud saiu sem o
-- ".jus" (api-publica.datajud.cnj.br não resolve — ENOTFOUND). Nenhuma
-- mudança de schema.
UPDATE "jurimetria_fontes"
SET "urlBase" = 'https://api-publica.datajud.cnj.jus.br'
WHERE "id" = 'fonte-datajud-vrp'
  AND "urlBase" = 'https://api-publica.datajud.cnj.br';
