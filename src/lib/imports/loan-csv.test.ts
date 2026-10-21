import { beforeAll, describe, expect, it } from "vitest";
import { parseLoanCsv } from "./loan-csv";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(63) + "1";
});

// Fake test SSNs only.
const HEADER = "Account Number,Origination Date,Current Interest Rate,Original Balance,Current Balance,First Name,Middle Name,Last Name,SSN,Date of Birth";

describe("parseLoanCsv", () => {
  it("parses valid rows with loose formats", () => {
    const csv = `${HEADER}\nA-1001,2023-01-15,7.25%,"$25,000.00","20,000.50",Jane,Q,Doe,123-45-6789,05/04/1990\n`;
    const { rows, errors, fatal } = parseLoanCsv(csv);
    expect(fatal).toBeNull();
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      line: 2,
      accountNumber: "A-1001",
      currentInterestRate: "7.25",
      originalBalance: "25000.00",
      currentBalance: "20000.50",
      middleName: "Q",
      ssn: "123456789",
    });
    expect(rows[0].dateOfBirth.toISOString()).toBe("1990-05-04T00:00:00.000Z");
  });

  it("accepts snake_case headers and a BOM", () => {
    const csv = "﻿account_number,origination_date,current_interest_rate,original_balance,current_balance,first_name,last_name,ssn,date_of_birth\nB1,20230115,6.5,100,90,A,B,123456789,1990-01-01";
    const r = parseLoanCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].middleName).toBeNull();
  });

  it("reports missing columns as fatal", () => {
    expect(parseLoanCsv("account_number,ssn\n1,123456789").fatal).toMatch(/Missing required column/);
  });

  it("reports row errors without echoing the SSN", () => {
    const csv = `${HEADER}\nA1,not-a-date,abc,1,1,J,,D,000-12-3456,1990-01-01\nA1,2023-01-01,7,1,1,J,,D,123-45-6789,1990-01-01\nA1,2023-01-01,7,1,1,J,,D,123-45-6789,1990-01-01`;
    const { rows, errors } = parseLoanCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 4]);
    expect(errors[0].message).toMatch(/origination date/);
    expect(errors[0].message).toMatch(/SSN is missing or invalid/);
    expect(errors[1].message).toMatch(/duplicate account/);
    expect(JSON.stringify(errors)).not.toMatch(/000-12-3456|123-45-6789/);
  });
});
