-- Correção de DADO: no Datajud o órgão julgador das VRPs chama-se
-- "01/02 REGISTROS PUBLICOS DE CENTRAL" (sem a palavra "Vara") — o filtro
-- antigo zerava a busca. Nenhuma mudança de schema.
UPDATE "jurimetria_fontes"
SET "config" = jsonb_set("config", '{orgaos}', '["REGISTROS PUBLICOS"]')
WHERE "id" = 'fonte-datajud-vrp';
