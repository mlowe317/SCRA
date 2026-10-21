// DMDC SCRA results processing: parse the response file, match each row to a
// borrower, evaluate the 6% cap for each of their loans, and (after the user
// confirms) persist ScraCheck rows and update each loan's flags.
//
// Two steps so the UI can show what will change before anything is written:
//   previewDmdcResults(text)          read-only
//   applyDmdcResults(fileName, text)  re-parses and re-matches server-side,
//                                     then writes; never trusts client data
//
// Supported files:
//   - Delimited (.csv, or .txt with comma, pipe or tab), matched by header
//     name so column order doesn't matter.
//   - Fixed-width .txt, read with MRR_RESPONSE_LAYOUT (see dmdc-layout.ts).

import Papa from "papaparse";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, parseDate } from "@/lib/dates";
import { hashSsn, isValidSsn, normalizeSsn } from "@/lib/encryption";
import { buildAliasMap, normalizeHeader } from "@/lib/imports/headers";
import { MRR_REQUEST_RECORD_LENGTH, MRR_RESPONSE_LAYOUT, readField } from "@/lib/dmdc-layout";
import { ELIGIBILITY_REASON_LABELS, evaluateRateCap } from "@/lib/scra";
import { finishBatch, startBatch } from "@/lib/services/batches";

// ---------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------

export type DmdcResponseRow = {
  line: number;
  ssn: string | null;
  customerRecordId: string | null;
  activeDuty: boolean;
  activeDutyStartDate: Date | null;
  activeDutyEndDate: Date | null;
  /** The "as of" date DMDC checked status for; falls back to the import date. */
  statusDate: Date | null;
  certificateNumber: string | null;
};

export type RowError = { line: number; message: string };

export type DmdcParseResult = {
  format: "delimited" | "fixed-width";
  rows: DmdcResponseRow[];
  errors: RowError[];
  fatal: string | null;
};

type Field =
  | "ssn"
  | "customerRecordId"
  | "activeDutyStatus"
  | "activeDutyStartDate"
  | "activeDutyEndDate"
  | "statusDate"
  | "certificateNumber";

const ALIASES: Record<Field, string[]> = {
  ssn: ["social security number", "ssn/tin", "id", "ssn/id"],
  customerRecordId: ["customer record id", "customer record identifier", "record id", "customer id"],
  activeDutyStatus: [
    "active duty status",
    "active duty",
    "active duty indicator",
    "active duty status code",
    "status",
  ],
  activeDutyStartDate: [
    "active duty start date",
    "active duty begin date",
    "begin date",
    "start date",
    "ad start date",
    "ad begin date",
  ],
  activeDutyEndDate: ["active duty end date", "end date", "ad end date"],
  statusDate: ["active duty status date", "status date", "as of date", "date of interest"],
  certificateNumber: ["certificate number", "certificate id", "certificate", "report id", "dmdc certificate number"],
};

const FIXED_WIDTH_FIELDS: Record<Field, keyof typeof MRR_RESPONSE_LAYOUT> = {
  ssn: "ssn",
  customerRecordId: "customerRecordId",
  activeDutyStatus: "activeDutyStatus",
  activeDutyStartDate: "activeDutyStartDate",
  activeDutyEndDate: "activeDutyEndDate",
  statusDate: "activeDutyStatusDate",
  certificateNumber: "certificateNumber",
};

/** Interprets DMDC-style yes/no indicators. Returns null if unrecognized. */
export function parseActiveDutyFlag(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["y", "yes", "true", "1", "x", "active", "active duty"].includes(v)) return true;
  if (["n", "no", "false", "0", "", "not active", "inactive"].includes(v)) return false;
  return null;
}

function buildRow(line: number, get: (f: Field) => string): { row: DmdcResponseRow } | { error: string } {
  const rawSsn = get("ssn");
  const ssn = rawSsn && isValidSsn(rawSsn) ? normalizeSsn(rawSsn) : null;
  const customerRecordId = get("customerRecordId") || null;
  if (!ssn && !customerRecordId) return { error: "row has no valid SSN or customer record ID to match on" };

  const activeDuty = parseActiveDutyFlag(get("activeDutyStatus"));
  if (activeDuty === null) return { error: "active duty status is not a recognized Yes/No value" };

  return {
    row: {
      line,
      ssn,
      customerRecordId,
      activeDuty,
      activeDutyStartDate: parseDate(get("activeDutyStartDate")),
      activeDutyEndDate: parseDate(get("activeDutyEndDate")),
      statusDate: parseDate(get("statusDate")),
      certificateNumber: get("certificateNumber") || null,
    },
  };
}

function looksDelimited(firstLine: string): boolean {
  const n = normalizeHeader(firstLine);
  return /[,|\t]/.test(firstLine) && (n.includes("ssn") || n.includes("activeduty") || n.includes("customerrecord"));
}

export function parseDmdcResponse(text: string): DmdcParseResult {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  return looksDelimited(firstLine) ? parseDelimited(clean) : parseFixedWidth(clean);
}

function parseDelimited(text: string): DmdcParseResult {
  const aliasMap = buildAliasMap(ALIASES);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => aliasMap.get(normalizeHeader(h)) ?? `__unknown:${h}`,
    transform: (v) => v.trim(),
  });
  const fields = new Set(parsed.meta.fields ?? []);
  if (!fields.has("activeDutyStatus")) {
    return { format: "delimited", rows: [], errors: [], fatal: "No active duty status column found." };
  }
  if (!fields.has("ssn") && !fields.has("customerRecordId")) {
    return { format: "delimited", rows: [], errors: [], fatal: "No SSN or customer record ID column found." };
  }

  const rows: DmdcResponseRow[] = [];
  const errors: RowError[] = [];
  parsed.data.forEach((record, i) => {
    const result = buildRow(i + 2, (f) => record[f] ?? "");
    if ("row" in result) rows.push(result.row);
    else errors.push({ line: i + 2, message: result.error });
  });
  return { format: "delimited", rows, errors, fatal: null };
}

function parseFixedWidth(text: string): DmdcParseResult {
  const rows: DmdcResponseRow[] = [];
  const errors: RowError[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    if (line.length <= MRR_REQUEST_RECORD_LENGTH) {
      errors.push({ line: i + 1, message: "line is too short to be a DMDC result record" });
      return;
    }
    const result = buildRow(i + 1, (f) => readField(line, MRR_RESPONSE_LAYOUT[FIXED_WIDTH_FIELDS[f]]));
    if ("row" in result) rows.push(result.row);
    else errors.push({ line: i + 1, message: result.error });
  });
  if (!rows.length && !errors.length) {
    return { format: "fixed-width", rows, errors, fatal: "File is empty." };
  }
  return { format: "fixed-width", rows, errors, fatal: null };
}

// ---------------------------------------------------------------------------
// Matching and evaluation (database reads only)
// ---------------------------------------------------------------------------

// Preview types are plain strings/numbers so they can cross the server action
// boundary. They never include a full SSN.

export type PreviewLoan = {
  loanId: string;
  accountNumber: string;
  originationDate: string;
  currentInterestRate: string;
  currentBalance: string;
  eligible: boolean;
  reason: string;
  annualSavings: string | null;
  /** True when the loan's flag changes from what is stored now. */
  flagChanges: boolean;
};

export type PreviewRow = {
  line: number;
  status: "matched" | "unmatched" | "conflict" | "duplicate";
  borrowerId: string | null;
  borrowerName: string | null;
  ssnLastFour: string | null;
  activeDuty: boolean;
  activeDutyStartDate: string | null;
  activeDutyEndDate: string | null;
  statusDate: string | null;
  certificateNumber: string | null;
  loans: PreviewLoan[];
};

export type DmdcPreview = {
  format: DmdcParseResult["format"];
  rows: PreviewRow[];
  errors: RowError[];
  summary: {
    totalRows: number;
    matched: number;
    unmatched: number;
    activeDuty: number;
    loansEvaluated: number;
    eligibleLoans: number;
    newlyEligible: number;
    noLongerEligible: number;
    totalAnnualSavings: string;
  };
};

type MatchedLoan = {
  id: string;
  accountNumber: string;
  originationDate: Date;
  currentInterestRate: Prisma.Decimal;
  currentBalance: Prisma.Decimal;
  rateCapEligible: boolean;
  lastScraCheckAt: Date | null;
};

type Evaluated = {
  preview: DmdcPreview;
  /** Internal: the parsed row and loans behind each matched preview row. */
  matches: { row: DmdcResponseRow; borrowerId: string; loans: MatchedLoan[] }[];
};

const loanSelect = {
  id: true,
  accountNumber: true,
  originationDate: true,
  currentInterestRate: true,
  currentBalance: true,
  rateCapEligible: true,
  lastScraCheckAt: true,
} satisfies Prisma.LoanSelect;

const borrowerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  ssnLastFour: true,
  loans: { select: loanSelect, orderBy: { accountNumber: "asc" } },
} satisfies Prisma.BorrowerSelect;

async function evaluate(parsed: DmdcParseResult): Promise<Evaluated> {
  const rows: PreviewRow[] = [];
  const matches: Evaluated["matches"] = [];
  const seen = new Set<string>();
  let totalSavings = new Prisma.Decimal(0);
  const s = {
    totalRows: parsed.rows.length + parsed.errors.length,
    matched: 0,
    unmatched: 0,
    activeDuty: 0,
    loansEvaluated: 0,
    eligibleLoans: 0,
    newlyEligible: 0,
    noLongerEligible: 0,
  };

  for (const row of parsed.rows) {
    const base: PreviewRow = {
      line: row.line,
      status: "unmatched",
      borrowerId: null,
      borrowerName: null,
      ssnLastFour: row.ssn ? row.ssn.slice(-4) : null,
      activeDuty: row.activeDuty,
      activeDutyStartDate: row.activeDutyStartDate ? formatDate(row.activeDutyStartDate) : null,
      activeDutyEndDate: row.activeDutyEndDate ? formatDate(row.activeDutyEndDate) : null,
      statusDate: row.statusDate ? formatDate(row.statusDate) : null,
      certificateNumber: row.certificateNumber,
      loans: [],
    };

    const byId = row.customerRecordId
      ? await prisma.borrower.findUnique({ where: { id: row.customerRecordId }, select: borrowerSelect })
      : null;
    const bySsn = row.ssn
      ? await prisma.borrower.findUnique({ where: { ssnHash: hashSsn(row.ssn) }, select: borrowerSelect })
      : null;

    if (byId && bySsn && byId.id !== bySsn.id) {
      rows.push({ ...base, status: "conflict" });
      s.unmatched++;
      continue;
    }
    const borrower = byId ?? bySsn;
    if (!borrower) {
      rows.push(base);
      s.unmatched++;
      continue;
    }
    const named = {
      ...base,
      borrowerId: borrower.id,
      borrowerName: `${borrower.firstName} ${borrower.lastName}`,
      ssnLastFour: borrower.ssnLastFour,
    };
    if (seen.has(borrower.id)) {
      rows.push({ ...named, status: "duplicate" });
      continue;
    }
    seen.add(borrower.id);
    s.matched++;
    if (row.activeDuty) s.activeDuty++;

    const loans: PreviewLoan[] = borrower.loans.map((loan) => {
      const result = evaluateRateCap({
        activeDuty: row.activeDuty,
        activeDutyStartDate: row.activeDutyStartDate,
        originationDate: loan.originationDate,
        currentInterestRate: loan.currentInterestRate,
        currentBalance: loan.currentBalance,
      });
      s.loansEvaluated++;
      if (result.eligible) {
        s.eligibleLoans++;
        totalSavings = totalSavings.plus(result.annualSavings!);
        if (!loan.rateCapEligible) s.newlyEligible++;
      } else if (loan.rateCapEligible) {
        s.noLongerEligible++;
      }
      return {
        loanId: loan.id,
        accountNumber: loan.accountNumber,
        originationDate: formatDate(loan.originationDate),
        currentInterestRate: loan.currentInterestRate.toString(),
        currentBalance: loan.currentBalance.toString(),
        eligible: result.eligible,
        reason: ELIGIBILITY_REASON_LABELS[result.reason],
        annualSavings: result.annualSavings?.toFixed(2) ?? null,
        flagChanges: result.eligible !== loan.rateCapEligible,
      };
    });

    rows.push({ ...named, status: "matched", loans });
    matches.push({ row, borrowerId: borrower.id, loans: borrower.loans });
  }

  rows.sort((a, b) => a.line - b.line);
  return {
    preview: {
      format: parsed.format,
      rows,
      errors: parsed.errors,
      summary: { ...s, totalAnnualSavings: totalSavings.toFixed(2) },
    },
    matches,
  };
}

/** Parses and matches a results file without writing anything. */
export async function previewDmdcResults(text: string): Promise<{ preview?: DmdcPreview; fatal?: string }> {
  const parsed = parseDmdcResponse(text);
  if (parsed.fatal) return { fatal: parsed.fatal };
  return { preview: (await evaluate(parsed)).preview };
}

// ---------------------------------------------------------------------------
// Apply (database writes)
// ---------------------------------------------------------------------------

export type DmdcApplyResult = {
  batchId: string;
  checksCreated: number;
  loansFlagUpdated: number;
  summary: DmdcPreview["summary"];
};

/**
 * Re-parses and re-matches the file (so the client can't alter what gets
 * written), then for each matched borrower writes one ScraCheck per loan and
 * updates each loan's eligibility flag, savings and last-checked date.
 *
 * A loan's flag is only updated when this result is at least as recent as its
 * current lastScraCheckAt, so importing an older file can't overwrite newer
 * results. The ScraCheck history row is written either way.
 */
export async function applyDmdcResults(
  fileName: string,
  text: string,
  now: Date = new Date()
): Promise<{ result?: DmdcApplyResult; fatal?: string }> {
  const parsed = parseDmdcResponse(text);
  if (parsed.fatal) return { fatal: parsed.fatal };
  const { preview, matches } = await evaluate(parsed);

  const batch = await startBatch("DMDC_RESPONSE_IMPORT", fileName);
  const errors: RowError[] = [
    ...preview.errors,
    ...preview.rows
      .filter((r) => r.status !== "matched")
      .map((r) => ({
        line: r.line,
        message:
          r.status === "conflict"
            ? "customer record ID and SSN point to different borrowers"
            : r.status === "duplicate"
              ? "borrower appears more than once in file; first row used"
              : "no matching borrower",
      })),
  ];
  let checksCreated = 0;
  let loansFlagUpdated = 0;

  for (const { row, borrowerId, loans } of matches) {
    const queryDate = row.statusDate ?? now;
    try {
      // Count inside, commit counts only if the transaction does.
      let created = 0;
      let flagged = 0;
      await prisma.$transaction(async (tx) => {
        for (const loan of loans) {
          const result = evaluateRateCap({
            activeDuty: row.activeDuty,
            activeDutyStartDate: row.activeDutyStartDate,
            originationDate: loan.originationDate,
            currentInterestRate: loan.currentInterestRate,
            currentBalance: loan.currentBalance,
          });
          await tx.scraCheck.create({
            data: {
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
              borrowerId,
              loanId: loan.id,
              importBatchId: batch.id,
            },
          });
          created++;

          if (!loan.lastScraCheckAt || queryDate.getTime() >= loan.lastScraCheckAt.getTime()) {
            await tx.loan.update({
              where: { id: loan.id },
              data: {
                rateCapEligible: result.eligible,
                estimatedAnnualSavings: result.annualSavings,
                lastScraCheckAt: queryDate,
              },
            });
            flagged++;
          }
        }
      });
      checksCreated += created;
      loansFlagUpdated += flagged;
    } catch (err) {
      console.error(`DMDC apply row ${row.line} failed:`, err instanceof Error ? err.name : "unknown");
      errors.push({ line: row.line, message: "could not save row" });
    }
  }

  errors.sort((a, b) => a.line - b.line);
  await finishBatch(batch.id, {
    rowCount: preview.summary.totalRows,
    successCount: matches.length,
    errors,
  });

  return { result: { batchId: batch.id, checksCreated, loansFlagUpdated, summary: preview.summary } };
}
