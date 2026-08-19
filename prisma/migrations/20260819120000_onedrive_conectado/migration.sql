-- Modo OneDrive do Sucessorista: o usuário conecta o OneDrive UMA vez
-- (escopo Files.ReadWrite.AppFolder — a aplicação só enxerga a pasta de app
-- "Apps/O Sucessorista") e os casos passam a viver na conta Microsoft dele.
-- O refresh token da Microsoft ROTACIONA a cada renovação — a coluna é
-- regravada pelo servidor a cada access token novo.
ALTER TABLE "users" ADD COLUMN "oneDriveRefreshToken" TEXT;
ALTER TABLE "users" ADD COLUMN "oneDriveEmail" TEXT;
ALTER TABLE "users" ADD COLUMN "oneDriveConectadoEm" TIMESTAMP(3);
