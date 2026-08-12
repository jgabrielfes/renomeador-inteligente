-- Busca de usuários no /admin indiferente a ACENTO ("tais" acha "Taís").
-- O `mode: "insensitive"` do Prisma cobre só a caixa; a comparação sem acento
-- é do Postgres, via extensão unaccent. Sem esta extensão a busca por nome
-- volta a exigir o acento exato.
CREATE EXTENSION IF NOT EXISTS unaccent;
