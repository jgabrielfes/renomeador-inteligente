-- CreateEnum
CREATE TYPE "FonteJurimetriaTipo" AS ENUM ('DUVIDA_1VRP', 'DUVIDA_CGJ', 'IRIB_PUBLICACAO', 'CARTORIO_SITE', 'USUARIO_SUCESSORISTA', 'PARCEIRO_TABELIONATO', 'PARCEIRO_INCORPORADORA', 'RECIPROCIDADE');

-- CreateTable
CREATE TABLE "jurimetria_cartorios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "aliases" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurimetria_cartorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_titulares" (
    "id" TEXT NOT NULL,
    "cartorioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titularDesde" TIMESTAMP(3) NOT NULL,
    "fonteInfo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurimetria_titulares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_temas" (
    "id" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "jurimetria_temas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_fontes" (
    "id" TEXT NOT NULL,
    "tipo" "FonteJurimetriaTipo" NOT NULL,
    "nome" TEXT NOT NULL,
    "urlBase" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "bloqueadaEm" TIMESTAMP(3),
    "motivoBloqueio" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "ultimaColeta" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurimetria_fontes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_documentos" (
    "id" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "urlOrigem" TEXT,
    "hashConteudo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "textoAnonimizado" TEXT,
    "dataDocumento" TIMESTAMP(3),
    "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'coletado',
    "versaoExtrator" TEXT,
    "erro" TEXT,

    CONSTRAINT "jurimetria_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_exigencias" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "cartorioId" TEXT,
    "titularId" TEXT,
    "titularPendente" BOOLEAN NOT NULL DEFAULT false,
    "temaId" TEXT,
    "atoTipo" TEXT,
    "textoNormalizado" TEXT NOT NULL,
    "fundamentacao" TEXT[],
    "resultado" TEXT,
    "trechoOrigem" TEXT,
    "dataExigencia" TIMESTAMP(3) NOT NULL,
    "confianca" DECIMAL(3,2) NOT NULL,
    "duplicataDe" TEXT,
    "revisadoPor" TEXT,
    "revisadoEm" TIMESTAMP(3),
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurimetria_exigencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_revisoes" (
    "id" TEXT NOT NULL,
    "exigenciaId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "notas" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jurimetria_revisoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_jobs" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jurimetria_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurimetria_metricas" (
    "id" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "fonteId" TEXT NOT NULL,
    "documentos" INTEGER NOT NULL DEFAULT 0,
    "exigencias" INTEGER NOT NULL DEFAULT 0,
    "paraRevisao" INTEGER NOT NULL DEFAULT 0,
    "descartados" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "jurimetria_metricas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jurimetria_cartorios_nome_key" ON "jurimetria_cartorios"("nome");

-- CreateIndex
CREATE INDEX "jurimetria_cartorios_uf_cidade_idx" ON "jurimetria_cartorios"("uf", "cidade");

-- CreateIndex
CREATE INDEX "jurimetria_titulares_cartorioId_titularDesde_idx" ON "jurimetria_titulares"("cartorioId", "titularDesde");

-- CreateIndex
CREATE UNIQUE INDEX "jurimetria_documentos_hashConteudo_key" ON "jurimetria_documentos"("hashConteudo");

-- CreateIndex
CREATE INDEX "jurimetria_documentos_fonteId_status_idx" ON "jurimetria_documentos"("fonteId", "status");

-- CreateIndex
CREATE INDEX "jurimetria_exigencias_cartorioId_temaId_dataExigencia_idx" ON "jurimetria_exigencias"("cartorioId", "temaId", "dataExigencia" DESC);

-- CreateIndex
CREATE INDEX "jurimetria_exigencias_publicado_criadoEm_idx" ON "jurimetria_exigencias"("publicado", "criadoEm");

-- CreateIndex
CREATE INDEX "jurimetria_revisoes_status_criadoEm_idx" ON "jurimetria_revisoes"("status", "criadoEm");

-- CreateIndex
CREATE INDEX "jurimetria_jobs_status_criadoEm_idx" ON "jurimetria_jobs"("status", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "jurimetria_metricas_dia_fonteId_key" ON "jurimetria_metricas"("dia", "fonteId");

-- AddForeignKey
ALTER TABLE "jurimetria_titulares" ADD CONSTRAINT "jurimetria_titulares_cartorioId_fkey" FOREIGN KEY ("cartorioId") REFERENCES "jurimetria_cartorios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_documentos" ADD CONSTRAINT "jurimetria_documentos_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "jurimetria_fontes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_exigencias" ADD CONSTRAINT "jurimetria_exigencias_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "jurimetria_documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_exigencias" ADD CONSTRAINT "jurimetria_exigencias_cartorioId_fkey" FOREIGN KEY ("cartorioId") REFERENCES "jurimetria_cartorios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_exigencias" ADD CONSTRAINT "jurimetria_exigencias_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "jurimetria_titulares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_exigencias" ADD CONSTRAINT "jurimetria_exigencias_temaId_fkey" FOREIGN KEY ("temaId") REFERENCES "jurimetria_temas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurimetria_revisoes" ADD CONSTRAINT "jurimetria_revisoes_exigenciaId_fkey" FOREIGN KEY ("exigenciaId") REFERENCES "jurimetria_exigencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Extensão pg_trgm: dedupe por similaridade de texto (sem embeddings na
-- Fase 1 — decisão do escritório; pgvector fica como evolução).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- SEMENTES ------------------------------------------------------------

-- Taxonomia inicial de temas registrais (calibrável pela fila de revisão).
INSERT INTO "jurimetria_temas" ("id", "rotulo") VALUES
  ('itcmd-recolhimento', 'Recolhimento/quitação do ITCMD'),
  ('certidoes-fiscais', 'Certidões fiscais (CNDs federal/estadual/municipal)'),
  ('iptu-debitos', 'Débitos de IPTU / certidão municipal do imóvel'),
  ('qualificacao-partes', 'Qualificação das partes (dados, estado civil)'),
  ('especialidade-subjetiva', 'Especialidade subjetiva — titularidade divergente (LRP, art. 246)'),
  ('especialidade-objetiva', 'Especialidade objetiva — descrição do imóvel divergente'),
  ('continuidade-registral', 'Continuidade registral / averbação prévia na cadeia'),
  ('retificacao-nome-grafia', 'Grafia e retificação de nome (LRP, art. 213)'),
  ('certidao-casamento-regime', 'Certidão de casamento / regime de bens / pacto'),
  ('certidao-obito', 'Certidão de óbito'),
  ('testamento-cnb', 'Certidão de testamento (CNB/Registro Central)'),
  ('inventariante-nomeacao', 'Nomeação e poderes do(a) inventariante'),
  ('representacao-procuracao', 'Representação e procurações'),
  ('menor-incapaz-mp', 'Menor/incapaz e atuação do Ministério Público'),
  ('valor-venal-avaliacao', 'Valor venal, avaliação e base de cálculo'),
  ('fracao-ideal-partilha', 'Frações ideais e proporções da partilha'),
  ('meacao-conjuge', 'Meação do cônjuge/companheiro(a)'),
  ('renuncia-cessao', 'Renúncia e cessão de direitos hereditários'),
  ('usufruto-instituicao', 'Instituição/reserva de usufruto'),
  ('doacao-colacao', 'Doação em vida e colação'),
  ('imovel-rural', 'Imóvel rural (CCIR, ITR, georreferenciamento)'),
  ('onus-gravames', 'Ônus, gravames e indisponibilidade de bens'),
  ('formalidades-titulo', 'Formalidades do traslado/formal de partilha'),
  ('outros', 'Outros temas registrais');

-- Cartórios de RI: 18 da Capital + 1º/2º de Guarulhos + Itaquaquecetuba
-- (as notas reais que calibraram o resolvedor vieram destes três últimos).
INSERT INTO "jurimetria_cartorios" ("id", "nome", "cidade", "uf", "aliases") VALUES
  ('ri-sp-01', '1º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['1º RI de São Paulo','1º ORI de São Paulo','Primeiro Oficial de Registro de Imóveis de São Paulo','1º Oficial de Registro de Imóveis de São Paulo','1º Registro de Imóveis de São Paulo','1º RI da Capital','1º ORI-SP','1º Registro de Imóveis da Capital','Primeiro Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-02', '2º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['2º RI de São Paulo','2º ORI de São Paulo','Segundo Oficial de Registro de Imóveis de São Paulo','2º Oficial de Registro de Imóveis de São Paulo','2º Registro de Imóveis de São Paulo','2º RI da Capital','2º ORI-SP','2º Registro de Imóveis da Capital','Segundo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-03', '3º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['3º RI de São Paulo','3º ORI de São Paulo','Terceiro Oficial de Registro de Imóveis de São Paulo','3º Oficial de Registro de Imóveis de São Paulo','3º Registro de Imóveis de São Paulo','3º RI da Capital','3º ORI-SP','3º Registro de Imóveis da Capital','Terceiro Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-04', '4º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['4º RI de São Paulo','4º ORI de São Paulo','Quarto Oficial de Registro de Imóveis de São Paulo','4º Oficial de Registro de Imóveis de São Paulo','4º Registro de Imóveis de São Paulo','4º RI da Capital','4º ORI-SP','4º Registro de Imóveis da Capital','Quarto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-05', '5º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['5º RI de São Paulo','5º ORI de São Paulo','Quinto Oficial de Registro de Imóveis de São Paulo','5º Oficial de Registro de Imóveis de São Paulo','5º Registro de Imóveis de São Paulo','5º RI da Capital','5º ORI-SP','5º Registro de Imóveis da Capital','Quinto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-06', '6º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['6º RI de São Paulo','6º ORI de São Paulo','Sexto Oficial de Registro de Imóveis de São Paulo','6º Oficial de Registro de Imóveis de São Paulo','6º Registro de Imóveis de São Paulo','6º RI da Capital','6º ORI-SP','6º Registro de Imóveis da Capital','Sexto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-07', '7º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['7º RI de São Paulo','7º ORI de São Paulo','Sétimo Oficial de Registro de Imóveis de São Paulo','7º Oficial de Registro de Imóveis de São Paulo','7º Registro de Imóveis de São Paulo','7º RI da Capital','7º ORI-SP','7º Registro de Imóveis da Capital','Sétimo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-08', '8º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['8º RI de São Paulo','8º ORI de São Paulo','Oitavo Oficial de Registro de Imóveis de São Paulo','8º Oficial de Registro de Imóveis de São Paulo','8º Registro de Imóveis de São Paulo','8º RI da Capital','8º ORI-SP','8º Registro de Imóveis da Capital','Oitavo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-09', '9º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['9º RI de São Paulo','9º ORI de São Paulo','Nono Oficial de Registro de Imóveis de São Paulo','9º Oficial de Registro de Imóveis de São Paulo','9º Registro de Imóveis de São Paulo','9º RI da Capital','9º ORI-SP','9º Registro de Imóveis da Capital','Nono Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-10', '10º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['10º RI de São Paulo','10º ORI de São Paulo','Décimo Oficial de Registro de Imóveis de São Paulo','10º Oficial de Registro de Imóveis de São Paulo','10º Registro de Imóveis de São Paulo','10º RI da Capital','10º ORI-SP','10º Registro de Imóveis da Capital','Décimo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-11', '11º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['11º RI de São Paulo','11º ORI de São Paulo','Décimo Primeiro Oficial de Registro de Imóveis de São Paulo','11º Oficial de Registro de Imóveis de São Paulo','11º Registro de Imóveis de São Paulo','11º RI da Capital','11º ORI-SP','11º Registro de Imóveis da Capital','Décimo Primeiro Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-12', '12º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['12º RI de São Paulo','12º ORI de São Paulo','Décimo Segundo Oficial de Registro de Imóveis de São Paulo','12º Oficial de Registro de Imóveis de São Paulo','12º Registro de Imóveis de São Paulo','12º RI da Capital','12º ORI-SP','12º Registro de Imóveis da Capital','Décimo Segundo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-13', '13º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['13º RI de São Paulo','13º ORI de São Paulo','Décimo Terceiro Oficial de Registro de Imóveis de São Paulo','13º Oficial de Registro de Imóveis de São Paulo','13º Registro de Imóveis de São Paulo','13º RI da Capital','13º ORI-SP','13º Registro de Imóveis da Capital','Décimo Terceiro Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-14', '14º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['14º RI de São Paulo','14º ORI de São Paulo','Décimo Quarto Oficial de Registro de Imóveis de São Paulo','14º Oficial de Registro de Imóveis de São Paulo','14º Registro de Imóveis de São Paulo','14º RI da Capital','14º ORI-SP','14º Registro de Imóveis da Capital','Décimo Quarto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-15', '15º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['15º RI de São Paulo','15º ORI de São Paulo','Décimo Quinto Oficial de Registro de Imóveis de São Paulo','15º Oficial de Registro de Imóveis de São Paulo','15º Registro de Imóveis de São Paulo','15º RI da Capital','15º ORI-SP','15º Registro de Imóveis da Capital','Décimo Quinto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-16', '16º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['16º RI de São Paulo','16º ORI de São Paulo','Décimo Sexto Oficial de Registro de Imóveis de São Paulo','16º Oficial de Registro de Imóveis de São Paulo','16º Registro de Imóveis de São Paulo','16º RI da Capital','16º ORI-SP','16º Registro de Imóveis da Capital','Décimo Sexto Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-17', '17º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['17º RI de São Paulo','17º ORI de São Paulo','Décimo Sétimo Oficial de Registro de Imóveis de São Paulo','17º Oficial de Registro de Imóveis de São Paulo','17º Registro de Imóveis de São Paulo','17º RI da Capital','17º ORI-SP','17º Registro de Imóveis da Capital','Décimo Sétimo Oficial de Registro de Imóveis da Capital']),
  ('ri-sp-18', '18º Oficial de Registro de Imóveis de São Paulo/SP', 'São Paulo', 'SP', ARRAY['18º RI de São Paulo','18º ORI de São Paulo','Décimo Oitavo Oficial de Registro de Imóveis de São Paulo','18º Oficial de Registro de Imóveis de São Paulo','18º Registro de Imóveis de São Paulo','18º RI da Capital','18º ORI-SP','18º Registro de Imóveis da Capital','Décimo Oitavo Oficial de Registro de Imóveis da Capital']),
  ('ri-guarulhos-01', '1º Oficial de Registro de Imóveis de Guarulhos/SP', 'Guarulhos', 'SP', ARRAY['1º RI de Guarulhos','1º ORI de Guarulhos','Primeiro Oficial de Registro de Imóveis de Guarulhos','1º Oficial de Registro de Imóveis de Guarulhos','1º Registro de Imóveis de Guarulhos']),
  ('ri-guarulhos-02', '2º Oficial de Registro de Imóveis de Guarulhos/SP', 'Guarulhos', 'SP', ARRAY['2º RI de Guarulhos','2º ORI de Guarulhos','Segundo Oficial de Registro de Imóveis de Guarulhos','2º Oficial de Registro de Imóveis de Guarulhos','2º Registro de Imóveis de Guarulhos']),
  ('ri-itaquaquecetuba', 'Oficial de Registro de Imóveis de Itaquaquecetuba/SP', 'Itaquaquecetuba', 'SP', ARRAY['RI de Itaquaquecetuba','ORI de Itaquaquecetuba','Registro de Imóveis de Itaquaquecetuba']);

-- Fontes da Camada A. As de site de cartório nascem INATIVAS até o
-- admin cadastrar a URL da página de orientações (TODO_VALIDACAO).
INSERT INTO "jurimetria_fontes" ("id", "tipo", "nome", "urlBase", "ativa", "config") VALUES
  ('fonte-datajud-vrp', 'DUVIDA_1VRP', 'Datajud (CNJ) — Dúvidas nas VRPs da Capital', 'https://api-publica.datajud.cnj.br', true, '{"endpoint":"/api_publicas_tjsp/_search","classes":["Dúvida","Dúvida Inversa"],"orgaos":["Vara de Registros Públicos"],"intervaloDias":1,"tamanhoPagina":100}'),
  ('fonte-cgj-sp', 'DUVIDA_CGJ', 'CGJ-SP — decisões e pareceres (extrajudicial)', NULL, false, '{"intervaloDias":7,"listaUrl":null,"padraoLinks":null}'),
  ('fonte-irib', 'IRIB_PUBLICACAO', 'IRIB — Boletim Eletrônico / Kollemata', 'https://www.irib.org.br', true, '{"publico":false,"intervaloDias":7}'),
  ('fonte-site-ri-sp-01', 'CARTORIO_SITE', 'Site — 1º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-01","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-02', 'CARTORIO_SITE', 'Site — 2º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-02","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-03', 'CARTORIO_SITE', 'Site — 3º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-03","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-04', 'CARTORIO_SITE', 'Site — 4º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-04","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-05', 'CARTORIO_SITE', 'Site — 5º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-05","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-06', 'CARTORIO_SITE', 'Site — 6º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-06","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-07', 'CARTORIO_SITE', 'Site — 7º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-07","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-08', 'CARTORIO_SITE', 'Site — 8º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-08","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-09', 'CARTORIO_SITE', 'Site — 9º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-09","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-10', 'CARTORIO_SITE', 'Site — 10º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-10","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-11', 'CARTORIO_SITE', 'Site — 11º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-11","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-12', 'CARTORIO_SITE', 'Site — 12º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-12","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-13', 'CARTORIO_SITE', 'Site — 13º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-13","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-14', 'CARTORIO_SITE', 'Site — 14º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-14","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-15', 'CARTORIO_SITE', 'Site — 15º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-15","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-16', 'CARTORIO_SITE', 'Site — 16º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-16","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-17', 'CARTORIO_SITE', 'Site — 17º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-17","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-sp-18', 'CARTORIO_SITE', 'Site — 18º Oficial de Registro de Imóveis de São Paulo/SP', NULL, false, '{"cartorioId":"ri-sp-18","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-guarulhos-01', 'CARTORIO_SITE', 'Site — 1º Oficial de Registro de Imóveis de Guarulhos/SP', NULL, false, '{"cartorioId":"ri-guarulhos-01","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-guarulhos-02', 'CARTORIO_SITE', 'Site — 2º Oficial de Registro de Imóveis de Guarulhos/SP', NULL, false, '{"cartorioId":"ri-guarulhos-02","intervaloDias":30,"paginaOrientacoes":null}'),
  ('fonte-site-ri-itaquaquecetuba', 'CARTORIO_SITE', 'Site — Oficial de Registro de Imóveis de Itaquaquecetuba/SP', NULL, false, '{"cartorioId":"ri-itaquaquecetuba","intervaloDias":30,"paginaOrientacoes":null}');

