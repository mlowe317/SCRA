// Parses DMDC SCRA result files into normalized rows. Pure: no database access.
//
// Supports:
//   - Delimited results (.csv, or .txt with comma, pipe or tab delimiters),
//     matched by header name, so column order does not matter.
//   - Fixed-width .txt results, read with MRR_RESPONSE_LAYOUT (see layout.ts).

import Papa from "papaparse";
import { parseDate } from "@/lib/dates";
import { isValidSsn, normalizeSsn } from "@/lib/encryption";
import { buildAliasMap, normalizeHeader } from "@/lib/imports/headers";
import { MRR_REQUEST_RECORD_LENGTH, MRR_RESPONSE_LAYOUT, readField } from "./layout";

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

export type DmdcParseResult = {
  format: "delimited" | "fixed-width";
  rows: DmdcResponseRow[];
  errors: { line: number; message: string }[];
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
  ssn: ["social security number", "ssn/tin"],
  customerRecordId: ["customer record id", "customer record identifier", "record id", "customer id"],
  activeDutyStatus: ["active duty status", "active duty", "active duty indicator", "active duty status code", "status"],
  activeDutyStartDate: ["active duty start date", "start date", "active duty begin date", "ad start date"],
  activeDutyEndDate: ["active duty end date", "end date", "ad end date"],
  statusDate: ["active duty status date", "status date", "as of date", "date of interest"],
  certificateNumber: ["certificate number", "certificate id", "certificate", "report id", "dmdc certificate number"],
};

/** Interprets DMDC-style yes/no indicators. Returns null if unrecognized. */
export function parseActiveDutyFlag(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["y", "yes", "true", "1", "x", "active", "active duty"].includes(v)) return true;
  if (["n", "no", "false", "0", "", "not active", "inactive"].includes(v)) return false;
  return null;
}

function buildRow(
  line: number,
  get: (f: Field) => string
): { row: DmdcResponseRow } | { error: string } {
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
  const errors: DmdcParseResult["errors"] = [];
  parsed.data.forEach((record, i) => {
    const result = buildRow(i + 2, (f) => record[f] ?? "");
    if ("row" in result) rows.push(result.row);
    else errors.push({ line: i + 2, message: result.error });
  });
  return { format: "delimited", rows, errors, fatal: null };
}

const FIXED_WIDTH_FIELDS: Record<Field, keyof typeof MRR_RESPONSE_LAYOUT> = {
  ssn: "ssn",
  customerRecordId: "customerRecordId",
  activeDutyStatus: "activeDutyStatus",
  activeDutyStartDate: "activeDutyStartDate",
  activeDutyEndDate: "activeDutyEndDate",
  statusDate: "activeDutyStatusDate",
  certificateNumber: "certificateNumber",
};

function parseFixedWidth(text: string): DmdcParseResult {
  const rows: DmdcResponseRow[] = [];
  const errors: DmdcParseResult["errors"] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
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
