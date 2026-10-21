// Calendar-date helpers. All dates are normalized to UTC midnight so that a
// date like 2024-03-01 compares the same regardless of server timezone.

/**
 * Parses YYYY-MM-DD, YYYYMMDD, MM/DD/YYYY, or M/D/YYYY. Returns null for blank
 * input, all-zero DMDC placeholders, or anything unparseable or out of range.
 */
export function parseDate(input: string | null | undefined): Date | null {
  const s = (input ?? "").trim();
  if (!s || /^0+$/.test(s)) return null;

  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // e.g. 2024-02-30
  }
  return date;
}

/** Truncates a Date to UTC midnight. */
export function toUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** YYYYMMDD, as DMDC files use. */
export function formatYmdCompact(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

/** YYYY-MM-DD for display. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}
