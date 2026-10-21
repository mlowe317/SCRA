// Parses the loan bulk-upload CSV into validated rows. Pure: no database access.
//
// Expected columns (header names are matched loosely, see LOAN_CSV_ALIASES):
//   account_number, origination_date, current_interest_rate, original_balance,
//   current_balance, first_name, middle_name (optional), last_name, ssn,
//   date_of_birth
//
// Interest rates are percentages ("7.25" or "7.25%"). Money may include "$"
// and thousands separators. Dates accept YYYY-MM-DD, MM/DD/YYYY or YYYYMMDD.
//
// Error messages never include the SSN value.

import Papa from "papaparse";
import { isValidSsn, normalizeSsn } from "@/lib/encryption";
import { parseDate } from "@/lib/dates";
import { buildAliasMap, normalizeHeader } from "./headers";

export type LoanCsvField =
  | "accountNumber"
  | "originationDate"
  | "currentInterestRate"
  | "originalBalance"
  | "currentBalance"
  | "firstName"
  | "middleName"
  | "lastName"
  | "ssn"
  | "dateOfBirth";

const LOAN_CSV_ALIASES: Record<LoanCsvField, string[]> = {
  accountNumber: ["account_number", "account", "account no", "acct", "acct number", "loan number"],
  originationDate: ["origination_date", "orig date", "origination", "open date", "note date"],
  currentInterestRate: ["current_interest_rate", "interest rate", "rate", "current rate", "apr"],
  originalBalance: ["original_balance", "orig balance", "original amount", "loan amount"],
  currentBalance: ["current_balance", "balance", "principal balance", "unpaid principal balance", "upb"],
  firstName: ["first_name", "first", "borrower first name"],
  middleName: ["middle_name", "middle", "middle initial", "mi"],
  lastName: ["last_name", "last", "surname", "borrower last name"],
  ssn: ["social security number", "ssn/tin", "tin"],
  dateOfBirth: ["date_of_birth", "dob", "birth date", "birthdate"],
};

const REQUIRED: LoanCsvField[] = [
  "accountNumber",
  "originationDate",
  "currentInterestRate",
  "originalBalance",
  "currentBalance",
  "firstName",
  "lastName",
  "ssn",
  "dateOfBirth",
];

export type LoanCsvRow = {
  /** 1-based line number in the file, counting the header as line 1. */
  line: number;
  accountNumber: string;
  originationDate: Date;
  currentInterestRate: string;
  originalBalance: string;
  currentBalance: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  ssn: string;
  dateOfBirth: Date;
};

export type RowError = { line: number; message: string };

export type LoanCsvParseResult = {
  rows: LoanCsvRow[];
  errors: RowError[];
  /** Header problems that stop the whole file (e.g. missing required columns). */
  fatal: string | null;
};

function parseNumber(raw: string): string | null {
  const cleaned = raw.replace(/[$,%\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

export function parseLoanCsv(text: string): LoanCsvParseResult {
  const aliasMap = buildAliasMap(LOAN_CSV_ALIASES);
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => aliasMap.get(normalizeHeader(h)) ?? `__unknown:${h}`,
    transform: (v) => v.trim(),
  });

  const fields = new Set(parsed.meta.fields ?? []);
  const missing = REQUIRED.filter((f) => !fields.has(f));
  if (missing.length) {
    return { rows: [], errors: [], fatal: `Missing required column(s): ${missing.join(", ")}` };
  }

  const rows: LoanCsvRow[] = [];
  const errors: RowError[] = [];
  const seenAccounts = new Set<string>();

  parsed.data.forEach((record, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const get = (f: LoanCsvField) => (record[f] ?? "").trim();

    const accountNumber = get("accountNumber");
    if (!accountNumber) problems.push("account number is required");
    else if (seenAccounts.has(accountNumber)) problems.push(`duplicate account number ${accountNumber} in file`);

    const originationDate = parseDate(get("originationDate"));
    if (!originationDate) problems.push("origination date is missing or invalid");

    const dateOfBirth = parseDate(get("dateOfBirth"));
    if (!dateOfBirth) problems.push("date of birth is missing or invalid");

    const currentInterestRate = parseNumber(get("currentInterestRate"));
    if (currentInterestRate === null || Number(currentInterestRate) < 0 || Number(currentInterestRate) > 100) {
      problems.push("interest rate must be a percentage between 0 and 100");
    }
    const originalBalance = parseNumber(get("originalBalance"));
    if (originalBalance === null || Number(originalBalance) < 0) problems.push("original balance is invalid");
    const currentBalance = parseNumber(get("currentBalance"));
    if (currentBalance === null || Number(currentBalance) < 0) problems.push("current balance is invalid");

    const firstName = get("firstName");
    const lastName = get("lastName");
    if (!firstName) problems.push("first name is required");
    if (!lastName) problems.push("last name is required");

    const rawSsn = get("ssn");
    if (!isValidSsn(rawSsn)) problems.push("SSN is missing or invalid");

    if (problems.length) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }

    seenAccounts.add(accountNumber);
    rows.push({
      line,
      accountNumber,
      originationDate: originationDate!,
      currentInterestRate: currentInterestRate!,
      originalBalance: originalBalance!,
      currentBalance: currentBalance!,
      firstName,
      middleName: get("middleName") || null,
      lastName,
      ssn: normalizeSsn(rawSsn),
      dateOfBirth: dateOfBirth!,
    });
  });

  for (const e of parsed.errors) {
    if (e.row !== undefined) errors.push({ line: e.row + 2, message: `CSV format error: ${e.message}` });
  }

  return { rows, errors, fatal: null };
}
