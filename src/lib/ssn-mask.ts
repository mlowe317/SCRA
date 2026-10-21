/** Masks for display. Accepts a full SSN or just the last four digits. Safe to use anywhere. */
export function maskSsn(ssnOrLastFour: string): string {
  const digits = ssnOrLastFour.replace(/\D/g, "");
  const lastFour = digits.slice(-4).padStart(4, "*");
  return `***-**-${lastFour}`;
}
