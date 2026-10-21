import { prisma } from "@/lib/prisma";
import { decryptSsn } from "@/lib/encryption";
import { formatYmdCompact, toUtcDay } from "@/lib/dates";
import { buildMrrFile, type MrrRequestPerson } from "@/lib/dmdc/request";
import { finishBatch, startBatch } from "./batches";

/**
 * Builds a DMDC Multiple Record Request for every borrower with at least one
 * loan. This is the one place SSNs are decrypted in bulk; the returned content
 * must go straight to the download response and never to logs.
 */
export async function exportDmdcRequest(statusDate: Date = new Date()) {
  const borrowers = await prisma.borrower.findMany({
    where: { loans: { some: {} } },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      dateOfBirth: true,
      ssnEncrypted: true,
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

  const day = toUtcDay(statusDate);
  const fileName = `dmdc-mrr-${formatYmdCompact(day)}.txt`;
  const content = buildMrrFile(people, day);

  const batch = await startBatch("DMDC_REQUEST_EXPORT", fileName);
  await finishBatch(batch.id, { rowCount: people.length, successCount: people.length, errors: [] });

  return { fileName, content, count: people.length };
}
