// Cria (ou atualiza) um usuário da plataforma direto no banco.
//
//   yarn user:create <email> <senha> "<nome completo>" [--master] [--app=…]
//
// A conta é POR PLATAFORMA (o mesmo e-mail tem contas independentes no
// Renomeador e no Sucessorista). Sem --app o usuário é criado nos DOIS sites,
// que é o caso comum de quem administra a plataforma.
//
// Exemplos:
//   yarn user:create admin@escritorio.com.br senha123 "João Ferraz" --master
//   yarn user:create maria@escritorio.com.br outrasenha "Maria Souza" --app=sucessorista

import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import type { Plataforma } from "../lib/generated/prisma/enums";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [email, password, name] = args.filter((a) => !a.startsWith("--"));

const USO =
  'Uso: yarn user:create <email> <senha> "<nome completo>" [--master] [--app=renomeador|sucessorista]';

if (!email || !password || !name) {
  console.log(USO);
  process.exit(1);
}
if (password.length < 8) {
  console.error("A senha precisa ter ao menos 8 caracteres.");
  process.exit(1);
}

const PLATAFORMAS: Record<string, Plataforma> = {
  renomeador: "RENOMEADOR",
  sucessorista: "SUCESSORISTA",
};

const flagApp = flags.find((f) => f.startsWith("--app="))?.slice("--app=".length);
let alvos: Plataforma[];
if (flagApp === undefined) {
  alvos = ["RENOMEADOR", "SUCESSORISTA"];
} else if (PLATAFORMAS[flagApp.toLowerCase()]) {
  alvos = [PLATAFORMAS[flagApp.toLowerCase()]];
} else {
  console.error(`Plataforma inválida: ${flagApp}\n${USO}`);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const role = flags.includes("--master") ? "MASTER" : "USER";
const passwordHash = await hash(password, 12);
const normalizedEmail = email.trim().toLowerCase();

for (const app of alvos) {
  const user = await prisma.user.upsert({
    where: { email_app: { email: normalizedEmail, app } },
    update: { name, passwordHash, role },
    create: { email: normalizedEmail, app, name, passwordHash, role },
  });
  console.log(`OK: ${user.email} — ${user.name} (${user.role}) em ${user.app}`);
}

await prisma.$disconnect();
