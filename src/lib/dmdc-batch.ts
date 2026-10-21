// DMDC SCRA Multiple Record Request (MRR) generation.
//
// Each record carries SSN, DOB (YYYYMMDD), Active Duty Status Date (YYYYMMDD),
// Last Name and First Name, plus the optional Middle Name and Customer Record
// ID fields. We put the Borrower id in Customer Record ID so DMDC echoes it
// back and results can be matched without relying on SSN alone.
//
// Server-only: exporting decrypts SSNs. The file content must go straight to
// the download response, never to logs.

import { prisma } from "@/lib/prisma";
import { decryptSsn, normalizeSsn } from "@/lib/encryption";
import { formatYmdCompact, toUtcDay } from "@/lib/dates";
import { MRR_REQUEST_LAYOUT, MRR_REQUEST_RECORD_LENGTH, type FixedField } from "@/lib/dmdc-layout";
import { reverifyCutoff } from "@/lib/reverify";
import { finishBatch, startBatch } from "@/lib/services/batches";

export { REVERIFY_AFTER_DAYS, reverifyCutoff } from "@/lib/reverify";

export type MrrRequestPerson = {
  ssn: string;
  dateOfBirth: Date | null;
  lastName: string;
  firstName: string;
  middleName: string | null;
  customerRecordId: string;
};

// ---------------------------------------------------------------------------
// File format (pure)
// ---------------------------------------------------------------------------

/** DMDC fields are plain uppercase ASCII; strip accents and anything else. */
export function sanitizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z '\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function place(buffer: string[], field: FixedField, value: string) {
  const v = value.slice(0, field.length).padEnd(field.length, " ");
  for (let i = 0; i < field.length; i++) buffer[field.start - 1 + i] = v[i];
}

export function buildMrrRecord(person: MrrRequestPerson, statusDate: Date): string {
  if (person.customerRecordId.length > MRR_REQUEST_LAYOUT.customerRecordId.length) {
    throw new Error("Customer record ID is longer than the DMDC field allows.");
  }
  const buffer = Array<string>(MRR_REQUEST_RECORD_LENGTH).fill(" ");
  const L = MRR_REQUEST_LAYOUT;
  place(buffer, L.ssn, normalizeSsn(person.ssn));
  place(buffer, L.dateOfBirth, person.dateOfBirth ? formatYmdCompact(person.dateOfBirth) : "");
  place(buffer, L.lastName, sanitizeName(person.lastName));
  place(buffer, L.firstName, sanitizeName(person.firstName));
  place(buffer, L.customerRecordId, person.customerRecordId);
  place(buffer, L.middleName, sanitizeName(person.middleName));
  place(buffer, L.activeDutyStatusDate, formatYmdCompact(statusDate));
  return buffer.join("");
}

/** One record per line, CRLF line endings, trailing newline. */
export function buildMrrFile(people: MrrRequestPerson[], statusDate: Date): string {
  return people.map((p) => buildMrrRecord(p, statusDate)).join("\r\n") + (people.length ? "\r\n" : "");
}

// ---------------------------------------------------------------------------
// Selection and export (database)
// ---------------------------------------------------------------------------

/**
 * Active loans (current balance above zero) that have never had a DMDC check
 * or were last checked more than REVERIFY_AFTER_DAYS ago.
 */
export function loansDueForVerificationWhere(now: Date = new Date()) {
  return {
    currentBalance: { gt: 0 },
    OR: [{ lastScraCheckAt: null }, { lastScraCheckAt: { lt: reverifyCutoff(now) } }],
  };
}

export async function countLoansDueForVerification(now: Date = new Date()) {
  return prisma.loan.count({ where: loansDueForVerificationWhere(now) });
}

/**
 * Builds the request file for every borrower with at least one loan due for
 * verification. DMDC checks people, not loans, so each borrower appears once.
 */
export async function exportDmdcBatch(now: Date = new Date()) {
  const borrowers = await prisma.borrower.findMany({
    where: { loans: { some: loansDueForVerificationWhere(now) } },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      dateOfBirth: true,
      ssnEncrypted: true,
      _count: { select: { loans: { where: loansDueForVerificationWhere(now) } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const people: MrrRequestPerson[] = borrowers.map((b) => ({
    ssn: decryptSsn(b.ssnEncrypted),
    dateOfBirth: b.dateOfBirth,
    firstName: b.firstName,
    middleName: b.middleName,
    lastName: b.lastName,
    customerRecordId: b.id,
  }));

  const statusDate = toUtcDay(now);
  const fileName = `dmdc-mrr-${formatYmdCompact(statusDate)}.txt`;
  const content = buildMrrFile(people, statusDate);
  const loanCount = borrowers.reduce((n, b) => n + b._count.loans, 0);

  const batch = await startBatch("DMDC_REQUEST_EXPORT", fileName);
  await finishBatch(batch.id, { rowCount: people.length, successCount: people.length, errors: [] });

  return { fileName, content, borrowerCount: people.length, loanCount };
}
