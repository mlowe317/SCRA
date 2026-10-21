// Header normalization shared by the CSV parsers: "Account Number",
// "account_number" and "ACCOUNT-NUMBER" all become "accountnumber".
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Builds a lookup from normalized header aliases to canonical field names. */
export function buildAliasMap<F extends string>(aliases: Record<F, string[]>): Map<string, F> {
  const map = new Map<string, F>();
  for (const [field, names] of Object.entries(aliases) as [F, string[]][]) {
    for (const name of [field, ...names]) map.set(normalizeHeader(name), field);
  }
  return map;
}
