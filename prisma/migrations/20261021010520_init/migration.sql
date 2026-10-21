-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "ssnEncrypted" TEXT NOT NULL,
    "ssnHash" TEXT NOT NULL,
    "ssnLastFour" TEXT NOT NULL,
    "dateOfBirth" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountNumber" TEXT NOT NULL,
    "originationDate" DATETIME NOT NULL,
    "currentInterestRate" DECIMAL NOT NULL,
    "originalBalance" DECIMAL NOT NULL,
    "currentBalance" DECIMAL NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScraAudit" (
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
    CONSTRAINT "ScraAudit_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScraAudit_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScraAudit_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Borrower_ssnHash_key" ON "Borrower"("ssnHash");

-- CreateIndex
CREATE INDEX "Borrower_ssnLastFour_idx" ON "Borrower"("ssnLastFour");

-- CreateIndex
CREATE INDEX "Borrower_lastName_firstName_idx" ON "Borrower"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_accountNumber_key" ON "Loan"("accountNumber");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE INDEX "ScraAudit_loanId_queryDate_idx" ON "ScraAudit"("loanId", "queryDate");

-- CreateIndex
CREATE INDEX "ScraAudit_borrowerId_queryDate_idx" ON "ScraAudit"("borrowerId", "queryDate");

-- CreateIndex
CREATE INDEX "ScraAudit_rateCapEligible_idx" ON "ScraAudit"("rateCapEligible");
