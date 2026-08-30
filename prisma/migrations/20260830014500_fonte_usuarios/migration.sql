-- Fonte da CAMADA B: notas devolutivas contribuídas pelos usuários (texto
-- SEMPRE anonimizado antes de persistir; o worker processa como as demais
-- fontes). Só dado; sem schema.
INSERT INTO "jurimetria_fontes" ("id", "tipo", "nome", "urlBase", "ativa", "config") VALUES
  ('fonte-usuarios', 'USUARIO_SUCESSORISTA', 'Notas devolutivas contribuídas pelos usuários', NULL, true, '{"semColetor":true}')
ON CONFLICT ("id") DO NOTHING;
