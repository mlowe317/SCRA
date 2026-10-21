import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Read models for the UI. Only ssnLastFour is ever selected; the encrypted
// SSN and its hash never leave the server layer.

const borrowerPublic = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  ssnLastFour: true,
} satisfies Prisma.BorrowerSelect;

const loanWithLatestAudit = {
  borrower: { select: borrowerPublic },
  audits: { orderBy: [{ queryDate: "desc" }, { createdAt: "desc" }], take: 1 },
} satisfies Prisma.LoanInclude;

export type LoanRow = Prisma.LoanGetPayload<{ include: typeof loanWithLatestAudit }>;

export async function listLoans(search?: string): Promise<LoanRow[]> {
  const q = search?.trim();
  const where: Prisma.LoanWhereInput | undefined = q
    ? {
        OR: [
          { accountNumber: { contains: q } },
          { borrower: { lastName: { contains: q } } },
          { borrower: { firstName: { contains: q } } },
          ...(/^\d{4}$/.test(q) ? [{ borrower: { ssnLastFour: q } }] : []),
        ],
      }
    : undefined;
  return prisma.loan.findMany({ where, include: loanWithLatestAudit, orderBy: { accountNumber: "asc" } });
}

/** Loans whose most recent SCRA audit flagged them for the 6% cap. */
export async function listEligibleLoans(): Promise<LoanRow[]> {
  const candidates = await prisma.loan.findMany({
    where: { audits: { some: { rateCapEligible: true } } },
    include: loanWithLatestAudit,
    orderBy: { accountNumber: "asc" },
  });
  return candidates.filter((l) => l.audits[0]?.rateCapEligible);
}

export async function getDashboardStats() {
  const [loanCount, borrowerCount, eligible] = await Promise.all([
    prisma.loan.count(),
    prisma.borrower.count(),
    listEligibleLoans(),
  ]);
  const totalAnnualSavings = eligible.reduce(
    (sum, l) => sum.plus(l.audits[0]?.estimatedAnnualSavings ?? 0),
    new Prisma.Decimal(0)
  );
  return { loanCount, borrowerCount, eligible, totalAnnualSavings };
}

export function listRecentBatches(take = 20) {
  return prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take });
}
