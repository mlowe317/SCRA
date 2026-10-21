import Link from "next/link";
import { BadgeCheck, Banknote, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoanTable } from "@/components/loan-table";
import { formatMoney } from "@/lib/format";
import { getDashboardStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { loanCount, borrowerCount, eligible, totalAnnualSavings } = await getDashboardStats();

  const stats = [
    { label: "Loans", value: loanCount.toLocaleString(), icon: FileText },
    { label: "Borrowers", value: borrowerCount.toLocaleString(), icon: Users },
    { label: "Eligible for 6% Rate Cap", value: eligible.length.toLocaleString(), icon: BadgeCheck },
    { label: "Est. annual interest savings", value: formatMoney(totalAnnualSavings), icon: Banknote },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">SCRA compliance status across the loan portfolio.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-2">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <s.icon className="size-4" />
                {s.label}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{s.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accounts needing a rate reduction</CardTitle>
          <CardDescription>
            Latest DMDC check shows active duty that began after origination, on a rate above 6.00%. Savings are
            estimated as current balance × (rate − 6%) per year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligible.length ? (
            <LoanTable loans={eligible} showSavings />
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-sm">
              No accounts are currently flagged.
              <Button asChild variant="outline" size="sm">
                <Link href="/imports">Import DMDC results</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
