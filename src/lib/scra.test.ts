import { describe, expect, it } from "vitest";
import { calculateAnnualSavings, evaluateRateCap } from "./scra";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const base = {
  activeDuty: true,
  activeDutyStartDate: d("2024-06-01"),
  originationDate: d("2023-01-15"),
  currentInterestRate: "8.50",
  currentBalance: "20000.00",
};

describe("evaluateRateCap", () => {
  it("is eligible when all three conditions hold, with savings", () => {
    const r = evaluateRateCap(base);
    expect(r.eligible).toBe(true);
    expect(r.cappedRate?.toString()).toBe("6");
    expect(r.annualSavings?.toFixed(2)).toBe("500.00"); // 20000 × 2.5%
    expect(r.monthlySavings?.toFixed(2)).toBe("41.67");
  });

  it("requires active duty", () => {
    expect(evaluateRateCap({ ...base, activeDuty: false }).reason).toBe("NOT_ACTIVE_DUTY");
  });

  it("requires a start date", () => {
    expect(evaluateRateCap({ ...base, activeDutyStartDate: null }).reason).toBe("NO_START_DATE");
  });

  it("requires service to start strictly after origination", () => {
    expect(evaluateRateCap({ ...base, activeDutyStartDate: d("2023-01-15") }).reason).toBe("SERVICE_BEFORE_LOAN");
    expect(evaluateRateCap({ ...base, activeDutyStartDate: d("2022-12-31") }).reason).toBe("SERVICE_BEFORE_LOAN");
    expect(evaluateRateCap({ ...base, activeDutyStartDate: d("2023-01-16") }).eligible).toBe(true);
  });

  it("compares by calendar day, ignoring time of day", () => {
    const r = evaluateRateCap({
      ...base,
      originationDate: new Date("2023-01-15T23:59:00Z"),
      activeDutyStartDate: new Date("2023-01-15T00:01:00Z"),
    });
    expect(r.reason).toBe("SERVICE_BEFORE_LOAN");
  });

  it("requires rate strictly above 6.00%", () => {
    expect(evaluateRateCap({ ...base, currentInterestRate: "6.00" }).reason).toBe("RATE_AT_OR_BELOW_CAP");
    expect(evaluateRateCap({ ...base, currentInterestRate: 5.5 }).reason).toBe("RATE_AT_OR_BELOW_CAP");
    const r = evaluateRateCap({ ...base, currentInterestRate: "6.001" });
    expect(r.eligible).toBe(true);
    expect(r.annualSavings?.toFixed(2)).toBe("0.20");
  });
});

describe("calculateAnnualSavings", () => {
  it("avoids floating point error", () => {
    expect(calculateAnnualSavings("12345.67", "7.1").toFixed(2)).toBe("135.80");
  });
  it("is zero at or below the cap", () => {
    expect(calculateAnnualSavings("1000", "6").toNumber()).toBe(0);
  });
});
