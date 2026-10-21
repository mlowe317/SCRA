import { prisma } from "@/lib/prisma";
import type { RowError } from "@/lib/imports/loan-csv";

export type BatchKind = "LOAN_CSV" | "DMDC_REQUEST_EXPORT" | "DMDC_RESPONSE_IMPORT";

export function startBatch(kind: BatchKind, fileName: string) {
  return prisma.importBatch.create({ data: { kind, fileName } });
}

/** Records final counts. `errors` must never contain SSNs. */
export function finishBatch(id: string, counts: { rowCount: number; successCount: number; errors: RowError[] }) {
  return prisma.importBatch.update({
    where: { id },
    data: {
      rowCount: counts.rowCount,
      successCount: counts.successCount,
      errorCount: counts.errors.length,
      errors: counts.errors.length ? JSON.stringify(counts.errors.slice(0, 500)) : null,
    },
  });
}
