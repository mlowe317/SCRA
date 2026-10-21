import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScraStatusBadge } from "@/components/scra-status-badge";
import { maskSsn } from "@/lib/ssn-mask";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatRate } from "@/lib/format";
import type { LoanRow } from "@/lib/queries";
import { reverifyCutoff } from "@/lib/reverify";

export function LoanTable({ loans, showSavings = false }: { loans: LoanRow[]; showSavings?: boolean }) {
  const cutoff = reverifyCutoff();
  if (!loans.length) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No loans to show.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Borrower</TableHead>
          <TableHead>SSN</TableHead>
          <TableHead>Originated</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="text-right">Current balance</TableHead>
          <TableHead>SCRA status</TableHead>
          <TableHead>Last checked</TableHead>
          {showSavings && <TableHead className="text-right">Est. annual savings</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loans.map((loan) => {
          const check = loan.checks[0];
          const due = !loan.lastScraCheckAt || loan.lastScraCheckAt < cutoff;
          const b = loan.borrower;
          return (
            <TableRow key={loan.id}>
              <TableCell className="font-mono">{loan.accountNumber}</TableCell>
              <TableCell>{[b.firstName, b.middleName, b.lastName].filter(Boolean).join(" ")}</TableCell>
              <TableCell className="font-mono">{maskSsn(b.ssnLastFour)}</TableCell>
              <TableCell>{formatDate(loan.originationDate)}</TableCell>
              <TableCell className="text-right">{formatRate(loan.currentInterestRate)}</TableCell>
              <TableCell className="text-right">{formatMoney(loan.currentBalance)}</TableCell>
              <TableCell>
                <ScraStatusBadge
                  checked={!!loan.lastScraCheckAt}
                  eligible={loan.rateCapEligible}
                  activeDuty={check?.activeDuty}
                />
              </TableCell>
              <TableCell>
                {loan.lastScraCheckAt ? formatDate(loan.lastScraCheckAt) : ""}
                {due && Number(loan.currentBalance) > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2 text-xs">Due</span>
                )}
              </TableCell>
              {showSavings && (
                <TableCell className="text-right font-medium">
                  {loan.rateCapEligible ? formatMoney(loan.estimatedAnnualSavings) : ""}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
