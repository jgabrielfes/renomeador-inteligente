-- Correção de DADO: o alias do índice do Datajud é api_publica_tjsp
-- (SINGULAR) — "api_publicas_tjsp" devolve 403 security_exception para a
-- chave pública. Nenhuma mudança de schema.
UPDATE "jurimetria_fontes"
SET "config" = jsonb_set("config", '{endpoint}', '"/api_publica_tjsp/_search"')
WHERE "id" = 'fonte-datajud-vrp';

-- CJPG: termo sem acento (o testado na sonda) e recoleta imediata — o
-- coletor passou a usar janela fixa, então o relógio da fonte volta a zero.
UPDATE "jurimetria_fontes"
SET "config" = jsonb_set("config", '{pesquisaLivre}', '"\"duvida\" registro de imoveis"'),
    "ultimaColeta" = NULL
WHERE "id" = 'fonte-cjpg-vrp';
