/** Loans checked more recently than this are skipped by the DMDC export. */
export const REVERIFY_AFTER_DAYS = 30;

export function reverifyCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REVERIFY_AFTER_DAYS * 24 * 60 * 60 * 1000);
}
