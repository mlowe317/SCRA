import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashSsn } from "@/lib/encryption";
import { parseDmdcResponse } from "@/lib/dmdc/response";
import type { RowError } from "@/lib/imports/loan-csv";
import { evaluateRateCap } from "@/lib/scra";
import { finishBatch, startBatch } from "./batches";

export type DmdcImportSummary = {
  batchId: string | null;
  format: string | null;
  rowCount: number;
  borrowersMatched: number;
  auditsCreated: number;
  activeDutyCount: number;
  eligibleLoans: number;
  totalAnnualSavings: string;
  errors: RowError[];
  fatal: string | null;
};

/**
 * Imports a DMDC result file. Each row is matched to a borrower by customer
 * record ID (our Borrower id, which the export puts in that field) and/or SSN
 * blind index. If both are present they must agree. A ScraAudit is written for
 * each of the borrower's loans with the 6% cap evaluation.
 */
export async function importDmdcResponse(fileName: string, text: string, now = new Date()): Promise<DmdcImportSummary> {
  const parsed = parseDmdcResponse(text);
  const empty = {
    batchId: null,
    format: parsed.format,
    rowCount: 0,
    borrowersMatched: 0,
    auditsCreated: 0,
    activeDutyCount: 0,
    eligibleLoans: 0,
    totalAnnualSavings: "0.00",
    errors: [],
  };
  if (parsed.fatal) return { ...empty, fatal: parsed.fatal };

  const batch = await startBatch("DMDC_RESPONSE_IMPORT", fileName);
  const errors: RowError[] = [...parsed.errors];
  let borrowersMatched = 0;
  let auditsCreated = 0;
  let activeDutyCount = 0;
  let eligibleLoans = 0;
  let totalSavings = new Prisma.Decimal(0);

  for (const row of parsed.rows) {
    try {
      const byId = row.customerRecordId
        ? await prisma.borrower.findUnique({ where: { id: row.customerRecordId }, include: { loans: true } })
        : null;
      const bySsn = row.ssn
        ? await prisma.borrower.findUnique({ where: { ssnHash: hashSsn(row.ssn) }, include: { loans: true } })
        : null;

      if (byId && bySsn && byId.id !== bySsn.id) {
        errors.push({ line: row.line, message: "customer record ID and SSN point to different borrowers" });
        continue;
      }
      const borrower = byId ?? bySsn;
      if (!borrower) {
        errors.push({ line: row.line, message: "no matching borrower" });
        continue;
      }

      borrowersMatched++;
      if (row.activeDuty) activeDutyCount++;
      const queryDate = row.statusDate ?? now;

      const audits = borrower.loans.map((loan) => {
        const result = evaluateRateCap({
          activeDuty: row.activeDuty,
          activeDutyStartDate: row.activeDutyStartDate,
          originationDate: loan.originationDate,
          currentInterestRate: loan.currentInterestRate,
          currentBalance: loan.currentBalance,
        });
        if (result.eligible) {
          eligibleLoans++;
          totalSavings = totalSavings.plus(result.annualSavings!);
        }
        return {
          queryDate,
          activeDuty: row.activeDuty,
          activeDutyStartDate: row.activeDutyStartDate,
          activeDutyEndDate: row.activeDutyEndDate,
          dmdcCertificateNumber: row.certificateNumber,
          rateAtAudit: loan.currentInterestRate,
          balanceAtAudit: loan.currentBalance,
          rateCapEligible: result.eligible,
          estimatedAnnualSavings: result.annualSavings,
          source: "DMDC_IMPORT",
          borrowerId: borrower.id,
          loanId: loan.id,
          importBatchId: batch.id,
        };
      });

      if (audits.length) {
        await prisma.scraAudit.createMany({ data: audits });
        auditsCreated += audits.length;
      }
    } catch (err) {
      console.error(`DMDC import row ${row.line} failed:`, err instanceof Error ? err.name : "unknown");
      errors.push({ line: row.line, message: "could not save row" });
    }
  }

  errors.sort((a, b) => a.line - b.line);
  const rowCount = parsed.rows.length + parsed.errors.length;
  await finishBatch(batch.id, { rowCount, successCount: borrowersMatched, errors });

  return {
    batchId: batch.id,
    format: parsed.format,
    rowCount,
    borrowersMatched,
    auditsCreated,
    activeDutyCount,
    eligibleLoans,
    totalAnnualSavings: totalSavings.toFixed(2),
    errors,
    fatal: null,
  };
}
