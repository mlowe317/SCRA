/*
  Warnings:

  - You are about to drop the `ScraAudit` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "ScraAudit_rateCapEligible_idx";

-- DropIndex
DROP INDEX "ScraAudit_borrowerId_queryDate_idx";

-- DropIndex
DROP INDEX "ScraAudit_loanId_queryDate_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ScraAudit";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ScraCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryDate" DATETIME NOT NULL,
    "activeDuty" BOOLEAN NOT NULL,
    "activeDutyStartDate" DATETIME,
    "activeDutyEndDate" DATETIME,
    "dmdcCertificateNumber" TEXT,
    "rateAtAudit" DECIMAL NOT NULL,
    "balanceAtAudit" DECIMAL NOT NULL,
    "rateCapEligible" BOOLEAN NOT NULL,
    "estimatedAnnualSavings" DECIMAL,
    "source" TEXT NOT NULL DEFAULT 'DMDC_IMPORT',
    "borrowerId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScraCheck_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScraCheck_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScraCheck_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountNumber" TEXT NOT NULL,
    "originationDate" DATETIME NOT NULL,
    "currentInterestRate" DECIMAL NOT NULL,
    "originalBalance" DECIMAL NOT NULL,
    "currentBalance" DECIMAL NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "rateCapEligible" BOOLEAN NOT NULL DEFAULT false,
    "estimatedAnnualSavings" DECIMAL,
    "lastScraCheckAt" DATETIME,
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Loan" ("accountNumber", "borrowerId", "createdAt", "currentBalance", "currentInterestRate", "id", "importBatchId", "originalBalance", "originationDate", "updatedAt") SELECT "accountNumber", "borrowerId", "createdAt", "currentBalance", "currentInterestRate", "id", "importBatchId", "originalBalance", "originationDate", "updatedAt" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
CREATE UNIQUE INDEX "Loan_accountNumber_key" ON "Loan"("accountNumber");
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");
CREATE INDEX "Loan_lastScraCheckAt_idx" ON "Loan"("lastScraCheckAt");
CREATE INDEX "Loan_rateCapEligible_idx" ON "Loan"("rateCapEligible");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScraCheck_loanId_queryDate_idx" ON "ScraCheck"("loanId", "queryDate");

-- CreateIndex
CREATE INDEX "ScraCheck_borrowerId_queryDate_idx" ON "ScraCheck"("borrowerId", "queryDate");

-- CreateIndex
CREATE INDEX "ScraCheck_rateCapEligible_idx" ON "ScraCheck"("rateCapEligible");
