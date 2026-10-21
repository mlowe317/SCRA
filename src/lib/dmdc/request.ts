// Builds a DMDC SCRA Multiple Record Request (fixed-width .txt) file.
// Pure: callers supply already-decrypted SSNs and must not log the output.

import { formatYmdCompact } from "@/lib/dates";
import { normalizeSsn } from "@/lib/encryption";
import { MRR_REQUEST_LAYOUT, MRR_REQUEST_RECORD_LENGTH, type FixedField } from "./layout";

export type MrrRequestPerson = {
  ssn: string;
  dateOfBirth: Date | null;
  lastName: string;
  firstName: string;
  middleName: string | null;
  /** Echoed back by DMDC; we use the Borrower id to match responses. */
  customerRecordId: string;
};

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
