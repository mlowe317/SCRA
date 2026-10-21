import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRecentBatches } from "@/lib/queries";
import { LoanUploadForm } from "./upload-forms";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  LOAN_CSV: "Loan CSV upload",
  DMDC_REQUEST_EXPORT: "DMDC request export",
  DMDC_RESPONSE_IMPORT: "DMDC results import",
};

export default async function ImportsPage() {
  const batches = await listRecentBatches();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Import / Export</h1>
        <p className="text-muted-foreground text-sm">
          Bulk-load loans and see recent file activity.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload loans</CardTitle>
            <CardDescription>
              CSV with account_number, origination_date, current_interest_rate, original_balance, current_balance,
              first_name, middle_name, last_name, ssn, date_of_birth. Existing accounts are updated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoanUploadForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DMDC checks</CardTitle>
            <CardDescription>
              Export the request file from the Loans page, submit it to DMDC, then review and apply the results on
              Batch SCRA.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/loans">Loans</Link>
            </Button>
            <Button asChild>
              <Link href="/batch-scra">Batch SCRA</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Succeeded</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</TableCell>
                    <TableCell>{KIND_LABELS[b.kind] ?? b.kind}</TableCell>
                    <TableCell className="font-mono">{b.fileName}</TableCell>
                    <TableCell className="text-right">{b.rowCount}</TableCell>
                    <TableCell className="text-right">{b.successCount}</TableCell>
                    <TableCell className="text-right">{b.errorCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">No imports or exports yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
