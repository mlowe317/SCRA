// SCRA 6% interest rate cap rule (50 U.S.C. § 3937), as specified for this app.
//
// A loan is eligible for reduction to 6% ONLY if all three hold:
//   a) the borrower's active duty status is true,
//   b) the active duty start date is AFTER the loan origination date
//      (same calendar day does not count), and
//   c) the current interest rate is strictly greater than 6.00%.

import { Prisma } from "@prisma/client";
import { toUtcDay } from "./dates";

export const SCRA_RATE_CAP = new Prisma.Decimal(6);

type DecimalInput = Prisma.Decimal | number | string;

export type EligibilityInput = {
  activeDuty: boolean;
  activeDutyStartDate: Date | null;
  originationDate: Date;
  /** Percent, e.g. 7.25 for 7.25%. */
  currentInterestRate: DecimalInput;
  currentBalance: DecimalInput;
};

export type EligibilityReason =
  | "ELIGIBLE"
  | "NOT_ACTIVE_DUTY"
  | "NO_START_DATE"
  | "SERVICE_BEFORE_LOAN"
  | "RATE_AT_OR_BELOW_CAP";

export type EligibilityResult = {
  eligible: boolean;
  reason: EligibilityReason;
  /** The rate the loan should be reduced to, or null when not eligible. */
  cappedRate: Prisma.Decimal | null;
  /** Estimated interest saved per year: currentBalance × (rate − 6%). */
  annualSavings: Prisma.Decimal | null;
  monthlySavings: Prisma.Decimal | null;
};

export function evaluateRateCap(input: EligibilityInput): EligibilityResult {
  const rate = new Prisma.Decimal(input.currentInterestRate);
  const notEligible = (reason: EligibilityReason): EligibilityResult => ({
    eligible: false,
    reason,
    cappedRate: null,
    annualSavings: null,
    monthlySavings: null,
  });

  if (!input.activeDuty) return notEligible("NOT_ACTIVE_DUTY");
  if (!input.activeDutyStartDate) return notEligible("NO_START_DATE");
  if (toUtcDay(input.activeDutyStartDate).getTime() <= toUtcDay(input.originationDate).getTime()) {
    return notEligible("SERVICE_BEFORE_LOAN");
  }
  if (!rate.greaterThan(SCRA_RATE_CAP)) return notEligible("RATE_AT_OR_BELOW_CAP");

  const annualSavings = calculateAnnualSavings(input.currentBalance, rate);
  return {
    eligible: true,
    reason: "ELIGIBLE",
    cappedRate: SCRA_RATE_CAP,
    annualSavings,
    monthlySavings: annualSavings.dividedBy(12).toDecimalPlaces(2),
  };
}

/** Simple-interest estimate on the current balance, rounded to cents. */
export function calculateAnnualSavings(currentBalance: DecimalInput, currentRate: DecimalInput): Prisma.Decimal {
  const rate = new Prisma.Decimal(currentRate);
  if (!rate.greaterThan(SCRA_RATE_CAP)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(currentBalance).times(rate.minus(SCRA_RATE_CAP)).dividedBy(100).toDecimalPlaces(2);
}

export const ELIGIBILITY_REASON_LABELS: Record<EligibilityReason, string> = {
  ELIGIBLE: "Eligible for 6% Rate Cap",
  NOT_ACTIVE_DUTY: "Not on active duty",
  NO_START_DATE: "No active duty start date",
  SERVICE_BEFORE_LOAN: "Service began on or before origination",
  RATE_AT_OR_BELOW_CAP: "Rate already at or below 6%",
};
