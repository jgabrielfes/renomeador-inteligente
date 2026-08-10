// Cria (ou atualiza) um usuário da plataforma direto no banco.
//
//   yarn user:create <email> <senha> "<nome completo>" [--master]
//
// Exemplos:
//   yarn user:create admin@escritorio.com.br senha123 "João Ferraz" --master
//   yarn user:create maria@escritorio.com.br outrasenha "Maria Souza"

import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

const [email, password, name, flag] = process.argv.slice(2);

if (!email || !password || !name) {
  console.log(
    'Uso: yarn user:create <email> <senha> "<nome completo>" [--master]'
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("A senha precisa ter ao menos 8 caracteres.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const role = flag === "--master" ? "MASTER" : "USER";
const passwordHash = await hash(password, 12);
const normalizedEmail = email.trim().toLowerCase();

const user = await prisma.user.upsert({
  where: { email: normalizedEmail },
  update: { name, passwordHash, role },
  create: { email: normalizedEmail, name, passwordHash, role },
});

console.log(`OK: ${user.email} — ${user.name} (${user.role})`);
await prisma.$disconnect();
