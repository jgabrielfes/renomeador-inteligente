-- Convites do portal do herdeiro saem da MEMÓRIA do servidor (que zera a
-- cada cold start — link "expirando" e envios sumindo) e passam ao banco:
--   * o link do convite passa a durar indefinidamente (não expira);
--   * documento anexado/qualificação preenchida sobrevivem entre invocações
--     e aparecem nas Notificações do cofre do advogado;
--   * `dados` guarda o ConviteHerdeiro inteiro — nomes/status/qualificação;
--     conteúdo de documento NUNCA entra (fica no navegador do herdeiro).

CREATE TABLE "portal_convites" (
  "token" TEXT NOT NULL,
  "casoId" TEXT NOT NULL,
  "dados" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "portal_convites_pkey" PRIMARY KEY ("token")
);
