-- Migração de DADOS (o schema não muda): as exigências ingeridas do Datajud
-- até aqui saíram OCAS — o texto do coletor tinha só metadados e movimentos,
-- sem os ASSUNTOS da tabela CNJ (o sinal de tema) nem o destaque do
-- julgamento, então quase tudo ficou sem tema e invisível na consulta
-- tema-primeiro. O conteúdo é 100% reproduzível da API pública: descartamos
-- os documentos dessa fonte (cascata leva exigências e revisões) e o
-- backfill os recolhe de novo com o texto enriquecido, 120 por rodada.

DELETE FROM "jurimetria_documentos" WHERE "fonteId" = 'fonte-datajud-vrp';

-- Jobs pendentes que apontavam para esses documentos ficam órfãos — fecha.
UPDATE "jurimetria_jobs"
SET "status" = 'erro', "erro" = 'documento descartado pela recoleta enriquecida do Datajud'
WHERE "status" = 'pendente'
  AND "tipo" = 'processar_documento'
  AND NOT EXISTS (
    SELECT 1 FROM "jurimetria_documentos" d
    WHERE d."id" = "jurimetria_jobs"."payload"->>'documentoId'
  );

-- Libera a fonte para recoletar já na próxima rodada (agendada inclusive).
UPDATE "jurimetria_fontes" SET "ultimaColeta" = NULL WHERE "id" = 'fonte-datajud-vrp';
