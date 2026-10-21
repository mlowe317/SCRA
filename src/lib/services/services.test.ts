import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { importLoanCsv } from "./loan-import";
import { exportDmdcRequest } from "./dmdc-export";
import { importDmdcResponse } from "./dmdc-import";

// Fake SSNs only.
const LOANS = `account_number,origination_date,current_interest_rate,original_balance,current_balance,first_name,middle_name,last_name,ssn,date_of_birth
L-1,2023-01-15,8.50,25000,20000,Jane,,Doe,123-45-6789,1990-05-04
L-2,2025-01-15,9.00,10000,10000,Jane,,Doe,123-45-6789,1990-05-04
L-3,2022-03-01,5.25,15000,12000,John,,Roe,234-56-7890,1985-02-02
L-4,2022-03-01,7.00,15000,12000,Ann,,Poe,345-67-8901,1980-03-03
`;

beforeEach(async () => {
  await prisma.scraAudit.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.borrower.deleteMany();
  await prisma.importBatch.deleteMany();
});

describe("loan import", () => {
  it("creates borrowers and loans with encrypted SSNs, and updates on re-upload", async () => {
    const first = await importLoanCsv("loans.csv", LOANS);
    expect(first).toMatchObject({ rowCount: 4, created: 4, updated: 0, errors: [] });
    expect(await prisma.borrower.count()).toBe(3);

    const jane = await prisma.borrower.findFirstOrThrow({ where: { lastName: "Doe" } });
    expect(jane.ssnLastFour).toBe("6789");
    expect(JSON.stringify(jane)).not.toContain("123456789");

    const second = await importLoanCsv("loans.csv", LOANS.replace("L-1,2023-01-15,8.50", "L-1,2023-01-15,8.75"));
    expect(second).toMatchObject({ created: 0, updated: 4 });
    const l1 = await prisma.loan.findUniqueOrThrow({ where: { accountNumber: "L-1" } });
    expect(l1.currentInterestRate.toString()).toBe("8.75");
  });
});

describe("DMDC round trip", () => {
  it("exports a request and imports results into per-loan audits", async () => {
    await importLoanCsv("loans.csv", LOANS);

    const exp = await exportDmdcRequest(new Date("2026-10-21T00:00:00Z"));
    expect(exp.count).toBe(3);
    expect(exp.fileName).toBe("dmdc-mrr-20261021.txt");
    expect(exp.content).toContain("123456789");

    const [jane, john, ann] = await Promise.all(
      ["Doe", "Roe", "Poe"].map((lastName) => prisma.borrower.findFirstOrThrow({ where: { lastName } }))
    );
    const response = [
      "SSN,Customer Record ID,Active Duty Status Date,Active Duty Status,Active Duty Start Date,Active Duty End Date,Certificate ID",
      `123456789,${jane.id},20261021,Yes,20240601,,CERT-JANE`, // after L-1, before L-2
      `234567890,${john.id},20261021,Yes,20240601,,CERT-JOHN`, // rate below cap
      `,${ann.id},20261021,No,,,CERT-ANN`,
      `999-99-9999,,20261021,Yes,20240601,,X`, // invalid SSN, no ID
      `345678901,${jane.id},20261021,Yes,20240601,,X`, // ID/SSN mismatch
    ].join("\n");

    const res = await importDmdcResponse("results.csv", response);
    expect(res).toMatchObject({
      format: "delimited",
      borrowersMatched: 3,
      auditsCreated: 4,
      activeDutyCount: 2,
      eligibleLoans: 1,
      totalAnnualSavings: "500.00",
    });
    expect(res.errors.map((e) => e.line)).toEqual([5, 6]);

    const eligible = await prisma.scraAudit.findMany({ where: { rateCapEligible: true }, include: { loan: true } });
    expect(eligible.map((a) => a.loan.accountNumber)).toEqual(["L-1"]);
    expect(eligible[0].estimatedAnnualSavings?.toString()).toBe("500");
    expect(eligible[0].dmdcCertificateNumber).toBe("CERT-JANE");

    const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: "asc" } });
    expect(batches.map((b) => b.kind)).toEqual(["LOAN_CSV", "DMDC_REQUEST_EXPORT", "DMDC_RESPONSE_IMPORT"]);
    expect(batches.map((b) => b.errors ?? "").join("")).not.toMatch(/\d{9}|\d{3}-\d{2}-\d{4}/);
  });
});
