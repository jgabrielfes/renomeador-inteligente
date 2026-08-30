-- PUBLICAÇÃO AUTOMÁTICA (decisão do escritório): tudo que estava preso na
-- fila por confiança/titular/cartório PUBLICA agora; a fila fica só para a
-- trava LGPD (possível dado pessoal). E o CJPG ganha VÁRIOS termos de busca
-- para alcançar o histórico antigo. Só dado; sem schema.

-- Publica o retido (exceto duplicatas e o marcado como possível dado pessoal).
UPDATE "jurimetria_exigencias" e
SET "publicado" = true
WHERE e."publicado" = false
  AND e."duplicataDe" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "jurimetria_revisoes" r
    WHERE r."exigenciaId" = e."id" AND r."motivo" = 'possivel_dado_pessoal' AND r."status" = 'pendente'
  );

-- Fecha as revisões que não são a trava LGPD.
UPDATE "jurimetria_revisoes"
SET "status" = 'aprovada'
WHERE "status" = 'pendente' AND "motivo" <> 'possivel_dado_pessoal';

-- Termos múltiplos do CJPG (cobertura do histórico antigo).
UPDATE "jurimetria_fontes"
SET "config" = jsonb_set("config", '{pesquisas}',
  '["\"duvida\" registro de imoveis","duvida suscitada oficial de registro","duvida inversa registro de imoveis","julgo procedente a duvida matricula","julgo improcedente a duvida registro","procedimento de duvida registral"]')
WHERE "id" = 'fonte-cjpg-vrp';
