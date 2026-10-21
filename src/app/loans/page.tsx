import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoanTable } from "@/components/loan-table";
import { listLoans } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const loans = await listLoans(q);

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
        <CardContent>
          <LoanTable loans={loans} showSavings />
        </CardContent>
      </Card>
    </div>
  );
}
