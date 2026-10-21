import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRecentBatches } from "@/lib/queries";
import { DmdcUploadForm, LoanUploadForm } from "./upload-forms";

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
          Upload loans, send borrowers to DMDC, then import the results to flag rate cap eligibility.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>1. Upload loans</CardTitle>
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
            <CardTitle>2. Export DMDC request</CardTitle>
            <CardDescription>
              Fixed-width Multiple Record Request file for every borrower with a loan, status date today. Upload it at
              the DMDC SCRA website. The file contains full SSNs, so delete it once submitted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/dmdc/request" method="post">
              <Button type="submit">
                <Download />
                Download request file
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Import DMDC results</CardTitle>
            <CardDescription>
              The .csv or .txt results file from DMDC. Each borrower&apos;s loans get a new SCRA audit with the 6% cap
              evaluation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DmdcUploadForm />
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
