import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { importLoanCsv } from "./loan-import";
import { countLoansDueForVerification, exportDmdcBatch } from "@/lib/dmdc-batch";
import { applyDmdcResults, previewDmdcResults } from "@/lib/dmdc-parser";

// Fake SSNs only.
const LOANS = `account_number,origination_date,current_interest_rate,original_balance,current_balance,first_name,middle_name,last_name,ssn,date_of_birth
L-1,2023-01-15,8.50,25000,20000,Jane,,Doe,123-45-6789,1990-05-04
L-2,2025-01-15,9.00,10000,10000,Jane,,Doe,123-45-6789,1990-05-04
L-3,2022-03-01,5.25,15000,12000,John,,Roe,234-56-7890,1985-02-02
L-4,2022-03-01,7.00,15000,12000,Ann,,Poe,345-67-8901,1980-03-03
L-5,2019-01-01,7.00,5000,0,Paid,,Off,456-78-9012,1970-01-01
`;

const HEADER =
  "SSN,Customer Record ID,Active Duty Status Date,Active Duty Status,Active Duty Begin Date,Active Duty End Date,Certificate ID";

beforeEach(async () => {
  await prisma.scraCheck.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.borrower.deleteMany();
  await prisma.importBatch.deleteMany();
});

async function borrowers() {
  const [jane, john, ann] = await Promise.all(
    ["Doe", "Roe", "Poe"].map((lastName) => prisma.borrower.findFirstOrThrow({ where: { lastName } }))
  );
  return { jane, john, ann };
}

describe("loan import", () => {
  it("creates borrowers and loans with encrypted SSNs, and updates on re-upload", async () => {
    const first = await importLoanCsv("loans.csv", LOANS);
    expect(first).toMatchObject({ rowCount: 5, created: 5, updated: 0, errors: [] });
    expect(await prisma.borrower.count()).toBe(4);

    const jane = await prisma.borrower.findFirstOrThrow({ where: { lastName: "Doe" } });
    expect(jane.ssnLastFour).toBe("6789");
    expect(JSON.stringify(jane)).not.toContain("123456789");

    const second = await importLoanCsv("loans.csv", LOANS.replace("L-1,2023-01-15,8.50", "L-1,2023-01-15,8.75"));
    expect(second).toMatchObject({ created: 0, updated: 5 });
    const l1 = await prisma.loan.findUniqueOrThrow({ where: { accountNumber: "L-1" } });
    expect(l1.currentInterestRate.toString()).toBe("8.75");
  });
});

describe("DMDC batch export", () => {
  it("exports borrowers with active loans not verified in 30 days", async () => {
    await importLoanCsv("loans.csv", LOANS);
    const now = new Date("2026-10-21T12:00:00Z");

    // Paid-off loan L-5 is never included.
    expect(await countLoansDueForVerification(now)).toBe(4);

    // John verified 10 days ago: skipped. Ann verified 31 days ago: included.
    await prisma.loan.update({ where: { accountNumber: "L-3" }, data: { lastScraCheckAt: new Date("2026-10-11") } });
    await prisma.loan.update({ where: { accountNumber: "L-4" }, data: { lastScraCheckAt: new Date("2026-09-20") } });
    // Jane: one loan fresh, one never checked, so she's still included.
    await prisma.loan.update({ where: { accountNumber: "L-1" }, data: { lastScraCheckAt: new Date("2026-10-20") } });

    const exp = await exportDmdcBatch(now);
    expect(exp).toMatchObject({ fileName: "dmdc-mrr-20261021.txt", borrowerCount: 2, loanCount: 2 });
    const records = exp.content.trimEnd().split("\r\n");
    expect(records.map((r) => r.slice(0, 9)).sort()).toEqual(["123456789", "345678901"]);
    expect(records.every((r) => r.slice(111, 119) === "20261021")).toBe(true);
  });
});

describe("DMDC results", () => {
  it("previews without writing, then applies checks and loan flags", async () => {
    await importLoanCsv("loans.csv", LOANS);
    const { jane, john, ann } = await borrowers();
    const file = [
      HEADER,
      `123456789,${jane.id},20261021,Yes,20240601,,CERT-JANE`, // after L-1, before L-2
      `234567890,${john.id},20261021,Yes,20240601,,CERT-JOHN`, // rate below cap
      `,${ann.id},20261021,No,,,CERT-ANN`,
      `999-99-9999,,20261021,Yes,20240601,,X`, // invalid SSN, no ID
      `345678901,${jane.id},20261021,Yes,20240601,,X`, // ID/SSN mismatch
      `123-45-6789,,20261021,Yes,20240601,,X`, // Jane again
    ].join("\n");

    const { preview } = await previewDmdcResults(file);
    expect(preview!.summary).toMatchObject({
      totalRows: 6,
      matched: 3,
      unmatched: 1,
      activeDuty: 2,
      loansEvaluated: 4,
      eligibleLoans: 1,
      newlyEligible: 1,
      totalAnnualSavings: "500.00",
    });
    expect(preview!.rows.map((r) => r.status)).toEqual(["matched", "matched", "matched", "conflict", "duplicate"]);
    expect(preview!.errors.map((e) => e.line)).toEqual([5]);
    expect(JSON.stringify(preview)).not.toMatch(/123456789|234567890/);
    expect(await prisma.scraCheck.count()).toBe(0);

    const { result } = await applyDmdcResults("results.csv", file);
    expect(result).toMatchObject({ checksCreated: 4, loansFlagUpdated: 4 });

    const l1 = await prisma.loan.findUniqueOrThrow({ where: { accountNumber: "L-1" } });
    expect(l1.rateCapEligible).toBe(true);
    expect(l1.estimatedAnnualSavings?.toString()).toBe("500");
    expect(l1.lastScraCheckAt?.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    const flagged = await prisma.loan.findMany({ where: { rateCapEligible: true } });
    expect(flagged.map((l) => l.accountNumber)).toEqual(["L-1"]);

    const check = await prisma.scraCheck.findFirstOrThrow({ where: { loanId: l1.id } });
    expect(check).toMatchObject({ rateCapEligible: true, dmdcCertificateNumber: "CERT-JANE" });

    const batch = await prisma.importBatch.findFirstOrThrow({ where: { kind: "DMDC_RESPONSE_IMPORT" } });
    expect(batch.errorCount).toBe(3);
    expect(batch.errors).not.toMatch(/\d{9}|\d{3}-\d{2}-\d{4}/);
  });

  it("keeps history but doesn't let an older file overwrite a newer flag", async () => {
    await importLoanCsv("loans.csv", LOANS);
    const { jane } = await borrowers();
    await applyDmdcResults("new.csv", `${HEADER}\n,${jane.id},20261021,Yes,20240601,,NEW`);
    const { result } = await applyDmdcResults("old.csv", `${HEADER}\n,${jane.id},20260101,No,,,OLD`);
    expect(result).toMatchObject({ checksCreated: 2, loansFlagUpdated: 0 });

    const l1 = await prisma.loan.findUniqueOrThrow({ where: { accountNumber: "L-1" } });
    expect(l1.rateCapEligible).toBe(true);
    expect(await prisma.scraCheck.count({ where: { loanId: l1.id } })).toBe(2);
  });

  it("clears the flag when a newer check is no longer eligible", async () => {
    await importLoanCsv("loans.csv", LOANS);
    const { jane } = await borrowers();
    await applyDmdcResults("a.csv", `${HEADER}\n,${jane.id},20261001,Yes,20240601,,A`);
    const { preview } = await previewDmdcResults(`${HEADER}\n,${jane.id},20261021,No,,,B`);
    expect(preview!.summary.noLongerEligible).toBe(1);
    await applyDmdcResults("b.csv", `${HEADER}\n,${jane.id},20261021,No,,,B`);
    const l1 = await prisma.loan.findUniqueOrThrow({ where: { accountNumber: "L-1" } });
    expect(l1.rateCapEligible).toBe(false);
    expect(l1.estimatedAnnualSavings).toBeNull();
  });
});
