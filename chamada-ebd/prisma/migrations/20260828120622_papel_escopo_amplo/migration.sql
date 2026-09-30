-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Papel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chave" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "escopoAmplo" BOOLEAN NOT NULL DEFAULT true,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Papel" ("chave", "createdAt", "id", "nivel", "nome", "ordem", "sistema", "status") SELECT "chave", "createdAt", "id", "nivel", "nome", "ordem", "sistema", "status" FROM "Papel";
DROP TABLE "Papel";
ALTER TABLE "new_Papel" RENAME TO "Papel";
CREATE UNIQUE INDEX "Papel_chave_key" ON "Papel"("chave");
CREATE INDEX "Papel_nivel_idx" ON "Papel"("nivel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
