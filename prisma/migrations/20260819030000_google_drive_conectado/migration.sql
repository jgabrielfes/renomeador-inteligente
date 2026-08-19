-- Modo Google Drive do Sucessorista: o usuário conecta o Drive UMA vez
-- (escopo drive.file — a aplicação só enxerga a pasta que ela criou) e os
-- casos passam a viver na conta Google dele, de qualquer dispositivo.
ALTER TABLE "users" ADD COLUMN "driveRefreshToken" TEXT;
ALTER TABLE "users" ADD COLUMN "driveEmail" TEXT;
ALTER TABLE "users" ADD COLUMN "driveConectadoEm" TIMESTAMP(3);
