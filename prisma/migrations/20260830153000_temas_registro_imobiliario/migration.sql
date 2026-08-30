-- Foco pedido pelo escritório (2026-08-30): a jurimetria passa a cobrir os
-- grandes temas do registro imobiliário GERAL, além das sucessões —
-- alienação fiduciária, incorporação, retificações (registro e área),
-- desmembramento, englobamento, adjudicação compulsória extrajudicial e
-- usucapião extrajudicial. Migração de DADOS: o schema não muda.

INSERT INTO "jurimetria_temas" ("id", "rotulo") VALUES
  ('alienacao-fiduciaria', 'Alienação fiduciária em garantia (Lei 9.514/97)'),
  ('incorporacao-imobiliaria', 'Incorporação imobiliária (Lei 4.591/64)'),
  ('retificacao-registro', 'Retificação de registro (LRP, art. 213)'),
  ('retificacao-area', 'Retificação de área'),
  ('desmembramento', 'Desmembramento / desdobro do imóvel'),
  ('englobamento', 'Englobamento / unificação de matrículas'),
  ('adjudicacao-compulsoria', 'Adjudicação compulsória extrajudicial'),
  ('usucapiao-extrajudicial', 'Usucapião extrajudicial (LRP, art. 216-A)')
ON CONFLICT ("id") DO NOTHING;

-- Termos de busca do CJPG ampliados para os novos temas (o coletor passa a
-- ler até 16 pesquisas por rodada; sem acento — o formato validado na sonda).
UPDATE "jurimetria_fontes"
SET "config" = jsonb_set("config", '{pesquisas}',
  '["\"duvida\" registro de imoveis","duvida suscitada oficial de registro","duvida inversa registro de imoveis","julgo procedente a duvida matricula","julgo improcedente a duvida registro","procedimento de duvida registral","duvida \"alienacao fiduciaria\" registro de imoveis","duvida \"incorporacao imobiliaria\" registro","\"retificacao de area\" registro de imoveis","duvida retificacao registro de imoveis","desmembramento duvida registro de imoveis","\"unificacao de matriculas\" registro de imoveis","\"adjudicacao compulsoria\" registro de imoveis","\"usucapiao extrajudicial\" registro de imoveis"]')
WHERE "id" = 'fonte-cjpg-vrp';
