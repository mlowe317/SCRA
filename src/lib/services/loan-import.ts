import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prepareSsnFields } from "@/lib/encryption";
import { parseLoanCsv, type RowError } from "@/lib/imports/loan-csv";
import { finishBatch, startBatch } from "./batches";

export type LoanImportSummary = {
  batchId: string | null;
  rowCount: number;
  created: number;
  updated: number;
  errors: RowError[];
  fatal: string | null;
};

/**
 * Imports a loan CSV. Borrowers are matched on SSN (via the blind index) and
 * loans on account number, so re-uploading a file updates rows in place.
 * Each row commits on its own: one bad row doesn't block the rest.
 */
export async function importLoanCsv(fileName: string, text: string): Promise<LoanImportSummary> {
  const parsed = parseLoanCsv(text);
  if (parsed.fatal) {
    return { batchId: null, rowCount: 0, created: 0, updated: 0, errors: [], fatal: parsed.fatal };
  }

  const batch = await startBatch("LOAN_CSV", fileName);
  const errors: RowError[] = [...parsed.errors];
  let created = 0;
  let updated = 0;

  for (const row of parsed.rows) {
    try {
      const ssnFields = prepareSsnFields(row.ssn);
      await prisma.$transaction(async (tx) => {
        const borrower = await tx.borrower.upsert({
          where: { ssnHash: ssnFields.ssnHash },
          create: {
            ...ssnFields,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            dateOfBirth: row.dateOfBirth,
          },
          update: {
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            dateOfBirth: row.dateOfBirth,
          },
        });

        const loanData = {
          originationDate: row.originationDate,
          currentInterestRate: new Prisma.Decimal(row.currentInterestRate),
          originalBalance: new Prisma.Decimal(row.originalBalance),
          currentBalance: new Prisma.Decimal(row.currentBalance),
          borrowerId: borrower.id,
          importBatchId: batch.id,
        };
        const existing = await tx.loan.findUnique({ where: { accountNumber: row.accountNumber }, select: { id: true } });
        if (existing) {
          await tx.loan.update({ where: { id: existing.id }, data: loanData });
          updated++;
        } else {
          await tx.loan.create({ data: { accountNumber: row.accountNumber, ...loanData } });
          created++;
        }
      });
    } catch (err) {
      // Prisma errors can echo input values, so log only the error class.
      console.error(`Loan import row ${row.line} failed:`, err instanceof Error ? err.name : "unknown");
      errors.push({ line: row.line, message: "could not save row" });
    }
  }

  errors.sort((a, b) => a.line - b.line);
  const rowCount = parsed.rows.length + parsed.errors.length;
  await finishBatch(batch.id, { rowCount, successCount: created + updated, errors });
  return { batchId: batch.id, rowCount, created, updated, errors, fatal: null };
}
