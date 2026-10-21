// DMDC SCRA fixed-width file layouts.
//
// VERIFY BEFORE PRODUCTION USE: these positions follow the DMDC SCRA website's
// Multiple Record Request (MRR) layout as we understand it, but DMDC revises
// the spec. Check them against the current "SCRA Multiple Record Request" file
// format guide at https://scra.dmdc.osd.mil before submitting real files.
// Every position lives here so a spec change is a one-file edit.

export type FixedField = {
  /** 1-based start column, as DMDC documents it. */
  start: number;
  length: number;
};

/** Request record (one line per person). Dates are YYYYMMDD. */
export const MRR_REQUEST_LAYOUT = {
  ssn: { start: 1, length: 9 },
  dateOfBirth: { start: 10, length: 8 },
  lastName: { start: 18, length: 26 },
  firstName: { start: 44, length: 20 },
  customerRecordId: { start: 64, length: 28 },
  middleName: { start: 92, length: 20 },
  activeDutyStatusDate: { start: 112, length: 8 },
} satisfies Record<string, FixedField>;

export const MRR_REQUEST_RECORD_LENGTH = 119;

/**
 * Response record for fixed-width result files. The first 119 columns echo the
 * request record. The status columns after that are the part most likely to
 * differ from DMDC's current spec; the CSV result file is matched by header
 * name instead and does not depend on these positions.
 */
export const MRR_RESPONSE_LAYOUT = {
  ...MRR_REQUEST_LAYOUT,
  activeDutyStartDate: { start: 120, length: 8 },
  activeDutyEndDate: { start: 128, length: 8 },
  activeDutyStatus: { start: 136, length: 1 },
  certificateNumber: { start: 137, length: 20 },
} satisfies Record<string, FixedField>;

export function readField(line: string, field: FixedField): string {
  return line.slice(field.start - 1, field.start - 1 + field.length).trim();
}
