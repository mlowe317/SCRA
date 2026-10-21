import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoanTable } from "@/components/loan-table";
import { countLoansDueForVerification, REVERIFY_AFTER_DAYS } from "@/lib/dmdc-batch";
import { listLoans } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; export?: string }>;
}) {
  const { q, export: exportState } = await searchParams;
  const [loans, dueCount] = await Promise.all([listLoans(q), countLoansDueForVerification()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Loans</h1>
          <p className="text-muted-foreground text-sm">{loans.length.toLocaleString()} loan(s)</p>
        </div>
        <form className="flex gap-2" action="/loans">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Account, name, or SSN last 4"
            className="w-72"
            aria-label="Search loans"
          />
          <Button type="submit" variant="outline">
            <Search />
            Search
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DMDC verification</CardTitle>
          <CardDescription>
            {dueCount.toLocaleString()} active loan(s) haven&apos;t been verified in the last {REVERIFY_AFTER_DAYS}{" "}
            days. The export is a DMDC Multiple Record Request file with one record per borrower. It contains full
            SSNs, so delete it once it&apos;s submitted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <form action="/api/dmdc/request" method="post">
            <Button type="submit" disabled={dueCount === 0}>
              <Download />
              Export DMDC request file
            </Button>
          </form>
          {exportState === "none" && (
            <p className="text-muted-foreground text-sm">Nothing to export: every active loan is verified.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <LoanTable loans={loans} showSavings />
        </CardContent>
      </Card>
    </div>
  );
}
