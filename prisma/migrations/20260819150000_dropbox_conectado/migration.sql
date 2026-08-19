-- Modo Dropbox do Sucessorista: o usuário conecta o Dropbox UMA vez (app com
-- acesso "App folder" — a aplicação só enxerga a pasta "Apps/O Sucessorista")
-- e os casos passam a viver na conta Dropbox dele, de qualquer dispositivo.
ALTER TABLE "users" ADD COLUMN "dropboxRefreshToken" TEXT;
ALTER TABLE "users" ADD COLUMN "dropboxEmail" TEXT;
ALTER TABLE "users" ADD COLUMN "dropboxConectadoEm" TIMESTAMP(3);
