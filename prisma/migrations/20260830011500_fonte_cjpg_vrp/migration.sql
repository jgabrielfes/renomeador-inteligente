-- Fonte nova da semente: CJPG do e-SAJ (sentenças de dúvida com inteiro
-- teor na própria listagem — sonda de 2026-08-30). Só dado; sem schema.
INSERT INTO "jurimetria_fontes" ("id", "tipo", "nome", "urlBase", "ativa", "config") VALUES
  ('fonte-cjpg-vrp', 'DUVIDA_1VRP', 'e-SAJ CJPG — sentenças de dúvida (inteiro teor)', 'https://esaj.tjsp.jus.br', true, '{"coletor":"cjpg","pesquisaLivre":"\"dúvida\" registro de imóveis","intervaloDias":1}')
ON CONFLICT ("id") DO NOTHING;
