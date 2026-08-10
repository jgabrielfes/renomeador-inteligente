-- CreateTable
CREATE TABLE "renamer_lessons" (
    "userId" TEXT NOT NULL,
    "regras" TEXT NOT NULL DEFAULT '',
    "correcoes" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renamer_lessons_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "renamer_lessons" ADD CONSTRAINT "renamer_lessons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
